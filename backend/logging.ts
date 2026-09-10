import { isRecord } from './domain/validation.ts';
import type { ProviderLogger } from './provider/types.ts';

function write(level: 'info' | 'error', entry: unknown) {
  try {
    const fields = isRecord(entry) ? entry : { event: 'invalid_log_entry' };
    console[level](JSON.stringify({ ...fields, timestamp: new Date().toISOString(), level }));
  } catch { /* Logging must not change application availability. */ }
}

export const jsonLogger = {
  info: (entry: unknown) => write('info', entry),
  error: (entry: unknown) => write('error', entry),
} satisfies ProviderLogger;
