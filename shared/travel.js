// Application limits, independent of any provider's bookability rules.
export const TRAVEL_LIMITS = Object.freeze({
  maxNights: 30,
  maxAdvanceDays: 365,
  maxRooms: 8,
  maxAdults: 16,
  maxChildren: 8,
  minChildAge: 0,
  maxChildAge: 17,
});

export const DEFAULT_OCCUPANCY = Object.freeze({
  rooms: 1,
  adults: 2,
  childrenAges: Object.freeze([]),
  currency: 'USD',
});

const DAY_MS = 86_400_000;

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localToday(now = new Date()) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Validation requires a valid current time.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addCalendarDays(value, days) {
  if (!isCalendarDate(value) || !Number.isInteger(days)) return '';
  return new Date(Date.parse(`${value}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function nightCount(checkIn, checkOut) {
  if (!isCalendarDate(checkIn) || !isCalendarDate(checkOut)) return NaN;
  return (Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`)) / DAY_MS;
}

export function validateTripFields(input, now = new Date(), { allowPastGrace = false } = {}) {
  const clock = new Date(now);
  if (!Number.isFinite(clock.getTime())) throw new TypeError('Validation requires a valid current time.');
  const today = allowPastGrace ? clock.toISOString().slice(0, 10) : localToday(clock);
  // The server uses UTC without the browser's timezone. One day at both ends
  // preserves valid local dates; the browser still enforces its local 365 days.
  const graceDays = allowPastGrace ? 1 : 0;
  const earliestDay = addCalendarDays(today, -graceDays);
  const latestDay = addCalendarDays(today, TRAVEL_LIMITS.maxAdvanceDays + graceDays);
  const errors = {};
  const errorCodes = {};
  const fail = (field, code, message) => {
    errors[field] = message;
    errorCodes[field] = code;
  };
  const context = {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    rooms: input.rooms === undefined ? DEFAULT_OCCUPANCY.rooms : input.rooms,
    adults: input.adults === undefined ? DEFAULT_OCCUPANCY.adults : input.adults,
    childrenAges: input.childrenAges === undefined ? [] : Array.isArray(input.childrenAges) ? [...input.childrenAges] : input.childrenAges,
    currency: input.currency === undefined ? DEFAULT_OCCUPANCY.currency : input.currency,
  };

  if (!isCalendarDate(context.checkIn)) {
    fail('checkIn', 'INVALID_CHECK_IN', 'Enter a valid check-in date.');
  } else if (context.checkIn < earliestDay) {
    fail('checkIn', 'PAST_CHECK_IN', 'Check-in must be today or later.');
  } else if (context.checkIn > latestDay) {
    fail('checkIn', 'CHECK_IN_TOO_FAR', 'Choose check-in within the next 365 days.');
  }
  if (!isCalendarDate(context.checkOut)) {
    fail('checkOut', 'INVALID_CHECK_OUT', 'Enter a valid check-out date.');
  } else if (isCalendarDate(context.checkIn) && context.checkOut <= context.checkIn) {
    fail('checkOut', 'INVALID_DATE_RANGE', 'Check-out must be after check-in.');
  } else if (context.checkOut > latestDay) {
    fail('checkOut', 'CHECK_OUT_TOO_FAR', 'Choose check-out within the next 365 days.');
  } else if (nightCount(context.checkIn, context.checkOut) > TRAVEL_LIMITS.maxNights) {
    fail('checkOut', 'STAY_TOO_LONG', 'Choose a stay of 30 nights or fewer.');
  }

  if (!Number.isInteger(context.rooms) || context.rooms < 1 || context.rooms > TRAVEL_LIMITS.maxRooms) {
    fail('rooms', 'INVALID_ROOMS', 'Choose between 1 and 8 rooms.');
  }
  if (!Number.isInteger(context.adults) || context.adults < 1 || context.adults > TRAVEL_LIMITS.maxAdults) {
    fail('adults', 'INVALID_ADULTS', 'Choose between 1 and 16 adults.');
  } else if (!errors.rooms && context.adults < context.rooms) {
    fail('adults', 'INSUFFICIENT_ADULTS', 'Include at least one adult for each room.');
  }
  if (!Array.isArray(context.childrenAges) || context.childrenAges.length > TRAVEL_LIMITS.maxChildren) {
    fail('childrenAges', 'INVALID_CHILDREN', 'Choose up to 8 children and provide each child’s age.');
  } else if (context.childrenAges.some(age => !Number.isInteger(age) || age < TRAVEL_LIMITS.minChildAge || age > TRAVEL_LIMITS.maxChildAge)) {
    fail('childrenAges', 'INVALID_CHILD_AGE', 'Enter an age from 0 to 17 for every child. Use 0 for infants under 1.');
  }
  if (context.currency !== 'USD') {
    fail('currency', 'UNSUPPORTED_CONTEXT', 'Prices are available in USD only.');
  }
  return { errors, errorCodes, context };
}
