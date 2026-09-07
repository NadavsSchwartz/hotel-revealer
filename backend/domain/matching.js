import { deduplicateHotels, deduplicateOffers, normalizeAmenityCodes, normalizeNumericClue, numberOrNull } from './normalization.js';
import { normalizedId } from './validation.js';

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// Conservative application budgets, not documented provider limits.
export const MAX_MATCH_COMPARISONS = 100_000;
export const MAX_MATCH_CANDIDATES = 5_000;

export class MatchLimitError extends Error {
  constructor() {
    super('This search returned too many possible matches to compare safely. Try another city or dates.');
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

function compareAmenities(clue, hotel) {
  const offered = normalizeAmenityCodes(clue?.codes);
  const named = normalizeAmenityCodes(hotel.amenities);
  if (!offered?.length || named === null) return 'unknown';
  if (offered.every(code => named.includes(code))) return 'match';
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
    ['Guest rating', compareNumericClue(offer.clues?.guestRating, hotel.guestRating, { max: 10 })],
    ['Review count', compareNumericClue(offer.clues?.reviewCount, hotel.reviewCount, { integer: true })],
    ['Advertised amenities', compareAmenities(offer.clues?.amenities, hotel)],
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
      supporting: ['Neighborhood matches', 'Star rating matches', ...matched.map(([label]) => `${label} match`)],
      missing: families.filter(([, state]) => state === 'unknown').map(([label]) => `${label} cannot be compared`),
    },
  };
}

function prepareListings(offers, hotels) {
  const named = deduplicateHotels(Array.isArray(hotels) ? hotels : []);
  const normalizedOffers = deduplicateOffers(Array.isArray(offers) ? offers : []);
  // Reject before pair comparisons or public candidate construction starts.
  if (normalizedOffers.length * named.length > MAX_MATCH_COMPARISONS) throw new MatchLimitError();
  return { named, normalizedOffers };
}

export function countUnassessedHotels(offers, hotels) {
  const { named, normalizedOffers } = prepareListings(offers, hotels);
  // Standalone coverage queries do not construct public candidates. The service
  // uses matchListings to gather this count during its existing comparison pass.
  return named.filter(hotel => normalizedOffers.some(offer => compareHotel(offer, hotel) === 'unassessed')).length;
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
  const { named, normalizedOffers } = prepareListings(offers, hotels);
  const byId = new Map(named.map(hotel => [hotel.hotelId, hotel]));
  const unassessedHotels = new Set();
  let candidateCount = 0;
  const publicOffers = normalizedOffers.map(offer => {
    let unassessedCount = 0;
    const tiers = { supported: [], partial: [] };
    for (const hotel of named) {
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
