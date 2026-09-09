import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnostic } from './diagnostics.js';
import { ProviderFailure, ServiceError } from './provider/errors.js';

test('diagnostics retain known error classes, system causes and only project source locations', () => {
  const secret = 'private-sentinel';
  const cause = Object.assign(new Error(secret), { code: 'EACCES' });
  const error = new TypeError(secret, { cause });
  error.name = secret;
  error.code = secret;
  error.stack = `${secret}\n    at ${secret} (${new URL('./provider/service.js', import.meta.url).href}:20:4)\n    at /tmp/${secret}.js:1:2\n    at ${new URL(`./${secret}.js`, import.meta.url).href}:1:2`;
  const result = diagnostic(error);
  assert.equal(result.name, 'TypeError');
  assert.deepEqual(result.locations, [{ file: 'backend/provider/service.js', line: 20, column: 4 }]);
  assert.equal(result.cause.code, 'EACCES');
  assert.doesNotMatch(JSON.stringify(result), /private-sentinel|file:|\/Users|\/tmp/);
  cause.cause = error;
  assert.ok(JSON.stringify(diagnostic(error)).length < 1000);
  assert.deepEqual(diagnostic(null), { name: 'UnknownError' });
});

test('provider diagnostic fields are allowlisted again at the logging boundary', () => {
  const cause = new ProviderFailure('unavailable', { provider: {
    operation: 'HotelRevealerListings', httpStatus: 503, responseType: 'json', category: 'maintenance',
    body: 'private-sentinel', headers: { authorization: 'private-sentinel' },
  } });
  cause.provider.extra = 'private-sentinel';
  const error = new ServiceError('PROVIDER_UNAVAILABLE', { cause });
  assert.deepEqual(diagnostic(error).cause.provider, {
    operation: 'HotelRevealerListings', httpStatus: 503, responseType: 'json', category: 'maintenance',
  });
  cause.provider = { operation: 'private-sentinel', httpStatus: 'private-sentinel', responseType: 'private-sentinel', category: 'private-sentinel' };
  assert.equal(diagnostic(error).cause.provider, undefined);
  assert.doesNotMatch(JSON.stringify(diagnostic(error)), /private-sentinel/);
});
