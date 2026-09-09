import { normalizeListings } from './normalization.ts';
import { isRecord, normalizedId } from './validation.ts';
import { MAX_OFFER_ID_LENGTH } from '../../shared/identifiers.ts';
import type { Candidate, CoverageStatus, Offer, UnresolvedReason } from '../../shared/contracts.ts';
import type { CoherentHotel, ComparisonFacts, MatchPair, NormalizedHotel, RawHotel, RawOffer, RawScalar } from './types.ts';

// Conservative application budgets, not documented provider limits.
export const MAX_MATCH_COMPARISONS = 100_000;
export const MAX_MATCH_CANDIDATES = 5_000;

export class MatchLimitError extends Error {
  declare code: string;
  declare status: number;
  constructor() {
    super('The hotel results exceeded the search processing limit.');
    this.name = 'MatchLimitError';
    this.code = 'RESULT_TOO_LARGE';
    this.status = 503;
  }
}

const isId = (value: unknown): value is RawScalar => typeof value === 'string' ? value.trim().length > 0
  : typeof value === 'number' && Number.isFinite(value);
// Check availability without converting values used by strict equality.
const isNumeric = (value: unknown): value is RawScalar => typeof value === 'number' ? Number.isFinite(value)
  : typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value));

function hasComparisonFacts(row: unknown): row is ComparisonFacts {
  return isRecord(row) && isRecord(row.location) && isRecord(row.ratesSummary) &&
    isRecord(row.hotelFeatures) && isId(row.location.neighborhoodID) &&
    isNumeric(row.starRating) && isNumeric(row.overallGuestRating) && isNumeric(row.totalReviewCount) &&
    Array.isArray(row.hotelFeatures.highlightedAmenities) && Array.isArray(row.amenitiesIcons);
}

export function isValidOffer(row: unknown): row is RawOffer {
  return hasComparisonFacts(row) && isId(row.pclnId) && isNumeric(row.ratesSummary.minStrikePrice);
}

export function isValidHotel(row: unknown): row is RawHotel {
  return hasComparisonFacts(row) && isId(row.hotelId) && isNumeric(row.ratesSummary.minPrice) &&
    (row.hotelType === 'RTL' ||
      typeof row.ratesSummary.programName === 'string' && row.ratesSummary.programName.trim().length > 0);
}

function matches(offer: RawOffer, hotel: RawHotel) {
  if (hotel.ratesSummary.programName === 'Express_Deal') return false;
  if (offer.starRating !== hotel.starRating) return false;
  if (offer.location.neighborhoodID !== hotel.location.neighborhoodID) return false;
  // These comparisons already coerced numeric strings; equality keys above and
  // below deliberately retain their raw types.
  if (!(Number(offer.overallGuestRating) >= Math.floor(Number(hotel.overallGuestRating)) &&
        Number(offer.overallGuestRating) <= Math.ceil(Number(hotel.overallGuestRating)))) return false;
  if (offer.ratesSummary.minStrikePrice !== hotel.ratesSummary.minPrice) return false;
  if (!(Number(offer.totalReviewCount) >= Math.floor(Number(hotel.totalReviewCount) / 100) * 100 &&
        Number(offer.totalReviewCount) <= Math.ceil(Number(hotel.totalReviewCount) / 100) * 100)) return false;
  if (JSON.stringify(offer.hotelFeatures.highlightedAmenities) !==
      JSON.stringify(hotel.hotelFeatures.highlightedAmenities)) return false;
  return JSON.stringify(offer.amenitiesIcons) === JSON.stringify(hotel.amenitiesIcons);
}

// Raw adapted observations only. Preserve strict types, arrival order and every
// repeated rate until the bounded comparison work has finished.
export function matchObservations(offers: readonly unknown[], hotels: readonly unknown[]) {
  const validOffers = offers.filter(isValidOffer);
  const validHotels = hotels.filter(isValidHotel);
  const neighborhoods = new Map<RawScalar, Map<RawScalar, RawHotel[]>>();
  for (const hotel of validHotels) {
    const neighborhood = hotel.location.neighborhoodID;
    const byStars = neighborhoods.get(neighborhood) ?? new Map<RawScalar, RawHotel[]>();
    neighborhoods.set(neighborhood, byStars);
    const bucket = byStars.get(hotel.starRating) ?? [];
    bucket.push(hotel);
    byStars.set(hotel.starRating, bucket);
  }
  let comparisons = 0;
  const pairs: MatchPair[] = [];
  for (const offer of validOffers) {
    // Raw keys preserve strict equality. Buckets keep every observation in
    // arrival order; only pairs with known star/neighborhood conflicts are skipped.
    const comparable = neighborhoods.get(offer.location.neighborhoodID)?.get(offer.starRating) ?? [];
    for (const hotel of comparable) {
      if (++comparisons > MAX_MATCH_COMPARISONS) throw new MatchLimitError();
      if (!matches(offer, hotel)) continue;
      if (pairs.length >= MAX_MATCH_CANDIDATES) throw new MatchLimitError();
      pairs.push([offer.pclnId, hotel.hotelId]);
    }
  }
  return {
    pairs, comparisons,
    rejectedOffers: offers.length - validOffers.length,
    rejectedHotels: hotels.length - validHotels.length,
  };
}

function groupRows(rows: readonly unknown[], key: string, maximum?: number) {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = normalizedId(row[key], maximum);
    if (id === null) continue;
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  return groups;
}

function offerFacts(row: RawOffer) {
  return JSON.stringify([row.starRating, row.location.neighborhoodID, row.overallGuestRating,
    row.totalReviewCount, row.ratesSummary.minStrikePrice, row.hotelFeatures.highlightedAmenities, row.amenitiesIcons]);
}

function conflictingCities(rows: readonly Record<string, unknown>[]) {
  const cities = rows.map(row => normalizedId(isRecord(row.location) ? row.location.cityId : undefined)).filter(id => id !== null);
  return new Set(cities).size > 1;
}

function coherentHotel(hotel: NormalizedHotel | undefined, rows: readonly Record<string, unknown>[] = []): hotel is CoherentHotel {
  // Every raw row for this ID must survive display normalization. Otherwise a
  // nameless conflicting observation could disappear and manufacture certainty.
  return Boolean(hotel && rows.every(row => typeof row.name === 'string' && row.name.trim()) &&
    !conflictingCities(rows) && (['name', 'neighborhoodId', 'stars', 'guestRating', 'reviewCount', 'amenities'] as const)
      .every(key => hotel[key] !== null && hotel[key] !== undefined));
}

function candidateFrom(hotel: CoherentHotel): Candidate {
  return {
    hotelId: hotel.hotelId, name: hotel.name,
    neighborhoodName: hotel.neighborhoodName, stars: hotel.stars,
    guestRating: hotel.guestRating, reviewCount: hotel.reviewCount,
    amenities: hotel.amenities, thumbnailUrl: hotel.thumbnailUrl,
  };
}

export function matchListings(rawOffers: unknown, rawHotels: unknown, { coverageStatus = 'complete' }: { coverageStatus?: CoverageStatus } = {}) {
  const offers: unknown[] = Array.isArray(rawOffers) ? rawOffers : [];
  const hotels: unknown[] = Array.isArray(rawHotels) ? rawHotels : [];
  const { pairs } = matchObservations(offers, hotels);
  // Normalize only after matching: this sorts amenities and merges display
  // conflicts, neither of which may alter the original predicates above.
  const normalized = normalizeListings([...offers, ...hotels]);
  const hotelById = new Map(normalized.hotels.map(hotel => [hotel.hotelId, hotel]));
  const offerGroups = groupRows(offers, 'pclnId', MAX_OFFER_ID_LENGTH);
  const hotelGroups = groupRows(hotels, 'hotelId');
  const matchedHotels = new Map<string | null, Set<string | null>>();
  for (const [rawOfferId, rawHotelId] of pairs) {
    const offerId = normalizedId(rawOfferId, MAX_OFFER_ID_LENGTH);
    const ids = matchedHotels.get(offerId) ?? new Set<string | null>();
    // An unusable matched ID remains a missing identity, never disappears to
    // turn another matching hotel into a unique result.
    ids.add(normalizedId(rawHotelId));
    matchedHotels.set(offerId, ids);
  }
  const unassessedHotels = [...hotelGroups].filter(([id, rows]) =>
    !rows.some(isValidHotel) || !coherentHotel(hotelById.get(id), rows)).length;
  const publicOffers: Offer[] = normalized.offers.map((offer): Offer => {
    const rows = offerGroups.get(offer.offerId) ?? [];
    const ids = [...(matchedHotels.get(offer.offerId) ?? [])];
    const missingFacts = !rows.length || !rows.every(isValidOffer) ||
      new Set(rows.map(offerFacts)).size > 1 || conflictingCities(rows) ||
      ids.some(id => !coherentHotel(id === null ? undefined : hotelById.get(id), id === null ? undefined : hotelGroups.get(id)));
    const reason: UnresolvedReason | null = coverageStatus !== 'complete' ? 'incomplete_search'
      : missingFacts ? 'missing_facts'
        : ids.length > 1 ? 'ambiguous'
          : ids.length === 0 ? 'no_match' : null;
    const base = {
      offerId: offer.offerId,
      neighborhoodName: offer.neighborhoodName, stars: offer.stars,
      clues: offer.clues, quote: offer.quote, handoffUrl: offer.handoffUrl,
    };
    if (reason) return { ...base, resolution: { status: 'unresolved', reason }, candidates: [] };
    const id = ids[0];
    const hotel = id == null ? undefined : hotelById.get(id);
    // missingFacts above proves this for the unique ID. Narrow the same checked
    // hotel rather than asserting that any normalized record is a candidate.
    if (!coherentHotel(hotel, id == null ? undefined : hotelGroups.get(id))) {
      throw new TypeError('A matched candidate requires coherent hotel facts.');
    }
    return { ...base, resolution: { status: 'matched' }, candidates: [candidateFrom(hotel)] };
  });
  return { offers: publicOffers, unassessedHotels, invalidRows: normalized.invalidRows };
}
