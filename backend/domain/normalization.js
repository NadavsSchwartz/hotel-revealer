import { isRecord, normalizedId } from './validation.js';

const unknown = () => ({ kind: 'unknown' });
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const SAFE_IMAGE_HOSTS = Object.freeze([
  'www.priceline.com', 'images.priceline.com', 'mobileimg.priceline.com', 'q-xx.bstatic.com', 'cf.bstatic.com',
]);

export function numberOrNull(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (typeof value === 'string') {
    if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
    value = Number(value.trim());
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max &&
    (!integer || Number.isSafeInteger(value)) ? value : null;
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;
}

export function safeImageUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.href.length > 4096 || url.protocol !== 'https:' || url.username || url.password || url.port || !SAFE_IMAGE_HOSTS.includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export function safeHandoffUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.href.length > 4096 || url.protocol !== 'https:' || !['www.priceline.com', 'priceline.com'].includes(url.hostname) ||
        url.username || url.password || url.port) return null;
    return url.href;
  } catch { return null; }
}

function cents(value) {
  const amount = numberOrNull(value, { max: Number.MAX_SAFE_INTEGER / 100 });
  if (amount === null) return null;
  const result = Math.round((amount + Number.EPSILON) * 100);
  return Number.isSafeInteger(result) ? result : null;
}

export function normalizeQuote(value) {
  const source = isRecord(value) ? value : {};
  const normalized = Object.hasOwn(source, 'nightlyCents') || Object.hasOwn(source, 'stayCents');
  const usd = (normalized ? source.currency : source.minCurrencyCode) === 'USD';
  return {
    nightlyCents: usd ? normalized ? numberOrNull(source.nightlyCents, { integer: true }) : cents(source.minPrice) : null,
    stayCents: usd ? normalized ? numberOrNull(source.stayCents, { integer: true }) : cents(source.displayPricePerStay) : null,
    currency: 'USD',
    taxesFees: usd && ['included', 'excluded'].includes(source.taxesFees) ? source.taxesFees : 'unknown',
  };
}

export function normalizeNumericClue(value, options = {}) {
  if (!isRecord(value)) return unknown();
  if (value.kind === 'exact' || value.kind === 'minimum') {
    const normalized = numberOrNull(value.value, options);
    return normalized === null ? unknown() : { kind: value.kind, value: normalized };
  }
  if (value.kind === 'range') {
    const min = numberOrNull(value.min, options);
    const max = numberOrNull(value.max, options);
    return min === null || max === null || min > max ? unknown() : { kind: 'range', min, max };
  }
  return unknown();
}

export function normalizeAmenityCodes(value) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const codes = value.map(item => {
    const code = normalizedId(isRecord(item) ? item.code : item);
    return code !== null && code.length <= 64 ? code : null;
  });
  // An invalid entry makes an empty list unknown, never evidence of absence.
  return codes.some(code => code === null) ? null : [...new Set(codes)].sort(compareText);
}

function amenityEvidence(row) {
  const tagged = row.clues?.amenities;
  if (isRecord(tagged)) {
    const codes = normalizeAmenityCodes(tagged.codes);
    return codes === null ? null : { codes, complete: tagged.complete === true };
  }
  const codes = normalizeAmenityCodes(row.hotelFeatures?.highlightedAmenities);
  // Highlighted amenities are not an exhaustive amenity inventory.
  return codes === null ? null : { codes, complete: false };
}

function normalizeHotel(row) {
  const hotelId = normalizedId(row.hotelId);
  const name = textOrNull(row.name);
  if (!hotelId || !name) return null;
  const explicit = isRecord(row.amenities) ? row.amenities : null;
  const amenities = explicit ? normalizeAmenityCodes(explicit.codes)
    : normalizeAmenityCodes(row.hotelFeatures?.hotelAmenities ?? row.hotelFeatures?.highlightedAmenities);
  return {
    hotelId, name,
    cityId: normalizedId(row.location?.cityId),
    neighborhoodId: normalizedId(row.location?.neighborhoodID),
    neighborhoodName: textOrNull(row.location?.neighborhoodName),
    stars: numberOrNull(row.starRating, { min: 0.5, max: 5 }),
    guestRating: numberOrNull(row.overallGuestRating, { max: 10 }),
    reviewCount: numberOrNull(row.totalReviewCount, { integer: true }),
    amenities,
    amenitiesComplete: amenities !== null && explicit?.complete === true,
    thumbnailUrl: safeImageUrl(row.thumbnailUrl),
    retailQuote: normalizeQuote(row.ratesSummary),
  };
}

function normalizeOffer(row) {
  const offerId = normalizedId(row.pclnId);
  if (!offerId) return null;
  return {
    offerId,
    cityId: normalizedId(row.location?.cityId),
    neighborhoodId: normalizedId(row.location?.neighborhoodID),
    neighborhoodName: textOrNull(row.location?.neighborhoodName),
    stars: numberOrNull(row.starRating, { min: 0.5, max: 5 }),
    quote: normalizeQuote(row.ratesSummary),
    // The authorized adapter owns original-offer and trip-context binding.
    // Historical route templates alone do not establish a usable handoff.
    handoffUrl: safeHandoffUrl(row.handoffUrl),
    clues: {
      // Untagged legacy masked numbers do not establish exact/range semantics.
      guestRating: normalizeNumericClue(row.clues?.guestRating, { max: 10 }),
      reviewCount: normalizeNumericClue(row.clues?.reviewCount, { integer: true }),
      amenities: amenityEvidence(row),
    },
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort(compareText).map(key => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function differingKnown(rows, key) {
  return new Set(rows.map(row => row[key]).filter(value => value !== null && value !== undefined).map(stableValue)).size > 1;
}

export function deduplicateHotels(hotels) {
  const groups = new Map();
  for (const hotel of hotels) {
    if (!isRecord(hotel) || !normalizedId(hotel.hotelId)) continue;
    const rows = groups.get(hotel.hotelId) ?? [];
    rows.push(hotel);
    groups.set(hotel.hotelId, rows);
  }
  return [...groups].sort(([a], [b]) => compareText(a, b)).map(([, rows]) => {
    // Select one whole observation, never combine disjoint facts into a hotel
    // that no provider row actually described. Conflicting facts become unknown.
    const ordered = [...rows].sort((a, b) => compareText(stableValue(a), stableValue(b)));
    const result = { ...ordered[0] };
    for (const key of ['cityId', 'neighborhoodId', 'neighborhoodName', 'stars', 'guestRating', 'reviewCount', 'retailQuote']) {
      // Unknown is absorbing so merging separately normalized pages cannot
      // restore a fact that an earlier duplicate conflict made unknown.
      if (differingKnown(rows, key) || rows.some(row => row[key] == null)) result[key] = null;
    }
    if (differingKnown(rows, 'name')) {
      result.neighborhoodId = null;
      result.stars = null;
    }
    if (differingKnown(rows, 'amenities') || rows.some(row => row.amenities == null)) {
      result.amenities = null;
      result.amenitiesComplete = false;
    }
    if (rows.some(row => row.amenitiesComplete !== true)) result.amenitiesComplete = false;
    return result;
  });
}

export function deduplicateOffers(offers) {
  const groups = new Map();
  for (const offer of offers) {
    if (!isRecord(offer) || !normalizedId(offer.offerId)) continue;
    const rows = groups.get(offer.offerId) ?? [];
    rows.push(offer);
    groups.set(offer.offerId, rows);
  }
  return [...groups].sort(([a], [b]) => compareText(a, b)).map(([, rows]) => {
    const ordered = [...rows].sort((a, b) => compareText(stableValue(a), stableValue(b)));
    const result = { ...ordered[0], clues: { ...ordered[0].clues } };
    for (const key of ['cityId', 'neighborhoodId', 'neighborhoodName', 'stars', 'handoffUrl']) {
      if (differingKnown(rows, key) || rows.some(row => row[key] == null)) result[key] = null;
    }
    if (differingKnown(rows, 'quote')) result.quote = normalizeQuote(null);
    const clues = rows.map(row => row.clues ?? {});
    for (const key of ['guestRating', 'reviewCount', 'amenities']) {
      // Null amenity evidence can represent a conflict from an earlier page.
      // It must remain unknown when another copy of one observation arrives.
      if (differingKnown(clues, key) || clues.some(clue => clue[key] == null || clue[key].kind === 'unknown')) {
        result.clues[key] = key === 'amenities' ? null : unknown();
      }
    }
    return result;
  });
}

export function normalizeListings(raw) {
  const rows = Array.isArray(raw) ? raw : raw?.data?.listings?.hotels ?? raw?.listings?.hotels ?? raw?.hotels;
  if (!Array.isArray(rows)) return { offers: [], hotels: [], invalidRows: 1 };
  const offers = [];
  const hotels = [];
  let invalidRows = 0;
  for (const row of rows) {
    if (!isRecord(row) || !isRecord(row.ratesSummary) || typeof row.ratesSummary.programName !== 'string') {
      invalidRows += 1;
      continue;
    }
    const express = ['EXPRESS_DEAL', 'EXPRESS DEAL'].includes(row.ratesSummary.programName.toUpperCase());
    const normalized = express ? normalizeOffer(row) : normalizeHotel(row);
    if (normalized) (express ? offers : hotels).push(normalized);
    else invalidRows += 1;
  }
  return { offers: deduplicateOffers(offers), hotels: deduplicateHotels(hotels), invalidRows };
}
