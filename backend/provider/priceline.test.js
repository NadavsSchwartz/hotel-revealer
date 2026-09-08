import test from 'node:test';
import assert from 'node:assert/strict';
import { createPricelineAdapter } from './priceline.js';
import { ProviderFailure } from './errors.js';
import { MAX_JSON_BYTES } from './size.js';

const context = {
  destinationId: 'geonames:5506956', cityName: 'Untrusted city override',
  checkIn: '2026-09-21', checkOut: '2026-09-24',
  adults: 3, rooms: 2, childrenAges: [0, 7], currency: 'USD',
};
const named = {
  hotelId: '49205', pclnId: null, hotelType: 'RTL', name: 'Example Hotel', starRating: 3.5,
  overallGuestRating: 7.2, totalReviewCount: 16592,
  ratesSummary: { programName: null, minPrice: '13.54', minCurrencyCode: 'USD', displayPricePerStay: '40.62' },
  location: { cityId: 3000015284, neighborhoodID: '910054961', neighborhoodName: 'The Strip - Southwest',
    latitude: 36.096806, longitude: -115.173001 },
  hotelFeatures: { highlightedAmenities: ['FINTRNT', 'SPOOL', 'PETALLOW'] },
};
const opaque = {
  hotelId: null, pclnId: 'A'.repeat(336), hotelType: 'SOPQ', name: 'A 4-Star Hotel', starRating: 4,
  overallGuestRating: 7, totalReviewCount: 3000,
  ratesSummary: { programName: 'Express_Deal', minPrice: '66.00', minCurrencyCode: 'USD', displayPricePerStay: '198' },
  location: { cityId: 3000015284, neighborhoodID: '910051278', neighborhoodName: 'Las Vegas Convention Center' },
  hotelFeatures: { highlightedAmenities: ['FINTRNT', 'SPOOL', 'PETALLOW'] },
};

const page = (overrides = {}) => ({ data: { listings: {
  errorMessage: null, offset: 0, pageSize: 500, totalSize: 2,
  cityInfo: { cityId: 3000015284, cityName: 'Las Vegas', countryCode: 'US' },
  hotels: [named, opaque], ...overrides,
} } });
const jsonResponse = (value, init = {}) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' }, ...init,
});

function setup(response = () => jsonResponse(page())) {
  const requests = [];
  const adapter = createPricelineAdapter({ fetchImpl: async (url, options) => {
    requests.push({ url, ...options, payload: JSON.parse(options.body) });
    return response(requests.at(-1));
  } });
  return { adapter, requests, search: (options = {}) => adapter.listingsPage({ context, cursor: null, ...options }) };
}

test('one public listing request retains dates, all occupants, and canonical destination', async () => {
  const { search, requests } = setup();
  const controller = new AbortController();
  await search({ signal: controller.signal });
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.url, 'https://www.priceline.com/pws/v0/pcln-graph/');
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.headers, { 'Content-Type': 'application/json', Accept: 'application/json' });
  assert.equal(request.credentials, 'omit');
  assert.equal(request.redirect, 'error');
  assert.equal(request.signal, controller.signal);
  assert.equal(request.payload.operationName, 'HotelRevealerListings');
  assert.deepEqual(request.payload.variables, {
    checkIn: '20260921', checkOut: '20260924', adults: 3, children: ['0', '7'],
    roomCount: 2, currencyCode: 'USD', appCode: 'DESKTOP',
    includePrepaidFeeRates: true, multiOccDisplay: true, multiOccRates: true,
    locationID: 'Las Vegas, Nevada, United States', first: 500, offset: 0,
    productTypes: ['RTL', 'SOPQ'], includePSLResponse: true, sortBy: 'HDR',
  });
  assert.doesNotMatch(request.payload.query, /clientIP|cguid|authToken|visitId|guestReviews|bookings|tracking/i);
});

test('retail null programs and verified minimum clues retain partial amenity evidence', async () => {
  const { search } = setup();
  const result = await search();
  assert.equal(result.listings[0].ratesSummary.programName, 'RETAIL');
  assert.equal(result.listings[1].ratesSummary.programName, 'Express_Deal');
  assert.equal(result.listings[1].pclnId.length, 336);
  assert.deepEqual(result.listings[1].clues, {
    guestRating: { kind: 'minimum', value: 7 }, reviewCount: { kind: 'minimum', value: 3000 },
  });
  assert.ok(result.listings[1].handoffUrl.endsWith('/rooms/2/adults/3/children/0,7?cur=USD'));
  assert.equal(result.listings[1].ratesSummary.taxesFees, 'unknown');
  for (const row of result.listings) {
    assert.equal(row.ratesSummary.roomCount, 2);
    assert.equal(row.ratesSummary.nightlyBasis, 'per-room');
    assert.equal(row.ratesSummary.stayBasis, 'all-rooms');
  }
  assert.deepEqual(result.listings[1].hotelFeatures.highlightedAmenities, ['FINTRNT', 'SPOOL', 'PETALLOW']);
  assert.equal(result.cityInfo.cityId, 3000015284);
  assert.equal(result.nextCursor, null);
  assert.equal(named.ratesSummary.programName, null);
});

test('handoff binds the original opaque offer, stay, rooms, adults, and every child age', async () => {
  const { search } = setup();
  const verifiedContext = { ...context, rooms: 1, adults: 2, childrenAges: [] };
  const { listings } = await search({ context: verifiedContext });
  assert.equal(listings[1].handoffUrl,
    `https://www.priceline.com/relax-ui/at/express/3000015284/${opaque.pclnId}/from/20260921/to/20260924/rooms/1/adults/2?cur=USD`);
  assert.equal(listings[1].ratesSummary.taxesFees, 'unknown');
  assert.equal(listings[0].handoffUrl, undefined);
  for (const [changed, suffix] of [
    [{ adults: 3 }, '/rooms/1/adults/3?cur=USD'],
    [{ childrenAges: [0] }, '/rooms/1/adults/2/children/0?cur=USD'],
    [{ childrenAges: [0, 7] }, '/rooms/1/adults/2/children/0,7?cur=USD'],
    [{ rooms: 2 }, '/rooms/2/adults/2?cur=USD'],
  ]) {
    const result = await search({ context: { ...verifiedContext, ...changed } });
    assert.ok(result.listings[1].handoffUrl.endsWith(suffix));
  }
});

test('invalid masked values remain unknown and unsafe offer tokens do not become URLs', async () => {
  const { search } = setup(() => jsonResponse(page({ hotels: [named, { ...opaque,
    overallGuestRating: -1, totalReviewCount: 1.5, pclnId: '../another-offer',
  }], totalSize: 2 })));
  const result = await search({ context: { ...context, rooms: 1, adults: 2, childrenAges: [] } });
  assert.deepEqual(result.listings[1].clues, { guestRating: { kind: 'unknown' }, reviewCount: { kind: 'unknown' } });
  assert.equal(result.listings[1].handoffUrl, null);
});

test('only observed retail hotelType allows nullable program repair', async () => {
  const hotel = { ...named, hotelType: 'UNRECOGNIZED' };
  const { search } = setup(() => jsonResponse(page({ hotels: [named, hotel], totalSize: 2 })));
  assert.equal((await search()).listings[1].ratesSummary.programName, null);
});

test('same-name listings about 300 km away cannot substitute for the selected destination', async () => {
  const shenzhenHotel = { ...named, location: { ...named.location, latitude: 22.54554, longitude: 114.0683 } };
  const { search, requests } = setup(() => jsonResponse(page({ hotels: [shenzhenHotel], totalSize: 1,
    cityInfo: { cityName: 'Shenzhen', countryCode: 'CN' },
  })));
  await assert.rejects(search({ context: { ...context, destinationId: 'geonames:1795566' } }), {
    code: 'PROVIDER_DESTINATION_UNSUPPORTED',
  });
  assert.equal(requests.length, 1);
  assert.equal((await search({ context: { ...context, destinationId: 'geonames:1795565' } })).listings.length, 1);
});

test('nearby Vegas and Tel Aviv hotels corroborate the place without interpreting legacy country codes', async () => {
  assert.equal((await setup().search()).listings.length, 2);
  const telAvivHotel = { ...named, location: { ...named.location, latitude: 32.08933, longitude: 34.78185 } };
  const { search } = setup(() => jsonResponse(page({ hotels: [telAvivHotel], totalSize: 1,
    cityInfo: { cityName: 'Tel Aviv', countryCode: 'IS', searchedLatitude: null, searchedLongitude: null },
  })));
  assert.equal((await search({ context: { ...context, destinationId: 'geonames:293397' } })).listings.length, 1);
});

test('nonempty results require nearby published hotel or neighborhood coordinates', async () => {
  for (const hotels of [
    [{ ...named, location: null }],
    [{ ...named, location: { latitude: null, longitude: null } }],
    [{ ...named, location: { latitude: 91, longitude: -115 } }],
    [{ ...named, location: { latitude: 36, longitude: -181 } }],
    [{ ...named, hotelType: 'UNRECOGNIZED' }],
    [{ ...opaque, location: { latitude: 0, longitude: 0 } }],
  ]) {
    const { search } = setup(() => jsonResponse(page({ hotels, totalSize: hotels.length })));
    await assert.rejects(search(), { code: 'PROVIDER_DESTINATION_UNSUPPORTED' });
  }
  const { search } = setup(() => jsonResponse(page({ hotels: [], totalSize: 0, cityInfo: null })));
  assert.deepEqual((await search()).listings, []);
});

test('an opaque-only later page can corroborate the destination with its published neighborhood center', async () => {
  const { search, requests } = setup(() => jsonResponse(page({
    hotels: [{ ...opaque, location: { ...opaque.location, latitude: 36.135888, longitude: -115.154699 } }],
    offset: 500, totalSize: 501,
  })));
  const result = await search({ cursor: '500' });
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].hotelType, 'SOPQ');
  assert.equal(result.nextCursor, null);
  assert.equal(requests.length, 1);
});

test('page cursor follows provider metadata and leaves the three-page limit visible', async () => {
  const { search, requests } = setup((request) => jsonResponse(page({
    offset: request.payload.variables.offset, totalSize: 1700,
  })));
  assert.equal((await search()).nextCursor, '500');
  assert.equal((await search({ cursor: '500' })).nextCursor, '1000');
  assert.equal((await search({ cursor: '1000' })).nextCursor, '1500');
  assert.deepEqual(requests.map(request => request.payload.variables.offset), [0, 500, 1000]);
});

test('malformed or out-of-budget cursors never reach the provider', async () => {
  const { search, requests } = setup();
  for (const cursor of ['', '0', '-1', '1.5', '0500', '1500', 'https://elsewhere.test', 500, undefined]) {
    await assert.rejects(search({ cursor }), { code: 'PROVIDER_RESPONSE_INVALID' });
  }
  assert.equal(requests.length, 0);
});

test('unknown destination never reaches the provider', async () => {
  const { search, requests } = setup();
  await assert.rejects(search({ context: { ...context, destinationId: 'geonames:1' } }), { code: 'PROVIDER_RESPONSE_INVALID' });
  assert.equal(requests.length, 0);
});

test('unsupported listing envelopes and contradictory pagination are rejected', async () => {
  for (const body of [{}, { data: { listings: null } }, page({ hotels: null }), page({ offset: 500 }),
    page({ pageSize: 0 }), page({ pageSize: 501 }), page({ pageSize: 1 }), page({ totalSize: 1 }),
    page({ totalSize: 1.5 }), page({ hotels: [], totalSize: 1 }), page({ hotels: Array(501).fill(named) })]) {
    const { search } = setup(() => jsonResponse(body));
    await assert.rejects(search(), { code: 'PROVIDER_RESPONSE_INVALID' });
  }
  const { search } = setup(() => jsonResponse(page({ hotels: [], totalSize: 0 })));
  assert.equal((await search()).nextCursor, null);
});

test('one detail transport keeps named hotel and original opaque IDs in separate resolver calls', async () => {
  const { adapter, requests } = setup(() => jsonResponse({ data: { details: { errorMessage: null, hotel: {
    location: { address: { addressLine1: ' 1 Main Street ', addressLine2: '', cityName: 'Las Vegas', provinceCode: 'NV', isoCountryCode: 'US' } },
    hotelFeatures: { hotelAmenities: [{ code: 'POOL', name: 'Pool' }, null, { code: 'FITNESS', name: ' Gym ' }] },
    images: [{ imageHDURL: 'https://images.priceline.com/hd.jpg', imageURL: 'https://images.priceline.com/small.jpg' },
      { imageHDURL: null, imageURL: 'https://images.priceline.com/second.jpg' }, null],
    ratesSummary: { minPrice: '128.90', minCurrencyCode: 'USD' },
  } } } }));
  const result = await adapter.hotelDetails({ context, hotelId: '49205', offerId: 'original-opaque-id' });
  assert.equal(requests.length, 1);
  const { variables, query } = requests[0].payload;
  assert.equal(variables.hotelID, '49205');
  assert.equal(variables.offerId, 'original-opaque-id');
  assert.equal(variables.roomsCount, 2);
  assert.equal(variables.adults, 3);
  assert.deepEqual(variables.children, ['0', '7']);
  assert.equal(variables.checkIn, '20260921');
  assert.equal(variables.checkOut, '20260924');
  assert.equal(variables.responseOptions, 'CUSTOM_DESC,RATE_SUMMARY,HOTEL_IMAGES');
  assert.doesNotMatch(query.slice(query.indexOf('details: hotelDetails'), query.indexOf('original: hotelDetails')), /pclnID/);
  assert.match(query.slice(query.indexOf('original: hotelDetails')), /pclnID: \$offerId/);
  assert.doesNotMatch(query.slice(query.indexOf('original: hotelDetails')), /hotelID/);
  assert.equal((query.match(/: hotelDetails\(/g) || []).length, 2);
  assert.equal(variables.originalResponseOptions, 'RATE_SUMMARY,DETAILED_ROOM,RATE_CHARGES_DETAIL,RATE_IMPORTANT_INFO');
  assert.equal(variables.rateDisplayOption, 'S');
  assert.equal(variables.paymentRateMerge, false);
  assert.doesNotMatch(requests[0].body, /guestReviews|bookings|authToken|cguid/i);
  assert.doesNotMatch(query, /REVIEWS|BOOKINGS/);
  assert.deepEqual(result, {
    description: null,
    images: ['https://images.priceline.com/hd.jpg', 'https://images.priceline.com/second.jpg'],
    amenities: ['Pool', 'Gym'], address: '1 Main Street, Las Vegas, NV, US',
    retailQuote: { minPrice: '128.90', minCurrencyCode: 'USD', roomCount: 2, nightlyBasis: 'per-room', taxesFees: 'unknown' },
    originalQuote: null,
  });
});

test('missing details are rejected while absent optional display fields remain unknown', async () => {
  for (const body of [{}, { data: { details: {} } }, { data: { details: { hotel: null } } }]) {
    const { adapter } = setup(() => jsonResponse(body));
    await assert.rejects(adapter.hotelDetails({ context, hotelId: '49205' }), { code: 'PROVIDER_RESPONSE_INVALID' });
  }
  const { adapter } = setup(() => jsonResponse({ data: { details: { hotel: {} } } }));
  assert.deepEqual(await adapter.hotelDetails({ context, hotelId: '49205' }), {
    description: null, images: [], amenities: [], address: null, retailQuote: null, originalQuote: null,
  });
});

const preferredRate = () => ({ rateIdentifier: 'preferred-rate', price: 66, grandTotal: 439.02,
  totalPriceExcludingTaxesAndFeePerStay: 198, programName: 'Express_Deal', savingPct: 61 });
const originalDetails = () => ({ errorMessage: null, hotel: {
  ratesSummary: { minCurrencyCode: 'USD', rateIdentifier: 'preferred-rate', status: 'AVAILABLE' },
  transformedRooms: [
    { roomRates: [{ ...preferredRate(), rateIdentifier: 'other-rate', price: 86, grandTotal: 509.31 }] },
    { roomRates: [preferredRate()] },
  ],
} });
const pricingContext = { ...context, rooms: 1, adults: 2, childrenAges: [] };
const quoteRequest = adapter => adapter.hotelDetails({ context: pricingContext, hotelId: '49205', offerId: 'original-opaque-id' });

test('selected-offer quote uses the matching preferred rate rather than the first room', async () => {
  const { adapter, requests } = setup(() => jsonResponse({ data: { details: { hotel: {} }, original: originalDetails() } }));
  const result = await quoteRequest(adapter);
  assert.deepEqual(result.originalQuote, { nightlyCents: 6600, stayCents: 19800, totalCents: 43902,
    currency: 'USD', taxesFees: 'excluded', totalTaxesFees: 'included', roomCount: 1,
    nightlyBasis: 'per-room', stayBasis: 'all-rooms', advertisedDiscount: { percent: 61, source: 'Priceline' } });
  assert.equal(result.originalQuote.propertyFeesCents, undefined);
  assert.equal(requests.length, 1);
});

test('observed two-room preferred rate corroborates all-room base and retains the supplied total', async () => {
  // From the 2026-09-08 family-original-total.json probe: 2 rooms, 4 adults,
  // one child aged 7, Sep 21–24; 66 × 3 × 2 = 396 base, API total 873.06.
  const original = originalDetails();
  Object.assign(original.hotel.transformedRooms[1].roomRates[0], {
    totalPriceExcludingTaxesAndFeePerStay: 396, grandTotal: 873.06,
  });
  const { adapter, requests } = setup(() => jsonResponse({ data: { details: { hotel: {} }, original } }));
  const result = await adapter.hotelDetails({ context: { ...pricingContext, rooms: 2, adults: 4, childrenAges: [7] },
    hotelId: '46745', offerId: 'original-family-offer' });
  assert.equal(result.originalQuote.nightlyCents, 6600);
  assert.equal(result.originalQuote.stayCents, 39600);
  assert.equal(result.originalQuote.totalCents, 87306);
  assert.equal(result.originalQuote.roomCount, 2);
  assert.equal(result.originalQuote.stayBasis, 'all-rooms');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload.variables.roomsCount, 2);
  assert.equal(requests[0].payload.variables.adults, 4);
  assert.deepEqual(requests[0].payload.variables.children, ['7']);
});

test('multiroom original totals require an exact all-room base without guessing rounding tolerance', async () => {
  for (const [base, total] of [[198, 439.02], [396.01, 873.06], [395.99, 873.06]]) {
    const original = originalDetails();
    Object.assign(original.hotel.transformedRooms[1].roomRates[0], {
      totalPriceExcludingTaxesAndFeePerStay: base, grandTotal: total,
    });
    const { adapter } = setup(() => jsonResponse({ data: { original, details: { hotel: {
      ratesSummary: { minPrice: '128.90', minCurrencyCode: 'USD' },
    } } } }));
    const result = await adapter.hotelDetails({ context: { ...pricingContext, rooms: 2, adults: 4, childrenAges: [7] },
      hotelId: '46745', offerId: 'original-family-offer' });
    assert.equal(result.originalQuote, null);
    assert.equal(result.retailQuote.minPrice, '128.90');
  }
});

test('unsafe or unassociated original totals leave named details available without guessing', async () => {
  const invalid = [null, { errorMessage: 'Unavailable' }, { hotel: {} }];
  for (const changes of [
    { rateIdentifier: 'missing-rate' }, { minCurrencyCode: 'EUR' }, { status: 'SOLD_OUT' },
  ]) {
    const original = originalDetails();
    Object.assign(original.hotel.ratesSummary, changes);
    invalid.push(original);
  }
  for (const changes of [
    { grandTotal: 197 }, { grandTotal: Number.MAX_SAFE_INTEGER }, { grandTotal: 'NaN' },
    { price: null }, { totalPriceExcludingTaxesAndFeePerStay: null }, { programName: 'RETAIL' },
  ]) {
    const original = originalDetails();
    Object.assign(original.hotel.transformedRooms[1].roomRates[0], changes);
    invalid.push(original);
  }
  const duplicate = originalDetails();
  duplicate.hotel.transformedRooms.push({ roomRates: [preferredRate()] });
  invalid.push(duplicate);
  for (const original of invalid) {
    const { adapter } = setup(() => jsonResponse({ data: { original, details: { hotel: {
      ratesSummary: { minPrice: '128.90', minCurrencyCode: 'USD' },
    } } } }));
    const result = await quoteRequest(adapter);
    assert.equal(result.originalQuote, null);
    assert.equal(result.retailQuote.minPrice, '128.90');
    assert.equal(result.available, undefined);
  }
});

test('a partial GraphQL failure in the optional original quote preserves named data', async () => {
  const { adapter } = setup(() => jsonResponse({
    errors: [{ message: 'private original resolver detail', path: ['original'] }],
    data: { original: originalDetails(), details: { hotel: { hotelFeatures: { hotelAmenities: [{ name: 'Pool' }] } } } },
  }));
  const result = await quoteRequest(adapter);
  assert.equal(result.originalQuote, null);
  assert.deepEqual(result.amenities, ['Pool']);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('a valid original quote remains usable when the independent named resolver fails', async () => {
  const { adapter } = setup(() => jsonResponse({
    errors: [{ message: 'private named resolver detail', path: ['details'] }],
    data: { original: originalDetails(), details: null },
  }));
  const result = await quoteRequest(adapter);
  assert.equal(result.available, false);
  assert.equal(result.originalQuote.totalCents, 43902);
  assert.deepEqual(result.images, []);
});

test('listing discounts use only displaySavingsPct and remain explicitly provider-advertised', async () => {
  for (const percent of [61, '39.5', 0, 100, -1, null]) {
    const { search, requests } = setup(() => jsonResponse(page({ hotels: [named, { ...opaque, displaySavingsPct: percent }] })));
    const result = await search();
    assert.match(requests[0].payload.query, /displaySavingsPct/);
    assert.deepEqual(result.listings[1].ratesSummary.advertisedDiscount,
      Number(percent) > 0 && Number(percent) < 100 ? { percent: Number(percent), source: 'Priceline' } : undefined);
  }
});

test('429 preserves Retry-After and never retries', async () => {
  const { search, requests } = setup(() => new Response('sensitive provider content', { status: 429, headers: { 'Retry-After': '120' } }));
  await assert.rejects(search(), error => error instanceof ProviderFailure && error.kind === 'rate_limit' && error.retryAfter === '120');
  assert.equal(requests.length, 1);
});

test('access denial and HTML interstitials stop with a sanitized challenge failure', async () => {
  for (const response of [
    () => new Response('private denial text', { status: 401 }),
    () => new Response('private denial text', { status: 403 }),
    () => new Response('<html>Check access</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('  <!doctype html><title>Access denied</title>', { headers: { 'Content-Type': 'application/json' } }),
  ]) {
    const { search, requests } = setup(response);
    await assert.rejects(search(), { name: 'ProviderFailure', kind: 'challenge', message: 'Provider request failed' });
    assert.equal(requests.length, 1);
  }
});

test('network, HTTP, and GraphQL failures do not expose upstream messages or retry', async () => {
  for (const response of [
    () => { throw new Error('private transport detail'); },
    () => new Response('private response body', { status: 500 }),
    () => jsonResponse({ errors: [{ message: 'private GraphQL detail' }], ...page() }),
    () => jsonResponse(page({ errorMessage: 'private domain detail' })),
  ]) {
    const { search, requests } = setup(response);
    await assert.rejects(search(), { name: 'ProviderFailure', kind: 'unavailable', message: 'Provider request failed' });
    assert.equal(requests.length, 1);
  }
});

test('malformed JSON and scalar JSON are unsupported responses', async () => {
  for (const body of ['{broken', 'null', '[]', '123']) {
    const { search } = setup(() => new Response(body, { headers: { 'Content-Type': 'application/json' } }));
    await assert.rejects(search(), { code: 'PROVIDER_RESPONSE_INVALID' });
  }
});

test('response byte limit is enforced from Content-Length before reading', async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const { search } = setup(() => new Response(body, { headers: {
    'Content-Type': 'application/json', 'Content-Length': String(MAX_JSON_BYTES + 1),
  } }));
  await assert.rejects(search(), { code: 'RESULT_TOO_LARGE' });
  assert.equal(cancelled, true);
});

test('response byte limit is enforced across streamed chunks without trusting Content-Length', async () => {
  let cancelled = false;
  let reads = 0;
  const body = new ReadableStream({
    pull(controller) { reads += 1; controller.enqueue(new Uint8Array(MAX_JSON_BYTES / 2 + 1)); },
    cancel() { cancelled = true; },
  });
  const { search, requests } = setup(() => new Response(body, { headers: {
    'Content-Type': 'application/json', 'Content-Length': '1',
  } }));
  await assert.rejects(search(), { code: 'RESULT_TOO_LARGE' });
  assert.equal(cancelled, true);
  assert.ok(reads <= 3);
  assert.equal(requests.length, 1);
});

test('an already aborted operation makes no request', async () => {
  const controller = new AbortController();
  controller.abort();
  const { search, requests } = setup();
  await assert.rejects(search({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(requests.length, 0);
});

test('abort during response streaming cancels the reader and preserves AbortError', async () => {
  const controller = new AbortController();
  let cancel;
  const cancelled = new Promise(resolve => { cancel = resolve; });
  let beginRead;
  const reading = new Promise(resolve => { beginRead = resolve; });
  const body = new ReadableStream({
    pull() { beginRead(); },
    cancel() { cancel(); },
  });
  const { search, requests } = setup(() => new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  const operation = search({ signal: controller.signal });
  await reading;
  // Start abort after request and reader setup have yielded once.
  await Promise.resolve();
  controller.abort();
  await assert.rejects(operation, { name: 'AbortError' });
  await cancelled;
  assert.equal(requests.length, 1);
});
