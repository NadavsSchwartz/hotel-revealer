import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('an occupied port fails startup without a success event or raw error stack', async t => {
  const occupied = createServer();
  occupied.listen(0);
  await once(occupied, 'listening');
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], {
    env: { ...process.env, HOTEL_PROVIDER: 'disabled', NODE_ENV: 'test', PORT: String(occupied.address().port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const [code, signal] = await once(child, 'close', { signal: AbortSignal.timeout(10_000) }).catch(error => {
    error.message += `\nstdout: ${stdout}\nstderr: ${stderr}`;
    throw error;
  });
  assert.equal(signal, null);
  assert.equal(code, 1, stderr);
  assert.doesNotMatch(stdout, /server_started/);
  assert.match(stderr, /server_start_failed/);
  assert.match(stderr, /EADDRINUSE/);
  assert.doesNotMatch(stderr, /\n\s+at |node:events|Unhandled 'error'|\/Users\//);
});
