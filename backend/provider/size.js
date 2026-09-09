import { ServiceError } from './errors.js';

export const MAX_JSON_BYTES = 2 * 1024 * 1024;

// Count while JSON.stringify walks the value. The replacer throws before the
// serializer can build a huge string from repeated candidate names/metadata.
// Separator accounting is conservative by at most one byte per child value.
export function serializeBoundedJson(value, limitBytes = MAX_JSON_BYTES) {
  let bytes = 0;
  let first = true;
  const add = (amount) => {
    bytes += amount;
    if (bytes > limitBytes) throw new ServiceError('RESULT_TOO_LARGE');
  };
  const stringBytes = (text) => {
    // Check before quoting: a single huge string must not be copied first.
    if (Buffer.byteLength(text, 'utf8') > limitBytes - bytes) throw new ServiceError('RESULT_TOO_LARGE');
    return Buffer.byteLength(JSON.stringify(text), 'utf8');
  };
  const serialized = JSON.stringify(value, function (key, item) {
    if (first) first = false;
    else {
      add(1);
      if (!Array.isArray(this)) add(stringBytes(key) + 1);
    }
    if (typeof item === 'string') add(stringBytes(item));
    else if (item === null) add(4);
    else if (typeof item === 'number' || typeof item === 'boolean') add(String(item).length);
    else if (typeof item === 'object') add(2);
    return item;
  });
  if (serialized === undefined) throw new ServiceError('PROVIDER_RESPONSE_INVALID');
  const measuredBytes = Buffer.byteLength(serialized, 'utf8');
  if (measuredBytes > limitBytes) throw new ServiceError('RESULT_TOO_LARGE');
  return { body: serialized, bytes: measuredBytes };
}

export function assertJsonSize(value, limitBytes = MAX_JSON_BYTES) {
  return serializeBoundedJson(value, limitBytes).bytes;
}
