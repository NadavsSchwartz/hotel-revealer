export class FreshCache {
  constructor({ capacity, ttlMs, now }) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Fresh hits update bounded LRU order, never extend freshness.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }

  set(key, value, expiresAt = this.now() + this.ttlMs) {
    this.entries.delete(key);
    for (const [oldKey, entry] of this.entries) {
      if (entry.expiresAt <= this.now()) this.entries.delete(oldKey);
    }
    this.entries.set(key, { value: structuredClone(value), expiresAt });
    while (this.entries.size > this.capacity) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }

  clear() {
    this.entries.clear();
  }
}
