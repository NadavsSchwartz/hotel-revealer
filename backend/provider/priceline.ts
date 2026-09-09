import { getDestination } from '../destinations/index.ts';
import { isRecord, normalizedId } from '../domain/validation.ts';
import { numberOrNull, normalizeQuote } from '../domain/normalization.ts';
import { ProviderFailure, ServiceError, providerDiagnostic } from './errors.ts';
import { MAX_JSON_BYTES } from './size.ts';
import { nightCount } from '../../shared/travel.ts';
import { isCurrency } from '../../shared/currency.ts';
import type { Destination, TripContext } from '../../shared/contracts.ts';
import type { ProviderDiagnostic } from './errors.ts';
import type { ProviderParameters } from './types.ts';
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
interface GraphqlResponse extends Record<string, unknown> { errors?: unknown[] | null; data?: unknown }

const ENDPOINT = 'https://www.priceline.com/pws/v0/pcln-graph/';
const PAGE_SIZE = 500;
const MAX_DESTINATION_DISTANCE_KM = 100;
// Observed on public quote responses; the provider uses AU$, not Intl's A$.
const CURRENCY_PREFIXES = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'AU$' };

const LISTINGS_QUERY = `query HotelRevealerListings(
  $locationID: ID, $checkIn: DateString, $checkOut: DateString,
  $adults: Int, $children: [String], $roomCount: Int, $first: Int, $offset: Int,
  $productTypes: [HotelProductEnum], $currencyCode: HotelCurrencyEnum,
  $appCode: HotelAppCodeEnum, $includePSLResponse: Boolean,
  $includePrepaidFeeRates: Boolean, $sortBy: HotelSortEnum,
  $multiOccDisplay: Boolean, $multiOccRates: Boolean
) {
  listings: hotelListings(
    locationID: $locationID, checkIn: $checkIn, checkOut: $checkOut,
    adults: $adults, children: $children, roomCount: $roomCount,
    first: $first, offset: $offset, productTypes: $productTypes,
    currencyCode: $currencyCode, appCode: $appCode,
    includePSLResponse: $includePSLResponse, includePrepaidFeeRates: $includePrepaidFeeRates,
    sortBy: $sortBy, multiOccDisplay: $multiOccDisplay, multiOccRates: $multiOccRates
  ) {
    errorMessage offset pageSize totalSize
    cityInfo { cityId cityName stateCode countryCode searchedLatitude searchedLongitude }
    hotels {
      hotelId pclnId hotelType name starRating overallGuestRating totalReviewCount thumbnailUrl displaySavingsPct
      ratesSummary { programName minPrice minStrikePrice minCurrencyCode displayPricePerStay pricedOccupancy }
      location { cityId neighborhoodID neighborhoodName latitude longitude }
      hotelFeatures { highlightedAmenities }
      amenitiesIcons { iconName amenityName __typename }
    }
  }
}`;

const ORIGINAL_QUERY = `
  original: sopqHotelDetails(pclnId: $originalStringOfferId, context: { appCode: "DESKTOP" }) {
    nightly: price(
      hotelRequest: {
        checkIn: $checkIn, checkOut: $checkOut, currencyCode: $currencyCode,
        occupancy: { adults: $adultsString, children: $childrenAges }, roomCount: $roomsCount,
        dealInfo: { unlockDeals: true, includePrepaidFeeRates: true, rateDisplayOption: FLAT }
      }, pclnId: $originalStringOfferId, priceType: MIN_PRICE
    ) { amount currencyPrefix savingsPercentage }
    total: price(
      hotelRequest: {
        checkIn: $checkIn, checkOut: $checkOut, currencyCode: $currencyCode,
        occupancy: { adults: $adultsString, children: $childrenAges }, roomCount: $roomsCount,
        dealInfo: { unlockDeals: true, includePrepaidFeeRates: true, rateDisplayOption: FLAT }
      }, pclnId: $originalStringOfferId, priceType: GRAND_TOTAL
    ) { amount currencyPrefix description }
    rooms(pclnId: $originalStringOfferId, hotelRequest: {
      checkIn: $checkIn, checkOut: $checkOut, currencyCode: $currencyCode,
      occupancy: { adults: $adultsString, children: $childrenAges }, roomCount: $roomsCount,
      dealInfo: { unlockDeals: true, includePrepaidFeeRates: true, rateDisplayOption: FLAT }
    }) {
      rates {
        rateIdentifier
        nightly: price(priceType: AVERAGE_NIGHTLY_RATE) { amount }
        base: price(priceType: EXCLUSIVE_PER_STAY) { amount }
        total: price(priceType: TOTAL) { amount }
      }
    }
  }`;

const QUOTE_QUERY = `query HotelRevealerQuote(
  $originalStringOfferId: String!, $checkIn: String!, $checkOut: String!, $roomsCount: Int!,
  $currencyCode: String!, $adultsString: String!, $childrenAges: [ChildInput]
) {
${ORIGINAL_QUERY}
}`;

const DETAILS_QUERY = `query HotelRevealerDetails(
  $hotelID: ID, $originalStringOfferId: String!, $checkIn: String!, $checkOut: String!, $roomsCount: Int!,
  $currencyCode: String!, $appCode: String, $adults: Int, $children: [String],
  $responseOptions: String, $includePrepaidFeeRates: Boolean,
  $multiOccDisplay: Boolean, $multiOccRates: Boolean,
  $adultsString: String!, $childrenAges: [ChildInput]
) {
  details: hotelDetails(
    hotelID: $hotelID, checkIn: $checkIn, checkOut: $checkOut, roomsCount: $roomsCount,
    currencyCode: $currencyCode, appCode: $appCode, adults: $adults, children: $children,
    responseOptions: $responseOptions, includePrepaidFeeRates: $includePrepaidFeeRates,
    multiOccDisplay: $multiOccDisplay, multiOccRates: $multiOccRates
  ) {
    errorMessage
    hotel {
      location { address { addressLine1 addressLine2 cityName provinceCode isoCountryCode } }
      hotelFeatures { hotelAmenities { name code } }
      images { imageHDURL imageURL }
      ratesSummary { minPrice minCurrencyCode }
    }
  }
${ORIGINAL_QUERY}
}`;

const invalidResponse = (category = 'invalid_shape') => new ServiceError('PROVIDER_RESPONSE_INVALID', { provider: { category } });

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
}

async function cancelBody(response: Response) {
  try { await response.body?.cancel(); } catch { /* Cancellation is best effort. */ }
}

async function readBody(response: Response, signal?: AbortSignal, maximum = MAX_JSON_BYTES) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > maximum) {
    await cancelBody(response);
    throw new ServiceError('RESULT_TOO_LARGE');
  }
  if (!response.body || typeof response.body.getReader !== 'function') throw invalidResponse();
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      throwIfAborted(signal);
      let chunk;
      try { chunk = await reader.read(); }
      catch (cause) {
        throwIfAborted(signal);
        throw new ProviderFailure('unavailable', { cause, provider: { category: 'network' } });
      }
      const { done, value } = chunk;
      throwIfAborted(signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) throw new ServiceError('RESULT_TOO_LARGE');
      chunks.push(value);
    }
    return Buffer.concat(chunks, bytes).toString('utf8');
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve the original classified failure. */ }
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

async function readJson(response: Response, signal?: AbortSignal, allowPartialDetails = false): Promise<GraphqlResponse> {
  const body = await readBody(response, signal);
  if (/^\s*</.test(body)) throw new ProviderFailure('challenge', { provider: { category: 'unknown_html' } });
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw invalidResponse('invalid_json'); }
  if (!isRecord(parsed)) throw invalidResponse();
  if (parsed.errors != null) {
    if (!Array.isArray(parsed.errors)) throw invalidResponse();
    if (parsed.errors.length > 0 && !(allowPartialDetails && isRecord(parsed.data) &&
        parsed.errors.every((error: unknown) => { const path = record(error).path; return Array.isArray(path) && ['details', 'original'].includes(path[0]); }))) {
      const schemaError = parsed.errors.some((error: unknown) => ['GRAPHQL_VALIDATION_FAILED', 'GRAPHQL_PARSE_FAILED', 'PERSISTED_QUERY_NOT_FOUND'].some(code => code === record(record(error).extensions).code));
      throw new ProviderFailure('unavailable', { provider: { category: schemaError ? 'graphql_schema' : 'graphql_execution' } });
    }
  }
  return parsed as GraphqlResponse;
}

// Recognize only complete stock nginx gateway/maintenance documents. A status
// code or a phrase such as "temporarily unavailable" cannot identify a challenge.
// Template source: nginx/src/http/ngx_http_special_response.c.
function temporaryErrorPage(body: string, status: number) {
  const titles: Record<number, string> = { 502: '502 Bad Gateway', 503: '503 Service Temporarily Unavailable', 504: '504 Gateway Time-out' };
  const title = titles[status];
  if (!title) return false;
  const compact = body.replace(/>\s+</g, '><').trim();
  const head = `<html><head><title>${title}</title></head><body><center><h1>${title}</h1></center>`;
  if (!compact.startsWith(head)) return false;
  return /^<hr><center>nginx(?:\/\d+\.\d+\.\d+)?<\/center><\/body><\/html>$/.test(compact.slice(head.length));
}

async function classifyHtml(response: Response, signal?: AbortSignal) {
  if (![502, 503, 504].includes(response.status)) {
    await cancelBody(response);
    throw new ProviderFailure('challenge', { provider: { category: 'unknown_html' } });
  }
  try {
    const body = await readBody(response, signal, 8 * 1024);
    if (temporaryErrorPage(body, response.status)) {
      return new ProviderFailure('maintenance', { retryAfter: response.headers.get('retry-after'), provider: { category: 'maintenance' } });
    }
  } catch (error) {
    if (!signal?.aborted && !(error instanceof ServiceError) && !(error instanceof ProviderFailure)) throw error;
    // A truncated, oversized or interrupted interstitial is still unknown.
    throw new ProviderFailure('challenge', { cause: error, provider: { category: 'unknown_html' } });
  }
  return new ProviderFailure('challenge', { provider: { category: 'unknown_html' } });
}

function tripVariables(context: TripContext) {
  return {
    checkIn: context.checkIn.replaceAll('-', ''),
    checkOut: context.checkOut.replaceAll('-', ''),
    adults: context.adults,
    children: context.childrenAges.map((age, index) => `${index + 1}-${age}`),
    currencyCode: context.currency,
    appCode: 'DESKTOP',
    includePrepaidFeeRates: true,
    multiOccDisplay: true,
    multiOccRates: true,
  };
}

function pageOffset(cursor: unknown) {
  if (cursor === null) return 0;
  if (typeof cursor !== 'string' || !/^[1-9]\d{0,3}$/.test(cursor)) throw invalidResponse();
  const offset = Number(cursor);
  // The coordinator permits three pages, and each request asks for 500 rows.
  if (offset > 2 * PAGE_SIZE) throw invalidResponse();
  return offset;
}

function trimText(value: unknown) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function hasNearbyListing(rows: unknown[], destination: Destination) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  return rows.some(row => {
    if (!isRecord(row)) return false;
    const named = row.hotelType === 'RTL' && normalizedId(row.hotelId) && trimText(row.name);
    const programName = record(row.ratesSummary).programName;
    const opaque = row.hotelType === 'SOPQ' && normalizedId(row.pclnId, 1024) &&
      typeof programName === 'string' && programName.toUpperCase() === 'EXPRESS_DEAL';
    if (!named && !opaque) return false;
    const { latitude, longitude } = record(row.location);
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) || Math.abs(longitude) > 180) return false;
    const latitudeDelta = radians(latitude - destination.latitude);
    const longitudeDelta = radians(longitude - destination.longitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(destination.latitude)) * Math.cos(radians(latitude)) * Math.sin(longitudeDelta / 2) ** 2;
    const distanceKm = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
    // Published hotel or neighborhood coordinates catch distant namesakes.
    return distanceKm <= MAX_DESTINATION_DISTANCE_KM;
  });
}

function originalOfferUrl({ context, offerId, cityId }: { context: TripContext; offerId: unknown; cityId: unknown }) {
  // The public guest selector encodes aggregate room/adult counts and child ages.
  if (!isCurrency(context.currency) ||
      typeof offerId !== 'string' || !/^[a-f\d]{1,1024}$/i.test(offerId) ||
      !/^[1-9]\d{0,15}$/.test(String(cityId))) return null;
  return `https://www.priceline.com/relax-ui/at/express/${cityId}/${offerId}` +
    `/from/${context.checkIn.replaceAll('-', '')}/to/${context.checkOut.replaceAll('-', '')}` +
    `/rooms/${context.rooms}/adults/${context.adults}` +
    (context.childrenAges.length ? `/children/${context.childrenAges.join(',')}` : '') + `?cur=${context.currency}`;
}

function adaptQuote(ratesSummary: Record<string, unknown>, context: TripContext, advertisedPercent?: unknown) {
  // A provider fallback must never be displayed as the requested currency.
  const sameCurrency = ratesSummary.minCurrencyCode === context.currency;
  const rates: Record<string, unknown> = sameCurrency ? ratesSummary : { programName: ratesSummary.programName };
  const percent = sameCurrency ? numberOrNull(advertisedPercent, { max: 100 }) : null;
  return {
    ...rates, minCurrencyCode: context.currency, roomCount: context.rooms, nightlyBasis: 'per-room',
    ...(rates.displayPricePerStay != null ? { stayBasis: 'all-rooms' } : {}),
    // Base-price field names alone do not establish fee treatment in every country.
    taxesFees: 'unknown',
    ...(percent !== null && percent > 0 && percent < 100 ? { advertisedDiscount: { percent, source: 'Priceline' } } : {}),
  };
}

function adaptListing(row: unknown, context: TripContext) {
  if (!isRecord(row) || !isRecord(row.ratesSummary)) return row;
  const ratesSummary = adaptQuote(row.ratesSummary, context, row.displaySavingsPct);
  // hotelType was observed independently of nullable retail programName.
  if (row.hotelType === 'RTL' && row.ratesSummary.programName == null) {
    return { ...row, ratesSummary: { ...ratesSummary, programName: 'RETAIL' } };
  }
  if (row.hotelType !== 'SOPQ' || typeof row.ratesSummary.programName !== 'string' ||
      row.ratesSummary.programName.toUpperCase() !== 'EXPRESS_DEAL') return { ...row, ratesSummary };
  const guestRating = numberOrNull(row.overallGuestRating, { max: 10 });
  const reviewCount = numberOrNull(row.totalReviewCount, { integer: true });
  return {
    ...row,
    // Current offer UI labels these masked values with '+', establishing minimums.
    clues: {
      guestRating: guestRating === null ? { kind: 'unknown' } : { kind: 'minimum', value: guestRating },
      reviewCount: reviewCount === null ? { kind: 'unknown' } : { kind: 'minimum', value: reviewCount },
    },
    ratesSummary,
    handoffUrl: originalOfferUrl({ context, offerId: row.pclnId, cityId: record(row.location).cityId }),
  };
}

function modernPriceCents(amount: unknown) {
  // Current price fields are decimal strings. Do not round distinct fractional-cent rates into a match.
  if (typeof amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const [whole, fraction = ''] = amount.split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function originalQuote(original: unknown, context: TripContext) {
  const prefix = isCurrency(context.currency) ? CURRENCY_PREFIXES[context.currency] : null;
  if (!isRecord(original)) return null;
  const nightly = record(original.nightly);
  const total = record(original.total);
  if (!prefix || nightly.currencyPrefix !== prefix || total.currencyPrefix !== prefix || !Array.isArray(original.rooms) ||
      typeof total.description !== 'string' || !/includes taxes\s*(?:&|and)\s*fees/i.test(total.description)) return null;
  const nightlyCents = modernPriceCents(nightly.amount);
  const totalCents = modernPriceCents(total.amount);
  if (nightlyCents === null || totalCents === null) return null;
  const matches = original.rooms.flatMap((room: unknown): unknown[] => { const rates = record(room).rates; return Array.isArray(rates) ? rates : []; })
    .filter((rate): rate is Record<string, unknown> => isRecord(rate) && typeof rate.rateIdentifier === 'string' && rate.rateIdentifier.length > 0 &&
      rate.rateIdentifier.length <= 4096 && modernPriceCents(record(rate.nightly).amount) === nightlyCents &&
      modernPriceCents(record(rate.total).amount) === totalCents);
  // Match the advertised nightly and complete total to exactly one current rate.
  if (matches.length !== 1) return null;
  const stayCents = modernPriceCents(record(matches[0].base).amount);
  const expectedBase = nightlyCents * nightCount(context.checkIn, context.checkOut) * context.rooms;
  if (stayCents === null || !Number.isSafeInteger(expectedBase) || stayCents !== expectedBase) return null;
  const quote = normalizeQuote({
    nightlyCents, stayCents, totalCents, currency: context.currency,
    roomCount: context.rooms, nightlyBasis: 'per-room', stayBasis: 'all-rooms',
    taxesFees: 'excluded', totalTaxesFees: 'included',
    advertisedDiscount: { percent: nightly.savingsPercentage, source: 'Priceline' },
  });
  return quote.totalCents == null ? null : quote;
}

function detailsAlias(parsed: GraphqlResponse, alias: 'details' | 'original') {
  return parsed.errors?.some(error => { const path = record(error).path; return Array.isArray(path) && path[0] === alias; }) ? null : record(parsed.data)[alias];
}

/** Normal public requests only; the service owns scheduling, deadlines and caching. */
export function createPricelineAdapter({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  async function request(operationName: string, query: string, variables: Record<string, unknown>, signal?: AbortSignal, allowPartialDetails = false) {
    throwIfAborted(signal);
    const options: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit', redirect: 'error',
      body: JSON.stringify({ operationName, query, variables }), signal,
    };
    let response;
    const provider: ProviderDiagnostic = { operation: operationName };
    try {
      try {
        response = await fetchImpl(ENDPOINT, options);
      } catch (cause) {
        throwIfAborted(signal);
        throw new ProviderFailure('unavailable', { cause, provider: { category: 'network' } });
      }
      throwIfAborted(signal);
      provider.httpStatus = response.status;
      const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
      provider.responseType = !type ? 'missing' : ['text/html', 'application/xhtml+xml'].includes(type) ? 'html'
        : ['application/json', 'application/graphql-response+json'].includes(type) ? 'json' : 'other';
      if ([401, 403].includes(response.status)) {
        await cancelBody(response);
        throw new ProviderFailure('challenge', { provider: { category: 'access_denied' } });
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        await cancelBody(response);
        throw new ProviderFailure('rate_limit', { retryAfter, provider: { category: 'rate_limit' } });
      }
      if (provider.responseType === 'html') throw await classifyHtml(response, signal);
      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        await cancelBody(response);
        const maintenance = response.status === 503;
        throw new ProviderFailure(maintenance ? 'maintenance' : 'unavailable', {
          retryAfter, provider: { category: maintenance ? 'maintenance' : 'http' },
        });
      }
      return await readJson(response, signal, allowPartialDetails);
    } catch (error) {
      if (error instanceof ProviderFailure || error instanceof ServiceError) {
        error.provider = providerDiagnostic({ ...provider,
          ...(error instanceof ServiceError && error.code === 'RESULT_TOO_LARGE' ? { category: 'response_too_large' } : {}), ...error.provider });
      }
      throw error;
    }
  }

  return {
    originalOfferUrl,
    async listingsPage({ context, cursor, signal }: ProviderParameters['listingsPage'] & { signal?: AbortSignal }) {
      const destination = getDestination(context.destinationId);
      if (!destination) throw invalidResponse();
      const offset = pageOffset(cursor);
      const parsed = await request('HotelRevealerListings', LISTINGS_QUERY, {
        ...tripVariables(context), locationID: destination.label, roomCount: context.rooms,
        first: PAGE_SIZE, offset, productTypes: ['RTL', 'SOPQ'],
        includePSLResponse: true, sortBy: 'HDR',
      }, signal);
      const page = record(parsed.data).listings;
      if (!isRecord(page)) throw invalidResponse();
      if (page.errorMessage) throw new ProviderFailure('unavailable');
      if (!Array.isArray(page.hotels) || page.hotels.length > PAGE_SIZE || page.offset !== offset ||
          typeof page.pageSize !== 'number' || !Number.isSafeInteger(page.pageSize) || page.pageSize < 1 || page.pageSize > PAGE_SIZE ||
          typeof page.totalSize !== 'number' || !Number.isSafeInteger(page.totalSize) || page.totalSize < offset + page.hotels.length ||
          page.hotels.length > page.pageSize || (page.hotels.length === 0 && offset < page.totalSize)) {
        throw invalidResponse();
      }
      if (page.hotels.length > 0 && !hasNearbyListing(page.hotels, destination)) {
        throw new ServiceError('PROVIDER_DESTINATION_UNSUPPORTED');
      }
      const listings = page.hotels.map(row => adaptListing(row, context));
      const nextOffset = offset + page.pageSize;
      return { listings, nextCursor: nextOffset < page.totalSize ? String(nextOffset) : null,
        cityInfo: isRecord(page.cityInfo) ? page.cityInfo : null };
    },

    async hotelDetails({ context, offerId, hotelId, signal }: Omit<ProviderParameters['hotelDetails'], 'offerId'> & { offerId?: string; signal?: AbortSignal }) {
      const trip = tripVariables(context);
      const quoteVariables = {
        originalStringOfferId: offerId, checkIn: trip.checkIn, checkOut: trip.checkOut,
        roomsCount: context.rooms, currencyCode: context.currency,
        adultsString: String(context.adults), childrenAges: trip.children.map(age => ({ age })),
      };
      const parsed = hotelId === undefined
        ? await request('HotelRevealerQuote', QUOTE_QUERY, quoteVariables, signal, true)
        : await request('HotelRevealerDetails', DETAILS_QUERY, {
          ...trip, ...quoteVariables, hotelID: hotelId,
          responseOptions: 'CUSTOM_DESC,RATE_SUMMARY,HOTEL_IMAGES',
        }, signal, true);
      const details = hotelId === undefined ? null : detailsAlias(parsed, 'details');
      const selectedQuote = originalQuote(detailsAlias(parsed, 'original'), context);
      const namedAvailable = isRecord(details) && !details.errorMessage && isRecord(details.hotel);
      if (!namedAvailable && !selectedQuote) {
        if (record(details).errorMessage) throw new ProviderFailure('unavailable');
        throw invalidResponse();
      }
      const hotel = namedAvailable ? record(details.hotel) : {};
      const address = record(hotel.location).address;
      const hotelAmenities = record(hotel.hotelFeatures).hotelAmenities;
      return {
        // Add description only after its current GraphQL field is verified.
        description: null,
        images: (Array.isArray(hotel.images) ? hotel.images : [])
          .map((item: unknown) => trimText(record(item).imageHDURL) ?? trimText(record(item).imageURL)).filter(Boolean),
        amenities: (Array.isArray(hotelAmenities) ? hotelAmenities : [])
          .map((item: unknown) => trimText(record(item).name)).filter(Boolean),
        address: isRecord(address) ? [address.addressLine1, address.addressLine2, address.cityName,
          address.provinceCode, address.isoCountryCode].map(trimText).filter(Boolean).join(', ') || null : null,
        retailQuote: isRecord(hotel.ratesSummary) ? adaptQuote(hotel.ratesSummary, context) : null,
        originalQuote: selectedQuote,
        ...(!namedAvailable ? { available: false } : {}),
      };
    },
  };
}
