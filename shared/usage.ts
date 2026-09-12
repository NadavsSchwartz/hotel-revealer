// First-party usage payloads contain categories and random identifiers only.
// Never add URLs, trip parameters, hotel/offer IDs, free text, IPs or full user agents.
export const USAGE_ACTIONS = ['page_view', 'search_started', 'search_succeeded', 'search_failed',
  'detail_started', 'detail_succeeded', 'detail_failed', 'provider_handoff', 'internal_marked'] as const;
export const USAGE_PAGES = ['home', 'results', 'detail', 'privacy', 'terms', 'credits', 'other'] as const;
export const USAGE_DEVICES = ['mobile', 'tablet', 'desktop'] as const;
export const USAGE_SOURCES = ['direct', 'search', 'social', 'github', 'external', 'internal'] as const;
export const USAGE_TRAFFIC = ['browser', 'internal', 'automated'] as const;
// Matches the domain's MAX_MATCH_CANDIDATES bound; large valid searches must be measurable.
export const MAX_USAGE_RESULTS = 5_000;
export type UsageAction = typeof USAGE_ACTIONS[number];
export interface UsageEvent {
  version: 1;
  eventId: string;
  browserId: string;
  sessionId: string;
  action: UsageAction;
  page: typeof USAGE_PAGES[number];
  device: typeof USAGE_DEVICES[number];
  source: typeof USAGE_SOURCES[number];
  traffic: typeof USAGE_TRAFFIC[number];
  // Only successful search/detail events may supply their relevant outcome fields.
  coverage?: 'complete' | 'partial';
  resultCount?: number;
  detailStatus?: 'available' | 'unavailable' | 'not_requested';
  quoteStatus?: 'available' | 'unavailable';
}
export interface UsageRecord extends UsageEvent { timestamp: string }
