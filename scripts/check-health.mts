import { pathToFileURL } from 'node:url';

const MAX_BYTES = 4096;
class HealthcheckError extends Error {}

function healthUrl(host: unknown) {
  if (typeof host !== 'string' || host.length > 253 || !host.includes('.') ||
      !host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new HealthcheckError('HEALTH_HOST must be a plain lowercase DNS name or IPv4 address.');
  }
  let url;
  try { url = new URL(`https://${host}/health`); } catch { /* Reject invalid addresses below. */ }
  if (!url || url.hostname !== host) {
    throw new HealthcheckError('HEALTH_HOST must be a plain lowercase DNS name or IPv4 address.');
  }
  return url;
}

export async function checkHealth(host: unknown, { fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  const url = healthUrl(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET', headers: { Accept: 'application/json' },
      redirect: 'error', signal: controller.signal,
    });
    if (response.status !== 200) throw new HealthcheckError('Health endpoint did not return HTTP 200.');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      throw new HealthcheckError('Health response exceeded the size limit.');
    }
    if (!response.body) throw new HealthcheckError('Health endpoint returned invalid JSON.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        void reader.cancel().catch(() => {});
        throw new HealthcheckError('Health response exceeded the size limit.');
      }
      chunks.push(value);
    }
    let health: unknown;
    try { health = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')); }
    catch { throw new HealthcheckError('Health endpoint returned invalid JSON.'); }
    if (!health || typeof health !== 'object' || !('status' in health) || health.status !== 'ok') throw new HealthcheckError('Application status is not healthy.');
    const provider = 'provider' in health && health.provider && typeof health.provider === 'object' ? health.provider : {};
    if (!('available' in provider) || provider.available !== true) throw new HealthcheckError('Live provider is unavailable.');
    const search = 'search' in provider && provider.search && typeof provider.search === 'object' ? provider.search : {};
    if ('consecutiveInvalidResponses' in search && Number(search.consecutiveInvalidResponses) >= 3) {
      throw new HealthcheckError('Repeated searches received unsupported provider responses.');
    }
    if ('consecutiveUnexpectedFailures' in search && Number(search.consecutiveUnexpectedFailures) >= 3) {
      throw new HealthcheckError('Three consecutive unexpected searches failed.');
    }
  } catch (error) {
    if (error instanceof HealthcheckError) throw error;
    throw new HealthcheckError(controller.signal.aborted
      ? 'Health request timed out.' : 'Health endpoint could not be reached or read.');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkHealth(process.env.HEALTH_HOST);
    console.log('Application and live provider are healthy.');
  } catch (error) {
    console.error(error instanceof HealthcheckError ? error.message : 'Health check failed.');
    process.exitCode = 1;
  }
}
