import { getDestination, resolveLegacyCity } from '../destinations/index.ts';
import { validateTripFields } from '../../shared/travel.ts';
import { MAX_OFFER_ID_LENGTH, validIdentifier } from '../../shared/identifiers.ts';
import type { DetailRequest, TripContext } from '../../shared/contracts.ts';

export { isCalendarDate } from '../../shared/travel.ts';

export class ValidationError extends Error {
  declare code: string;
  declare status: number;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.status = 400;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizedId(value: unknown, maximum = 200): string | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    value = String(value);
  }
  return validIdentifier(value, maximum) ? value : null;
}

function context(input: unknown, now: Date | string | number, allowedKeys: readonly string[]): TripContext {
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
  const validation = validateTripFields(input, now, { allowPastGrace: true });
  if (!validation.valid) {
    const code = Object.values(validation.errorCodes)[0];
    const message = Object.values(validation.errors)[0];
    if (!code || !message) throw new TypeError('Invalid trip fields require an error.');
    throw new ValidationError(code, message);
  }
  return { destinationId: destination.id, cityName: destination.label, ...validation.context };
}

const searchKeys = ['destinationId', 'cityName', 'checkIn', 'checkOut', 'rooms', 'adults', 'childrenAges', 'currency'];

export function validateSearch(input: unknown, now: Date | string | number = new Date()): TripContext {
  return context(input, now, searchKeys);
}

export function validateDetail(input: unknown, now: Date | string | number = new Date()): DetailRequest {
  const result = context(input, now, [...searchKeys, 'offerId', 'hotelId']);
  // context() already rejects non-records; retain the boundary type for ID checks.
  if (!isRecord(input)) throw new ValidationError('INVALID_BODY', 'Send a JSON object with a city and travel dates.');
  // Wire IDs are strings even when the provider originally used numeric IDs.
  if (typeof input.offerId !== 'string' || !normalizedId(input.offerId, MAX_OFFER_ID_LENGTH)) {
    throw new ValidationError('INVALID_OFFER_ID', 'A valid original offer ID is required.');
  }
  if (Object.hasOwn(input, 'hotelId') && (typeof input.hotelId !== 'string' || !normalizedId(input.hotelId))) {
    throw new ValidationError('INVALID_HOTEL_ID', 'A valid candidate hotel ID is required.');
  }
  return { ...result, offerId: input.offerId, ...(Object.hasOwn(input, 'hotelId') && typeof input.hotelId === 'string' ? { hotelId: input.hotelId } : {}) };
}
