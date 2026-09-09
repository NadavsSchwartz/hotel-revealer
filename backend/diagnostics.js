import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderFailure, ServiceError, providerDiagnostic } from './provider/errors.js';

const root = fileURLToPath(new URL('../', import.meta.url));
// Only filenames shipped with the app may appear in diagnostics, even if an
// error's message or stack contains fabricated frames with private text.
const sourceFiles = new Set(['backend', 'shared'].flatMap(directory =>
  readdirSync(path.join(root, directory), { recursive: true })
    .filter(file => /\.m?js$/.test(file) && !/\.test\./.test(file))
    .map(file => `${directory}/${file}`)));
const classes = [ServiceError, ProviderFailure, TypeError, RangeError, ReferenceError, SyntaxError, Error];
const systemCodes = new Set(['EACCES', 'EPERM', 'EIO', 'ENOSPC', 'EISDIR', 'ENOENT', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);

export function diagnostic(error, depth = 0) {
  const result = { name: classes.find(type => error instanceof type)?.name || 'UnknownError' };
  try {
    if (error instanceof ProviderFailure || error instanceof ServiceError) {
      const provider = providerDiagnostic(error.provider);
      if (Object.keys(provider).length) result.provider = provider;
    }
    if (systemCodes.has(error?.code)) result.code = error.code;
    const locations = [];
    if (typeof error?.stack === 'string') {
      for (const line of error.stack.slice(0, 8192).split('\n').slice(1, 20)) {
        const match = line.match(/^\s+at (?:[^()\n]* \()?((?:file:\/\/)?\/[^()\n]+):(\d+):(\d+)\)?$/);
        if (!match) continue;
        const filename = match[1].startsWith('file:') ? fileURLToPath(match[1]) : match[1];
        const file = path.relative(root, filename);
        if (sourceFiles.has(file)) locations.push({ file, line: Number(match[2]), column: Number(match[3]) });
        if (locations.length === 3) break;
      }
    }
    if (locations.length) result.locations = locations;
    if (depth < 2 && error?.cause !== undefined) result.cause = diagnostic(error.cause, depth + 1);
  } catch { /* An unreadable error must not affect a request. */ }
  return result;
}

export function requestRoute(req) {
  const path = req.path?.toLowerCase().replace(/\/$/, '');
  return ['/api/v1/hoteldeals', '/api/v1/deal', '/api/v1/destinations', '/health'].includes(path) ? path : 'other';
}
