import { isCurrency } from '../../../shared/currency.ts';
import { validIdentifier, MAX_OFFER_ID_LENGTH } from '../../../shared/identifiers.ts';
import { isCalendarDate } from '../../../shared/travel.ts';
import type { Backoff, Candidate, Coverage, DetailResponse, HotelDetails, NumericClue, Offer, OfferClues, Quote, SearchResponse, TripContext, UnresolvedReason } from '../../../shared/contracts.ts';

// The UI deliberately supports a missing guest rating even though the current
// provider emits a number for matched hotels. Keep that display fallback typed.
export type ViewCandidate = Omit<Candidate, 'guestRating'> & { guestRating: number | null };
export type ViewOffer = Omit<Offer, 'resolution' | 'candidates'> & (
  | { resolution: { status: 'matched'; reason?: never }; candidates: [ViewCandidate] }
  | { resolution: { status: 'unresolved'; reason: UnresolvedReason }; candidates: [] }
);
export type ViewSearchResponse = Omit<SearchResponse, 'offers'> & { offers: ViewOffer[] };
export type ViewHotelDetails = Omit<HotelDetails, 'images' | 'amenities'> & {
  images: (string | { url: string })[];
  amenities: (string | { name: string })[];
};
export type ViewDetailResponse = Omit<DetailResponse, 'offer' | 'candidate' | 'details'> & { offer: ViewOffer; candidate: ViewCandidate | null; details: ViewHotelDetails | null };

export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const nullableString = (value: unknown) => value === null || isString(value);
const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const timestamp = (value: unknown): value is string => isString(value) && Number.isFinite(Date.parse(value));
const cents = (value: unknown) => value === null || finiteNumber(value) && Number.isSafeInteger(value) && value >= 0;
const count = (value: unknown): value is number => finiteNumber(value) && Number.isSafeInteger(value) && value >= 0;
const unresolvedReasons = new Set<string>(['no_match', 'ambiguous', 'missing_facts', 'incomplete_search']);
const unresolvedReason = (value: unknown): value is UnresolvedReason => isString(value) && unresolvedReasons.has(value);

type ResolutionShape =
  | { resolution: { status: 'matched'; reason?: never }; candidates: [{ hotelId: string }] }
  | { resolution: { status: 'unresolved'; reason: UnresolvedReason }; candidates: [] };

export function validResolution(offer: unknown): offer is ResolutionShape {
  if (!isRecord(offer) || !Array.isArray(offer.candidates) || !isRecord(offer.resolution)) return false;
  if (offer.resolution.status === 'matched') {
    return !Object.hasOwn(offer.resolution, 'reason') && offer.candidates.length === 1 &&
      isRecord(offer.candidates[0]) && validIdentifier(offer.candidates[0].hotelId);
  }
  return offer.resolution.status === 'unresolved' &&
    unresolvedReason(offer.resolution.reason) && offer.candidates.length === 0;
}

function validQuote(value: unknown): value is Quote {
  return isRecord(value) && cents(value.nightlyCents) && cents(value.stayCents) &&
    (value.currency === null || isCurrency(value.currency)) &&
    (value.taxesFees === 'included' || value.taxesFees === 'excluded' || value.taxesFees === 'unknown') &&
    (value.roomCount === undefined || count(value.roomCount) && value.roomCount > 0) &&
    (value.nightlyBasis === undefined || value.nightlyBasis === 'per-room') &&
    (value.stayBasis === undefined || value.stayBasis === 'all-rooms') &&
    (value.totalCents === undefined || value.totalCents !== null && cents(value.totalCents)) &&
    (value.totalTaxesFees === undefined || value.totalTaxesFees === 'included') &&
    (value.advertisedDiscount === undefined || isRecord(value.advertisedDiscount) &&
      finiteNumber(value.advertisedDiscount.percent) && value.advertisedDiscount.source === 'Priceline');
}

function validCandidate(value: unknown): value is ViewCandidate {
  return isRecord(value) && validIdentifier(value.hotelId) && isString(value.name) &&
    nullableString(value.neighborhoodName) && finiteNumber(value.stars) && (value.guestRating === null || finiteNumber(value.guestRating)) &&
    finiteNumber(value.reviewCount) && strings(value.amenities) && nullableString(value.thumbnailUrl);
}

function validNumericClue(value: unknown): value is NumericClue {
  return isRecord(value) && (value.kind === 'unknown' ||
    (value.kind === 'exact' || value.kind === 'minimum') && finiteNumber(value.value) ||
    value.kind === 'range' && finiteNumber(value.min) && finiteNumber(value.max));
}

function validClues(value: unknown): value is OfferClues {
  return isRecord(value) && validNumericClue(value.guestRating) && validNumericClue(value.reviewCount) &&
    (value.amenities === null || isRecord(value.amenities) && strings(value.amenities.codes) && typeof value.amenities.complete === 'boolean');
}

function validOffer(value: unknown): value is ViewOffer {
  return isRecord(value) && validIdentifier(value.offerId, MAX_OFFER_ID_LENGTH) &&
    nullableString(value.neighborhoodName) && (value.stars === null || finiteNumber(value.stars)) &&
    validClues(value.clues) && validQuote(value.quote) && nullableString(value.handoffUrl) &&
    (value.quoteExpiresAt === undefined || timestamp(value.quoteExpiresAt)) && validResolution(value) && value.candidates.every(validCandidate);
}

function validContext(value: unknown): value is TripContext {
  return isRecord(value) && isString(value.destinationId) && /^geonames:[1-9]\d{0,9}$/.test(value.destinationId) &&
    isString(value.cityName) && isCalendarDate(value.checkIn) && isCalendarDate(value.checkOut) &&
    count(value.rooms) && count(value.adults) && Array.isArray(value.childrenAges) && value.childrenAges.every(count) && isCurrency(value.currency);
}

function validCoverage(value: unknown): value is Coverage {
  return isRecord(value) && (value.status === 'complete' || value.status === 'partial') && nullableString(value.reason) &&
    count(value.pagesFetched) && count(value.offersFound) && count(value.namedHotelsChecked) && count(value.unassessedHotels);
}

function validBackoff(value: unknown): value is Backoff {
  return isRecord(value) && (value.code === 'PROVIDER_COOLDOWN' || value.code === 'PROVIDER_BUSY' || value.code === 'PROVIDER_UNAVAILABLE') && timestamp(value.retryAt);
}

function validDetails(value: unknown): value is ViewHotelDetails {
  return isRecord(value) && nullableString(value.description) &&
    Array.isArray(value.images) && value.images.every((image: unknown) => isString(image) || isRecord(image) && isString(image.url)) &&
    Array.isArray(value.amenities) && value.amenities.every((amenity: unknown) => isString(amenity) || isRecord(amenity) && isString(amenity.name)) &&
    nullableString(value.address) && (value.retailQuote === null || validQuote(value.retailQuote));
}

function validEnvelope(value: Record<string, unknown>) {
  return validContext(value.context) && timestamp(value.retrievedAt) && timestamp(value.expiresAt) &&
    (value.backoff === undefined || validBackoff(value.backoff));
}

export function validSearchResponse(value: unknown): value is ViewSearchResponse {
  return isRecord(value) && validEnvelope(value) && validCoverage(value.coverage) &&
    Array.isArray(value.offers) && value.offers.every(validOffer);
}

export function validDetailResponse(value: unknown): value is ViewDetailResponse {
  return isRecord(value) && validEnvelope(value) && timestamp(value.offerExpiresAt) && validOffer(value.offer) &&
    (value.candidate === null || validCandidate(value.candidate)) && (value.details === null || validDetails(value.details)) &&
    (value.detailStatus === 'available' || value.detailStatus === 'unavailable' || value.detailStatus === 'not_requested') &&
    (value.quoteStatus === 'available' || value.quoteStatus === 'unavailable') &&
    (value.refreshError === undefined || isRecord(value.refreshError) &&
      (value.refreshError.code === 'PROVIDER_UNAVAILABLE' || value.refreshError.code === 'PROVIDER_RESPONSE_INVALID' ||
        value.refreshError.code === 'PROVIDER_COOLDOWN' || value.refreshError.code === 'PROVIDER_BUSY' || value.refreshError.code === 'DEADLINE_EXCEEDED'));
}
