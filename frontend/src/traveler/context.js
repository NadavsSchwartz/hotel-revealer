import legacyDestinations from '../../../data/destinations-legacy-public.json' with { type: 'json' };
import {
  DEFAULT_OCCUPANCY,
  isCalendarDate,
  nightCount,
  validateTripFields,
} from '../../../shared/travel.js';

const legacyKey = value => value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
  .replace(/['’‘ʼ`.]/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const legacyByName = new Map(legacyDestinations.map(([name, id, label]) => [legacyKey(name), { id, label }]));
export const cityNames = legacyDestinations.map(([name]) => name);
export { DEFAULT_OCCUPANCY, TRAVEL_LIMITS, addCalendarDays, isCalendarDate, localToday } from '../../../shared/travel.js';
// Kept as a defaults alias for callers that create an empty trip.
export const fixedContext = DEFAULT_OCCUPANCY;

const integerParameter = (params, key, fallback) => {
  if (!params.has(key)) return fallback;
  const value = params.get(key);
  return /^\d+$/.test(value) ? Number(value) : value;
};

export function contextFromSearch(search) {
  const params = new URLSearchParams(search);
  const ageParameter = params.get('childrenAges');
  const cityName = params.get('cityName') || '';
  const legacy = !params.has('destinationId') && cityName.length <= 100
    ? legacyByName.get(legacyKey(cityName)) : null;
  return {
    ...(params.has('destinationId') ? { destinationId: params.get('destinationId') }
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

export function contextKey(context) {
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

export function searchUrl(context, path = '/results', extras = {}) {
  const values = { ...DEFAULT_OCCUPANCY, ...context, ...extras };
  if (Array.isArray(values.childrenAges)) {
    // A single missing age must not serialize as the empty, child-free trip.
    values.childrenAges = Array.from(values.childrenAges, age => Number.isInteger(age) ? age : 'missing').join(',');
  }
  return `${path}?${new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined))}`;
}

export function validateContext(input, now = new Date()) {
  const { errors, context: trip } = validateTripFields(input, now);
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
  return {
    errors,
    context: {
      ...(destinationId !== undefined ? { destinationId } : {}),
      cityName,
      ...trip,
    },
  };
}

export function displayDate(value, options = {}) {
  if (!isCalendarDate(value)) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(new Date(`${value}T12:00:00Z`));
}

export function nights(context) {
  return nightCount(context.checkIn, context.checkOut);
}

export function money(cents) {
  return Number.isInteger(cents) && cents >= 0
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100)
    : null;
}

export function safeHref(value, providerOnly = false) {
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

export function readView(key) {
  try {
    return (
      JSON.parse(sessionStorage.getItem(`hotel-revealer:view:${key}`)) || {}
    );
  } catch {
    return {};
  }
}

export function saveView(key, values) {
  try {
    sessionStorage.setItem(
      `hotel-revealer:view:${key}`,
      JSON.stringify({ ...readView(key), ...values }),
    );
  } catch {
    /* Browsing works when tab storage is unavailable. */
  }
}
