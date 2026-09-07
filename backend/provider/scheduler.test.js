import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderScheduler } from './scheduler.js';
import { flush, manualClock } from './test-helpers.js';

test('one active upstream call, FIFO order, one-second start gap, four waiting slots', async () => {
  const clock = manualClock();
  const scheduler = new ProviderScheduler({ clock });
  const starts = [];
  let release;
  const first = scheduler.run(async () => {
    starts.push(['first', clock.now()]);
    await new Promise((resolve) => { release = resolve; });
  }, { deadline: clock.now() + 20_000 });
  await flush();
  const waiting = Array.from({ length: 4 }, (_, i) => scheduler.run(async () => {
    starts.push([i, clock.now()]);
  }, { deadline: clock.now() + 20_000 }));
  await assert.rejects(scheduler.run(() => {}, { deadline: clock.now() + 20_000 }), { code: 'PROVIDER_BUSY' });
  await clock.advance(500);
  assert.equal(starts.length, 1);
  release();
  await first;
  await clock.advance(499);
  assert.equal(starts.length, 1);
  await clock.advance(3_001);
  await Promise.all(waiting);
  assert.deepEqual(starts.map(([label]) => label), ['first', 0, 1, 2, 3]);
  for (let i = 1; i < starts.length; i += 1) assert.equal(starts[i][1] - starts[i - 1][1], 1_000);
});

test('expired queued work is removed and never dispatched', async () => {
  const clock = manualClock();
  const scheduler = new ProviderScheduler({ clock });
  let release;
  const first = scheduler.run(() => new Promise((resolve) => { release = resolve; }), { deadline: clock.now() + 20_000 });
  await flush();
  let dispatched = false;
  const queued = scheduler.run(() => { dispatched = true; }, { deadline: clock.now() + 500 });
  const rejection = assert.rejects(queued, { code: 'DEADLINE_EXCEEDED' });
  await clock.advance(500);
  await rejection;
  release();
  await first;
  await clock.advance(1_000);
  assert.equal(dispatched, false);
});

test('active deadline aborts transport but never overlaps an adapter that ignores abort', async () => {
  const clock = manualClock();
  const scheduler = new ProviderScheduler({ clock });
  let release;
  let signal;
  const first = scheduler.run((value) => {
    signal = value;
    return new Promise((resolve) => { release = resolve; });
  }, { deadline: clock.now() + 100 });
  const rejection = assert.rejects(first, { code: 'DEADLINE_EXCEEDED' });
  let secondStarted = false;
  const second = scheduler.run(async () => { secondStarted = true; }, { deadline: clock.now() + 10_000 });
  await clock.advance(2_000);
  await rejection;
  assert.equal(signal.aborted, true);
  assert.equal(secondStarted, false);
  release();
  await flush();
  await second;
  assert.equal(secondStarted, true);
});

test('admission deadline includes slow pre-dispatch state checks', async () => {
  const clock = manualClock();
  let checkDone;
  const scheduler = new ProviderScheduler({ clock, beforeDispatch: () => new Promise((resolve) => { checkDone = resolve; }) });
  let called = false;
  const work = scheduler.run(() => { called = true; }, { deadline: clock.now() + 100 });
  const rejection = assert.rejects(work, { code: 'DEADLINE_EXCEEDED' });
  await clock.advance(100);
  await rejection;
  checkDone();
  await flush();
  assert.equal(called, false);
});
