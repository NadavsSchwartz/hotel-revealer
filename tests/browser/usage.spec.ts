import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { UsageEvent } from '../../shared/usage.ts';
import { detailResponse, mockOffers, searchPath, searchResponse } from './fixtures.ts';

async function captureUsage(page: Page, fail = false) {
  const events: UsageEvent[] = [];
  await page.route('**/api/v1/usage', route => {
    expect(route.request().headers().referer).toBeUndefined();
    events.push(route.request().postDataJSON() as UsageEvent);
    return fail ? route.abort('failed') : route.fulfill({ status: 204 });
  });
  return events;
}

test('a measured search, details and keyboard/middle handoffs contain only categories and random identifiers', async ({ page, context }, testInfo) => {
  const events = await captureUsage(page);
  await mockOffers(page);
  await context.route('https://www.priceline.com/**', route => route.fulfill({ body: 'Synthetic provider destination' }));
  await page.goto(searchPath);
  await expect(page.getByRole('link', { name: 'View hotel details', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View hotel details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: /View deal on Priceline/ });
  await link.focus();
  const keyboardPopup = context.waitForEvent('page');
  await page.keyboard.press('Enter');
  await (await keyboardPopup).close();
  const middlePopup = context.waitForEvent('page');
  await link.click({ button: 'middle' });
  await (await middlePopup).close();
  await expect.poll(() => events.length).toBe(8);
  expect(events.filter(event => event.action === 'page_view').map(event => event.page)).toEqual(['results', 'detail']);
  expect(events.filter(event => event.action === 'search_started')).toHaveLength(1);
  expect(events.filter(event => event.action === 'search_succeeded')).toMatchObject([{ coverage: 'complete', resultCount: 1 }]);
  expect(events.filter(event => event.action === 'detail_started')).toHaveLength(1);
  expect(events.filter(event => event.action === 'detail_succeeded')).toMatchObject([{ detailStatus: 'unavailable', quoteStatus: 'unavailable' }]);
  expect(events.filter(event => event.action === 'provider_handoff')).toHaveLength(2);
  expect(new Set(events.map(event => event.browserId)).size).toBe(1);
  expect(new Set(events.map(event => event.sessionId)).size).toBe(1);
  expect(new Set(events.map(event => event.eventId)).size).toBe(events.length);
  const baseKeys = ['version', 'eventId', 'browserId', 'sessionId', 'action', 'page', 'device', 'source', 'traffic'];
  for (const event of events) {
    const outcomeKeys = event.action === 'search_succeeded' ? ['coverage', 'resultCount']
      : event.action === 'detail_succeeded' ? ['detailStatus', 'quoteStatus'] : [];
    expect(Object.keys(event).sort()).toEqual([...baseKeys, ...outcomeKeys].sort());
    expect(event).toMatchObject({ version: 1, traffic: 'automated', source: 'direct', device: testInfo.project.name === 'mobile' ? 'mobile' : 'desktop' });
    for (const identifier of [event.browserId, event.sessionId, event.eventId]) expect(identifier).toMatch(/^[0-9a-f-]{36}$/);
  }
  expect(JSON.stringify(events)).not.toMatch(/Juniper|Las Vegas|offer-one|hotel-one|checkIn|childrenAges|priceline\.com|geonames/);
});

test('session identity and referral category survive routes/reloads and expire independently of the browser identifier', async ({ page }) => {
  const events = await captureUsage(page);
  await page.goto('/', { referer: 'https://www.google.com/search?q=private-search' });
  await expect.poll(() => events.length).toBe(1);
  const first = events[0];
  expect(first.source).toBe('search');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.getByText('Allow usage measurement', { exact: true })).toHaveCount(0);
  // Let the route render and measure before replacing its document on reload.
  await expect.poll(() => events.map(event => event.page)).toEqual(['home', 'privacy']);
  await page.reload();
  await expect.poll(() => events.length).toBe(3);
  expect(events.every(event => event.browserId === first.browserId && event.sessionId === first.sessionId && event.source === 'search')).toBe(true);
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem('hotel-revealer-usage-session') ?? '{}') as Record<string, unknown>;
    session.lastActivity = Date.now() - 31 * 60_000;
    sessionStorage.setItem('hotel-revealer-usage-session', JSON.stringify(session));
  });
  await page.reload();
  await expect.poll(() => events.length).toBe(4);
  expect(events[3].browserId).toBe(first.browserId);
  expect(events[3].sessionId).not.toBe(first.sessionId);
  await page.evaluate(() => {
    const browser = JSON.parse(localStorage.getItem('hotel-revealer-usage-browser') ?? '{}') as Record<string, unknown>;
    browser.expiresAt = Date.now() - 1;
    localStorage.setItem('hotel-revealer-usage-browser', JSON.stringify(browser));
  });
  await page.reload();
  await expect.poll(() => events.length).toBe(5);
  expect(events[4].browserId).not.toBe(first.browserId);
  expect(events[4].sessionId).not.toBe(events[3].sessionId);
});

for (const mode of ['DNT', 'GPC', 'blocked-local-storage', 'blocked-session-storage'] as const) {
  test(`${mode} disables usage measurement while search remains usable`, async ({ page }) => {
    await page.addInitScript(setting => {
      if (setting === 'DNT') Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' });
      else if (setting === 'GPC') Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
      else Object.defineProperty(window, setting === 'blocked-local-storage' ? 'localStorage' : 'sessionStorage', {
        get: () => { throw new DOMException('Blocked for privacy', 'SecurityError'); },
      });
    }, mode);
    const events = await captureUsage(page);
    await mockOffers(page);
    await page.goto(searchPath);
    await expect(page.getByRole('link', { name: 'View hotel details', exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(events).toEqual([]);
  });
}

test('usage request failures do not break search or hotel details and do not retry', async ({ page }) => {
  const events = await captureUsage(page, true);
  await mockOffers(page);
  await page.goto(searchPath);
  await page.getByRole('link', { name: 'View hotel details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect.poll(() => events.filter(event => event.action.endsWith('_succeeded')).length).toBe(2);
  await page.waitForLoadState('networkidle');
  expect(events).toHaveLength(6);
  expect(events.filter(event => event.action.endsWith('_succeeded'))).toHaveLength(2);
});

test('invalid responses are failures, and validated partial searches count visible matches', async ({ page }) => {
  const events = await captureUsage(page);
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: { offers: [] } }));
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'We couldn’t read the hotel information', exact: true })).toBeVisible();
  await expect.poll(() => events.filter(event => event.action === 'search_failed').length).toBe(1);
  expect(events.filter(event => event.action === 'search_succeeded')).toEqual([]);
  const partial = searchResponse({ offers: [], coverage: { status: 'partial', reason: 'Page limit', pagesFetched: 1, offersFound: 0, namedHotelsChecked: 0, unassessedHotels: 0 } });
  await page.unroute('**/api/v1/hotelDeals');
  await mockOffers(page, partial);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No hotel matches found', exact: true })).toBeVisible();
  await expect.poll(() => events.filter(event => event.action === 'search_succeeded').length).toBe(1);
  expect(events.find(event => event.action === 'search_succeeded')).toMatchObject({ coverage: 'partial', resultCount: 0 });
});

test('unavailable and invalid hotel details have distinct measured outcomes', async ({ page }) => {
  const events = await captureUsage(page);
  await mockOffers(page);
  await page.unroute('**/api/v1/deal');
  await page.route('**/api/v1/deal', route => route.fulfill({ json: { ...detailResponse(), context: { invalid: true } } }));
  await page.goto(searchPath);
  await page.getByRole('link', { name: 'View hotel details', exact: true }).click();
  await expect.poll(() => events.filter(event => event.action === 'detail_failed').length).toBe(1);
  expect(events.filter(event => event.action === 'detail_succeeded')).toEqual([]);
});
