import { present } from './fixtures.ts';
import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { getDestination, searchDestinations } from '../../backend/destinations/index.ts';
import { context } from './fixtures.ts';

const destination = present(getDestination(context.destinationId));
const options = (page: Page) => page.getByRole('listbox', { name: 'Destination suggestions' }).getByRole('option');

test('malformed destination responses show a retry state without rendering unsafe options', async ({ page }) => {
  let response: unknown;
  await page.route('**/api/v1/destinations?*', route => route.fulfill({ json: response }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const malformed = [
    null, 'Las Vegas', {},
    { ...destination, id: 'invalid' },
    { ...destination, name: {} },
    { ...destination, label: {} },
    { ...destination, latitude: '36.17' },
    { ...destination, longitude: null },
    { ...destination, regionName: {} },
    { ...destination, countryName: [] },
  ];
  for (const [index, invalid] of malformed.entries()) {
    response = { destinations: [destination, invalid] };
    await page.getByLabel('Where are you going?').fill(`Las Vegas ${index}`);
    const panel = page.locator('.destination-status-panel');
    await expect(panel).toContainText('Destinations could not load. Try again.');
    await expect(panel.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await expect(options(page)).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'We couldn’t display this page' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('retrying a malformed lookup supports keyboard selection and editing the selected name', async ({ page }) => {
  let requests = 0;
  let searches = 0;
  page.on('request', request => { if (request.url().includes('/api/v1/hotelDeals')) searches++; });
  await page.route('**/api/v1/destinations?*', route => route.fulfill({ json: {
    destinations: ++requests === 1 ? [null] : [destination],
  } }));
  await page.goto('/');
  const input = page.getByLabel('Where are you going?');
  await input.fill('Las Vegas');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(options(page)).toHaveCount(1);
  await expect(input).toBeFocused();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue(destination.label);
  await expect(options(page)).toHaveCount(0);
  await input.fill('Las');
  await expect(options(page)).toHaveCount(1);
  await input.press('Enter');
  await expect(input).toHaveValue(destination.label);
  await expect.poll(() => requests).toBe(3);
  expect(searches).toBe(0);
});

test('a valid empty destination response stays distinct from a failed lookup', async ({ page }) => {
  await page.route('**/api/v1/destinations?*', route => route.fulfill({ json: { destinations: [] } }));
  await page.goto('/');
  await page.getByLabel('Where are you going?').fill('Nowhere');
  await expect(page.locator('.destination-status-panel')).toContainText('No destinations found. Try a city or country name.');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
  await expect(options(page)).toHaveCount(0);
});

test('validated suggestions preserve server order and the eight-option display limit', async ({ page }) => {
  const destinations = searchDestinations('United States', { limit: 10 });
  await page.route('**/api/v1/destinations?*', route => route.fulfill({ json: { destinations } }));
  await page.goto('/');
  await page.getByLabel('Where are you going?').fill('United States');
  await expect(options(page)).toHaveCount(8);
  await expect(options(page).locator('strong')).toHaveText(destinations.slice(0, 8).map(entry => entry.name));
});
