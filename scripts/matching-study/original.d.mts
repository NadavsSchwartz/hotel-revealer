// The independent oracle also exercises absent comparison values. It requires
// the containers it dereferences, without claiming those raw values are valid.
export interface ReferenceRow {
  pclnId?: unknown;
  hotelId?: unknown;
  starRating?: unknown;
  overallGuestRating?: unknown;
  totalReviewCount?: unknown;
  location: { neighborhoodID?: unknown };
  ratesSummary: { programName?: unknown; minStrikePrice?: unknown; minPrice?: unknown };
  hotelFeatures: { highlightedAmenities?: unknown };
  amenitiesIcons?: unknown;
}

export function originalMatches(offer: ReferenceRow, hotel: ReferenceRow): boolean;
export function matchOriginal(offers: readonly ReferenceRow[], hotels: readonly ReferenceRow[]): [unknown, unknown][];
