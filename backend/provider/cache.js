export class FreshCache {
  constructor({ capacity, maxBytes, ttlMs, now }) {
    this.capacity = capacity;
    this.maxBytes = maxBytes;
    this.totalBytes = 0;
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  get(key) {
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

  delete(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.totalBytes -= entry.bytes;
    this.entries.delete(key);
  }

  set(key, value, { expiresAt = this.now() + this.ttlMs, bytes } = {}) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new TypeError('Cache entries require a measured byte size');
    this.delete(key);
    for (const [oldKey, entry] of this.entries) {
      if (entry.expiresAt <= this.now()) this.delete(oldKey);
    }
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value: structuredClone(value), expiresAt, bytes });
    this.totalBytes += bytes;
    while (this.entries.size > this.capacity || this.totalBytes > this.maxBytes) {
      this.delete(this.entries.keys().next().value);
    }
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }
}
