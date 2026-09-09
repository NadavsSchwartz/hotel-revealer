import test from 'node:test';
import assert from 'node:assert/strict';
import { FreshCache } from './cache.ts';
import { manualClock } from './test-helpers.ts';

test('fresh LRU cache evicts to capacity and hits never extend TTL or leak object mutations', async () => {
  const clock = manualClock();
  const cache = new FreshCache<{ value: number }>({ capacity: 2, maxBytes: 100, ttlMs: 100, now: clock.now });
  cache.set('a', { value: 1 }, { bytes: 11 });
  cache.set('b', { value: 2 }, { bytes: 11 });
  const read = cache.get('a');
  assert.ok(read);
  read.value = 99;
  cache.set('c', { value: 3 }, { bytes: 11 });
  assert.equal(cache.get('b'), undefined);
  assert.deepEqual(cache.get('a'), { value: 1 });
  await clock.advance(99);
  assert.ok(cache.get('a'));
  await clock.advance(1);
  assert.equal(cache.get('a'), undefined);
});

test('payload weights bound cache storage across replacement, eviction, expiry and clear', async () => {
  const clock = manualClock();
  const cache = new FreshCache<string>({ capacity: 10, maxBytes: 10, ttlMs: 100, now: clock.now });
  cache.set('a', 'aaa', { bytes: 5 });
  cache.set('b', 'bbb', { bytes: 5 });
  cache.get('a');
  cache.set('c', 'c', { bytes: 3 });
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.totalBytes, 8);
  cache.set('a', 'a', { bytes: 3 });
  assert.equal(cache.totalBytes, 6);
  cache.set('a', 'x'.repeat(20), { bytes: 22 });
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('c'), 'c');
  assert.equal(cache.totalBytes, 3);
  await clock.advance(100);
  assert.equal(cache.get('c'), undefined);
  assert.equal(cache.totalBytes, 0);
  cache.set('d', 'd', { bytes: 3 });
  await clock.advance(100);
  cache.set('e', 'e', { bytes: 3 });
  assert.equal(cache.totalBytes, 3);
  cache.clear();
  assert.equal(cache.totalBytes, 0);
  assert.equal(cache.get('e'), undefined);
});
