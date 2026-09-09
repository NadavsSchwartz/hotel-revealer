import type { RawTripFields, TripContext, TripDraft, TripErrors, UnvalidatedTripFields } from '../../../shared/contracts.ts';
import legacyDestinations from '../../../data/destinations-legacy-public.json' with { type: 'json' };
import { isCurrency } from '../../../shared/currency.ts';
import { normalizeDestinationText as legacyKey } from '../../../shared/destinationText.ts';
import {
  DEFAULT_OCCUPANCY,
  isCalendarDate,
  nightCount,
  validateTripFields,
} from '../../../shared/travel.ts';

const legacyByName = new Map(legacyDestinations.map(([name, id, label]) => [legacyKey(name), { id, label }]));
export { DEFAULT_OCCUPANCY, TRAVEL_LIMITS, addCalendarDays, isCalendarDate, localToday } from '../../../shared/travel.ts';

export type OfferSort = 'price' | 'rating' | 'stars' | 'discount';

export function parseOfferSort(value: string | null): OfferSort {
  return value === 'rating' || value === 'stars' || value === 'discount' ? value : 'price';
}

const integerParameter = (params: URLSearchParams, key: string, fallback: number) => {
  if (!params.has(key)) return fallback;
  const value = params.get(key) ?? '';
  return /^\d+$/.test(value) ? Number(value) : value;
};

export function contextFromSearch(search: string): TripDraft {
  const params = new URLSearchParams(search);
  const ageParameter = params.get('childrenAges');
  const cityName = params.get('cityName') || '';
  const legacy = !params.has('destinationId') && cityName.length <= 100
    ? legacyByName.get(legacyKey(cityName)) : null;
  return {
    ...(params.has('destinationId') ? { destinationId: params.get('destinationId') ?? '' }
      : legacy ? { destinationId: legacy.id } : {}),
    cityName: legacy?.label ?? cityName,
    checkIn: params.get('checkIn') || '',
    checkOut: params.get('checkOut') || '',
    rooms: integerParameter(params, 'rooms', DEFAULT_OCCUPANCY.rooms),
    adults: integerParameter(params, 'adults', DEFAULT_OCCUPANCY.adults),
    childrenAges: ageParameter === null || ageParameter === ''
      ? []
      : ageParameter.split(',', 9).map(age => /^\d+$/.test(age) ? Number(age) : null),
    currency: params.get('currency') ?? 'USD',
  };
}

export interface RawContext extends RawTripFields { destinationId?: unknown; cityName?: unknown }

export function contextKey(context: RawContext) {
  return JSON.stringify([
    context.destinationId ?? context.cityName,
    context.checkIn,
    context.checkOut,
    context.rooms,
    context.adults,
    context.childrenAges ?? [],
    context.currency,
  ]);
}

export function searchUrl(context: RawContext, path = '/results', extras: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ...DEFAULT_OCCUPANCY, ...context, ...extras };
  if (Array.isArray(values.childrenAges)) {
    // A single missing age must not serialize as the empty, child-free trip.
    values.childrenAges = Array.from(values.childrenAges, (age: unknown) => Number.isInteger(age) ? age : 'missing').join(',');
  }
  return `${path}?${new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`;
}

type RawValidatedContext = UnvalidatedTripFields & { destinationId?: unknown; cityName: string };
export type ContextValidation<InvalidContext = TripDraft> =
  | { valid: true; errors: TripErrors; context: TripContext }
  | { valid: false; errors: TripErrors; context: InvalidContext };

export function validateContext(input: TripDraft, now?: Date): ContextValidation;
export function validateContext(input: RawContext, now?: Date): ContextValidation<RawValidatedContext>;
export function validateContext(input: RawContext, now = new Date()): ContextValidation<RawValidatedContext> {
  const validation = validateTripFields(input, now);
  const { errors, context: trip } = validation;
  let cityName = typeof input.cityName === 'string' ? input.cityName.trim() : '';
  let destinationId = input.destinationId;
  if (destinationId !== undefined) {
    if (typeof destinationId !== 'string' || !/^geonames:[1-9]\d{0,9}$/.test(destinationId) || !cityName || cityName.length > 200) {
      errors.cityName = 'Choose a destination from the suggestions.';
    }
  } else {
    const legacy = cityName.length <= 100 ? legacyByName.get(legacyKey(cityName)) : null;
    if (!legacy) errors.cityName = 'Choose a destination from the suggestions.';
    else {
      cityName = legacy.label;
      destinationId = legacy.id;
    }
  }
  if (validation.valid && !errors.cityName && typeof destinationId === 'string') {
    return { valid: true, errors, context: { ...validation.context, destinationId, cityName } };
  }
  return {
    valid: false,
    errors,
    context: {
      ...(destinationId !== undefined ? { destinationId } : {}),
      cityName,
      ...trip,
    },
  };
}

export function displayDate(value: unknown, options: Intl.DateTimeFormatOptions = {}) {
  if (!isCalendarDate(value)) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(new Date(`${value}T12:00:00Z`));
}

export function nights(context: Pick<RawContext, 'checkIn' | 'checkOut'>) {
  return nightCount(context.checkIn, context.checkOut);
}

export function money(cents: unknown, currency: unknown = 'USD') {
  return typeof cents === 'number' && Number.isSafeInteger(cents) && cents >= 0 && isCurrency(currency)
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100)
    : null;
}

export function safeHref(value: unknown, providerOnly = false) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (
      providerOnly &&
      ((url.hostname !== 'priceline.com' &&
        url.hostname !== 'www.priceline.com') ||
        Boolean(url.port))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export interface SavedView {
  sort?: string;
  page?: number;
  scrollY?: number | string;
  focusId?: string;
}

export function readView(key: string): SavedView {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(`hotel-revealer:view:${key}`) || '{}');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    return {
      ...(typeof record.sort === 'string' ? { sort: record.sort } : {}),
      ...(typeof record.page === 'number' ? { page: record.page } : {}),
      ...(typeof record.scrollY === 'number' || typeof record.scrollY === 'string' ? { scrollY: record.scrollY } : {}),
      ...(typeof record.focusId === 'string' ? { focusId: record.focusId } : {}),
    };
  } catch {
    return {};
  }
}

export function saveView(key: string, values: SavedView) {
  try {
    sessionStorage.setItem(
      `hotel-revealer:view:${key}`,
      JSON.stringify({ ...readView(key), ...values }),
    );
  } catch {
    /* Browsing works when tab storage is unavailable. */
  }
}
