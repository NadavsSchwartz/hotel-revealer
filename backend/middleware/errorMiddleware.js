import { ServiceError } from '../provider/errors.js';
import { MatchLimitError, ValidationError } from '../domain/index.js';

export function notFound(req, res, next) {
  next(new ServiceError('NOT_FOUND'));
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let safeError;
  if (error instanceof ServiceError || error instanceof ValidationError) safeError = error;
  else if (error instanceof MatchLimitError) safeError = new ServiceError('RESULT_TOO_LARGE');
  else if (error.type === 'entity.too.large') safeError = new ServiceError('REQUEST_TOO_LARGE');
  else if (error.status === 400 || error.statusCode === 400) safeError = new ServiceError('INVALID_REQUEST');
  else if (error.status === 404 || error.code === 'ENOENT') safeError = new ServiceError('NOT_FOUND');
  else safeError = new ServiceError('INTERNAL_ERROR');
  const payload = { code: safeError.code, message: safeError.message, requestId: req.requestId };
  if (safeError.retryAt) {
    payload.retryAt = safeError.retryAt;
    res.set('Retry-After', new Date(safeError.retryAt).toUTCString());
  }
  res.locals.errorCode = safeError.code;
  res.set('Cache-Control', 'no-store').status(safeError.status).json({ error: payload });
}
