import test from 'node:test';
import assert from 'node:assert/strict';
import { compareNumericClue, matchOffers, matchListings, countUnassessedHotels, MatchLimitError, MAX_MATCH_COMPARISONS, MAX_MATCH_CANDIDATES } from './index.js';

const quote = (nightlyCents = 10000, taxesFees = 'unknown') => ({ nightlyCents, stayCents: null, currency: 'USD', taxesFees });
const hotel = (hotelId = 'hotel1', fields = {}) => ({
  hotelId, name: `Hotel ${hotelId}`, neighborhoodId: 'area1', neighborhoodName: 'Central', stars: 4,
  guestRating: 8.5, reviewCount: 1250, amenities: ['POOL', 'WIFI'], amenitiesComplete: false,
  thumbnailUrl: null, retailQuote: quote(12000), ...fields,
});
const offer = (fields = {}) => ({
  offerId: 'offer1', neighborhoodId: 'area1', neighborhoodName: 'Central', stars: 4,
  quote: quote(), handoffUrl: null,
  clues: { guestRating: { kind: 'minimum', value: 8 }, reviewCount: { kind: 'range', min: 1200, max: 1299 }, amenities: { codes: ['WIFI'], complete: false } },
  ...fields,
});

test('numeric clues obey tagged exact, minimum, inclusive range and unknown semantics', () => {
  for (const [clue, value, expected] of [
    [{ kind: 'exact', value: 8 }, '8', 'match'], [{ kind: 'exact', value: 8 }, 8.1, 'contradiction'],
    [{ kind: 'minimum', value: 8 }, 8, 'match'], [{ kind: 'minimum', value: 8 }, 9, 'match'], [{ kind: 'minimum', value: 8 }, 7.9, 'contradiction'],
    [{ kind: 'range', min: 100, max: 199 }, 100, 'match'], [{ kind: 'range', min: 100, max: 199 }, 199, 'match'], [{ kind: 'range', min: 100, max: 199 }, 200, 'contradiction'],
    [{ kind: 'unknown' }, 100, 'unknown'], [{ kind: 'exact', value: 8 }, null, 'unknown'],
    [{ kind: 'range', min: 9, max: 8 }, 8, 'unknown'], [8, 8, 'unknown'],
  ]) assert.equal(compareNumericClue(clue, value), expected);
});

test('all three comparable extra families yield supported, one or two yield partial', () => {
  const result = matchOffers([offer()], [hotel('full'), hotel('partial', { reviewCount: null }), hotel('unassessed', { reviewCount: null, guestRating: null, amenities: null })])[0];
  assert.deepEqual(result.candidates.map(candidate => [candidate.hotelId, candidate.tier]), [['full', 'supported'], ['partial', 'partial']]);
  assert.deepEqual(result.candidates[1].evidence.missing, ['Review count cannot be compared']);
  assert.equal(result.unassessedCount, 1);
});

test('same neighborhood and stars alone do not produce a plausible candidate', () => {
  const result = matchOffers([offer({ clues: { guestRating: { kind: 'unknown' }, reviewCount: { kind: 'unknown' }, amenities: null } })], [hotel()])[0];
  assert.deepEqual(result.candidates, []);
  assert.equal(result.unassessedCount, 1);
});

test('public comparisons retain the actual clue values and distinguish missing information', () => {
  const original = offer();
  const result = matchOffers([original], [hotel('partial', { reviewCount: null })])[0];
  assert.deepEqual(result.clues, original.clues);
  assert.deepEqual(result.candidates[0].evidence.comparisons, {
    neighborhood: 'match', stars: 'match', guestRating: 'match', reviewCount: 'unknown', amenities: 'match',
  });
  result.clues.guestRating.value = 10;
  result.clues.amenities.codes.push('SPA');
  assert.equal(original.clues.guestRating.value, 8);
  assert.deepEqual(original.clues.amenities.codes, ['WIFI']);
});

test('coverage counts unique unassessed hotel IDs across offers', () => {
  const offers = [offer(), offer({ offerId: 'offer2' })];
  const hotels = [hotel('unassessed', { neighborhoodId: null }), hotel('unassessed', { neighborhoodId: null }), hotel('supported')];
  assert.equal(countUnassessedHotels(offers, hotels), 1);
  assert.equal(countUnassessedHotels([], hotels), 0);
});

test('known contradictions exclude hotels; missing baseline evidence is unassessed', () => {
  const result = matchOffers([offer({ cityId: 'city1' })], [
    hotel('badStars', { stars: 5 }), hotel('badArea', { neighborhoodId: 'area2' }), hotel('badCity', { cityId: 'city2' }),
    hotel('badRating', { guestRating: 7.9 }), hotel('badReviews', { reviewCount: 1199 }),
    hotel('missingArea', { neighborhoodId: null }), hotel('missingStars', { stars: null }), hotel('noCity'),
  ])[0];
  assert.deepEqual(result.candidates.map(candidate => candidate.hotelId), ['noCity']);
  assert.equal(result.unassessedCount, 2);
});

test('advertised amenities compare sets, extra named amenities are harmless, missing is contradiction only for complete named inventory', () => {
  const result = matchOffers([offer()], [
    hotel('extra', { amenities: ['SPA', 'WIFI', 'POOL', 'WIFI'] }),
    hotel('incomplete', { amenities: ['POOL'], amenitiesComplete: false }),
    hotel('complete', { amenities: ['POOL'], amenitiesComplete: true }),
    hotel('missing', { amenities: null, amenitiesComplete: true }),
  ])[0];
  assert.deepEqual(result.candidates.map(candidate => [candidate.hotelId, candidate.tier]), [['extra', 'supported'], ['incomplete', 'partial'], ['missing', 'partial']]);
  assert.equal(result.candidates[1].evidence.missing.includes('Advertised amenities cannot be compared'), true);
});

test('empty advertised amenity list is no extra evidence family', () => {
  const result = matchOffers([offer({ clues: { guestRating: { kind: 'unknown' }, reviewCount: { kind: 'unknown' }, amenities: { codes: [], complete: true } } })], [hotel()])[0];
  assert.equal(result.candidates.length, 0);
  assert.equal(result.unassessedCount, 1);
});

test('amenity preparation preserves normalized codes and unknown invalid inventories', () => {
  const input = offer({ clues: { guestRating: { kind: 'unknown' }, reviewCount: { kind: 'unknown' },
    amenities: { codes: [{ code: 123 }, 'WIFI', 'WIFI'], complete: false } } });
  const result = matchOffers([input], [
    hotel('valid', { amenities: ['WIFI', '123', 'POOL'] }),
    hotel('invalid', { amenities: ['WIFI', null], amenitiesComplete: true }),
    hotel('oversized', { amenities: Array(101).fill('WIFI'), amenitiesComplete: true }),
  ])[0];
  assert.deepEqual(result.candidates.map(candidate => candidate.hotelId), ['valid']);
  assert.equal(result.unassessedCount, 2);
  assert.equal(result.candidates[0].evidence.comparisons.amenities, 'match');
  assert.deepEqual(result.clues, input.clues);
});

test('ambiguous candidates are all retained with stable ID tie breaks and no winner claim', () => {
  const result = matchOffers([offer()], [hotel('z'), hotel('a'), hotel('m')])[0];
  assert.deepEqual(result.candidates.map(candidate => candidate.hotelId), ['a', 'm', 'z']);
  assert.equal(Object.hasOwn(result, 'winner'), false);
  assert.equal(result.candidates.every(candidate => !Object.hasOwn(candidate, 'confidence')), true);
});

test('price drift never excludes a candidate or changes evidence tier', () => {
  const before = matchOffers([offer()], [hotel('a'), hotel('b')]);
  const after = matchOffers([offer({ quote: quote(5000) })], [hotel('a', { retailQuote: quote(1) }), hotel('b', { retailQuote: quote(999999) })]);
  assert.deepEqual(after[0].candidates, before[0].candidates);
});

test('price ordering uses comparable basis only inside the same evidence tier', () => {
  const result = matchOffers([offer({ quote: quote(10000, 'included') })], [
    hotel('z', { retailQuote: quote(10100, 'included') }),
    hotel('a', { retailQuote: quote(30000, 'included') }),
    hotel('partial', { reviewCount: null, retailQuote: quote(10000, 'included') }),
  ])[0];
  assert.deepEqual(result.candidates.map(candidate => candidate.hotelId), ['z', 'a', 'partial']);
  const unknownBasis = matchOffers([offer({ quote: quote(10000, 'included') })], [
    hotel('z', { retailQuote: quote(10100, 'included') }), hotel('a', { retailQuote: quote(30000, 'excluded') }),
  ])[0];
  assert.deepEqual(unknownBasis.candidates.map(candidate => candidate.hotelId), ['a', 'z']);
});

test('per-tier missing price disables price ordering consistently instead of making pairwise comparisons non-transitive', () => {
  const candidates = [hotel('c', { retailQuote: quote(10100, 'included') }), hotel('a', { retailQuote: null }), hotel('b', { retailQuote: quote(20000, 'included') })];
  const expected = matchOffers([offer({ quote: quote(10000, 'included') })], candidates);
  assert.deepEqual(expected[0].candidates.map(candidate => candidate.hotelId), ['a', 'b', 'c']);
  assert.deepEqual(matchOffers([offer({ quote: quote(10000, 'included') })], [...candidates].reverse()), expected);
});

test('offer and named hotel duplicates collapse across pages without collapsing distinct offers', () => {
  const offers = [offer(), offer(), offer({ offerId: 'offer2' })];
  const hotels = [hotel(), hotel()];
  const result = matchOffers(offers, hotels);
  assert.equal(result.length, 2);
  assert.equal(result.every(item => item.candidates.length === 1), true);
  assert.equal(result.every(item => item.candidates[0].hotelId === 'hotel1'), true);
  assert.deepEqual(matchOffers([...offers].reverse(), [...hotels].reverse()), result);
});

test('conflicting duplicate evidence never turns a hotel into a supported candidate', () => {
  const result = matchOffers([offer()], [hotel(), hotel('hotel1', { guestRating: 5 })])[0];
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].tier, 'partial');
  assert.equal(result.candidates[0].guestRating, null);
});

test('pure matcher does not mutate offers or named rows and accepts empty inventories', () => {
  const offers = [offer()]; const hotels = [hotel()];
  const snapshot = JSON.stringify({ offers, hotels });
  matchOffers(offers, hotels);
  assert.equal(JSON.stringify({ offers, hotels }), snapshot);
  assert.deepEqual(matchOffers([], hotels), []);
  assert.deepEqual(matchOffers(offers, [null, {}])[0].candidates, []);
  assert.deepEqual(matchOffers(null, undefined), []);
});

test('combined comparison returns unique coverage counts in the same matching pass', () => {
  const offers = [offer(), offer({ offerId: 'offer2' })];
  const hotels = [hotel('supported'), hotel('unknown', { stars: null })];
  const result = matchListings(offers, hotels);
  assert.equal(result.unassessedHotels, 1);
  assert.equal(result.offers.length, 2);
  assert.equal(result.offers.every(item => item.candidates.length === 1 && item.unassessedCount === 1), true);
});

test('accepted searches retain all 5,000 candidates across distinct offers', () => {
  const offers = Array.from({ length: 10 }, (_, index) => offer({ offerId: `offer-${index}` }));
  const hotels = Array.from({ length: 500 }, (_, index) => hotel(`hotel-${index}`));
  const result = matchListings(offers, hotels);
  assert.equal(result.offers.length, offers.length);
  assert.equal(result.offers.every(item => item.candidates.length === hotels.length), true);
  assert.equal(result.offers.reduce((count, item) => count + item.candidates.length, 0), MAX_MATCH_CANDIDATES);
});

test('dense searches fail explicitly at the total candidate limit rather than truncate', () => {
  const offers = Array.from({ length: 11 }, (_, index) => offer({ offerId: `offer-${index}` }));
  const hotels = Array.from({ length: 500 }, (_, index) => hotel(`hotel-${index}`));
  assert.throws(() => matchListings(offers, hotels), error => error instanceof MatchLimitError && error.code === 'RESULT_TOO_LARGE' && error.status === 503);
});

test('large cities skip contradictory neighborhoods and stars without rejecting valid results', () => {
  const offers = Array.from({ length: 200 }, (_, index) => offer({ offerId: `offer-${index}`, neighborhoodId: `area-${index}` }));
  const hotels = Array.from({ length: 800 }, (_, index) => hotel(`hotel-${index}`, { neighborhoodId: `area-${index % 200}`, stars: index < 400 ? 4 : 5 }));
  assert.ok(offers.length * hotels.length > MAX_MATCH_COMPARISONS);
  const result = matchListings(offers, hotels);
  assert.equal(result.offers.length, 200);
  for (const item of result.offers) {
    const index = Number(item.offerId.split('-')[1]);
    assert.deepEqual(new Set(item.candidates.map(candidate => candidate.hotelId)), new Set([`hotel-${index}`, `hotel-${index + 200}`]));
    assert.equal(item.unassessedCount, 0);
  }
  assert.equal(countUnassessedHotels(offers, hotels), 0);
});

test('indexed matching preserves missing and normalized baseline evidence', () => {
  const offers = [offer({ neighborhoodId: '123', stars: '4' }), offer({ offerId: 'unknown-area', neighborhoodId: null }),
    offer({ offerId: 'unknown-stars', neighborhoodId: 123, stars: null })];
  const hotels = [hotel('match', { neighborhoodId: 123, stars: '4' }), hotel('other-area', { neighborhoodId: 'elsewhere' }),
    hotel('other-stars', { neighborhoodId: '123', stars: 5 }), hotel('unknown-area', { neighborhoodId: null }),
    hotel('unknown-stars', { neighborhoodId: 123, stars: null }), hotel('unknown-both', { neighborhoodId: null, stars: null }),
    hotel('contradiction', { neighborhoodId: null, stars: null, guestRating: 1 })];
  const result = matchListings(offers, hotels);
  // One-offer/one-hotel queries give an exhaustive oracle without depending on index layout.
  for (const item of result.offers) {
    const input = offers.find(value => value.offerId === item.offerId);
    const exhaustive = hotels.map(value => matchOffers([input], [value])[0]);
    assert.deepEqual(item.candidates.map(value => value.hotelId).sort(), exhaustive.flatMap(value => value.candidates.map(candidate => candidate.hotelId)).sort());
    assert.equal(item.unassessedCount, exhaustive.reduce((sum, value) => sum + value.unassessedCount, 0));
  }
  assert.equal(result.offers.find(value => value.offerId === 'offer1').candidates[0].hotelId, 'match');
  assert.deepEqual(result.offers.map(value => value.unassessedCount), [3, 5, 5]);
  assert.equal(result.unassessedHotels, 6);
  assert.equal(countUnassessedHotels(offers, hotels), 6);
});

test('actual clue comparisons remain bounded even when every pair contradicts a guest rating', () => {
  const offers = Array.from({ length: 100 }, (_, index) => offer({ offerId: `offer-${index}` }));
  const hotels = Array.from({ length: 1000 }, (_, index) => hotel(`hotel-${index}`, { guestRating: 1 }));
  assert.equal(offers.length * hotels.length, MAX_MATCH_COMPARISONS);
  assert.equal(matchListings(offers, hotels).offers.every(item => item.candidates.length === 0), true);
  const overLimit = [...offers, offer({ offerId: 'last-offer' })];
  assert.throws(() => matchListings(overLimit, hotels), MatchLimitError);
  assert.throws(() => countUnassessedHotels(overLimit, hotels), MatchLimitError);
});

test('budgets apply after deterministic identity deduplication', () => {
  const offers = Array.from({ length: 501 }, () => offer());
  const hotels = Array.from({ length: 200 }, () => hotel());
  assert.equal(matchListings(offers, hotels).offers[0].candidates.length, 1);
});

test('standalone unassessed coverage never builds or limits candidate output', () => {
  const offers = Array.from({ length: 11 }, (_, index) => offer({ offerId: `offer-${index}` }));
  const hotels = Array.from({ length: 500 }, (_, index) => hotel(`hotel-${index}`));
  assert.equal(countUnassessedHotels(offers, hotels), 0);
});
