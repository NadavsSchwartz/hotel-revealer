import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { checkHealth } from './check-health.mts';

const host = 'hotel.example.com';
const json = (body: unknown) => Response.json(body);
const run = (response: Response) => checkHealth(host, { fetchImpl: async () => response });

test('a healthy app and available provider make exactly one HTTPS health request', async () => {
  let calls = 0;
  await checkHealth(host, { fetchImpl: async (url, options) => {
    calls++;
    assert.ok(url instanceof URL);
    assert.ok(options);
    assert.ok(options.signal);
    assert.equal(url.href, 'https://hotel.example.com/health');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.signal.aborted, false);
    return json({ status: 'ok', provider: { available: true } });
  } });
  assert.equal(calls, 1);
});

test('HTTP 200 does not hide disabled or missing live provider state', async () => {
  for (const provider of [{ available: false }, { available: 'true' }, {}, undefined]) {
    await assert.rejects(run(json({ status: 'ok', provider })), /Live provider is unavailable/);
  }
  await assert.rejects(run(json({ status: 'error', provider: { available: true } })), /Application status/);
});

test('bad status, invalid JSON and oversized bodies fail without disclosing response content', async () => {
  await assert.rejects(run(new Response('private server details', { status: 503 })), /^Error: Health endpoint did not return HTTP 200\.$/);
  await assert.rejects(run(new Response('private server details')), /^Error: Health endpoint returned invalid JSON\.$/);
  await assert.rejects(run(json(null)), /Application status/);
  await assert.rejects(run(new Response('{}', { headers: { 'Content-Length': '4097' } })), /size limit/);
  await assert.rejects(run(new Response('x'.repeat(4097))), /size limit/);
});

test('unreachable endpoints fail once and redact transport error details', async () => {
  let calls = 0;
  await assert.rejects(checkHealth(host, { fetchImpl: async () => {
    calls++;
    throw new Error('private network details');
  } }), /^Error: Health endpoint could not be reached or read\.$/);
  assert.equal(calls, 1);
});

test('the deadline aborts a request without retries', async () => {
  await assert.rejects(checkHealth(host, {
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise<Response>((_resolve, reject) => {
      const signal = options?.signal;
      assert.ok(signal);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  }), /^Error: Health request timed out\.$/);
});

test('the deadline also bounds a response body that never finishes', async () => {
  await assert.rejects(checkHealth(host, {
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Response(new ReadableStream({
      start(controller) {
        const signal = options?.signal;
        assert.ok(signal);
        controller.enqueue(new TextEncoder().encode('{'));
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      },
    })),
  }), /^Error: Health request timed out\.$/);
});

test('only literal hostnames or canonical IPv4 addresses are accepted before any network request', async () => {
  for (const invalid of [undefined, '', 'localhost', 'https://hotel.example.com', 'hotel.example.com/path',
    'hotel.example.com:443', 'user@hotel.example.com', 'hotel.example.com?token=secret',
    'hotel..example.com', '-hotel.example.com', 'hotel-.example.com', 'hotel.example.com\n',
    'HOTEL.example.com', '127.1', '999.1.1.1', `${'a'.repeat(64)}.example.com`]) {
    await assert.rejects(checkHealth(invalid, {
      fetchImpl: async () => assert.fail('invalid host reached network'),
    }), /HEALTH_HOST must be a plain/);
  }
  await checkHealth('192.0.2.1', { fetchImpl: async () => json({ status: 'ok', provider: { available: true } }) });
});

test('the command exits nonzero for invalid configuration without echoing its value', () => {
  const result = spawnSync(process.execPath, [new URL('./check-health.mts', import.meta.url).pathname], {
    env: { ...process.env, HEALTH_HOST: 'https://private.example.com?token=secret' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HEALTH_HOST must be a plain/);
  assert.doesNotMatch(result.stderr, /private|secret/);
});


test('three consecutive unexpected search failures fail health without changing process availability', async () => {
  for (const count of [0, 1, 2]) {
    await run(json({ status: 'ok', provider: { available: true, search: { consecutiveUnexpectedFailures: count } } }));
  }
  for (const count of [3, 4]) {
    await assert.rejects(run(json({ status: 'ok', provider: { available: true,
      search: { consecutiveUnexpectedFailures: count } } })), /Three consecutive unexpected searches failed/);
  }
});
