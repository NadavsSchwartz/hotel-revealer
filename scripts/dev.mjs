import 'dotenv/config';
import { spawn } from 'node:child_process';

const env = { ...process.env, NODE_ENV: 'development' };
const children = [
  spawn(process.execPath, ['--watch', 'backend/server.js'], {
    stdio: 'inherit', env,
  }),
  spawn('npm', ['run', 'dev', '--workspace', 'frontend'], { stdio: 'inherit', env }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => stop(code || 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
