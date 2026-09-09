import { ServiceError } from '../provider/errors.ts';
import { MatchLimitError, ValidationError } from '../domain/index.ts';
import { diagnostic, requestRoute } from '../diagnostics.ts';
import type { ErrorRequestHandler } from 'express';
import type { HotelRequestHandler } from '../http-types.ts';
import type { ProviderLogger } from '../provider/types.ts';
import type { ApiErrorResponse } from '../../shared/contracts.ts';

export const notFound: HotelRequestHandler = (req, res, next) => {
  next(new ServiceError('NOT_FOUND'));
};

export const errorHandler = (logger: ProviderLogger | null): ErrorRequestHandler => (error: unknown, req, res, next) => {
  if (res.headersSent) return next(error);
  let safeError: ServiceError | ValidationError;
  const fields = error !== null && (typeof error === 'object' || typeof error === 'function') ? error : {};
  if (error instanceof ServiceError || error instanceof ValidationError) safeError = error;
  else if (error instanceof MatchLimitError) safeError = new ServiceError('RESULT_TOO_LARGE');
  else if ('type' in fields && fields.type === 'entity.too.large') safeError = new ServiceError('REQUEST_TOO_LARGE');
  else if (('status' in fields && fields.status === 400) || ('statusCode' in fields && fields.statusCode === 400)) safeError = new ServiceError('INVALID_REQUEST');
  else if (('status' in fields && fields.status === 404) || ('code' in fields && fields.code === 'ENOENT')) safeError = new ServiceError('NOT_FOUND');
  else safeError = new ServiceError('INTERNAL_ERROR');
  const payload: ApiErrorResponse['error'] = { code: safeError.code, message: safeError.message, requestId: req.requestId };
  if ('retryAt' in safeError && safeError.retryAt) {
    payload.retryAt = safeError.retryAt;
    res.set('Retry-After', new Date(safeError.retryAt).toUTCString());
  }
  res.locals.errorCode = safeError.code;
  if (safeError.status >= 500) {
    try {
      logger?.error?.({ event: 'request_failed', requestId: req.requestId, method: req.method,
        route: requestRoute(req), code: safeError.code, diagnostic: diagnostic(error) });
    } catch { /* Logging must not affect the response. */ }
  }
  res.set('Cache-Control', 'no-store').status(safeError.status).json({ error: payload });
};
