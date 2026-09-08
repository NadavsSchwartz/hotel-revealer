import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createHotelRoutes } from './routes/hotelDealsRoutes.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { createProviderService } from './provider/service.js';
import { SAFE_IMAGE_HOSTS } from './domain/index.js';
import { searchDestinations } from './destinations/index.js';

const frontendDirectory = fileURLToPath(new URL('../frontend/dist/', import.meta.url));
const contentSecurityPolicy = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${SAFE_IMAGE_HOSTS.map((host) => `https://${host}`).join(' ')}`,
  "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'",
  "frame-ancestors 'none'", "form-action 'self'",
].join('; ');

export function createApp({ logger = console, service = createProviderService({ logger }) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    const startedAt = Date.now();
    res.set({
      'X-Request-Id': req.requestId,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': contentSecurityPolicy,
    });
    res.on('finish', () => {
      // Bodies, URLs, raw errors and upstream credentials are never logged.
      try {
        logger?.info?.({ event: 'request_completed', requestId: req.requestId, status: res.statusCode,
          ...(res.locals.errorCode ? { code: res.locals.errorCode } : {}), durationMs: Date.now() - startedAt });
      } catch { /* Logging must not affect the response. */ }
    });
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/api/v1/destinations', (req, res) => {
    const url = new URL(req.originalUrl, 'http://localhost');
    const query = url.searchParams.get('q') ?? '';
    if (query.length > 100 || Array.from(query).some(character => character.codePointAt(0) < 32 || (character.codePointAt(0) >= 127 && character.codePointAt(0) <= 159)) || url.searchParams.getAll('q').length > 1) {
      return res.status(400).json({ error: { code: 'INVALID_DESTINATION_QUERY', message: 'Enter a city or country name.', requestId: req.requestId } });
    }
    res.set('Cache-Control', 'public, max-age=300').json({ destinations: searchDestinations(query, { limit: 8 }) });
  });
  app.get('/health', async (req, res, next) => {
    try {
      const provider = typeof service.status === 'function' ? await service.status() : { available: false };
      res.set('Cache-Control', 'no-store').json({ status: 'ok', provider: { available: provider.available === true } });
    } catch (error) { next(error); }
  });
  app.use('/api/v1', createHotelRoutes(service));
  app.use('/api', notFound);
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(frontendDirectory, { dotfiles: 'deny', index: false }));
    app.get('*', (req, res, next) => {
      if (path.extname(req.path) || !req.accepts('html')) return next();
      res.set('Cache-Control', 'no-store').sendFile(path.join(frontendDirectory, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
