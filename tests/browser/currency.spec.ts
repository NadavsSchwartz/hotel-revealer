import { present } from './fixtures.ts';
import type { Page } from '@playwright/test';
import type { BrowserRequest } from './fixtures.ts';
import { test, expect } from '@playwright/test';
import { context, detailResponse, openTripEditor, searchPath, searchResponse, tripRequest } from './fixtures.ts';
import { getDestination } from '../../backend/destinations/index.ts';

const selectCurrency = (page: Page) => page.getByRole('combobox', { name: 'Currency', exact: true });

test('a new home search uses the selected currency with the entered trip', async ({ page }) => {
  const searches: BrowserRequest[] = [];
  const destination = present(getDestination(context.destinationId));
  await page.route('**/api/v1/destinations?*', route => route.fulfill({ json: { destinations: [destination] } }));
  await page.route('**/api/v1/hotelDeals', route => {
    const input = tripRequest(route);
    searches.push(input);
    const data = searchResponse({ context: input });
    data.offers[0].quote.currency = input.currency;
    return route.fulfill({ json: data });
  });
  await page.goto('/');
  await selectCurrency(page).selectOption('CAD');
  await page.getByLabel('Where are you going?').fill('Las Vegas');
  await page.locator('.destination-popup [role="option"]').filter({ hasText: destination.name }).click();
  for (const [label, value] of [['Check-in', context.checkIn], ['Check-out', context.checkOut]]) {
    const input = page.getByRole('combobox', { name: label, exact: true });
    if (await input.getAttribute('aria-expanded') !== 'true') await input.click();
    const calendar = page.getByRole('dialog', { name: `${label} calendar`, exact: true });
    const day = calendar.locator(`[data-day="${value}"]`);
    for (let month = 0; month < 13 && await day.count() === 0; month++) {
      await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
    }
    await day.locator('button').click();
  }
  await page.getByRole('button', { name: 'Find hotel deals', exact: true }).click();
  await expect(page.locator('.quote-price').first()).toContainText('CA$119');
  expect(searches).toEqual([{ ...context, currency: 'CAD' }]);
});

test('header preferences stay reachable and currency preserves the home draft and reload choice', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('header').getByRole('link', { name: 'Hotels', exact: true })).toHaveCount(0);
  await expect(page.locator('header').getByRole('link', { name: 'How it works', exact: true })).toHaveCount(0);
  await page.getByLabel('Where are you going?').fill('Unfinished destination');
  await selectCurrency(page).selectOption('EUR');
  await expect(page.getByLabel('Where are you going?')).toHaveValue('Unfinished destination');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(selectCurrency(page)).toHaveValue('EUR');
  await page.goBack();
  await expect(page.getByLabel('Where are you going?')).toHaveValue('Unfinished destination');
  await page.reload();
  await expect(selectCurrency(page)).toHaveValue('EUR');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(selectCurrency(page)).toBeInViewport({ ratio: 1 });
    const toggle = page.getByRole('button', { name: /Switch to .* theme/ });
    await expect(toggle).toBeInViewport({ ratio: 1 });
    const currencyBox = present(await selectCurrency(page).boundingBox());
    const themeBox = present(await toggle.boundingBox());
    const brandBox = present(await page.locator('header .brand').boundingBox());
    expect(currencyBox.height).toBeGreaterThanOrEqual(44);
    expect(currencyBox.x).toBeGreaterThanOrEqual(brandBox.x + brandBox.width);
    expect(themeBox.x).toBeGreaterThanOrEqual(currencyBox.x + currencyBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`header-${width}.png`) });
  }
});

test('currency requests new prices, updates every quote and handoff, and follows browser history', async ({ page }, testInfo) => {
  const searches: BrowserRequest[] = [];
  const details: BrowserRequest[] = [];
  let finishEuro!: () => void;
  const euroReady = new Promise<void>(resolve => { finishEuro = resolve; });
  await page.route('**/api/v1/hotelDeals', async route => {
    const input = tripRequest(route);
    searches.push(input);
    if (input.currency === 'EUR') await euroReady;
    const data = searchResponse({ context: input });
    data.offers[0].offerId = `offer-${input.currency}`;
    data.offers[0].quote = { ...data.offers[0].quote, currency: input.currency, nightlyCents: input.currency === 'EUR' ? 10900 : 11900 };
    data.offers[0].handoffUrl = present(data.offers[0].handoffUrl).replace('cur=USD', `cur=${input.currency}`);
    await route.fulfill({ json: data });
  });
  await page.route('**/api/v1/deal', route => {
    const input = tripRequest(route);
    details.push(input);
    if (input.offerId !== `offer-${input.currency}`) return route.fulfill({ status: 409, json: { error: { code: 'INVALID_SELECTION' } } });
    const data = detailResponse();
    data.context = { ...context, currency: input.currency };
    data.offer.offerId = input.offerId;
    data.offer.quote = { ...data.offer.quote, currency: input.currency, nightlyCents: 10900, stayCents: 21800,
      totalCents: 25600, taxesFees: 'excluded', totalTaxesFees: 'included' };
    data.offer.handoffUrl = present(data.offer.handoffUrl).replace('cur=USD', `cur=${input.currency}`);
    data.quoteStatus = 'available';
    data.detailStatus = 'available';
    present(data.details).retailQuote = { ...data.offer.quote, nightlyCents: 15900, stayCents: 31800, totalCents: 35600 };
    return route.fulfill({ json: data });
  });
  await page.goto(searchPath);
  await expect(page.locator('.quote-price').first()).toContainText('$119');
  await selectCurrency(page).selectOption('EUR');
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toEqual({ ...context, currency: 'EUR' });
  await expect(page.locator('.quote-price')).toHaveCount(0);
  finishEuro();
  await expect(page.locator('.quote-price').first()).toContainText('€109');
  await expect(page.locator('.trip-summary').first()).toContainText('EUR');
  await page.getByLabel('Sort by').selectOption('rating');
  await page.getByRole('link', { name: 'View hotel & prices', exact: true }).click();
  await expect(page.locator('.detail-quote-panel .quote-price')).toContainText('€256');
  await expect(page.locator('.detail-retail')).toHaveCount(0);
  await expect(page.locator('.quote-price')).toHaveCount(1);
  await page.locator('.detail-quote-panel').getByText('Price breakdown', { exact: true }).click();
  await expect(page.locator('.detail-quote-panel .quote-breakdown')).toContainText('€38');
  await expect(page.getByRole('link', { name: /Check price on Priceline/ })).toHaveAttribute('href', /cur=EUR$/);
  await selectCurrency(page).selectOption('GBP');
  await expect(page).toHaveURL(/\/results\?/);
  await expect(page.getByLabel('Sort by')).toHaveValue('rating');
  await expect(page.locator('.quote-price').first()).toContainText('£119');
  expect(new URL(page.url()).searchParams.has('offerId')).toBe(false);
  expect(new URL(page.url()).searchParams.has('hotelId')).toBe(false);
  expect(details).toHaveLength(1);
  await page.getByRole('link', { name: 'View hotel & prices', exact: true }).click();
  await expect(page.locator('.detail-quote-panel .quote-price')).toContainText('£256');
  await expect(page.locator('.detail-retail')).toHaveCount(0);
  await expect(page.locator('.quote-price')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Check price on Priceline/ })).toHaveAttribute('href', /cur=GBP$/);
  expect(details.at(-1)).toEqual({ ...context, currency: 'GBP', offerId: 'offer-GBP', hotelId: 'hotel-one' });
  await page.screenshot({ path: testInfo.outputPath('original-offer-only-gbp.png'), fullPage: true });
  await page.goBack();
  await expect(page.getByLabel('Sort by')).toHaveValue('rating');
  await page.goBack();
  await expect(selectCurrency(page)).toHaveValue('EUR');
  await expect(page.locator('.detail-quote-panel .quote-price')).toContainText('€256');
  await page.screenshot({ path: testInfo.outputPath('currency-details.png'), fullPage: true });
});

test('currency recognizes trailing-slash routes and preserves unfinished results edits', async ({ page }) => {
  const searches: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', route => {
    const input = tripRequest(route);
    searches.push(input);
    const data = searchResponse({ context: input });
    data.offers[0].quote.currency = input.currency;
    return route.fulfill({ json: data });
  });
  await page.goto(searchPath.replace('/results?', '/RESULTS/?'));
  await expect(page.locator('.quote-price').first()).toContainText('$119');
  await openTripEditor(page);
  await page.getByLabel('Where are you going?').fill('Unfinished edit');
  await page.getByRole('button', { name: /^Travelers,/ }).click();
  await page.getByRole('button', { name: 'Increase adults', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await selectCurrency(page).selectOption('EUR');
  await expect(page.locator('.quote-price').first()).toContainText('€119');
  await expect(page.getByLabel('Where are you going?')).toHaveValue('Unfinished edit');
  await expect(page.getByRole('button', { name: /^Travelers,/ })).toHaveAccessibleName('Travelers, 3 guests · 1 room');
  expect(searches).toEqual([context, { ...context, currency: 'EUR' }]);
});

test('invalid currency links can be repaired from the header without sending an unsupported request', async ({ page }) => {
  const searches: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', route => {
    const input = tripRequest(route);
    searches.push(input);
    return route.fulfill({ json: searchResponse({ context: input }) });
  });
  await page.goto(searchPath.replace('currency=USD', 'currency=INVALID'));
  expect(searches).toHaveLength(0);
  await selectCurrency(page).selectOption('USD');
  await expect(page.locator('.quote-price').first()).toContainText('$119');
  expect(searches).toEqual([context]);
});
