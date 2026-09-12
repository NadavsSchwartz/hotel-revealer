#!/usr/bin/env python3
"""Summarize persistent browser usage and retained app logs without provider calls."""
import argparse
from collections import Counter
from datetime import date, datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading

UTC = timezone.utc
ROUTES = {"/api/v1/hoteldeals": "Search", "/api/v1/deal": "Details"}
REASONS = ("no_match", "ambiguous", "missing_facts", "incomplete_search")
DIAGNOSTICS = ("provider_paused", "provider_state_failed", "selection_recovery_failed",
               "provider_search_failed", "server_started", "server_start_failed")
MAX_LOG_BYTES = 64 * 1024 * 1024
MAX_LINE_BYTES = 32 * 1024
CAPTURE_SECONDS = 60
REPORT_DIRECTORY = Path("/var/lib/hotel-revealer/reports")
USAGE_DIRECTORY = Path("/var/lib/hotel-revealer/provider/usage")
MAX_USAGE_BYTES = 5 * 1024 * 1024
MAX_USAGE_LINE_BYTES = 2048
COLLECTOR_GAP_SECONDS = 150
USAGE_ACTIONS = ("page_view", "search_started", "search_succeeded", "search_failed",
                 "detail_started", "detail_succeeded", "detail_failed", "provider_handoff", "internal_marked")
USAGE_PAGES = ("home", "results", "detail", "privacy", "terms", "credits", "other")
USAGE_DEVICES = ("mobile", "tablet", "desktop")
USAGE_SOURCES = ("direct", "search", "social", "github", "external", "internal")
USAGE_TRAFFIC = ("browser", "automated", "internal")
USAGE_REQUIRED = {"version", "timestamp", "eventId", "browserId", "sessionId", "action", "page", "device", "source", "traffic"}
USAGE_OUTCOMES = {"coverage", "resultCount", "detailStatus", "quoteStatus"}
UUID_V4 = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", re.I)
USAGE_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z")


class ReportError(Exception):
    pass


def instant(value):
    if not isinstance(value, str) or len(value) > 64:
        raise ValueError("Invalid timestamp")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timestamp requires a timezone")
    return result.astimezone(UTC)


def stamp(value):
    return value.isoformat().replace("+00:00", "Z")


def day_window(value=None, now=None):
    today = (now or datetime.now(UTC)).astimezone(UTC).date()
    if value is not None and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ReportError("Use a report date in YYYY-MM-DD form.")
    try:
        day = date.fromisoformat(value) if value else today - timedelta(days=1)
    except ValueError:
        raise ReportError("The report date is invalid.") from None
    if day > today:
        raise ReportError("Choose today or an earlier UTC day.")
    start = datetime.combine(day, datetime.min.time(), UTC)
    return start, start + timedelta(days=1)


def docker_output(arguments):
    try:
        result = subprocess.run(["docker", *arguments], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.TimeoutExpired):
        raise ReportError("Docker metadata could not be read.") from None
    if result.returncode:
        raise ReportError("Docker metadata could not be read.")
    return result.stdout


def app_container():
    ids = docker_output(["ps", "--all", "--quiet", "--no-trunc", "--filter",
                         "label=com.docker.compose.project=hotel-revealer", "--filter",
                         "label=com.docker.compose.service=app"]).split()
    if len(ids) != 1 or not re.fullmatch(r"[a-f0-9]{64}", ids[0]):
        raise ReportError("Expected exactly one Hotel Revealer app container, including stopped containers.")
    # Inspect only identity, creation time and status; never environment or raw state.
    raw = docker_output(["inspect", "--format",
                         "[{{json .Id}},{{json .Created}},{{json .State.Status}}]", ids[0]])
    try:
        identity, created, status = json.loads(raw)
        if identity != ids[0] or status not in {"created", "running", "paused", "restarting", "removing", "exited", "dead"}:
            raise ValueError()
        return {"id": identity, "created": instant(created), "status": status}
    except (ValueError, TypeError):
        raise ReportError("Docker returned invalid container metadata.") from None


def retained_lines(container, start, end):
    """Stream both Docker output streams; a failed/partial capture never becomes a report."""
    try:
        process = subprocess.Popen(["docker", "logs", "--since", stamp(start), "--until", stamp(end),
                                    container["id"]], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    except OSError:
        raise ReportError("Docker log capture could not start.") from None
    expired = threading.Event()

    def timeout():
        expired.set()
        try:
            process.kill()
        except ProcessLookupError:
            pass

    timer = threading.Timer(CAPTURE_SECONDS, timeout)
    timer.daemon = True
    timer.start()
    try:
        size = 0
        while True:
            line = process.stdout.readline(MAX_LINE_BYTES + 1)
            if not line:
                break
            size += len(line)
            if size > MAX_LOG_BYTES or len(line) > MAX_LINE_BYTES:
                raise ReportError("Docker logs exceeded the bounded capture size.")
            yield line.decode("utf-8", errors="replace")
        result = process.wait()
        if expired.is_set() or result:
            raise ReportError("Docker log capture failed or timed out; the previous report was preserved.")
    finally:
        timer.cancel()
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdout.close()


def count(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def duration(value):
    try:
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0
    except OverflowError:
        return False


def summarize(lines, start, end):
    result = {"events": 0, "invalid": 0,
              "first": None, "last": None, "http": {route: Counter() for route in ROUTES},
              "durations": {route: [] for route in ROUTES}, "search": Counter(),
              "cache": {kind: Counter() for kind in ("search", "detail")},
              "fresh": Counter(), "diagnostics": Counter()}
    for line in lines:
        if not line.strip():
            continue
        try:
            event = json.loads(line)
            if not isinstance(event, dict) or not isinstance(event.get("event"), str):
                raise ValueError()
            timestamp = instant(event.get("timestamp"))
        except (ValueError, TypeError, RecursionError):
            result["invalid"] += 1
            continue
        if not start <= timestamp < end:
            continue
        result["events"] += 1
        result["first"] = min(timestamp, result["first"] or timestamp)
        result["last"] = max(timestamp, result["last"] or timestamp)
        name = event["event"]
        if name in {"request_completed", "request_aborted"}:
            if not isinstance(event.get("route"), str) or not isinstance(event.get("method"), str):
                result["invalid"] += 1
                continue
            route = event["route"]
            if route not in ROUTES or event["method"] != "POST":
                continue
            if not duration(event.get("durationMs")):
                result["invalid"] += 1
                continue
            status = event.get("status")
            if name == "request_completed" and (not count(status) or not 100 <= status <= 599):
                result["invalid"] += 1
                continue
            stats = result["http"][route]
            if name == "request_aborted":
                stats["aborted"] += 1
            else:
                stats["completed"] += 1
                stats[f"{status // 100}xx"] += 1
                result["durations"][route].append(event["durationMs"])
        elif name == "provider_request":
            kind = event.get("kind")
            if kind not in ("search", "detail") or not isinstance(event.get("shared"), bool):
                result["invalid"] += 1
                continue
            if kind == "search":
                outcome = event.get("outcome")
                if outcome in ("complete", "partial"):
                    result["search"][outcome] += 1
                elif isinstance(outcome, str) and re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", outcome):
                    result["search"]["errors"] += 1
                else:
                    result["invalid"] += 1
                    continue
            cache = result["cache"][kind]
            cache["callers"] += 1
            if event["shared"]:
                cache["shared"] += 1
            elif event.get(f"{kind}Cache") in ("hit", "miss"):
                cache[event[f"{kind}Cache"]] += 1
        elif name == "provider_search_summary":
            unresolved = event.get("unresolved")
            if (not count(event.get("eligibleOffers")) or not count(event.get("matched")) or
                    not isinstance(unresolved, dict) or not all(count(unresolved.get(reason)) for reason in REASONS) or
                    event["matched"] + sum(unresolved[reason] for reason in REASONS) != event["eligibleOffers"]):
                result["invalid"] += 1
                continue
            result["fresh"]["searches"] += 1
            result["fresh"]["eligible"] += event["eligibleOffers"]
            result["fresh"]["matched"] += event["matched"]
            result["fresh"].update({reason: unresolved[reason] for reason in REASONS})
        elif name in DIAGNOSTICS:
            result["diagnostics"][name] += 1
    return result


def unique_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def usage_record(line):
    """Reject unknown fields and invalid categories without retaining or printing input."""
    if len(line) > MAX_USAGE_LINE_BYTES:
        raise ValueError("Usage line too large")
    event = json.loads(line, object_pairs_hook=unique_fields)
    if (not isinstance(event, dict) or type(event.get("version")) is not int or event["version"] != 1 or
            not isinstance(event.get("timestamp"), str) or not USAGE_TIMESTAMP.fullmatch(event["timestamp"])):
        raise ValueError("Invalid usage record")
    timestamp = instant(event["timestamp"])
    if event.get("kind") == "collector_status":
        if (set(event) != {"version", "kind", "timestamp", "status"} or
                event.get("status") not in ("started", "heartbeat", "stopped", "limited")):
            raise ValueError("Invalid collector marker")
        return event, timestamp
    if not USAGE_REQUIRED <= set(event) or set(event) - USAGE_REQUIRED - USAGE_OUTCOMES:
        raise ValueError("Invalid usage fields")
    for field in ("eventId", "browserId", "sessionId"):
        if not isinstance(event[field], str) or not UUID_V4.fullmatch(event[field]):
            raise ValueError("Invalid random identifier")
        event[field] = event[field].lower()
    for field, allowed in (("action", USAGE_ACTIONS), ("page", USAGE_PAGES), ("device", USAGE_DEVICES),
                           ("source", USAGE_SOURCES), ("traffic", USAGE_TRAFFIC)):
        if event[field] not in allowed:
            raise ValueError("Invalid usage category")
    if event["action"] == "internal_marked" and event["traffic"] != "internal":
        raise ValueError("Invalid internal classification marker")
    for field in ("coverage", "resultCount"):
        if field in event and event["action"] != "search_succeeded":
            raise ValueError("Invalid search outcome")
    if "coverage" in event and event["coverage"] not in ("complete", "partial"):
        raise ValueError("Invalid search coverage")
    if "resultCount" in event and (not count(event["resultCount"]) or event["resultCount"] > 5000):
        raise ValueError("Invalid result count")
    for field, allowed in (("detailStatus", ("available", "unavailable", "not_requested")),
                           ("quoteStatus", ("available", "unavailable"))):
        if field in event and (event["action"] != "detail_succeeded" or event[field] not in allowed):
            raise ValueError("Invalid detail outcome")
    return event, timestamp


def summarize_usage(lines, start, end, *, available=True, capped=False):
    result = {"available": available, "capped": capped, "invalid": 0, "duplicates": 0, "conflicts": 0,
              "events": [], "markers": [], "classification_markers": 0, "first": None, "last": None}
    seen = {}
    for line in lines:
        if not line.strip():
            continue
        try:
            event, timestamp = usage_record(line)
        except (ValueError, TypeError, RecursionError, UnicodeError):
            result["invalid"] += 1
            continue
        if not start <= timestamp < end:
            continue
        if event.get("kind") == "collector_status":
            result["markers"].append((timestamp, event["status"]))
            continue
        if event["eventId"] in seen:
            result["duplicates"] += 1
            previous = seen[event["eventId"]]
            if any(event.get(key) != previous.get(key) for key in USAGE_REQUIRED | USAGE_OUTCOMES if key != "timestamp"):
                result["conflicts"] += 1
            continue
        seen[event["eventId"]] = event
        result["events"].append((timestamp, event))
        if event["action"] != "internal_marked":
            result["first"] = min(timestamp, result["first"] or timestamp)
            result["last"] = max(timestamp, result["last"] or timestamp)
    # A browser marked as testing/automation anywhere in this day is excluded from
    # ordinary browser totals, including earlier events before that marker.
    traffic = {}
    for _, event in result["events"]:
        identity = event["browserId"]
        classification = "internal" if event["action"] == "internal_marked" else event["traffic"]
        traffic[identity] = max(traffic.get(identity, "browser"), classification, key=USAGE_TRAFFIC.index)
    # Classification controls update attribution without creating measured activity.
    interactions = [item for item in result["events"] if item[1]["action"] != "internal_marked"]
    result["classification_markers"] = len(result["events"]) - len(interactions)
    result["events"] = interactions
    groups = {kind: {"browsers": set(), "sessions": {}, "actions": Counter(), "pages": Counter(),
                     "search": Counter(), "detail": Counter()} for kind in USAGE_TRAFFIC}
    for timestamp, event in sorted(result["events"], key=lambda item: item[0]):
        group = groups[traffic[event["browserId"]]]
        group["browsers"].add(event["browserId"])
        # A session identifier alone does not merge different browser identities.
        key = (event["browserId"], event["sessionId"])
        session = group["sessions"].setdefault(key, {"actions": Counter(), "device": event["device"], "source": event["source"]})
        action = event["action"]
        session["actions"][action] += 1
        group["actions"][action] += 1
        if action == "page_view":
            group["pages"][event["page"]] += 1
        elif action == "search_succeeded":
            group["search"][event.get("coverage", "coverage_missing")] += 1
            if "resultCount" in event:
                group["search"]["result_samples"] += 1
                group["search"]["result_total"] += event["resultCount"]
                group["search"]["with_results" if event["resultCount"] else "zero_results"] += 1
            else:
                group["search"]["results_missing"] += 1
        elif action == "detail_succeeded":
            group["detail"]["detail_" + event.get("detailStatus", "missing")] += 1
            group["detail"]["quote_" + event.get("quoteStatus", "missing")] += 1
    result["groups"] = groups
    return result


def read_usage(directory, start, end):
    """Stream bounded bytes/lines; tiny malformed lines cannot expand into a huge list."""
    path = Path(directory) / f"usage-{start.date()}.jsonl"
    state = {"capped": False, "torn": False}

    def lines(stream):
        size = 0
        draining = False
        while True:
            line = stream.readline(min(MAX_USAGE_LINE_BYTES + 1, MAX_USAGE_BYTES - size + 1))
            if not line:
                return
            size += len(line)
            if size > MAX_USAGE_BYTES:
                state["capped"] = True
                return
            complete = line.endswith(b"\n")
            if draining:
                draining = not complete
            elif len(line) > MAX_USAGE_LINE_BYTES:
                # Count an oversized record once, and drain its tail without parsing it.
                yield line
                draining = not complete
            elif not complete:
                state["torn"] = True
                return
            else:
                yield line

    try:
        if not path.is_file():
            return summarize_usage([], start, end, available=False)
        with path.open("rb") as stream:
            result = summarize_usage(lines(stream), start, end)
    except OSError:
        return summarize_usage([], start, end, available=False)
    result["capped"] = state["capped"]
    result["invalid"] += int(state["torn"])
    return result


def usage_coverage(usage, start, end, now):
    markers = sorted(set(usage["markers"]))
    reasons = []
    unavailable = not usage["available"] or not usage["events"] and not usage["classification_markers"] and not markers
    if unavailable:
        reasons.append("No readable collection evidence for this UTC day; missing, empty, expired or unavailable collection is not zero traffic.")
    if end > now:
        reasons.append("This UTC day is in progress; counts are partial.")
    if not markers and not unavailable:
        reasons.append("Collector availability markers are missing; event counts are observations only.")
    elif markers:
        endpoint = min(end, now)
        tolerance = timedelta(seconds=COLLECTOR_GAP_SECONDS)
        if markers[0][0] - start > tolerance or endpoint - markers[-1][0] > tolerance:
            reasons.append("Collector markers do not cover the window endpoints within the 150-second tolerance.")
        if any(after[0] - before[0] > tolerance for before, after in zip(markers, markers[1:])):
            reasons.append("Collector marker gaps exceed 150 seconds; some activity may be missing.")
        if any(status == "stopped" or status == "started" and timestamp - start > tolerance for timestamp, status in markers):
            reasons.append("Collector shutdown or restart was observed during the window; continuity is incomplete.")
        if any(status == "limited" for _, status in markers):
            reasons.append("The collector reported a collection limit; some events were dropped.")
    if usage["capped"]:
        reasons.append("The persistent file exceeded the 5 MiB report read cap; later records were not read.")
    if usage["invalid"] or usage["conflicts"]:
        reasons.append("Malformed, incomplete or conflicting records were ignored; some activity may be missing.")
    return ("unavailable" if unavailable else "partial" if reasons else "observed continuity"), reasons


def render_usage(usage, start, end, now):
    coverage, reasons = usage_coverage(usage, start, end, now)
    lines = ["## Browser usage", "",
             "Persistent first-party usage files survive container replacement. This section has independent coverage from Docker logs.", "",
             f"- Browser usage coverage: {coverage}."]
    lines.extend(f"- {reason}" for reason in reasons)
    lines.append(f"- Accepted unique events: {len(usage['events'])}; duplicate event IDs ignored: {usage['duplicates']}; malformed/incomplete records: {usage['invalid']}; conflicting duplicates: {usage['conflicts']}.")
    if usage["classification_markers"]:
        lines.append(f"- Internal classification markers: {usage['classification_markers']} (excluded from activity totals).")
    if usage["first"]:
        lines.append(f"- Observed browser event range: {stamp(usage['first'])} to {stamp(usage['last'])}.")
    lines.extend(["", "Collector continuity is observed availability, not a lossless-delivery guarantee. JavaScript blocked, opt-out, DNT/GPC, blocked storage and ad blockers are unobservable. Bot classification is heuristic; unmarked activity is not proof of a human visitor.",
                  "Random browser IDs are approximate browsers, not people. IDs expire after 30 days; devices, browsers, cleared storage and separate tabs can overcount people. Sessions are per tab, expire after 30 minutes of inactivity, and are counted once per UTC day with an observed event.",
                  "Any internal/testing marker for a browser in this day excludes that browser's events from ordinary totals; otherwise any automation marker classifies it as suspected automation.", ""])
    if coverage == "unavailable":
        lines.extend(["Browser, session, page-view and action totals: n/a (collection unavailable).", ""])
        return lines
    lines.extend(["| Activity class | Approximate browsers | Observed tab sessions | Engaged sessions | Page views | Events |",
                  "| --- | ---: | ---: | ---: | ---: | ---: |"])
    for kind, label in (("browser", "Unmarked browser"), ("internal", "Internal/testing"), ("automated", "Suspected automation")):
        group = usage["groups"][kind]
        engaged = sum(session["actions"]["page_view"] >= 2 or any(action != "page_view" for action in session["actions"])
                      for session in group["sessions"].values())
        lines.append(f"| {label} | {len(group['browsers'])} | {len(group['sessions'])} | {engaged} | {group['actions']['page_view']} | {sum(group['actions'].values())} |")
    group = usage["groups"]["browser"]
    sessions = list(group["sessions"].values())
    total_sessions = len(sessions)
    lines.extend(["", "Engaged means at least two page views or a search, detail or original-offer action observed in the same tab session during this UTC day. Page views exclude assets, health checks and raw HTTP requests.",
                  "All breakdowns below use unmarked browser activity only; marked internal/testing and suspected automation are excluded. Zero means no observed events in the available collection, not proof that nobody visited.",
                  "", "### Pages and action reach", "",
                  "| Page | Page views |", "| --- | ---: |"])
    lines.extend(f"| {page} | {group['pages'][page]} |" for page in USAGE_PAGES)
    lines.extend(["", "| Action | Unique events | Sessions reaching action / observed browser sessions |", "| --- | ---: | --- |"])
    for action in USAGE_ACTIONS:
        if action == "internal_marked":
            continue
        reached = sum(session["actions"][action] > 0 for session in sessions)
        lines.append(f"| {action.replace('_', ' ')} | {group['actions'][action]} | {percent(reached, total_sessions)} |")
    lines.extend(["", "Action reach is an unordered step count, not an ordered conversion funnel. Starts and terminal outcomes can occur on different days; they are not paired attempts. Intentional aborts do not count as failures. Original-offer handoffs are clicks, not bookings.",
                  "", "### Observed outcomes", ""])
    actions, searches, details = group["actions"], group["search"], group["detail"]
    search_completed = actions["search_succeeded"] + actions["search_failed"]
    detail_completed = actions["detail_succeeded"] + actions["detail_failed"]
    lines.extend([f"Search terminal outcomes: {actions['search_succeeded']} succeeded, {actions['search_failed']} failed; succeeded / observed terminal outcomes: {percent(actions['search_succeeded'], search_completed)}.",
                  f"Successful-search coverage: {searches['complete']} complete, {searches['partial']} partial, {searches['coverage_missing']} unspecified (denominator: {actions['search_succeeded']} successful search events).",
                  f"Successful searches with result counts: {searches['result_samples']}; zero results: {searches['zero_results']}; with results: {searches['with_results']}; result count unspecified: {searches['results_missing']}."])
    if searches["result_samples"]:
        lines.append(f"Visible matched results per successful search with a result count: {searches['result_total'] / searches['result_samples']:.1f} mean ({searches['result_total']} results / {searches['result_samples']} events; repeated searches can repeat results).")
    else:
        lines.append("Visible matched results per successful search: n/a (no result-count observations).")
    lines.extend([f"Detail terminal outcomes: {actions['detail_succeeded']} succeeded, {actions['detail_failed']} failed; succeeded / observed terminal outcomes: {percent(actions['detail_succeeded'], detail_completed)}.",
                  f"Successful-detail content status: {details['detail_available']} available, {details['detail_unavailable']} unavailable, {details['detail_not_requested']} not requested, {details['detail_missing']} unspecified (denominator: {actions['detail_succeeded']} successful detail events).",
                  f"Successful-detail quote status: {details['quote_available']} available, {details['quote_unavailable']} unavailable, {details['quote_missing']} unspecified (denominator: {actions['detail_succeeded']} successful detail events).",
                  "", "### Session device and source", "",
                  "Each breakdown counts a session once using its earliest observed event in this UTC day. Source categories describe the session's reported referrer category; direct can include unavailable referrers.", "",
                  "| Dimension | Category | Sessions / observed browser sessions |", "| --- | --- | --- |"])
    for field, categories in (("device", USAGE_DEVICES), ("source", USAGE_SOURCES)):
        counts = Counter(session[field] for session in sessions)
        lines.extend(f"| {field} | {category} | {percent(counts[category], total_sessions)} |" for category in categories)
    lines.append("")
    return lines


def percent(numerator, denominator):
    return f"{100 * numerator / denominator:.1f}% ({numerator}/{denominator})" if denominator else "n/a (no observations)"


def percentile(values, fraction):
    return f"{sorted(values)[math.ceil(len(values) * fraction) - 1]:.0f} ms" if values else "n/a"


def render(summary, container, start, end, now=None, usage=None):
    now = now or datetime.now(UTC)
    in_progress = end > now
    partial = in_progress or container["created"] > start or summary["invalid"] > 0
    lines = [f"# Hotel Revealer — {start.date()} UTC", "",
             "Operational statistics use retained logs. Docker rotation or removed containers can omit activity; unavailable metrics show n/a.", "",
             f"- Window: {stamp(start)} inclusive to {stamp(end)} exclusive.",
             f"- Coverage: {'partial' if partial else 'unknown'}.",
             f"- Container: `{container['id'][:12]}`; created {stamp(container['created'])}; capture-time status: {container['status']}.",
             f"- Valid timestamped events: {summary['events']}; skipped malformed/legacy events or lines: {summary['invalid']}."]
    if in_progress:
        lines.append("- This UTC day is still in progress. This partial report can be replaced by the scheduled report after the day ends.")
    if container["created"] > start:
        lines.append("- This container was created after the window began; earlier-container activity is unavailable here.")
    if summary["first"]:
        lines.append(f"- Observed event range: {stamp(summary['first'])} to {stamp(summary['last'])}.")
    else:
        lines.append("- No usable timestamped events in this window.")
    if usage is not None:
        lines.extend(["", *render_usage(usage, start, end, now)])
    lines.extend(["", "## Hotel API responses", "",
                  "Counts use terminal POST events only. Diagnostics and provider events are not added to HTTP failures. Dates follow completion/abort time.", "",
                  "| Route | Completed | 2xx / completed | 4xx | 5xx | Other status | Aborted | p50 | p95 |",
                  "| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |"])
    for route, label in ROUTES.items():
        stats = summary["http"][route]
        if not stats:
            lines.append(f"| {label} | No observations | n/a | n/a | n/a | n/a | n/a | n/a | n/a |")
            continue
        timings = summary["durations"][route]
        lines.append(f"| {label} | {stats['completed']} | {percent(stats['2xx'], stats['completed'])} | {stats['4xx']} | {stats['5xx']} | {stats['1xx'] + stats['3xx']} | {stats['aborted']} | {percentile(timings, .5)} | {percentile(timings, .95)} |")
    lines.extend(["", "Latency uses all completed responses (including errors), nearest-rank percentiles; the completed count is its sample size. Aborts are separate.",
                  "", "## Service observations", ""])
    searches = summary["search"]
    lines.append(f"Search callers: {searches['complete']} complete, {searches['partial']} partial, {searches['errors']} errors."
                 if searches else "Search callers: no observations.")
    lines.extend(["", "| Operation | Observed callers | Shared callers | Cache hits / actual cache checks |",
                  "| --- | ---: | ---: | --- |"])
    for kind, label in (("search", "Search"), ("detail", "Details")):
        cache = summary["cache"][kind]
        lines.append(f"| {label} | {cache['callers']} | {cache['shared']} | {percent(cache['hit'], cache['hit'] + cache['miss'])} |"
                     if cache else f"| {label} | No observations | n/a | n/a |")
    fresh = summary["fresh"]
    lines.extend(["", f"Fresh search summaries: {fresh['searches']}. Rule-resolved offers: {percent(fresh['matched'], fresh['eligible'])}."
                  if fresh else "Fresh search summaries: no observations."])
    if fresh:
        lines.append("Unresolved offers: " + ", ".join(f"{reason.replace('_', ' ')}: {fresh[reason]}" for reason in REASONS) + ".")
    lines.extend(["This is a rule resolution rate, not hotel-identification accuracy. Shared callers do not enter the cache-check denominator or duplicate fresh summaries.",
                  "No exact upstream-call total or pricing-success rate is inferred from caller-completion logs.",
                  "", "## Operational events", ""])
    observed = summary["diagnostics"]
    lines.extend(f"- {name}: {observed[name]}" for name in DIAGNOSTICS if observed[name])
    if not observed:
        lines.append("No operational events observed.")
    lines.extend(["", "Provider-search-failed events count unexpected underlying failures; they overlap caller/HTTP errors and are not added to them.", ""])
    return "\n".join(lines)


def save_report(directory, day, body):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    target = directory / f"{day}.md"
    reports = []
    for path in directory.iterdir():
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.md", path.name) and path.is_file():
            try:
                date.fromisoformat(path.stem)
                reports.append(path)
            except ValueError:
                pass
    obsolete = sorted(set(reports + [target]))[:-30]
    if target in obsolete:
        raise ReportError("The requested date is older than the 30 retained report dates; use a separate output directory.")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory, prefix=".daily-", delete=False) as stream:
            temporary = Path(stream.name)
            os.fchmod(stream.fileno(), 0o600)
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    for path in obsolete:
        path.unlink()
    return target


def run(report_date=None, output_dir=REPORT_DIRECTORY, usage_dir=USAGE_DIRECTORY):
    start, end = day_window(report_date)
    container = app_container()
    logs = retained_lines(container, start, end)
    try:
        summary = summarize(logs, start, end)
    finally:
        logs.close()
    usage = read_usage(usage_dir, start, end)
    return save_report(output_dir, start.date(), render(summary, container, start, end, usage=usage))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="UTC day, YYYY-MM-DD; today is partial; default: yesterday")
    parser.add_argument("--output-dir", type=Path, default=REPORT_DIRECTORY)
    parser.add_argument("--usage-dir", type=Path, default=USAGE_DIRECTORY, help="Persistent usage JSONL directory")
    args = parser.parse_args()
    try:
        target = run(args.date, args.output_dir, args.usage_dir)
        print(f"Wrote retained-log report: {target}")
    except ReportError as error:
        parser.exit(1, f"Daily report failed: {error}\n")
    except OSError:
        parser.exit(1, "Daily report failed: local report storage could not be updated.\n")


if __name__ == "__main__":
    main()
