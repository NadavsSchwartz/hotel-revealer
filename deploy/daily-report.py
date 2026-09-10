#!/usr/bin/env python3
"""Summarize retained app logs without contacting the app or its provider."""
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
    result = {"events": 0, "invalid": 0, "outside": 0, "duplicates": 0,
              "first": None, "last": None, "http": {route: Counter() for route in ROUTES},
              "durations": {route: [] for route in ROUTES}, "search": Counter(),
              "cache": {kind: Counter() for kind in ("search", "detail")},
              "fresh": Counter(), "diagnostics": Counter()}
    terminals = set()
    callers = set()
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
            result["outside"] += 1
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
            request_id = event.get("requestId")
            if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128 or not duration(event.get("durationMs")):
                result["invalid"] += 1
                continue
            status = event.get("status")
            if name == "request_completed" and (not count(status) or not 100 <= status <= 599):
                result["invalid"] += 1
                continue
            if request_id in terminals:
                result["duplicates"] += 1
                continue
            terminals.add(request_id)
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
            request_id = event.get("requestId")
            if isinstance(request_id, str):
                identity = (kind, request_id)
                if identity in callers:
                    result["duplicates"] += 1
                    continue
                callers.add(identity)
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


def percent(numerator, denominator):
    return f"{100 * numerator / denominator:.1f}% ({numerator}/{denominator})" if denominator else "n/a (no observations)"


def percentile(values, fraction):
    return f"{sorted(values)[math.ceil(len(values) * fraction) - 1]:.0f} ms" if values else "n/a"


def render(summary, container, start, end, now=None):
    in_progress = end > (now or datetime.now(UTC))
    partial = in_progress or container["created"] > start or summary["invalid"] > 0
    lines = [f"# Hotel Revealer — {start.date()} UTC", "",
             "Observed retained application logs; this is not a complete traffic or uptime measurement.", "",
             f"- Window: {stamp(start)} inclusive to {stamp(end)} exclusive.",
             f"- Coverage: {'partial' if partial else 'unknown'}; Docker rotation and removed containers can omit activity.",
             f"- Container: `{container['id'][:12]}`; created {stamp(container['created'])}; capture-time status: {container['status']}.",
             f"- Valid timestamped events: {summary['events']}; skipped malformed/legacy events or lines: {summary['invalid']}; duplicate caller/terminal events: {summary['duplicates']}."]
    if in_progress:
        lines.append("- This UTC day is still in progress. This partial report can be replaced by the scheduled report after the day ends.")
    if container["created"] > start:
        lines.append("- This container was created after the window began; earlier-container activity is unavailable here.")
    if summary["first"]:
        lines.append(f"- Observed event range: {stamp(summary['first'])} to {stamp(summary['last'])}.")
    else:
        lines.append("- No usable timestamped events in this window. Activity and reliability are unknown; this does not mean zero traffic or zero failures.")
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
        lines.append("No operational events observed in retained logs; absence is not proof that none occurred.")
    lines.extend(["", "Server-start events are observed starts, not an uptime calculation. Provider-search-failed events count unexpected underlying failures; they overlap caller/HTTP errors and are not added to them.", ""])
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


def run(report_date=None, output_dir=REPORT_DIRECTORY):
    start, end = day_window(report_date)
    container = app_container()
    logs = retained_lines(container, start, end)
    try:
        summary = summarize(logs, start, end)
    finally:
        logs.close()
    return save_report(output_dir, start.date(), render(summary, container, start, end))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="UTC day, YYYY-MM-DD; today is partial; default: yesterday")
    parser.add_argument("--output-dir", type=Path, default=REPORT_DIRECTORY)
    args = parser.parse_args()
    try:
        target = run(args.date, args.output_dir)
        print(f"Wrote retained-log report: {target}")
    except ReportError as error:
        parser.exit(1, f"Daily report failed: {error}\n")
    except OSError:
        parser.exit(1, "Daily report failed: local report storage could not be updated.\n")


if __name__ == "__main__":
    main()
