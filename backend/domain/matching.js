import { normalizeListings } from './normalization.js';
import { isRecord, normalizedId } from './validation.js';
import { MAX_OFFER_ID_LENGTH } from '../../shared/identifiers.js';

// Conservative application budgets, not documented provider limits.
export const MAX_MATCH_COMPARISONS = 100_000;
export const MAX_MATCH_CANDIDATES = 5_000;

export class MatchLimitError extends Error {
  constructor() {
    super('The hotel results exceeded the search processing limit.');
    this.name = 'MatchLimitError';
    this.code = 'RESULT_TOO_LARGE';
    this.status = 503;
  }
}

const isId = value => typeof value === 'string' ? value.trim().length > 0
  : typeof value === 'number' && Number.isFinite(value);
// Check availability without converting values used by strict equality.
const isNumeric = value => typeof value === 'number' ? Number.isFinite(value)
  : typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value));

function hasComparisonFacts(row) {
  return isRecord(row) && isRecord(row.location) && isRecord(row.ratesSummary) &&
    isRecord(row.hotelFeatures) && isId(row.location.neighborhoodID) &&
    isNumeric(row.starRating) && isNumeric(row.overallGuestRating) && isNumeric(row.totalReviewCount) &&
    Array.isArray(row.hotelFeatures.highlightedAmenities) && Array.isArray(row.amenitiesIcons);
}

export function isValidOffer(row) {
  return hasComparisonFacts(row) && isId(row.pclnId) && isNumeric(row.ratesSummary.minStrikePrice);
}

export function isValidHotel(row) {
  return hasComparisonFacts(row) && isId(row.hotelId) && isNumeric(row.ratesSummary.minPrice) &&
    (row.hotelType === 'RTL' ||
      typeof row.ratesSummary.programName === 'string' && row.ratesSummary.programName.trim().length > 0);
}

function matches(offer, hotel) {
  if (hotel.ratesSummary.programName === 'Express_Deal') return false;
  if (offer.starRating !== hotel.starRating) return false;
  if (offer.location.neighborhoodID !== hotel.location.neighborhoodID) return false;
  if (!(offer.overallGuestRating >= Math.floor(hotel.overallGuestRating) &&
        offer.overallGuestRating <= Math.ceil(hotel.overallGuestRating))) return false;
  if (offer.ratesSummary.minStrikePrice !== hotel.ratesSummary.minPrice) return false;
  if (!(offer.totalReviewCount >= Math.floor(hotel.totalReviewCount / 100) * 100 &&
        offer.totalReviewCount <= Math.ceil(hotel.totalReviewCount / 100) * 100)) return false;
  if (JSON.stringify(offer.hotelFeatures.highlightedAmenities) !==
      JSON.stringify(hotel.hotelFeatures.highlightedAmenities)) return false;
  return JSON.stringify(offer.amenitiesIcons) === JSON.stringify(hotel.amenitiesIcons);
}

// Raw adapted observations only. Preserve strict types, arrival order and every
// repeated rate until the bounded comparison work has finished.
export function matchObservations(offers, hotels) {
  const validOffers = offers.filter(isValidOffer);
  const validHotels = hotels.filter(isValidHotel);
  const comparisons = validOffers.length * validHotels.length;
  if (comparisons > MAX_MATCH_COMPARISONS) throw new MatchLimitError();
  const pairs = [];
  for (const offer of validOffers) {
    for (const hotel of validHotels) {
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

function groupRows(rows, key, maximum) {
  const groups = new Map();
  for (const row of rows) {
    const id = normalizedId(row?.[key], maximum);
    if (id === null) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

function offerFacts(row) {
  return JSON.stringify([row.starRating, row.location.neighborhoodID, row.overallGuestRating,
    row.totalReviewCount, row.ratesSummary.minStrikePrice, row.hotelFeatures.highlightedAmenities, row.amenitiesIcons]);
}

function conflictingCities(rows) {
  const cities = rows.map(row => normalizedId(row.location?.cityId)).filter(id => id !== null);
  return new Set(cities).size > 1;
}

function coherentHotel(hotel, rows = []) {
  // Every raw row for this ID must survive display normalization. Otherwise a
  // nameless conflicting observation could disappear and manufacture certainty.
  return hotel && rows.every(row => typeof row.name === 'string' && row.name.trim()) &&
    !conflictingCities(rows) && ['name', 'neighborhoodId', 'stars', 'guestRating', 'reviewCount', 'amenities']
      .every(key => hotel[key] !== null && hotel[key] !== undefined);
}

function candidateFrom(hotel) {
  return {
    hotelId: hotel.hotelId, name: hotel.name,
    neighborhoodName: hotel.neighborhoodName, stars: hotel.stars,
    guestRating: hotel.guestRating, reviewCount: hotel.reviewCount,
    amenities: hotel.amenities, thumbnailUrl: hotel.thumbnailUrl,
  };
}

export function matchListings(rawOffers, rawHotels, { coverageStatus = 'complete' } = {}) {
  const offers = Array.isArray(rawOffers) ? rawOffers : [];
  const hotels = Array.isArray(rawHotels) ? rawHotels : [];
  const { pairs } = matchObservations(offers, hotels);
  // Normalize only after matching: this sorts amenities and merges display
  // conflicts, neither of which may alter the original predicates above.
  const normalized = normalizeListings([...offers, ...hotels]);
  const hotelById = new Map(normalized.hotels.map(hotel => [hotel.hotelId, hotel]));
  const offerGroups = groupRows(offers, 'pclnId', MAX_OFFER_ID_LENGTH);
  const hotelGroups = groupRows(hotels, 'hotelId');
  const matchedHotels = new Map();
  for (const [rawOfferId, rawHotelId] of pairs) {
    const offerId = normalizedId(rawOfferId, MAX_OFFER_ID_LENGTH);
    if (!matchedHotels.has(offerId)) matchedHotels.set(offerId, new Set());
    // An unusable matched ID remains a missing identity, never disappears to
    // turn another matching hotel into a unique result.
    matchedHotels.get(offerId).add(normalizedId(rawHotelId));
  }
  const unassessedHotels = [...hotelGroups].filter(([id, rows]) =>
    !rows.some(isValidHotel) || !coherentHotel(hotelById.get(id), rows)).length;
  const publicOffers = normalized.offers.map(offer => {
    const rows = offerGroups.get(offer.offerId) ?? [];
    const ids = [...(matchedHotels.get(offer.offerId) ?? [])];
    const missingFacts = !rows.length || !rows.every(isValidOffer) ||
      new Set(rows.map(offerFacts)).size > 1 || conflictingCities(rows) ||
      ids.some(id => !coherentHotel(hotelById.get(id), hotelGroups.get(id)));
    const reason = coverageStatus !== 'complete' ? 'incomplete_search'
      : missingFacts ? 'missing_facts'
        : ids.length > 1 ? 'ambiguous'
          : ids.length === 0 ? 'no_match' : null;
    return {
      offerId: offer.offerId,
      neighborhoodName: offer.neighborhoodName, stars: offer.stars,
      clues: offer.clues, quote: offer.quote, handoffUrl: offer.handoffUrl,
      resolution: reason ? { status: 'unresolved', reason } : { status: 'matched' },
      candidates: reason ? [] : [candidateFrom(hotelById.get(ids[0]))],
    };
  });
  return { offers: publicOffers, unassessedHotels, invalidRows: normalized.invalidRows };
}
