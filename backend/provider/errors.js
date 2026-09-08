const errors = {
  PROVIDER_NOT_CONFIGURED: [503, 'Live hotel comparison is not configured.'],
  PROVIDER_DISABLED: [503, 'Hotel comparison is paused pending operator review.'],
  PROVIDER_COOLDOWN: [429, 'The hotel provider asked us to wait. Please try again later.'],
  PROVIDER_BUSY: [503, 'Hotel comparison is busy. Please try again shortly.'],
  DESTINATIONS_BUSY: [503, 'Destination suggestions are busy. Please try again shortly.'],
  RESULT_TOO_LARGE: [503, 'Too many possible comparisons to display safely. Try different dates or another city.'],
  DEADLINE_EXCEEDED: [504, 'The hotel request took too long. Please try again.'],
  PROVIDER_UNAVAILABLE: [502, 'The hotel provider is temporarily unavailable.'],
  PROVIDER_RESPONSE_INVALID: [502, 'The hotel provider returned an unsupported response.'],
  PROVIDER_DESTINATION_UNSUPPORTED: [422, 'The hotel provider could not locate this destination. Try a nearby city.'],
  INVALID_SELECTION: [404, 'This candidate is no longer available for this offer and stay.'],
  SERVICE_DRAINING: [503, 'The service is restarting. Please try again shortly.'],
  INVALID_REQUEST: [400, 'Check the city, dates, and selection and try again.'],
  REQUEST_TOO_LARGE: [413, 'The request is too large.'],
  NOT_FOUND: [404, 'The requested resource was not found.'],
  INTERNAL_ERROR: [500, 'The request could not be completed.'],
};

export class ServiceError extends Error {
  constructor(code, { retryAt, cause } = {}) {
    const [status, message] = errors[code] || errors.INTERNAL_ERROR;
    super(message, { cause });
    this.name = 'ServiceError';
    this.code = errors[code] ? code : 'INTERNAL_ERROR';
    this.status = status;
    if (retryAt) this.retryAt = retryAt;
  }
}

// An authorized adapter classifies failures without exposing upstream content.
export class ProviderFailure extends Error {
  constructor(kind, { retryAfter, cause } = {}) {
    super('Provider request failed', { cause });
    this.name = 'ProviderFailure';
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}
