import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { futureContext, listingRows } from './provider/test-helpers.js';
import { createClientLimiter } from './admission.js';
import { createProviderService } from './provider/service.js';
import { createMemoryStateStore } from './provider/state.js';
import { ServiceError } from './provider/errors.js';

function controlledService({ admit = false } = {}) {
  const calls = [];
  const waiters = [];
  const hold = (input, { admitUpstream } = {}) => new Promise(resolve => {
    if (admit) admitUpstream();
    calls.push({ resolve });
    for (const waiter of waiters) if (calls.length >= waiter.count) waiter.resolve();
  });
  return { calls, service: { search: hold, detail: hold, status: async () => ({ available: true }) },
    waitForCalls(count) { return calls.length >= count ? Promise.resolve() : new Promise(resolve => waiters.push({ count, resolve })); },
    release(index, result = { offers: [] }) { calls[index].resolve(result); },
    releaseAll() { for (const call of calls) call.resolve({ offers: [] }); },
  };
}

async function serve(t, controlled, options = {}) {
  const app = createApp({ logger: null, service: controlled.service, ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    controlled.releaseAll();
    return new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  });
  return {
    start(route = '/api/v1/hotelDeals', { method = 'POST', rawBody, body, partial = false, headers = {} } = {}) {
      const payload = rawBody ?? JSON.stringify(body ?? (route.toLowerCase().includes('/deal') && !route.toLowerCase().includes('hoteldeals')
        ? { ...futureContext, offerId: 'offer-1', hotelId: 'hotel-1' } : futureContext));
      let request;
      const response = new Promise(resolve => {
        request = http.request({ hostname: '127.0.0.1', port: server.address().port, path: route, method,
          headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers },
        }, res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            resolve({ status: res.statusCode, headers: res.headers, text,
              body: res.headers['content-type']?.includes('application/json') ? JSON.parse(text) : null });
          });
        });
        request.on('error', error => resolve({ error: error.code }));
        if (partial) { request.flushHeaders(); request.write(payload.slice(0, 1)); }
        else request.end(method === 'POST' ? payload : undefined);
      });
      return { request, response };
    },
  };
}

function assertBusy(response) {
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'PROVIDER_BUSY');
  assert.equal(response.body.error.message, 'Hotel comparison is busy. Please try again shortly.');
  assert.equal(response.body.error.requestId, response.headers['x-request-id']);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['retry-after'], undefined);
}

const caddyHeaders = client => ({ 'X-Hotel-Revealer-Client-IP': `203.0.113.${client}` });

test('completed timeout responses retain capacity until their owned shared work settles', { timeout: 5000 }, async t => {
  const releases = [];
  const service = {
    async search(input, { holdWork }) {
      holdWork(new Promise(resolve => releases.push(resolve)));
      throw new ServiceError('DEADLINE_EXCEEDED');
    },
  };
  const app = await serve(t, { service, releaseAll() { releases.forEach(resolve => resolve()); } });
  for (let index = 0; index < 4; index += 1) assert.equal((await app.start().response).status, 504);
  assertBusy(await app.start().response);
  releases[0]();
  assert.equal((await app.start().response).status, 504);
  assert.equal(releases.length, 5);
  assertBusy(await app.start().response);
});

test('one client can hold four shared/cache-like operations while another can use the other four global slots', { timeout: 5000 }, async t => {
  const controlled = controlledService();
  const app = await serve(t, controlled, { clientIdentity: 'caddy' });
  const held = Array.from({ length: 4 }, (_, index) => app.start(index % 2 ? '/api/v1/deal' : '/api/v1/hotelDeals', { headers: caddyHeaders(1) }));
  await controlled.waitForCalls(4);
  for (const route of ['/api/v1/hotelDeals', '/api/v1/deal', '/API/V1/HOTELDEALS/?same=1']) {
    assertBusy(await app.start(route, { headers: caddyHeaders(1) }).response);
  }
  held.push(...Array.from({ length: 4 }, () => app.start('/api/v1/hotelDeals', { headers: caddyHeaders(2) })));
  await controlled.waitForCalls(8);
  for (const route of ['/api/v1/hotelDeals', '/api/v1/deal', '/API/V1/HOTELDEALS/?same=1']) {
    assertBusy(await app.start(route).response);
  }
  assert.equal(controlled.calls.length, 8);
  const health = await app.start('/health', { method: 'GET' }).response;
  assert.equal(health.status, 200);
  assert.equal(health.body.provider.available, true);
  assert.equal((await app.start('/api/v1/destinations?q=Paris', { method: 'GET' }).response).status, 200);
  assert.equal((await app.start('/api/v1/unknown', { method: 'POST' }).response).status, 404);
  controlled.releaseAll();
  assert.ok((await Promise.all(held.map(item => item.response))).every(response => response.status === 200));
});

test('spoofed headers cannot evade four socket-client slots and disconnected work stays counted until it settles', { timeout: 5000 }, async t => {
  const controlled = controlledService();
  const app = await serve(t, controlled);
  const held = Array.from({ length: 4 }, (_, index) => app.start('/api/v1/hotelDeals', { headers: {
    ...caddyHeaders(index + 1), 'X-Forwarded-For': `192.0.2.${index + 1}`, 'Forwarded': `for=198.51.100.${index + 1}`,
  } }));
  await controlled.waitForCalls(4);
  assertBusy(await app.start('/api/v1/deal', { headers: caddyHeaders(5) }).response);
  held[0].request.destroy();
  await held[0].response;
  await app.start('/health', { method: 'GET' }).response;
  assertBusy(await app.start().response);
  assert.equal(controlled.calls.length, 4);
  let serializations = 0;
  controlled.release(0, { toJSON() { serializations += 1; return { offers: [] }; } });
  await app.start('/health', { method: 'GET' }).response;
  assert.equal(serializations, 0);
  const replacement = app.start();
  await controlled.waitForCalls(5);
  assertBusy(await app.start().response);
  controlled.release(1);
  assert.equal((await held[1].response).status, 200);
  const afterFinish = app.start();
  await controlled.waitForCalls(6);
  assertBusy(await app.start().response);
  controlled.releaseAll();
  assert.ok((await Promise.all([...held.slice(2), replacement, afterFinish].map(item => item.response)))
    .every(response => response.status === 200));
});

function assertClientBusy(response, retryAt) {
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'PROVIDER_BUSY');
  assert.equal(typeof response.body.error.retryAt, 'string');
  assert.equal(response.body.error.retryAt, new Date(retryAt).toISOString());
  assert.equal(response.headers['retry-after'], new Date(retryAt).toUTCString());
}

test('socket identity ignores spoofed forwarding headers and refills one upstream admission per ten seconds', { timeout: 5000 }, async t => {
  let now = 1_800_000_000_000;
  const controlled = controlledService({ admit: true });
  const app = await serve(t, controlled, { admissionNow: () => now });
  for (let index = 0; index < 4; index += 1) {
    const request = app.start('/api/v1/hotelDeals', { headers: {
      'X-Forwarded-For': `192.0.2.${index + 1}`, 'X-Hotel-Revealer-Client-IP': `198.51.100.${index + 1}`,
    } });
    await controlled.waitForCalls(index + 1);
    controlled.release(index);
    assert.equal((await request.response).status, 200);
  }
  assertClientBusy(await app.start('/api/v1/deal', { headers: {
    'Forwarded': 'for=203.0.113.4', 'X-Forwarded-For': '203.0.113.4', 'X-Real-IP': '203.0.113.4',
    'X-Hotel-Revealer-Client-IP': '203.0.113.4',
  } }).response, now + 10_000);
  now += 9999;
  assertClientBusy(await app.start().response, now + 1);
  now += 1;
  const refilled = app.start('/api/v1/deal');
  await controlled.waitForCalls(5);
  controlled.release(4);
  assert.equal((await refilled.response).status, 200);
  assertClientBusy(await app.start().response, now + 10_000);
});

test('explicit Caddy boundary canonicalizes literal IPs and one exhausted client leaves capacity for another', { timeout: 5000 }, async t => {
  const now = 1_800_000_000_000;
  const controlled = controlledService({ admit: true });
  const app = await serve(t, controlled, { clientIdentity: 'caddy', admissionNow: () => now });
  const start = ip => app.start('/api/v1/hotelDeals', { headers: {
    'X-Hotel-Revealer-Client-IP': ip, 'X-Forwarded-For': '203.0.113.99',
  } });
  const sameClient = ['2001:db8::1', '2001:0DB8:0:0:0:0:0:1', '2001:db8:0000::1', '2001:DB8:0:0::1'].map(start);
  await controlled.waitForCalls(4);
  controlled.releaseAll();
  assert.ok((await Promise.all(sameClient.map(request => request.response))).every(response => response.status === 200));
  for (let index = 0; index < 10; index += 1) assertClientBusy(await start('2001:DB8::1').response, now + 10_000);
  const otherClient = start('2001:db8::2');
  await controlled.waitForCalls(5);
  controlled.releaseAll();
  assert.equal((await otherClient.response).status, 200);

  // Invalid/missing trusted headers all fall back to the same socket identity;
  // IPv4-mapped IPv6 is also canonicalized to that IPv4 identity.
  for (const ip of ['127.0.0.1', '::ffff:127.0.0.1', '::FFFF:7f00:1', '0:0:0:0:0:ffff:7f00:0001']) {
    const request = start(ip);
    await controlled.waitForCalls(controlled.calls.length + 1);
    controlled.releaseAll();
    assert.equal((await request.response).status, 200);
  }
  for (const ip of ['not-an-ip', '2001:db8::3%zone', '203.0.113.4, 203.0.113.5', '[2001:db8::3]', ['203.0.113.4', '203.0.113.5']]) {
    assertClientBusy(await start(ip).response, now + 10_000);
  }
  assertClientBusy(await app.start().response, now + 10_000);
});

test('bounded identity table never evicts active quotas and expired identities safely regain their full allowance', () => {
  let now = 1_800_000_000_000;
  const admit = createClientLimiter({ now: () => now });
  const exhaust = key => { for (let index = 0; index < 4; index += 1) admit(key); };
  for (let index = 0; index < 1000; index += 1) exhaust(`client-${index}`);
  for (let index = 1000; index < 1050; index += 1) {
    assert.throws(() => admit(`client-${index}`), error => error.code === 'PROVIDER_BUSY' && error.retryAt === new Date(now + 40_000).toISOString());
  }
  assert.throws(() => admit('client-0'), error => error.code === 'PROVIDER_BUSY' && error.retryAt === new Date(now + 10_000).toISOString());
  now += 10_000;
  admit('client-0');
  assert.throws(() => admit('new-client'), error => error.code === 'PROVIDER_BUSY' && error.retryAt === new Date(now + 30_000).toISOString());
  now += 30_000;
  exhaust('new-client');
  exhaust('client-999');
  admit('client-0');
  admit('client-0');
  admit('client-0');
  assert.throws(() => admit('client-0'), error => error.code === 'PROVIDER_BUSY' && error.retryAt === new Date(now + 10_000).toISOString());
});

test('assembled HTTP and provider service charge shared work once and keep cached search/detail available at quota', { timeout: 10_000 }, async t => {
  const now = Date.now();
  let calls = 0;
  let releaseSearch;
  let searchStarted;
  const started = new Promise(resolve => { searchStarted = resolve; });
  const held = new Promise(resolve => { releaseSearch = resolve; });
  const service = createProviderService({ logger: null, stateStore: createMemoryStateStore(), adapter: {
    async listingsPage() {
      calls += 1;
      if (calls === 1) { searchStarted(); await held; }
      return { listings: listingRows(), nextCursor: null };
    },
    async hotelDetails() {
      calls += 1;
      return { description: 'Hotel information', images: [], amenities: [], address: null, retailQuote: null };
    },
  } });
  const app = await serve(t, { service, releaseAll() { releaseSearch(); service.close(); } }, { clientIdentity: 'caddy', admissionNow: () => now });
  const start = (route, options = {}) => app.start(route, { ...options, headers: caddyHeaders(1) });
  const coalesced = Array.from({ length: 4 }, () => start());
  await started;
  await app.start('/health', { method: 'GET' }).response;
  assertBusy(await start().response);
  coalesced.push(...Array.from({ length: 4 }, () => app.start('/api/v1/hotelDeals', { headers: caddyHeaders(2) })));
  await app.start('/health', { method: 'GET' }).response;
  releaseSearch();
  assert.ok((await Promise.all(coalesced.map(request => request.response))).every(response => response.status === 200));
  assert.equal(calls, 1);
  assert.equal((await start('/api/v1/deal').response).status, 200);
  assert.equal((await start('/api/v1/hotelDeals', { body: { ...futureContext, rooms: 2 } }).response).status, 200);
  assert.equal((await start('/api/v1/hotelDeals', { body: { ...futureContext, adults: 3 } }).response).status, 200);
  assert.equal(calls, 4);
  assertClientBusy(await start('/api/v1/hotelDeals', { body: { ...futureContext, adults: 4 } }).response, now + 10_000);
  assert.equal((await start().response).status, 200);
  assert.equal((await start('/api/v1/deal').response).status, 200);
  assert.equal(calls, 4);
});

test('an aborted body releases admission before service dispatch and admitted JSON limits still apply', { timeout: 5000 }, async t => {
  const controlled = controlledService();
  const app = await serve(t, controlled);
  const partial = Array.from({ length: 4 }, () => app.start('/api/v1/hotelDeals', { partial: true }));
  // A completed health request lets the server process the preceding headers.
  await app.start('/health', { method: 'GET' }).response;
  assertBusy(await app.start().response);
  assert.equal(controlled.calls.length, 0);
  for (const item of partial) item.request.destroy();
  await Promise.all(partial.map(item => item.response));
  await app.start('/health', { method: 'GET' }).response;
  for (let index = 0; index < 10; index += 1) {
    const malformed = await app.start('/api/v1/hotelDeals', { rawBody: '{bad' }).response;
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'INVALID_REQUEST');
  }
  const oversized = await app.start('/api/v1/hotelDeals', { body: { value: 'x'.repeat(17000) } }).response;
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error.code, 'REQUEST_TOO_LARGE');
  const accepted = app.start();
  await controlled.waitForCalls(1);
  controlled.releaseAll();
  assert.equal((await accepted.response).status, 200);
});

test('app factories have independent admission counters and static content stays available', { timeout: 5000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hotel-admission-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'assets'));
  await writeFile(path.join(directory, 'assets', 'capacity.txt'), 'static response');
  const first = controlledService();
  const second = controlledService();
  const previous = process.env.NODE_ENV;
  let appA;
  try {
    process.env.NODE_ENV = 'production';
    appA = await serve(t, first, { frontendDirectory: directory, clientIdentity: 'caddy' });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
  const appB = await serve(t, second, { clientIdentity: 'caddy' });
  const heldA = Array.from({ length: 8 }, (_, index) => appA.start('/api/v1/hotelDeals', { headers: caddyHeaders(index < 4 ? 1 : 2) }));
  const heldB = Array.from({ length: 8 }, (_, index) => appB.start('/api/v1/hotelDeals', { headers: caddyHeaders(index < 4 ? 1 : 2) }));
  await Promise.all([first.waitForCalls(8), second.waitForCalls(8)]);
  assertBusy(await appA.start().response);
  assertBusy(await appB.start().response);
  const asset = await appA.start('/assets/capacity.txt', { method: 'GET' }).response;
  assert.equal(asset.status, 200);
  assert.equal(asset.text, 'static response');
  first.releaseAll();
  second.releaseAll();
  await Promise.all([...heldA, ...heldB].map(item => item.response));
});
