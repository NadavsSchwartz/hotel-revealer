import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export interface ProviderState { version: 1; disabled: boolean; cooldownUntil: number; cooldownReason?: 'unavailable' }
export interface ProviderStateStore { read(): Promise<ProviderState>; write(value: ProviderState): Promise<void> }
export const cleanState = (): ProviderState => ({ version: 1, disabled: false, cooldownUntil: 0 });

function validateState(value: unknown): ProviderState {
  if (
    !isRecord(value) || value.version !== 1 ||
    typeof value.disabled !== 'boolean' ||
    typeof value.cooldownUntil !== 'number' || !Number.isFinite(value.cooldownUntil) ||
    value.cooldownUntil < 0 || value.cooldownUntil > 8_640_000_000_000_000 ||
    (value.cooldownReason !== undefined && value.cooldownReason !== 'unavailable')
  ) throw new Error('Invalid provider state');
  return { version: 1, disabled: value.disabled, cooldownUntil: value.cooldownUntil,
    ...(value.cooldownReason ? { cooldownReason: value.cooldownReason } : {}) };
}

export function createFileStateStore(filePath = process.env.PROVIDER_STATE_FILE || path.resolve('var/provider-state.json')): ProviderStateStore {
  return {
    async read() {
      try {
        return validateState(JSON.parse(await readFile(filePath, 'utf8')));
      } catch (error) {
        if (isRecord(error) && error.code === 'ENOENT') return cleanState();
        // A corrupt/unreadable state file cannot silently remove a block.
        throw new Error('Provider state could not be read', { cause: error });
      }
    },
    async write(value) {
      const state = validateState(value);
      await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      try {
        const handle = await open(temporary, 'wx', 0o600);
        try {
          await handle.writeFile(`${JSON.stringify(state)}\n`);
          await handle.sync();
        } finally { await handle.close(); }
        await rename(temporary, filePath);
        if (state.disabled) {
          const directory = await open(path.dirname(filePath), 'r');
          try { await directory.sync(); } finally { await directory.close(); }
        }
        // When restoring availability, rename must be the last fallible step.
        // Metadata rollback can retain the earlier disabled record safely;
        // a failure after installing clean state must not report a lost block.
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },
  };
}

export function createMemoryStateStore(initial = cleanState()): ProviderStateStore {
  let state = validateState(initial);
  return {
    async read() { return { ...state }; },
    async write(value) { state = validateState(value); },
  };
}

// Reset is an operator operation; it is never exposed over HTTP. Restart after use.
export async function resetProviderState({ stateStore = createFileStateStore() }: { stateStore?: ProviderStateStore } = {}) {
  await stateStore.write(cleanState());
}

export function retryAfterDeadline(value: string | number | null | undefined, now: number) {
  const seconds = typeof value === 'number' ? value : /^\s*\d+(?:\.\d+)?\s*$/.test(value || '') ? Number(value) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(8_640_000_000_000_000, now + Math.max(1_000, seconds * 1_000));
  const date = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(date) && date > now ? date : now + 60_000;
}
