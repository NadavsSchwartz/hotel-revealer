import { test, expect } from '@playwright/test';
import { context, searchPath, searchResponse } from './fixtures.js';

test('expanding maximum-length offer IDs keeps reload and page restoration usable', async ({ page }) => {
  const data = searchResponse();
  data.offers = Array.from({ length: 18 }, (_, index) => ({
    ...data.offers[0], offerId: `${'A'.repeat(1020)}${index.toString(16).padStart(4, '0')}`,
  }));
  let searches = 0;
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: data }); });
  await page.goto(searchPath);
  await expect(page.locator('.offer-card')).toHaveCount(12);
  for (let index = 0; index < 12; index++)
    await page.getByRole('button', { name: 'Why these matches?', exact: true }).first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.offer-card')).toHaveCount(6);
  for (let index = 0; index < 6; index++)
    await page.getByRole('button', { name: 'Why these matches?', exact: true }).first().click();
  expect(page.url().length).toBeLessThan(2000);
  expect(new URL(page.url()).searchParams.has('expanded')).toBe(false);
  expect(searches).toBe(1);
  const response = await page.reload();
  expect(response.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Hide match details', exact: true })).toHaveCount(6);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide match details', exact: true })).toHaveCount(12);
  expect(searches).toBe(2);
});

test('an old expanded link migrates without refetching or losing the open comparison', async ({ page }) => {
  let searches = 0;
  const data = searchResponse();
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: data }); });
  await page.goto(`${searchPath}&sort=price&expanded=${data.offers[0].offerId}`);
  await expect(page.getByRole('button', { name: 'Hide match details', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('expanded')).toBe(false);
  await expect(page.getByLabel('Sort by')).toHaveValue('price');
  expect(searches).toBe(1);
});

test('all same-trip refresh controls honor cooldown and recover at its deadline', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  const data = searchResponse({ expiresAt: new Date(now - 1).toISOString() });
  let searches = 0;
  await page.route('**/api/v1/hotelDeals', route => {
    searches++;
    if (searches === 2) return route.fulfill({ status: 429, json: {
      error: { code: 'PROVIDER_COOLDOWN', retryAt: new Date(now + 60000).toISOString() },
    } });
    return route.fulfill({ json: { ...data, expiresAt: searches > 2 ? new Date(now + 300000).toISOString() : data.expiresAt } });
  });
  await page.goto(searchPath);
  await page.getByRole('button', { name: 'Refresh search', exact: true }).click();
  await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh search', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh Express offers', exact: true })).toBeDisabled();
  const edit = page.getByRole('button', { name: 'Edit trip', exact: true });
  if (await edit.isVisible()) await edit.click();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Refresh search', exact: true })).toBeEnabled();
  expect(searches).toBe(2);
  await page.getByRole('button', { name: 'Refresh search', exact: true }).click();
  await expect.poll(() => searches).toBe(3);
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toBeVisible();
});

test('returning to a cooling-down trip preserves its retry after expiry without an automatic request', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  const retryAt = new Date(now + 300000).toISOString();
  const nextDate = new Date(`${context.checkOut}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const tripB = { ...context, checkOut: nextDate.toISOString().slice(0, 10) };
  const requests = [];
  await page.route('**/api/v1/hotelDeals', route => {
    const input = route.request().postDataJSON();
    requests.push(input);
    return requests.length === 1
      ? route.fulfill({ status: 429, json: { error: { code: 'PROVIDER_COOLDOWN', retryAt } } })
      : route.fulfill({ json: searchResponse({ context: input }) });
  });
  await page.goto(searchPath);
  await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  const edit = page.getByRole('button', { name: 'Edit trip', exact: true });
  if (await edit.isVisible()) await edit.click();
  await page.getByRole('combobox', { name: 'Check-out', exact: true }).click();
  await page.locator(`.travel-calendar-popup:visible td[title="${tripB.checkOut}"] button`).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 Express offer', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'The provider needs a short pause', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  expect(requests).toEqual([context, tripB]);
  await page.clock.fastForward(301000);
  await expect(page.getByRole('heading', { name: 'The provider needs a short pause', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
  await expect(page.locator('.results-page > [role="status"]')).toHaveText('The provider pause has ended. You can try this search again.');
  expect(requests).toEqual([context, tripB]);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 Express offer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The provider needs a short pause', exact: true })).toHaveCount(0);
  expect(requests).toEqual([context, tripB, context]);
});
