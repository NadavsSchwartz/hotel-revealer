import './env.ts';
import path from 'node:path';
import { createApp } from './app.ts';
import { createProviderService } from './provider/service.ts';
import { createPricelineAdapter } from './provider/priceline.ts';
import { createSelectionStore } from './provider/selection-store.ts';
import { jsonLogger as logger } from './logging.ts';

const providerMode = process.env.HOTEL_PROVIDER || 'priceline';
if (!['priceline', 'disabled'].includes(providerMode)) throw new Error('HOTEL_PROVIDER must be priceline or disabled');
const selectionStore = providerMode === 'priceline' ? createSelectionStore({
  filePath: path.resolve(path.dirname(process.env.PROVIDER_STATE_FILE || 'var/provider-state.json'), 'selection-records.json'),
  logger,
}) : null;
await selectionStore?.ready();
const service = createProviderService({ adapter: providerMode === 'priceline' ? createPricelineAdapter() : null, selectionStore, logger });
const app = createApp({ service, logger, clientIdentity: process.env.HOTEL_CLIENT_IDENTITY || 'socket',
  frontendDirectory: process.env.FRONTEND_DIST_DIR ? path.resolve(process.env.FRONTEND_DIST_DIR) : undefined });
const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

const server = app.listen(port, (error?: NodeJS.ErrnoException) => {
  if (error) {
    process.exitCode = 1;
    logger.error({ event: 'server_start_failed',
      code: error.code && ['EADDRINUSE', 'EACCES', 'EADDRNOTAVAIL'].includes(error.code) ? error.code : 'LISTEN_FAILED' });
    Promise.resolve().then(() => service.close()).catch(() => {
      logger.error({ event: 'server_cleanup_failed' });
    });
    return;
  }
  logger.info({ event: 'server_started', port, providerConfigured: providerMode === 'priceline' });
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
let stopping = false;

function shutdown() {
  if (stopping) return;
  stopping = true;
  service.drain();
  let finishGrace!: () => void;
  const grace = new Promise<void>(resolve => { finishGrace = resolve; });
  const forceClose = setTimeout(() => {
    void service.close();
    server.closeAllConnections();
    finishGrace();
  }, 25_000);
  forceClose.unref();
  server.close(async () => {
    await Promise.race([service.close(), grace]);
    clearTimeout(forceClose);
    logger.info({ event: 'server_stopped' });
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
