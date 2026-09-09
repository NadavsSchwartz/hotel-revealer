import test from 'node:test';
import assert from 'node:assert/strict';
import { validDestinationResponse } from './destinationResponse.js';

const destination = {
  id: 'geonames:5506956', name: 'Las Vegas', label: 'Las Vegas, United States',
  regionName: 'Nevada', countryName: 'United States', latitude: 36.17497, longitude: -115.13722,
};

test('destination responses accept empty results, consumed fields, and unknown extra fields', () => {
  assert.equal(validDestinationResponse({ destinations: [] }), true);
  assert.equal(validDestinationResponse({ destinations: [destination], query: 'Las Vegas' }), true);
  assert.equal(validDestinationResponse({ destinations: [{ ...destination, timezone: 'America/Los_Angeles' }] }), true);
  const { regionName: _region, countryName: _country, ...withoutOptionalText } = destination;
  assert.equal(validDestinationResponse({ destinations: [withoutOptionalText] }), true);
});

test('destination responses reject missing or malformed result lists', () => {
  for (const body of [undefined, null, false, 'destinations', [], {}, { destinations: null }, { destinations: {} }])
    assert.equal(validDestinationResponse(body), false, JSON.stringify(body));
});

test('one malformed destination rejects the complete response before any option is used', () => {
  const malformed = [
    null, false, 'Las Vegas', [], {},
    ...['', '5506956', 'geonames:0', 'geonames:01', 'geonames:12345678901'].map(id => ({ ...destination, id })),
    ...[undefined, null, {}, '', ' '].flatMap(value => [
      { ...destination, name: value }, { ...destination, label: value },
    ]),
    ...[undefined, null, '36.17', NaN, Infinity].flatMap(value => [
      { ...destination, latitude: value }, { ...destination, longitude: value },
    ]),
    { ...destination, regionName: {} }, { ...destination, countryName: null },
  ];
  for (const invalid of malformed)
    assert.equal(validDestinationResponse({ destinations: [destination, invalid] }), false, JSON.stringify(invalid));
});
