import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from './app.ts';
import { createUsageLimiter, createUsageStore, parseUsageEvent } from './usage.ts';
import type { UsageEvent } from '../shared/usage.ts';

const event = (overrides: Partial<UsageEvent> = {}): UsageEvent => ({ version: 1, eventId: randomUUID(), browserId: randomUUID(), sessionId: randomUUID(),
  action: 'page_view', page: 'home', device: 'desktop', source: 'direct', traffic: 'browser', ...overrides });

async function serve(t: TestContext, options: Parameters<typeof createApp>[0] = {}) {
  const logs: unknown[] = [];
  const server = createApp({ logger: { info: value => { logs.push(value); }, error: value => { logs.push(value); } },
    service: { search: async () => assert.fail('Unexpected provider search'), detail: async () => assert.fail('Unexpected provider details') }, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const host = `127.0.0.1:${address.port}`;
  return { logs, host, request(body: unknown = event(), headers: http.OutgoingHttpHeaders = {}, route = '/api/v1/usage', raw?: string) {
    return new Promise<{ status: number | undefined; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: address.port, method: route === '/health' ? 'GET' : 'POST', path: route,
        headers: { Origin: `http://${host}`, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', ...headers } }, res => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      });
      req.on('error', reject);
      req.end(route === '/health' ? undefined : raw ?? JSON.stringify(body));
    });
  } };
}

async function directory(t: TestContext) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hotel-usage-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('usage schema permits only categorical fields, v4 UUID identifiers and action-specific outcomes', () => {
  const valid = event({ eventId: randomUUID().toUpperCase(), action: 'search_succeeded', coverage: 'partial', resultCount: 0 });
  assert.equal(parseUsageEvent(valid)?.eventId, valid.eventId.toLowerCase());
  assert.ok(parseUsageEvent(event({ action: 'search_succeeded', resultCount: 5000 })));
  assert.ok(parseUsageEvent(event({ action: 'detail_succeeded', detailStatus: 'available', quoteStatus: 'unavailable' })));
  assert.ok(parseUsageEvent(event({ action: 'detail_succeeded', detailStatus: 'not_requested' })));
  assert.ok(parseUsageEvent(event({ action: 'internal_marked', traffic: 'internal' })));
  for (const body of [null, [], 'page_view', {}, { ...valid, version: 2 }, { ...valid, timestamp: '2026-09-12' },
    { ...valid, url: 'https://private.example' }, { ...valid, ip: '192.0.2.1' }, { ...valid, userAgent: 'Browser' },
    { ...valid, searchText: 'private trip' }, { ...valid, eventId: 'arbitrary text' },
    { ...valid, eventId: '11111111-1111-1111-8111-111111111111' }, { ...valid, traffic: 'real_user' },
    { ...valid, resultCount: -1 }, { ...valid, resultCount: 5001 }, { ...valid, resultCount: 1.5 },
    { ...valid, resultCount: '1' }, { ...valid, coverage: 'unknown' }, { ...valid, quoteStatus: 'available' },
    event({ coverage: 'complete' }), event({ resultCount: 1 }), event({ detailStatus: 'available' }),
    { ...event({ action: 'detail_succeeded' }), quoteStatus: 'not_requested' },
    event({ action: 'internal_marked', traffic: 'browser' }), event({ action: 'internal_marked', traffic: 'automated' }),
    event({ action: 'internal_marked', traffic: 'internal', coverage: 'complete' }),
    event({ action: 'internal_marked', traffic: 'internal', resultCount: 0 }),
    event({ action: 'internal_marked', traffic: 'internal', detailStatus: 'available' }),
    event({ action: 'internal_marked', traffic: 'internal', quoteStatus: 'available' }),
  ]) assert.equal(parseUsageEvent(body), null, JSON.stringify(body));
});

test('ingestion checks origin, privacy headers, media type and body bounds before storing', async t => {
  const records: UsageEvent[] = [];
  const app = await serve(t, { usageStore: { append: async value => { records.push(value); return true; } } });
  assert.equal((await app.request()).status, 204);
  assert.equal((await app.request(event(), { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await app.request(event(), { Origin: '' })).status, 403);
  assert.equal((await app.request(event(), { Origin: 'null' })).status, 403);
  assert.equal((await app.request(event(), { 'Sec-Fetch-Site': 'same-site' })).status, 403);
  assert.equal((await app.request(event(), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await app.request(event(), { DNT: '1' })).status, 204);
  assert.equal((await app.request(event(), { 'Sec-GPC': '1' })).status, 204);
  assert.equal((await app.request(event(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await app.request(event(), { 'Content-Encoding': 'gzip' })).status, 415);
  assert.equal((await app.request(null, {}, undefined, '{bad')).status, 400);
  assert.equal((await app.request({ ...event(), url: 'private text' })).status, 400);
  assert.equal((await app.request(null, {}, undefined, JSON.stringify({ privateText: 'x'.repeat(2100) }))).status, 413);
  assert.equal(records.length, 1);
  assert.equal(JSON.stringify(app.logs).includes('private text'), false);
  assert.equal(JSON.stringify(app.logs).includes('attacker.example'), false);
  assert.ok(app.logs.some(value => typeof value === 'object' && value && 'route' in value && value.route === '/api/v1/usage'));
});

test('traffic classification preserves internal testing and treats automated/browser reports as heuristics', async t => {
  const records: UsageEvent[] = [];
  const app = await serve(t, { usageStore: { append: async value => { records.push(value); return true; } } });
  await app.request(event(), { 'User-Agent': 'Mozilla HeadlessChrome private-UA', 'X-Forwarded-For': '192.0.2.55' });
  await app.request(event({ traffic: 'internal' }), { 'User-Agent': 'playwright private-UA' });
  await app.request(event({ traffic: 'automated' }), { 'User-Agent': 'Mozilla/5.0' });
  await app.request(event(), { 'User-Agent': 'Mozilla/5.0' });
  assert.deepEqual(records.map(record => record.traffic), ['automated', 'internal', 'automated', 'browser']);
  assert.equal(JSON.stringify(records).includes('private-UA'), false);
  assert.equal(JSON.stringify(records).includes('192.0.2.55'), false);
  assert.equal(JSON.stringify(app.logs).includes('private-UA'), false);
});

test('usage quotas bound global work and client memory, refill and stay independent of application health', async t => {
  let now = 0;
  const allow = createUsageLimiter({ now: () => now, clientBurst: 2, globalBurst: 6, maxClients: 2 });
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false);
  assert.equal(allow('b'), true);
  assert.equal(allow('c'), false);
  assert.equal(allow('b'), true);
  assert.equal(allow('new'), false);
  now = 60_000;
  assert.equal(allow('c'), true);
  const app = await serve(t, { usageNow: () => now, usageStore: { append: async () => true } });
  for (let index = 0; index < 60; index++) assert.equal((await app.request()).status, 204);
  const limited = await app.request();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '60');
  assert.equal((await app.request({}, {}, '/health')).status, 200);
});

test('unavailable and throwing collectors do not fail application health or leak their error', async t => {
  for (const usageStore of [undefined, { append: async () => false }, { append: async () => { throw new Error('secret disk path'); } }]) {
    const app = await serve(t, { usageStore });
    assert.equal((await app.request()).status, 503);
    assert.equal((await app.request({}, {}, '/health')).status, 200);
    assert.equal(JSON.stringify(app.logs).includes('secret disk path'), false);
  }
});

test('usage records persist across reopening with server timestamps and collector availability markers', async t => {
  const dir = await directory(t);
  let now = Date.parse('2026-09-12T08:00:00Z');
  const store = createUsageStore({ directory: dir, now: () => now, heartbeatMs: 0, logger: null });
  await store.ready();
  const first = event();
  assert.equal(await store.append(first), true);
  assert.equal(await store.append({ ...first, private: 'never store' } as UsageEvent), false);
  now += 2000;
  await store.close();
  assert.equal(await store.append(event()), false);
  const reopened = createUsageStore({ directory: dir, now: () => now, heartbeatMs: 0, logger: null });
  await reopened.ready();
  assert.equal(await reopened.append(event()), true);
  await reopened.close();
  const file = path.join(dir, 'usage-2026-09-12.jsonl');
  const records = (await readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(records.filter(record => record.eventId).length, 2);
  assert.deepEqual(records[1], { ...first, timestamp: '2026-09-12T08:00:00.000Z' });
  assert.deepEqual(records.filter(record => record.kind).map(record => record.status), ['started', 'stopped', 'started', 'stopped']);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test('retention prunes only old usage files and creates the next UTC day on rollover', async t => {
  const dir = await directory(t);
  const files = ['usage-2026-08-13.jsonl', 'usage-2026-08-14.jsonl', 'provider-state.json', 'usage-not-a-date.jsonl'];
  await Promise.all(files.map(file => writeFile(path.join(dir, file), '')));
  await mkdir(path.join(dir, 'usage-2026-08-01.jsonl'));
  let now = Date.parse('2026-09-12T23:59:59Z');
  const store = createUsageStore({ directory: dir, now: () => now, heartbeatMs: 0, logger: null });
  await store.ready();
  let remaining = await readdir(dir);
  assert.equal(remaining.includes(files[0]), false);
  assert.equal(remaining.includes(files[1]), true);
  assert.equal(remaining.includes(files[2]), true);
  assert.equal(remaining.includes(files[3]), true);
  assert.equal(remaining.includes('usage-2026-08-01.jsonl'), true);
  now += 2000;
  assert.equal(await store.append(event()), true);
  await store.close();
  remaining = await readdir(dir);
  assert.equal(remaining.includes(files[1]), false);
  assert.equal(remaining.includes('usage-2026-09-13.jsonl'), true);
});

test('heartbeats retain availability on UTC rollover even when no browser sends events', async t => {
  const dir = await directory(t);
  let now = Date.parse('2026-09-12T23:59:59Z');
  const store = createUsageStore({ directory: dir, now: () => now, heartbeatMs: 5, logger: null });
  await store.ready();
  now += 2000;
  await new Promise(resolve => setTimeout(resolve, 20));
  await store.close();
  const lines = (await readFile(path.join(dir, 'usage-2026-09-13.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(lines.some(record => record.status === 'heartbeat'));
  assert.equal(lines.at(-1).status, 'stopped');
  assert.ok(lines.every(record => record.kind === 'collector_status'));
});

test('rate-limit loss markers are bounded to one per minute', async t => {
  const dir = await directory(t);
  const store = createUsageStore({ directory: dir, now: () => Date.parse('2026-09-12T08:00:00Z'), heartbeatMs: 0, logger: null });
  await store.ready();
  for (let index = 0; index < 100; index++) store.markLimited?.();
  await store.close();
  const lines = (await readFile(path.join(dir, 'usage-2026-09-12.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.filter(record => record.status === 'limited').length, 1);
});

test('daily cap survives process reopening, reports limited collection and still permits status records', async t => {
  const dir = await directory(t);
  const options = { directory: dir, now: () => Date.parse('2026-09-12T08:00:00Z'), heartbeatMs: 0, logger: null, maxBytes: 2048 };
  const store = createUsageStore(options);
  await store.ready();
  let count = 0;
  while (await store.append(event())) count += 1;
  assert.ok(count > 0 && count < 10);
  await store.close();
  const reopened = createUsageStore(options);
  await reopened.ready();
  assert.equal(await reopened.append(event()), false);
  await reopened.close();
  const file = path.join(dir, 'usage-2026-09-12.jsonl');
  assert.ok((await stat(file)).size <= 2048);
  const records = (await readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(records.some(record => record.status === 'limited'));
});

test('bounded pending writes reject excess work and initialization errors remain isolated', async t => {
  const dir = await directory(t);
  const store = createUsageStore({ directory: dir, heartbeatMs: 0, maxPending: 2, logger: null });
  await store.ready();
  const results = await Promise.all(Array.from({ length: 10 }, () => store.append(event())));
  assert.equal(results.filter(Boolean).length, 2);
  await store.close();
  const persisted = await readFile(path.join(dir, `usage-${new Date().toISOString().slice(0, 10)}.jsonl`), 'utf8');
  assert.match(persisted, /"status":"limited"/);
  const occupied = path.join(dir, 'file');
  await writeFile(occupied, 'occupied');
  const logs: unknown[] = [];
  const broken = createUsageStore({ directory: occupied, heartbeatMs: 0, logger: { error: value => { logs.push(value); } } });
  await broken.ready();
  assert.equal(await broken.append(event()), false);
  await broken.close();
  assert.deepEqual(logs, [{ event: 'usage_collector_error' }]);
});
