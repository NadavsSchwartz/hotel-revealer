import { isRecord, normalizedId } from './validation.ts';
import { MAX_OFFER_ID_LENGTH } from '../../shared/identifiers.ts';
import { isCurrency } from '../../shared/currency.ts';
import type { NumericClue, OfferClues, Quote } from '../../shared/contracts.ts';
import type { NormalizedHotel, NormalizedListings, NormalizedOffer } from './types.ts';

const unknown = (): NumericClue => ({ kind: 'unknown' });
const compareText = (a: string | undefined, b: string | undefined) => a === undefined || b === undefined ? 0 : a < b ? -1 : a > b ? 1 : 0;
export const SAFE_IMAGE_HOSTS = Object.freeze([
  'www.priceline.com', 'images.priceline.com', 'mobileimg.priceline.com', 'mobileimg.pclncdn.com', 'q-xx.bstatic.com', 'cf.bstatic.com',
]);

interface NumberOptions { min?: number; max?: number; integer?: boolean }

export function numberOrNull(value: unknown, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false }: NumberOptions = {}): number | null {
  if (typeof value === 'string') {
    if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
    value = Number(value.trim());
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max &&
    (!integer || Number.isSafeInteger(value)) ? value : null;
}

function textOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;
}

export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.href.length > 4096 || url.protocol !== 'https:' || url.username || url.password || url.port || !SAFE_IMAGE_HOSTS.includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export function safeHandoffUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.href.length > 4096 || url.protocol !== 'https:' || !['www.priceline.com', 'priceline.com'].includes(url.hostname) ||
        url.username || url.password || url.port) return null;
    return url.href;
  } catch { return null; }
}

function cents(value: unknown) {
  const amount = numberOrNull(value, { max: Number.MAX_SAFE_INTEGER / 100 });
  if (amount === null) return null;
  // Also handles small numeric inputs written in exponent notation by String().
  if (amount < 0.005) return 0;
  const [whole, fraction = ''] = (typeof value === 'string' ? value.trim() : String(amount)).split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2)) + (fraction[2] >= '5' ? 1 : 0);
  return Number.isSafeInteger(result) ? result : null;
}

export function normalizeQuote(value: unknown): Quote {
  const source = isRecord(value) ? value : {};
  const normalized = Object.hasOwn(source, 'nightlyCents') || Object.hasOwn(source, 'stayCents') || Object.hasOwn(source, 'totalCents');
  const sourceCurrency = normalized ? source.currency : source.minCurrencyCode;
  const currency = isCurrency(sourceCurrency) ? sourceCurrency : null;
  const quote: Quote = {
    nightlyCents: currency ? normalized ? numberOrNull(source.nightlyCents, { integer: true }) : cents(source.minPrice) : null,
    stayCents: currency ? normalized ? numberOrNull(source.stayCents, { integer: true }) : cents(source.displayPricePerStay) : null,
    currency,
    taxesFees: currency && (source.taxesFees === 'included' || source.taxesFees === 'excluded') ? source.taxesFees : 'unknown',
  };
  if (typeof source.roomCount === 'number' && Number.isInteger(source.roomCount) && source.roomCount >= 1 && source.roomCount <= 8) {
    quote.roomCount = source.roomCount;
    if (source.nightlyBasis === 'per-room') quote.nightlyBasis = 'per-room';
    if (source.stayBasis === 'all-rooms') quote.stayBasis = 'all-rooms';
  }
  const totalCents = currency ? normalized ? numberOrNull(source.totalCents, { integer: true }) : cents(source.grandTotal) : null;
  if (source.totalTaxesFees === 'included' && quote.nightlyCents !== null && quote.nightlyCents > 0 && quote.stayCents !== null && quote.stayCents > 0 &&
      totalCents !== null && totalCents >= quote.stayCents && totalCents >= quote.nightlyCents) {
    quote.totalCents = totalCents;
    quote.totalTaxesFees = 'included';
  }
  const discount = source.advertisedDiscount;
  const percent = isRecord(discount) && discount.source === 'Priceline' ? numberOrNull(discount.percent, { max: 100 }) : null;
  if (currency && percent !== null && percent > 0 && percent < 100) {
    quote.advertisedDiscount = { percent, source: 'Priceline' };
  }
  return quote;
}

export function normalizeNumericClue(value: unknown, options: NumberOptions = {}): NumericClue {
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

export function normalizeAmenityCodes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const codes = Array.from(value, (item: unknown) => {
    const code = normalizedId(isRecord(item) ? item.code : item);
    return code !== null && code.length <= 64 ? code : null;
  });
  // An invalid entry makes an empty list unknown, never evidence of absence.
  return codes.every((code): code is string => code !== null) ? [...new Set(codes)].sort(compareText) : null;
}

function amenityEvidence(row: Record<string, unknown>): OfferClues['amenities'] {
  const tagged = isRecord(row.clues) ? row.clues.amenities : undefined;
  if (isRecord(tagged)) {
    const codes = normalizeAmenityCodes(tagged.codes);
    return codes === null ? null : { codes, complete: tagged.complete === true };
  }
  const codes = normalizeAmenityCodes(isRecord(row.hotelFeatures) ? row.hotelFeatures.highlightedAmenities : undefined);
  // Highlighted amenities are not an exhaustive amenity inventory.
  return codes === null ? null : { codes, complete: false };
}

function normalizeHotel(row: Record<string, unknown>): NormalizedHotel | null {
  const hotelId = normalizedId(row.hotelId);
  const name = textOrNull(row.name);
  if (!hotelId || !name) return null;
  const explicit = isRecord(row.amenities) ? row.amenities : null;
  const features = isRecord(row.hotelFeatures) ? row.hotelFeatures : {};
  const location = isRecord(row.location) ? row.location : {};
  const amenities = explicit ? normalizeAmenityCodes(explicit.codes)
    : normalizeAmenityCodes(features.hotelAmenities ?? features.highlightedAmenities);
  return {
    hotelId, name,
    cityId: normalizedId(location.cityId),
    neighborhoodId: normalizedId(location.neighborhoodID),
    neighborhoodName: textOrNull(location.neighborhoodName),
    stars: numberOrNull(row.starRating, { min: 0.5, max: 5 }),
    guestRating: numberOrNull(row.overallGuestRating, { max: 10 }),
    reviewCount: numberOrNull(row.totalReviewCount, { integer: true }),
    amenities,
    amenitiesComplete: amenities !== null && explicit?.complete === true,
    thumbnailUrl: safeImageUrl(row.thumbnailUrl),
    retailQuote: normalizeQuote(row.ratesSummary),
  };
}

function normalizeOffer(row: Record<string, unknown>): NormalizedOffer | null {
  const offerId = normalizedId(row.pclnId, MAX_OFFER_ID_LENGTH);
  if (!offerId) return null;
  const location = isRecord(row.location) ? row.location : {};
  const clues = isRecord(row.clues) ? row.clues : {};
  return {
    offerId,
    cityId: normalizedId(location.cityId),
    neighborhoodId: normalizedId(location.neighborhoodID),
    neighborhoodName: textOrNull(location.neighborhoodName),
    stars: numberOrNull(row.starRating, { min: 0.5, max: 5 }),
    quote: normalizeQuote(row.ratesSummary),
    // The authorized adapter owns original-offer and trip-context binding.
    // Historical route templates alone do not establish a usable handoff.
    handoffUrl: safeHandoffUrl(row.handoffUrl),
    clues: {
      // Untagged legacy masked numbers do not establish exact/range semantics.
      guestRating: normalizeNumericClue(clues.guestRating, { max: 10 }),
      reviewCount: normalizeNumericClue(clues.reviewCount, { integer: true }),
      amenities: amenityEvidence(row),
    },
  };
}

function stableValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort(compareText).map(key => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function differingKnown<Row>(rows: readonly Row[], key: keyof Row) {
  return new Set(rows.map(row => row[key]).filter(value => value !== null && value !== undefined).map(stableValue)).size > 1;
}

export function deduplicateHotels(hotels: readonly NormalizedHotel[]): NormalizedHotel[] {
  const groups = new Map<string, NormalizedHotel[]>();
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
    for (const key of ['cityId', 'neighborhoodId', 'neighborhoodName', 'stars', 'guestRating', 'reviewCount', 'retailQuote'] as const) {
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

export function deduplicateOffers(offers: readonly NormalizedOffer[]): NormalizedOffer[] {
  const groups = new Map<string, NormalizedOffer[]>();
  for (const offer of offers) {
    if (!isRecord(offer) || !normalizedId(offer.offerId, MAX_OFFER_ID_LENGTH)) continue;
    const rows = groups.get(offer.offerId) ?? [];
    rows.push(offer);
    groups.set(offer.offerId, rows);
  }
  return [...groups].sort(([a], [b]) => compareText(a, b)).map(([, rows]) => {
    const ordered = [...rows].sort((a, b) => compareText(stableValue(a), stableValue(b)));
    const result = { ...ordered[0], clues: { ...ordered[0].clues } };
    for (const key of ['cityId', 'neighborhoodId', 'neighborhoodName', 'stars', 'handoffUrl'] as const) {
      if (differingKnown(rows, key) || rows.some(row => row[key] == null)) result[key] = null;
    }
    if (differingKnown(rows, 'quote')) result.quote = normalizeQuote(null);
    const clues = rows.map(row => row.clues ?? {});
    for (const key of ['guestRating', 'reviewCount', 'amenities'] as const) {
      // Null amenity evidence can represent a conflict from an earlier page.
      // It must remain unknown when another copy of one observation arrives.
      if (differingKnown(clues, key) || clues.some(clue => clue[key] == null || 'kind' in clue[key] && clue[key].kind === 'unknown')) {
        if (key === 'amenities') result.clues.amenities = null;
        else result.clues[key] = unknown();
      }
    }
    return result;
  });
}

export function normalizeListings(raw: unknown): NormalizedListings {
  const record = isRecord(raw) ? raw : {};
  const data = isRecord(record.data) ? record.data : {};
  const dataListings = isRecord(data.listings) ? data.listings : {};
  const listings = isRecord(record.listings) ? record.listings : {};
  const rows: unknown = Array.isArray(raw) ? raw : dataListings.hotels ?? listings.hotels ?? record.hotels;
  if (!Array.isArray(rows)) return { offers: [], hotels: [], invalidRows: 1 };
  const offers: NormalizedOffer[] = [];
  const hotels: NormalizedHotel[] = [];
  let invalidRows = 0;
  for (const row of rows) {
    if (!isRecord(row) || !isRecord(row.ratesSummary) ||
        (typeof row.ratesSummary.programName !== 'string' && !(row.hotelType === 'RTL' && row.ratesSummary.programName == null))) {
      invalidRows += 1;
      continue;
    }
    const express = typeof row.ratesSummary.programName === 'string' && ['EXPRESS_DEAL', 'EXPRESS DEAL'].includes(row.ratesSummary.programName.toUpperCase());
    if (express) {
      const normalized = normalizeOffer(row);
      if (normalized) offers.push(normalized);
      else invalidRows += 1;
    } else {
      const normalized = normalizeHotel(row);
      if (normalized) hotels.push(normalized);
      else invalidRows += 1;
    }
  }
  return { offers: deduplicateOffers(offers), hotels: deduplicateHotels(hotels), invalidRows };
}
