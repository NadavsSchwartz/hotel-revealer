import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getDestination, resolveLegacyCity, searchDestinations } from './index.js';
import legacyDestinations from './fixtures/legacy-destinations.json' with { type: 'json' };

test('worldwide source includes cities beyond a US or popular-city shortlist', () => {
  const metadata = JSON.parse(readFileSync(new URL('../../data/destinations-source.json', import.meta.url), 'utf8'));
  assert.ok(metadata.catalogCount > 50000);
  assert.ok(metadata.countryCount > 200);
  assert.equal(searchDestinations('Tel Aviv')[0].id, 'geonames:293397');
  assert.equal(searchDestinations('תל אביב')[0].id, 'geonames:293397');
  assert.equal(searchDestinations('Zikhron Yaaqov')[0].id, 'geonames:293067');
  assert.equal(searchDestinations('Karmiel')[0].id, 'geonames:294577');
  assert.equal(searchDestinations('Luang Prabang')[0].countryCode, 'LA');
});

test('country searches suggest actual cities in that country', () => {
  for (const query of ['Israel', 'ישראל', 'IL', 'ISR']) {
    const results = searchDestinations(query);
    assert.equal(results.length, 8);
    assert.ok(results.every(city => city.countryCode === 'IL' && city.id.startsWith('geonames:')));
    assert.ok(results.some(city => city.id === 'geonames:293397'));
    assert.ok(results.every(city => city.name !== 'Israel'));
  }
  assert.ok(searchDestinations('Isra').some(city => city.id === 'geonames:293397'));
});

test('accents and source aliases resolve the same stable destination', () => {
  assert.equal(searchDestinations('São Paulo')[0].id, searchDestinations('Sao Paulo')[0].id);
  assert.equal(searchDestinations('Munich')[0].id, searchDestinations('München')[0].id);
  assert.equal(searchDestinations('Tel-Aviv')[0].id, 'geonames:293397');
  assert.equal(searchDestinations('Walla Walla')[0].name, 'Walla Walla');
  assert.equal(searchDestinations('Baden-Baden')[0].name, 'Baden-Baden');
});

test('scan admission runs only for catalog searches, not short, invalid or exact-country queries', () => {
  let scans = 0;
  const options = { beforeScan: () => { scans++; } };
  for (const query of ['', 'x', null, 'a'.repeat(101), 'Israel']) searchDestinations(query, options);
  assert.equal(scans, 0);
  searchDestinations('san', options);
  assert.equal(scans, 1);
});

test('country qualifiers and regions distinguish similarly named cities', () => {
  assert.equal(searchDestinations('Paris France')[0].countryCode, 'FR');
  assert.equal(searchDestinations('Paris Texas')[0].regionName, 'Texas');
  const oregon = searchDestinations('Portland Oregon')[0];
  const maine = searchDestinations('Portland Maine')[0];
  assert.notEqual(oregon.id, maine.id);
  assert.notEqual(oregon.label, maine.label);
  assert.equal(searchDestinations('Israel Tel Aviv')[0].id, 'geonames:293397');
  assert.equal(searchDestinations('Tel Aviv, IL')[0].id, 'geonames:293397');
  assert.equal(searchDestinations('Panama City Florida')[0].countryCode, 'US');
  assert.equal(searchDestinations('San Marino California')[0].regionName, 'California');
});

test('ambiguous country codes fall back to state codes only when the country has no matches', () => {
  for (const [query, id, regionName] of [
    ['Los Angeles CA', 'geonames:5368361', 'California'],
    ['San Francisco CA', 'geonames:5391959', 'California'],
    ['Chicago IL', 'geonames:4887398', 'Illinois'],
  ]) {
    const city = searchDestinations(query)[0];
    assert.equal(city?.id, id, query);
    assert.equal(city.countryCode, 'US');
    assert.equal(city.regionName, regionName);
  }
  assert.equal(searchDestinations('Tel Aviv IL')[0].id, 'geonames:293397');
  assert.ok(searchDestinations('IL').every(city => city.countryCode === 'IL'));
  assert.ok(searchDestinations('CA').every(city => city.countryCode === 'CA'));
  assert.equal(searchDestinations('Richmond CA')[0].countryCode, 'CA');
  assert.deepEqual(searchDestinations('Chicago Canada'), []);
});

test('lookup rejects unknown IDs and does not trust an unverified city label', () => {
  const city = getDestination('geonames:293397');
  assert.equal(city.name, 'Tel Aviv');
  assert.equal(city.countryCode, 'IL');
  assert.equal(city.timezone, 'Asia/Jerusalem');
  assert.ok(Number.isFinite(city.latitude) && Number.isFinite(city.longitude));
  for (const id of ['geonames:9999999999', '293397', 'geonames:0293397', {}, null]) {
    assert.equal(getDestination(id), null);
  }
  assert.ok(Object.isFrozen(city));
});

test('all original city+state URLs retain an exact geographic identity', () => {
  assert.equal(legacyDestinations.length, 1000);
  for (const [label, id] of legacyDestinations) assert.equal(resolveLegacyCity(label)?.id, id, label);
  const bridge = JSON.parse(readFileSync(new URL('../../data/destinations-legacy-public.json', import.meta.url), 'utf8'));
  for (const [originalLabel, id, label] of bridge) {
    assert.equal(resolveLegacyCity(originalLabel).id, id);
    assert.equal(getDestination(id).label, label);
  }
  assert.equal(resolveLegacyCity(' New York,  New York ').id, 'geonames:5128581');
  assert.equal(resolveLegacyCity('Las Vegas, Nevada').id, 'geonames:5506956');
  assert.equal(resolveLegacyCity('Portland, Maine').regionName, 'Maine');
  assert.equal(resolveLegacyCity('Portland, Oregon').regionName, 'Oregon');
  assert.equal(resolveLegacyCity('Las Vegas'), null);
  assert.equal(resolveLegacyCity('Tel Aviv, Israel'), null);
});

test('queries and results are bounded, deterministic, and tolerate malformed input', () => {
  for (const query of [undefined, null, [], {}, 123, '', ' ', 'x', 'a'.repeat(101), 'Tel\u0000Aviv', 'zzqxxunlistedplace']) {
    assert.deepEqual(searchDestinations(query), []);
  }
  assert.equal(searchDestinations('United States', { limit: 100000 }).length, 10);
  assert.equal(searchDestinations('United States', { limit: NaN }).length, 8);
  assert.equal(searchDestinations('United States', { limit: 2 }).length, 2);
});

test('candidate indexing preserves ranked prefixes, context, Unicode and country fallbacks', () => {
  for (const [query, ids] of [
    ['san', ['2451778', '2282099', '5391811']],
    ['new y', ['5128581', '2272790', '1642911']],
    ['תל אביב', ['293397']],
    ['東京', ['1850147']],
    ['Isra', ['294615', '6278857', '281184']],
    ['United', ['13680011', '4959799', '2643743']],
    ['Los Angeles CA', ['5368361', '5344994', '5364571']],
    ['Chicago IL', ['4887398', '4887463', '8436065']],
    ['Richmond CA', ['6122085', '6122084', '6122091']],
    ['a b', ['2293538', '2352778', '292968']],
    ['Panama City Florida', ['4167694', '4167695']],
  ]) {
    assert.deepEqual(searchDestinations(query, { limit: 3 }).map(city => city.id), ids.map(id => `geonames:${id}`), query);
  }
});
