import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeListings, normalizeQuote, safeHandoffUrl, safeImageUrl, deduplicateHotels, deduplicateOffers, matchListings } from './index.js';

const named = (fields = {}) => ({
  hotelId: 123,
  name: 'Example Hotel',
  location: { cityId: 'city1', neighborhoodID: 'area1', neighborhoodName: 'Central' },
  starRating: '4', overallGuestRating: '8.7', totalReviewCount: '1200',
  hotelFeatures: { highlightedAmenities: ['POOL', 'WIFI', 'POOL'] },
  ratesSummary: { programName: 'Retail', minPrice: '129.95', displayPricePerStay: '259.90', minCurrencyCode: 'USD' },
  thumbnailUrl: 'https://images.priceline.com/hotel.jpg',
  ...fields,
});
const express = (fields = {}) => named({ pclnId: 'opaque-1', ratesSummary: { programName: 'Express_Deal', minPrice: 99.99, minCurrencyCode: 'USD' }, ...fields });

test('live-sized opaque offer IDs survive normalization while oversized IDs remain rejected', () => {
  const opaqueId = 'A9'.repeat(168);
  const { offers, invalidRows } = normalizeListings([express({ pclnId: opaqueId }), express({ pclnId: 'F'.repeat(1025) })]);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].offerId, opaqueId);
  assert.equal(invalidRows, 1);
  assert.equal(safeImageUrl('https://mobileimg.pclncdn.com/htlimg/master/123?auto=webp'), 'https://mobileimg.pclncdn.com/htlimg/master/123?auto=webp');
});

test('multi-room price basis survives normalization without synthesizing a total or claiming fees', () => {
  const quote = normalizeQuote({ minPrice: '190.00', displayPricePerStay: '1140', minCurrencyCode: 'USD', roomCount: 2, nightlyBasis: 'per-room', stayBasis: 'all-rooms' });
  assert.deepEqual(quote, { nightlyCents: 19000, stayCents: 114000, currency: 'USD', taxesFees: 'unknown', roomCount: 2, nightlyBasis: 'per-room', stayBasis: 'all-rooms' });
  assert.equal(normalizeQuote({ minPrice: '190.00', minCurrencyCode: 'USD', roomCount: 2, nightlyBasis: 'per-room' }).stayCents, null);
});

test('legacy USD amounts round decimal half cents upward without floating-point drift', () => {
  for (const [amount, expected] of [
    [10.075, 1008], ['10.075', 1008], [4.015, 402], [8.115, 812], [' 129.95 ', 12995],
    [0, 0], ['0', 0], [1e-7, 0], [0.0049, 0], ['0.005', 1], ['9.999', 1000],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER], ['90071992547409.915', null],
    [Number.MAX_SAFE_INTEGER, null], [-1, null], [Infinity, null], ['1e-7', null], ['no price', null],
  ]) {
    const quote = normalizeQuote({ minPrice: amount, displayPricePerStay: amount, minCurrencyCode: 'USD' });
    assert.equal(quote.nightlyCents, expected, `nightly ${amount}`);
    assert.equal(quote.stayCents, expected, `stay ${amount}`);
  }
  assert.equal(normalizeQuote({ nightlyCents: 1007, currency: 'USD' }).nightlyCents, 1007);
  assert.equal(normalizeQuote({ nightlyCents: 1007.5, currency: 'USD' }).nightlyCents, null);
});

test('explicit provider totals preserve base prices and separately identify included taxes and fees', () => {
  const raw = { minPrice: '66.00', displayPricePerStay: 198, grandTotal: 439.02, minCurrencyCode: 'USD',
    taxesFees: 'excluded', totalTaxesFees: 'included', roomCount: 1, nightlyBasis: 'per-room', stayBasis: 'all-rooms' };
  const quote = normalizeQuote(raw);
  assert.deepEqual(quote, { nightlyCents: 6600, stayCents: 19800, totalCents: 43902, currency: 'USD',
    taxesFees: 'excluded', totalTaxesFees: 'included', roomCount: 1, nightlyBasis: 'per-room', stayBasis: 'all-rooms' });
  assert.deepEqual(normalizeQuote(quote), quote);
  for (const changes of [{ grandTotal: 197 }, { grandTotal: null }, { grandTotal: Infinity },
    { grandTotal: '1e3' }, { grandTotal: Number.MAX_SAFE_INTEGER }, { minCurrencyCode: 'EUR' },
    { totalTaxesFees: undefined }, { minPrice: null }, { displayPricePerStay: null }, { minPrice: 500 }]) {
    assert.equal(normalizeQuote({ ...raw, ...changes }).totalCents, undefined);
  }
  assert.equal(normalizeQuote({ ...quote, totalCents: 43902.5 }).totalCents, undefined);
  assert.equal(normalizeQuote({ ...quote, totalCents: Number.MAX_SAFE_INTEGER + 1 }).totalCents, undefined);
});

test('discounts retain only bounded provider-advertised percentages and never infer a comparison saving', () => {
  const raw = { minPrice: 66, minCurrencyCode: 'USD', advertisedDiscount: { percent: '61.0', source: 'Priceline' } };
  assert.deepEqual(normalizeQuote(raw).advertisedDiscount, { percent: 61, source: 'Priceline' });
  for (const percent of [0, 100, 101, -1, null, true, Infinity, '1e2', {}]) {
    assert.equal(normalizeQuote({ ...raw, advertisedDiscount: { percent, source: 'Priceline' } }).advertisedDiscount, undefined);
  }
  assert.equal(normalizeQuote({ ...raw, advertisedDiscount: { percent: 61, source: 'candidate-price' } }).advertisedDiscount, undefined);
  assert.equal(normalizeQuote({ minPrice: 66, minCurrencyCode: 'USD', minStrikePrice: 172.89 }).advertisedDiscount, undefined);
});

test('observed legacy listing shape normalizes numeric strings and stable code sets', () => {
  const raw = { data: { listings: { hotels: [named(), express()] } } };
  const snapshot = JSON.stringify(raw);
  const result = normalizeListings(raw);
  assert.equal(result.invalidRows, 0);
  assert.equal(result.hotels[0].hotelId, '123');
  assert.equal(result.hotels[0].guestRating, 8.7);
  assert.equal(result.hotels[0].reviewCount, 1200);
  assert.deepEqual(result.hotels[0].amenities, ['POOL', 'WIFI']);
  assert.equal(result.hotels[0].amenitiesComplete, false);
  assert.deepEqual(result.hotels[0].retailQuote, { nightlyCents: 12995, stayCents: 25990, currency: 'USD', taxesFees: 'unknown' });
  assert.equal(JSON.stringify(raw), snapshot);
});

test('raw masked numbers never imply exact or rounded matching semantics', () => {
  const [offer] = normalizeListings([express()]).offers;
  assert.deepEqual(offer.clues.guestRating, { kind: 'unknown' });
  assert.deepEqual(offer.clues.reviewCount, { kind: 'unknown' });
  assert.equal(offer.handoffUrl, null);
});

test('explicit tagged clue semantics survive normalization while invalid clues become unknown', () => {
  const [offer] = normalizeListings([express({ clues: {
    guestRating: { kind: 'minimum', value: '8' },
    reviewCount: { kind: 'range', min: '1000', max: '1299' },
    amenities: { codes: [{ code: 'POOL' }], complete: true },
  } })]).offers;
  assert.deepEqual(offer.clues, {
    guestRating: { kind: 'minimum', value: 8 },
    reviewCount: { kind: 'range', min: 1000, max: 1299 },
    amenities: { codes: ['POOL'], complete: true },
  });
  const [invalid] = normalizeListings([express({ clues: {
    guestRating: { kind: 'exact', value: 12 },
    reviewCount: { kind: 'range', min: 200, max: 100 },
    amenities: { codes: ['POOL', null], complete: true },
  } })]).offers;
  assert.deepEqual(invalid.clues, { guestRating: { kind: 'unknown' }, reviewCount: { kind: 'unknown' }, amenities: null });
});

test('missing and malformed rows are counted without failing valid rows', () => {
  const result = normalizeListings([null, [], 1, {}, named({ hotelId: null }), express({ pclnId: '' }), named({
    location: null, starRating: 'NaN', overallGuestRating: true, totalReviewCount: '3.5',
    hotelFeatures: { highlightedAmenities: ['WIFI', {}] },
  })]);
  assert.equal(result.invalidRows, 6);
  assert.equal(result.hotels.length, 1);
  assert.equal(result.hotels[0].stars, null);
  assert.equal(result.hotels[0].guestRating, null);
  assert.equal(result.hotels[0].reviewCount, null);
  assert.equal(result.hotels[0].amenities, null);
  assert.equal(result.hotels[0].neighborhoodId, null);
  assert.deepEqual(normalizeListings(undefined), { offers: [], hotels: [], invalidRows: 1 });
  assert.deepEqual(normalizeListings({ hotels: [] }), { offers: [], hotels: [], invalidRows: 0 });
});

test('duplicate named IDs are order-invariant and conflicting evidence is not merged', () => {
  const rows = [named(), named({ overallGuestRating: 9, totalReviewCount: 900, hotelFeatures: { highlightedAmenities: ['SPA'] } }), express(), express()];
  const result = normalizeListings(rows);
  assert.deepEqual(normalizeListings([...rows].reverse()), result);
  assert.equal(result.hotels.length, 1);
  assert.equal(result.offers.length, 1);
  assert.equal(result.hotels[0].guestRating, null);
  assert.equal(result.hotels[0].reviewCount, null);
  assert.equal(result.hotels[0].amenities, null);
  assert.equal(result.hotels[0].amenitiesComplete, false);
});

test('dedup never combines sparse observations into an invented complete observation', () => {
  const result = normalizeListings([named({ overallGuestRating: undefined }), named({ totalReviewCount: undefined })]);
  assert.equal(result.hotels.length, 1);
  assert.ok(result.hotels[0].guestRating === null || result.hotels[0].reviewCount === null);
  const conflict = normalizeListings([named(), named({ name: 'Different Hotel' })]);
  assert.equal(conflict.hotels[0].neighborhoodId, null);
  assert.equal(conflict.hotels[0].stars, null);
});

test('merging already-normalized pages cannot restore previously conflicting facts', () => {
  const first = normalizeListings([named(), named({ overallGuestRating: 9 }), express(), express({ starRating: 5 })]);
  const second = normalizeListings([named(), express()]);
  const hotels = deduplicateHotels([...first.hotels, ...second.hotels]);
  const offers = deduplicateOffers([...first.offers, ...second.offers]);
  assert.equal(hotels[0].guestRating, null);
  assert.equal(offers[0].stars, null);
});

test('offer amenity ambiguity and city conflicts survive every page partition and input order', () => {
  const pool = express({ hotelFeatures: { highlightedAmenities: ['POOL'] } });
  const spa = express({
    location: { cityId: 'city2', neighborhoodID: 'area1', neighborhoodName: 'Central' },
    hotelFeatures: { highlightedAmenities: ['SPA'] },
  });
  const rows = [pool, spa, pool];
  const hotels = normalizeListings([named({ hotelFeatures: { highlightedAmenities: ['POOL'] } })]).hotels;
  const expectedOffers = normalizeListings(rows).offers;
  const expectedMatch = matchListings(expectedOffers, hotels);
  assert.equal(expectedOffers[0].cityId, null);
  assert.equal(expectedOffers[0].clues.amenities, null);
  assert.equal(expectedMatch.offers[0].candidates.length, 0);
  assert.equal(expectedMatch.unassessedHotels, 1);

  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    const ordered = order.map(index => rows[index]);
    for (const partitions of [
      [ordered], [ordered.slice(0, 1), ordered.slice(1)],
      [ordered.slice(0, 2), ordered.slice(2)], ordered.map(row => [row]),
    ]) {
      const pages = partitions.map(page => normalizeListings(page).offers);
      const merged = deduplicateOffers(pages.flat());
      const sequential = pages.reduce((previous, page) => deduplicateOffers([...previous, ...page]), []);
      assert.deepEqual(merged, expectedOffers);
      assert.deepEqual(sequential, expectedOffers);
      assert.deepEqual(matchListings(merged, hotels), expectedMatch);
      assert.deepEqual(matchListings(sequential, hotels), expectedMatch);
    }
  }
});

test('different offers may share a named hotel, while duplicate conflicting offers remain conservative', () => {
  const result = normalizeListings([express(), express({ pclnId: 'opaque-2' }), named()]);
  assert.equal(result.offers.length, 2);
  assert.equal(result.hotels.length, 1);
  const conflict = normalizeListings([express(), express({ starRating: 5 })]);
  assert.equal(conflict.offers.length, 1);
  assert.equal(conflict.offers[0].stars, null);
});

test('quotes require known USD, preserve zero and do not infer totals or taxes', () => {
  assert.deepEqual(normalizeQuote({ minPrice: 0, minCurrencyCode: 'USD' }), { nightlyCents: 0, stayCents: null, currency: 'USD', taxesFees: 'unknown' });
  for (const minPrice of [-1, '1e3', '', 'NaN', Infinity, {}, true]) assert.equal(normalizeQuote({ minPrice, minCurrencyCode: 'USD' }).nightlyCents, null);
  for (const minCurrencyCode of [null, 'EUR', undefined]) assert.equal(normalizeQuote({ minPrice: 20, minCurrencyCode }).nightlyCents, null);
  assert.equal(normalizeQuote({ minPrice: '10.29', minCurrencyCode: 'USD' }).nightlyCents, 1029);
  assert.deepEqual(normalizeQuote({ nightlyCents: '12995', stayCents: 25990, currency: 'USD', taxesFees: 'included' }), {
    nightlyCents: 12995, stayCents: 25990, currency: 'USD', taxesFees: 'included',
  });
});

test('original links are retained only on the exact HTTPS Priceline allowlist; no link is generated', () => {
  const supplied = 'https://www.priceline.com/adapter-documented-path?opaque=1';
  assert.equal(safeHandoffUrl(supplied), supplied);
  assert.equal(normalizeListings([express({ handoffUrl: supplied })]).offers[0].handoffUrl, supplied);
  assert.equal(normalizeListings([express()]).offers[0].handoffUrl, null);
  for (const value of ['javascript:alert(1)', 'http://www.priceline.com/path', 'https://www.priceline.com.evil.test/', 'https://evil.test/priceline.com', 'https://user@www.priceline.com/', 'https://www.priceline.com:444/', null, {}, 'https://www.priceline.com/' + 'a'.repeat(4096)]) {
    assert.equal(safeHandoffUrl(value), null);
  }
  assert.equal(safeImageUrl('https://images.priceline.com/image.jpg'), 'https://images.priceline.com/image.jpg');
  assert.equal(safeImageUrl('https://images.example/image.jpg'), null);
  assert.equal(safeImageUrl('data:image/svg+xml,bad'), null);
  assert.equal(safeImageUrl('https://user:pass@images.example/image.jpg'), null);
});

test('display text and image URLs are bounded before fields can be repeated across candidates', () => {
  const result = normalizeListings([named({
    name: 'n'.repeat(1000),
    location: { neighborhoodName: 'a'.repeat(1000) },
    thumbnailUrl: 'https://images.priceline.com/' + 'x'.repeat(4096),
  })]);
  assert.equal(result.hotels[0].name.length, 200);
  assert.equal(result.hotels[0].neighborhoodName.length, 200);
  assert.equal(result.hotels[0].thumbnailUrl, null);
  assert.equal(safeImageUrl('https://images.priceline.com/' + 'é'.repeat(1000)), null);
  assert.equal(safeHandoffUrl('https://www.priceline.com/' + 'é'.repeat(1000)), null);
});

test('oversized amenity lists and codes become unknown instead of falsely complete truncated evidence', () => {
  for (const codes of [Array.from({ length: 101 }, (_, index) => `code-${index}`), ['x'.repeat(65)]]) {
    const result = normalizeListings([
      named({ amenities: { codes, complete: true } }),
      express({ clues: { amenities: { codes, complete: true } } }),
    ]);
    assert.equal(result.hotels[0].amenities, null);
    assert.equal(result.hotels[0].amenitiesComplete, false);
    assert.equal(result.offers[0].clues.amenities, null);
  }
  const codes = Array.from({ length: 100 }, (_, index) => `code-${index}`);
  const result = normalizeListings([named({ amenities: { codes, complete: true } })]);
  assert.equal(result.hotels[0].amenities.length, 100);
  assert.equal(result.hotels[0].amenitiesComplete, true);
});
