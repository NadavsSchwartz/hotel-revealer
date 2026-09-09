import { present } from './fixtures.ts';
import { test, expect } from '@playwright/test';
import { queryParams, context, searchPath, searchResponse } from './fixtures.ts';

test('mobile results show a hotel and its price without the full search form taking the first screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = searchResponse({ context: { ...context, childrenAges: [7] } });
  present(data.offers[0].candidates[0]).name = 'The STRAT Hotel, Casino & Tower';
  data.offers[0].quote.advertisedDiscount = { percent: 80, source: 'Priceline' };
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: data }));
  await page.goto(`/results?${queryParams(data.context)}`);
  const hotel = page.getByRole('link', { name: 'View likely hotel: The STRAT Hotel, Casino & Tower', exact: true });
  await expect(hotel).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: testInfo.outputPath('mobile-results.png'), fullPage: true });
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(hotel).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.quote-price').first()).toBeInViewport({ ratio: 1 });
  const city = page.getByRole('combobox', { name: 'Where are you going?', exact: true });
  await expect(city).toBeHidden();
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await expect(city).toBeFocused();
  await city.fill('Unsubmitted edit');
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await expect(city).toBeHidden();
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await expect(city).toHaveValue('Unsubmitted edit');
  for (const width of [832, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const dateFits = await page.locator('.results-search .date-control input').evaluateAll(inputs => inputs.map(input => {
      if (!(input instanceof HTMLInputElement)) throw new Error('Expected a date input');
      const style = getComputedStyle(input);
      const canvas = document.createElement('canvas').getContext('2d');
      if (!canvas) throw new Error('Expected a canvas 2D context');
      canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return input.value.length > 0 && canvas.measureText(input.value).width <= input.clientWidth;
    }));
    expect(dateFits).toEqual([true, true]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('invalid travel links reveal the mobile editor and the landing copy uses readable text', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let searches = 0;
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: searchResponse() }); });
  const invalid = new URL(searchPath, 'http://localhost');
  invalid.searchParams.set('checkOut', '2227-06-22');
  await page.goto(invalid.pathname + invalid.search);
  await expect(page.getByRole('combobox', { name: 'Check-out', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Check-out', exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(searches).toBe(0);
  await page.getByRole('link', { name: 'Hotel Revealer home', exact: true }).click();
  await expect(page.locator('#home-title')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-home.png'), fullPage: true });
  const sizes = await page.locator('.room-description, .room-reception label').evaluateAll(elements =>
    elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.every(size => size >= 14)).toBe(true);
  const values = await page.locator('.room-reception input, .room-reception .travelers-trigger').evaluateAll(elements =>
    elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
  expect(values.length).toBeGreaterThan(0);
  expect(values.every(size => size >= 16)).toBe(true);
  const start = present(await page.getByRole('button', { name: 'Search hotels', exact: true }).boundingBox());
  expect(start.height).toBeGreaterThanOrEqual(44);
  const hero = present(await page.locator('.room-scene').boundingBox());
  expect(start.y + start.height).toBeLessThanOrEqual(hero.y + hero.height);
});

test('the search stays substantial on wide screens and reachable on a short desktop', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 2560, height: 1292 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const form = present(await page.getByRole('form', { name: 'Search hotels', exact: true }).boundingBox());
  expect(form.width).toBeGreaterThanOrEqual(600);
  await page.screenshot({ path: testInfo.outputPath('home-wide.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('button', { name: 'Search hotels', exact: true })).toBeInViewport({ ratio: 1 });
  const headline = page.locator('#home-title');
  await expect(headline).toBeInViewport({ ratio: 1 });
  expect(await headline.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.getByRole('combobox', { name: 'Check-in', exact: true }).click();
    const calendar = page.locator('.travel-calendar-popup:visible');
    await expect(calendar).toHaveCSS('opacity', '1');
    await expect(calendar).toHaveCSS('transform', 'none');
    await expect(calendar).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('large formatted prices remain within a narrow result card', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const data = searchResponse();
  data.offers[0].quote = { ...data.offers[0].quote, nightlyCents: 1299999, stayCents: 2599998 };
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: data }));
  await page.goto(searchPath);
  await expect(page.locator('.quote-price').first()).toContainText('$12,999.99');
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: testInfo.outputPath('narrow-large-price.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
