import 'dotenv/config';
import { createApp } from './app.js';
import { createProviderService } from './provider/service.js';

const service = createProviderService();
const app = createApp({ service });
const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

const server = app.listen(port, () => {
  console.info({ event: 'server_started', port, providerConfigured: false });
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
