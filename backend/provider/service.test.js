import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createProviderService } from './service.js';
import { ProviderFailure, ServiceError } from './errors.js';
import { createMemoryStateStore, createFileStateStore, resetProviderState } from './state.js';
import { futureContext, listingRows, manualClock, flush } from './test-helpers.js';
import { MAX_JSON_BYTES } from './size.js';
import { addCalendarDays } from '../../shared/travel.js';

function setup(overrides = {}) {
  const clock = overrides.clock || manualClock();
  const calls = [];
  const adapter = {
    async listingsPage(request) { calls.push(['search', request]); return { listings: listingRows(), nextCursor: null }; },
    async hotelDetails(request) { calls.push(['detail', request]); return { description: 'Hotel information', images: [], amenities: [], address: null, retailQuote: null }; },
    ...overrides.adapter,
  };
  return { clock, calls, adapter, service: createProviderService({ clock, adapter, stateStore: overrides.stateStore || createMemoryStateStore(), logger: overrides.logger || { info() {} } }) };
}
const selection = { ...futureContext, offerId: 'offer-1', hotelId: 'hotel-1' };
const originalQuote = (changes = {}) => ({
  nightlyCents: 6600, stayCents: 19800, totalCents: 43902, currency: 'USD',
  taxesFees: 'excluded', totalTaxesFees: 'included', roomCount: 1,
  nightlyBasis: 'per-room', stayBasis: 'all-rooms', advertisedDiscount: { percent: 61, source: 'Priceline' },
  ...changes,
});

test('default production service refuses both operations without network or state I/O', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error('Network must not be called'); };
  try {
    const service = createProviderService({ stateStore: { read() { throw new Error('State must not be read'); } }, logger: { info() {} } });
    await assert.rejects(service.search(futureContext), { code: 'PROVIDER_NOT_CONFIGURED', status: 503 });
    await assert.rejects(service.detail(selection), { code: 'PROVIDER_NOT_CONFIGURED', status: 503 });
    assert.deepEqual(await service.status(), { available: false });
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('identical searches coalesce, cache for five minutes, and return independent values', async () => {
  const { service, clock, calls } = setup();
  const [first, second] = await Promise.all([service.search(futureContext), service.search({ ...futureContext })]);
  assert.equal(calls.length, 1);
  assert.equal(first.coverage.status, 'complete');
  assert.equal(first.offers[0].candidates[0].hotelId, 'hotel-1');
  first.offers.length = 0;
  assert.equal(second.offers.length, 1);
  await clock.advance(299_999);
  assert.equal((await service.search(futureContext)).offers.length, 1);
  assert.equal(calls.length, 1);
  await clock.advance(1);
  await service.search(futureContext);
  assert.equal(calls.length, 2);
});

test('search cache and in-flight work bind destination, rooms, adults, and every child age', async () => {
  const { service, clock, calls } = setup();
  const infantTrip = { ...futureContext, childrenAges: [0, 7] };
  const olderTrip = { ...infantTrip, childrenAges: [1, 7] };
  const first = service.search(infantTrip);
  const duplicate = service.search({ ...infantTrip, childrenAges: [0, 7] });
  const changedAge = service.search(olderTrip);
  await clock.advance(1_000);
  const [a, b, c] = await Promise.all([first, duplicate, changedAge]);
  assert.deepEqual(a, b);
  assert.deepEqual(a.context.childrenAges, [0, 7]);
  assert.deepEqual(c.context.childrenAges, [1, 7]);
  assert.equal(calls.length, 2);
  for (const changed of [{ ...infantTrip, rooms: 2 }, { ...infantTrip, adults: 3 }, { ...infantTrip, destinationId: 'geonames:293397' }]) {
    const request = service.search(changed);
    await clock.advance(1_000);
    await request;
  }
  assert.equal(calls.length, 5);
  assert.deepEqual((await service.search(infantTrip)).context.childrenAges, [0, 7]);
  assert.deepEqual((await service.search(olderTrip)).context.childrenAges, [1, 7]);
  assert.equal(calls.length, 5);
});

test('detail cache and in-flight work retain the selected children and age-specific details', async () => {
  const { service, clock, calls } = setup({ adapter: {
    async hotelDetails(request) {
      calls.push(['detail', request]);
      return { description: `Age ${request.context.childrenAges[0]}`, images: [], amenities: [] };
    },
  } });
  const infant = { ...selection, childrenAges: [0] };
  const child = { ...selection, childrenAges: [1] };
  const infantDetail = service.detail(infant);
  const duplicate = service.detail(infant);
  const childDetail = service.detail(child);
  await clock.advance(4_000);
  const [a, b, c] = await Promise.all([infantDetail, duplicate, childDetail]);
  assert.deepEqual(a, b);
  assert.equal(a.details.description, 'Age 0');
  assert.equal(c.details.description, 'Age 1');
  assert.equal(calls.filter(([kind]) => kind === 'search').length, 2);
  assert.equal(calls.filter(([kind]) => kind === 'detail').length, 2);
  assert.equal((await service.detail(infant)).details.description, 'Age 0');
  assert.equal((await service.detail(child)).details.description, 'Age 1');
  assert.equal(calls.length, 4);
});

test('pagination is capped at three pages and valid capped coverage is cached without becoming complete', async () => {
  let count = 0;
  const { service, clock } = setup({ adapter: { async listingsPage() {
    count += 1;
    return { listings: listingRows(), nextCursor: `page-${count}` };
  } } });
  const first = service.search(futureContext);
  await clock.advance(2_000);
  const result = await first;
  assert.equal(count, 3);
  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.coverage.pagesFetched, 3);
  assert.equal(result.offers.length, 1);
  const second = service.search(futureContext);
  const cached = await second;
  assert.equal(cached.coverage.status, 'partial');
  assert.equal(count, 3);
});

test('later page errors preserve successful results, first-page errors do not fabricate empty success', async () => {
  let count = 0;
  const { service, clock } = setup({ adapter: { async listingsPage() {
    count += 1;
    if (count > 1) throw new Error('private upstream token');
    return { listings: listingRows(), nextCursor: 'next' };
  } } });
  const request = service.search(futureContext);
  await clock.advance(1_000);
  const result = await request;
  assert.equal(result.offers.length, 1);
  assert.equal(result.coverage.status, 'partial');
  assert.equal(JSON.stringify(result).includes('private'), false);
  const again = service.search(futureContext);
  const rejection = assert.rejects(again, { code: 'PROVIDER_UNAVAILABLE' });
  await clock.advance(1_000);
  await rejection;
  assert.equal(count, 3);
});

test('a later-page timeout returns partial results at the admission deadline', async () => {
  let count = 0;
  const { service, clock } = setup({ adapter: { async listingsPage({ signal }) {
    count += 1;
    if (count === 1) return { listings: listingRows(), nextCursor: 'next' };
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted'))));
  } } });
  const request = service.search(futureContext);
  const sameRequest = service.search(futureContext);
  await clock.advance(20_000);
  const result = await request;
  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.coverage.pagesFetched, 1);
  assert.equal(count, 2);
  assert.deepEqual(await sameRequest, result);
});

test('details require the current context relationship and missing retail stays independent', async () => {
  const { service, clock, calls } = setup();
  await service.search(futureContext);
  await assert.rejects(service.detail({ ...selection, hotelId: 'wrong-hotel' }), { code: 'INVALID_SELECTION' });
  assert.equal(calls.length, 1);
  const request = service.detail(selection);
  await clock.advance(1_000);
  const result = await request;
  assert.equal(result.detailStatus, 'available');
  assert.equal(result.details.retailQuote, null);
  assert.equal(result.offer.quote.nightlyCents, 10_000);
  await service.detail(selection);
  assert.equal(calls.length, 2);
  await clock.advance(60_000);
  await service.detail(selection);
  assert.equal(calls.length, 3);
});

test('selected-offer total has one-minute freshness and survives detail-cache hits without changing search prices', async () => {
  let totalCents = 43902;
  const { service, clock, calls } = setup({ adapter: { async hotelDetails(request) {
    calls.push(['detail', request]);
    return { description: 'Named hotel information', originalQuote: originalQuote({ totalCents, quoteExpiresAt: '2099-01-01T00:00:00.000Z' }) };
  } } });
  const search = await service.search(futureContext);
  const pending = service.detail(selection);
  await clock.advance(1000);
  const first = await pending;
  assert.deepEqual(first.offer.quote, originalQuote());
  assert.equal(first.offer.quoteExpiresAt, new Date(clock.now() + 60000).toISOString());
  assert.equal(first.offerExpiresAt, search.expiresAt);
  assert.equal(first.expiresAt, first.offer.quoteExpiresAt);
  assert.equal((await service.search(futureContext)).offers[0].quote.nightlyCents, 10000);
  await clock.advance(59000);
  const cached = await service.detail(selection);
  assert.deepEqual(cached.offer.quote, first.offer.quote);
  assert.equal(cached.offer.quoteExpiresAt, first.offer.quoteExpiresAt);
  assert.equal(calls.filter(([type]) => type === 'detail').length, 1);
  totalCents = 44400;
  await clock.advance(1000);
  const refreshed = await service.detail(selection);
  assert.equal(refreshed.offer.quote.totalCents, 44400);
  assert.equal(Date.parse(refreshed.offer.quoteExpiresAt) - clock.now(), 60000);
  assert.equal(calls.filter(([type]) => type === 'detail').length, 2);
});

test('search revalidation updates the relationship while preserving the still-fresh selected-offer quote', async () => {
  let searches = 0;
  const { service, clock, calls } = setup({ adapter: {
    async listingsPage(request) {
      calls.push(['search', request]);
      searches += 1;
      const rows = listingRows();
      if (searches > 1) rows[1].name = 'Updated hotel name';
      return { listings: rows, nextCursor: null };
    },
    async hotelDetails(request) { calls.push(['detail', request]); return { originalQuote: originalQuote() }; },
  } });
  const search = await service.search(futureContext);
  await clock.advance(299000);
  const first = await service.detail(selection);
  assert.equal(first.expiresAt, search.expiresAt);
  assert.equal(Date.parse(first.offer.quoteExpiresAt) - clock.now(), 60000);
  await clock.advance(1001);
  const revalidated = await service.detail(selection);
  assert.equal(revalidated.candidate.name, 'Updated hotel name');
  assert.equal(revalidated.offer.candidates[0].name, 'Updated hotel name');
  assert.deepEqual(revalidated.offer.quote, first.offer.quote);
  assert.equal(revalidated.offer.quoteExpiresAt, first.offer.quoteExpiresAt);
  assert.ok(Date.parse(revalidated.offerExpiresAt) > Date.parse(first.offerExpiresAt));
  assert.equal(calls.filter(([type]) => type === 'detail').length, 1);
});

test('invalid original quote enrichment preserves known listing prices and independent named details', async () => {
  for (const quote of [null, {}, originalQuote({ totalCents: undefined }), originalQuote({ totalCents: 19000 }),
    originalQuote({ totalCents: Number.MAX_SAFE_INTEGER + 1 }), originalQuote({ totalCents: 43902.5 }),
    originalQuote({ currency: 'EUR' }), originalQuote({ roomCount: 2 }), originalQuote({ nightlyCents: null }),
    originalQuote({ taxesFees: 'unknown' }), originalQuote({ totalTaxesFees: 'unknown' }),
    originalQuote({ nightlyBasis: undefined }), originalQuote({ stayBasis: undefined })]) {
    const { service, clock } = setup({ adapter: { async hotelDetails() {
      return { description: 'Named hotel information', originalQuote: quote };
    } } });
    const search = await service.search(futureContext);
    const pending = service.detail(selection);
    await clock.advance(1000);
    const detail = await pending;
    assert.deepEqual(detail.offer.quote, search.offers[0].quote);
    assert.equal(detail.offer.quoteExpiresAt, undefined);
    assert.equal(detail.details.description, 'Named hotel information');
    assert.equal(detail.detailStatus, 'available');
  }
});

test('original total remains independent when named hotel details are unavailable', async () => {
  const { service, clock } = setup({ adapter: { async hotelDetails() {
    return { available: false, originalQuote: originalQuote() };
  } } });
  await service.search(futureContext);
  const pending = service.detail(selection);
  await clock.advance(1000);
  const detail = await pending;
  assert.equal(detail.detailStatus, 'unavailable');
  assert.equal(detail.offer.quote.totalCents, 43902);
  assert.equal(detail.details.retailQuote, null);
  assert.equal(Date.parse(detail.offer.quoteExpiresAt) - clock.now(), 60000);
});

test('details share in-flight search and retain ten-second total budget including revalidation', async () => {
  let resolveSearch;
  let searches = 0;
  let detailCalls = 0;
  const { service, clock } = setup({ adapter: {
    listingsPage: () => { searches += 1; return new Promise((resolve) => { resolveSearch = resolve; }); },
    hotelDetails: ({ signal }) => { detailCalls += 1; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')))); },
  } });
  const search = service.search(futureContext);
  await flush();
  const detail = service.detail(selection);
  await clock.advance(9_000);
  assert.equal(searches, 1);
  resolveSearch({ listings: listingRows(), nextCursor: null });
  await search;
  await clock.advance(1_000);
  const result = await detail;
  assert.equal(result.detailStatus, 'unavailable');
  assert.equal(result.offer.offerId, 'offer-1');
  assert.equal(detailCalls, 1);
});

test('expired search context is revalidated before a detail selection can be used', async () => {
  let hasHotel = true;
  const { service, clock, calls } = setup({ adapter: { async listingsPage(request) {
    calls.push(['search', request]);
    return { listings: hasHotel ? listingRows() : [listingRows()[0]], nextCursor: null };
  } } });
  await service.search(futureContext);
  const detail = service.detail(selection);
  await clock.advance(1_000);
  await detail;
  hasHotel = false;
  await clock.advance(300_000);
  await assert.rejects(service.detail(selection), { code: 'INVALID_SELECTION' });
  assert.equal(calls.filter(([type]) => type === 'detail').length, 1);
});

test('Retry-After cooldown persists and prevents dispatch after restart without retrying', async () => {
  const store = createMemoryStateStore();
  let count = 0;
  const clock = manualClock();
  const first = setup({ clock, stateStore: store, adapter: { async listingsPage() {
    count += 1; throw new ProviderFailure('rate_limit', { retryAfter: '120' });
  } } });
  await assert.rejects(first.service.search(futureContext), { code: 'PROVIDER_COOLDOWN', retryAt: new Date(clock.now() + 120_000).toISOString() });
  const restarted = setup({ clock, stateStore: store });
  await assert.rejects(restarted.service.search(futureContext), { code: 'PROVIDER_COOLDOWN' });
  assert.equal(restarted.calls.length, 0);
  assert.equal(count, 1);
  await clock.advance(120_000);
  await restarted.service.search(futureContext);
  assert.equal(restarted.calls.length, 1);
});

test('challenge persists to disk, survives restart, and only operator reset clears it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hotel-provider-state-'));
  const file = path.join(directory, 'state.json');
  try {
    const store = createFileStateStore(file);
    const initial = setup({ stateStore: store, adapter: { async listingsPage() { throw new ProviderFailure('challenge'); } } });
    await assert.rejects(initial.service.search(futureContext), { code: 'PROVIDER_DISABLED' });
    assert.equal(JSON.parse(await readFile(file, 'utf8')).disabled, true);
    const restarted = setup({ stateStore: createFileStateStore(file) });
    await assert.rejects(restarted.service.search(futureContext), { code: 'PROVIDER_DISABLED' });
    assert.equal(restarted.calls.length, 0);
    await resetProviderState({ stateStore: store });
    await setup({ stateStore: store }).service.search(futureContext);
    await writeFile(file, '{broken json');
    await assert.rejects(setup({ stateStore: store }).service.search(futureContext), { code: 'PROVIDER_DISABLED' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid response, persistence failure, and graceful drain fail closed', async () => {
  const invalid = setup({ adapter: { async listingsPage() { return { listings: { unsupported: true }, nextCursor: null }; } } });
  await assert.rejects(invalid.service.search(futureContext), { code: 'PROVIDER_RESPONSE_INVALID' });
  const failedStore = { read: async () => ({ version: 1, disabled: false, cooldownUntil: 0 }), write: async () => { throw new Error('disk failed'); } };
  const blocked = setup({ stateStore: failedStore, adapter: { async listingsPage() { throw new ProviderFailure('rate_limit'); } } });
  await assert.rejects(blocked.service.search(futureContext), { code: 'PROVIDER_DISABLED' });
  await assert.rejects(blocked.service.search(futureContext), { code: 'PROVIDER_DISABLED' });
  const normal = setup();
  normal.service.drain();
  await assert.rejects(normal.service.search(futureContext), { code: 'SERVICE_DRAINING' });
});

test('failed pre-dispatch persistence never calls the provider, including after restart', async () => {
  const store = createMemoryStateStore();
  const unavailableStore = { read: () => store.read(), write: async () => { throw new Error('Disk full'); } };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { service, calls } = setup({ stateStore: unavailableStore });
    await assert.rejects(service.search(futureContext), { code: 'PROVIDER_DISABLED' });
    assert.equal(calls.length, 0);
  }
});

test('failed outcome persistence leaves a durable block for success, challenge, and rate limit', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hotel-provider-outcome-'));
  try {
    for (const outcome of ['success', 'challenge', 'rate_limit']) {
      const store = createFileStateStore(path.join(directory, `${outcome}.json`));
      await resetProviderState({ stateStore: store });
      let writes = 0;
      let calls = 0;
      const failedStore = { read: () => store.read(), async write(value) {
        writes += 1;
        if (writes > 1) throw new Error('Disk failed after dispatch');
        await store.write(value);
      } };
      const { service } = setup({ stateStore: failedStore, adapter: { async listingsPage() {
        calls += 1;
        assert.equal((await store.read()).disabled, true);
        if (outcome !== 'success') throw new ProviderFailure(outcome, { retryAfter: '120' });
        return { listings: listingRows(), nextCursor: null };
      } } });
      await assert.rejects(service.search(futureContext), { code: 'PROVIDER_DISABLED' });
      await assert.rejects(service.search(futureContext), { code: 'PROVIDER_DISABLED' });
      const restarted = setup({ stateStore: store });
      await assert.rejects(restarted.service.search(futureContext), { code: 'PROVIDER_DISABLED' });
      assert.equal(calls, 1);
      assert.equal(restarted.calls.length, 0);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('process termination inside a provider call leaves restart blocked until operator reset', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hotel-provider-crash-'));
  const file = path.join(directory, 'state.json');
  const store = createFileStateStore(file);
  try {
    await resetProviderState({ stateStore: store });
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { createProviderService } from ${JSON.stringify(new URL('./service.js', import.meta.url).href)};
      import { createFileStateStore } from ${JSON.stringify(new URL('./state.js', import.meta.url).href)};
      import { futureContext } from ${JSON.stringify(new URL('./test-helpers.js', import.meta.url).href)};
      const service = createProviderService({
        stateStore: createFileStateStore(${JSON.stringify(file)}),
        adapter: {
          async listingsPage() { process.kill(process.pid, 'SIGKILL'); },
          async hotelDetails() { throw new Error('Not used'); },
        },
        logger: null,
      });
      await service.search(futureContext);
    `], { encoding: 'utf8', timeout: 5_000 });
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    const restarted = setup({ stateStore: store });
    await assert.rejects(restarted.service.search(futureContext), { code: 'PROVIDER_DISABLED' });
    assert.equal(restarted.calls.length, 0);
    await resetProviderState({ stateStore: store });
    const recovered = setup({ stateStore: store });
    await recovered.service.search(futureContext);
    assert.equal(recovered.calls.length, 1);
    assert.equal((await store.read()).disabled, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('deadline during pre-dispatch persistence restores state without dispatching', async () => {
  const store = createMemoryStateStore();
  let release;
  const { service, clock, calls } = setup({ stateStore: {
    read: () => store.read(),
    async write(value) {
      await store.write(value);
      if (value.disabled) await new Promise((resolve) => { release = resolve; });
    },
  } });
  const rejected = assert.rejects(service.search(futureContext), { code: 'DEADLINE_EXCEEDED' });
  await clock.advance(20_000);
  await rejected;
  assert.equal((await store.read()).disabled, true);
  release();
  await flush();
  assert.equal(calls.length, 0);
  assert.equal((await store.read()).disabled, false);
});

test('adapter validation and size failures keep their controlled error classification', async () => {
  for (const code of ['PROVIDER_RESPONSE_INVALID', 'RESULT_TOO_LARGE']) {
    let calls = 0;
    const { service, clock } = setup({ adapter: { async listingsPage() {
      calls += 1;
      throw new ServiceError(code);
    } } });
    await assert.rejects(service.search(futureContext), { code });
    const rejected = assert.rejects(service.search(futureContext), { code });
    await clock.advance(1_000);
    await rejected;
    assert.equal(calls, 2);
  }
});

test('fresh cached searches survive cooldown, expired searches do not dispatch, and challenges clear cache', async () => {
  let fail;
  let count = 0;
  const { service, clock } = setup({ adapter: { async listingsPage() {
    count += 1;
    if (fail) throw new ProviderFailure(fail, { retryAfter: 600 });
    return { listings: listingRows(), nextCursor: null };
  } } });
  const cached = await service.search(futureContext);
  fail = 'rate_limit';
  const anotherContext = { ...futureContext, checkOut: addCalendarDays(futureContext.checkOut, 1) };
  const limited = service.search(anotherContext);
  const rejected = assert.rejects(limited, { code: 'PROVIDER_COOLDOWN' });
  await clock.advance(1_000);
  await rejected;
  assert.deepEqual(await service.search(futureContext), cached);
  assert.equal(count, 2);
  await clock.advance(300_000);
  await assert.rejects(service.search(futureContext), { code: 'PROVIDER_COOLDOWN' });
  assert.equal(count, 2);
  await clock.advance(300_000);
  fail = null;
  await service.search(futureContext);
  fail = 'challenge';
  const challenge = service.search(anotherContext);
  const challengeRejected = assert.rejects(challenge, { code: 'PROVIDER_DISABLED' });
  await clock.advance(1_000);
  await challengeRejected;
  await assert.rejects(service.search(futureContext), { code: 'PROVIDER_DISABLED' });
});

test('optional detail failures preserve the usable offer, do not cache errors, and coalesce identical work', async () => {
  let count = 0;
  const { service, clock } = setup({ adapter: { async hotelDetails() { count += 1; throw new Error('private details failure'); } } });
  await service.search(futureContext);
  const first = service.detail(selection);
  const second = service.detail(selection);
  await clock.advance(1_000);
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.detailStatus, 'unavailable');
  assert.equal(a.offer.handoffUrl, 'https://www.priceline.com/original-offer');
  assert.deepEqual(a, b);
  assert.deepEqual(a.details, { description: null, images: [], amenities: [], address: null, retailQuote: null });
  assert.equal(count, 1);
  const again = service.detail(selection);
  await clock.advance(1_000);
  await again;
  assert.equal(count, 2);
});

test('detail revalidation timeout has no usable relationship and returns an error within ten seconds', async () => {
  const { service, clock } = setup({ adapter: { listingsPage: ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }) } });
  const result = service.detail(selection);
  const rejected = assert.rejects(result, { code: 'DEADLINE_EXCEEDED' });
  await clock.advance(10_000);
  await rejected;
});

test('summary metrics identify cache reuse and upstream work without input or provider payloads', async () => {
  const logs = [];
  const { service } = setup({ logger: { info: (entry) => logs.push(entry) } });
  await service.search(futureContext);
  await service.search(futureContext);
  assert.equal(logs[0].upstreamCalls, 1);
  assert.equal(logs[0].pagesFetched, 1);
  assert.equal(logs[1].cache, 'hit');
  assert.equal(logs[1].upstreamCalls, 0);
  assert.equal(typeof logs[0].queueDepth, 'number');
  assert.equal(typeof logs[0].durationMs, 'number');
  assert.equal(JSON.stringify(logs).includes(futureContext.cityName), false);
  assert.equal(JSON.stringify(logs).includes('Example Hotel'), false);
});

test('detail envelopes cannot extend offer freshness and cached details are clamped to revalidated search', async () => {
  const { service, clock, calls } = setup();
  const search = await service.search(futureContext);
  await clock.advance(299_000);
  const first = await service.detail(selection);
  assert.equal(first.expiresAt, search.expiresAt);
  assert.equal(first.offerExpiresAt, search.expiresAt);
  assert.equal(Date.parse(first.expiresAt) - clock.now(), 1_000);
  await clock.advance(500);
  const cached = await service.detail(selection);
  assert.equal(cached.expiresAt, search.expiresAt);
  assert.equal(cached.offerExpiresAt, search.expiresAt);
  await clock.advance(501);
  const refreshed = await service.detail(selection);
  assert.equal(refreshed.retrievedAt, first.retrievedAt);
  assert.equal(refreshed.expiresAt, new Date(Date.parse(first.retrievedAt) + 60_000).toISOString());
  assert.equal(calls.filter(([type]) => type === 'search').length, 2);
  assert.equal(calls.filter(([type]) => type === 'detail').length, 1);
});

test('hotel metadata cache expiry does not shorten the original offer freshness', async () => {
  const { service, clock } = setup();
  const search = await service.search(futureContext);
  const request = service.detail(selection);
  await clock.advance(1_000);
  const detail = await request;
  assert.equal(detail.offerExpiresAt, search.expiresAt);
  assert.ok(Date.parse(detail.expiresAt) < Date.parse(detail.offerExpiresAt));
});

test('a later-page challenge rejects the search and persists the block instead of returning earlier offers', async () => {
  let count = 0;
  const stateStore = createMemoryStateStore();
  const { service, clock } = setup({ stateStore, adapter: { async listingsPage() {
    count += 1;
    if (count === 1) return { listings: listingRows(), nextCursor: 'next' };
    throw new ProviderFailure('challenge');
  } } });
  const request = service.search(futureContext);
  const rejected = assert.rejects(request, { code: 'PROVIDER_DISABLED' });
  await clock.advance(1_000);
  await rejected;
  assert.equal(count, 2);
  assert.deepEqual(await service.status(), { available: false });
  assert.equal((await stateStore.read()).disabled, true);
  await assert.rejects(service.search(futureContext), { code: 'PROVIDER_DISABLED' });
  assert.equal(count, 2);
});

test('closing the service during later-page work rejects the search instead of returning partial success', async () => {
  let count = 0;
  const { service, clock } = setup({ adapter: { async listingsPage() {
    count += 1;
    return { listings: listingRows(), nextCursor: 'next' };
  } } });
  const request = service.search(futureContext);
  const rejected = assert.rejects(request, { code: 'SERVICE_DRAINING' });
  await flush();
  assert.equal(count, 1);
  service.close();
  await rejected;
  await clock.advance(1_000);
  assert.equal(count, 1);
});

function comparisonRows(offerCount, hotelCount) {
  const [offer, hotel] = listingRows();
  return [
    ...Array.from({ length: offerCount }, (_, index) => ({ ...offer, pclnId: `offer-${index}` })),
    ...Array.from({ length: hotelCount }, (_, index) => ({ ...hotel, hotelId: `hotel-${index}`, name: 'A'.repeat(200) })),
  ];
}

test('comparison limits return the stable error without caching or truncating candidate results', async () => {
  let calls = 0;
  const { service, clock } = setup({ adapter: { async listingsPage() {
    calls += 1;
    return { listings: comparisonRows(400, 400), nextCursor: null };
  } } });
  await assert.rejects(service.search(futureContext), {
    code: 'RESULT_TOO_LARGE', status: 503,
    message: 'Too many possible comparisons to display safely. Try different dates or another city.',
  });
  const again = service.search(futureContext);
  const rejected = assert.rejects(again, { code: 'RESULT_TOO_LARGE' });
  await clock.advance(1_000);
  await rejected;
  assert.equal(calls, 2);
});

test('public search envelopes above two MiB are rejected even below the comparison and candidate limits', async () => {
  let calls = 0;
  const rows = comparisonRows(70, 70); // 4,900 candidates, below the 5,000-object limit.
  assert.ok(Buffer.byteLength(JSON.stringify(rows)) < MAX_JSON_BYTES);
  const { service, clock } = setup({ adapter: { async listingsPage() {
    calls += 1;
    return { listings: rows, nextCursor: null };
  } } });
  await assert.rejects(service.search(futureContext), { code: 'RESULT_TOO_LARGE' });
  const again = service.search(futureContext);
  const rejected = assert.rejects(again, { code: 'RESULT_TOO_LARGE' });
  await clock.advance(1_000);
  await rejected;
  assert.equal(calls, 2);
});

test('oversized provider metadata and detail descriptions fail before normalization or cache reuse', async () => {
  const oversized = 'private'.repeat(Math.ceil(MAX_JSON_BYTES / 7));
  const listings = setup({ adapter: { async listingsPage() {
    return { listings: listingRows(), nextCursor: null, privateMetadata: oversized };
  } } });
  await assert.rejects(listings.service.search(futureContext), { code: 'RESULT_TOO_LARGE' });
  let count = 0;
  const { service, clock } = setup({ adapter: { async hotelDetails() {
    count += 1;
    return { description: oversized, images: [], amenities: [] };
  } } });
  await service.search(futureContext);
  for (let i = 0; i < 2; i += 1) {
    const result = service.detail(selection);
    const rejected = assert.rejects(result, { code: 'RESULT_TOO_LARGE' });
    await clock.advance(1_000);
    await rejected;
  }
  assert.equal(count, 2);
});
