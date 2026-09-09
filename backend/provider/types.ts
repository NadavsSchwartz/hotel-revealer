import type { TripContext } from '../../shared/contracts.ts';

export type ProviderTimer = ReturnType<typeof setTimeout> | number;
export interface ProviderClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): ProviderTimer;
  clearTimeout(timer: ProviderTimer): void;
}
export interface ProviderLogger {
  info?(entry: unknown): void;
  error?(entry: unknown): void;
}
export type HoldWork = (operation: Promise<unknown>) => void;
export interface RequestOptions {
  requestId?: string;
  admitUpstream?: () => void;
  holdWork?: HoldWork;
}
export interface ProviderParameters {
  listingsPage: { context: TripContext; cursor: string | null };
  hotelDetails: { context: TripContext; offerId: string; hotelId?: string };
}
// Adapter payloads are untrusted until the service normalizes their runtime fields.
export type ProviderOperations = {
  [Method in keyof ProviderParameters]: (parameters: ProviderParameters[Method] & { signal: AbortSignal }) => Promise<unknown>;
};
export type ProviderAdapter = ProviderOperations & {
  originalOfferUrl?(parameters: { context: TripContext; offerId: string; cityId: string }): string | null;
};
