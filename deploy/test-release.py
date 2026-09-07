#!/usr/bin/env python3
"""Exercise release control flow with fake Docker/HTTP commands; never run a host deployment."""
import json
import os
import pathlib
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
OLD = "ghcr.io/example/hotel-revealer@sha256:" + "a" * 64
NEW = "ghcr.io/example/hotel-revealer@sha256:" + "b" * 64
MOCK = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ["MOCK_ROOT"])
command = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
statefile = root / "state.json"
state = json.loads(statefile.read_text())
mode = os.environ["MOCK_MODE"]
image = os.environ.get("APP_IMAGE", "")
def event(name):
    with (root / "events").open("a") as out: out.write(name + "\n")
def save(): statefile.write_text(json.dumps(state))
if command == "timeout": os.execvp(args[1], args[1:])
if command in ("sleep", "flock", "curl"): sys.exit(0)
if args[0] == "pull":
    if mode == "pull-fails" and args[1] == os.environ["NEW_IMAGE"]: sys.exit(1)
    sys.exit(0)
if args[0] == "run": sys.exit(0)
if args[0] == "inspect":
    if "Config.Image" in args[2]: print(state["image"])
    elif state["image"] == os.environ["NEW_IMAGE"] and mode in ("unhealthy", "first-fails"): print("unhealthy")
    else: print("healthy")
    sys.exit(0)
assert args[0] == "compose", args
action, rest = args[5], args[6:]
if action == "config": sys.exit(0)
if action == "ps":
    if state["exists"] and ("--all" in rest or state["running"]): print("app-container")
    sys.exit(0)
if action == "stop":
    event("stop " + state["image"])
    state["running"] = False
    save()
    sys.exit(0)
if action == "rm":
    assert not state["running"], "Only a stopped failed app may be removed"
    state["exists"] = False
    save()
    sys.exit(0)
if action == "up":
    if rest[-1] == "caddy": sys.exit(0)
    assert not state["running"], "Two provider instances could overlap"
    event("start " + image)
    if mode == "start-fails" and image == os.environ["NEW_IMAGE"]: sys.exit(1)
    state.update(image=image, running=True, exists=True)
    save()
    sys.exit(0)
raise AssertionError(args)
'''


def run_case(mode):
    with tempfile.TemporaryDirectory(prefix="hotel-release-test-") as directory:
        root = pathlib.Path(directory)
        for relative in ("opt/hotel-revealer/deploy", "etc/hotel-revealer", "var/lib/hotel-revealer", "run/lock", "bin"):
            (root / relative).mkdir(parents=True, exist_ok=True)
        (root / "opt/hotel-revealer/deploy/validate.sh").write_text((HERE / "validate.sh").read_text())
        (root / "etc/hotel-revealer/image-repository").write_text("ghcr.io/example/hotel-revealer\n")
        (root / "etc/hotel-revealer/compose.env").write_text(
            "CADDY_IMAGE=caddy:2-alpine@sha256:" + "c" * 64 + "\nSITE_ADDRESS=hotels.example.com\nACME_EMAIL=test@example.com\n")
        manifest = root / "var/lib/hotel-revealer/current-image"
        first = mode == "first-fails"
        if not first:
            manifest.write_text(OLD + "\n")
        initial = {"image": OLD if not first else "", "running": not first, "exists": not first}
        if mode == "record-mismatch":
            initial["image"] = NEW
        (root / "state.json").write_text(json.dumps(initial))
        for command in ("docker", "timeout", "flock", "curl", "sleep"):
            path = root / "bin" / command
            path.write_text(MOCK)
            path.chmod(0o755)
        source = (HERE / "release.sh").read_text()
        # Rewrite only host boundaries in this temporary test copy, never production code.
        source = source.replace("$EUID == 0", "1 == 1")
        source = source.replace("export PATH=/usr/sbin:/usr/bin:/sbin:/bin", "export PATH=" + str(root / "bin") + ":" + os.environ["PATH"])
        for prefix in ("/opt/hotel-revealer", "/etc/hotel-revealer", "/var/lib/hotel-revealer", "/run/lock"):
            source = source.replace(prefix, str(root) + prefix)
        runner = root / "release.sh"
        runner.write_text(source)
        environment = dict(os.environ, MOCK_ROOT=str(root), MOCK_MODE=mode, NEW_IMAGE=NEW)
        result = subprocess.run(["bash", str(runner), NEW], env=environment, capture_output=True, text=True, timeout=15)
        state = json.loads((root / "state.json").read_text())
        events = (root / "events").read_text().splitlines() if (root / "events").exists() else []
        if mode == "success":
            assert result.returncode == 0, result.stderr
            assert state["running"] and state["image"] == NEW
            assert manifest.read_text().strip() == NEW
            assert events == ["stop " + OLD, "start " + NEW]
        else:
            assert result.returncode != 0, mode
            if first:
                assert not state["running"] and not state["exists"] and not manifest.exists(), result.stderr
            elif mode == "record-mismatch":
                assert state == initial and not events, result.stderr
            else:
                assert state["running"] and state["image"] == OLD, result.stderr
                assert manifest.read_text().strip() == OLD
                if mode == "pull-fails":
                    assert not events, events
                else:
                    assert events[0] == "stop " + OLD
                    assert events[-1] == "start " + OLD
                    assert events[-2].startswith("stop "), events
        print("PASS:", mode)


for scenario in ("success", "unhealthy", "start-fails", "first-fails", "pull-fails", "record-mismatch"):
    run_case(scenario)
