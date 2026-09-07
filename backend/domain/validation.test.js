import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDetail, validateSearch } from './index.js';
import { canonicalCityName, cityNames } from '../../shared/cities.js';

const now = new Date('2026-09-07T12:00:00Z');
const input = { cityName: 'New York, New York', checkIn: '2026-09-07', checkOut: '2026-09-08' };
const error = code => value => value.code === code && value.status === 400 && typeof value.message === 'string';

test('canonical cities retain all 1,000 unique original choices', () => {
  assert.equal(cityNames.length, 1000);
  assert.equal(new Set(cityNames).size, 1000);
  assert.equal(canonicalCityName('  NEW   YORK, New York  '), 'New York, New York');
  assert.equal(canonicalCityName('New York'), null);
  assert.equal(canonicalCityName({ toString: () => 'New York, New York' }), null);
});

test('search validates and returns only normalized supported context without mutation', () => {
  const body = { ...input, cityName: '  new York, New York  ' };
  const result = validateSearch(body, now);
  assert.deepEqual(result, { ...input, rooms: 1, adults: 2, currency: 'USD' });
  assert.equal(body.cityName, '  new York, New York  ');
  assert.deepEqual(validateSearch(result, now), result);
});

test('missing, non-object, unsupported and injected request fields have stable errors', () => {
  for (const body of [null, undefined, [], '', 1]) assert.throws(() => validateSearch(body, now), error('INVALID_BODY'));
  assert.throws(() => validateSearch({ ...input, cityName: 'Elsewhere' }, now), error('INVALID_CITY'));
  assert.throws(() => validateSearch({ ...input, handoffUrl: 'https://evil.example' }, now), error('INVALID_FIELDS'));
  assert.throws(() => validateSearch({ ...input, hotelId: 'hotel' }, now), error('INVALID_FIELDS'));
});

test('only explicitly supported occupancy and currency values are accepted', () => {
  for (const extra of [{ rooms: 2 }, { rooms: '1' }, { adults: 1 }, { adults: '2' }, { currency: 'EUR' }, { currency: null }]) {
    assert.throws(() => validateSearch({ ...input, ...extra }, now), error('UNSUPPORTED_CONTEXT'));
  }
});

test('invalid and cleared calendar dates never roll into another month', () => {
  for (const checkIn of [null, '', '2026-02-29', '2026-04-31', '2026-9-07', '2026-09-07T00:00:00Z', 20260907]) {
    assert.throws(() => validateSearch({ ...input, checkIn }, now), error('INVALID_CHECK_IN'));
  }
  assert.throws(() => validateSearch({ ...input, checkOut: 'bad' }, now), error('INVALID_CHECK_OUT'));
  assert.doesNotThrow(() => validateSearch({ ...input, checkIn: '2028-02-29', checkOut: '2028-03-01' }, now));
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

test('detail requires both distinct wire IDs and preserves canonical search context', () => {
  assert.deepEqual(validateDetail({ ...input, offerId: 'offer:12', hotelId: 'hotel_3' }, now), {
    ...input, rooms: 1, adults: 2, currency: 'USD', offerId: 'offer:12', hotelId: 'hotel_3',
  });
  for (const offerId of [null, '', 12, ' a', '../x', '<script>', 'x'.repeat(201)]) {
    assert.throws(() => validateDetail({ ...input, offerId, hotelId: 'hotel' }, now), error('INVALID_OFFER_ID'));
  }
  assert.throws(() => validateDetail({ ...input, offerId: 'offer' }, now), error('INVALID_HOTEL_ID'));
});
