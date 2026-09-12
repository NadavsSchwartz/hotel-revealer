import { USAGE_SOURCES } from '../../../shared/usage.ts';
import type { UsageEvent } from '../../../shared/usage.ts';

const browserKey = 'hotel-revealer-usage-browser';
const sessionKey = 'hotel-revealer-usage-session';
const preferenceKey = 'hotel-revealer-usage-allowed';
const internalKey = 'hotel-revealer-usage-internal';
const browserLifetime = 30 * 24 * 60 * 60_000;
const sessionLifetime = 30 * 60_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let disabledForVisit = false;

type Measurement = { page?: UsageEvent['page'] } & (
  | { action: Exclude<UsageEvent['action'], 'search_succeeded' | 'detail_succeeded'> }
  | { action: 'search_succeeded'; coverage: NonNullable<UsageEvent['coverage']>; resultCount: number }
  | { action: 'detail_succeeded'; detailStatus: NonNullable<UsageEvent['detailStatus']>; quoteStatus: NonNullable<UsageEvent['quoteStatus']> }
);

export interface UsagePreferences {
  allowed: boolean;
  internal: boolean;
  blocked: 'privacy-signal' | 'storage' | null;
}

function privacySignal() {
  const browser = window.navigator as Navigator & { globalPrivacyControl?: boolean };
  const legacy = window as Window & { doNotTrack?: string };
  return browser.globalPrivacyControl === true || browser.doNotTrack === '1' ||
    browser.doNotTrack === 'yes' || legacy.doNotTrack === '1';
}

function checkStorage(storage: Storage) {
  const key = 'hotel-revealer-usage-storage-check';
  storage.setItem(key, '1');
  storage.removeItem(key);
}

export function readUsagePreferences(): UsagePreferences {
  if (typeof window === 'undefined') return { allowed: false, internal: false, blocked: 'storage' };
  try {
    const internal = window.localStorage.getItem(internalKey) === 'true';
    if (privacySignal()) return { allowed: false, internal, blocked: 'privacy-signal' };
    checkStorage(window.localStorage);
    checkStorage(window.sessionStorage);
    return { allowed: !disabledForVisit && window.localStorage.getItem(preferenceKey) !== 'false', internal, blocked: null };
  } catch {
    return { allowed: false, internal: false, blocked: 'storage' };
  }
}

export function setUsageAllowed(allowed: boolean): UsagePreferences {
  disabledForVisit = !allowed;
  try {
    window.localStorage.setItem(preferenceKey, String(allowed));
    if (!allowed) {
      window.localStorage.removeItem(browserKey);
      window.sessionStorage.removeItem(sessionKey);
    }
  } catch {
    disabledForVisit = true;
  }
  return readUsagePreferences();
}

export function setUsageInternal(internal: boolean): UsagePreferences {
  try {
    window.localStorage.setItem(internalKey, String(internal));
    if (internal) trackUsage({ action: 'internal_marked' });
  } catch {
    disabledForVisit = true;
  }
  return readUsagePreferences();
}

export function usagePage(pathname: string): UsageEvent['page'] {
  const pages: Record<string, UsageEvent['page']> = {
    '/': 'home', '/results': 'results', '/deal': 'detail',
    '/privacy': 'privacy', '/terms': 'terms', '/credits': 'credits',
  };
  return pages[pathname] ?? 'other';
}

function referralSource(): UsageEvent['source'] {
  if (!document.referrer) return 'direct';
  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === window.location.origin) return 'internal';
    const host = referrer.hostname;
    if (/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|search\.brave\.com|yandex\.[a-z.]+)$/.test(host)) return 'search';
    if (/(^|\.)(facebook\.com|instagram\.com|linkedin\.com|reddit\.com|t\.co|twitter\.com|x\.com|youtube\.com|tiktok\.com|threads\.net|bsky\.app)$/.test(host)) return 'social';
    if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
    return 'external';
  } catch {
    return 'external';
  }
}

function storedRecord(value: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null');
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

// The caller never awaits measurement: storage, network and serialization failures
// must not change a search, its result, or a provider navigation.
export function trackUsage(measurement: Measurement): void {
  try {
    const preferences = readUsagePreferences();
    if (!preferences.allowed) return;
    // A bookmark can mark the owner's browser before its first measured visit.
    if (new URLSearchParams(window.location.search).get('usage') === 'internal') {
      window.localStorage.setItem(internalKey, 'true');
      preferences.internal = true;
    }
    const now = Date.now();
    const previousBrowser = storedRecord(window.localStorage.getItem(browserKey));
    const browser = typeof previousBrowser.id === 'string' && uuid.test(previousBrowser.id) &&
      typeof previousBrowser.expiresAt === 'number' && previousBrowser.expiresAt > now && previousBrowser.expiresAt <= now + browserLifetime
      ? { id: previousBrowser.id, expiresAt: previousBrowser.expiresAt }
      : { id: window.crypto.randomUUID(), expiresAt: now + browserLifetime };
    window.localStorage.setItem(browserKey, JSON.stringify(browser));
    const previousSession = storedRecord(window.sessionStorage.getItem(sessionKey));
    const session = previousSession.browserId === browser.id && typeof previousSession.id === 'string' && uuid.test(previousSession.id) &&
      typeof previousSession.lastActivity === 'number' && now - previousSession.lastActivity < sessionLifetime && previousSession.lastActivity <= now &&
      USAGE_SOURCES.includes(previousSession.source as UsageEvent['source'])
      ? { id: previousSession.id, source: previousSession.source as UsageEvent['source'] }
      : { id: window.crypto.randomUUID(), source: referralSource() };
    window.sessionStorage.setItem(sessionKey, JSON.stringify({ ...session, browserId: browser.id, lastActivity: now }));
    const payload: UsageEvent = {
      version: 1,
      eventId: window.crypto.randomUUID(),
      browserId: browser.id,
      sessionId: session.id,
      action: measurement.action,
      page: measurement.page ?? usagePage(window.location.pathname),
      device: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
      source: session.source,
      traffic: preferences.internal ? 'internal' : window.navigator.webdriver ? 'automated' : 'browser',
    };
    if (measurement.action === 'search_succeeded') {
      payload.coverage = measurement.coverage;
      payload.resultCount = measurement.resultCount;
    } else if (measurement.action === 'detail_succeeded') {
      payload.detailStatus = measurement.detailStatus;
      payload.quoteStatus = measurement.quoteStatus;
    }
    void window.fetch('/api/v1/usage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), keepalive: true, referrerPolicy: 'no-referrer',
    }).catch(() => {});
  } catch {
    // Best effort only. In particular, storage may become blocked between reads.
  }
}
