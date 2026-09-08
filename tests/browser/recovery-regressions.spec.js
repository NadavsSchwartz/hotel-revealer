import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { context, detailResponse, searchPath, searchResponse } from './fixtures.js';

const detailPath = `/deal?${new URLSearchParams({ ...context, offerId: 'offer-one', hotelId: 'hotel-one' })}`;

function populatedDetail(now) {
  const data = detailResponse();
  data.detailStatus = 'available';
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
  const handoff = page.getByRole('link', { name: /View original Express offer/ });
  await expect(heading).toBeVisible();
  await expect(photo).toBeVisible();
  await page.clock.fastForward(61000);
  await page.getByRole('button', { name: 'Refresh total price', exact: true }).click();
  try {
    await expect.poll(() => calls).toBe(2);
    await expect(page.getByText('Loading hotel details…', { exact: true })).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(photo).toBeVisible();
    await expect(handoff).toHaveAttribute('href', data.offer.handoffUrl);
  } finally { release(); }
  await expect(page.getByRole('region', { name: 'Search status' })).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(photo).toBeVisible();
  await expect(page.getByText(data.details.description, { exact: true })).toBeVisible();
  await expect(handoff).toHaveAttribute('href', data.offer.handoffUrl);
  await expect(page.getByText('The quoted price needs a refresh.', { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

test('browser Forward cannot restore a candidate excluded by newer results while detail validation is pending', async ({ page }) => {
  const now = Date.now();
  const initial = searchResponse({ expiresAt: new Date(now - 1000).toISOString() });
  const refreshed = searchResponse();
  refreshed.offers[0].candidates = [refreshed.offers[0].candidates[1]];
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
  await page.getByRole('link', { name: 'View possible hotel: Juniper House', exact: true }).click();
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Refresh search', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View possible hotel: Juniper House', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View possible hotel: Desert House', exact: true })).toBeVisible();
  await page.goForward();
  try {
    await expect.poll(() => details).toBe(2);
    await expect(page.getByText('Loading hotel details…', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: /property photograph/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /View original Express offer/ })).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'This match needs a fresh search', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toHaveCount(0);
  expect(searches).toBe(2);
});

test('retained detail data honors cooldown across every price refresh and return-to-results search', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const data = populatedDetail(now);
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
  for (const name of ['Refresh total price', 'Refresh retail price', 'Refresh Express offers']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(page.getByRole('heading', { name: 'The provider needs a short pause', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  expect(details).toBe(2);
  expect(searches).toBe(0);
});
