import { test, expect } from '@playwright/test';
import { context, searchPath, searchResponse } from './fixtures.js';

test('maximum-length offer IDs keep pagination and reload usable', async ({ page }) => {
  const data = searchResponse();
  data.offers = Array.from({ length: 18 }, (_, index) => ({
    ...data.offers[0], offerId: `${'A'.repeat(1020)}${index.toString(16).padStart(4, '0')}`,
  }));
  let searches = 0;
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: data }); });
  await page.goto(searchPath);
  await expect(page.locator('.offer-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.offer-card')).toHaveCount(6);
  expect(page.url().length).toBeLessThan(2000);
  expect(new URL(page.url()).searchParams.has('expanded')).toBe(false);
  expect(searches).toBe(1);
  const response = await page.reload();
  expect(response.status()).toBe(200);
  await expect(page.getByRole('link', { name: /View likely hotel:/ })).toHaveCount(6);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.getByRole('link', { name: /View likely hotel:/ })).toHaveCount(12);
  expect(searches).toBe(2);
});

test('an old expanded link drops retired comparison state without refetching', async ({ page }) => {
  let searches = 0;
  const data = searchResponse();
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: data }); });
  await page.goto(`${searchPath}&sort=price&expanded=${data.offers[0].offerId}`);
  await expect(page.getByRole('link', { name: /View likely hotel:/ })).toBeVisible();
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
  await page.getByRole('button', { name: 'Update prices', exact: true }).click();
  await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Update prices', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Check current price on Priceline/ })).toBeVisible();
  const edit = page.getByRole('button', { name: 'Edit trip', exact: true });
  if (await edit.isVisible()) await edit.click();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Update prices', exact: true })).toBeEnabled();
  expect(searches).toBe(2);
  await page.getByRole('button', { name: 'Update prices', exact: true }).click();
  await expect.poll(() => searches).toBe(3);
  await expect(page.getByRole('link', { name: /Check (current )?price on Priceline/ })).toBeVisible();
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
  await page.locator(`.travel-calendar-popup:visible [data-day="${tripB.checkOut}"] button`).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 hotel deal', exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: '1 hotel deal', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The provider needs a short pause', exact: true })).toHaveCount(0);
  expect(requests).toEqual([context, tripB, context]);
});

test('old search response formats require an explicit refresh before displaying a hotel', async ({ page }) => {
  const old = searchResponse();
  delete old.offers[0].resolution;
  let calls = 0;
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: ++calls === 1 ? old : searchResponse() }));
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'We could not verify this response', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View likely hotel:/ })).toHaveCount(0);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Refresh search', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

test('a fresh offer without a listing rate still offers the current supplier price', async ({ page }) => {
  const data = searchResponse();
  data.offers[0].quote = { nightlyCents: null, stayCents: null, currency: 'USD', taxesFees: 'unknown' };
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: data }));
  await page.goto(searchPath);
  await expect(page.getByText('Rate unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Check current price on Priceline/ })).toHaveAttribute('href', data.offers[0].handoffUrl);
  await expect(page.locator('.booking-note')).toHaveText('Check current price and terms on Priceline.');
});

test('result cards keep one fee-aware booking note, including when the offer link is missing', async ({ page }) => {
  const data = searchResponse();
  const originalQuote = data.offers[0].quote;
  const originalLink = data.offers[0].handoffUrl;
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: data }));
  for (const { quote, link = originalLink, note } of [
    { quote: { taxesFees: 'excluded' }, note: 'Before taxes and fees; check final price and terms on Priceline.' },
    { quote: { taxesFees: 'included' }, note: 'Taxes and fees included; check final price and terms on Priceline.' },
    { quote: { taxesFees: 'unknown', totalCents: 27900, totalTaxesFees: 'included' }, note: 'Taxes and fees included; check final price and terms on Priceline.' },
    { quote: { taxesFees: 'unknown' }, link: null, note: 'Taxes and fees unconfirmed; original offer link unavailable.' },
  ]) {
    data.offers[0].quote = { ...originalQuote, ...quote };
    data.offers[0].handoffUrl = link;
    await page.goto(searchPath);
    await expect(page.locator('.offer-booking .provider-handoff > p')).toHaveText(note);
    await expect(page.locator('.quote-taxes')).toHaveCount(0);
    if (quote.totalCents) {
      await expect(page.locator('.quote-price')).toHaveText('$279 total');
      await expect(page.locator('.offer-booking .quote-stay')).not.toContainText('Taxes & fees included');
    }
    if (!link) await expect(page.getByRole('button', { name: 'Original offer unavailable' })).toBeDisabled();
  }
});
