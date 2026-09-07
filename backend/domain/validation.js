import { canonicalCityName } from '../../shared/cities.js';

export class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.status = 400;
  }
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizedId(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    value = String(value);
  }
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)
    ? value : null;
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function context(input, now, allowedKeys) {
  if (!isRecord(input)) throw new ValidationError('INVALID_BODY', 'Send a JSON object with a city and travel dates.');
  if (Object.keys(input).some(key => !allowedKeys.includes(key))) {
    throw new ValidationError('INVALID_FIELDS', 'The request contains unsupported fields.');
  }
  const cityName = canonicalCityName(input.cityName);
  if (!cityName) throw new ValidationError('INVALID_CITY', 'Choose a city from the supported city list.');
  if (!isCalendarDate(input.checkIn)) throw new ValidationError('INVALID_CHECK_IN', 'Enter a valid check-in date in YYYY-MM-DD format.');
  if (!isCalendarDate(input.checkOut)) throw new ValidationError('INVALID_CHECK_OUT', 'Enter a valid check-out date in YYYY-MM-DD format.');
  if (input.checkOut <= input.checkIn) throw new ValidationError('INVALID_DATE_RANGE', 'Check-out must be after check-in.');
  // A server's UTC midnight must not reject a valid local same-day search.
  // Permit a one-calendar-day grace; the browser uses its local date and the
  // eventual authorized provider decides destination-specific bookability.
  const clock = new Date(now);
  if (!Number.isFinite(clock.getTime())) throw new TypeError('Validation requires a valid current time.');
  const earliestDay = new Date(clock.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (input.checkIn < earliestDay) {
    throw new ValidationError('PAST_CHECK_IN', 'Choose a current or future check-in date.');
  }
  if ((input.rooms !== undefined && input.rooms !== 1) ||
      (input.adults !== undefined && input.adults !== 2) ||
      (input.currency !== undefined && input.currency !== 'USD')) {
    throw new ValidationError('UNSUPPORTED_CONTEXT', 'Search supports one room, two adults, and USD prices.');
  }
  return { cityName, checkIn: input.checkIn, checkOut: input.checkOut, rooms: 1, adults: 2, currency: 'USD' };
}

const searchKeys = ['cityName', 'checkIn', 'checkOut', 'rooms', 'adults', 'currency'];

export function validateSearch(input, now = new Date()) {
  return context(input, now, searchKeys);
}

export function validateDetail(input, now = new Date()) {
  const result = context(input, now, [...searchKeys, 'offerId', 'hotelId']);
  // Wire IDs are strings even when the provider originally used numeric IDs.
  if (typeof input.offerId !== 'string' || !normalizedId(input.offerId)) {
    throw new ValidationError('INVALID_OFFER_ID', 'A valid original offer ID is required.');
  }
  if (typeof input.hotelId !== 'string' || !normalizedId(input.hotelId)) {
    throw new ValidationError('INVALID_HOTEL_ID', 'A valid candidate hotel ID is required.');
  }
  return { ...result, offerId: input.offerId, hotelId: input.hotelId };
}
