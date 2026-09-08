import { getDestination, resolveLegacyCity } from '../destinations/index.js';
import { validateTripFields } from '../../shared/travel.js';
import { MAX_OFFER_ID_LENGTH, validIdentifier } from '../../shared/identifiers.js';

export { isCalendarDate } from '../../shared/travel.js';

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

export function normalizedId(value, maximum = 200) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    value = String(value);
  }
  return validIdentifier(value, maximum) ? value : null;
}

function context(input, now, allowedKeys) {
  if (!isRecord(input)) throw new ValidationError('INVALID_BODY', 'Send a JSON object with a city and travel dates.');
  if (Object.keys(input).some(key => !allowedKeys.includes(key))) {
    throw new ValidationError('INVALID_FIELDS', 'The request contains unsupported fields.');
  }
  if (input.cityName !== undefined && (typeof input.cityName !== 'string' || input.cityName.length > 200)) {
    throw new ValidationError('INVALID_CITY', 'Choose a destination from the suggestions.');
  }
  const destination = input.destinationId !== undefined
    ? getDestination(input.destinationId)
    : resolveLegacyCity(input.cityName);
  if (!destination) throw new ValidationError('INVALID_CITY', 'Choose a destination from the suggestions.');
  // A server's UTC midnight must not reject a valid local same-day search.
  // Permit a one-calendar-day grace; the browser uses its local date and the
  // eventual authorized provider decides destination-specific bookability.
  const { context: trip, errors, errorCodes } = validateTripFields(input, now, { allowPastGrace: true });
  const firstError = Object.keys(errors)[0];
  if (firstError) throw new ValidationError(errorCodes[firstError], errors[firstError]);
  return { destinationId: destination.id, cityName: destination.label, ...trip };
}

const searchKeys = ['destinationId', 'cityName', 'checkIn', 'checkOut', 'rooms', 'adults', 'childrenAges', 'currency'];

export function validateSearch(input, now = new Date()) {
  return context(input, now, searchKeys);
}

export function validateDetail(input, now = new Date()) {
  const result = context(input, now, [...searchKeys, 'offerId', 'hotelId']);
  // Wire IDs are strings even when the provider originally used numeric IDs.
  if (typeof input.offerId !== 'string' || !normalizedId(input.offerId, MAX_OFFER_ID_LENGTH)) {
    throw new ValidationError('INVALID_OFFER_ID', 'A valid original offer ID is required.');
  }
  if (Object.hasOwn(input, 'hotelId') && (typeof input.hotelId !== 'string' || !normalizedId(input.hotelId))) {
    throw new ValidationError('INVALID_HOTEL_ID', 'A valid candidate hotel ID is required.');
  }
  return { ...result, offerId: input.offerId, ...(Object.hasOwn(input, 'hotelId') ? { hotelId: input.hotelId } : {}) };
}
