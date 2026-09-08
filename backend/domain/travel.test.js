import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays, localToday, nightCount, validateTripFields } from '../../shared/travel.js';
import { contextFromSearch, contextKey, searchUrl, validateContext } from '../../frontend/src/traveler/context.js';
import { validateSearch } from './validation.js';

const now = new Date(2026, 8, 7, 12);
const trip = {
  destinationId: 'geonames:293397', cityName: 'Tel Aviv, Israel',
  checkIn: '2026-09-08', checkOut: '2026-09-10',
  rooms: 2, adults: 3, childrenAges: [0, 7], currency: 'USD',
};

test('search and candidate URLs round-trip the destination and full occupancy', () => {
  const url = searchUrl(trip, '/deal', { offerId: 'offer-1', hotelId: 'hotel-2' });
  assert.deepEqual(contextFromSearch(url.split('?')[1]), trip);
  const validation = validateContext(contextFromSearch(url.split('?')[1]), now);
  assert.deepEqual(validation.errors, {});
  assert.deepEqual(validation.context, trip);
  assert.equal(new URLSearchParams(url.split('?')[1]).get('childrenAges'), '0,7');
  assert.equal(new URLSearchParams(url.split('?')[1]).get('hotelId'), 'hotel-2');
});

test('legacy URL occupancy defaults remain supported without changing explicit values', () => {
  const legacy = contextFromSearch('?cityName=New+York%2C+New+York&checkIn=2026-09-08&checkOut=2026-09-10');
  assert.deepEqual(validateContext(legacy, now).errors, {});
  assert.equal(legacy.rooms, 1);
  assert.equal(legacy.adults, 2);
  assert.deepEqual(legacy.childrenAges, []);
  assert.equal(legacy.destinationId, 'geonames:5128581');
  assert.deepEqual(validateContext(legacy, now).context, validateSearch(legacy, now));
  const occupancy = contextFromSearch('?rooms=8&adults=16&childrenAges=0,17');
  assert.deepEqual({ rooms: occupancy.rooms, adults: occupancy.adults, childrenAges: occupancy.childrenAges }, { rooms: 8, adults: 16, childrenAges: [0, 17] });
});

test('invalid URL occupancy is rejected rather than reset to defaults or an infant age', () => {
  for (const extra of ['rooms=0', 'rooms=1.5', 'rooms=', 'adults=0', 'adults=17', 'childrenAges=0,,7', 'childrenAges=undefined', 'childrenAges=18']) {
    const params = new URLSearchParams(searchUrl(trip).split('?')[1]);
    const [key, value] = extra.split('=');
    params.set(key, value);
    assert.ok(Object.keys(validateContext(contextFromSearch(params.toString()), now).errors).length > 0, extra);
  }
  for (const childrenAges of [[null], [null, 7], ['3'], Array(1)]) {
    const missingAge = { ...trip, childrenAges };
    assert.ok(validateContext(contextFromSearch(searchUrl(missingAge).split('?')[1]), now).errors.childrenAges);
  }
  const rejected = validateContext({ ...trip, rooms: 0, adults: 17 }, now);
  assert.equal(rejected.context.rooms, 0);
  assert.equal(rejected.context.adults, 17);
});

test('trip keys bind every occupancy field and stable destination identity', () => {
  const key = contextKey(trip);
  for (const extra of [{ destinationId: 'geonames:5128581' }, { rooms: 3 }, { adults: 4 }, { childrenAges: [0, 8] }, { childrenAges: [7, 0] }, { childrenAges: [] }, { checkOut: '2026-09-11' }]) {
    assert.notEqual(contextKey({ ...trip, ...extra }), key);
  }
  assert.equal(contextKey({ ...trip, cityName: 'A translated display label' }), key);
});

test('client validation rejects remote future years, long stays and date ordering', () => {
  assert.ok(validateContext({ ...trip, checkIn: '2227-01-01', checkOut: '2227-01-02' }, now).errors.checkIn);
  assert.ok(validateContext({ ...trip, checkOut: '2027-08-01' }, now).errors.checkOut);
  for (const checkOut of [trip.checkIn, '2026-09-07']) {
    assert.ok(validateContext({ ...trip, checkOut }, now).errors.checkOut);
  }
  assert.ok(validateContext({ ...trip, checkOut: addCalendarDays(localToday(now), 366) }, now).errors.checkOut);
  assert.deepEqual(validateContext({ ...trip, checkOut: addCalendarDays(trip.checkIn, 30) }, now).errors, {});
});

test('local today and calendar arithmetic preserve dates across DST and year boundaries', () => {
  for (const [year, month, day] of [[2026, 2, 8], [2026, 10, 1], [2026, 11, 31]]) {
    const clock = new Date(year, month, day, 23, 59);
    const today = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    assert.equal(localToday(clock), today);
    const tomorrow = addCalendarDays(today, 1);
    assert.equal(nightCount(today, tomorrow), 1);
    assert.deepEqual(validateTripFields({ checkIn: today, checkOut: tomorrow }, clock).errors, {});
    assert.ok(validateTripFields({ checkIn: addCalendarDays(today, -1), checkOut: tomorrow }, clock).errors.checkIn);
  }
  assert.equal(addCalendarDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addCalendarDays('2026-02-29', 1), '');
});

test('server date grace accepts local horizons ahead of UTC and same-day trips behind UTC', () => {
  const previousTimezone = process.env.TZ;
  try {
    for (const [timezone, instant, today] of [
      ['Asia/Jerusalem', '2026-09-07T22:30:00Z', '2026-09-08'],
      ['America/Los_Angeles', '2026-09-08T00:30:00Z', '2026-09-07'],
    ]) {
      process.env.TZ = timezone;
      const clock = new Date(instant);
      assert.equal(localToday(clock), today);
      const latest = addCalendarDays(today, 365);
      const atHorizon = { ...trip, checkIn: addCalendarDays(latest, -1), checkOut: latest };
      const sameDay = { ...trip, checkIn: today, checkOut: addCalendarDays(today, 1) };
      for (const input of [atHorizon, sameDay]) {
        assert.deepEqual(validateContext(input, clock).errors, {});
        assert.doesNotThrow(() => validateSearch(input, clock));
      }
      assert.ok(validateContext({ ...atHorizon, checkOut: addCalendarDays(latest, 1) }, clock).errors.checkOut);
      assert.ok(validateContext({ ...sameDay, checkIn: addCalendarDays(today, -1) }, clock).errors.checkIn);
      const utcToday = instant.slice(0, 10);
      assert.throws(() => validateSearch({ ...atHorizon, checkOut: addCalendarDays(utcToday, 367) }, clock), { code: 'CHECK_OUT_TOO_FAR' });
      assert.throws(() => validateSearch({ ...sameDay, checkIn: addCalendarDays(utcToday, -2) }, clock), { code: 'PAST_CHECK_IN' });
      const longStay = { ...sameDay, checkOut: addCalendarDays(today, 31) };
      assert.ok(validateContext(longStay, clock).errors.checkOut);
      assert.throws(() => validateSearch(longStay, clock), { code: 'STAY_TOO_LONG' });
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});
