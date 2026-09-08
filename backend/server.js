import 'dotenv/config';
import path from 'node:path';
import { createApp } from './app.js';
import { createProviderService } from './provider/service.js';
import { createPricelineAdapter } from './provider/priceline.js';

const providerMode = process.env.HOTEL_PROVIDER || 'priceline';
if (!['priceline', 'disabled'].includes(providerMode)) throw new Error('HOTEL_PROVIDER must be priceline or disabled');
const service = createProviderService({ adapter: providerMode === 'priceline' ? createPricelineAdapter() : null });
const app = createApp({ service, frontendDirectory: process.env.FRONTEND_DIST_DIR ? path.resolve(process.env.FRONTEND_DIST_DIR) : undefined });
const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

const server = app.listen(port, () => {
  console.info({ event: 'server_started', port, providerConfigured: providerMode === 'priceline' });
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
let stopping = false;

function shutdown() {
  if (stopping) return;
  stopping = true;
  service.drain();
  const forceClose = setTimeout(() => {
    service.close();
    server.closeAllConnections();
  }, 25_000);
  forceClose.unref();
  server.close(() => {
    clearTimeout(forceClose);
    service.close();
    console.info({ event: 'server_stopped' });
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
