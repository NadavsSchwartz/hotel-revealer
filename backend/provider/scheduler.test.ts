import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderScheduler } from './scheduler.ts';
import { flush, manualClock } from './test-helpers.ts';

test('one active upstream call, FIFO order, one-second start gap, four waiting slots', async () => {
  const clock = manualClock();
  const scheduler = new ProviderScheduler({ clock });
  const starts: [string | number, number][] = [];
  let release!: () => void;
  const first = scheduler.run(async () => {
    starts.push(['first', clock.now()]);
    await new Promise<void>((resolve) => { release = resolve; });
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
  let release!: () => void;
  const first = scheduler.run(() => new Promise<void>((resolve) => { release = resolve; }), { deadline: clock.now() + 20_000 });
  await flush();
  let dispatched = false;
  let held = true;
  const queued = scheduler.run(() => { dispatched = true; }, { deadline: clock.now() + 500,
    holdWork: operation => { operation.then(() => { held = false; }); } });
  const rejection = assert.rejects(queued, { code: 'DEADLINE_EXCEEDED' });
  await clock.advance(500);
  await rejection;
  assert.equal(held, false, 'expired undispatched work releases its owner');
  release();
  await first;
  await clock.advance(1_000);
  assert.equal(dispatched, false);
});

test('active deadline aborts transport but never overlaps an adapter that ignores abort', async () => {
  const clock = manualClock();
  const scheduler = new ProviderScheduler({ clock });
  let release!: () => void;
  let signal: AbortSignal | undefined;
  const first = scheduler.run((value) => {
    signal = value;
    return new Promise<void>((resolve) => { release = resolve; });
  }, { deadline: clock.now() + 100 });
  const rejection = assert.rejects(first, { code: 'DEADLINE_EXCEEDED' });
  let secondStarted = false;
  const second = scheduler.run(async () => { secondStarted = true; }, { deadline: clock.now() + 10_000 });
  await clock.advance(2_000);
  await rejection;
  assert.ok(signal);
  assert.equal(signal.aborted, true);
  assert.equal(secondStarted, false);
  release();
  await flush();
  await second;
  assert.equal(secondStarted, true);
});

test('admission deadline includes slow pre-dispatch state checks', async () => {
  const clock = manualClock();
  let checkDone!: () => void;
  const scheduler = new ProviderScheduler({ clock, beforeDispatch: () => new Promise<void>((resolve) => { checkDone = resolve; }) });
  let called = false;
  const work = scheduler.run(() => { called = true; }, { deadline: clock.now() + 100 });
  const rejection = assert.rejects(work, { code: 'DEADLINE_EXCEEDED' });
  await clock.advance(100);
  await rejection;
  checkDone();
  await flush();
  assert.equal(called, false);
});

test('preparation time does not shorten the gap between actual upstream starts', async () => {
  const clock = manualClock();
  let finishPreparation!: () => void;
  let preparations = 0;
  const scheduler = new ProviderScheduler({ clock, beforeDispatch: async () => {
    preparations += 1;
    if (preparations === 1) await new Promise<void>((resolve) => { finishPreparation = resolve; });
  } });
  const starts: number[] = [];
  const first = scheduler.run(() => { starts.push(clock.now()); }, { deadline: clock.now() + 20_000 });
  const second = scheduler.run(() => { starts.push(clock.now()); }, { deadline: clock.now() + 20_000 });
  await clock.advance(1_500);
  finishPreparation();
  await first;
  await clock.advance(999);
  assert.equal(starts.length, 1);
  await clock.advance(1);
  await second;
  assert.equal(starts[1] - starts[0], 1_000);
});

test('completion persistence keeps the active slot even after the admission deadline', async () => {
  const clock = manualClock();
  let finishPersistence!: () => void;
  let completions = 0;
  const scheduler = new ProviderScheduler({ clock, afterDispatch: async () => {
    completions += 1;
    if (completions === 1) await new Promise<void>((resolve) => { finishPersistence = resolve; });
  } });
  let calls = 0;
  let held = true;
  const rejected = assert.rejects(scheduler.run(() => { calls += 1; }, { deadline: clock.now() + 100,
    holdWork: operation => { operation.then(() => { held = false; }); } }), { code: 'DEADLINE_EXCEEDED' });
  const second = scheduler.run(() => { calls += 1; }, { deadline: clock.now() + 10_000 });
  await clock.advance(2_000);
  await rejected;
  assert.equal(calls, 1);
  assert.equal(held, true, 'outcome persistence remains owned after the caller deadline');
  finishPersistence();
  await second;
  assert.equal(calls, 2);
  assert.equal(held, false);
});
