import { present, chooseSort } from './fixtures.ts';
import type { BrowserRequest } from './fixtures.ts';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { context, detailResponse, searchPath, searchResponse, tripRequest } from './fixtures.ts';

test('star and discount sorts use known values, break ties by room rate, and survive navigation', async ({ page }, testInfo) => {
  const data = searchResponse();
  const base = data.offers[0];
  data.offers = [
    { name: 'Budget', nightlyCents: 10000, stars: 3, discount: 10 },
    { name: 'Luxury', nightlyCents: 30000, stars: 5, discount: 40 },
    { name: 'Value', nightlyCents: 15000, stars: 5, discount: 40 },
    { name: 'Unknown', nightlyCents: 9000, stars: null, discount: undefined },
    { name: 'Invalid discount', nightlyCents: 8000, stars: 4, discount: 100 },
    { name: 'No discount', nightlyCents: 7000, stars: 4, discount: 0 },
  ].map(({ name, nightlyCents, stars, discount }, index) => ({
    ...base, offerId: `offer-${index}`, stars,
    quote: { ...base.quote, nightlyCents, stayCents: nightlyCents * 2,
      advertisedDiscount: discount === undefined ? undefined : { percent: discount, source: 'Priceline' } },
    resolution: { status: 'matched' },
    candidates: [{ ...present(base.candidates[0]), hotelId: `hotel-${index}`, name, stars: stars ?? 4 }],
  }));
  let searches = 0;
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: data }); });
  await page.route('**/api/v1/deal', route => {
    const offer = present(data.offers.find(offer => offer.offerId === tripRequest(route).offerId));
    return route.fulfill({ json: { ...detailResponse(), offer, candidate: offer.candidates[0] } });
  });
  await page.goto(searchPath);
  const sort = page.getByLabel('Sort by', { exact: true });
  const names = page.locator('.candidate-preview-copy > strong');
  await expect(sort).toHaveText('Lowest room rate');
  await expect(names).toHaveText(['No discount', 'Invalid discount', 'Unknown', 'Budget', 'Value', 'Luxury']);
  await chooseSort(page, 'Highest star rating');
  await expect(names).toHaveText(['Value', 'Luxury', 'No discount', 'Invalid discount', 'Budget', 'Unknown']);
  await page.getByRole('link', { name: 'View likely hotel: Value', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Value', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(sort).toHaveText('Highest star rating');
  await expect(names.first()).toHaveText('Value');
  await chooseSort(page, 'Biggest discount');
  const discountedOrder = ['Value', 'Luxury', 'Budget', 'No discount', 'Invalid discount', 'Unknown'];
  await expect(names).toHaveText(discountedOrder);
  await expect(page.locator('.results-comparison-intro')).toHaveText('Hotel names are inferred, not guaranteed.');
  await expect(page.locator('.results-page > [role="status"]')).toContainText('Sorted by biggest discount.');
  expect(searches).toBe(1);
  await page.reload();
  await expect(sort).toHaveText('Biggest discount');
  await expect(names).toHaveText(discountedOrder);
  expect(searches).toBe(2);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
    await expect(sort).toBeInViewport({ ratio: 1 });
    expect(present(await sort.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`sort-discount-${width}.png`) });
  }
});

test('sort menu supports keyboard selection, dismissal, and both themes on narrow screens', async ({ page }, testInfo) => {
  let searches = 0;
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: searchResponse() }); });
  await page.goto(searchPath);
  const sort = page.getByRole('combobox', { name: 'Sort by', exact: true });
  const menu = page.getByRole('listbox', { name: 'Sort by', exact: true });
  await sort.focus();
  await sort.press('Space');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option', { selected: true })).toHaveText('Lowest room rate');
  await sort.press('ArrowDown');
  await sort.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(sort).toHaveText('Lowest room rate');
  await expect(sort).toBeFocused();
  await sort.press('End');
  await sort.press('Enter');
  await expect(sort).toHaveText('Biggest discount');
  await sort.press('h');
  await sort.press('Enter');
  await expect(sort).toHaveText('Highest guest rating');
  await sort.press('Home');
  await sort.press('Tab');
  await expect(sort).toHaveText('Lowest room rate');
  await expect(menu).toHaveCount(0);
  await expect(sort).not.toBeFocused();
  await sort.click();
  await page.locator('#results-count').click();
  await expect(menu).toHaveCount(0);
  const shortcutsPreserved = await sort.evaluate(element => [
    { key: 'f', ctrlKey: true }, { key: 'r', metaKey: true }, { key: 'b', altKey: true },
  ].every(shortcut => element.dispatchEvent(new KeyboardEvent('keydown', { ...shortcut, bubbles: true, cancelable: true }))));
  expect(shortcutsPreserved).toBe(true);
  await expect(menu).toHaveCount(0);
  await chooseSort(page, 'Highest star rating');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await sort.click();
      await expect(menu).toBeInViewport({ ratio: 1 });
      await expect(menu.getByRole('option', { selected: true })).toHaveText('Highest star rating');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`sort-menu-${theme}-${width}.png`) });
      if (width === 320) expect((await new AxeBuilder({ page }).include('.sort-control').analyze()).violations).toEqual([]);
      await sort.press('Escape');
    }
  }
  for (const viewport of [{ width: 700, height: 360 }, { width: 320, height: 260 }]) {
    await page.setViewportSize(viewport);
    await sort.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await sort.click();
    await expect(menu).toBeInViewport({ ratio: 1 });
    await sort.press('End');
    await expect(menu.getByRole('option', { name: 'Biggest discount', exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(before, 1);
    await page.screenshot({ path: testInfo.outputPath(`sort-menu-short-${viewport.width}.png`) });
    await sort.press('Escape');
    await expect(sort).toHaveText('Highest star rating');
  }
  expect(searches).toBe(1);
});

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
  expect(present(response).status()).toBe(200);
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
  await expect(page.getByLabel('Sort by')).toHaveText('Lowest room rate');
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
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toBeVisible();
  const edit = page.getByRole('button', { name: 'Edit trip', exact: true });
  if (await edit.isVisible()) await edit.click();
  await expect(page.getByRole('button', { name: 'Search hotels', exact: true })).toBeDisabled();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('button', { name: 'Search hotels', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Update prices', exact: true })).toBeEnabled();
  expect(searches).toBe(2);
  await page.getByRole('button', { name: 'Update prices', exact: true }).click();
  await expect.poll(() => searches).toBe(3);
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toBeVisible();
});

test('returning to a cooling-down trip preserves its retry after expiry without an automatic request', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  const retryAt = new Date(now + 300000).toISOString();
  const nextDate = new Date(`${context.checkOut}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const tripB = { ...context, checkOut: nextDate.toISOString().slice(0, 10) };
  const requests: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', route => {
    const input = tripRequest(route);
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
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
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
  const current = searchResponse();
  // Intentionally emulate the retired response contract without claiming a valid DTO.
  const old: unknown = { ...current, offers: current.offers.map(({ resolution: _resolution, ...offer }) => offer) };
  let calls = 0;
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: ++calls === 1 ? old : searchResponse() }));
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'We could not verify this response', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View likely hotel:/ })).toHaveCount(0);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

test('a fresh offer without a listing rate still offers the current supplier price', async ({ page }) => {
  const data = searchResponse();
  data.offers[0].quote = { nightlyCents: null, stayCents: null, currency: 'USD', taxesFees: 'unknown' };
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: data }));
  await page.goto(searchPath);
  await expect(page.getByText('Rate unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveAttribute('href', present(data.offers[0].handoffUrl));
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
  ] as const) {
    data.offers[0].quote = { ...originalQuote, ...quote };
    data.offers[0].handoffUrl = link;
    await page.goto(searchPath);
    await expect(page.locator('.offer-booking .provider-handoff > p')).toHaveText(note);
    await expect(page.locator('.quote-taxes')).toHaveCount(0);
    if ('totalCents' in quote && quote.totalCents) {
      await expect(page.locator('.quote-price')).toHaveText('$279 total');
      await expect(page.locator('.offer-booking .quote-stay')).not.toContainText('Taxes & fees included');
    }
    if (!link) await expect(page.getByRole('button', { name: 'Original offer link unavailable' })).toBeDisabled();
  }
});
