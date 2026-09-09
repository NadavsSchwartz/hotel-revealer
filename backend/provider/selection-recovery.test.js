import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createProviderService } from './service.js';
import { createPricelineAdapter } from './priceline.js';
import { createMemoryStateStore } from './state.js';
import { createSelectionStore, SELECTION_TTL } from './selection-store.js';
import { ProviderFailure } from './errors.js';
import { futureContext, listingRows, manualClock, flush } from './test-helpers.js';

const offerId = 'a'.repeat(336);
const selection = { ...futureContext, offerId, hotelId: 'hotel-1' };

async function setup(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hotel-selection-recovery-'));
  const filePath = path.join(directory, 'selection-records.json');
  const clock = manualClock();
  const stateStore = createMemoryStateStore();
  const controls = { discovery: 'initial', link: 'valid', quoteError: null };
  const calls = { listings: 0, details: [] };
  const logs = [];
  const logger = { info: entry => logs.push(entry), error: entry => logs.push(entry) };
  const originalOfferUrl = createPricelineAdapter({ fetchImpl() { throw new Error('No live requests'); } }).originalOfferUrl;
  const adapter = {
    originalOfferUrl,
    async listingsPage({ context }) {
      calls.listings += 1;
      if (controls.discovery === 'empty') return { listings: [], nextCursor: null };
      const rows = listingRows();
      rows[0].pclnId = controls.discovery === 'initial' ? offerId : 'b'.repeat(336);
      for (const row of rows) row.location.cityId = 3000015284;
      rows[0].handoffUrl = controls.link === 'missing' ? null
        : originalOfferUrl({ context, offerId: rows[0].pclnId, cityId: rows[0].location.cityId });
      if (controls.link === 'conflicting') rows.push({ ...rows[0], handoffUrl: 'https://www.priceline.com/different-link' });
      return { listings: rows, nextCursor: null };
    },
    async hotelDetails(input) {
      calls.details.push(input);
      if (controls.quoteError) throw controls.quoteError;
      return { description: 'Previously observed hotel metadata', originalQuote: {
        nightlyCents: 10000, stayCents: 20000, totalCents: 24000, currency: input.context.currency,
        taxesFees: 'excluded', totalTaxesFees: 'included', roomCount: input.context.rooms,
        nightlyBasis: 'per-room', stayBasis: 'all-rooms',
      } };
    },
  };
  const services = [];
  function start(selectionStore = createSelectionStore({ filePath, clock, logger })) {
    const service = createProviderService({ adapter, clock, stateStore, selectionStore, logger });
    services.push(service);
    return service;
  }
  t.after(async () => {
    await Promise.all(services.map(service => service.close()));
    await rm(directory, { recursive: true, force: true });
  });
  return { start, filePath, clock, controls, calls, logs };
}

test('restart recovery keeps original pricing and handoff after price expiry without repeating changed discovery', async t => {
  const { start, filePath, clock, controls, calls } = await setup(t);
  const first = start();
  const search = await first.search(futureContext);
  const saved = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(Object.keys(saved.records[0]).sort(), ['cityId', 'expiresAt', 'hash']);
  assert.equal(saved.records[0].cityId, '3000015284');
  assert.equal(JSON.stringify(saved).includes(offerId), false);
  assert.equal(JSON.stringify(saved).includes(futureContext.checkIn), false);
  await clock.advance(301000);
  await first.close();
  controls.discovery = 'rotated';
  const recovered = await start().detail(selection);
  assert.equal(calls.listings, 1);
  assert.equal(calls.details[0].hotelId, undefined);
  assert.equal(recovered.offer.offerId, offerId);
  assert.equal(recovered.offer.handoffUrl, search.offers[0].handoffUrl);
  assert.equal(recovered.offer.quote.totalCents, 24000);
  assert.equal(recovered.quoteStatus, 'available');
  assert.equal(recovered.candidate, null);
  assert.equal(recovered.details, null);
  assert.equal(recovered.detailStatus, 'unavailable');
  assert.equal(recovered.offer.resolution.reason, 'missing_facts');
  assert.equal(recovered.offerExpiresAt, search.expiresAt);
  assert.ok(Date.parse(recovered.offer.quoteExpiresAt) > clock.now());
});

test('restart recovery preserves the original handoff when pricing fails without inventing a hotel or price', async t => {
  const { start, controls, calls } = await setup(t);
  const first = start();
  const search = await first.search(futureContext);
  await first.close();
  controls.discovery = 'rotated';
  controls.quoteError = new ProviderFailure('unavailable');
  const recovered = await start().detail(selection);
  assert.equal(calls.listings, 1);
  assert.equal(recovered.offer.handoffUrl, search.offers[0].handoffUrl);
  assert.equal(recovered.quoteStatus, 'unavailable');
  assert.equal(recovered.offer.quote.nightlyCents, null);
  assert.equal(recovered.candidate, null);
  assert.deepEqual(recovered.refreshError, { code: 'PROVIDER_UNAVAILABLE' });
});

test('missing or conflicting issued links still authorize original pricing without reconstructing a link', async t => {
  for (const link of ['missing', 'conflicting']) {
    const { start, filePath, controls, calls } = await setup(t);
    controls.link = link;
    const first = start();
    await first.search(futureContext);
    assert.equal(JSON.parse(await readFile(filePath, 'utf8')).records[0].cityId, null);
    await first.close();
    const recovered = await start().detail(selection);
    assert.equal(recovered.quoteStatus, 'available');
    assert.equal(recovered.offer.handoffUrl, null);
    assert.equal(calls.listings, 1);
  }
});

test('recovery authorization binds the full trip and expires independently of refreshed prices', async t => {
  const { start, clock, controls, calls, filePath } = await setup(t);
  const first = start();
  await first.search(futureContext);
  const expiresAt = JSON.parse(await readFile(filePath, 'utf8')).records[0].expiresAt;
  await first.close();
  controls.discovery = 'empty';
  const recovered = start();
  for (const changed of [{ currency: 'EUR' }, { childrenAges: [7] }, { offerId: 'b'.repeat(336) }]) {
    const invalid = assert.rejects(recovered.detail({ ...selection, ...changed }), { code: 'SELECTION_UNAVAILABLE' });
    await clock.advance(1000);
    await invalid;
  }
  assert.equal(calls.details.length, 0);
  const quote = recovered.detail(selection);
  await clock.advance(1000);
  assert.equal((await quote).quoteStatus, 'available');
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).records[0].expiresAt, expiresAt);
  await clock.advance(SELECTION_TTL);
  await assert.rejects(recovered.detail(selection), { code: 'SELECTION_UNAVAILABLE' });
  assert.equal(calls.details.length, 1);
});

test('recovery cache failures preserve live results and never disable the provider', async t => {
  const { start, clock, logs } = await setup(t);
  const broken = {
    async get() { throw new Error('private recovery read'); },
    async remember() { throw new Error('private recovery write'); },
    close() {},
  };
  const service = start(broken);
  const request = service.detail(selection);
  await clock.advance(1000);
  const result = await request;
  assert.equal(result.quoteStatus, 'available');
  assert.equal(result.candidate.hotelId, selection.hotelId);
  assert.equal((await service.status()).available, true);
  assert.deepEqual(logs.filter(entry => entry.event === 'selection_recovery_failed').map(entry => entry.operation), ['read', 'write']);
  assert.equal(JSON.stringify(logs).includes('private recovery'), false);
});

test('a slow recovery write cannot overrun the search budget and remains held until it settles', async t => {
  const { start, clock, logs } = await setup(t);
  let finishWrite;
  const writing = new Promise(resolve => { finishWrite = resolve; });
  const service = start({ get() {}, remember() { return writing; }, close() { return writing; } });
  const held = new Set();
  const request = service.search(futureContext, { holdWork: operation => {
    held.add(operation);
    operation.finally(() => held.delete(operation)).catch(() => {});
  } });
  await clock.advance(20000);
  assert.equal((await request).offers.length, 1);
  assert.equal(held.size, 1);
  assert.equal(logs.filter(entry => entry.event === 'selection_recovery_pending').length, 1);
  let closed = false;
  const closing = service.close().then(() => { closed = true; });
  await flush();
  assert.equal(closed, false, 'normal shutdown waits for the pending recovery snapshot');
  finishWrite(true);
  await closing;
  await flush();
  assert.equal(held.size, 0);
});

test('a slow recovery read keeps the detail deadline and ownership without starting discovery afterward', async t => {
  const { start, clock, calls } = await setup(t);
  let finishRead;
  const reading = new Promise(resolve => { finishRead = resolve; });
  const service = start({ get() { return reading; }, remember() {}, close() { return reading; } });
  const held = new Set();
  const request = assert.rejects(service.detail(selection, { holdWork: operation => {
    held.add(operation);
    operation.finally(() => held.delete(operation)).catch(() => {});
  } }), { code: 'DEADLINE_EXCEEDED' });
  await clock.advance(10000);
  await request;
  assert.equal(held.size, 1);
  assert.equal(calls.listings, 0);
  finishRead();
  await flush();
  assert.equal(held.size, 0);
  assert.equal(calls.listings, 0);
});

test('persisted provider blocking still prevents all recovered-offer access after restart', async t => {
  const { start, controls, calls } = await setup(t);
  const first = start();
  await first.search(futureContext);
  await first.close();
  controls.quoteError = new ProviderFailure('challenge');
  const second = start();
  await assert.rejects(second.detail(selection), { code: 'PROVIDER_DISABLED' });
  await second.close();
  const dispatched = calls.details.length;
  await assert.rejects(start().detail(selection), { code: 'PROVIDER_DISABLED' });
  assert.equal(calls.details.length, dispatched);
});
