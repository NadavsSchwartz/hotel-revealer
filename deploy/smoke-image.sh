#!/usr/bin/env bash
# The tested container has no external network and no provider credentials.
set -euo pipefail
[[ $# == 1 && "$1" =~ ^hotel-revealer-ci:[a-f0-9]{40}$ ]] || { echo 'Expected a local CI image tagged with a full commit SHA.' >&2; exit 1; }
name="hotel-revealer-smoke-$$"
cleanup() {
  docker rm --force "$name" >/dev/null 2>&1 || true
  docker volume rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker volume create "$name" >/dev/null
docker run --detach --name "$name" --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:size=16m,mode=1777,noexec,nosuid \
  --mount "type=volume,src=$name,dst=/app/var" "$1" >/dev/null
for attempt in {1..30}; do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$name")
  [[ "$status" == healthy ]] && break
  sleep 2
done
[[ "$status" == healthy ]] || { echo 'Container health check failed.' >&2; exit 1; }
docker exec "$name" node --input-type=module -e '
  import assert from "node:assert/strict";
  import fs from "node:fs";
  assert.notEqual(process.getuid(), 0);
  const health = await fetch("http://127.0.0.1:5000/health");
  assert.equal(health.status, 200);
  const page = await fetch("http://127.0.0.1:5000/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const markup = await page.text();
  const script = markup.match(/<script\b(?=[^>]*\btype="module")[^>]*\bsrc="([^"]+\.js)"/);
  assert.ok(script, "Built browser JavaScript is linked from the page");
  const asset = await fetch(new URL(script[1], "http://127.0.0.1:5000"));
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.throws(() => fs.writeFileSync("/app/readonly-check", "x"));
  fs.writeFileSync("/app/var/smoke-check", "retained");
'
docker restart --time 45 "$name" >/dev/null
docker exec "$name" node --input-type=module -e '
  import assert from "node:assert/strict";
  import fs from "node:fs";
  assert.equal(fs.readFileSync("/app/var/smoke-check", "utf8"), "retained");
  fs.unlinkSync("/app/var/smoke-check");
'
printf '%s\n' 'Image served its built UI and health endpoint without external networking; nonroot, read-only root and state persistence checks passed.'
