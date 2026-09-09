interface CacheOptions { capacity: number; maxBytes: number; ttlMs: number; now: () => number }
interface CacheEntry<Value> { value: Value; expiresAt: number; bytes: number }
export class FreshCache<Value> {
  declare capacity: number;
  declare maxBytes: number;
  declare totalBytes: number;
  declare ttlMs: number;
  declare now: () => number;
  declare entries: Map<string, CacheEntry<Value>>;
  constructor({ capacity, maxBytes, ttlMs, now }: CacheOptions) {
    this.capacity = capacity;
    this.maxBytes = maxBytes;
    this.totalBytes = 0;
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.delete(key);
      return undefined;
    }
    // Fresh hits update bounded LRU order, never extend freshness.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }

  delete(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.totalBytes -= entry.bytes;
    this.entries.delete(key);
  }

  set(key: string, value: Value, { expiresAt = this.now() + this.ttlMs, bytes }: { expiresAt?: number; bytes?: number } = {}) {
    if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0) throw new TypeError('Cache entries require a measured byte size');
    this.delete(key);
    for (const [oldKey, entry] of this.entries) {
      if (entry.expiresAt <= this.now()) this.delete(oldKey);
    }
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value: structuredClone(value), expiresAt, bytes });
    this.totalBytes += bytes;
    while (this.entries.size > this.capacity || this.totalBytes > this.maxBytes) {
      this.delete(this.entries.keys().next().value!);
    }
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }
}
