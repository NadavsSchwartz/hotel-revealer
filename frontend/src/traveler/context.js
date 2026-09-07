import { canonicalCityName, cityNames } from '../../../shared/cities.js';

export { cityNames };
export const fixedContext = { rooms: 1, adults: 2, currency: 'USD' };

export function contextFromSearch(search) {
  const params = new URLSearchParams(search);
  return {
    cityName: params.get('cityName') || '',
    checkIn: params.get('checkIn') || '',
    checkOut: params.get('checkOut') || '',
    rooms:
      !params.has('rooms') || params.get('rooms') === '1'
        ? 1
        : params.get('rooms'),
    adults:
      !params.has('adults') || params.get('adults') === '2'
        ? 2
        : params.get('adults'),
    currency: params.get('currency') ?? 'USD',
  };
}

export function contextKey(context) {
  return [
    context.cityName,
    context.checkIn,
    context.checkOut,
    context.rooms,
    context.adults,
    context.currency,
  ].join('|');
}

export function searchUrl(context, path = '/results', extras = {}) {
  return `${path}?${new URLSearchParams({ ...context, ...fixedContext, ...extras })}`;
}

export function localToday(now = new Date()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function validateContext(input) {
  const errors = {};
  const cityName = canonicalCityName(input.cityName);
  if (!cityName)
    errors.cityName = 'Choose a supported city from the suggestions.';
  if (!isCalendarDate(input.checkIn))
    errors.checkIn = 'Enter a valid check-in date.';
  else if (input.checkIn < localToday())
    errors.checkIn = 'Check-in must be today or later.';
  if (!isCalendarDate(input.checkOut))
    errors.checkOut = 'Enter a valid check-out date.';
  else if (isCalendarDate(input.checkIn) && input.checkOut <= input.checkIn) {
    errors.checkOut = 'Check-out must be after check-in.';
  }
  if (input.rooms !== 1 || input.adults !== 2 || input.currency !== 'USD') {
    errors.context =
      'This link uses an unsupported trip. Search supports 1 room, 2 adults, and USD only.';
  }
  return {
    errors,
    context: {
      ...input,
      cityName: cityName || input.cityName,
      ...fixedContext,
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
  return Math.round(
    (Date.parse(`${context.checkOut}T12:00:00Z`) -
      Date.parse(`${context.checkIn}T12:00:00Z`)) /
      86400000,
  );
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
