import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { loadSearch, travelerReducer } from './state.ts';
import { contextKey } from './context.ts';
import { setUsageInternal, trackUsage } from './usage.ts';
import type { UsageEvent } from '../../../shared/usage.ts';
import type { SearchResponse, TripContext } from '../../../shared/contracts.ts';
import type { TravelerAction } from './state.ts';

const trip: TripContext = {
  destinationId: 'geonames:5506956', cityName: 'Las Vegas, Nevada', checkIn: '2027-01-10', checkOut: '2027-01-12',
  rooms: 1, adults: 2, childrenAges: [], currency: 'USD',
};
const response: SearchResponse = {
  context: trip, offers: [], retrievedAt: '2027-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:05:00.000Z',
  coverage: { status: 'complete', reason: null, pagesFetched: 1, offersFound: 0, namedHotelsChecked: 0, unassessedHotels: 0 },
};

function fakeBrowser(t: TestContext) {
  const events: UsageEvent[] = [];
  const storage = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: storage(), sessionStorage: storage(), crypto: globalThis.crypto,
    navigator: { webdriver: false }, location: { pathname: '/results', search: '', origin: 'http://localhost' }, innerWidth: 1280,
    fetch: (_path: string, options: RequestInit) => {
      events.push(JSON.parse(String(options.body)) as UsageEvent);
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { referrer: '' } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  return events;
}

test('measurement outside a browser is a no-op', t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => { requests++; return Promise.reject(new Error('Unexpected request')); });
  trackUsage({ action: 'page_view', page: 'home' });
  assert.equal(requests, 0);
});

test('a superseded response that ignores abort cannot become a measured success or failure', async t => {
  const events = fakeBrowser(t);
  let resolveFirst!: (response: Response) => void;
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    return requests === 1 ? new Promise<Response>(resolve => { resolveFirst = resolve; }) : Promise.resolve(Response.json(response));
  });
  let state = travelerReducer(undefined, { type: 'unknown' });
  const dispatch = (action: TravelerAction) => { state = travelerReducer(state, action); };
  const first = loadSearch(trip)(dispatch, () => state);
  await loadSearch(trip)(dispatch, () => state);
  resolveFirst(Response.json(response));
  await first;
  assert.deepEqual(events.map(event => event.action), ['search_started', 'search_started', 'search_succeeded']);
  assert.equal(events[2].resultCount, 0);
  assert.equal(state.search.status, 'success');
});

test('cooldown suppression creates neither a network request nor a measured attempt', async t => {
  const events = fakeBrowser(t);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Cooldown should suppress fetch'); });
  const key = contextKey(trip);
  let state = travelerReducer(undefined, { type: 'search/start', key, requestId: 1 });
  state = travelerReducer(state, { type: 'search/error', key, requestId: 1,
    error: { code: 'PROVIDER_COOLDOWN', retryAt: new Date(Date.now() + 60_000).toISOString() } });
  await loadSearch(trip)(action => { state = travelerReducer(state, action); }, () => state);
  assert.deepEqual(events, []);
});

test('an actual request timeout is measured as a failure', async t => {
  const events = fakeBrowser(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_path: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  }));
  let state = travelerReducer(undefined, { type: 'unknown' });
  const pending = loadSearch(trip)(action => { state = travelerReducer(state, action); }, () => state);
  t.mock.timers.tick(30001);
  await pending;
  assert.deepEqual(events.map(event => event.action), ['search_started', 'search_failed']);
  assert.equal(state.search.error?.code, 'DEADLINE_EXCEEDED');
});

test('marking internal activity emits immediately but never overrides opt-out or privacy signals', t => {
  const events = fakeBrowser(t);
  setUsageInternal(true);
  assert.deepEqual(events.map(event => event.action), ['internal_marked']);
  assert.equal(events[0].traffic, 'internal');
  setUsageInternal(false);
  assert.equal(events.length, 1);
  window.localStorage.setItem('hotel-revealer-usage-allowed', 'false');
  setUsageInternal(true);
  assert.equal(events.length, 1);
  window.localStorage.removeItem('hotel-revealer-usage-allowed');
  Object.assign(window.navigator, { doNotTrack: '1' });
  setUsageInternal(true);
  assert.equal(events.length, 1);
  Object.assign(window.navigator, { doNotTrack: '0', globalPrivacyControl: true });
  setUsageInternal(true);
  assert.equal(events.length, 1);
});
