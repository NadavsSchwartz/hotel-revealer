import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

for (const mode of ['missing', 'file', 'shell']) {
  test(`environment loading stays quiet with ${mode} configuration`, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'hotel-env-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    if (mode !== 'missing') await writeFile(path.join(directory, '.env'), 'HOTEL_TEST_ENV_VALUE=from-file\n');
    const script = `import ${JSON.stringify(new URL('./env.ts', import.meta.url).href)};
      console.log(JSON.stringify({ value: process.env.HOTEL_TEST_ENV_VALUE ?? null }));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: directory, encoding: 'utf8', timeout: 5000,
      env: { PATH: process.env.PATH, ...(mode === 'shell' ? { HOTEL_TEST_ENV_VALUE: 'from-shell' } : {}) },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.trim(), JSON.stringify({ value: mode === 'missing' ? null : `from-${mode}` }));
  });
}
