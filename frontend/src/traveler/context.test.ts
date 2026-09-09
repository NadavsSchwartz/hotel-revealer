import test from 'node:test';
import assert from 'node:assert/strict';
import type { Currency, TripContext } from '../../../shared/contracts.ts';
import { contextFromSearch, contextKey, money, safeHref, searchUrl, validateContext } from './context.ts';
import legacyDestinations from '../../../backend/destinations/fixtures/legacy-destinations.json' with { type: 'json' };

test('legacy URLs retain the destination identity of all 1,000 original city choices', () => {
  assert.equal(legacyDestinations.length, 1000);
  for (const [cityName, destinationId] of legacyDestinations)
    assert.equal(contextFromSearch(`?${new URLSearchParams({ cityName })}`).destinationId, destinationId, cityName);
});

test('money displays integer cents as USD and rejects missing or invalid amounts', () => {
  for (const [cents, expected] of [
    [0, '$0'], [1, '$0.01'], [100, '$1'], [110, '$1.10'],
    [11999, '$119.99'], [123456, '$1,234.56'],
  ] satisfies [number, string][]) assert.equal(money(cents), expected, String(cents));
  for (const value of [undefined, null, '', '100', -1, 1.5, NaN, Infinity])
    assert.equal(money(value), null, String(value));
});

test('money formats the quote currency without converting or guessing unsupported currencies', () => {
  for (const [currency, expected] of [['EUR', '€119.99'], ['GBP', '£119.99'], ['CAD', 'CA$119.99'], ['AUD', 'A$119.99']] satisfies [Currency, string][]) {
    assert.equal(money(11999, currency), expected);
  }
  for (const currency of [null, 'INVALID', 'JPY', 'eur']) assert.equal(money(11999, currency), null);
});

test('safeHref preserves HTTPS links and restricts booking links to the provider', () => {
  for (const [value, expected] of [
    ['https://priceline.com/offer', 'https://priceline.com/offer'],
    ['https://www.priceline.com:443/offer', 'https://www.priceline.com/offer'],
    ['https://www.priceline.com.evil.example/offer', null],
    ['https://priceline.example/offer', null],
    ['https://other.priceline.com/offer', null],
    ['https://www.priceline.com:8443/offer', null],
  ] satisfies [string, string | null][]) assert.equal(safeHref(value, true), expected, String(value));

  for (const value of [
    undefined, null, '', '/offer', 'not a URL', 'http://www.priceline.com/offer',
    'javascript:alert(1)', 'data:text/html,hello',
    'https://user@www.priceline.com/offer', 'https://user:password@www.priceline.com/offer',
  ]) {
    assert.equal(safeHref(value), null, String(value));
    assert.equal(safeHref(value, true), null, String(value));
  }
  const image = 'https://images.example.com:8443/hotel.jpg';
  assert.equal(safeHref(image), image);
  assert.equal(safeHref(image, true), null);
});

test('date rollover keeps a saved trip intact while blocking a new request for its past check-in', () => {
  const trip: TripContext = {
    destinationId: 'geonames:5506956', cityName: 'Las Vegas, Nevada',
    checkIn: '2027-01-10', checkOut: '2027-01-12', rooms: 2, adults: 3, childrenAges: [7], currency: 'USD',
  };
  const saved = contextFromSearch(searchUrl(trip).split('?')[1]);
  assert.deepEqual(validateContext(saved, new Date(2027, 0, 10, 23, 59)).errors, {});
  const afterMidnight = validateContext(saved, new Date(2027, 0, 11));
  assert.equal(afterMidnight.errors.checkIn, 'Check-in must be today or later.');
  assert.deepEqual(afterMidnight.context, trip);
  assert.equal(contextKey(afterMidnight.context), contextKey(saved));
  const edited = { ...saved, checkIn: '2027-01-11' };
  assert.notEqual(contextKey(edited), contextKey(saved));
  assert.equal(saved.checkIn, '2027-01-10');
});
