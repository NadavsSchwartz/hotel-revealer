import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createHotelRoutes } from './routes/hotelDealsRoutes.ts';
import { errorHandler, notFound } from './middleware/errorMiddleware.ts';
import { createProviderService } from './provider/service.ts';
import { ServiceError } from './provider/errors.ts';
import { SAFE_IMAGE_HOSTS } from './domain/index.ts';
import { searchDestinations, validQuery } from './destinations/index.ts';
import { requestRoute } from './diagnostics.ts';
import { createHotelAdmission } from './admission.ts';
import { createUsageRouter } from './usage.ts';
import type { UsageSink } from './usage.ts';
import type { NextFunction, Request, Response } from 'express';
import type { HotelService } from './http-types.ts';
import type { ProviderLogger } from './provider/types.ts';

export interface AppOptions {
  logger?: ProviderLogger | null;
  service?: HotelService;
  frontendDirectory?: string;
  destinationNow?: () => number;
  clientIdentity?: string;
  admissionNow?: () => number;
  usageStore?: UsageSink;
  usageNow?: () => number;
}
type HtmlDocument = { home: string; other: string; error?: never }
  | { error: ServiceError; home?: never; other?: never };

const defaultFrontendDirectory = fileURLToPath(new URL('../frontend/dist/', import.meta.url));
const contentSecurityPolicy = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${SAFE_IMAGE_HOSTS.map((host) => `https://${host}`).join(' ')}`,
  "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'",
  "frame-ancestors 'none'", "form-action 'self'",
].join('; ');

export function createApp({ logger = console, service = createProviderService({ logger }), frontendDirectory = defaultFrontendDirectory, destinationNow = () => performance.now(), clientIdentity = 'socket', admissionNow, usageStore, usageNow }: AppOptions = {}) {
  const app = express();
  let html: Promise<HtmlDocument> | undefined;
  // One process, ten catalog scans per second, with a burst of ten. Refill on
  // demand; malformed, short and exact-country lookups don't spend this budget.
  let destinationTokens = 10;
  let destinationRefill = destinationNow();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    const startedAt = Date.now();
    const method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
    const route = requestRoute(req);
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
          method, route,
          ...(res.locals.errorCode ? { code: res.locals.errorCode } : {}), durationMs: Date.now() - startedAt });
      } catch { /* Logging must not affect the response. */ }
    });
    res.once('close', () => {
      if (res.writableFinished) return;
      try {
        logger?.info?.({ event: 'request_aborted', requestId: req.requestId, method,
          route, durationMs: Date.now() - startedAt });
      } catch { /* Logging must not affect the response. */ }
    });
    next();
  });
  app.use('/api/v1/usage', createUsageRouter({ store: usageStore, clientIdentity, now: usageNow }));
  app.use(createHotelAdmission({ clientIdentity, now: admissionNow }));
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/api/v1/destinations', (req, res) => {
    const url = new URL(req.originalUrl, 'http://localhost');
    const query = url.searchParams.get('q') ?? '';
    if (!validQuery(query) || url.searchParams.getAll('q').length > 1) {
      return res.status(400).json({ error: { code: 'INVALID_DESTINATION_QUERY', message: 'Enter a city or country name.', requestId: req.requestId } });
    }
    const destinations = searchDestinations(query, { limit: 8, beforeScan() {
      const now = destinationNow();
      destinationTokens = Math.min(10, destinationTokens + Math.max(0, now - destinationRefill) / 100);
      destinationRefill = now;
      if (destinationTokens < 1) {
        res.set('Retry-After', '1');
        throw new ServiceError('DESTINATIONS_BUSY');
      }
      destinationTokens -= 1;
    } });
    res.set('Cache-Control', 'public, max-age=300').json({ destinations });
  });
  app.get('/health', async (req, res, next) => {
    try {
      const document = await html;
      if (document?.error) throw document.error;
      const provider = typeof service.status === 'function' ? await service.status() : { available: false };
      res.set('Cache-Control', 'no-store').json({ status: 'ok', provider: { available: provider.available === true, ...('search' in provider && provider.search ? { search: provider.search } : {}) } });
    } catch (error) { next(error); }
  });
  app.use('/api/v1', createHotelRoutes(service));
  app.use('/api', notFound);
  if (process.env.NODE_ENV === 'production') {
    const staticHeaders = (res: Response, file: string) => {
      if (path.extname(file) === '.html') res.set('Cache-Control', 'no-store');
      else if (/^\/assets\/[^/]+-[\w-]{8}\.(?:js|css)$/.test(res.req.path)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    };
    // Read the immutable build once; direct results/details loads do not need the hero.
    html = readFile(path.join(frontendDirectory, 'index.html'), 'utf8').then(
      (home) => ({ home, other: home.replace(/<link\b(?:[^<>"']|"[^"]*"|'[^']*')*>/g,
        (tag) => /\bdata-home-preload\b/.test(tag) ? '' : tag) }),
      (cause) => ({ error: new ServiceError('INTERNAL_ERROR', { cause }) }),
    );
    async function sendHtml(req: Request, res: Response, next: NextFunction) {
      try {
        const variants = await html!;
        if (variants.error) return next(variants.error);
        res.set('Cache-Control', 'no-store').type('html').send(req.path === '/' ? variants.home : variants.other);
      } catch (error) { next(error); }
    }
    const encoded = Object.fromEntries(['br', 'gzip'].map((encoding) => [encoding,
      express.static(path.join(frontendDirectory, '.encoded', encoding), {
        dotfiles: 'deny', index: false, redirect: false,
        setHeaders: (res, file) => { res.setHeader('Content-Encoding', encoding); staticHeaders(res as Response, file); },
      }),
    ]));
    app.use((req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method) || !/^\/assets\/.*\.(?:js|css)$/.test(req.path)) return next();
      res.vary('Accept-Encoding');
      function serve(available: string[]): unknown {
        const encoding = req.acceptsEncodings(available);
        if (!encoding) return res.status(406).set('Cache-Control', 'no-store').end();
        if (encoding === 'identity') return next();
        encoded[encoding](req, res, (error) => {
          if (error) {
            if (!res.headersSent) res.removeHeader('Content-Encoding');
            return next(error);
          }
          serve(available.filter((value) => value !== encoding));
        });
      }
      serve(['br', 'gzip', 'identity']);
    });
    app.get('/index.html', sendHtml);
    app.use(express.static(frontendDirectory, {
      dotfiles: 'deny', index: false,
      // serve-static exposes Node's response type; Express has already augmented it.
      setHeaders: (res, file) => staticHeaders(res as Response, file),
    }));
    app.get('/{*splat}', (req, res, next) => {
      if (path.extname(req.path) || !req.accepts('html')) return next();
      return sendHtml(req, res, next);
    });
  }
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
