import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { context, detailResponse, openTripEditor, searchPath, searchResponse } from './fixtures.js';

const detailPath = `/deal?${new URLSearchParams({ ...context, offerId: 'offer-one', hotelId: 'hotel-one' })}`;

function populatedDetail(now) {
  const data = detailResponse();
  data.detailStatus = 'available';
  data.quoteStatus = 'available';
  data.expiresAt = new Date(now + 60000).toISOString();
  data.offerExpiresAt = new Date(now + 300000).toISOString();
  data.offer.quoteExpiresAt = new Date(now + 60000).toISOString();
  data.offer.quote = { ...data.offer.quote, totalCents: 27000, totalTaxesFees: 'included', taxesFees: 'excluded' };
  data.details.images = ['https://images.priceline.com/synthetic-recovery/property.webp'];
  return data;
}

async function mockPhoto(page) {
  await page.route('https://images.priceline.com/**', route => route.fulfill({
    path: fileURLToPath(new URL('../../frontend/static/media/stay-hero.webp', import.meta.url)),
  }));
}

test('a failed same-selection price refresh retains property information and a fresh original handoff', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const data = populatedDetail(now);
  await mockPhoto(page);
  let calls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/deal', async route => {
    if (++calls === 1) return route.fulfill({ json: data });
    await pending;
    return route.fulfill({ status: 503, json: { error: { code: 'PROVIDER_UNAVAILABLE' } } });
  });
  await page.goto(detailPath);
  const heading = page.getByRole('heading', { name: 'Juniper House', exact: true });
  const photo = page.getByRole('img', { name: /property photograph 1/ });
  const handoff = page.getByRole('link', { name: /Check (current )?price on Priceline/ });
  await expect(heading).toBeVisible();
  await expect(photo).toBeVisible();
  await page.clock.fastForward(61000);
  await page.getByRole('button', { name: 'Refresh total price', exact: true }).click();
  try {
    await expect.poll(() => calls).toBe(2);
    await expect(page.getByText('Loading hotel details and total price…', { exact: true })).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(photo).toBeVisible();
    await expect(handoff).toHaveAttribute('href', data.offer.handoffUrl);
  } finally { release(); }
  await expect(page.getByRole('region', { name: 'Search status' })).toHaveCount(0);
  await expect(page.locator('.detail-quote-panel').getByText('We couldn’t update this price. Try again or check the current price on Priceline.', { exact: true })).toBeVisible();
  await expect(page.locator('.detail-quote-panel').getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(photo).toBeVisible();
  await expect(page.getByText(data.details.description, { exact: true })).toBeVisible();
  await expect(handoff).toHaveAttribute('href', data.offer.handoffUrl);
  await expect(page.getByText('The quoted price needs a refresh.', { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

test('a rejected selection offers one fresh-search recovery instead of retrying the rejected price', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const data = populatedDetail(now);
  await mockPhoto(page);
  let calls = 0;
  await page.route('**/api/v1/deal', route => ++calls === 1
    ? route.fulfill({ json: data })
    : route.fulfill({ status: 404, json: { error: { code: 'INVALID_SELECTION' } } }));
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: searchResponse() }));
  await page.goto(detailPath);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await page.clock.fastForward(61000);
  await page.getByRole('button', { name: 'Refresh total price', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'This match needs a fresh search', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Refresh total price|Retry total price|Try again/ })).toHaveCount(0);
  await expect(page.locator('.quote-price')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Check current price on Priceline/ })).toHaveAttribute('href', data.offer.handoffUrl);
  await page.getByRole('button', { name: 'Return to results', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

test('browser Forward cannot restore a candidate excluded by newer results while detail validation is pending', async ({ page }) => {
  const now = Date.now();
  const initial = searchResponse({ expiresAt: new Date(now - 1000).toISOString() });
  const refreshed = searchResponse();
  refreshed.offers[0].candidates = [{ ...refreshed.offers[0].candidates[0], hotelId: 'hotel-two', name: 'Desert House' }];
  const firstDetail = populatedDetail(now);
  await mockPhoto(page);
  let searches = 0;
  let details = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: ++searches === 1 ? initial : refreshed }));
  await page.route('**/api/v1/deal', async route => {
    if (++details === 1) return route.fulfill({ json: firstDetail });
    await pending;
    return route.fulfill({ status: 409, json: { error: { code: 'INVALID_SELECTION' } } });
  });
  await page.goto(searchPath);
  await page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true }).click();
  await expect(page.getByRole('link', { name: /Check (current )?price on Priceline/ })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Update prices', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View likely hotel: Desert House', exact: true })).toBeVisible();
  await page.goForward();
  try {
    await expect.poll(() => details).toBe(2);
    await expect(page.getByText('Loading hotel details and total price…', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: /property photograph/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Check (current )?price on Priceline/ })).toHaveAttribute('href', refreshed.offers[0].handoffUrl);
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'This match needs a fresh search', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Check (current )?price on Priceline/ })).toHaveAttribute('href', refreshed.offers[0].handoffUrl);
  expect(searches).toBe(2);
});

test('retained detail data honors cooldown across every price refresh and return-to-results search', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const data = populatedDetail(now);
  data.details.retailQuote = { nightlyCents: 15900, stayCents: 31800, currency: 'USD', taxesFees: 'included' };
  const retryAt = new Date(now + 601000).toISOString();
  await mockPhoto(page);
  let details = 0;
  let searches = 0;
  await page.route('**/api/v1/deal', route => ++details === 1
    ? route.fulfill({ json: data })
    : route.fulfill({ status: 429, json: { error: { code: 'PROVIDER_COOLDOWN', retryAt } } }));
  await page.route('**/api/v1/hotelDeals', route => {
    searches += 1;
    return route.fulfill({ status: 429, json: { error: { code: 'PROVIDER_COOLDOWN', retryAt } } });
  });
  await page.goto(detailPath);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await page.clock.fastForward(301000);
  await page.getByRole('button', { name: 'Refresh total price', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The provider needs a short pause', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh total price', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh retail price', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(page.getByRole('heading', { name: 'The provider needs a short pause', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  expect(details).toBe(2);
  expect(searches).toBe(0);
});

test('offer-only requests retry after connectivity loss and a newly matched response links to a separate hotel view', async ({ page }) => {
  const offer = searchResponse().offers[0];
  const unresolved = { ...offer, resolution: { status: 'unresolved', reason: 'no_match' }, candidates: [] };
  const requests = [];
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: searchResponse({ offers: [unresolved] }) }));
  await page.route('**/api/v1/deal', route => {
    const input = route.request().postDataJSON();
    requests.push(input);
    if (requests.length === 1) return route.abort('internetdisconnected');
    if (input.hotelId) return route.fulfill({ json: detailResponse() });
    return route.fulfill({ json: {
      ...detailResponse(), offer, candidate: null, details: null,
      detailStatus: 'not_requested', quoteStatus: 'unavailable',
    } });
  });
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'No hotel matches found', exact: true })).toBeVisible();
  await expect(page.locator('.offer-card')).toHaveCount(0);
  await page.goto(`/deal?${new URLSearchParams({ ...context, offerId: offer.offerId })}`);
  await expect(page.getByRole('heading', { name: 'We could not connect', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View the likely hotel', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
  await expect(page.locator('.detail-property-preview, .detail-retail')).toHaveCount(0);
  expect(requests).toEqual(Array.from({ length: 2 }, () => ({ ...context, offerId: offer.offerId })));
  await page.getByRole('link', { name: 'View the likely hotel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  expect(requests[2]).toEqual({ ...context, offerId: offer.offerId, hotelId: 'hotel-one' });
});

test('opening Priceline and returning after expiry preserves trip and handoff while withdrawing the total', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const detail = populatedDetail(now);
  detail.candidate = null;
  detail.details = null;
  detail.detailStatus = 'not_requested';
  let calls = 0;
  await page.route('**/api/v1/deal', route => { calls++; return route.fulfill({ json: detail }); });
  await page.context().route('https://www.priceline.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic supplier offer</h1>' }));
  const path = `/deal?${new URLSearchParams({ ...context, offerId: detail.offer.offerId })}`;
  await page.goto(path);
  await expect(page.locator('.quote-price')).toHaveText('$270 total');
  const popupEvent = page.waitForEvent('popup');
  await page.getByRole('link', { name: /Check price on Priceline/ }).click();
  const popup = await popupEvent;
  await expect(popup.getByRole('heading', { name: 'Synthetic supplier offer' })).toBeVisible();
  expect(popup.url()).toBe(detail.offer.handoffUrl);
  await page.clock.fastForward(61000);
  await popup.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.quote-price')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Check current price on Priceline/ })).toHaveAttribute('href', detail.offer.handoffUrl);
  await expect(page.getByRole('button', { name: 'Refresh total price', exact: true })).toBeEnabled();
  expect(new URL(page.url()).search).toBe(new URL(path, page.url()).search);
  expect(calls).toBe(1);
});

test('form edits survive an earlier response, and Back restores the completed original trip', async ({ page }) => {
  const requests = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', async route => {
    const input = route.request().postDataJSON();
    requests.push(input);
    if (requests.length === 1) await pending;
    await route.fulfill({ json: searchResponse({ context: input }) });
  });
  await page.goto(searchPath);
  await openTripEditor(page);
  await page.getByRole('button', { name: /^Travelers,/ }).click();
  await page.getByRole('button', { name: 'Increase adults', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  release();
  await expect(page.getByRole('heading', { name: '1 hotel deal', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Travelers, 3 guests · 1 room', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.locator('.results-page > .page-heading .trip-summary')).toContainText('3 adults');
  await page.goBack();
  await expect(page.locator('.results-page > .page-heading .trip-summary')).toContainText('2 adults');
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hotel search results' })).toHaveAttribute('aria-busy', 'false');
  expect(requests).toEqual([context, { ...context, adults: 3 }]);
});
