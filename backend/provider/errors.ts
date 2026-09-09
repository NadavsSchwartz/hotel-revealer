const errors = {
  PROVIDER_NOT_CONFIGURED: [503, 'Live hotel comparison is not configured.'],
  PROVIDER_DISABLED: [503, 'Hotel comparison is paused pending operator review.'],
  PROVIDER_COOLDOWN: [429, 'The hotel provider asked us to wait. Please try again later.'],
  PROVIDER_BUSY: [503, 'Hotel comparison is busy. Please try again shortly.'],
  DESTINATIONS_BUSY: [503, 'Destination suggestions are busy. Please try again shortly.'],
  RESULT_TOO_LARGE: [503, 'We could not load all the hotel results for this trip. Please try again.'],
  DEADLINE_EXCEEDED: [504, 'The hotel request took too long. Please try again.'],
  PROVIDER_UNAVAILABLE: [502, 'The hotel provider is temporarily unavailable.'],
  PROVIDER_RESPONSE_INVALID: [502, 'The hotel provider returned an unsupported response.'],
  PROVIDER_DESTINATION_UNSUPPORTED: [422, 'The hotel provider could not locate this destination. Try a nearby city.'],
  INVALID_SELECTION: [404, 'This candidate is no longer available for this offer and stay.'],
  SELECTION_UNAVAILABLE: [404, 'This original offer could not be recovered. Return to results to choose an offer.'],
  SERVICE_DRAINING: [503, 'The service is restarting. Please try again shortly.'],
  INVALID_REQUEST: [400, 'Check the city, dates, and selection and try again.'],
  REQUEST_TOO_LARGE: [413, 'The request is too large.'],
  NOT_FOUND: [404, 'The requested resource was not found.'],
  INTERNAL_ERROR: [500, 'The request could not be completed.'],
} as const;
export type ServiceErrorCode = keyof typeof errors;
export interface ProviderDiagnostic {
  operation?: string;
  httpStatus?: number;
  responseType?: string;
  category?: string;
}
interface ErrorOptions { retryAt?: string; cause?: unknown; provider?: unknown }

// Only fixed categories leave the adapter. Provider text, headers and variables
// must never reach logs, even through an error's cause chain.
export function providerDiagnostic(input: unknown): ProviderDiagnostic {
  const value = input && typeof input === 'object' ? input : {};
  const result: ProviderDiagnostic = {};
  if ('operation' in value && typeof value.operation === 'string' && ['HotelRevealerListings', 'HotelRevealerDetails', 'HotelRevealerQuote'].includes(value.operation)) result.operation = value.operation;
  if ('httpStatus' in value && typeof value.httpStatus === 'number' && Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599) result.httpStatus = value.httpStatus;
  if ('responseType' in value && typeof value.responseType === 'string' && ['json', 'html', 'other', 'missing'].includes(value.responseType)) result.responseType = value.responseType;
  if ('category' in value && typeof value.category === 'string' &&
    ['network', 'http', 'rate_limit', 'maintenance', 'access_denied', 'unknown_html',
    'graphql_schema', 'graphql_execution', 'invalid_json', 'invalid_shape', 'response_too_large'].includes(value.category)) result.category = value.category;
  return result;
}

export class ServiceError extends Error {
  declare code: ServiceErrorCode;
  declare status: number;
  declare retryAt?: string;
  declare provider?: ProviderDiagnostic;
  constructor(code: string, { retryAt, cause, provider }: ErrorOptions = {}) {
    const knownCode = errors[code as ServiceErrorCode] ? code as ServiceErrorCode : 'INTERNAL_ERROR';
    const [status, message] = errors[knownCode];
    super(message, { cause });
    this.name = 'ServiceError';
    this.code = knownCode;
    this.status = status;
    if (retryAt) this.retryAt = retryAt;
    if (provider) this.provider = providerDiagnostic(provider);
  }
}

// An authorized adapter classifies failures without exposing upstream content.
export class ProviderFailure extends Error {
  declare kind: string;
  declare retryAfter: string | number | null | undefined;
  declare provider?: ProviderDiagnostic;
  constructor(kind: string, { retryAfter, cause, provider }: { retryAfter?: string | number | null; cause?: unknown; provider?: unknown } = {}) {
    super('Provider request failed', { cause });
    this.name = 'ProviderFailure';
    this.kind = kind;
    this.retryAfter = retryAfter;
    if (provider) this.provider = providerDiagnostic(provider);
  }
}
