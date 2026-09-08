import { deduplicateHotels, deduplicateOffers, normalizeAmenityCodes, normalizeNumericClue, numberOrNull } from './normalization.js';
import { normalizedId } from './validation.js';

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const familyLabels = { guestRating: 'Guest rating', reviewCount: 'Review count', amenities: 'Advertised amenities' };

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

export function compareNumericClue(rawClue, rawValue, options) {
  const clue = normalizeNumericClue(rawClue, options);
  const value = numberOrNull(rawValue, options);
  if (clue.kind === 'unknown' || value === null) return 'unknown';
  const matched = clue.kind === 'exact' ? value === clue.value
    : clue.kind === 'minimum' ? value >= clue.value
      : value >= clue.min && value <= clue.max;
  return matched ? 'match' : 'contradiction';
}

function compareAmenities(offer, hotel) {
  const offered = offer.amenityCodes;
  const named = hotel.amenitySet;
  if (!offered?.length || named === null) return 'unknown';
  if (offered.every(code => named.has(code))) return 'match';
  return hotel.amenitiesComplete === true ? 'contradiction' : 'unknown';
}

function compareHotel(offer, hotel) {
  const neighborhood = [normalizedId(offer.neighborhoodId), normalizedId(hotel.neighborhoodId)];
  const stars = [numberOrNull(offer.stars, { min: 0.5, max: 5 }), numberOrNull(hotel.stars, { min: 0.5, max: 5 })];
  const cities = [normalizedId(offer.cityId), normalizedId(hotel.cityId)];
  // A known contradiction excludes a hotel; null never means unequal.
  if ((cities.every(value => value !== null) && cities[0] !== cities[1]) ||
      (neighborhood.every(value => value !== null) && neighborhood[0] !== neighborhood[1]) ||
      (stars.every(value => value !== null) && stars[0] !== stars[1])) return null;
  const families = [
    ['guestRating', compareNumericClue(offer.clues?.guestRating, hotel.guestRating, { max: 10 })],
    ['reviewCount', compareNumericClue(offer.clues?.reviewCount, hotel.reviewCount, { integer: true })],
    ['amenities', compareAmenities(offer, hotel)],
  ];
  if (families.some(([, state]) => state === 'contradiction')) return null;
  if (neighborhood.includes(null) || stars.includes(null)) return 'unassessed';
  if (!families.some(([, state]) => state === 'match')) return 'unassessed';
  return families;
}

function candidateFrom(hotel, families) {
  const matched = families.filter(([, state]) => state === 'match');
  return {
    hotelId: hotel.hotelId,
    name: hotel.name,
    neighborhoodName: hotel.neighborhoodName ?? null,
    stars: hotel.stars ?? null,
    guestRating: hotel.guestRating ?? null,
    reviewCount: hotel.reviewCount ?? null,
    amenities: hotel.amenities ?? null,
    thumbnailUrl: hotel.thumbnailUrl ?? null,
    tier: matched.length === families.length ? 'supported' : 'partial',
    evidence: {
      supporting: ['Neighborhood matches', 'Star rating matches', ...matched.map(([family]) => `${familyLabels[family]} match`)],
      missing: families.filter(([, state]) => state === 'unknown').map(([family]) => `${familyLabels[family]} cannot be compared`),
      comparisons: { neighborhood: 'match', stars: 'match', ...Object.fromEntries(families) },
    },
  };
}

function prepareListings(offers, hotels) {
  const named = deduplicateHotels(Array.isArray(hotels) ? hotels : []);
  const normalizedOffers = deduplicateOffers(Array.isArray(offers) ? offers : []);
  // Deduplication returns copies. Prepare membership once without changing the
  // amenity arrays retained in public evidence.
  for (const offer of normalizedOffers) offer.amenityCodes = normalizeAmenityCodes(offer.clues?.amenities?.codes);
  const neighborhoods = new Map();
  for (const hotel of named) {
    const codes = normalizeAmenityCodes(hotel.amenities);
    hotel.amenitySet = codes === null ? null : new Set(codes);
    const neighborhood = normalizedId(hotel.neighborhoodId);
    const stars = numberOrNull(hotel.stars, { min: 0.5, max: 5 });
    if (!neighborhoods.has(neighborhood)) neighborhoods.set(neighborhood, new Map());
    const byStars = neighborhoods.get(neighborhood);
    if (!byStars.has(stars)) byStars.set(stars, []);
    byStars.get(stars).push(hotel);
  }
  return { named, normalizedOffers, neighborhoods };
}

function compatibleGroups(groups, key) {
  // Unknown evidence must still be assessed; only known contradictions can be skipped.
  return key === null ? groups.values() : [groups.get(key), groups.get(null)].filter(Boolean);
}

function* comparableHotels(offer, neighborhoods) {
  const neighborhood = normalizedId(offer.neighborhoodId);
  const stars = numberOrNull(offer.stars, { min: 0.5, max: 5 });
  for (const byStars of compatibleGroups(neighborhoods, neighborhood)) {
    for (const hotels of compatibleGroups(byStars, stars)) yield* hotels;
  }
}

export function countUnassessedHotels(offers, hotels) {
  const { normalizedOffers, neighborhoods } = prepareListings(offers, hotels);
  // Standalone coverage queries do not construct public candidates. The service
  // uses matchListings to gather this count during its existing comparison pass.
  const unassessed = new Set();
  let comparisons = 0;
  for (const offer of normalizedOffers) {
    for (const hotel of comparableHotels(offer, neighborhoods)) {
      if (unassessed.has(hotel.hotelId)) continue;
      if (++comparisons > MAX_MATCH_COMPARISONS) throw new MatchLimitError();
      if (compareHotel(offer, hotel) === 'unassessed') unassessed.add(hotel.hotelId);
    }
  }
  return unassessed.size;
}

function comparablePrices(offer, candidates, hotels) {
  // Rank by price only if every candidate within this tier has the same known
  // price basis; pairwise fallback would create a non-transitive comparator.
  const quotes = [offer.quote, ...candidates.map(candidate => hotels.get(candidate.hotelId)?.retailQuote)];
  if (quotes.some(quote => !quote || quote.currency !== 'USD' ||
      !['included', 'excluded'].includes(quote.taxesFees) || quote.taxesFees !== quotes[0].taxesFees)) return null;
  const key = ['stayCents', 'nightlyCents'].find(field => quotes.every(quote => numberOrNull(quote[field], { integer: true }) !== null));
  return key ? new Map(candidates.map((candidate, index) => [candidate.hotelId, Math.abs(quotes[index + 1][key] - quotes[0][key])])) : null;
}

export function matchListings(offers, hotels) {
  const { named, normalizedOffers, neighborhoods } = prepareListings(offers, hotels);
  const byId = new Map(named.map(hotel => [hotel.hotelId, hotel]));
  const unassessedHotels = new Set();
  let candidateCount = 0;
  let comparisons = 0;
  const publicOffers = normalizedOffers.map(offer => {
    let unassessedCount = 0;
    const tiers = { supported: [], partial: [] };
    for (const hotel of comparableHotels(offer, neighborhoods)) {
      if (++comparisons > MAX_MATCH_COMPARISONS) throw new MatchLimitError();
      const result = compareHotel(offer, hotel);
      if (result === 'unassessed') {
        unassessedCount += 1;
        unassessedHotels.add(hotel.hotelId);
      } else if (result) {
        // Never build or return a truncated candidate list. This limit covers
        // the entire response, including candidates shared by several offers.
        if (candidateCount >= MAX_MATCH_CANDIDATES) throw new MatchLimitError();
        candidateCount += 1;
        const candidate = candidateFrom(hotel, result);
        tiers[candidate.tier].push(candidate);
      }
    }
    for (const candidates of Object.values(tiers)) {
      const distances = comparablePrices(offer, candidates, byId);
      candidates.sort((a, b) => (distances ? distances.get(a.hotelId) - distances.get(b.hotelId) : 0) || compareText(a.hotelId, b.hotelId));
    }
    return {
      offerId: offer.offerId,
      neighborhoodName: offer.neighborhoodName ?? null,
      stars: offer.stars ?? null,
      clues: structuredClone(offer.clues),
      quote: offer.quote,
      handoffUrl: offer.handoffUrl ?? null,
      candidates: [...tiers.supported, ...tiers.partial],
      unassessedCount,
    };
  });
  return { offers: publicOffers, unassessedHotels: unassessedHotels.size };
}

export function matchOffers(offers, hotels) {
  return matchListings(offers, hotels).offers;
}
