import test from 'node:test';
import assert from 'node:assert/strict';
import { FreshCache } from './cache.js';
import { manualClock } from './test-helpers.js';

test('fresh LRU cache evicts to capacity and hits never extend TTL or leak object mutations', async () => {
  const clock = manualClock();
  const cache = new FreshCache({ capacity: 2, ttlMs: 100, now: clock.now });
  cache.set('a', { value: 1 });
  cache.set('b', { value: 2 });
  const read = cache.get('a');
  read.value = 99;
  cache.set('c', { value: 3 });
  assert.equal(cache.get('b'), undefined);
  assert.deepEqual(cache.get('a'), { value: 1 });
  await clock.advance(99);
  assert.ok(cache.get('a'));
  await clock.advance(1);
  assert.equal(cache.get('a'), undefined);
});
