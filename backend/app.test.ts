import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createApp } from './app.ts';
import { ServiceError } from './provider/errors.ts';
import { futureContext } from './provider/test-helpers.ts';
import { MatchLimitError } from './domain/index.ts';
import { MAX_JSON_BYTES } from './provider/size.ts';
import { isRecord } from './domain/validation.ts';
import type { ApiErrorResponse, Destination } from '../shared/contracts.ts';
import type { ProviderService, RequestOptions } from './provider/service.ts';

type AppOptions = NonNullable<Parameters<typeof createApp>[0]>;
type TestAppOptions = Omit<AppOptions, 'service'> & { service?: Partial<NonNullable<AppOptions['service']>> };
interface RequestInput { method?: string; body?: unknown; rawBody?: string; headers?: http.OutgoingHttpHeaders }
interface HttpResponse<Body> { status: number | undefined; headers: http.IncomingHttpHeaders; text: string; body: Body }
type HealthResponse = { status: string; provider: Awaited<ReturnType<ProviderService['status']>> };
const unusedService = {
  search: async () => assert.fail('unexpected search'),
  detail: async () => assert.fail('unexpected detail'),
};

async function serve(t: TestContext, options: TestAppOptions = {}) {
  const logs: Record<string, unknown>[] = [];
  const record = (entry: unknown) => { assert.ok(isRecord(entry)); logs.push(entry); };
  const { service, ...appOptions } = options;
  const server = createApp({ logger: { info: record, error: record }, ...appOptions,
    ...(service ? { service: { ...unusedService, ...service } } : {}),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return {
    logs,
    request<Body = ApiErrorResponse>(path: string, { method = 'GET', body, rawBody, headers = {} }: RequestInput = {}) {
      return new Promise<HttpResponse<Body>>((resolve, reject) => {
        const data = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
        const req = http.request({ hostname: '127.0.0.1', port: address.port, path, method,
          headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers } }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const body: unknown = res.headers['content-type']?.includes('application/json') ? JSON.parse(text) : null;
            // Each caller's independent assertions establish the expected wire contract.
            resolve({ status: res.statusCode, headers: res.headers, text, body: body as Body });
          });
        });
        req.on('error', reject);
        req.end(data);
      });
    },
  };
}

test('default API health performs no provider calls and both operations fail closed with JSON errors', async (t) => {
  const app = await serve(t);
  const health = await app.request<HealthResponse>('/health');
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.provider.available, false);
  assert.equal(health.body.provider.search.status, 'unknown');
  for (const [route, body] of [
    ['/api/v1/hotelDeals', futureContext],
    ['/api/v1/deal', { ...futureContext, offerId: 'offer-1', hotelId: 'hotel-1' }],
  ] satisfies [string, unknown][]) {
    const response = await app.request(route, { method: 'POST', body });
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(response.body.error.requestId, response.headers['x-request-id']);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
});

test('canonical JSON inputs reach the injected service, legacy feeds and encrypted bodies are rejected', async (t) => {
  const received: unknown[] = [];
  let metadata: RequestOptions | undefined;
  // This transport fixture intentionally returns only the fields whose forwarding is under test.
  // @ts-expect-error Incomplete service output is deliberate; HTTP serialization is tested independently.
  const app = await serve(t, { service: { search: async (context: unknown, options?: RequestOptions) => { metadata = options; received.push(context); return { context, offers: [] }; } } });
  const response = await app.request('/api/v1/hotelDeals', { method: 'POST', body: futureContext });
  assert.equal(response.status, 200);
  assert.deepEqual(received, [{ ...futureContext, destinationId: 'geonames:5506956', cityName: 'Las Vegas, Nevada, United States', rooms: 1, adults: 2, childrenAges: [], currency: 'USD' }]);
  const completion = app.logs.find(entry => entry.event === 'request_completed');
  assert.equal(completion?.route, '/api/v1/hoteldeals');
  assert.equal(completion?.method, 'POST');
  assert.ok(metadata);
  assert.equal(metadata.requestId, response.headers['x-request-id']);
  const invalid = await app.request('/api/v1/hotelDeals', { method: 'POST', body: { hash: 'old encrypted payload' } });
  assert.equal(invalid.status, 400);
  assert.equal(received.length, 1);
  for (const route of ['/api/v1/recent-queries', '/api/v1/recent-deals', '/api/v1/hotelDeals?fixture=true']) {
    const missing = await app.request(route);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');
  }
});

test('destination API serves bounded geographic suggestions without provider calls and rejects malformed queries', async (t) => {
  let calls = 0;
  const app = await serve(t, { service: { search: async () => { calls += 1; assert.fail('destination lookup called provider'); } } });
  const response = await app.request<{ destinations: Destination[] }>('/api/v1/destinations?q=Israel');
  assert.equal(response.status, 200);
  assert.equal(response.body.destinations.length, 8);
  assert.ok(response.body.destinations.every(place => place.countryCode === 'IL'));
  assert.ok(response.body.destinations.some(place => place.id === 'geonames:293397'));
  assert.equal(response.headers['cache-control'], 'public, max-age=300');
  for (const query of ['q=Tel+Aviv&q=Paris', `q=${'x'.repeat(101)}`, 'q=Paris%00', 'q=Paris%C2%85']) {
    const invalid = await app.request(`/api/v1/destinations?${query}`);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'INVALID_DESTINATION_QUERY');
    assert.equal(invalid.body.error.requestId, invalid.headers['x-request-id']);
  }
  const empty = await app.request('/api/v1/destinations?q=x');
  assert.deepEqual(empty.body, { destinations: [] });
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(app.logs).includes('Israel'), false);
});

test('hotel JSON responses preserve UTF-8, escaped text and response headers', async t => {
  const payload = { offers: [{ name: '東京 "Hotel"\n😀', quote: null }] };
  // @ts-expect-error Deliberately incomplete service payload isolates UTF-8 HTTP serialization.
  const app = await serve(t, { service: { search: async () => payload } });
  const response = await app.request('/api/v1/hotelDeals', { method: 'POST', body: futureContext });
  assert.equal(response.status, 200);
  assert.equal(response.text, JSON.stringify(payload));
  assert.deepEqual(response.body, payload);
  assert.ok(response.headers['content-type']);
  assert.match(response.headers['content-type'], /^application\/json; charset=utf-8$/);
  assert.equal(Number(response.headers['content-length']), Buffer.byteLength(response.text));
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('destination scan budget rejects bursts and refills without charging cheap or invalid queries', async t => {
  let now = 0;
  const app = await serve(t, { destinationNow: () => now });
  for (let index = 0; index < 10; index++) assert.equal((await app.request('/api/v1/destinations?q=san')).status, 200);
  const busy = await app.request('/api/v1/destinations?q=san');
  assert.equal(busy.status, 503);
  assert.equal(busy.body.error.code, 'DESTINATIONS_BUSY');
  assert.equal(busy.headers['retry-after'], '1');
  assert.equal(busy.headers['cache-control'], 'no-store');
  assert.equal((await app.request('/api/v1/destinations?q=x')).status, 200);
  assert.equal((await app.request('/api/v1/destinations?q=Israel')).status, 200);
  assert.equal((await app.request('/api/v1/destinations?q=san&q=Paris')).status, 400);
  now += 100;
  assert.equal((await app.request('/api/v1/destinations?q=san')).status, 200);
  assert.equal((await app.request('/api/v1/destinations?q=san')).status, 503);
  now += 5000;
  for (let index = 0; index < 10; index++) assert.equal((await app.request('/api/v1/destinations?q=san')).status, 200);
  assert.equal((await app.request('/api/v1/destinations?q=san')).status, 503);
});

test('invalid dates, unsupported context, unknown fields and malformed/oversized JSON never call service', async (t) => {
  let calls = 0;
  const app = await serve(t, { service: { search: async () => { calls += 1; assert.fail('invalid body called service'); } } });
  for (const body of [null, [], {}, { ...futureContext, checkIn: '2099-02-30' }, { ...futureContext, rooms: 9 }, { ...futureContext, fixture: true }]) {
    const response = await app.request('/api/v1/hotelDeals', { method: 'POST', body });
    assert.equal(response.status, 400);
    assert.ok(response.body.error.requestId);
  }
  const malformed = await app.request('/api/v1/hotelDeals', { method: 'POST', rawBody: '{bad json' });
  assert.equal(malformed.body.error.code, 'INVALID_REQUEST');
  const oversized = await app.request('/api/v1/hotelDeals', { method: 'POST', body: { value: 'a'.repeat(17_000) } });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error.code, 'REQUEST_TOO_LARGE');
  assert.equal(calls, 0);
});

test('unknown service errors and request metadata are not reflected or logged', async (t) => {
  const secret = 'private-upstream-credential';
  const app = await serve(t, { service: { search: async () => { throw new Error(secret); } } });
  const response = await app.request(`/api/v1/hotelDeals?private=${secret}`, { method: 'POST', body: futureContext,
    headers: { 'X-Request-Id': secret, Cookie: `credential=${secret}` } });
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, 'INTERNAL_ERROR');
  assert.equal(response.text.includes(secret), false);
  assert.equal(JSON.stringify(app.logs).includes(secret), false);
  assert.equal(JSON.stringify(app.logs).includes(futureContext.cityName), false);
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.ok(typeof response.headers['content-security-policy'] === 'string');
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  const failure = app.logs.find(entry => entry.event === 'request_failed');
  assert.ok(failure);
  assert.ok(isRecord(failure.diagnostic));
  assert.ok(Array.isArray(failure.diagnostic.locations));
  assert.equal(failure.requestId, response.headers['x-request-id']);
  assert.equal(failure.method, 'POST');
  assert.equal(failure.route, '/api/v1/hoteldeals');
  assert.equal(failure.diagnostic.name, 'Error');
  assert.ok(failure.diagnostic.locations.some((location: unknown) => isRecord(location) && location.file === 'backend/controllers/hotelController.ts'));
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  const completion = app.logs.find(entry => entry.event === 'request_completed');
  assert.equal(completion?.method, 'POST');
  assert.equal(completion?.route, '/api/v1/hoteldeals');
  assert.equal(completion?.status, 500);
  await app.request(`/api/${secret}`);
  assert.equal(app.logs.at(-1)?.route, 'other');
  assert.equal(JSON.stringify(app.logs).includes(secret), false);
});

test('non-Error failures and logging failures cannot hide or change the HTTP 500 response', async t => {
  const app = await serve(t, { service: { search: async () => { throw null; } },
    logger: { info() { throw new Error('logger failed'); }, error() { throw new Error('logger failed'); } } });
  const response = await app.request('/api/v1/hotelDeals', { method: 'POST', body: futureContext });
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, 'INTERNAL_ERROR');
});

test('aborted requests emit one abort record instead of a successful completion', { timeout: 5000 }, async t => {
  const logs: Record<string, unknown>[] = [];
  let started!: () => void;
  let recorded!: () => void;
  let finish!: (value: unknown) => void;
  const dispatched = new Promise<void>(resolve => { started = resolve; });
  const aborted = new Promise<void>(resolve => { recorded = resolve; });
  const work = new Promise<unknown>(resolve => { finish = resolve; });
  const server = createApp({ service: { ...unusedService,
    // @ts-expect-error Deliberately arbitrary output verifies disconnected requests skip serialization.
    search: () => { started(); return work; },
  }, logger: { info: entry => { assert.ok(isRecord(entry)); logs.push(entry); if (entry.event === 'request_aborted') recorded(); } } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  t.after(() => { finish({}); server.closeAllConnections(); server.close(); });
  const req = http.request({ hostname: '127.0.0.1', port: address.port, method: 'POST', path: '/api/v1/hotelDeals',
    headers: { 'Content-Type': 'application/json' } });
  req.on('error', () => {});
  req.end(JSON.stringify(futureContext));
  await dispatched;
  req.destroy();
  await aborted;
  assert.deepEqual(logs.map(entry => entry.event), ['request_aborted']);
  assert.equal(logs[0].status, undefined);
  assert.equal(logs[0].route, '/api/v1/hoteldeals');
  assert.equal(logs[0].method, 'POST');
});

test('cooldown has a controlled retryAt and Retry-After response', async (t) => {
  const retryAt = '2099-01-01T00:00:00.000Z';
  const app = await serve(t, { service: { search: async () => { throw new ServiceError('PROVIDER_COOLDOWN', { retryAt }); } } });
  const response = await app.request('/api/v1/hotelDeals', { method: 'POST', body: futureContext });
  assert.equal(response.status, 429);
  assert.equal(response.body.error.retryAt, retryAt);
  assert.equal(response.headers['retry-after'], new Date(retryAt).toUTCString());
});

test('production fallback never turns unknown API or missing asset routes into HTML', async (t) => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let app: Awaited<ReturnType<typeof serve>>;
  try { app = await serve(t); }
  finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
  for (const route of ['/api/unknown', '/api/v1/unknown', '/assets/does-not-exist.js']) {
    const response = await app.request(route, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'NOT_FOUND');
  }
});

test('comparison-limit and oversized injected results are sanitized into stable 503 responses', async (t) => {
  let oversized = false;
  // @ts-expect-error Oversized arbitrary service output intentionally tests the HTTP byte cap.
  const app = await serve(t, { service: { search: async () => {
    if (oversized) return { description: 'private'.repeat(Math.ceil(MAX_JSON_BYTES / 7)) };
    const error = new MatchLimitError();
    error.message = 'private matching metadata';
    throw error;
  } } });
  for (let i = 0; i < 2; i += 1) {
    const response = await app.request('/api/v1/hotelDeals', { method: 'POST', body: futureContext });
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'RESULT_TOO_LARGE');
    assert.equal(response.body.error.message, 'We could not load all the hotel results for this trip. Please try again.');
    assert.ok(response.body.error.requestId);
    assert.equal(response.text.includes('private'), false);
    oversized = true;
  }
});
