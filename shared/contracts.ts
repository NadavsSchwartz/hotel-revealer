import type { Currency } from './currency.ts';

export type { Currency } from './currency.ts';

export interface RawTripFields {
  checkIn?: unknown;
  checkOut?: unknown;
  rooms?: unknown;
  adults?: unknown;
  childrenAges?: unknown;
  currency?: unknown;
}

export interface TripFields {
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  childrenAges: number[];
  currency: Currency;
}

export interface TripDraft {
  destinationId?: string;
  cityName: string;
  checkIn: string;
  checkOut: string;
  rooms: number | string;
  adults: number | string;
  childrenAges: (number | null)[];
  currency: string;
}

export interface TripContext extends TripFields {
  destinationId: string;
  cityName: string;
}

export interface DetailRequest extends TripContext {
  offerId: string;
  hotelId?: string;
}

export type TripField = keyof TripDraft;
export type TripErrors = Partial<Record<TripField, string>>;
export type TripErrorCode = 'INVALID_CHECK_IN' | 'PAST_CHECK_IN' | 'CHECK_IN_TOO_FAR'
  | 'INVALID_CHECK_OUT' | 'INVALID_DATE_RANGE' | 'CHECK_OUT_TOO_FAR' | 'STAY_TOO_LONG'
  | 'INVALID_ROOMS' | 'INVALID_ADULTS' | 'INSUFFICIENT_ADULTS' | 'INVALID_CHILDREN'
  | 'INVALID_CHILD_AGE' | 'UNSUPPORTED_CONTEXT';
export type TripErrorCodes = Partial<Record<keyof TripFields, TripErrorCode>>;
export type UnvalidatedTripFields = { [Field in keyof TripFields]: unknown };
export type TripValidationResult<InvalidContext = UnvalidatedTripFields> =
  | { valid: true; errors: TripErrors; errorCodes: TripErrorCodes; context: TripFields }
  | { valid: false; errors: TripErrors; errorCodes: TripErrorCodes; context: InvalidContext };

// The complete server catalog row. Browser predicates must claim only fields they check.
export interface Destination {
  id: string;
  name: string;
  label: string;
  countryCode: string;
  countryName: string;
  regionName: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export type NumericClue = { kind: 'unknown' }
  | { kind: 'exact' | 'minimum'; value: number }
  | { kind: 'range'; min: number; max: number };
export interface OfferClues {
  guestRating: NumericClue;
  reviewCount: NumericClue;
  amenities: { codes: string[]; complete: boolean } | null;
}

export interface Quote {
  nightlyCents: number | null;
  stayCents: number | null;
  currency: Currency | null;
  taxesFees: 'included' | 'excluded' | 'unknown';
  roomCount?: number;
  nightlyBasis?: 'per-room';
  stayBasis?: 'all-rooms';
  totalCents?: number;
  totalTaxesFees?: 'included';
  advertisedDiscount?: { percent: number; source: 'Priceline' };
}

export interface Candidate {
  hotelId: string;
  name: string;
  neighborhoodName: string | null;
  stars: number;
  guestRating: number;
  reviewCount: number;
  amenities: string[];
  thumbnailUrl: string | null;
}

export type UnresolvedReason = 'no_match' | 'ambiguous' | 'missing_facts' | 'incomplete_search';
export interface OfferBase {
  offerId: string;
  neighborhoodName: string | null;
  stars: number | null;
  clues: OfferClues;
  quote: Quote;
  handoffUrl: string | null;
  quoteExpiresAt?: string;
}
export type Offer = OfferBase & (
  | { resolution: { status: 'matched'; reason?: never }; candidates: [Candidate] }
  | { resolution: { status: 'unresolved'; reason: UnresolvedReason }; candidates: [] }
);
export type CoverageStatus = 'complete' | 'partial';
export interface Coverage {
  status: CoverageStatus;
  reason: string | null;
  pagesFetched: number;
  offersFound: number;
  namedHotelsChecked: number;
  unassessedHotels: number;
}
export type BackoffCode = 'PROVIDER_COOLDOWN' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_BUSY';
export interface Backoff { code: BackoffCode; retryAt: string }
export type RefreshErrorCode = BackoffCode | 'PROVIDER_RESPONSE_INVALID' | 'DEADLINE_EXCEEDED';
export interface RefreshError { code: RefreshErrorCode }

export interface SearchResponse {
  context: TripContext;
  retrievedAt: string;
  expiresAt: string;
  coverage: Coverage;
  offers: Offer[];
  backoff?: Backoff;
}

export interface HotelDetails {
  description: string | null;
  images: string[];
  amenities: string[];
  address: string | null;
  retailQuote: Quote | null;
}

export interface DetailResponse {
  context: TripContext;
  retrievedAt: string;
  expiresAt: string;
  offerExpiresAt: string;
  offer: Offer;
  candidate: Candidate | null;
  // Unavailable refreshes can retain previously loaded details and quote values.
  details: HotelDetails | null;
  detailStatus: 'available' | 'unavailable' | 'not_requested';
  quoteStatus: 'available' | 'unavailable';
  backoff?: Backoff;
  refreshError?: RefreshError;
}

export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string; retryAt?: string };
}
