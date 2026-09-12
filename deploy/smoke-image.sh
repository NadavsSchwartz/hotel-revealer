#!/usr/bin/env bash
# The tested container has no external network and no provider credentials.
set -euo pipefail
[[ $# == 1 && "$1" =~ ^hotel-revealer-ci:[a-f0-9]{40}$ ]] || { echo 'Expected a local CI image tagged with a full commit SHA.' >&2; exit 1; }
name="hotel-revealer-smoke-$$"
runtime_limits=(--memory 512m --cpus 0.80 --pids-limit 100)
cleanup() {
  docker rm --force "$name" >/dev/null 2>&1 || true
  docker volume rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker volume create "$name" >/dev/null
docker run --detach --name "$name" --network none --read-only --cap-drop ALL \
  "${runtime_limits[@]}" \
  --security-opt no-new-privileges --tmpfs /tmp:size=16m,mode=1777,noexec,nosuid \
  --mount "type=volume,src=$name,dst=/app/var" "$1" >/dev/null
[[ $(docker inspect --format '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}' "$name") == '536870912 800000000 100' ]]
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
  const usage = await fetch("http://127.0.0.1:5000/api/v1/usage", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5000" },
    body: JSON.stringify({ version: 1, eventId: "00000000-0000-4000-8000-000000000001",
      browserId: "00000000-0000-4000-8000-000000000002", sessionId: "00000000-0000-4000-8000-000000000003",
      action: "page_view", page: "home", device: "desktop", source: "direct", traffic: "internal" }),
  });
  assert.equal(usage.status, 204, "The offline container accepts a marked test usage event");
  const files = fs.readdirSync("/app/var/usage").filter(name => /^usage-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name));
  const records = files.flatMap(name => fs.readFileSync(`/app/var/usage/${name}`, "utf8").trim().split("\n").map(JSON.parse));
  assert.ok(records.some(record => record.eventId === "00000000-0000-4000-8000-000000000001"));
'
docker restart --time 45 "$name" >/dev/null
docker exec "$name" node --input-type=module -e '
  import assert from "node:assert/strict";
  import fs from "node:fs";
  assert.equal(fs.readFileSync("/app/var/smoke-check", "utf8"), "retained");
  const usageFiles = fs.readdirSync("/app/var/usage").filter(name => /^usage-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name));
  assert.ok(usageFiles.some(name => fs.readFileSync(`/app/var/usage/${name}`, "utf8").includes("00000000-0000-4000-8000-000000000001")),
    "Usage records survive container restart on the persistent mount");
  fs.unlinkSync("/app/var/smoke-check");
  fs.writeFileSync("/app/var/provider-state.json", JSON.stringify({version:1,disabled:true,cooldownUntil:123456}));
'
docker stop --time 45 "$name" >/dev/null
reset_provider() {
  docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    "${runtime_limits[@]}" \
    --mount "type=volume,src=$name,dst=/app/var" "$1" node scripts/reset-provider.mjs "${@:2}"
}
if reset_provider "$1"; then
  echo 'Provider reset must refuse without explicit review.' >&2
  exit 1
fi
reset_provider "$1" --after-review
docker start "$name" >/dev/null
docker exec "$name" node --input-type=module -e '
  import assert from "node:assert/strict";
  import fs from "node:fs";
  assert.deepEqual(JSON.parse(fs.readFileSync("/app/var/provider-state.json", "utf8")), {version:1,disabled:false,cooldownUntil:0});
'
printf '%s\n' 'Image smoke/reset passed without external networking under the production memory, CPU and PID limits. This is bounded startup/smoke evidence, not a capacity load test.'
