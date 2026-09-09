import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/reset-provider.mjs', import.meta.url));
const blocked = { version: 1, disabled: true, cooldownUntil: 123456, cooldownReason: 'unavailable' };

for (const mode of ['refused', 'environment', 'dotenv']) {
  test(`provider reset ${mode}: explicit review and configured state path are respected`, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hotel-reset-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const statePath = path.join(directory, 'selected-state.json');
    const otherPath = path.join(directory, 'other-state.json');
    await writeFile(statePath, JSON.stringify(blocked));
    await writeFile(otherPath, JSON.stringify(blocked));
    await writeFile(path.join(directory, '.env'), `PROVIDER_STATE_FILE=${mode === 'dotenv' ? statePath : otherPath}\n`);
    const result = spawnSync(process.execPath, [script, ...(mode === 'refused' ? [] : ['--after-review'])], {
      cwd: directory, encoding: 'utf8', timeout: 5000,
      env: { PATH: process.env.PATH, ...(mode === 'dotenv' ? {} : { PROVIDER_STATE_FILE: statePath }) },
    });
    assert.equal(result.status, mode === 'refused' ? 1 : 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), mode === 'refused' ? blocked : { version: 1, disabled: false, cooldownUntil: 0 });
    assert.deepEqual(JSON.parse(await readFile(otherPath, 'utf8')), blocked);
  });
}
