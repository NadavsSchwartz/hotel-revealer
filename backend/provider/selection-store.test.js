import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSelectionStore, MAX_SELECTION_BYTES, SELECTION_TTL, selectionHash } from './selection-store.js';
import { manualClock } from './test-helpers.js';

async function setup(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hotel-selection-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'selections.json');
  const clock = manualClock();
  const logs = [];
  const options = { filePath, clock, logger: { error: entry => logs.push(entry) } };
  const store = createSelectionStore(options);
  t.after(() => store.close());
  return { directory, filePath, clock, logs, options, store };
}

const record = (clock, key = 'selection') => ({ hash: selectionHash(key), cityId: '3000015284', expiresAt: clock.now() + SELECTION_TTL });

test('only bounded recovery fields survive restart and reads never extend issuance', async t => {
  const { filePath, clock, options, store } = await setup(t);
  const issued = record(clock);
  assert.equal(await store.remember([issued]), true);
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { version: 1, records: [issued] });
  await store.close();
  const restarted = createSelectionStore(options);
  t.after(() => restarted.close());
  await clock.advance(SELECTION_TTL - 1);
  assert.deepEqual(await restarted.get(issued.hash), issued);
  await clock.advance(1);
  assert.equal(await restarted.get(issued.hash), undefined);
  await restarted.close();
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')).records, []);
});

test('startup removes expired records and the live timer prunes without requests', async t => {
  const { filePath, clock, options, store } = await setup(t);
  const stale = { ...record(clock, 'stale'), expiresAt: clock.now() - 1 };
  const valid = { ...record(clock), expiresAt: clock.now() + 1000 };
  await writeFile(filePath, JSON.stringify({ version: 1, records: [stale, valid] }));
  await store.ready();
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')).records, [valid]);
  await clock.advance(1000);
  await store.close();
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')).records, []);
  const restarted = createSelectionStore(options);
  t.after(() => restarted.close());
  assert.equal(await restarted.get(valid.hash), undefined);
});

test('startup removes only this snapshot’s crash-left UUID temporary files', async t => {
  const { directory, filePath, clock, store } = await setup(t);
  const saved = JSON.stringify({ version: 1, records: [record(clock)] });
  const orphan = `${path.basename(filePath)}.12345678-1234-4321-8123-123456789abc.tmp`;
  const siblings = ['provider-state.json.12345678-1234-4321-8123-123456789abc.tmp', 'selections.json.notes.tmp'];
  await Promise.all([writeFile(path.join(directory, orphan), saved),
    ...siblings.map(name => writeFile(path.join(directory, name), 'unrelated'))]);
  await store.ready();
  assert.deepEqual((await readdir(directory)).sort(), siblings.sort());
  assert.equal(await store.get(record(clock).hash), undefined, 'an orphan snapshot cannot authorize a selection');
  for (const name of siblings) assert.equal(await readFile(path.join(directory, name), 'utf8'), 'unrelated');
});

test('record count stays at one thousand and unknown private fields are rejected', async t => {
  const { filePath, clock, store } = await setup(t);
  const records = Array.from({ length: 1001 }, (_, index) => record(clock, String(index)));
  await store.remember(records);
  const body = await readFile(filePath, 'utf8');
  assert.ok(Buffer.byteLength(body) < MAX_SELECTION_BYTES);
  assert.equal(JSON.parse(body).records.length, 1000);
  assert.equal(await store.get(records[0].hash), undefined);
  assert.deepEqual(await store.get(records.at(-1).hash), records.at(-1));
  await assert.rejects(store.remember([{ ...record(clock), offerId: 'private-offer' }]), TypeError);
  assert.equal((await readFile(filePath, 'utf8')).includes('private-offer'), false);
});

test('concurrent search issuance keeps both recovery records in the final snapshot', async t => {
  const { clock, options, store } = await setup(t);
  const first = record(clock, 'first-trip');
  const second = { ...record(clock, 'second-trip'), cityId: null };
  await Promise.all([store.remember([first]), store.remember([second])]);
  const restarted = createSelectionStore(options);
  t.after(() => restarted.close());
  assert.deepEqual(await restarted.get(first.hash), first);
  assert.deepEqual(await restarted.get(second.hash), second);
});

test('short filesystem reads still recover the entire bounded snapshot', async t => {
  const { filePath, clock, store } = await setup(t);
  const issued = record(clock);
  await writeFile(filePath, JSON.stringify({ version: 1, records: [issued] }));
  const handle = await open(filePath, 'r');
  const prototype = Object.getPrototypeOf(handle);
  const read = prototype.read;
  await handle.close();
  t.mock.method(prototype, 'read', function (buffer, offset, length, position) {
    return read.call(this, buffer, offset, Math.min(length, 7), position);
  });
  assert.deepEqual(await store.get(issued.hash), issued);
});

test('missing or unusable snapshots never authorize selections and diagnostics omit their contents', async t => {
  const { filePath, clock, logs, options, store } = await setup(t);
  assert.equal(await store.get(record(clock).hash), undefined);
  for (const body of ['private-trip-not-json', 'x'.repeat(MAX_SELECTION_BYTES + 1),
    JSON.stringify({ version: 1, records: [{ ...record(clock), handoffUrl: 'private-trip' }] })]) {
    await writeFile(filePath, body);
    const invalid = createSelectionStore(options);
    assert.equal(await invalid.get(record(clock).hash), undefined);
    await invalid.close();
  }
  assert.equal(logs.length, 3);
  assert.ok(logs.every(entry => entry.event === 'selection_recovery_failed' && entry.operation === 'read'));
  assert.equal(JSON.stringify(logs).includes('private-trip'), false);
  assert.equal(JSON.stringify(logs).includes(filePath), false);
});

test('a failed snapshot write preserves live records and the previous stored snapshot', async t => {
  const { directory, filePath, clock, logs, store } = await setup(t);
  const issued = record(clock);
  await store.remember([issued]);
  const moved = `${directory}-saved`;
  await rename(directory, moved);
  t.after(() => rm(moved, { recursive: true, force: true }));
  await writeFile(directory, 'blocks-directory-creation');
  const later = record(clock, 'later');
  assert.equal(await store.remember([later]), false);
  assert.deepEqual(await store.get(later.hash), later);
  assert.deepEqual(JSON.parse(await readFile(path.join(moved, path.basename(filePath)), 'utf8')).records, [issued]);
  assert.equal(logs.at(-1).operation, 'write');
});
