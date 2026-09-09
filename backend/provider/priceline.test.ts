import test from 'node:test';
import assert from 'node:assert/strict';
import { createPricelineAdapter } from './priceline.ts';
import { ProviderFailure } from './errors.ts';
import { isRecord } from '../domain/validation.ts';
import type { TripContext } from '../../shared/contracts.ts';
import { MAX_JSON_BYTES } from './size.ts';

const context: TripContext = {
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

const page = (overrides: Record<string, unknown> = {}) => ({ data: { listings: {
  errorMessage: null, offset: 0, pageSize: 500, totalSize: 2,
  cityInfo: { cityId: 3000015284, cityName: 'Las Vegas', countryCode: 'US' },
  hotels: [named, opaque], ...overrides,
} } });
const jsonResponse = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' }, ...init,
});

interface CapturedRequest extends RequestInit {
  url: string | URL | Request;
  body: string;
  payload: { operationName: string; query: string; variables: Record<string, unknown> };
}
interface TestListing extends Record<string, unknown> {
  ratesSummary: Record<string, unknown>;
  hotelFeatures: Record<string, unknown>;
  location: Record<string, unknown>;
}
function assertListing(value: unknown): asserts value is TestListing {
  assert.ok(isRecord(value));
  assert.ok(isRecord(value.ratesSummary));
  assert.ok(isRecord(value.hotelFeatures));
  assert.ok(isRecord(value.location));
}
function stringValue(value: unknown): string {
  assert.equal(typeof value, 'string');
  assert.ok(typeof value === 'string');
  return value;
}

function setup(response: (request: CapturedRequest) => Response = () => jsonResponse(page())) {
  const requests: CapturedRequest[] = [];
  const adapter = createPricelineAdapter({ fetchImpl: async (url, options) => {
    assert.equal(typeof options?.body, 'string');
    assert.ok(options && typeof options.body === 'string');
    const payload: unknown = JSON.parse(options.body);
    assert.ok(isRecord(payload));
    assert.ok(typeof payload.operationName === 'string' && typeof payload.query === 'string');
    assert.ok(isRecord(payload.variables));
    const request: CapturedRequest = { url, ...options, body: options.body, payload: {
      operationName: payload.operationName, query: payload.query, variables: payload.variables,
    } };
    requests.push(request);
    return response(request);
  } });
  return { adapter, requests, search: async (options: Partial<Parameters<typeof adapter.listingsPage>[0]> = {}) => {
    const result = await adapter.listingsPage({ context, cursor: null, ...options });
    return { ...result, listings: result.listings.map(row => { assertListing(row); return row; }) };
  } };
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
  assert.match(request.payload.query, /ratesSummary \{[^}]*minStrikePrice/);
  assert.match(request.payload.query, /amenitiesIcons \{ iconName amenityName __typename \}/);
  assert.deepEqual(request.payload.variables, {
    checkIn: '20260921', checkOut: '20260924', adults: 3, children: ['1-0', '2-7'],
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
  assert.equal(stringValue(result.listings[1].pclnId).length, 336);
  assert.deepEqual(result.listings[1].clues, {
    guestRating: { kind: 'minimum', value: 7 }, reviewCount: { kind: 'minimum', value: 3000 },
  });
  assert.ok(stringValue(result.listings[1].handoffUrl).endsWith('/rooms/2/adults/3/children/0,7?cur=USD'));
  assert.equal(result.listings[1].ratesSummary.taxesFees, 'unknown');
  for (const row of result.listings) {
    assert.equal(row.ratesSummary.roomCount, 2);
    assert.equal(row.ratesSummary.nightlyBasis, 'per-room');
    assert.equal(row.ratesSummary.stayBasis, 'all-rooms');
  }
  assert.deepEqual(result.listings[1].hotelFeatures.highlightedAmenities, ['FINTRNT', 'SPOOL', 'PETALLOW']);
  assert.ok(result.cityInfo);
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
  ] satisfies [Partial<TripContext>, string][]) {
    const result = await search({ context: { ...verifiedContext, ...changed } });
    assert.ok(stringValue(result.listings[1].handoffUrl).endsWith(suffix));
  }
});

test('an observed routing city reconstructs the original handoff without another provider request', async () => {
  const { search, adapter, requests } = setup();
  const { listings } = await search();
  const issued = listings[1];
  const before = requests.length;
  assert.equal(adapter.originalOfferUrl({ context, offerId: stringValue(issued.pclnId), cityId: String(issued.location.cityId) }), issued.handoffUrl);
  assert.equal(requests.length, before);
  for (const cityId of [null, '0', 'city-1', '3000015284/other', '1'.repeat(17)]) {
    assert.equal(adapter.originalOfferUrl({ context, offerId: stringValue(issued.pclnId), cityId }), null);
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
    // @ts-expect-error Numeric cursors deliberately exercise the runtime boundary.
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
  assert.equal(variables.originalStringOfferId, 'original-opaque-id');
  assert.equal(variables.roomsCount, 2);
  assert.equal(variables.adults, 3);
  assert.deepEqual(variables.children, ['1-0', '2-7']);
  assert.equal(variables.adultsString, '3');
  assert.deepEqual(variables.childrenAges, [{ age: '1-0' }, { age: '2-7' }]);
  assert.equal(variables.checkIn, '20260921');
  assert.equal(variables.checkOut, '20260924');
  assert.equal(variables.responseOptions, 'CUSTOM_DESC,RATE_SUMMARY,HOTEL_IMAGES');
  assert.doesNotMatch(query.slice(query.indexOf('details: hotelDetails'), query.indexOf('original: sopqHotelDetails')), /pclnId/i);
  assert.match(query.slice(query.indexOf('original: sopqHotelDetails')), /pclnId: \$originalStringOfferId/);
  assert.doesNotMatch(query.slice(query.indexOf('original: sopqHotelDetails')), /hotelID/);
  assert.equal((query.match(/: hotelDetails\(/g) || []).length, 1);
  assert.equal((query.match(/: sopqHotelDetails\(/g) || []).length, 1);
  assert.match(query, /\$childrenAges: \[ChildInput\]/);
  assert.match(query, /priceType: GRAND_TOTAL/);
  assert.match(query, /priceType: EXCLUSIVE_PER_STAY/);
  assert.equal(variables.originalResponseOptions, undefined);
  assert.equal(variables.rateDisplayOption, undefined);
  assert.equal(variables.paymentRateMerge, undefined);
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

interface ModernRate { rateIdentifier: unknown; nightly: { amount: unknown }; base: { amount: unknown }; total: { amount: unknown } }
interface ModernOriginal {
  nightly: { amount: unknown; currencyPrefix: string; savingsPercentage?: string };
  total: { amount: unknown; currencyPrefix: string; description: string; savingsPercentage?: string };
  rooms: { rates: ModernRate[] }[];
}
const modernRate = (): ModernRate => ({ rateIdentifier: 'matching-rate', nightly: { amount: '4.00' },
  base: { amount: '24.00' }, total: { amount: '375.90' } });
const originalDetails = (): ModernOriginal => ({
  nightly: { amount: '4.00', currencyPrefix: '$', savingsPercentage: '80.0' },
  total: { amount: '375.90', currencyPrefix: '$', description: 'Total: $375.90 includes taxes & fees', savingsPercentage: '42.0' },
  rooms: [
    { rates: [{ rateIdentifier: 'other-rate', nightly: { amount: '6.00' }, base: { amount: '36.00' }, total: { amount: '400.00' } }] },
    { rates: [modernRate()] },
  ],
});
const pricingContext = { ...context, rooms: 2, adults: 4, childrenAges: [7] };
const quoteRequest = (adapter: ReturnType<typeof createPricelineAdapter>) => adapter.hotelDetails({ context: pricingContext, hotelId: '49205', offerId: 'original-opaque-id' });

test('currency binds listing amounts, original totals and provider handoff without conversion', async () => {
  for (const [currency, prefix] of [['USD', '$'], ['EUR', '€'], ['GBP', '£'], ['CAD', 'C$'], ['AUD', 'AU$']] as const) {
    const trip = { ...pricingContext, currency };
    const rows = [named, opaque].map(row => ({ ...row, ratesSummary: { ...row.ratesSummary, minCurrencyCode: currency } }));
    const original = originalDetails();
    original.nightly.currencyPrefix = prefix;
    original.total.currencyPrefix = prefix;
    const { adapter, requests, search } = setup(request => jsonResponse(request.payload.operationName === 'HotelRevealerListings'
      ? page({ hotels: rows }) : { data: { original, details: { hotel: { ratesSummary: rows[0].ratesSummary } } } }));
    const listings = await search({ context: trip });
    assert.equal(listings.listings[1].ratesSummary.minCurrencyCode, currency);
    assert.equal(listings.listings[1].ratesSummary.minPrice, '66.00');
    assert.ok(stringValue(listings.listings[1].handoffUrl).endsWith(`?cur=${currency}`));
    const detail = await adapter.hotelDetails({ context: trip, offerId: opaque.pclnId, hotelId: named.hotelId });
    assert.ok(detail.originalQuote);
    assert.equal(detail.originalQuote.currency, currency);
    assert.ok(detail.originalQuote);
    assert.equal(detail.originalQuote.totalCents, 37590);
    assert.ok(detail.retailQuote);
    assert.equal(detail.retailQuote.minCurrencyCode, currency);
    assert.ok(requests.every(request => request.payload.variables.currencyCode === currency));
    original.total.currencyPrefix = currency === 'USD' ? '€' : '$';
    assert.equal((await adapter.hotelDetails({ context: trip, offerId: opaque.pclnId, hotelId: named.hotelId })).originalQuote, null);
  }
});

test('provider currency fallback suppresses listing and retail prices instead of relabeling amounts', async () => {
  const { adapter, search } = setup(request => jsonResponse(request.payload.operationName === 'HotelRevealerListings'
    ? page() : { data: { details: { hotel: { ratesSummary: named.ratesSummary } } } }));
  const trip: TripContext = { ...context, currency: 'EUR' };
  const result = await search({ context: trip });
  assert.equal(result.listings[1].ratesSummary.minPrice, undefined);
  assert.equal(result.listings[1].ratesSummary.displayPricePerStay, undefined);
  assert.equal(result.listings[1].ratesSummary.advertisedDiscount, undefined);
  const detail = await adapter.hotelDetails({ context: trip, offerId: opaque.pclnId, hotelId: named.hotelId });
  assert.ok(detail.retailQuote);
  assert.equal(Reflect.get(detail.retailQuote, 'minPrice'), undefined);
  assert.equal(detail.originalQuote, null);
});

test('modern family total selects the unique rate matching advertised nightly and total prices', async () => {
  // Shape and amounts: modern-family-total.json, 2026-09-08T03:54:59Z,
  // 2 rooms, 4 adults, child7, Sep21–24. Root savings fields are separate advertised values.
  const { adapter, requests } = setup(() => jsonResponse({ data: { details: { hotel: {} }, original: originalDetails() } }));
  const result = await quoteRequest(adapter);
  assert.deepEqual(result.originalQuote, { nightlyCents: 400, stayCents: 2400, totalCents: 37590,
    currency: 'USD', taxesFees: 'excluded', totalTaxesFees: 'included', roomCount: 2,
    nightlyBasis: 'per-room', stayBasis: 'all-rooms', advertisedDiscount: { percent: 80, source: 'Priceline' } });
  assert.equal(Reflect.get(result.originalQuote, 'propertyFeesCents'), undefined);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload.variables.roomsCount, 2);
  assert.equal(requests[0].payload.variables.adults, 4);
  assert.equal(requests[0].payload.variables.adultsString, '4');
  assert.deepEqual(requests[0].payload.variables.children, ['1-7']);
  assert.deepEqual(requests[0].payload.variables.childrenAges, [{ age: '1-7' }]);
});

test('modern one-room quotes use current root prices and an empty child occupancy', async () => {
  const original = originalDetails();
  original.nightly = { amount: '66.00', currencyPrefix: '$', savingsPercentage: '61.0' };
  original.total = { amount: '439.02', currencyPrefix: '$', description: 'Total: $439.02 includes taxes & fees' };
  original.rooms = [{ rates: [{ rateIdentifier: 'single-room-rate', nightly: { amount: '66.00' },
    base: { amount: '198.00' }, total: { amount: '439.02' } }] }];
  const { adapter, requests } = setup(() => jsonResponse({ data: { details: { hotel: {} }, original } }));
  const result = await adapter.hotelDetails({ context: { ...pricingContext, rooms: 1, adults: 2, childrenAges: [] },
    hotelId: '49205', offerId: 'original-opaque-id' });
  assert.ok(result.originalQuote);
  assert.equal(result.originalQuote.nightlyCents, 6600);
  assert.ok(result.originalQuote);
  assert.equal(result.originalQuote.stayCents, 19800);
  assert.ok(result.originalQuote);
  assert.equal(result.originalQuote.totalCents, 43902);
  assert.deepEqual(requests[0].payload.variables.children, []);
  assert.deepEqual(requests[0].payload.variables.childrenAges, []);
});

test('modern all-room base is corroborated exactly without multiplying totals or inventing rounding tolerance', async () => {
  for (const base of ['12.00', '24.01', '23.99']) {
    const original = originalDetails();
    original.rooms[1].rates[0].base.amount = base;
    const { adapter } = setup(() => jsonResponse({ data: { original, details: { hotel: {
      ratesSummary: { minPrice: '128.90', minCurrencyCode: 'USD' },
    } } } }));
    const result = await quoteRequest(adapter);
    assert.equal(result.originalQuote, null);
    assert.ok(result.retailQuote);
    assert.equal(Reflect.get(result.retailQuote, 'minPrice'), '128.90');
  }
});

test('malformed, ambiguous, or unassociated modern totals leave named details available', async () => {
  const invalid: unknown[] = [null, {}, { hotel: { ratesSummary: { minCurrencyCode: 'USD', rateIdentifier: 'legacy-rate' } } }];
  for (const mutate of [
    (original: ModernOriginal) => { original.nightly.currencyPrefix = '€'; },
    (original: ModernOriginal) => { original.total.currencyPrefix = 'USD'; },
    (original: ModernOriginal) => { original.total.description = 'Taxes and fees excluded'; },
    (original: ModernOriginal) => { original.nightly.amount = '4.001'; },
    (original: ModernOriginal) => { original.nightly.amount = 4; },
    (original: ModernOriginal) => { original.nightly.amount = '0.00'; },
    (original: ModernOriginal) => { original.total.amount = '9007199254740992'; },
    (original: ModernOriginal) => { original.total.amount = 'NaN'; },
    (original: ModernOriginal) => { original.total.amount = '376.00'; },
    (original: ModernOriginal) => { original.rooms[1].rates[0].nightly.amount = '5.00'; },
    (original: ModernOriginal) => { original.rooms[1].rates[0].total.amount = '374.00'; },
    (original: ModernOriginal) => { original.rooms[1].rates[0].rateIdentifier = null; },
    (original: ModernOriginal) => { original.rooms[1].rates[0].base.amount = null; },
    (original: ModernOriginal) => { original.total.amount = '23.00'; original.rooms[1].rates[0].total.amount = '23.00'; },
    (original: ModernOriginal) => { original.rooms.push({ rates: [modernRate()] }); },
  ]) {
    const original = originalDetails();
    mutate(original);
    invalid.push(original);
  }
  for (const original of invalid) {
    const { adapter } = setup(() => jsonResponse({ data: { original, details: { hotel: {
      ratesSummary: { minPrice: '128.90', minCurrencyCode: 'USD' },
    } } } }));
    const result = await quoteRequest(adapter);
    assert.equal(result.originalQuote, null);
    assert.ok(result.retailQuote);
    assert.equal(Reflect.get(result.retailQuote, 'minPrice'), '128.90');
    assert.equal(result.available, undefined);
  }
});

test('modern original discounts come only from the root nightly savings percentage', async () => {
  const original = originalDetails();
  delete original.nightly.savingsPercentage;
  const { adapter } = setup(() => jsonResponse({ data: { original, details: { hotel: {} } } }));
  const result = await quoteRequest(adapter);
  assert.ok(result.originalQuote);
  assert.equal(result.originalQuote.totalCents, 37590);
  assert.ok(result.originalQuote);
  assert.equal(result.originalQuote.advertisedDiscount, undefined);
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
  assert.ok(result.originalQuote);
  assert.equal(result.originalQuote.totalCents, 37590);
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

const nginxErrorPage = (title: string) => `<html>\r\n<head><title>${title}</title></head>\r\n<body>\r\n<center><h1>${title}</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n`;

test('non-HTML 503s and complete stock gateway pages request a maintenance cooldown without retries', async () => {
  for (const [status, body, contentType] of [
    [503, '{}', 'application/json'],
    [503, 'Service unavailable', 'text/plain'],
    [503, new Uint8Array(), null],
    [502, nginxErrorPage('502 Bad Gateway'), 'text/html'],
    [503, nginxErrorPage('503 Service Temporarily Unavailable'), 'text/html'],
    [504, nginxErrorPage('504 Gateway Time-out').replace('>nginx<', '>nginx/1.28.0<'), 'text/html; charset=utf-8'],
  ] as const) {
    const { search, requests } = setup(() => new Response(body, { status,
      headers: { ...(contentType ? { 'Content-Type': contentType } : {}), 'Retry-After': '120' } }));
    await assert.rejects(search(), error => {
      assert.ok(error instanceof ProviderFailure);
      assert.equal(error.kind, 'maintenance');
      assert.equal(error.retryAfter, '120');
      assert.deepEqual(error.provider, { operation: 'HotelRevealerListings', httpStatus: status,
        responseType: contentType?.startsWith('text/html') ? 'html' : contentType === 'application/json' ? 'json' : contentType ? 'other' : 'missing', category: 'maintenance' });
      return true;
    });
    assert.equal(requests.length, 1);
  }
});

test('unknown, altered, incomplete and oversized HTML stays blocked even with a maintenance status and Retry-After', async () => {
  const normal = nginxErrorPage('503 Service Temporarily Unavailable');
  for (const body of [
    '<html>Maintenance: verify your browser</html>',
    normal.replace('<body>', '<body onload="challenge()">'),
    normal.replace('</body>', '<script>challenge()</script></body>'),
    normal.replace('</body>', '<a href="/verify">Continue</a></body>'),
    normal.replace('</body>', 'Please verify access</body>'),
    normal.replace('</html>', ''),
    nginxErrorPage('502 Bad Gateway'),
    `${normal}${' '.repeat(8192)}`,
  ]) {
    const { search, requests } = setup(() => new Response(body, { status: 503,
      headers: { 'Content-Type': 'text/html', 'Retry-After': '1' } }));
    await assert.rejects(search(), { kind: 'challenge', provider: { operation: 'HotelRevealerListings',
      httpStatus: 503, responseType: 'html', category: 'unknown_html' } });
    assert.equal(requests.length, 1);
  }
  for (const status of [200, 401, 403]) {
    const { search } = setup(() => new Response(normal, { status, headers: { 'Content-Type': 'text/html', 'Retry-After': '1' } }));
    await assert.rejects(search(), { kind: 'challenge' });
  }
});

test('HTML inspection cancels oversized or aborted streams and never restores unknown access', async () => {
  let cancelled = false;
  let reads = 0;
  const body = new ReadableStream({
    pull(controller) { reads += 1; controller.enqueue(new Uint8Array(4097)); },
    cancel() { cancelled = true; },
  });
  const { search } = setup(() => new Response(body, { status: 503, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(search(), { kind: 'challenge' });
  assert.equal(cancelled, true);
  assert.ok(reads <= 3);

  const controller = new AbortController();
  let reading!: () => void;
  const started = new Promise<void>(resolve => { reading = resolve; });
  let abortCancelled = false;
  const stalled = setup(() => new Response(new ReadableStream({
    pull() { reading(); }, cancel() { abortCancelled = true; },
  }), { status: 503, headers: { 'Content-Type': 'text/html' } }));
  const request = stalled.search({ signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(request, { kind: 'challenge' });
  assert.equal(abortCancelled, true);
});

test('safe diagnostics distinguish GraphQL schema drift from execution and HTTP failures', async () => {
  for (const [response, expected] of [
    [() => jsonResponse({ errors: [{ message: 'private-sentinel', extensions: { code: 'GRAPHQL_VALIDATION_FAILED', secret: 'private-sentinel' } }] }),
      { httpStatus: 200, responseType: 'json', category: 'graphql_schema' }],
    [() => jsonResponse({ errors: [{ message: 'private-sentinel', extensions: { code: 'private-sentinel' } }] }),
      { httpStatus: 200, responseType: 'json', category: 'graphql_execution' }],
    [() => new Response('private-sentinel', { status: 500, headers: { 'Content-Type': 'text/plain; secret=private-sentinel' } }),
      { httpStatus: 500, responseType: 'other', category: 'http' }],
    [() => new Response('{private-sentinel', { headers: { 'Content-Type': 'application/json' } }),
      { httpStatus: 200, responseType: 'json', category: 'invalid_json' }],
  ] as const) {
    const { search } = setup(response);
    await assert.rejects(search(), error => {
      assert.ok(isRecord(error));
      assert.deepEqual(error.provider, { operation: 'HotelRevealerListings', ...expected });
      assert.doesNotMatch(JSON.stringify(error), /private-sentinel/);
      return true;
    });
  }
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

test('transport failures preserve causes while response-processing bugs propagate unchanged', async () => {
  const network = new TypeError('private transport information');
  const failedFetch = setup(() => { throw network; });
  await assert.rejects(failedFetch.search(), error => error instanceof ProviderFailure && error.kind === 'unavailable' && error.cause === network);
  const failedStream = setup(() => new Response(new ReadableStream({ start(controller) { controller.error(network); } }),
    { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(failedStream.search(), error => error instanceof ProviderFailure && error.cause === network);
  const bug = new TypeError('private processing information');
  const failedProcessing = setup(() => {
    const response = new Response();
    Object.defineProperty(response, 'status', { get() { throw bug; } });
    return response;
  });
  await assert.rejects(failedProcessing.search(), error => error === bug);
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
  let cancel!: () => void;
  const cancelled = new Promise<void>(resolve => { cancel = resolve; });
  let beginRead!: () => void;
  const reading = new Promise<void>(resolve => { beginRead = resolve; });
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


test('offer-only request invokes only original pricing with the complete family context', async () => {
  const { adapter, requests } = setup(() => jsonResponse({ data: { original: originalDetails() } }));
  const result = await adapter.hotelDetails({ context: pricingContext, offerId: 'original-opaque-id' });
  const { query, variables, operationName } = requests[0].payload;
  assert.equal(operationName, 'HotelRevealerQuote');
  assert.match(query, /original: sopqHotelDetails/);
  assert.doesNotMatch(query, /details: hotelDetails|\$hotelID|\$adults:|\$children:|\$appCode|\$responseOptions|\$multiOcc/);
  assert.equal(variables.hotelID, undefined);
  assert.equal(variables.originalStringOfferId, 'original-opaque-id');
  assert.equal(variables.roomsCount, 2);
  assert.equal(variables.adultsString, '4');
  assert.deepEqual(variables.childrenAges, [{ age: '1-7' }]);
  assert.ok(result.originalQuote);
  assert.equal(result.originalQuote.totalCents, 37590);
  assert.equal(result.available, false);
});

test('offer-only missing and partial original pricing remains an expected unavailable result', async () => {
  for (const body of [{ data: { original: null } },
    { data: { original: {} }, errors: [{ message: 'private failure', path: ['original', 'total'] }] }]) {
    const { adapter } = setup(() => jsonResponse(body));
    await assert.rejects(adapter.hotelDetails({ context: pricingContext, offerId: 'original-opaque-id' }),
      { code: 'PROVIDER_RESPONSE_INVALID' });
  }
});
