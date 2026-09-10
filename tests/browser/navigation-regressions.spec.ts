import { present } from './fixtures.ts';
import type { Page } from '@playwright/test';
import type { BrowserRequest } from './fixtures.ts';
import { test, expect } from '@playwright/test';
import { getDestination } from '../../backend/destinations/index.ts';
import { context, openTripEditor, searchPath, searchResponse, tripRequest } from './fixtures.ts';

async function chooseHomeTrip(page: Page) {
  const destination = present(getDestination(context.destinationId));
  await page.route('**/api/v1/destinations?*', route => route.fulfill({ json: { destinations: [destination] } }));
  await page.getByLabel('Where are you going?').fill('Las');
  await page.locator('.destination-popup [role="option"]').filter({ hasText: destination.name }).click();
  for (const [label, field] of [['Check-in', 'checkIn'], ['Check-out', 'checkOut']] as const) {
    const input = page.getByRole('combobox', { name: label, exact: true });
    if (await input.getAttribute('aria-expanded') !== 'true') await input.click();
    const calendar = page.getByRole('dialog', { name: `${label} calendar`, exact: true });
    const day = calendar.locator(`[data-day="${context[field]}"]`);
    for (let month = 0; month < 13 && await day.count() === 0; month++) {
      await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
    }
    await day.locator('button').click();
  }
}

for (const destination of ['home', 'privacy']) {
  test(`a failed Results chunk allows navigation to ${destination} and recovers on reload`, async ({ page }) => {
    await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: searchResponse() }));
    await page.route('**/assets/Results-*.js', route => route.abort());
    await page.goto(searchPath);
    await expect(page.getByRole('heading', { name: 'We couldn’t display this page', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reload page', exact: true })).toHaveAttribute('href', page.url());
    await page.getByRole('link', { name: destination === 'home' ? 'Hotel Revealer home' : 'Privacy', exact: true }).click();
    if (destination === 'home') await expect(page.locator('#home-title')).toBeVisible();
    else await expect(page.getByRole('heading', { name: 'Privacy, plainly.', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'We couldn’t display this page', exact: true })).toHaveCount(0);
    await page.unroute('**/assets/Results-*.js');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'We couldn’t display this page', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Reload page', exact: true }).click();
    await expect(page.getByRole('heading', { name: '1 hotel deal', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'We couldn’t display this page', exact: true })).toHaveCount(0);
  });
}

test('hash navigation focuses the requested Home and Terms content', async ({ page }) => {
  await page.goto('/#unboxed-search');
  await expect(page).toHaveURL(/\/#unboxed-search$/);
  await expect(page.locator('#search-title')).toBeFocused();
  await expect(page.locator('#unboxed-search')).toBeInViewport();
  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.locator('h1')).toBeFocused();
  await page.goBack();
  await expect(page.locator('#search-title')).toBeFocused();
  await page.getByRole('link', { name: 'Hotel Revealer home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Back to home', exact: true }).click();
  await expect(page.locator('#home-title')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Hotel Revealer home', exact: true })).toBeInViewport();
  for (const hash of ['questions', 'questions-title']) {
    await page.goto(`/#${hash}`);
    await expect(page.locator('#method-title')).toBeFocused();
    await expect(page.locator('#method-title')).toBeInViewport();
  }
  await page.goto('/terms#how-it-works');
  await expect(page.getByRole('heading', { name: 'A comparison tool, not a booking service', exact: true })).toBeFocused();
});

test('an unsubmitted Home draft survives Terms and Back without validating the first keystroke', async ({ page }) => {
  let searches = 0;
  await page.route('**/api/v1/hotelDeals', route => {
    searches++;
    return route.fulfill({ json: searchResponse() });
  });
  await page.goto('/');
  const destination = page.getByLabel('Where are you going?');
  await destination.pressSequentially('Las', { delay: 35 });
  await expect(destination).toHaveValue('Las');
  await expect(destination).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await page.goBack();
  await expect(destination).toHaveValue('Las');
  await expect(destination).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('alert')).toHaveCount(0);

  await chooseHomeTrip(page);
  const beforeDates = await Promise.all(['Check-in', 'Check-out'].map(name => page.getByRole('combobox', { name, exact: true }).inputValue()));
  const travelers = page.getByRole('button', { name: /^Travelers,/ });
  await travelers.click();
  await page.getByRole('button', { name: 'Increase adults', exact: true }).click();
  await page.getByRole('button', { name: 'Increase rooms', exact: true }).click();
  await page.getByRole('button', { name: 'Increase children', exact: true }).click();
  await page.getByRole('combobox', { name: 'Child 1 age', exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(travelers).toHaveAccessibleName('Travelers, 4 guests · 2 rooms');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await page.getByRole('link', { name: 'Back to search', exact: false }).click();
  await expect(destination).toHaveValue(context.cityName);
  await expect(page.getByRole('combobox', { name: 'Check-in', exact: true })).toHaveValue(beforeDates[0]);
  await expect(page.getByRole('combobox', { name: 'Check-out', exact: true })).toHaveValue(beforeDates[1]);
  await expect(travelers).toHaveAccessibleName('Travelers, 4 guests · 2 rooms');
  await travelers.click();
  await expect(page.locator('.child-age-field option:checked')).toHaveText('Under 1');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(searches).toBe(0);
  await page.reload();
  await expect(destination).toHaveValue('');
  await expect(travelers).toHaveAccessibleName('Travelers, 2 guests · 1 room');
});

test('New trip clears the Home draft once and later edits still survive Back', async ({ page }) => {
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: searchResponse() }));
  await page.goto('/');
  await chooseHomeTrip(page);
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect(page).toHaveURL(/\/results\?/);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await page.getByRole('link', { name: /New trip/ }).click();
  await expect(page.getByLabel('Where are you going?')).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Check-in', exact: true })).toHaveValue('');
  await page.getByLabel('Where are you going?').fill('Chicago');
  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  await page.goBack();
  await expect(page.getByLabel('Where are you going?')).toHaveValue('Chicago');
});

test('cooldown blocks only the unchanged trip and still validates edited drafts', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  const searches: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', route => {
    const input = tripRequest(route);
    searches.push(input);
    return searches.length === 1
      ? route.fulfill({ status: 429, json: { error: { code: 'PROVIDER_COOLDOWN', retryAt: new Date(now + 60000).toISOString() } } })
      : route.fulfill({ json: searchResponse({ context: input }) });
  });
  await page.goto(searchPath);
  await openTripEditor(page);
  const search = page.getByRole('button', { name: 'Search hotels', exact: true });
  await expect(search).toBeDisabled();
  await page.getByRole('form', { name: 'Search hotels', exact: true }).evaluate(form => {
    if (!(form instanceof HTMLFormElement)) throw new Error('Expected a search form');
    form.requestSubmit();
  });
  expect(searches).toHaveLength(1);
  await page.getByLabel('Where are you going?').fill('');
  await expect(search).toBeEnabled();
  await search.click();
  await expect(page.getByLabel('Where are you going?')).toHaveAttribute('aria-invalid', 'true');
  expect(searches).toHaveLength(1);
  const destination = present(getDestination(context.destinationId));
  await page.route('**/api/v1/destinations?*', route => route.fulfill({ json: { destinations: [destination] } }));
  await page.getByLabel('Where are you going?').fill('Las');
  await page.clock.runFor(300);
  await page.locator('.destination-popup [role="option"]').filter({ hasText: destination.name }).click();
  await expect(search).toBeDisabled();
  await page.getByRole('button', { name: /^Travelers,/ }).click();
  await page.getByRole('button', { name: 'Increase adults', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(search).toBeEnabled();
  await search.click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toEqual({ ...context, adults: 3 });
});

test('the unchanged search becomes available when its cooldown ends', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  let searches = 0;
  await page.route('**/api/v1/hotelDeals', route => {
    searches++;
    return searches === 1
      ? route.fulfill({ status: 429, json: { error: { code: 'PROVIDER_COOLDOWN', retryAt: new Date(now + 60000).toISOString() } } })
      : route.fulfill({ json: searchResponse() });
  });
  await page.goto(searchPath);
  await openTripEditor(page);
  const search = page.getByRole('button', { name: 'Search hotels', exact: true });
  await expect(search).toBeDisabled();
  await page.clock.fastForward(61000);
  await expect(search).toBeEnabled();
  await search.click();
  await expect.poll(() => searches).toBe(2);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
});
