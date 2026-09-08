import test from 'node:test';
import assert from 'node:assert/strict';
import { contextKey } from './context.js';
import { detailKey, loadDetail, travelerReducer } from './state.js';

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
  offers: [{ offerId, candidates: [{ hotelId }] }],
});

function cacheSearch(state, context, requestId, data = shortlist(context)) {
  const searchKey = contextKey(context);
  state = travelerReducer(state, { type: 'search/start', key: searchKey, requestId });
  return travelerReducer(state, { type: 'search/success', key: searchKey, requestId, data });
}

function startDetail(state, requestId) {
  return travelerReducer(state, { type: 'detail/start', key, tripKey, requestId });
}

function rejectSelection(state, requestId, code = 'INVALID_SELECTION') {
  return travelerReducer(state, { type: 'detail/error', key, tripKey, requestId, error: { code } });
}

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
    reply = { context: trip, expiresAt: '2027-01-01T00:05:00.000Z',
      offer: { offerId: returnedOffer }, candidate: { hotelId: returnedHotel } };
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
