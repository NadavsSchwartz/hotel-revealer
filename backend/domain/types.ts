import type { Candidate, OfferClues, Quote } from '../../shared/contracts.ts';

// Raw scalars remain raw: matching deliberately distinguishes numbers and strings.
export type RawScalar = number | string;
export interface ComparisonFacts extends Record<string, unknown> {
  location: Record<string, unknown> & { neighborhoodID: RawScalar };
  ratesSummary: Record<string, unknown>;
  hotelFeatures: Record<string, unknown> & { highlightedAmenities: unknown[] };
  starRating: RawScalar;
  overallGuestRating: RawScalar;
  totalReviewCount: RawScalar;
  amenitiesIcons: unknown[];
}
export interface RawOffer extends ComparisonFacts {
  pclnId: RawScalar;
  ratesSummary: Record<string, unknown> & { minStrikePrice: RawScalar };
}
export interface RawHotel extends ComparisonFacts {
  hotelId: RawScalar;
  ratesSummary: Record<string, unknown> & { minPrice: RawScalar };
}
export type MatchPair = [RawScalar, RawScalar];

export interface NormalizedHotel {
  hotelId: string;
  name: string;
  cityId: string | null;
  neighborhoodId: string | null;
  neighborhoodName: string | null;
  stars: number | null;
  guestRating: number | null;
  reviewCount: number | null;
  amenities: string[] | null;
  amenitiesComplete: boolean;
  thumbnailUrl: string | null;
  retailQuote: Quote | null;
}
export type CoherentHotel = NormalizedHotel & Candidate & { neighborhoodId: string };
export interface NormalizedOffer {
  offerId: string;
  cityId: string | null;
  neighborhoodId: string | null;
  neighborhoodName: string | null;
  stars: number | null;
  quote: Quote;
  handoffUrl: string | null;
  clues: OfferClues;
}
export interface NormalizedListings {
  offers: NormalizedOffer[];
  hotels: NormalizedHotel[];
  invalidRows: number;
}
