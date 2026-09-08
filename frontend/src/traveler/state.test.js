import test from 'node:test';
import assert from 'node:assert/strict';
import { contextKey } from './context.js';
import { detailKey, loadDetail, loadSearch, selectDetailView, selectSearchCooldown, travelerReducer } from './state.js';

const trip = {
  destinationId: 'geonames:5506956', cityName: 'Las Vegas, Nevada',
  checkIn: '2027-01-10', checkOut: '2027-01-12',
  rooms: 1, adults: 2, childrenAges: [], currency: 'USD',
};
const otherTrip = { ...trip, childrenAges: [7] };
const offerId = 'ab'.repeat(168);
const hotelId = 'hotel-1';
const tripKey = contextKey(trip);
const key = detailKey(trip, offerId, hotelId);
const shortlist = (context = trip) => ({
  context, expiresAt: '2027-01-01T00:05:00.000Z', coverage: { status: 'complete' },
  offers: [{ offerId, resolution: { status: 'matched' }, candidates: [{ hotelId }] }],
});

function cacheSearch(state, context, requestId, data = shortlist(context)) {
  const searchKey = contextKey(context);
  state = travelerReducer(state, { type: 'search/start', key: searchKey, requestId });
  return travelerReducer(state, { type: 'search/success', key: searchKey, requestId, data });
}

function startDetail(state, requestId) {
  return travelerReducer(state, { type: 'detail/start', key, tripKey, offerId, hotelId, requestId });
}

function rejectSelection(state, requestId, code = 'INVALID_SELECTION') {
  return travelerReducer(state, { type: 'detail/error', key, tripKey, requestId, error: { code } });
}

const loadedDetail = () => ({
  context: trip, offer: shortlist().offers[0], candidate: { hotelId, name: 'Known hotel' },
  expiresAt: '2027-01-01T00:01:00.000Z', offerExpiresAt: '2027-01-01T00:05:00.000Z',
  details: { images: ['https://images.priceline.com/property.jpg'], description: 'Known property information' },
  detailStatus: 'available', quoteStatus: 'unavailable',
});
const succeedDetail = (state, requestId, data = loadedDetail()) => travelerReducer(state, {
  type: 'detail/success', key, tripKey, requestId, data,
});
const view = (state, overrides = {}) => selectDetailView({
  detail: state.detail, search: state.searches[tripKey], key, offerId, hotelId, ...overrides,
});

test('direct-link same-selection refresh retains known property data and original freshness through transient failures', () => {
  const data = loadedDetail();
  let state = succeedDetail(startDetail(undefined, 1), 1, data);
  state = startDetail(state, 2);
  assert.equal(state.detail.status, 'loading');
  assert.equal(state.detail.data, data);
  assert.equal(view(state).candidate.name, 'Known hotel');
  assert.equal(view(state).expiresAt, data.offerExpiresAt);
  for (const code of ['PROVIDER_UNAVAILABLE', 'NETWORK_ERROR', 'DEADLINE_EXCEEDED', 'PROVIDER_COOLDOWN']) {
    const failed = rejectSelection(state, 2, code);
    assert.equal(failed.detail.status, 'error');
    assert.equal(view(failed).data, data);
    assert.equal(view(failed).bindingRejected, false);
    assert.deepEqual(view(failed).data.details.images, data.details.images);
    assert.equal(view(failed).expiresAt, data.offerExpiresAt);
  }
});

test('changing selection or receiving a binding rejection clears retained detail data', () => {
  const ready = succeedDetail(startDetail(cacheSearch(undefined, trip, 1), 2), 2);
  const changed = travelerReducer(ready, { type: 'detail/start', key: detailKey(trip, offerId, 'hotel-2'),
    tripKey, offerId, hotelId: 'hotel-2', requestId: 3 });
  assert.equal(changed.detail.data, null);
  for (const code of ['INVALID_SELECTION', 'PROVIDER_RESPONSE_INVALID', 'PROVIDER_DISABLED', 'PROVIDER_NOT_CONFIGURED']) {
    const failed = rejectSelection(startDetail(ready, 3), 3, code);
    assert.equal(failed.detail.data, null);
    assert.equal(view(failed).candidate, null);
    assert.equal(view(failed).bindingRejected, true);
    const retrying = startDetail(failed, 4);
    assert.equal(view(retrying).candidate, null);
    assert.equal(view(retrying).bindingRejected, true);
  }
});

test('newer search membership withholds old details immediately and a later exact revalidation can restore them', () => {
  let state = succeedDetail(startDetail(cacheSearch(undefined, trip, 1), 2), 2);
  const removed = shortlist();
  removed.offers[0].candidates = [{ hotelId: 'hotel-2', name: 'Different hotel' }];
  state = cacheSearch(state, trip, 3, removed);
  assert.equal(state.detail.data, null);
  assert.equal(view(state).candidate, null);
  assert.equal(view(state).bindingRejected, true);
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

test('detail completion begun before a newer excluding search settles loading without resurrecting the candidate', () => {
  let state = startDetail(cacheSearch(undefined, trip, 1), 2);
  const removed = shortlist();
  removed.offers = [];
  state = cacheSearch(state, trip, 3, removed);
  state = succeedDetail(state, 2);
  assert.equal(state.detail.status, 'error');
  assert.equal(state.detail.error.code, 'INVALID_SELECTION');
  assert.equal(state.searches[tripKey], removed);
  assert.equal(view(state).data, null);
  assert.equal(view(state).candidate, null);
  assert.equal(view(state).offer, null);
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

test('invalid selection removes only its original trip shortlist without mutating prior state', () => {
  let state = cacheSearch(undefined, trip, 1);
  state = cacheSearch(state, otherTrip, 2);
  state = startDetail(state, 3);
  const rejected = rejectSelection(state, 3);
  assert.equal(rejected.searches[tripKey], undefined);
  assert.equal(rejected.searches[contextKey(otherTrip)], state.searches[contextKey(otherTrip)]);
  assert.ok(state.searches[tripKey]);
  assert.equal(rejected.detail.error.code, 'INVALID_SELECTION');
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
  const data = { offer: { offerId }, candidate: { hotelId } };
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
  assert.equal(rejected.detail.error.code, 'INVALID_SELECTION');
});

test('a legitimate search and detail retry restore data after a rejected selection', () => {
  let state = startDetail(cacheSearch(undefined, trip, 1), 2);
  state = rejectSelection(state, 2);
  const refreshed = shortlist();
  state = cacheSearch(state, trip, 3, refreshed);
  state = startDetail(state, 4);
  const data = { offer: { offerId }, candidate: { hotelId } };
  state = travelerReducer(state, { type: 'detail/success', key, tripKey, requestId: 4, data });
  assert.equal(state.searches[tripKey], refreshed);
  assert.equal(state.detail.data, data);
  assert.equal(state.detail.error, null);
  assert.equal(rejectSelection(state, 2), state);
});

test('server rejection carries trip identity and invalidates its cached shortlist', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false, json: async () => ({ error: { code: 'INVALID_SELECTION' } }),
  }));
  let state = cacheSearch(undefined, trip, 'search-1');
  await loadDetail(trip, offerId, hotelId)((action) => { state = travelerReducer(state, action); });
  assert.equal(state.detail.tripKey, tripKey);
  assert.equal(state.detail.key, key);
  assert.equal(state.detail.error.code, 'INVALID_SELECTION');
  assert.equal(state.searches[tripKey], undefined);
});

test('detail response still requires exact offer and candidate identities', async (t) => {
  let reply;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(JSON.parse(options.body).offerId, offerId);
    return { ok: true, json: async () => reply };
  });
  for (const [returnedOffer, returnedHotel, accepted] of [
    [offerId, hotelId, true],
    ['cd'.repeat(168), hotelId, false],
    [offerId, 'hotel-2', false],
  ]) {
    reply = { ...loadedDetail(),
      offer: { ...shortlist().offers[0], offerId: returnedOffer }, candidate: { hotelId: returnedHotel } };
    let state = cacheSearch(undefined, trip, 'search-1');
    await loadDetail(trip, offerId, hotelId)((action) => { state = travelerReducer(state, action); });
    assert.equal(state.detail.status, accepted ? 'success' : 'error');
    if (accepted) {
      assert.equal(state.detail.data, reply);
      assert.ok(state.searches[tripKey]);
    } else {
      assert.equal(state.detail.error.code, 'INVALID_SELECTION');
      assert.equal(state.searches[tripKey], undefined);
    }
  }
});

test('trip cooldown survives other-trip success and suppresses retries before abort/start or fetch', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const retryAt = new Date(now + 60000).toISOString();
  let state = cacheSearch(undefined, trip, 'cached-search');
  let calls = 0;
  let releaseOther;
  let otherSignal;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls += 1;
    const input = JSON.parse(options.body);
    if (contextKey(input) === tripKey) {
      return now < Date.parse(retryAt)
        ? { ok: false, json: async () => ({ error: { code: 'PROVIDER_COOLDOWN', retryAt } }) }
        : { ok: true, json: async () => shortlist(trip) };
    }
    otherSignal = options.signal;
    return new Promise(resolve => { releaseOther = () => resolve({ ok: true, json: async () => shortlist(otherTrip) }); });
  });
  const dispatch = action => { state = travelerReducer(state, action); };
  const getState = () => state;
  const originalSearch = state.searches[tripKey];
  await loadSearch(trip)(dispatch, getState);
  assert.equal(selectSearchCooldown(state, tripKey), retryAt);
  assert.equal(state.searches[tripKey], originalSearch);
  const otherPending = loadSearch(otherTrip)(dispatch, getState);
  const whileOtherPending = state;
  await loadSearch(trip)(dispatch, getState);
  assert.equal(state, whileOtherPending);
  assert.equal(otherSignal.aborted, false);
  assert.equal(calls, 2);
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
  const dispatch = action => { state = travelerReducer(state, action); };
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
  const dispatch = action => { state = travelerReducer(state, action); };
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

test('offer-only requests omit hotelId and require the distinct null-candidate envelope', async t => {
  let reply;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(Object.hasOwn(JSON.parse(options.body), 'hotelId'), false);
    return { ok: true, json: async () => reply };
  });
  const unresolved = { offerId, resolution: { status: 'unresolved', reason: 'no_match' }, candidates: [] };
  const data = { ...loadedDetail(), offer: unresolved, candidate: null, details: null, detailStatus: 'not_requested' };
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
  let response;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => response }));
  const oldOffer = { offerId, candidates: [{ hotelId }] };
  for (const kind of ['search', 'detail']) {
    response = kind === 'search' ? { ...shortlist(), offers: [oldOffer] } : { ...loadedDetail(), offer: oldOffer };
    let state = travelerReducer(undefined, {});
    const request = kind === 'search' ? loadSearch(trip) : loadDetail(trip, offerId, hotelId);
    await request(action => { state = travelerReducer(state, action); });
    assert.equal(state[kind].status, 'error');
    assert.equal(state[kind].error.code, 'PROVIDER_RESPONSE_INVALID');
  }
});

test('named rejection hides the identity but preserves a separately validated opaque offer', () => {
  const original = shortlist();
  original.offers[0].providerUrl = 'https://www.priceline.com/express/offer';
  let state = startDetail(cacheSearch(undefined, trip, 1, original), 2);
  state = rejectSelection(state, 2);
  assert.equal(state.searches[tripKey], undefined);
  assert.equal(view(state).candidate, null);
  assert.equal(view(state).offer, original.offers[0]);
  assert.equal(view(state).expiresAt, original.expiresAt);
  assert.equal(view(state).bindingRejected, true);
});

test('offer-only membership survives hotel changes but a newer removed offer rejects an old response', () => {
  const offerOnlyKey = detailKey(trip, offerId, null);
  const start = (state, requestId) => travelerReducer(state, {
    type: 'detail/start', key: offerOnlyKey, tripKey, offerId, hotelId: null, requestId,
  });
  const selected = state => view(state, { key: offerOnlyKey, hotelId: null });
  let state = start(cacheSearch(undefined, trip, 1), 2);
  assert.equal(selected(state).bindingRejected, false);
  assert.equal(selected(state).candidate, null);
  const changed = { ...shortlist(), offers: [{ offerId, resolution: { status: 'unresolved', reason: 'ambiguous' }, candidates: [] }] };
  state = cacheSearch(state, trip, 3, changed);
  const data = { ...loadedDetail(), offer: changed.offers[0], candidate: null, details: null, detailStatus: 'not_requested' };
  state = succeedDetail(state, 2, data);
  assert.deepEqual(selected(state).data, data);
  assert.equal(state.searches[tripKey], changed, 'detail completion preserves the search object and its listing quote');
  state = start(state, 4);
  state = cacheSearch(state, trip, 5, { ...shortlist(), offers: [] });
  state = succeedDetail(state, 4, data);
  assert.equal(state.detail.status, 'error');
  assert.equal(selected(state).offer, null);
  assert.equal(selected(state).data, null);
});

test('a newer unresolved search withdraws offer-only hotel hints while preserving completed or in-flight quotes', () => {
  const offerOnlyKey = detailKey(trip, offerId, null);
  const start = (state, requestId) => travelerReducer(state, {
    type: 'detail/start', key: offerOnlyKey, tripKey, offerId, hotelId: null, requestId,
  });
  const newer = { ...shortlist(), offers: [{
    offerId, resolution: { status: 'unresolved', reason: 'ambiguous' }, candidates: [],
  }] };
  const quote = { totalCents: 25000, currency: 'USD' };
  const data = { ...loadedDetail(), candidate: null, details: null, detailStatus: 'not_requested', quoteStatus: 'available',
    offer: { ...shortlist().offers[0], quote, providerUrl: 'https://www.priceline.com/express/offer' } };
  for (const completeBeforeSearch of [false, true]) {
    let state = start(cacheSearch(undefined, trip, 1), 2);
    if (completeBeforeSearch) state = succeedDetail(state, 2, data);
    state = cacheSearch(state, trip, 3, newer);
    if (!completeBeforeSearch) state = succeedDetail(state, 2, data);
    const selected = view(state, { key: offerOnlyKey, hotelId: null });
    assert.equal(selected.data.offer.resolution, newer.offers[0].resolution);
    assert.deepEqual(selected.data.offer.candidates, []);
    assert.equal(selected.offer.quote, quote);
    assert.equal(selected.offer.providerUrl, data.offer.providerUrl);
    assert.equal(selected.expiresAt, data.offerExpiresAt);
    assert.equal(state.searches[tripKey], newer);
    assert.equal(newer.offers[0].quote, undefined);
    state = succeedDetail(start(state, 4), 4, data);
    assert.equal(view(state, { key: offerOnlyKey, hotelId: null }).offer.resolution.status, 'matched',
      'a later detail request can revalidate the hotel relationship');
  }
});

test('superseded searches settle and Back A retains its exact snapshot after B fails and retries', async t => {
  let state = cacheSearch(undefined, trip, 'cached');
  const snapshot = state.searches[tripKey];
  let call = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    call += 1;
    if (call === 1) return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    if (call === 2) throw new Error('offline');
    return { ok: true, json: async () => shortlist(otherTrip) };
  });
  const dispatch = action => { state = travelerReducer(state, action); };
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
