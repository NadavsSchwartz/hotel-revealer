import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFromSearch, money, safeHref } from './context.js';
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
  ]) assert.equal(money(cents), expected, String(cents));
  for (const value of [undefined, null, '', '100', -1, 1.5, NaN, Infinity])
    assert.equal(money(value), null, String(value));
});

test('safeHref preserves HTTPS links and restricts booking links to the provider', () => {
  for (const [value, expected] of [
    ['https://priceline.com/offer', 'https://priceline.com/offer'],
    ['https://www.priceline.com:443/offer', 'https://www.priceline.com/offer'],
    ['https://www.priceline.com.evil.example/offer', null],
    ['https://priceline.example/offer', null],
    ['https://other.priceline.com/offer', null],
    ['https://www.priceline.com:8443/offer', null],
  ]) assert.equal(safeHref(value, true), expected, value);

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
