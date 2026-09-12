import express from 'express';
import path from 'node:path';
import { constants } from 'node:fs';
import { mkdir, open, readdir, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { clientKey } from './admission.ts';
import { MAX_USAGE_RESULTS, USAGE_ACTIONS, USAGE_DEVICES, USAGE_PAGES, USAGE_SOURCES, USAGE_TRAFFIC } from '../shared/usage.ts';
import type { UsageEvent, UsageRecord } from '../shared/usage.ts';
import type { Request } from 'express';
import type { ProviderLogger } from './provider/types.ts';

const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const fields = new Set(['version', 'eventId', 'browserId', 'sessionId', 'action', 'page', 'device', 'source', 'traffic',
  'coverage', 'resultCount', 'detailStatus', 'quoteStatus']);
const oneOf = (value: unknown, choices: readonly string[]) => typeof value === 'string' && choices.includes(value);

/** Rebuild the payload from its allowlist so arbitrary request data never reaches storage. */
export function parseUsageEvent(value: unknown): UsageEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !fields.has(key)) || input.version !== 1) return null;
  if (!['eventId', 'browserId', 'sessionId'].every(key => typeof input[key] === 'string' && uuid.test(input[key]))) return null;
  if (!oneOf(input.action, USAGE_ACTIONS) || !oneOf(input.page, USAGE_PAGES) || !oneOf(input.device, USAGE_DEVICES)
    || !oneOf(input.source, USAGE_SOURCES) || !oneOf(input.traffic, USAGE_TRAFFIC)) return null;
  if ('coverage' in input && (input.action !== 'search_succeeded' || !oneOf(input.coverage, ['complete', 'partial']))) return null;
  if ('resultCount' in input && (input.action !== 'search_succeeded' || !Number.isInteger(input.resultCount)
    || Number(input.resultCount) < 0 || Number(input.resultCount) > MAX_USAGE_RESULTS)) return null;
  for (const field of ['detailStatus', 'quoteStatus']) {
    if (field in input && (input.action !== 'detail_succeeded'
      || !oneOf(input[field], field === 'detailStatus' ? ['available', 'unavailable', 'not_requested'] : ['available', 'unavailable']))) return null;
  }
  // The checks above establish every field in the shared wire contract.
  const event = { ...input } as unknown as UsageEvent;
  return { ...event, eventId: event.eventId.toLowerCase(), browserId: event.browserId.toLowerCase(), sessionId: event.sessionId.toLowerCase() };
}

export interface UsageSink { append(event: UsageEvent): Promise<boolean>; markLimited?(): void }
export interface UsageStore extends UsageSink { ready(): Promise<void>; close(): Promise<void> }
type CollectorStatus = 'started' | 'heartbeat' | 'stopped' | 'limited';
interface CollectorRecord { version: 1; kind: 'collector_status'; timestamp: string; status: CollectorStatus }

/** One process owns this append-only stream. It never stores network identities or request text. */
export function createUsageStore({ directory = path.resolve(path.dirname(process.env.PROVIDER_STATE_FILE || 'var/provider-state.json'), 'usage'),
  logger = console, now = Date.now, maxBytes = 5 * 1024 * 1024, maxPending = 100, heartbeatMs = 60_000,
}: { directory?: string; logger?: ProviderLogger | null; now?: () => number; maxBytes?: number; maxPending?: number; heartbeatMs?: number } = {}): UsageStore {
  let handle: FileHandle | undefined;
  let fileDay = '';
  let bytes = 0;
  let pending = 0;
  let closing = false;
  let closePromise: Promise<void> | undefined;
  let limited = false;
  let failed = false;
  let dropped = false;
  let lastLimitedAt = -Infinity;
  let queue = Promise.resolve();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const reserve = Math.min(256 * 1024, Math.floor(maxBytes / 4));
  const safeLog = () => {
    if (failed) return;
    failed = true;
    try { logger?.error?.({ event: 'usage_collector_error' }); } catch { /* Logging cannot affect application availability. */ }
  };
  const dayAt = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

  async function selectFile(timestamp: number) {
    const day = dayAt(timestamp);
    if (handle && fileDay === day) return;
    await handle?.close();
    handle = undefined;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const cutoff = dayAt(timestamp - 29 * 86_400_000);
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const match = /^usage-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(file.name);
      if (file.isFile() && match && match[1] < cutoff) await unlink(path.join(directory, file.name));
    }
    handle = await open(path.join(directory, `usage-${day}.jsonl`), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    bytes = (await handle.stat()).size;
    fileDay = day;
    limited = false;
  }

  async function write(record: UsageRecord | CollectorRecord) {
    await selectFile(Date.parse(record.timestamp));
    const line = JSON.stringify(record) + '\n';
    const size = Buffer.byteLength(line);
    if (bytes + size > maxBytes) return false;
    await handle!.writeFile(line, 'utf8');
    bytes += size;
    failed = false;
    return true;
  }
  const marker = (status: CollectorStatus, timestamp = now()): CollectorRecord => ({ version: 1, kind: 'collector_status', timestamp: new Date(timestamp).toISOString(), status });

  function enqueue(operation: () => Promise<boolean>, force = false): Promise<boolean> {
    if (!force && closing) return Promise.resolve(false);
    if (pending >= maxPending) { dropped = true; return Promise.resolve(false); }
    pending += 1;
    let result = false;
    const next = queue.then(async () => {
      if (dropped) {
        dropped = false;
        await write(marker('limited'));
      }
      result = await operation();
    }).catch(() => {
      safeLog();
      dropped = true;
      // Reopen and restat on the next attempt, including after a partial write.
      const previous = handle;
      handle = undefined;
      void previous?.close().catch(() => {});
    }).finally(() => { pending -= 1; });
    queue = next;
    return next.then(() => result);
  }

  const initialized = enqueue(() => write(marker('started'))).then(() => {});
  if (heartbeatMs > 0) {
    heartbeat = setInterval(() => { void enqueue(() => write(marker('heartbeat'))); }, heartbeatMs);
    heartbeat.unref();
  }
  return {
    ready: () => initialized,
    append(event) {
      const sanitized = parseUsageEvent(event);
      if (!sanitized) return Promise.resolve(false);
      return enqueue(async () => {
        const record: UsageRecord = { ...sanitized, timestamp: new Date(now()).toISOString() };
        await selectFile(Date.parse(record.timestamp));
        if (bytes + Buffer.byteLength(JSON.stringify(record) + '\n') > maxBytes - reserve) {
          if (!limited) { limited = true; await write(marker('limited')); }
          return false;
        }
        return write(record);
      });
    },
    markLimited() {
      const timestamp = now();
      if (timestamp - lastLimitedAt < 60_000) return;
      lastLimitedAt = timestamp;
      void enqueue(() => write(marker('limited')));
    },
    close() {
      if (closePromise) return closePromise;
      closing = true;
      if (heartbeat) clearInterval(heartbeat);
      closePromise = (async () => {
        await queue;
        await enqueue(() => write(marker('stopped')), true);
        await handle?.close().catch(safeLog);
        handle = undefined;
      })();
      return closePromise;
    },
  };
}

/** Quotas are independent of paid hotel operations, and expire without retaining client history. */
export function createUsageLimiter({ now = Date.now, clientBurst = 300, globalBurst = 5_000, maxClients = 1000 }: {
  now?: () => number; clientBurst?: number; globalBurst?: number; maxClients?: number;
} = {}) {
  const clients = new Map<string, { tokens: number; timestamp: number }>();
  let globalTokens = globalBurst;
  let globalTimestamp = now();
  let cleanup: ReturnType<typeof setTimeout> | undefined;
  const prune = (timestamp: number) => {
    for (const [key, value] of clients) if (timestamp - value.timestamp >= 60_000) clients.delete(key);
  };
  const schedule = () => {
    if (cleanup || !clients.size) return;
    cleanup = setTimeout(() => { cleanup = undefined; prune(now()); schedule(); }, 60_000);
    cleanup.unref();
  };
  return (key: string) => {
    const timestamp = now();
    globalTokens = Math.min(globalBurst, globalTokens + Math.max(0, timestamp - globalTimestamp) * globalBurst / 60_000);
    globalTimestamp = timestamp;
    if (globalTokens < 1) return false;
    globalTokens -= 1;
    prune(timestamp);
    const bucket = clients.get(key);
    if (!bucket && clients.size >= maxClients) return false;
    const tokens = bucket ? Math.min(clientBurst, bucket.tokens + Math.max(0, timestamp - bucket.timestamp) * clientBurst / 60_000) : clientBurst;
    if (tokens < 1) return false;
    clients.set(key, { tokens: tokens - 1, timestamp });
    schedule();
    return true;
  };
}

function sameOrigin(req: Request) {
  const origin = req.get('Origin');
  const host = req.get('Host');
  if (!origin || !host || (req.get('Sec-Fetch-Site') && req.get('Sec-Fetch-Site') !== 'same-origin')) return false;
  try {
    const url = new URL(origin);
    return ['https:', 'http:'].includes(url.protocol) && url.origin === origin && url.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
}

export function createUsageRouter({ store, clientIdentity = 'socket', now }: { store?: UsageSink; clientIdentity?: string; now?: () => number } = {}) {
  const router = express.Router();
  const admit = createUsageLimiter({ now });
  const parse = express.json({ limit: 2048, strict: true, inflate: false });
  router.post('/', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!sameOrigin(req)) return res.status(403).end();
    if (req.get('DNT') === '1' || req.get('Sec-GPC') === '1') return res.status(204).end();
    if (!admit(clientKey(req, clientIdentity))) {
      try { store?.markLimited?.(); } catch { /* Usage must not affect hotel request availability. */ }
      return res.status(429).set('Retry-After', '60').end();
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.get('Content-Type') || '')) return res.status(415).end();
    if (Number(req.get('Content-Length')) > 2048) return res.status(413).end();
    parse(req, res, (error: unknown) => {
      if (error) {
        const code = error && typeof error === 'object' && 'type' in error ? error.type : '';
        return res.status(code === 'entity.too.large' ? 413 : code === 'encoding.unsupported' ? 415 : 400).end();
      }
      next();
    });
  }, async (req, res) => {
    const event = parseUsageEvent(req.body);
    if (!event) return res.status(400).end();
    if (event.traffic !== 'internal' && /bot|crawler|spider|headless|phantom|selenium|playwright|puppeteer|curl|wget/i.test((req.get('User-Agent') || '').slice(0, 1024))) event.traffic = 'automated';
    try {
      const accepted = await store?.append(event);
      return res.status(accepted ? 204 : 503).end();
    } catch { return res.status(503).end(); }
  });
  return router;
}
