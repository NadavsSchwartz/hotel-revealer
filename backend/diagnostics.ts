import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderFailure, ServiceError, providerDiagnostic } from './provider/errors.ts';
import type { ProviderDiagnostic } from './provider/errors.ts';

export interface Diagnostic {
  name: string;
  provider?: ProviderDiagnostic;
  code?: string;
  locations?: { file: string; line: number; column: number }[];
  cause?: Diagnostic;
}

const root = fileURLToPath(new URL('../', import.meta.url));
// Only filenames shipped with the app may appear in diagnostics, even if an
// error's message or stack contains fabricated frames with private text.
const sourceFiles = new Set(['backend', 'shared'].flatMap(directory =>
  readdirSync(path.join(root, directory), { recursive: true, encoding: 'utf8' })
    .filter(file => /\.(?:m?js|m?ts)$/.test(file) && !/\.(?:test|d)\./.test(file))
    .map(file => `${directory}/${file}`)));
const classes = [ServiceError, ProviderFailure, TypeError, RangeError, ReferenceError, SyntaxError, Error];
const systemCodes = new Set(['EACCES', 'EPERM', 'EIO', 'ENOSPC', 'EISDIR', 'ENOENT', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);

export function diagnostic(error: unknown, depth = 0): Diagnostic {
  const result: Diagnostic = { name: classes.find(type => error instanceof type)?.name || 'UnknownError' };
  try {
    if (error instanceof ProviderFailure || error instanceof ServiceError) {
      const provider = providerDiagnostic(error.provider);
      if (Object.keys(provider).length) result.provider = provider;
    }
    const properties = error !== null && (typeof error === 'object' || typeof error === 'function') ? error : {};
    if ('code' in properties && typeof properties.code === 'string' && systemCodes.has(properties.code)) result.code = properties.code;
    const locations: NonNullable<Diagnostic['locations']> = [];
    if ('stack' in properties && typeof properties.stack === 'string') {
      for (const line of properties.stack.slice(0, 8192).split('\n').slice(1, 20)) {
        const match = line.match(/^\s+at (?:[^()\n]* \()?((?:file:\/\/)?\/[^()\n]+):(\d+):(\d+)\)?$/);
        if (!match) continue;
        const filename = match[1].startsWith('file:') ? fileURLToPath(match[1]) : match[1];
        const file = path.relative(root, filename);
        if (sourceFiles.has(file)) locations.push({ file, line: Number(match[2]), column: Number(match[3]) });
        if (locations.length === 3) break;
      }
    }
    if (locations.length) result.locations = locations;
    if (depth < 2 && 'cause' in properties && properties.cause !== undefined) result.cause = diagnostic(properties.cause, depth + 1);
  } catch { /* An unreadable error must not affect a request. */ }
  return result;
}

export function requestRoute(req: { path?: string }) {
  const path = req.path?.toLowerCase().replace(/\/$/, '');
  return path && ['/api/v1/hoteldeals', '/api/v1/deal', '/api/v1/destinations', '/health'].includes(path) ? path : 'other';
}
