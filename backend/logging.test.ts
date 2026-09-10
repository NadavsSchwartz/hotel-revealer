import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonLogger } from './logging.ts';

test('production logs are single-line JSON with UTC timestamps and preserved event fields', t => {
  const lines: string[] = [];
  t.mock.method(console, 'info', (line: string) => lines.push(line));
  t.mock.method(console, 'error', (line: string) => lines.push(line));
  jsonLogger.info({ event: 'request_completed', requestId: 'quoted-"\n東京', status: 200 });
  jsonLogger.error({ event: 'provider_state_failed', operation: 'read' });
  assert.equal(lines.length, 2);
  for (const [index, line] of lines.entries()) {
    assert.equal(line.includes('\n'), false);
    const record = JSON.parse(line);
    assert.equal(new Date(record.timestamp).toISOString(), record.timestamp);
    assert.equal(record.level, index === 0 ? 'info' : 'error');
  }
  assert.equal(JSON.parse(lines[0]).requestId, 'quoted-"\n東京');
  assert.equal(JSON.parse(lines[1]).operation, 'read');
});

test('serialization and output failures do not escape the logger', t => {
  const circular: { event: string; cause?: unknown } = { event: 'test' };
  circular.cause = circular;
  const output = t.mock.method(console, 'info', () => { throw new Error('output unavailable'); });
  assert.doesNotThrow(() => jsonLogger.info(circular));
  assert.equal(output.mock.callCount(), 0);
  assert.doesNotThrow(() => jsonLogger.info({ event: 'request_completed' }));
  assert.equal(output.mock.callCount(), 1);
});
