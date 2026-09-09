import test from 'node:test';
import assert from 'node:assert/strict';
import { contextKey } from './context.ts';
import { detailKey, loadDetail, loadSearch, selectDetailView, selectSearchCooldown, travelerReducer } from './state.ts';
import type { TravelerAction, TravelerState } from './state.ts';
import type { BackoffCode, Candidate, CoverageStatus, DetailResponse, Offer, Quote, SearchResponse, TripContext, UnresolvedReason } from '../../../shared/contracts.ts';

const trip: TripContext = {
  destinationId: 'geonames:5506956', cityName: 'Las Vegas, Nevada',
  checkIn: '2027-01-10', checkOut: '2027-01-12',
  rooms: 1, adults: 2, childrenAges: [], currency: 'USD',
};
const otherTrip = { ...trip, childrenAges: [7] };
const offerId = 'ab'.repeat(168);
const hotelId = 'hotel-1';
const tripKey = contextKey(trip);
const key = detailKey(trip, offerId, hotelId);
const candidate = (id = hotelId, name = 'Known hotel'): Candidate => ({
  hotelId: id, name, neighborhoodName: 'The Strip', stars: 4, guestRating: 8.5,
  reviewCount: 100, amenities: ['Pool'], thumbnailUrl: null,
});
const quote = (): Quote => ({ nightlyCents: 12500, stayCents: 25000, currency: 'USD', taxesFees: 'unknown' });
const matchedOffer = (): Extract<Offer, { resolution: { status: 'matched' } }> => ({
  offerId, neighborhoodName: 'The Strip', stars: 4,
  clues: { guestRating: { kind: 'unknown' }, reviewCount: { kind: 'unknown' }, amenities: null },
  quote: quote(), handoffUrl: null,
  resolution: { status: 'matched' }, candidates: [candidate()],
} satisfies Offer);
const unresolvedOffer = (reason: UnresolvedReason): Offer => ({
  ...matchedOffer(), resolution: { status: 'unresolved', reason }, candidates: [],
});
const shortlist = (context = trip): SearchResponse => ({
  context, retrievedAt: '2027-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:05:00.000Z',
  coverage: { status: 'complete', reason: null, pagesFetched: 1, offersFound: 1, namedHotelsChecked: 1, unassessedHotels: 0 },
  offers: [matchedOffer()],
});

function cacheSearch(state: TravelerState | undefined, context: TripContext, requestId: string | number, data = shortlist(context)) {
  const searchKey = contextKey(context);
  state = travelerReducer(state, { type: 'search/start', key: searchKey, requestId });
  return travelerReducer(state, { type: 'search/success', key: searchKey, requestId, data });
}

function requestInput(options: RequestInit): Record<string, unknown> {
  assert.ok(typeof options.body === 'string');
  const input: unknown = JSON.parse(options.body);
  assert.ok(input !== null && typeof input === 'object' && !Array.isArray(input));
  return input as Record<string, unknown>;
}

test('refreshing a search preserves it when the oldest successful search is evicted', () => {
  const trips = Array.from({ length: 6 }, (_, index) => ({ ...trip, adults: index + 1 }));
  let state = travelerReducer(undefined, { type: 'unknown' });
  for (const [index, context] of trips.slice(0, 5).entries()) state = cacheSearch(state, context, index);
  const beforeRefresh = state;
  const refreshed = shortlist(trips[0]);
  state = cacheSearch(state, trips[0], 5, refreshed);
  state = cacheSearch(state, trips[5], 6);
  assert.equal(Object.keys(state.searches).length, 5);
  assert.equal(state.searches[contextKey(trips[0])], refreshed);
  assert.equal(state.searches[contextKey(trips[1])], undefined);
  assert.ok(beforeRefresh.searches[contextKey(trips[1])]);
  assert.equal(state.searches[contextKey(trips[0])].expiresAt, refreshed.expiresAt);
});

function startDetail(state: TravelerState | undefined, requestId: string | number) {
  return travelerReducer(state, { type: 'detail/start', key, tripKey, offerId, hotelId, requestId });
}

function rejectSelection(state: TravelerState, requestId: string | number, code = 'INVALID_SELECTION') {
  return travelerReducer(state, { type: 'detail/error', key, tripKey, requestId, error: { code } });
}

const loadedDetail = () => ({
  context: trip, offer: matchedOffer(), candidate: candidate(), retrievedAt: '2027-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:01:00.000Z', offerExpiresAt: '2027-01-01T00:05:00.000Z',
  details: { images: ['https://images.priceline.com/property.jpg'], description: 'Known property information',
    amenities: ['Pool'], address: 'The Strip', retailQuote: null },
  detailStatus: 'available', quoteStatus: 'unavailable',
} satisfies DetailResponse);
const succeedDetail = (state: TravelerState, requestId: string | number, data: DetailResponse = loadedDetail()) => travelerReducer(state, {
  type: 'detail/success', key, tripKey, requestId, data,
});
const view = (state: TravelerState, overrides: Partial<Parameters<typeof selectDetailView>[0]> = {}) => selectDetailView({
  detail: state.detail, search: state.searches[tripKey], key, offerId, hotelId, ...overrides,
});

test('direct-link same-selection refresh retains known property data and original freshness through transient failures', () => {
  const data = loadedDetail();
  let state = succeedDetail(startDetail(undefined, 1), 1, data);
  state = startDetail(state, 2);
  assert.equal(state.detail.status, 'loading');
  assert.equal(state.detail.data, data);
  assert.equal(view(state).candidate?.name, 'Known hotel');
  assert.equal(view(state).expiresAt, data.offerExpiresAt);
  for (const code of ['PROVIDER_UNAVAILABLE', 'NETWORK_ERROR', 'DEADLINE_EXCEEDED', 'PROVIDER_COOLDOWN',
    'PROVIDER_RESPONSE_INVALID', 'PROVIDER_DISABLED', 'PROVIDER_NOT_CONFIGURED']) {
    const failed = rejectSelection(state, 2, code);
    assert.equal(failed.detail.status, 'error');
    assert.equal(view(failed).data, data);
    assert.equal(view(failed).bindingRejected, false);
    assert.deepEqual(view(failed).data?.details?.images, data.details.images);
    assert.equal(view(failed).expiresAt, data.offerExpiresAt);
  }
});

test('changing selection or receiving a binding rejection clears retained detail data', () => {
  const ready = succeedDetail(startDetail(cacheSearch(undefined, trip, 1), 2), 2);
  const changed = travelerReducer(ready, { type: 'detail/start', key: detailKey(trip, offerId, 'hotel-2'),
    tripKey, offerId, hotelId: 'hotel-2', requestId: 3 });
  assert.equal(changed.detail.data, null);
  for (const code of ['INVALID_SELECTION', 'SELECTION_UNAVAILABLE']) {
    const failed = rejectSelection(startDetail(ready, 3), 3, code);
    assert.equal(failed.detail.data, null);
    assert.equal(view(failed).candidate, null);
    assert.equal(view(failed).bindingRejected, true);
    const retrying = startDetail(failed, 4);
    assert.equal(view(retrying).candidate, null);
    assert.equal(view(retrying).bindingRejected, true);
  }
});

test('newer same-offer evidence withdraws an unsupported hotel without rejecting its original quote', () => {
  let state = succeedDetail(startDetail(cacheSearch(undefined, trip, 1), 2), 2);
  const removed = shortlist();
  removed.offers[0] = { ...matchedOffer(), candidates: [candidate('hotel-2', 'Different hotel')] };
  state = cacheSearch(state, trip, 3, removed);
  assert.equal(state.detail.data?.details, null);
  assert.equal(view(state).candidate, null);
  assert.equal(view(state).bindingRejected, false);
  assert.equal(view(state).offer?.offerId, offerId);
  state = startDetail(state, 4);
  assert.equal(view(state).candidate, null);
  const fresh = { ...loadedDetail(), offerExpiresAt: '2027-01-01T00:06:00.000Z' };
  state = succeedDetail(state, 4, fresh);
  assert.equal(view(state).data, fresh);
  assert.equal(view(state).bindingRejected, false);
  assert.equal(view(state).expiresAt, fresh.offerExpiresAt);
  state = startDetail(state, 5);
  assert.equal(view(state).data, fresh, 'refresh does not erase the successful newer detail binding');
});

test('newer search omissions and partial inference do not reject successful original-offer details', () => {
  for (const status of ['complete', 'partial'] satisfies CoverageStatus[]) {
    for (const omit of [true, false]) {
      if (!omit && status === 'complete') continue;
      let state = startDetail(cacheSearch(undefined, trip, 1), 2);
      const newer: SearchResponse = { ...shortlist(), coverage: { ...shortlist().coverage, status },
        offers: omit ? [] : [unresolvedOffer('incomplete_search')] };
      state = cacheSearch(state, trip, 3, newer);
      state = succeedDetail(state, 2);
      assert.equal(state.detail.status, 'success');
      assert.equal(state.searches[tripKey], newer);
      assert.equal(view(state).candidate?.hotelId, hotelId);
      assert.equal(view(state).offer?.offerId, offerId);
    }
  }
});

test('missing facts from a complete search preserve completed and in-flight hotel evidence', () => {
  const missing = { ...shortlist(), offers: [unresolvedOffer('missing_facts')] };
  for (const completed of [false, true]) {
    let state = startDetail(cacheSearch(undefined, trip, 1), 2);
    if (completed) state = succeedDetail(state, 2);
    state = cacheSearch(state, trip, 3, missing);
    if (!completed) state = succeedDetail(state, 2);
    assert.equal(view(state).candidate?.hotelId, hotelId);
    assert.equal(view(state).bindingRejected, false);
  }
});

test('retained details never inherit a newer search expiry, and absent Redux data waits for revalidation', () => {
  const data = loadedDetail();
  let state = succeedDetail(startDetail(cacheSearch(undefined, trip, 1), 2), 2, data);
  const newer = { ...shortlist(), expiresAt: '2027-01-01T00:10:00.000Z' };
  state = cacheSearch(state, trip, 3, newer);
  assert.equal(view(state).expiresAt, data.offerExpiresAt);
  const empty = travelerReducer(undefined, { type: 'unknown' });
  assert.deepEqual(view(empty), { data: null, offer: null, candidate: null, expiresAt: undefined, bindingRejected: false });
});

test('unrecoverable selection preserves its original trip shortlist and unrelated results', () => {
  let state = cacheSearch(undefined, trip, 1);
  state = cacheSearch(state, otherTrip, 2);
  state = startDetail(state, 3);
  const rejected = rejectSelection(state, 3);
  assert.equal(rejected.searches, state.searches);
  assert.equal(rejected.searches[contextKey(otherTrip)], state.searches[contextKey(otherTrip)]);
  assert.ok(state.searches[tripKey]);
  assert.equal(rejected.detail.error?.code, 'INVALID_SELECTION');
  assert.equal(rejected.detail.searchAtStart, null);
});

test('ordinary detail errors retain the usable shortlist', () => {
  const state = startDetail(cacheSearch(undefined, trip, 1), 2);
  for (const code of ['NETWORK_ERROR', 'DEADLINE_EXCEEDED', 'PROVIDER_COOLDOWN']) {
    assert.equal(rejectSelection(state, 2, code).searches, state.searches);
  }
});

test('out-of-order detail rejection cannot replace a newer successful detail or clear its shortlist', () => {
  let state = startDetail(cacheSearch(undefined, trip, 1), 2);
  state = startDetail(state, 3);
  const data = loadedDetail();
  state = travelerReducer(state, { type: 'detail/success', key, tripKey, requestId: 3, data });
  assert.equal(rejectSelection(state, 2), state);
  assert.equal(state.detail.data, data);
  assert.ok(state.searches[tripKey]);
});

test('a newer successful search survives an older selection rejection', () => {
  let state = startDetail(cacheSearch(undefined, trip, 1), 2);
  const refreshed = shortlist();
  state = cacheSearch(state, trip, 3, refreshed);
  const rejected = rejectSelection(state, 2);
  assert.equal(rejected.searches[tripKey], refreshed);
  assert.equal(rejected.detail.error?.code, 'INVALID_SELECTION');
});

test('a legitimate search and detail retry restore data after a rejected selection', () => {
  let state = startDetail(cacheSearch(undefined, trip, 1), 2);
  state = rejectSelection(state, 2);
  const refreshed = shortlist();
  state = cacheSearch(state, trip, 3, refreshed);
  state = startDetail(state, 4);
  const data = loadedDetail();
  state = travelerReducer(state, { type: 'detail/success', key, tripKey, requestId: 4, data });
  assert.equal(state.searches[tripKey], refreshed);
  assert.equal(state.detail.data, data);
  assert.equal(state.detail.error, null);
  assert.equal(rejectSelection(state, 2), state);
});

test('server rejection carries trip identity and preserves its cached shortlist', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false, json: async () => ({ error: { code: 'INVALID_SELECTION' } }),
  }));
  let state = cacheSearch(undefined, trip, 'search-1');
  await loadDetail(trip, offerId, hotelId)((action) => { state = travelerReducer(state, action); });
  assert.equal(state.detail.tripKey, tripKey);
  assert.equal(state.detail.key, key);
  assert.equal(state.detail.error?.code, 'INVALID_SELECTION');
  assert.ok(state.searches[tripKey]);
});

test('detail response still requires exact offer and candidate identities', async (t) => {
  let reply: unknown;
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, options: RequestInit) => {
    assert.equal(requestInput(options).offerId, offerId);
    return { ok: true, json: async () => reply };
  });
  for (const [returnedOffer, returnedHotel, accepted] of [
    [offerId, hotelId, true],
    ['cd'.repeat(168), hotelId, false],
    [offerId, 'hotel-2', false],
  ] as const) {
    reply = { ...loadedDetail(),
      offer: { ...matchedOffer(), offerId: returnedOffer }, candidate: candidate(returnedHotel) };
    let state = cacheSearch(undefined, trip, 'search-1');
    await loadDetail(trip, offerId, hotelId)((action) => { state = travelerReducer(state, action); });
    assert.equal(state.detail.status, accepted ? 'success' : 'error');
    if (accepted) {
      assert.equal(state.detail.data, reply);
      assert.ok(state.searches[tripKey]);
    } else {
      assert.equal(state.detail.error?.code, 'PROVIDER_RESPONSE_INVALID');
      assert.ok(state.searches[tripKey]);
    }
  }
});

test('malformed or mismatched retries preserve the last valid same-selection details and shortlist', async t => {
  let reply: unknown;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => reply }));
  const data = loadedDetail();
  for (const invalid of [null, { ...data, offer: { ...data.offer, offerId: 'other-offer' } },
    { ...data, candidate: { hotelId: 'other-hotel' } },
    { ...data, candidate: null, details: null, detailStatus: 'unavailable' }]) {
    reply = invalid;
    let state = succeedDetail(startDetail(cacheSearch(undefined, trip, 1), 2), 2, data);
    const searches = state.searches;
    await loadDetail(trip, offerId, hotelId)(action => { state = travelerReducer(state, action); });
    assert.equal(state.detail.error?.code, 'PROVIDER_RESPONSE_INVALID');
    assert.equal(state.detail.data, data);
    assert.equal(state.searches, searches);
    assert.equal(view(state).bindingRejected, false);
  }
});

test('malformed search fields preserve the last valid shortlist', async t => {
  let reply: unknown;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => reply }));
  const data = shortlist();
  for (const malformed of [
    { ...data, coverage: 'complete' },
    { ...data, coverage: { ...data.coverage, pagesFetched: '1' } },
    { ...data, offers: [{ ...matchedOffer(), candidates: [{ ...candidate(), name: {} }] }] },
    { ...data, offers: [{ ...matchedOffer(), quote: { ...quote(), nightlyCents: '12500' } }] },
    { ...data, offers: [{ ...matchedOffer(), clues: { ...matchedOffer().clues, reviewCount: { kind: 'exact' } } }] },
  ]) {
    reply = malformed;
    let state = cacheSearch(undefined, trip, 'cached', data);
    const searches = state.searches;
    await loadSearch(trip)(action => { state = travelerReducer(state, action); });
    assert.equal(state.search.status, 'error');
    assert.equal(state.search.error?.code, 'PROVIDER_RESPONSE_INVALID');
    assert.equal(state.searches, searches);
    assert.equal(state.searches[tripKey], data);
  }
});

test('malformed property fields preserve validated details and their original quote', async t => {
  let reply: unknown;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => reply }));
  const data = loadedDetail();
  for (const malformed of [
    { ...data, candidate: { ...candidate(), name: {} } },
    { ...data, details: { ...data.details, images: [{}] } },
    { ...data, details: { ...data.details, amenities: null } },
    { ...data, details: { ...data.details, description: {} } },
    { ...data, details: { ...data.details, retailQuote: { currency: 'USD' } } },
  ]) {
    reply = malformed;
    let state = succeedDetail(startDetail(cacheSearch(undefined, trip, 1), 2), 2, data);
    const searches = state.searches;
    await loadDetail(trip, offerId, hotelId)(action => { state = travelerReducer(state, action); });
    assert.equal(state.detail.status, 'error');
    assert.equal(state.detail.error?.code, 'PROVIDER_RESPONSE_INVALID');
    assert.equal(state.detail.data, data);
    assert.equal(state.detail.data?.offer.quote, data.offer.quote);
    assert.equal(state.searches, searches);
    assert.equal(view(state).bindingRejected, false);
  }
});

test('a named request accepts original pricing after its hotel inference is withdrawn', async t => {
  const original: DetailResponse = { ...loadedDetail(), candidate: null, details: null, detailStatus: 'unavailable',
    quoteStatus: 'available', offer: unresolvedOffer('no_match') };
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => original }));
  let state = cacheSearch(undefined, trip, 1);
  await loadDetail(trip, offerId, hotelId)(action => { state = travelerReducer(state, action); });
  assert.equal(state.detail.status, 'success');
  assert.equal(view(state).offer?.offerId, offerId);
  assert.equal(view(state).candidate, null);
  assert.equal(state.detail.data?.quoteStatus, 'available');
});

test('a classified successful fallback preserves same-hotel metadata and the original quote expiry only', async t => {
  const previous = loadedDetail();
  previous.offer = { ...previous.offer, quote: { ...quote(), totalCents: 27000, totalTaxesFees: 'included' }, quoteExpiresAt: '2027-01-01T00:01:00.000Z' };
  let reply: DetailResponse = { ...loadedDetail(), details: { description: null, images: [], amenities: [], address: null, retailQuote: null },
    expiresAt: '2027-01-01T00:02:00.000Z', detailStatus: 'unavailable', refreshError: { code: 'PROVIDER_UNAVAILABLE' } };
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => reply }));
  let state = succeedDetail(startDetail(cacheSearch(undefined, trip, 1), 2), 2, previous);
  await loadDetail(trip, offerId, hotelId)(action => { state = travelerReducer(state, action); });
  assert.equal(state.detail.status, 'success');
  assert.equal(state.detail.data?.details, previous.details);
  assert.equal(state.detail.data?.offer.quote, previous.offer.quote);
  assert.equal(state.detail.data?.offer.quoteExpiresAt, previous.offer.quoteExpiresAt);
  const withdrawn: Offer = { ...reply.offer, resolution: { status: 'unresolved', reason: 'no_match' }, candidates: [] };
  reply = { ...reply, offer: withdrawn, candidate: null, details: null };
  await loadDetail(trip, offerId, hotelId)(action => { state = travelerReducer(state, action); });
  assert.equal(state.detail.data?.candidate, null);
  assert.equal(state.detail.data?.details, null, 'failed refresh cannot revive a withdrawn hotel');
  assert.equal(state.detail.data?.offer.quoteExpiresAt, previous.offer.quoteExpiresAt);
});

for (const code of ['PROVIDER_COOLDOWN', 'PROVIDER_UNAVAILABLE', 'PROVIDER_BUSY'] satisfies BackoffCode[]) test(`${code} cooldown survives other-trip success and suppresses retries before abort/start or fetch`, async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const retryAt = new Date(now + 60000).toISOString();
  let state = cacheSearch(undefined, trip, 'cached-search');
  let calls = 0;
  let releaseOther: (() => void) | undefined;
  let otherSignal: AbortSignal | null | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, options: RequestInit) => {
    calls += 1;
    const input = requestInput(options);
    if (contextKey(input) === tripKey) {
      return now < Date.parse(retryAt)
        ? { ok: false, json: async () => ({ error: { code, retryAt } }) }
        : { ok: true, json: async () => shortlist(trip) };
    }
    otherSignal = options.signal;
    return new Promise(resolve => { releaseOther = () => resolve({ ok: true, json: async () => shortlist(otherTrip) }); });
  });
  const dispatch = (action: TravelerAction) => { state = travelerReducer(state, action); };
  const getState = () => state;
  const originalSearch = state.searches[tripKey];
  await loadSearch(trip)(dispatch, getState);
  assert.equal(selectSearchCooldown(state, tripKey), retryAt);
  assert.equal(state.searchCooldowns[tripKey].code, code);
  assert.equal(state.searches[tripKey], originalSearch);
  const otherPending = loadSearch(otherTrip)(dispatch, getState);
  const whileOtherPending = state;
  await loadSearch(trip)(dispatch, getState);
  assert.equal(state, whileOtherPending);
  assert.ok(otherSignal);
  assert.equal(otherSignal.aborted, false);
  assert.equal(calls, 2);
  assert.ok(releaseOther);
  releaseOther();
  await otherPending;
  const afterOtherSuccess = state;
  await loadSearch(trip)(dispatch, getState);
  assert.equal(state, afterOtherSuccess);
  assert.equal(calls, 2);
  now = Date.parse(retryAt);
  assert.equal(selectSearchCooldown(state, tripKey), null);
  await loadSearch(trip)(dispatch, getState);
  assert.equal(calls, 3);
  assert.equal(state.search.status, 'success');
});

test('separate trips retain separate cooldown deadlines and rejected stale requests cannot replace them', async t => {
  const retryAt = new Date(Date.now() + 60000).toISOString();
  let state = travelerReducer(undefined, { type: 'unknown' });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return { ok: false, json: async () => ({ error: { code: 'PROVIDER_COOLDOWN', retryAt } }) };
  });
  const dispatch = (action: TravelerAction) => { state = travelerReducer(state, action); };
  const getState = () => state;
  await loadSearch(trip)(dispatch, getState);
  await loadSearch(otherTrip)(dispatch, getState);
  assert.equal(selectSearchCooldown(state, tripKey), retryAt);
  assert.equal(selectSearchCooldown(state, contextKey(otherTrip)), retryAt);
  await loadSearch(trip)(dispatch, getState);
  await loadSearch(otherTrip)(dispatch, getState);
  assert.equal(calls, 2);
  const before = state;
  state = travelerReducer(state, { type: 'search/error', key: tripKey, requestId: 'obsolete',
    error: { code: 'PROVIDER_COOLDOWN', retryAt: '2099-01-01T00:00:00.000Z' } });
  assert.equal(state, before);
});

test('detail cooldown retains successful data and suppresses same-trip search after returning to results', async t => {
  const retryAt = new Date(Date.now() + 60000).toISOString();
  let state = succeedDetail(startDetail(undefined, 1), 1);
  const data = state.detail.data;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return { ok: false, json: async () => ({ error: { code: 'PROVIDER_COOLDOWN', retryAt } }) };
  });
  const dispatch = (action: TravelerAction) => { state = travelerReducer(state, action); };
  const getState = () => state;
  await loadDetail(trip, offerId, hotelId)(dispatch, getState);
  assert.equal(selectSearchCooldown(state, tripKey), retryAt);
  assert.equal(state.detail.data, data);
  const afterCooldown = state;
  await loadSearch(trip)(dispatch, getState);
  assert.equal(state, afterCooldown);
  assert.equal(calls, 1);
});

test('cooldown storage prunes expired records and remains bounded to five trips', () => {
  const now = 100000;
  const retryAt = new Date(now + 60000).toISOString();
  let state = travelerReducer(undefined, { type: 'unknown' });
  const keys = [];
  for (let index = 0; index < 6; index += 1) {
    const searchKey = contextKey({ ...trip, childrenAges: [index] });
    keys.push(searchKey);
    state = travelerReducer(state, { type: 'search/start', key: searchKey, requestId: index });
    state = travelerReducer(state, { type: 'search/error', key: searchKey, requestId: index, receivedAt: now,
      error: { code: 'PROVIDER_COOLDOWN', retryAt } });
  }
  assert.equal(Object.keys(state.searchCooldowns).length, 5);
  assert.equal(state.searchCooldowns[keys[0]], undefined);
  assert.equal(selectSearchCooldown(state, keys[5], now), retryAt);
  state = travelerReducer(state, { type: 'search/start', key: tripKey, requestId: 10 });
  state = travelerReducer(state, { type: 'search/error', key: tripKey, requestId: 10, receivedAt: now + 60000,
    error: { code: 'PROVIDER_COOLDOWN', retryAt: new Date(now + 120000).toISOString() } });
  assert.deepEqual(Object.keys(state.searchCooldowns), [tripKey]);
});

test('usable partial searches and detail fallbacks retain their data and backoff reason', () => {
  const retryAt = new Date(Date.now() + 60_000).toISOString();
  for (const code of ['PROVIDER_COOLDOWN', 'PROVIDER_UNAVAILABLE', 'PROVIDER_BUSY'] satisfies BackoffCode[]) {
    const backoff = { code, retryAt };
    const partial = { ...shortlist(), backoff };
    const search = cacheSearch(undefined, trip, 'partial', partial);
    assert.equal(search.searches[tripKey], partial);
    assert.deepEqual(search.searchCooldowns[tripKey], backoff);
    const data = { ...loadedDetail(), backoff };
    const detail = travelerReducer(startDetail(undefined, 'fallback'), {
      type: 'detail/success', key, tripKey, requestId: 'fallback', data,
    });
    assert.equal(detail.detail.data, data);
    assert.equal(selectSearchCooldown(detail, tripKey), retryAt);
    assert.deepEqual(detail.searchCooldowns[tripKey], backoff);
  }
  for (const backoff of [{ code: 'INTERNAL_ERROR', retryAt }, { code: 'PROVIDER_BUSY', retryAt: Date.now() + 60000 },
    { code: 'PROVIDER_UNAVAILABLE', retryAt: 'invalid' }]) {
    // Intentional malformed reducer input: storage must ignore invalid backoff fields.
    // @ts-expect-error The wire payload is deliberately outside the Backoff contract.
    const state = cacheSearch(undefined, trip, 'invalid-backoff', { ...shortlist(), backoff });
    assert.equal(selectSearchCooldown(state, tripKey), null);
  }
});

test('offer-only requests omit hotelId and require the distinct null-candidate envelope', async t => {
  let reply: unknown;
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, options: RequestInit) => {
    assert.equal(Object.hasOwn(requestInput(options), 'hotelId'), false);
    return { ok: true, json: async () => reply };
  });
  const unresolved = unresolvedOffer('no_match');
  const data: DetailResponse = { ...loadedDetail(), offer: unresolved, candidate: null, details: null, detailStatus: 'not_requested' };
  const offerOnlyKey = detailKey(trip, offerId, null);
  assert.equal(offerOnlyKey, detailKey(trip, offerId));
  assert.equal(JSON.parse(offerOnlyKey)[2], null);
  for (const [response, accepted] of [
    [data, true],
    [{ ...data, offer: shortlist().offers[0] }, true],
    [{ ...data, candidate: { hotelId } }, false],
    [{ ...data, details: {} }, false],
    [{ ...data, detailStatus: 'unavailable' }, false],
    [{ ...data, offer: { ...unresolved, offerId: 'other' } }, false],
  ]) {
    reply = response;
    let state = cacheSearch(undefined, trip, 'cached', { ...shortlist(), offers: [unresolved] });
    await loadDetail(trip, offerId, null)(action => { state = travelerReducer(state, action); });
    assert.equal(state.detail.status, accepted ? 'success' : 'error');
    if (accepted) {
      const selected = view(state, { key: offerOnlyKey, hotelId: null });
      assert.equal(selected.data, response);
      assert.equal(selected.candidate, null);
      assert.equal(selected.bindingRejected, false);
    }
  }
});

test('old response shapes require a refresh instead of identifying a hotel', async t => {
  let response: unknown;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => response }));
  const oldOffer = { offerId, candidates: [{ hotelId }] };
  for (const kind of ['search', 'detail'] as const) {
    response = kind === 'search' ? { ...shortlist(), offers: [oldOffer] } : { ...loadedDetail(), offer: oldOffer };
    let state = travelerReducer(undefined, { type: 'unknown' });
    const request = kind === 'search' ? loadSearch(trip) : loadDetail(trip, offerId, hotelId);
    await request(action => { state = travelerReducer(state, action); });
    assert.equal(state[kind].status, 'error');
    assert.equal(state[kind].error?.code, 'PROVIDER_RESPONSE_INVALID');
  }
});

test('named rejection hides the identity but preserves a separately validated opaque offer', () => {
  const original = shortlist();
  original.offers[0].handoffUrl = 'https://www.priceline.com/express/offer';
  let state = startDetail(cacheSearch(undefined, trip, 1, original), 2);
  state = rejectSelection(state, 2);
  assert.equal(state.searches[tripKey], original);
  assert.equal(view(state).candidate, null);
  assert.equal(view(state).offer, original.offers[0]);
  assert.equal(view(state).expiresAt, original.expiresAt);
  assert.equal(view(state).bindingRejected, true);
});

test('offer-only details survive hotel changes and newer discovery omissions', () => {
  const offerOnlyKey = detailKey(trip, offerId, null);
  const start = (state: TravelerState, requestId: string | number) => travelerReducer(state, {
    type: 'detail/start', key: offerOnlyKey, tripKey, offerId, hotelId: null, requestId,
  });
  const selected = (state: TravelerState) => view(state, { key: offerOnlyKey, hotelId: null });
  let state = start(cacheSearch(undefined, trip, 1), 2);
  assert.equal(selected(state).bindingRejected, false);
  assert.equal(selected(state).candidate, null);
  const changed = { ...shortlist(), offers: [unresolvedOffer('ambiguous')] };
  state = cacheSearch(state, trip, 3, changed);
  const data: DetailResponse = { ...loadedDetail(), offer: changed.offers[0], candidate: null, details: null, detailStatus: 'not_requested' };
  state = succeedDetail(state, 2, data);
  assert.deepEqual(selected(state).data, data);
  assert.equal(state.searches[tripKey], changed, 'detail completion preserves the search object and its listing quote');
  state = start(state, 4);
  state = cacheSearch(state, trip, 5, { ...shortlist(), offers: [] });
  state = succeedDetail(state, 4, data);
  assert.equal(state.detail.status, 'success');
  assert.equal(selected(state).offer?.offerId, offerId);
  assert.equal(selected(state).data, data);
});

test('a newer unresolved search withdraws offer-only hotel hints while preserving completed or in-flight quotes', () => {
  const offerOnlyKey = detailKey(trip, offerId, null);
  const start = (state: TravelerState, requestId: string | number) => travelerReducer(state, {
    type: 'detail/start', key: offerOnlyKey, tripKey, offerId, hotelId: null, requestId,
  });
  const newer = { ...shortlist(), offers: [unresolvedOffer('ambiguous')] };
  const searchQuote = newer.offers[0].quote;
  const originalQuote: Quote = { ...quote(), totalCents: 25000, totalTaxesFees: 'included' };
  const data: DetailResponse = { ...loadedDetail(), candidate: null, details: null, detailStatus: 'not_requested', quoteStatus: 'available',
    offer: { ...matchedOffer(), quote: originalQuote, handoffUrl: 'https://www.priceline.com/express/offer' } };
  for (const completeBeforeSearch of [false, true]) {
    let state = start(cacheSearch(undefined, trip, 1), 2);
    if (completeBeforeSearch) state = succeedDetail(state, 2, data);
    state = cacheSearch(state, trip, 3, newer);
    if (!completeBeforeSearch) state = succeedDetail(state, 2, data);
    const selected = view(state, { key: offerOnlyKey, hotelId: null });
    assert.equal(selected.data?.offer.resolution, newer.offers[0].resolution);
    assert.deepEqual(selected.data?.offer.candidates, []);
    assert.equal(selected.offer?.quote, originalQuote);
    assert.equal(selected.offer?.handoffUrl, data.offer.handoffUrl);
    assert.equal(selected.expiresAt, data.offerExpiresAt);
    assert.equal(state.searches[tripKey], newer);
    assert.equal(newer.offers[0].quote, searchQuote);
    assert.notEqual(newer.offers[0].quote, originalQuote);
    state = succeedDetail(start(state, 4), 4, data);
    assert.equal(view(state, { key: offerOnlyKey, hotelId: null }).offer?.resolution.status, 'matched',
      'a later detail request can revalidate the hotel relationship');
  }
});

test('superseded searches settle and Back A retains its exact snapshot after B fails and retries', async t => {
  let state = cacheSearch(undefined, trip, 'cached');
  const snapshot = state.searches[tripKey];
  let call = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, options: RequestInit) => {
    call += 1;
    if (call === 1) return new Promise((resolve, reject) => {
      assert.ok(options.signal);
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    if (call === 2) throw new Error('offline');
    return { ok: true, json: async () => shortlist(otherTrip) };
  });
  const dispatch = (action: TravelerAction) => { state = travelerReducer(state, action); };
  const pendingA = loadSearch(trip)(dispatch);
  await loadSearch(otherTrip)(dispatch);
  await pendingA;
  assert.equal(state.search.status, 'error');
  assert.equal(state.search.key, contextKey(otherTrip));
  assert.equal(state.searches[tripKey], snapshot);
  await loadSearch(otherTrip)(dispatch);
  assert.equal(state.search.status, 'success');
  assert.equal(state.searches[tripKey], snapshot);
  assert.deepEqual(state.searches[contextKey(otherTrip)].context, otherTrip);
});

test('validated responses preserve nullable rating and named image and amenity display fallbacks', async t => {
  const search = shortlist();
  const ratedOffer = search.offers[0];
  assert.equal(ratedOffer.candidates.length, 1);
  const ratingResponse = { ...search, offers: [{ ...ratedOffer,
    candidates: [{ ...ratedOffer.candidates[0], guestRating: null }],
  }] };
  const detail = loadedDetail();
  const detailResponse = { ...detail, details: { ...detail.details,
    images: [{ url: 'https://images.priceline.com/property.jpg' }],
    amenities: [{ name: 'Free Wi-Fi' }],
  } };
  let response: unknown = ratingResponse;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => response }));
  let state = travelerReducer(undefined, { type: 'unknown' });
  const dispatch = (action: TravelerAction) => { state = travelerReducer(state, action); };
  await loadSearch(trip)(dispatch);
  assert.equal(state.search.status, 'success');
  assert.equal(state.searches[tripKey].offers[0].candidates[0]?.guestRating, null);
  response = detailResponse;
  await loadDetail(trip, offerId, hotelId)(dispatch);
  assert.equal(state.detail.status, 'success');
  assert.equal(state.detail.data?.details, detailResponse.details);
});
