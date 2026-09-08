import { test, expect } from '@playwright/test';
import { context, searchPath, searchResponse } from './fixtures.js';

test('mobile results show a hotel and its price without the full search form taking the first screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = searchResponse({ context: { ...context, childrenAges: [7] } });
  data.offers[0].candidates[0].name = 'The STRAT Hotel, Casino & Tower';
  data.offers[0].quote.advertisedDiscount = { percent: 80, source: 'Priceline' };
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: data }));
  await page.goto(`/results?${new URLSearchParams(data.context)}`);
  const hotel = page.getByRole('link', { name: 'View possible hotel: The STRAT Hotel, Casino & Tower', exact: true });
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
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'How it works', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-home.png'), fullPage: true });
  const sizes = await page.locator('.room-description, .room-reception label').evaluateAll(elements =>
    elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.every(size => size >= 12)).toBe(true);
  const start = await page.getByRole('button', { name: 'Find hotel deals', exact: true }).boundingBox();
  expect(start.height).toBeGreaterThanOrEqual(44);
  const hero = await page.locator('.room-scene').boundingBox();
  expect(start.y + start.height).toBeLessThanOrEqual(hero.y + hero.height);
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
