import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDetail, validateSearch } from './index.ts';
import { getDestination } from '../destinations/index.ts';
import { addCalendarDays } from '../../shared/travel.ts';
import { isRecord } from './validation.ts';

const now = new Date('2026-09-07T12:00:00Z');
const input = { cityName: 'New York, New York', checkIn: '2026-09-07', checkOut: '2026-09-08' };
const canonicalInput = () => {
  const destination = getDestination('geonames:5128581');
  assert.ok(destination);
  return { ...input, destinationId: 'geonames:5128581', cityName: destination.label };
};
const error = (code: string) => (value: unknown) => isRecord(value) && value.code === code && value.status === 400 && typeof value.message === 'string';

test('legacy searches normalize city labels without accepting ambiguous or coerced names', () => {
  assert.equal(validateSearch({ ...input, cityName: '  NEW   YORK, New York  ' }, now).destinationId, 'geonames:5128581');
  for (const cityName of ['New York', { toString: () => 'New York, New York' }])
    assert.throws(() => validateSearch({ ...input, cityName }, now), error('INVALID_CITY'));
});

test('search validates and returns only normalized supported context without mutation', () => {
  const body = { ...input, cityName: '  new York, New York  ' };
  const result = validateSearch(body, now);
  assert.deepEqual(result, { ...canonicalInput(), rooms: 1, adults: 2, childrenAges: [], currency: 'USD' });
  assert.equal(body.cityName, '  new York, New York  ');
  assert.deepEqual(validateSearch(result, now), result);
});

test('supported search currencies survive search and detail validation', () => {
  for (const currency of ['USD', 'EUR', 'GBP', 'CAD', 'AUD']) {
    assert.equal(validateSearch({ ...input, currency }, now).currency, currency);
    assert.equal(validateDetail({ ...input, currency, offerId: 'offer-1' }, now).currency, currency);
  }
});

test('missing, non-object, unsupported and injected request fields have stable errors', () => {
  for (const body of [null, undefined, [], '', 1]) assert.throws(() => validateSearch(body, now), error('INVALID_BODY'));
  assert.throws(() => validateSearch({ ...input, cityName: 'Elsewhere' }, now), error('INVALID_CITY'));
  assert.throws(() => validateSearch({ ...input, handoffUrl: 'https://evil.example' }, now), error('INVALID_FIELDS'));
  assert.throws(() => validateSearch({ ...input, hotelId: 'hotel' }, now), error('INVALID_FIELDS'));
  for (const destinationId of [null, '', 5128581, {}, 'geonames:0', 'geonames:5128581<script>']) {
    assert.throws(() => validateSearch({ ...input, destinationId }, now), error('INVALID_CITY'));
  }
  for (const cityName of [null, {}, 'x'.repeat(201)]) {
    assert.throws(() => validateSearch({ ...input, destinationId: 'geonames:5128581', cityName }, now), error('INVALID_CITY'));
  }
});

test('destination IDs determine the canonical location, never the raw display label', () => {
  const destinationId = 'geonames:293397';
  const destination = getDestination(destinationId);
  assert.ok(destination);
  const result = validateSearch({ ...input, destinationId, cityName: 'Las Vegas, Nevada' }, now);
  assert.equal(result.destinationId, destinationId);
  assert.equal(result.cityName, destination.label);
  assert.equal(validateSearch({ ...input, destinationId, cityName: undefined }, now).cityName, destination.label);
});

test('occupancy preserves selected rooms, adults, children including infants and enforces application bounds', () => {
  const body = { ...input, rooms: 8, adults: 16, childrenAges: [0, 1, 3, 5, 8, 10, 15, 17] };
  const result = validateSearch(body, now);
  assert.deepEqual(result, { ...canonicalInput(), rooms: 8, adults: 16, childrenAges: body.childrenAges, currency: 'USD' });
  result.childrenAges[0] = 7;
  assert.equal(body.childrenAges[0], 0);
  assert.equal(validateSearch({ ...input, adults: 1 }, now).adults, 1);
  for (const rooms of [null, '1', 0, -1, 9, 1.5, Infinity]) {
    assert.throws(() => validateSearch({ ...input, rooms }, now), error('INVALID_ROOMS'));
  }
  for (const adults of [null, '2', 0, -1, 17, 2.5, Infinity]) {
    assert.throws(() => validateSearch({ ...input, adults }, now), error('INVALID_ADULTS'));
  }
  assert.throws(() => validateSearch({ ...input, rooms: 3, adults: 2 }, now), error('INSUFFICIENT_ADULTS'));
  for (const childrenAges of [null, '0,3', 2, Array(9).fill(0)]) {
    assert.throws(() => validateSearch({ ...input, childrenAges }, now), error('INVALID_CHILDREN'));
  }
  for (const childrenAges of [[null], [undefined], ['3'], [-1], [18], [2.5], Array(1)]) {
    assert.throws(() => validateSearch({ ...input, childrenAges }, now), error('INVALID_CHILD_AGE'));
  }
  for (const currency of ['INVALID', 'JPY', 'eur', null]) {
    assert.throws(() => validateSearch({ ...input, currency }, now), error('UNSUPPORTED_CONTEXT'));
  }
});

test('invalid and cleared calendar dates never roll into another month', () => {
  for (const checkIn of [null, '', '2026-02-29', '2026-04-31', '2026-9-07', '2026-09-07T00:00:00Z', 20260907]) {
    assert.throws(() => validateSearch({ ...input, checkIn }, now), error('INVALID_CHECK_IN'));
  }
  assert.throws(() => validateSearch({ ...input, checkOut: 'bad' }, now), error('INVALID_CHECK_OUT'));
  assert.doesNotThrow(() => validateSearch({ ...input, checkIn: '2028-02-29', checkOut: '2028-03-01' }, '2028-02-01T12:00:00Z'));
});

test('dates respect the booking horizon with server timezone grace and a 30-night limit', () => {
  const latest = addCalendarDays(input.checkIn, 365);
  assert.doesNotThrow(() => validateSearch({ ...input, checkIn: addCalendarDays(latest, -30), checkOut: latest }, now));
  assert.throws(() => validateSearch({ ...input, checkIn: '2227-05-04', checkOut: '2227-05-05' }, now), error('CHECK_IN_TOO_FAR'));
  assert.throws(() => validateSearch({ ...input, checkOut: addCalendarDays(latest, 2) }, now), error('CHECK_OUT_TOO_FAR'));
  assert.throws(() => validateSearch({ ...input, checkOut: '2027-08-01' }, now), error('STAY_TOO_LONG'));
  assert.doesNotThrow(() => validateSearch({ ...input, checkOut: addCalendarDays(input.checkIn, 30) }, now));
  assert.throws(() => validateSearch({ ...input, checkOut: addCalendarDays(input.checkIn, 31) }, now), error('STAY_TOO_LONG'));
});

test('date ordering and midnight grace preserve local same-day searches without shifting dates', () => {
  for (const checkOut of ['2026-09-06', '2026-09-07']) {
    assert.throws(() => validateSearch({ ...input, checkOut }, now), error('INVALID_DATE_RANGE'));
  }
  assert.doesNotThrow(() => validateSearch(input, '2026-09-07T23:59:59.999Z'));
  assert.equal(validateSearch(input, '2026-09-08T00:00:00.000Z').checkIn, '2026-09-07');
  assert.throws(() => validateSearch(input, '2026-09-09T00:00:00.000Z'), error('PAST_CHECK_IN'));
  assert.deepEqual(validateSearch(input, '2026-09-07T01:00:00-07:00'), validateSearch(input, '2026-09-07T08:00:00Z'));
  assert.throws(() => validateSearch(input, 'not a clock'), TypeError);
});

test('DST and year boundaries keep travel dates as calendar values', () => {
  for (const [checkIn, checkOut, clock] of [
    ['2026-03-08', '2026-03-09', '2026-03-09T01:00:00Z'],
    ['2026-11-01', '2026-11-02', '2026-11-02T01:00:00Z'],
    ['2026-12-31', '2027-01-01', '2027-01-01T01:00:00Z'],
  ]) {
    const result = validateSearch({ ...input, checkIn, checkOut }, clock);
    assert.equal(result.checkIn, checkIn);
    assert.equal(result.checkOut, checkOut);
  }
});

test('detail requires an offer and strictly validates an optional hotel while preserving context', () => {
  const opaqueId = 'A9'.repeat(168);
  assert.equal(validateDetail({ ...input, offerId: opaqueId, hotelId: '49205' }, now).offerId, opaqueId);
  assert.deepEqual(validateDetail({ ...input, offerId: 'offer:12', hotelId: 'hotel_3' }, now), {
    ...canonicalInput(), rooms: 1, adults: 2, childrenAges: [], currency: 'USD', offerId: 'offer:12', hotelId: 'hotel_3',
  });
  for (const offerId of [null, '', 12, ' a', '../x', '<script>', 'x'.repeat(1025)]) {
    assert.throws(() => validateDetail({ ...input, offerId, hotelId: 'hotel' }, now), error('INVALID_OFFER_ID'));
  }
  assert.equal(validateDetail({ ...input, offerId: 'offer' }, now).hotelId, undefined);
  for (const hotelId of [undefined, null, '', 12, ' a', '../x', '<script>', 'x'.repeat(201)]) {
    assert.throws(() => validateDetail({ ...input, offerId: 'offer', hotelId }, now), error('INVALID_HOTEL_ID'));
  }
});

test('detail ignores inherited optional hotel IDs', () => {
  const body = { ...input, offerId: 'offer' };
  const inherited: unknown = Object.assign(Object.create({ hotelId: 'hotel' }), body);
  const result = validateDetail(inherited, now);
  assert.deepEqual(result, validateDetail(body, now));
  assert.equal(Object.hasOwn(result, 'hotelId'), false);
});
