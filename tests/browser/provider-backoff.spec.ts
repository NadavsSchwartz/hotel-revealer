import { present } from './fixtures.ts';
import { test, expect } from '@playwright/test';
import { queryParams, context, detailResponse, searchPath, searchResponse } from './fixtures.ts';

for (const [code, heading] of [
  ['PROVIDER_COOLDOWN', 'The provider needs a short pause'],
  ['PROVIDER_UNAVAILABLE', 'We couldn’t load hotel information'],
  ['PROVIDER_BUSY', 'The provider is busy'],
]) {
  test(`${code} search wait retains its reason and allows retry only after expiry`, async ({ page }) => {
    const now = Date.now();
    await page.clock.install({ time: now });
    const retryAt = new Date(now + 60_000).toISOString();
    let searches = 0;
    await page.route('**/api/v1/hotelDeals', route => ++searches === 1
      ? route.fulfill({ status: code === 'PROVIDER_COOLDOWN' ? 429 : 503, json: { error: { code, retryAt } } })
      : route.fulfill({ json: searchResponse() }));
    await page.goto(searchPath);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
    expect(searches).toBe(1);
    await page.clock.fastForward(60_001);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
    expect(searches).toBe(2);
  });

  test(`${code} detail fallback preserves the offer and suppresses return-to-results traffic`, async ({ page }) => {
    const now = Date.now();
    await page.clock.install({ time: now });
    const backoff = { code, retryAt: new Date(now + 60_000).toISOString() };
    const data = { ...detailResponse(), backoff };
    let details = 0;
    let searches = 0;
    await page.route('**/api/v1/deal', route => { details++; return route.fulfill({ json: data }); });
    await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: searchResponse() }); });
    await page.goto(`/deal?${queryParams({ ...context, offerId: 'offer-one', hotelId: 'hotel-one' })}`);
    await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveAttribute('href', present(data.offer.handoffUrl));
    await expect(page.getByRole('button', { name: 'Update price', exact: true })).toBeDisabled();
    await page.getByRole('link', { name: /Back to results/ }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
    expect(details).toBe(1);
    expect(searches).toBe(0);
  });
}
