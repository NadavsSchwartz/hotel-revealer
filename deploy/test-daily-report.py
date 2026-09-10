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
        self.state()

    def state(self, **values):
        (self.root / "state.json").write_text(json.dumps(values))

    def test_stopped_container_and_both_log_streams_are_captured(self):
        self.state(status="exited", lines=[json.dumps(completed("stdout")), json.dumps(completed("stderr", 503))])
        target = report.run("2020-01-02", self.output)
        body = target.read_text()
        self.assertIn("50.0% (1/2)", body)
        self.assertIn("capture-time status: exited", body)
        commands = [json.loads(line) for line in (self.root / "calls.jsonl").read_text().splitlines()]
        self.assertEqual([command[0] for command in commands], ["ps", "inspect", "logs"])
        self.assertEqual(commands[-1][1:5], ["--since", "2020-01-02T00:00:00Z", "--until", "2020-01-03T00:00:00Z"])
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)

    def test_missing_or_ambiguous_container_does_not_create_a_report(self):
        for identities in ([], ["a" * 64, "b" * 64], ["short-id"]):
            self.state(ids=identities)
            with self.assertRaises(report.ReportError):
                report.run("2020-01-02", self.output)
            self.assertFalse(self.output.exists())

    def test_failed_capture_after_valid_events_preserves_existing_report(self):
        self.output.mkdir()
        target = self.output / "2020-01-02.md"
        target.write_text("previous report")
        self.state(fail=True, lines=[json.dumps(completed("partial"))])
        with self.assertRaisesRegex(report.ReportError, "capture failed") as error:
            report.run("2020-01-02", self.output)
        self.assertNotIn("private", str(error.exception))
        self.assertEqual(target.read_text(), "previous report")
        self.assertEqual(list(self.output.iterdir()), [target])

    def test_capture_timeout_and_size_bounds_do_not_leave_partial_reports(self):
        self.state(hang=True)
        with patch.object(report, "CAPTURE_SECONDS", .1), self.assertRaises(report.ReportError):
            report.run("2020-01-02", self.output)
        self.assertFalse(self.output.exists())
        self.state(lines=["x" * 100])
        with patch.object(report, "MAX_LINE_BYTES", 20), self.assertRaises(report.ReportError):
            report.run("2020-01-02", self.output)
        self.assertFalse(self.output.exists())
        self.state(lines=["x" * 10] * 10)
        with patch.object(report, "MAX_LOG_BYTES", 50), self.assertRaises(report.ReportError):
            report.run("2020-01-02", self.output)
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
