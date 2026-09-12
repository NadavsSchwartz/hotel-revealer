#!/usr/bin/env python3
"""Deterministic reporting checks using synthetic events and a fake Docker executable."""
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("daily_report", HERE / "daily-report.py")
report = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(report)
START = datetime(2020, 1, 2, tzinfo=timezone.utc)
END = START + timedelta(days=1)
CONTAINER = {"id": "a" * 64, "created": START - timedelta(days=1), "status": "running"}


def event(name, **fields):
    return {"event": name, "timestamp": "2020-01-02T12:00:00.000Z", "level": "info", **fields}


def completed(identity, status=200, milliseconds=100, **fields):
    return event("request_completed", **{"requestId": identity, "method": "POST", "route": "/api/v1/hoteldeals",
                                         "status": status, "durationMs": milliseconds, **fields})


def summarize(events):
    return report.summarize((json.dumps(value) for value in events), START, END)


def usage(identity=1, **fields):
    return {"version": 1, "timestamp": "2020-01-02T12:00:00.000Z",
            "eventId": f"00000000-0000-4000-8000-{identity:012x}",
            "browserId": "10000000-0000-4000-8000-000000000001",
            "sessionId": "20000000-0000-4000-8000-000000000001", "action": "page_view",
            "page": "home", "device": "desktop", "source": "direct", "traffic": "browser", **fields}


def marker(timestamp, status="heartbeat"):
    return {"version": 1, "kind": "collector_status", "timestamp": report.stamp(timestamp), "status": status}


def full_markers():
    return [marker(START + timedelta(minutes=minute)) for minute in range(24 * 60)]


def summarize_usage(events, markers=None):
    return report.summarize_usage((json.dumps(value) for value in [*(markers or []), *events]), START, END)


def render_usage(result, container=CONTAINER, now=END):
    return report.render(summarize([]), container, START, END, now=now, usage=result)


class UsageTests(unittest.TestCase):
    def test_unique_browsers_tab_sessions_engagement_and_duplicate_events(self):
        second_session = "20000000-0000-4000-8000-000000000002"
        second_browser = "10000000-0000-4000-8000-000000000002"
        events = [usage(), usage(), usage(2, page="results"),
                  usage(3, sessionId=second_session, action="search_started", page="results"),
                  usage(4, browserId=second_browser)]
        result = summarize_usage(events, full_markers())
        group = result["groups"]["browser"]
        self.assertEqual(len(group["browsers"]), 2)
        self.assertEqual(len(group["sessions"]), 3)
        self.assertEqual(group["actions"], {"page_view": 3, "search_started": 1})
        self.assertEqual(result["duplicates"], 1)
        body = render_usage(result)
        self.assertIn("| Unmarked browser | 2 | 3 | 2 | 3 | 4 |", body)
        self.assertIn("| search started | 1 | 33.3% (1/3) |", body)
        self.assertIn("Browser usage coverage: observed continuity", body)
        self.assertIn("not people", body)
        self.assertIn("unordered step count", body)

    def test_internal_and_automated_browsers_excluded_from_all_ordinary_breakdowns(self):
        internal_browser = "10000000-0000-4000-8000-000000000002"
        bot_browser = "10000000-0000-4000-8000-000000000003"
        events = [usage(), usage(2, browserId=internal_browser),
                  usage(3, browserId=internal_browser, traffic="internal", action="search_succeeded", coverage="partial", resultCount=99),
                  usage(4, browserId=bot_browser, traffic="automated", action="provider_handoff", device="mobile")]
        result = summarize_usage(events, full_markers())
        body = render_usage(result)
        self.assertIn("| Unmarked browser | 1 | 1 | 0 | 1 | 1 |", body)
        self.assertIn("| Internal/testing | 1 | 1 | 1 | 1 | 2 |", body)
        self.assertIn("| Suspected automation | 1 | 1 | 1 | 0 | 1 |", body)
        self.assertIn("| search succeeded | 0 | 0.0% (0/1) |", body)
        self.assertIn("| device | mobile | 0.0% (0/1) |", body)
        self.assertNotIn("99", body)
        self.assertEqual(result["groups"]["browser"]["search"], {})

    def test_internal_marker_reclassifies_prior_activity_without_creating_activity(self):
        control = usage(2, action="internal_marked", traffic="internal", page="privacy",
                        sessionId="20000000-0000-4000-8000-000000000002",
                        timestamp="2020-01-02T13:00:00Z")
        marker_only_browser = usage(3, action="internal_marked", traffic="internal",
                                    browserId="10000000-0000-4000-8000-000000000002")
        result = summarize_usage([usage(), control, marker_only_browser], full_markers())
        self.assertEqual(result["invalid"], 0)
        self.assertEqual(result["classification_markers"], 2)
        self.assertEqual(len(result["events"]), 1)
        self.assertEqual(result["last"], report.instant(usage()["timestamp"]))
        internal = result["groups"]["internal"]
        self.assertEqual(len(internal["browsers"]), 1)
        self.assertEqual(len(internal["sessions"]), 1)
        self.assertEqual(internal["actions"], {"page_view": 1})
        self.assertEqual(internal["pages"], {"home": 1})
        body = render_usage(result)
        self.assertIn("| Unmarked browser | 0 | 0 | 0 | 0 | 0 |", body)
        self.assertIn("| Internal/testing | 1 | 1 | 0 | 1 | 1 |", body)
        self.assertIn("Internal classification markers: 2 (excluded from activity totals)", body)
        self.assertNotIn("| internal marked |", body)
        only_control = summarize_usage([control])
        self.assertIn("Browser usage coverage: partial", render_usage(only_control))
        self.assertEqual(only_control["groups"]["internal"]["sessions"], {})
        self.assertIsNone(only_control["first"])
        for fields in ({"traffic": "browser"}, {"traffic": "automated"}, {"coverage": "complete"}):
            self.assertEqual(summarize_usage([{**control, **fields}])["invalid"], 1)

    def test_search_detail_outcomes_have_explicit_non_overlapping_denominators(self):
        events = [usage(1, action="search_started"),
                  usage(2, action="search_succeeded", coverage="complete", resultCount=4),
                  usage(3, action="search_succeeded", coverage="partial", resultCount=0),
                  usage(4, action="search_succeeded"), usage(5, action="search_failed"),
                  usage(6, action="detail_started"),
                  usage(7, action="detail_succeeded", detailStatus="available", quoteStatus="unavailable"),
                  usage(8, action="detail_succeeded", detailStatus="not_requested", quoteStatus="available"),
                  usage(9, action="detail_succeeded"), usage(10, action="detail_failed"),
                  usage(11, action="provider_handoff")]
        result = summarize_usage(events, full_markers())
        body = render_usage(result)
        self.assertIn("Search terminal outcomes: 3 succeeded, 1 failed", body)
        self.assertIn("75.0% (3/4)", body)
        self.assertIn("1 complete, 1 partial, 1 unspecified", body)
        self.assertIn("zero results: 1; with results: 1; result count unspecified: 1", body)
        self.assertIn("2.0 mean (4 results / 2 events", body)
        self.assertIn("Detail terminal outcomes: 3 succeeded, 1 failed", body)
        self.assertIn("content status: 1 available, 0 unavailable, 1 not requested, 1 unspecified", body)
        self.assertIn("quote status: 1 available, 1 unavailable, 1 unspecified", body)
        self.assertIn("clicks, not bookings", body)
        self.assertIn("not paired attempts", body)
        self.assertEqual(result["groups"]["browser"]["actions"]["search_failed"], 1)

    def test_result_count_accepts_domain_limit_and_rejects_above_it(self):
        result = summarize_usage([usage(1, action="search_succeeded", resultCount=5000),
                                  usage(2, action="search_succeeded", resultCount=5001)])
        self.assertEqual(result["invalid"], 1)
        self.assertEqual(result["groups"]["browser"]["actions"]["search_succeeded"], 1)
        self.assertEqual(result["groups"]["browser"]["search"]["result_total"], 5000)

    def test_session_dimensions_take_earliest_timestamp_not_file_order(self):
        events = [usage(1, timestamp="2020-01-02T14:00:00Z", device="mobile", source="internal"),
                  usage(2, timestamp="2020-01-02T11:00:00Z", source="search"),
                  usage(3, sessionId="20000000-0000-4000-8000-000000000002", device="tablet", source="github")]
        body = render_usage(summarize_usage(events))
        self.assertIn("| device | desktop | 50.0% (1/2) |", body)
        self.assertIn("| device | mobile | 0.0% (0/2) |", body)
        self.assertIn("| device | tablet | 50.0% (1/2) |", body)
        self.assertIn("| source | search | 50.0% (1/2) |", body)
        self.assertIn("| source | github | 50.0% (1/2) |", body)
        self.assertIn("| source | internal | 0.0% (0/2) |", body)

    def test_malformed_unknown_private_fields_and_non_schema_outcomes_are_ignored(self):
        invalid = [usage(2, rawUrl="PRIVATE_SENTINEL"), usage(3, action="PRIVATE_SENTINEL"),
                   usage(4, resultCount=4), usage(5, action="search_succeeded", resultCount=True),
                   usage(6, action="search_succeeded", resultCount=5001),
                   usage(7, action="search_succeeded", resultCount=-1),
                   usage(8, action="detail_succeeded", quoteStatus="PRIVATE_SENTINEL"),
                   usage(9, browserId="PRIVATE_SENTINEL"), usage(10, version=True),
                   usage(11, timestamp="2020-01-02T12:00:00"), usage(12, source=[]),
                   usage(13, action="detail_succeeded", coverage="complete"),
                   {**marker(START), "rawUserAgent": "PRIVATE_SENTINEL"}, [], None]
        lines = [json.dumps(value) for value in [usage(), *invalid]]
        lines.extend(['{"version":1,"version":1}', "{incomplete", "x" * (report.MAX_USAGE_LINE_BYTES + 1)])
        result = report.summarize_usage(lines, START, END)
        self.assertEqual(len(result["events"]), 1)
        self.assertEqual(result["invalid"], len(invalid) + 3)
        body = render_usage(result)
        self.assertNotIn("PRIVATE_SENTINEL", body)
        self.assertNotIn(usage()["browserId"], body)
        self.assertNotIn(usage()["sessionId"], body)
        self.assertNotIn(usage()["eventId"], body)
        self.assertIn("Browser usage coverage: partial", body)

    def test_event_and_marker_windows_are_half_open(self):
        events = [usage(1, timestamp=report.stamp(START - timedelta(milliseconds=1))),
                  usage(2, timestamp=report.stamp(START)), usage(3, timestamp=report.stamp(END))]
        result = summarize_usage(events, [marker(START - timedelta(seconds=1)), marker(START), marker(END)])
        self.assertEqual(len(result["events"]), 1)
        self.assertEqual(len(result["markers"]), 1)
        self.assertEqual(result["first"], START)
        next_day = report.summarize_usage([json.dumps(value) for value in events], END, END + timedelta(days=1))
        self.assertEqual(len(next_day["events"]), 1)
        self.assertEqual(next_day["first"], END)

    def test_case_insensitive_uuid_dedup_and_conflicting_duplicates(self):
        original = usage(0xabcdef)
        duplicate = {**original, "eventId": original["eventId"].upper(), "timestamp": "2020-01-02T13:00:00Z"}
        result = summarize_usage([original, duplicate, {**duplicate, "page": "results"}], full_markers())
        self.assertEqual(len(result["events"]), 1)
        self.assertEqual(result["duplicates"], 2)
        self.assertEqual(result["conflicts"], 1)
        self.assertIn("Browser usage coverage: partial", render_usage(result))

    def test_collection_gaps_caps_restarts_and_partial_day_are_disclosed(self):
        complete = full_markers()
        cases = [([], "availability markers are missing"),
                 (complete[3:], "window endpoints"),
                 (complete[:-3], "window endpoints"),
                 (complete[:500] + complete[503:], "gaps exceed 150"),
                 (complete + [marker(START + timedelta(hours=8), "limited")], "collection limit"),
                 (complete + [marker(START + timedelta(hours=8), "stopped")], "shutdown or restart"),
                 (complete + [marker(START + timedelta(hours=8), "started")], "shutdown or restart")]
        for markers, expected in cases:
            with self.subTest(expected=expected):
                body = render_usage(summarize_usage([usage()], markers))
                self.assertIn("Browser usage coverage: partial", body)
                self.assertIn(expected, body)
        self.assertIn("UTC day is in progress", render_usage(summarize_usage([usage()], complete), now=START + timedelta(hours=13)))
        self.assertIn("Browser usage coverage: observed continuity", render_usage(summarize_usage([], complete)))
        self.assertIn("| Unmarked browser | 0 | 0 | 0 | 0 | 0 |", render_usage(summarize_usage([], complete)))

    def test_missing_empty_and_unreadable_usage_are_unavailable_not_zero(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "usage-2020-01-02.jsonl"
            for state in ("missing", "empty", "directory"):
                if state == "empty":
                    path.write_bytes(b"")
                elif state == "directory":
                    path.unlink()
                    path.mkdir()
                result = report.read_usage(root, START, END)
                body = render_usage(result)
                self.assertIn("Browser usage coverage: unavailable", body)
                self.assertIn("not zero traffic", body)
                self.assertIn("totals: n/a", body)
                self.assertNotIn("| Unmarked browser |", body)

    def test_bounded_file_read_and_torn_append_do_not_parse_partial_records(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "usage-2020-01-02.jsonl"
            first = json.dumps(usage()).encode() + b"\n"
            second = json.dumps(usage(2)).encode() + b"\n"
            path.write_bytes(first + second)
            with patch.object(report, "MAX_USAGE_BYTES", len(first) + 10):
                result = report.read_usage(temporary, START, END)
            self.assertEqual(len(result["events"]), 1)
            self.assertTrue(result["capped"])
            self.assertIn("report read cap", render_usage(result))
            path.write_bytes(b"x" * 100)
            with patch.object(report, "MAX_USAGE_BYTES", 50):
                unavailable = report.read_usage(temporary, START, END)
            body = render_usage(unavailable)
            self.assertIn("Browser usage coverage: unavailable", body)
            self.assertIn("report read cap", body)
            path.write_bytes(first + second[:-1])
            result = report.read_usage(temporary, START, END)
            self.assertEqual(len(result["events"]), 1)
            self.assertEqual(result["invalid"], 1)
            self.assertIn("incomplete", render_usage(result))
            path.write_bytes(b"x" * (report.MAX_USAGE_LINE_BYTES + 1) + b"\n" + first)
            result = report.read_usage(temporary, START, END)
            self.assertEqual(len(result["events"]), 1)
            self.assertEqual(result["invalid"], 1)

    def test_tiny_malformed_lines_stream_without_building_a_file_sized_list(self):
        import tracemalloc
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "usage-2020-01-02.jsonl"
            # splitlines() would create hundreds of thousands of independent objects.
            path.write_bytes(b"{}\n" * 100_000 + json.dumps(usage()).encode() + b"\n")
            tracemalloc.start()
            try:
                result = report.read_usage(temporary, START, END)
                _, peak = tracemalloc.get_traced_memory()
            finally:
                tracemalloc.stop()
            self.assertEqual(result["invalid"], 100_000)
            self.assertEqual(len(result["events"]), 1)
            self.assertLess(peak, 2 * 1024 * 1024)

    def test_persistent_usage_coverage_is_independent_of_replaced_container(self):
        result = summarize_usage([usage()], full_markers())
        before = render_usage(result)
        after = render_usage(result, {**CONTAINER, "created": START + timedelta(hours=18)})
        self.assertIn("earlier-container activity is unavailable", after)
        self.assertIn("Browser usage coverage: observed continuity", after)
        self.assertEqual(before.split("## Browser usage")[1].split("## Hotel API responses")[0],
                         after.split("## Browser usage")[1].split("## Hotel API responses")[0])


FAKE_DOCKER = r'''#!/usr/bin/env python3
import json, os, pathlib, sys, time
root = pathlib.Path(os.environ["REPORT_TEST_ROOT"])
state = json.loads((root / "state.json").read_text())
args = sys.argv[1:]
with (root / "calls.jsonl").open("a") as log: log.write(json.dumps(args) + "\n")
if args[0] == "ps":
    assert "--all" in args and "--no-trunc" in args
    assert "label=com.docker.compose.project=hotel-revealer" in args
    assert "label=com.docker.compose.service=app" in args
    print("\n".join(state.get("ids", ["a" * 64])))
elif args[0] == "inspect":
    assert args[2] == "[{{json .Id}},{{json .Created}},{{json .State.Status}}]"
    print(json.dumps(["a" * 64, state.get("created", "2020-01-01T00:00:00Z"), state.get("status", "running")]))
elif args[0] == "logs":
    if state.get("hang"): time.sleep(10)
    for index, line in enumerate(state.get("lines", [])):
        print(line, file=sys.stderr if index % 2 else sys.stdout, flush=True)
    if state.get("fail"):
        print("private Docker transport details", file=sys.stderr)
        sys.exit(1)
else:
    raise AssertionError(args)
'''


class SummaryTests(unittest.TestCase):
    def test_http_denominators_ignore_overlapping_diagnostics_and_other_routes(self):
        events = [completed("one", 200, 10), completed("two", 404, 20), completed("three", 503, 30),
                  event("request_failed", requestId="three", code="PROVIDER_BUSY"),
                  event("provider_request", kind="search", requestId="three", outcome="PROVIDER_BUSY", shared=False),
                  event("request_aborted", requestId="four", route="/api/v1/hoteldeals", method="POST", durationMs=50),
                  completed("health", route="/health"), completed("get", method="GET")]
        result = summarize(events)
        self.assertEqual(result["http"]["/api/v1/hoteldeals"], {"completed": 3, "2xx": 1, "4xx": 1, "5xx": 1, "aborted": 1})
        body = report.render(result, CONTAINER, START, END)
        self.assertIn("33.3% (1/3)", body)
        self.assertIn("| 20 ms | 30 ms |", body)
        self.assertNotIn("100.0%", body)

    def test_half_open_day_boundaries_do_not_overlap_on_reruns(self):
        events = [completed("previous", timestamp="2020-01-01T23:59:59.999Z"),
                  completed("start", timestamp="2020-01-02T00:00:00Z"),
                  completed("end", timestamp="2020-01-03T00:00:00Z")]
        result = summarize(events)
        self.assertEqual(result["http"]["/api/v1/hoteldeals"]["completed"], 1)

    def test_cache_shared_and_fresh_result_denominators_are_independent(self):
        events = [event("provider_request", kind="search", requestId="hit", outcome="complete", shared=False, searchCache="hit"),
                  event("provider_request", kind="search", requestId="miss", outcome="partial", shared=False, searchCache="miss"),
                  event("provider_request", kind="search", requestId="shared", outcome="partial", shared=True, searchCache="not_checked"),
                  event("provider_request", kind="search", requestId="rejected", outcome="PROVIDER_DISABLED", shared=False, searchCache="not_checked"),
                  event("provider_request", kind="detail", requestId="detail", outcome="unavailable", shared=False, detailCache="miss", upstreamCalls=500),
                  event("provider_search_summary", eligibleOffers=4, matched=3,
                        unresolved={"no_match": 1, "ambiguous": 0, "missing_facts": 0, "incomplete_search": 0}),
                  event("provider_search_summary", eligibleOffers=6, matched=1,
                        unresolved={"no_match": 2, "ambiguous": 1, "missing_facts": 1, "incomplete_search": 1}),
                  event("provider_search_failed", eligibleOffers=6, matched=1, consecutiveUnexpectedFailures=3)]
        result = summarize(events)
        self.assertEqual(result["search"], {"complete": 1, "partial": 2, "errors": 1})
        self.assertEqual(result["cache"]["search"], {"callers": 4, "hit": 1, "miss": 1, "shared": 1})
        self.assertEqual(result["fresh"]["searches"], 2)
        self.assertEqual(result["fresh"]["matched"], 4)
        self.assertEqual(result["fresh"]["eligible"], 10)
        body = report.render(result, CONTAINER, START, END)
        self.assertIn("40.0% (4/10)", body)
        self.assertIn("Unresolved offers: no match: 3, ambiguous: 1, missing facts: 1, incomplete search: 1.", body)
        self.assertIn("rule resolution rate, not hotel-identification accuracy", body)
        self.assertIn("50.0% (1/2)", body)
        self.assertIn("provider_search_failed: 1", body)
        self.assertNotIn("500", body)

    def test_empty_legacy_and_invalid_events_never_imply_a_healthy_day(self):
        for lines in ([], ["{ event: 'request_completed',", "  status: 200", "}"],
                      [json.dumps(event("request_completed", status=200))]):
            result = report.summarize(lines, START, END)
            body = report.render(result, CONTAINER, START, END)
            self.assertIn("No observations", body)
            self.assertIn("Docker rotation or removed containers can omit activity; unavailable metrics show n/a", body)
            self.assertNotIn("100.0%", body)
            self.assertIn("Coverage: partial" if lines else "Coverage: unknown", body)
        self.assertEqual(summarize([completed("bad", milliseconds=float("nan"))])["invalid"], 1)
        self.assertEqual(summarize([completed("bad", milliseconds=10 ** 400)])["invalid"], 1)
        invalid_summary = event("provider_search_summary", eligibleOffers=1, matched=20, unresolved=dict.fromkeys(report.REASONS, 0))
        self.assertEqual(summarize([invalid_summary])["fresh"], {})

    def test_new_container_and_zero_offer_summary_keep_limits_explicit(self):
        result = summarize([event("provider_search_summary", eligibleOffers=0, matched=0, unresolved=dict.fromkeys(report.REASONS, 0))])
        body = report.render(result, {**CONTAINER, "created": START + timedelta(hours=4), "status": "exited"}, START, END)
        self.assertIn("Coverage: partial", body)
        self.assertIn("earlier-container activity is unavailable", body)
        self.assertIn("capture-time status: exited", body)
        self.assertIn("Fresh search summaries: 1. Rule-resolved offers: n/a", body)
        self.assertNotIn("0.0%", body)

    def test_report_never_copies_unknown_fields_raw_errors_or_ids(self):
        result = summarize([completed("private-request", diagnostic={"secret": "PRIVATE_SENTINEL"}),
                            event("provider_paused", reason="PRIVATE_SENTINEL"),
                            event("PRIVATE_SENTINEL", token="PRIVATE_SENTINEL")])
        body = report.render(result, CONTAINER, START, END)
        self.assertNotIn("PRIVATE_SENTINEL", body)
        self.assertNotIn("private-request", body)

    def test_yesterday_is_a_completed_utc_day(self):
        start, end = report.day_window(now=datetime(2026, 9, 9, 0, 10, tzinfo=timezone.utc))
        self.assertEqual(start.isoformat(), "2026-09-08T00:00:00+00:00")
        self.assertEqual(end.isoformat(), "2026-09-09T00:00:00+00:00")
        current_start, current_end = report.day_window("2026-09-09", now=end)
        self.assertEqual(current_start, end)
        self.assertEqual(current_end, end + timedelta(days=1))
        empty = report.summarize([], current_start, current_end)
        body = report.render(empty, CONTAINER, current_start, current_end, now=end)
        self.assertIn("Coverage: partial", body)
        self.assertIn("UTC day is still in progress", body)
        self.assertEqual(report.day_window(now=current_end), (current_start, current_end))
        self.assertNotIn("still in progress", report.render(empty, CONTAINER, current_start, current_end, now=current_end))
        for invalid in ("2026-09-10", "2026-02-30", "20260908"):
            with self.assertRaises(report.ReportError):
                report.day_window(invalid, now=end)


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        executable = self.root / "docker"
        executable.write_text(FAKE_DOCKER)
        executable.chmod(0o755)
        self.environment = patch.dict(os.environ, {"REPORT_TEST_ROOT": str(self.root), "PATH": str(self.root) + os.pathsep + os.environ["PATH"]})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.output = self.root / "reports"
        self.usage_directory = self.root / "usage"
        self.state()

    def state(self, **values):
        (self.root / "state.json").write_text(json.dumps(values))

    def test_stopped_container_and_both_log_streams_are_captured(self):
        self.state(status="exited", lines=[json.dumps(completed("stdout")), json.dumps(completed("stderr", 503))])
        target = report.run("2020-01-02", self.output, self.usage_directory)
        body = target.read_text()
        self.assertIn("50.0% (1/2)", body)
        self.assertIn("capture-time status: exited", body)
        commands = [json.loads(line) for line in (self.root / "calls.jsonl").read_text().splitlines()]
        self.assertEqual([command[0] for command in commands], ["ps", "inspect", "logs"])
        self.assertEqual(commands[-1][1:5], ["--since", "2020-01-02T00:00:00Z", "--until", "2020-01-03T00:00:00Z"])
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)

    def test_run_reads_persisted_usage_and_rerun_does_not_double_count(self):
        self.usage_directory.mkdir()
        events = [*full_markers(), usage(), usage()]
        (self.usage_directory / "usage-2020-01-02.jsonl").write_text("".join(json.dumps(value) + "\n" for value in events))
        self.state(created="2020-01-02T20:00:00Z")
        first = report.run("2020-01-02", self.output, self.usage_directory).read_text()
        second = report.run("2020-01-02", self.output, self.usage_directory).read_text()
        self.assertEqual(first, second)
        self.assertIn("Browser usage coverage: observed continuity", first)
        self.assertIn("| Unmarked browser | 1 | 1 | 0 | 1 | 1 |", first)
        self.assertIn("duplicate event IDs ignored: 1", first)

    def test_missing_or_ambiguous_container_does_not_create_a_report(self):
        for identities in ([], ["a" * 64, "b" * 64], ["short-id"]):
            self.state(ids=identities)
            with self.assertRaises(report.ReportError):
                report.run("2020-01-02", self.output, self.usage_directory)
            self.assertFalse(self.output.exists())

    def test_failed_capture_after_valid_events_preserves_existing_report(self):
        self.output.mkdir()
        target = self.output / "2020-01-02.md"
        target.write_text("previous report")
        self.state(fail=True, lines=[json.dumps(completed("partial"))])
        with self.assertRaisesRegex(report.ReportError, "capture failed") as error:
            report.run("2020-01-02", self.output, self.usage_directory)
        self.assertNotIn("private", str(error.exception))
        self.assertEqual(target.read_text(), "previous report")
        self.assertEqual(list(self.output.iterdir()), [target])

    def test_capture_timeout_and_size_bounds_do_not_leave_partial_reports(self):
        self.state(hang=True)
        with patch.object(report, "CAPTURE_SECONDS", .1), self.assertRaises(report.ReportError):
            report.run("2020-01-02", self.output, self.usage_directory)
        self.assertFalse(self.output.exists())
        self.state(lines=["x" * 100])
        with patch.object(report, "MAX_LINE_BYTES", 20), self.assertRaises(report.ReportError):
            report.run("2020-01-02", self.output, self.usage_directory)
        self.assertFalse(self.output.exists())
        self.state(lines=["x" * 10] * 10)
        with patch.object(report, "MAX_LOG_BYTES", 50), self.assertRaises(report.ReportError):
            report.run("2020-01-02", self.output, self.usage_directory)
        self.assertFalse(self.output.exists())


class StorageTests(unittest.TestCase):
    def test_atomic_replacement_and_retention_preserve_other_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "reports"
            for offset in range(32):
                day = (START + timedelta(days=offset)).date()
                report.save_report(directory, day, f"report {offset}")
            reports = sorted(directory.glob("*.md"))
            self.assertEqual(len(reports), 30)
            self.assertEqual(reports[0].name, "2020-01-04.md")
            note = directory / "operator-notes.md"
            note.write_text("preserve")
            invalid_date = directory / "2020-99-99.md"
            invalid_date.write_text("preserve")
            target = reports[-1]
            report.save_report(directory, target.stem, "rerun replaces counts")
            self.assertEqual(target.read_text(), "rerun replaces counts")
            self.assertEqual(note.read_text(), "preserve")
            self.assertEqual(invalid_date.read_text(), "preserve")
            with self.assertRaises(report.ReportError):
                report.save_report(directory, START.date(), "older than retained dates")
            self.assertFalse((directory / "2020-01-02.md").exists())
            with patch.object(report.os, "replace", side_effect=OSError("disk failure")), self.assertRaises(OSError):
                report.save_report(directory, target.stem, "must not replace")
            self.assertEqual(target.read_text(), "rerun replaces counts")
            self.assertFalse(list(directory.glob(".daily-*")))


if __name__ == "__main__":
    unittest.main()
