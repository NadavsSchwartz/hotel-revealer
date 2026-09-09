import { mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { diagnostic } from '../diagnostics.ts';
import { realClock } from './scheduler.ts';
import type { ProviderClock, ProviderLogger, ProviderTimer } from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export const SELECTION_TTL = 30 * 60_000;
export const MAX_SELECTION_RECORDS = 1000;
export const MAX_SELECTION_BYTES = 256 * 1024;
export const selectionHash = (key: string) => createHash('sha256').update(key).digest('hex');
export interface SelectionRecord { hash: string; cityId: string | null; expiresAt: number }
export type SelectionStore = ReturnType<typeof createSelectionStore>;

function validRecord(record: unknown): record is SelectionRecord {
  return isRecord(record) && Object.keys(record).sort().join(',') === 'cityId,expiresAt,hash' && typeof record.hash === 'string' &&
    /^[a-f\d]{64}$/.test(record.hash) &&
    (record.cityId === null || typeof record.cityId === 'string' && /^[1-9]\d{0,15}$/.test(record.cityId)) &&
    typeof record.expiresAt === 'number' && Number.isSafeInteger(record.expiresAt) && record.expiresAt > 0 && record.expiresAt <= 8_640_000_000_000_000;
}

// A bounded recovery cache, separate from the provider's durable safety block.
// It stores neither offer IDs nor trip fields, prices, links or hotel evidence.
export function createSelectionStore({ filePath = null, clock = realClock, logger = console }: { filePath?: string | null; clock?: ProviderClock; logger?: ProviderLogger | null } = {}) {
  const entries = new Map<string, SelectionRecord>();
  let loading: Promise<void> | undefined;
  let writes = Promise.resolve(true);
  let timer: ProviderTimer | undefined;
  let closed = false;

  function failed(operation: string, error: unknown) {
    try { logger?.error?.({ event: 'selection_recovery_failed', operation, diagnostic: diagnostic(error) }); }
    catch { /* Recovery cache diagnostics cannot change live availability. */ }
  }

  function prune() {
    let removed = false;
    for (const [hash, record] of entries) {
      if (record.expiresAt <= clock.now()) { entries.delete(hash); removed = true; }
    }
    return removed;
  }

  function persist() {
    if (!filePath) return Promise.resolve(true);
    writes = writes.then(async () => {
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      try {
        prune();
        const body = `${JSON.stringify({ version: 1, records: [...entries.values()] })}\n`;
        if (Buffer.byteLength(body) > MAX_SELECTION_BYTES) throw new Error('Selection cache exceeds its byte limit');
        await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
        const handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(body); }
        finally { await handle.close(); }
        await rename(temporary, filePath);
        return true;
      } catch (error) {
        failed('write', error);
        return false;
      } finally { await unlink(temporary).catch(() => {}); }
    });
    return writes;
  }

  function scheduleExpiry() {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
    if (closed || !entries.size) return;
    const expiresAt = Math.min(...[...entries.values()].map(record => record.expiresAt));
    timer = clock.setTimeout(() => {
      timer = undefined;
      if (prune()) void persist();
      scheduleExpiry();
    }, Math.max(1, expiresAt - clock.now()));
    if (typeof timer === 'object') timer.unref();
  }

  function ready() {
    loading ||= (async () => {
      if (!filePath) return;
      // Single-process deployment: only the final snapshot is authoritative.
      // Remove this cache's crash-left temporary files without reading them.
      const directory = path.dirname(filePath);
      const prefix = `${path.basename(filePath)}.`;
      try {
        for (const name of await readdir(directory)) {
          if (name.startsWith(prefix) && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.tmp$/.test(name.slice(prefix.length))) {
            await unlink(path.join(directory, name)).catch(error => failed('cleanup', error));
          }
        }
      } catch (error) { if (!isRecord(error) || error.code !== 'ENOENT') failed('cleanup', error); }
      try {
        const handle = await open(filePath, 'r');
        let body;
        try {
          const buffer = Buffer.alloc(MAX_SELECTION_BYTES + 1);
          let length = 0;
          while (length < buffer.length) {
            const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
            if (!bytesRead) break;
            length += bytesRead;
          }
          if (length > MAX_SELECTION_BYTES) throw new Error('Selection cache exceeds its byte limit');
          body = buffer.subarray(0, length).toString('utf8');
        } finally { await handle.close(); }
        const saved: unknown = JSON.parse(body);
        if (!isRecord(saved) || saved.version !== 1 || !Array.isArray(saved.records) || saved.records.length > MAX_SELECTION_RECORDS ||
            !saved.records.every(validRecord) || new Set(saved.records.map(record => record.hash)).size !== saved.records.length) {
          throw new Error('Invalid selection cache');
        }
        for (const record of saved.records) {
          if (record.expiresAt <= clock.now() + SELECTION_TTL) entries.set(record.hash, record);
        }
        const removed = prune() || entries.size !== saved.records.length;
        if (removed) await persist();
      } catch (error) {
        entries.clear();
        if (!isRecord(error) || error.code !== 'ENOENT') failed('read', error);
      }
      scheduleExpiry();
    })();
    return loading;
  }

  return {
    ready,
    async get(hash: string) {
      await ready();
      if (prune()) { await persist(); scheduleExpiry(); }
      const record = entries.get(hash);
      return record ? { ...record } : undefined;
    },
    async remember(records: SelectionRecord[]) {
      await ready();
      if (closed) return false;
      if (!records.every(validRecord)) throw new TypeError('Invalid selection record');
      prune();
      for (const record of records) {
        if (record.expiresAt <= clock.now() || record.expiresAt > clock.now() + SELECTION_TTL) continue;
        entries.delete(record.hash);
        entries.set(record.hash, { ...record });
      }
      while (entries.size > MAX_SELECTION_RECORDS) entries.delete(entries.keys().next().value!);
      scheduleExpiry();
      return persist();
    },
    async close() {
      closed = true;
      if (timer !== undefined) clock.clearTimeout(timer);
      await loading;
      return writes;
    },
  };
}
