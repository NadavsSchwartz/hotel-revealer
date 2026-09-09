import test from 'node:test';
import assert from 'node:assert/strict';
import { matchListings, matchObservations, MatchLimitError, MAX_MATCH_COMPARISONS, MAX_MATCH_CANDIDATES } from './index.ts';

const hotel = (fields = {}) => ({
  hotelId: 'hotel1', name: 'Example Hotel', starRating: 4, overallGuestRating: 8.5, totalReviewCount: 1250,
  location: { cityId: 'city1', neighborhoodID: 'area1', neighborhoodName: 'Central' },
  ratesSummary: { programName: 'Retail', minPrice: '150', minCurrencyCode: 'USD' },
  hotelFeatures: { highlightedAmenities: ['WIFI', 'POOL'] }, amenitiesIcons: [{ iconName: 'wifi' }],
  thumbnailUrl: 'https://images.priceline.com/hotel.jpg', ...fields,
});
const offer = (fields = {}) => ({
  ...hotel(), pclnId: 'offer1', overallGuestRating: 8, totalReviewCount: 1200,
  ratesSummary: { programName: 'Express_Deal', minPrice: '100', minStrikePrice: '150', minCurrencyCode: 'USD' },
  handoffUrl: 'https://www.priceline.com/original-offer', ...fields,
});
const resolved = (offers: unknown, hotels: unknown, options?: Parameters<typeof matchListings>[2]) => matchListings(offers, hotels, options).offers[0];

test('zero, one, and multiple hotel identities resolve without selecting an arbitrary match', () => {
  for (const [hotels, resolution, expectedIds] of [
    [[], { status: 'unresolved', reason: 'no_match' }, []],
    [[hotel()], { status: 'matched' }, ['hotel1']],
    [[hotel(), hotel({ hotelId: 'hotel2' })], { status: 'unresolved', reason: 'ambiguous' }, []],
    [[hotel(), hotel(), hotel({ hotelId: 'hotel1', ratesSummary: { programName: 'Retail', minPrice: '151' } })],
      { status: 'matched' }, ['hotel1']],
  ]) {
    const result = resolved([offer()], hotels);
    assert.deepEqual(result.resolution, resolution);
    assert.deepEqual(result.candidates.map(candidate => candidate.hotelId), expectedIds);
    if (result.candidates.length) {
      assert.equal(Reflect.get(result.candidates[0], 'tier'), undefined);
      assert.equal(Reflect.get(result.candidates[0], 'evidence'), undefined);
    }
  }
});

test('resolution precedence keeps incomplete coverage and missing facts ahead of ambiguity', () => {
  const many = [hotel(), hotel({ hotelId: 'hotel2' })];
  for (const hotels of [[], [hotel()], many]) {
    for (const input of [offer(), offer({ amenitiesIcons: null })]) {
      assert.deepEqual(resolved([input], hotels, { coverageStatus: 'partial' }).resolution,
        { status: 'unresolved', reason: 'incomplete_search' });
    }
  }
  assert.deepEqual(resolved([offer({ ratesSummary: { ...offer().ratesSummary, minStrikePrice: null } })], many).resolution,
    { status: 'unresolved', reason: 'missing_facts' });
  assert.deepEqual(resolved([offer()], [...many, hotel({ name: 'Conflicting name' })]).resolution,
    { status: 'unresolved', reason: 'missing_facts' });
});

test('matching uses strict raw prices, stars and neighborhoods before display normalization', () => {
  for (const fields of [
    { starRating: '4' }, { location: { neighborhoodID: 1 } },
    { ratesSummary: { programName: 'Retail', minPrice: '150.0' } },
    { ratesSummary: { programName: 'Retail', minPrice: 150 } },
    { hotelFeatures: { highlightedAmenities: ['POOL', 'WIFI'] } },
    { amenitiesIcons: [{ iconName: 'pool' }] },
  ]) {
    assert.deepEqual(resolved([offer()], [hotel(fields)]).resolution, { status: 'unresolved', reason: 'no_match' });
  }
  const result = resolved([offer()], [hotel()]);
  assert.deepEqual(result.resolution, { status: 'matched' });
  assert.ok(result.candidates[0]);
  assert.deepEqual(result.candidates[0].amenities, ['POOL', 'WIFI']);
});

test('conflicting offer observations cannot be joined into an identification', () => {
  const rows = [offer(), offer({ starRating: 5 })];
  const expected = resolved(rows, [hotel()]);
  assert.deepEqual(expected.resolution, { status: 'unresolved', reason: 'missing_facts' });
  assert.deepEqual(expected.candidates, []);
  assert.deepEqual(resolved(rows.toReversed(), [hotel()]), expected);
  assert.deepEqual(resolved([offer(), offer({ amenitiesIcons: null })], [hotel()]).resolution,
    { status: 'unresolved', reason: 'missing_facts' });
});

test('incoherent or unsafe matching hotel identities remain missing facts', () => {
  for (const [hotels, reason] of [
    [[hotel({ name: null })], 'missing_facts'],
    [[hotel({ hotelId: ' bad id ' })], 'missing_facts'],
    [[hotel(), hotel({ starRating: 5 })], 'missing_facts'],
    [[hotel(), hotel({ starRating: 5, name: null })], 'missing_facts'],
    [[hotel({ starRating: 5, name: null }), hotel()], 'missing_facts'],
    [[hotel(), hotel({ overallGuestRating: null })], 'missing_facts'],
    [[hotel({ overallGuestRating: undefined }), hotel({ totalReviewCount: undefined })], 'no_match'],
  ]) {
    const result = resolved([offer()], hotels);
    assert.equal(result.resolution.status, 'unresolved');
    assert.equal(result.candidates.length, 0);
    assert.equal(result.resolution.reason, reason);
  }
});

test('conflicting known cities within one identity remain unresolved while optional city facts add no matching rule', () => {
  const elsewhere = { ...hotel().location, cityId: 'city2' };
  for (const [offers, hotels] of [
    [[offer()], [hotel(), hotel({ location: elsewhere })]],
    [[offer(), offer({ location: elsewhere })], [hotel()]],
  ]) {
    assert.deepEqual(resolved(offers, hotels).resolution, { status: 'unresolved', reason: 'missing_facts' });
  }
  const unknown = { ...hotel().location, cityId: null };
  assert.deepEqual(resolved([offer()], [hotel(), hotel({ location: unknown })]).resolution, { status: 'matched' });
  // The original matcher compares neighborhood IDs, not city IDs. This guard
  // checks contradictory observations of one identity, not offer/hotel cities.
  assert.deepEqual(resolved([offer()], [hotel({ location: elsewhere })]).resolution, { status: 'matched' });
});

test('safe public display facts and input ownership survive the raw matcher', () => {
  const input = { offers: [offer()], hotels: [hotel({ thumbnailUrl: 'https://evil.test/photo' })] };
  const before = structuredClone(input);
  const result = resolved(input.offers, input.hotels);
  assert.equal(result.handoffUrl, 'https://www.priceline.com/original-offer');
  assert.ok(result.candidates[0]);
  assert.equal(result.candidates[0].thumbnailUrl, null);
  result.candidates[0].amenities.push('SPA');
  assert.deepEqual(input, before);
  assert.deepEqual(matchListings(null, undefined), { offers: [], unassessedHotels: 0, invalidRows: 0 });
});

test('raw duplicate observations in the same bucket count toward the actual comparison limit', () => {
  const offers = Array.from({ length: 100 }, () => offer());
  const hotels = Array.from({ length: 1000 }, () => hotel({ overallGuestRating: 1 }));
  assert.equal(matchObservations(offers, hotels).comparisons, MAX_MATCH_COMPARISONS);
  assert.deepEqual(resolved(offers, hotels).resolution, { status: 'unresolved', reason: 'no_match' });
  assert.throws(() => matchListings([...offers, offer()], hotels), error =>
    error instanceof MatchLimitError && error.status === 503 && error.code === 'RESULT_TOO_LARGE');
});

test('large inventories with contradictory neighborhoods and stars do not exhaust comparison work', () => {
  const offers = Array.from({ length: 200 }, (_, index) => offer({ pclnId: `offer-${index}` }));
  const hotels = Array.from({ length: 800 }, (_, index) => hotel({ hotelId: `hotel-${index}`,
    ...(index % 2 ? { starRating: 5 } : { location: { neighborhoodID: 'other-area' } }) }));
  assert.ok(offers.length * hotels.length > MAX_MATCH_COMPARISONS);
  assert.deepEqual(matchObservations(offers, hotels), { pairs: [], comparisons: 0, rejectedOffers: 0, rejectedHotels: 0 });
  assert.ok(matchListings(offers, hotels).offers.every(item => item.resolution.reason === 'no_match'));
});

test('retained raw matches are bounded before distinct identity grouping', () => {
  const repeated = Array.from({ length: MAX_MATCH_CANDIDATES }, () => hotel());
  assert.equal(matchObservations([offer()], repeated).pairs.length, MAX_MATCH_CANDIDATES);
  assert.deepEqual(resolved([offer()], repeated).resolution, { status: 'matched' });
  assert.throws(() => matchListings([offer()], [...repeated, hotel({ hotelId: 'alternative' })]), MatchLimitError);
});

test('missing hotel facts are counted by distinct identity, never duplicate rates', () => {
  const invalid = hotel({ hotelId: 'missing', amenitiesIcons: null });
  const result = matchListings([offer(), offer({ pclnId: 'offer2' })], [hotel(), invalid, invalid]);
  assert.equal(result.unassessedHotels, 1);
  assert.equal(result.offers.every(item => item.resolution.status === 'matched'), true);
});
