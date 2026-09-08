import test from 'node:test';
import assert from 'node:assert/strict';
import { assertJsonSize, MAX_JSON_BYTES } from './size.js';

test('serialized size guard counts UTF-8 and JSON escapes and rejects a single huge field', () => {
  assert.doesNotThrow(() => assertJsonSize({ value: 'a'.repeat(1_000) }));
  for (const value of ['a'.repeat(MAX_JSON_BYTES), '😀'.repeat(MAX_JSON_BYTES / 4), '\u0000'.repeat(MAX_JSON_BYTES / 6)]) {
    assert.throws(() => assertJsonSize({ value }), { code: 'RESULT_TOO_LARGE', status: 503 });
  }
});

test('serialized size guard stops amplified shared objects and rejects non-JSON payloads', () => {
  const candidate = { name: 'Hotel '.repeat(1_000) };
  assert.throws(() => assertJsonSize(Array(1_000).fill(candidate)), { code: 'RESULT_TOO_LARGE' });
  const circular = {};
  circular.self = circular;
  assert.throws(() => assertJsonSize(circular), TypeError);
});
