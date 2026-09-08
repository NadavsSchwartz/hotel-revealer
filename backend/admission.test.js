import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { futureContext } from './provider/test-helpers.js';

function controlledService() {
  const calls = [];
  const waiters = [];
  const hold = () => new Promise(resolve => {
    calls.push({ resolve });
    for (const waiter of waiters) if (calls.length >= waiter.count) waiter.resolve();
  });
  return { calls, service: { search: hold, detail: hold, status: async () => ({ available: true }) },
    waitForCalls(count) { return calls.length >= count ? Promise.resolve() : new Promise(resolve => waiters.push({ count, resolve })); },
    release(index) { calls[index].resolve({ offers: [] }); },
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
    start(route = '/api/v1/hotelDeals', { method = 'POST', rawBody, body, partial = false } = {}) {
      const payload = rawBody ?? JSON.stringify(body ?? (route.toLowerCase().includes('/deal') && !route.toLowerCase().includes('hoteldeals')
        ? { ...futureContext, offerId: 'offer-1', hotelId: 'hotel-1' } : futureContext));
      let request;
      const response = new Promise(resolve => {
        request = http.request({ hostname: '127.0.0.1', port: server.address().port, path: route, method,
          headers: method === 'POST' ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
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

test('eight held identical/cache-like operations share one HTTP cap across search and detail', { timeout: 5000 }, async t => {
  const controlled = controlledService();
  const app = await serve(t, controlled);
  const held = Array.from({ length: 8 }, (_, index) => app.start(index % 2 ? '/api/v1/deal' : '/api/v1/hotelDeals'));
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

test('disconnect and normal finish each release exactly one slot, including late service completion', { timeout: 5000 }, async t => {
  const controlled = controlledService();
  const app = await serve(t, controlled);
  const held = Array.from({ length: 8 }, () => app.start());
  await controlled.waitForCalls(8);
  held[0].request.destroy();
  await held[0].response;
  await app.start('/health', { method: 'GET' }).response;
  const replacement = app.start();
  await controlled.waitForCalls(9);
  controlled.release(0);
  assertBusy(await app.start().response);
  controlled.release(1);
  assert.equal((await held[1].response).status, 200);
  const afterFinish = app.start();
  await controlled.waitForCalls(10);
  assertBusy(await app.start().response);
  controlled.releaseAll();
  assert.ok((await Promise.all([...held.slice(2), replacement, afterFinish].map(item => item.response)))
    .every(response => response.status === 200));
});

test('an aborted body releases admission before service dispatch and admitted JSON limits still apply', { timeout: 5000 }, async t => {
  const controlled = controlledService();
  const app = await serve(t, controlled);
  const partial = Array.from({ length: 8 }, () => app.start('/api/v1/hotelDeals', { partial: true }));
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
    appA = await serve(t, first, { frontendDirectory: directory });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
  const appB = await serve(t, second);
  const heldA = Array.from({ length: 8 }, () => appA.start());
  const heldB = Array.from({ length: 8 }, () => appB.start());
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
