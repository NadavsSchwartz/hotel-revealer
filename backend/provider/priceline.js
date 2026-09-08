import { getDestination } from '../destinations/index.js';
import { isRecord, normalizedId } from '../domain/validation.js';
import { numberOrNull, normalizeQuote } from '../domain/normalization.js';
import { ProviderFailure, ServiceError } from './errors.js';
import { MAX_JSON_BYTES } from './size.js';
import { nightCount } from '../../shared/travel.js';

const ENDPOINT = 'https://www.priceline.com/pws/v0/pcln-graph/';
const PAGE_SIZE = 500;
const MAX_DESTINATION_DISTANCE_KM = 100;

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
      ratesSummary { programName minPrice minCurrencyCode displayPricePerStay pricedOccupancy }
      location { cityId neighborhoodID neighborhoodName latitude longitude }
      hotelFeatures { highlightedAmenities }
    }
  }
}`;

const DETAILS_QUERY = `query HotelRevealerDetails(
  $hotelID: ID, $offerId: ID, $checkIn: String, $checkOut: String, $roomsCount: Int,
  $currencyCode: String, $appCode: String, $adults: Int, $children: [String],
  $responseOptions: String, $includePrepaidFeeRates: Boolean,
  $multiOccDisplay: Boolean, $multiOccRates: Boolean,
  $originalResponseOptions: String, $rateDisplayOption: String, $paymentRateMerge: Boolean
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
  original: hotelDetails(
    pclnID: $offerId, checkIn: $checkIn, checkOut: $checkOut, roomsCount: $roomsCount,
    currencyCode: $currencyCode, appCode: $appCode, adults: $adults, children: $children,
    responseOptions: $originalResponseOptions, includePrepaidFeeRates: $includePrepaidFeeRates,
    multiOccDisplay: $multiOccDisplay, multiOccRates: $multiOccRates,
    rateDisplayOption: $rateDisplayOption, paymentRateMerge: $paymentRateMerge
  ) {
    errorMessage
    hotel {
      ratesSummary { minCurrencyCode rateIdentifier status }
      transformedRooms {
        roomRates { rateIdentifier price grandTotal totalPriceExcludingTaxesAndFeePerStay programName savingPct }
      }
    }
  }
}`;

const invalidResponse = () => new ServiceError('PROVIDER_RESPONSE_INVALID');

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
}

async function cancelBody(response) {
  try { await response.body?.cancel(); } catch { /* Cancellation is best effort. */ }
}

async function readJson(response, signal, allowPartialDetails = false) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_JSON_BYTES) {
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
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BYTES) throw new ServiceError('RESULT_TOO_LARGE');
      chunks.push(value);
    }
    const body = Buffer.concat(chunks, bytes).toString('utf8');
    // HTML at this JSON endpoint is an unsupported interstitial; stop further requests.
    if (/^\s*</.test(body)) throw new ProviderFailure('challenge');
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw invalidResponse(); }
    if (!isRecord(parsed)) throw invalidResponse();
    if (parsed.errors != null) {
      if (!Array.isArray(parsed.errors) || (parsed.errors.length > 0 && !(allowPartialDetails && isRecord(parsed.data) &&
          parsed.errors.every(error => Array.isArray(error?.path) && ['details', 'original'].includes(error.path[0]))))) {
        throw new ProviderFailure('unavailable');
      }
    }
    return parsed;
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve the original classified failure. */ }
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

function tripVariables(context) {
  return {
    checkIn: context.checkIn.replaceAll('-', ''),
    checkOut: context.checkOut.replaceAll('-', ''),
    adults: context.adults,
    children: context.childrenAges.map(String),
    currencyCode: context.currency,
    appCode: 'DESKTOP',
    includePrepaidFeeRates: true,
    multiOccDisplay: true,
    multiOccRates: true,
  };
}

function pageOffset(cursor) {
  if (cursor === null) return 0;
  if (typeof cursor !== 'string' || !/^[1-9]\d{0,3}$/.test(cursor)) throw invalidResponse();
  const offset = Number(cursor);
  // The coordinator permits three pages, and each request asks for 500 rows.
  if (offset > 2 * PAGE_SIZE) throw invalidResponse();
  return offset;
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function hasNearbyListing(rows, destination) {
  const radians = degrees => degrees * Math.PI / 180;
  return rows.some(row => {
    if (!isRecord(row)) return false;
    const named = row.hotelType === 'RTL' && normalizedId(row.hotelId) && trimText(row.name);
    const opaque = row.hotelType === 'SOPQ' && normalizedId(row.pclnId, 1024) &&
      typeof row.ratesSummary?.programName === 'string' && row.ratesSummary.programName.toUpperCase() === 'EXPRESS_DEAL';
    if (!named && !opaque) return false;
    const { latitude, longitude } = row.location ?? {};
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
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

function originalOfferUrl(row, context) {
  // The public guest selector encodes aggregate room/adult counts and child ages.
  if (context.currency !== 'USD' ||
      typeof row.pclnId !== 'string' || !/^[a-f\d]{1,1024}$/i.test(row.pclnId) ||
      !/^[1-9]\d{0,15}$/.test(String(row.location?.cityId))) return null;
  return `https://www.priceline.com/relax-ui/at/express/${row.location.cityId}/${row.pclnId}` +
    `/from/${context.checkIn.replaceAll('-', '')}/to/${context.checkOut.replaceAll('-', '')}` +
    `/rooms/${context.rooms}/adults/${context.adults}` +
    (context.childrenAges.length ? `/children/${context.childrenAges.join(',')}` : '') + '?cur=USD';
}

function adaptQuote(ratesSummary, context, advertisedPercent) {
  const percent = numberOrNull(advertisedPercent, { max: 100 });
  return {
    ...ratesSummary, roomCount: context.rooms, nightlyBasis: 'per-room',
    ...(ratesSummary.displayPricePerStay != null ? { stayBasis: 'all-rooms' } : {}),
    // Base-price field names alone do not establish fee treatment in every country.
    taxesFees: 'unknown',
    ...(percent !== null && percent > 0 && percent < 100 ? { advertisedDiscount: { percent, source: 'Priceline' } } : {}),
  };
}

function adaptListing(row, context) {
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
    handoffUrl: originalOfferUrl(row, context),
  };
}

function originalQuote(original, context) {
  const hotel = original?.hotel;
  const summary = hotel?.ratesSummary;
  if (!isRecord(original) || original.errorMessage || !isRecord(hotel) || !isRecord(summary) ||
      summary.status !== 'AVAILABLE' || summary.minCurrencyCode !== 'USD' ||
      typeof summary.rateIdentifier !== 'string' || !summary.rateIdentifier || summary.rateIdentifier.length > 4096 ||
      !Array.isArray(hotel.transformedRooms)) return null;
  const matches = hotel.transformedRooms.flatMap(room => Array.isArray(room?.roomRates) ? room.roomRates : [])
    .filter(rate => isRecord(rate) && rate.rateIdentifier === summary.rateIdentifier);
  // A preferred identifier must select exactly one rate; never guess by room order.
  if (matches.length !== 1 || typeof matches[0].programName !== 'string' ||
      matches[0].programName.toUpperCase() !== 'EXPRESS_DEAL') return null;
  const rate = matches[0];
  const quote = normalizeQuote({
    minPrice: rate.price, displayPricePerStay: rate.totalPriceExcludingTaxesAndFeePerStay,
    grandTotal: rate.grandTotal, minCurrencyCode: summary.minCurrencyCode,
    roomCount: context.rooms, nightlyBasis: 'per-room', stayBasis: 'all-rooms',
    taxesFees: 'excluded', totalTaxesFees: 'included',
    advertisedDiscount: { percent: rate.savingPct, source: 'Priceline' },
  });
  if (quote.totalCents == null) return null;
  if (context.rooms > 1) {
    const expectedBase = quote.nightlyCents * nightCount(context.checkIn, context.checkOut) * context.rooms;
    // Confirm the all-room base instead of multiplying a possibly per-room total.
    if (!Number.isSafeInteger(expectedBase) || quote.stayCents !== expectedBase) return null;
  }
  return quote;
}

function detailsAlias(parsed, alias) {
  return parsed.errors?.some(error => error.path?.[0] === alias) ? null : parsed.data?.[alias];
}

/** Normal public requests only; the service owns scheduling, deadlines and caching. */
export function createPricelineAdapter({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  async function request(operationName, query, variables, signal, allowPartialDetails = false) {
    throwIfAborted(signal);
    try {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'omit', redirect: 'error',
        body: JSON.stringify({ operationName, query, variables }), signal,
      });
      throwIfAborted(signal);
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        await cancelBody(response);
        throw new ProviderFailure('rate_limit', { retryAfter });
      }
      if ([401, 403].includes(response.status) || /text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) {
        await cancelBody(response);
        throw new ProviderFailure('challenge');
      }
      if (!response.ok) {
        await cancelBody(response);
        throw new ProviderFailure('unavailable');
      }
      return await readJson(response, signal, allowPartialDetails);
    } catch (error) {
      throwIfAborted(signal);
      if (error instanceof ProviderFailure || error instanceof ServiceError) throw error;
      throw new ProviderFailure('unavailable');
    }
  }

  return {
    async listingsPage({ context, cursor, signal }) {
      const destination = getDestination(context.destinationId);
      if (!destination) throw invalidResponse();
      const offset = pageOffset(cursor);
      const parsed = await request('HotelRevealerListings', LISTINGS_QUERY, {
        ...tripVariables(context), locationID: destination.label, roomCount: context.rooms,
        first: PAGE_SIZE, offset, productTypes: ['RTL', 'SOPQ'],
        includePSLResponse: true, sortBy: 'HDR',
      }, signal);
      const page = parsed.data?.listings;
      if (!isRecord(page)) throw invalidResponse();
      if (page.errorMessage) throw new ProviderFailure('unavailable');
      if (!Array.isArray(page.hotels) || page.hotels.length > PAGE_SIZE || page.offset !== offset ||
          !Number.isSafeInteger(page.pageSize) || page.pageSize < 1 || page.pageSize > PAGE_SIZE ||
          !Number.isSafeInteger(page.totalSize) || page.totalSize < offset + page.hotels.length ||
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

    async hotelDetails({ context, offerId, hotelId, signal }) {
      // One HTTP request contains two resolver calls with separate opaque/named IDs.
      const parsed = await request('HotelRevealerDetails', DETAILS_QUERY, {
        ...tripVariables(context), hotelID: hotelId, offerId, roomsCount: context.rooms,
        responseOptions: 'CUSTOM_DESC,RATE_SUMMARY,HOTEL_IMAGES',
        originalResponseOptions: 'RATE_SUMMARY,DETAILED_ROOM,RATE_CHARGES_DETAIL,RATE_IMPORTANT_INFO',
        rateDisplayOption: 'S', paymentRateMerge: false,
      }, signal, true);
      const details = detailsAlias(parsed, 'details');
      const selectedQuote = originalQuote(detailsAlias(parsed, 'original'), context);
      const namedAvailable = isRecord(details) && !details.errorMessage && isRecord(details.hotel);
      if (!namedAvailable && !selectedQuote) {
        if (details?.errorMessage) throw new ProviderFailure('unavailable');
        throw invalidResponse();
      }
      const hotel = namedAvailable ? details.hotel : {};
      const address = hotel.location?.address;
      return {
        // Add description only after its current GraphQL field is verified.
        description: null,
        images: (Array.isArray(hotel.images) ? hotel.images : [])
          .map((item) => trimText(item?.imageHDURL) ?? trimText(item?.imageURL)).filter(Boolean),
        amenities: (Array.isArray(hotel.hotelFeatures?.hotelAmenities) ? hotel.hotelFeatures.hotelAmenities : [])
          .map((item) => trimText(item?.name)).filter(Boolean),
        address: isRecord(address) ? [address.addressLine1, address.addressLine2, address.cityName,
          address.provinceCode, address.isoCountryCode].map(trimText).filter(Boolean).join(', ') || null : null,
        retailQuote: isRecord(hotel.ratesSummary) ? adaptQuote(hotel.ratesSummary, context) : null,
        originalQuote: selectedQuote,
        ...(!namedAvailable ? { available: false } : {}),
      };
    },
  };
}
