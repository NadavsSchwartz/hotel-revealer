import { present, readDestinations } from './fixtures.ts';
import type { Page, Route } from '@playwright/test';
import type { BrowserRequest } from './fixtures.ts';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { queryParams, context, detailResponse, openTripEditor, searchPath, searchResponse, tripRequest } from './fixtures.ts';

const destinationOptions = (page: Page) => page.getByRole('listbox', { name: 'Destination suggestions' }).getByRole('option');
const calendar = (page: Page) => page.getByRole('dialog', { name: /^(Check-in|Check-out) calendar$/ });
const tripPath = (changes: object) => `/results?${queryParams({ ...context, ...changes })}`;
const dateAfter = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const formattedDate = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));

async function findCalendarDay(page: Page, date: string) {
  await expect(calendar(page)).toHaveCount(1);
  await expect(calendar(page)).toBeVisible();
  const day = calendar(page).locator(`td[data-day="${date}"] button`);
  for (let month = 0; month < 13 && await day.count() === 0; month++) {
    await calendar(page).getByRole('button', { name: 'Next month', exact: true }).click();
  }
  await expect(day).toBeVisible();
  return day;
}

async function chooseDate(page: Page, label: string, date: string) {
  await page.getByLabel(label, { exact: true }).click();
  const day = await findCalendarDay(page, date);
  await expect(day).toBeEnabled();
  await day.click();
}

async function chooseAge(page: Page, child: number, age: number) {
  const input = page.getByRole('combobox', { name: `Child ${child} age`, exact: true });
  await input.selectOption(String(age));
  await expect(input).toHaveValue(String(age));
}

async function recordSearches(page: Page) {
  const searches: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', async route => {
    const input = tripRequest(route);
    searches.push(input);
    await route.fulfill({ json: searchResponse({ context: input }) });
  });
  return searches;
}

async function loadResults(page: Page) {
  await page.goto(searchPath);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
}

test('the real destination catalog finds Israel by country name, IL, and Tel Aviv', async ({ page }) => {
  let hotelSearches = 0;
  page.on('request', request => { if (request.url().includes('/api/v1/hotelDeals')) hotelSearches++; });
  await page.goto('/');
  for (const query of ['Israel', 'IL', 'Tel Aviv']) {
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/destinations'
      && new URL(response.url()).searchParams.get('q') === query);
    await page.getByLabel('Where are you going?').fill(query);
    const response = await responsePromise;
    expect(present(response).status()).toBe(200);
    const destinations = await readDestinations(response);
    expect(destinations).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'geonames:293397', name: 'Tel Aviv', countryCode: 'IL' })]));
    expect(destinations.every(destination => destination.countryCode === 'IL')).toBe(true);
    await expect(destinationOptions(page).filter({ has: page.getByText('Tel Aviv', { exact: true }) })).toBeVisible();
  }
  await destinationOptions(page).filter({ has: page.getByText('Tel Aviv', { exact: true }) }).click();
  await expect(page.getByLabel('Where are you going?')).toHaveValue('Tel Aviv, Israel');
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  expect(hotelSearches).toBe(0);
});

test('Home destination loading and retry stay usable inside the reception', async ({ page }) => {
  const searches = await recordSearches(page);
  for (const width of [320, 1440]) {
    let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
    let requests = 0;
    const lookup = async (route: Route) => {
      if (++requests === 1) {
        await pending;
        await route.fulfill({ status: 503, json: {} });
      } else await route.continue();
    };
    await page.route('**/api/v1/destinations?*', lookup);
    try {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      const input = page.getByLabel('Where are you going?');
      await input.fill('Tel Aviv');
      const panel = page.locator('.destination-status-panel');
      await expect(panel).toContainText('Finding destinations…');
      await expect(panel).toBeInViewport({ ratio: 1 });
      release();
      const retry = panel.getByRole('button', { name: 'Try again', exact: true });
      await expect(retry).toBeVisible();
      await expect(panel).toBeInViewport({ ratio: 1 });
      expect(await retry.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
      await retry.click();
      await destinationOptions(page).filter({ has: page.getByText('Tel Aviv', { exact: true }) }).click();
      await expect(input).toHaveValue('Tel Aviv, Israel');
      await expect(panel).toHaveCount(0);
      expect(requests).toBe(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      release();
      await page.unroute('**/api/v1/destinations?*', lookup);
    }
  }
  expect(searches).toHaveLength(0);
});

test('keyboard destination selection keeps the canonical city and waits for explicit search', async ({ page }) => {
  const searches = await recordSearches(page);
  await loadResults(page);
  await openTripEditor(page);
  const input = page.getByLabel('Where are you going?');
  await input.fill('Israel');
  await expect(destinationOptions(page).first()).toContainText('Jerusalem');
  await page.keyboard.press('ArrowDown');
  await expect(destinationOptions(page).filter({ has: page.getByText('Tel Aviv', { exact: true }) })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('Tel Aviv, Israel');
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  expect(searches).toHaveLength(1);
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hotel deals in Tel Aviv' })).toBeVisible();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toEqual({ ...context, destinationId: 'geonames:293397', cityName: 'Tel Aviv, Israel' });
});

test('editing a selected destination cannot reuse its identity for an unknown city', async ({ page }) => {
  const searches = await recordSearches(page);
  await loadResults(page);
  await openTripEditor(page);
  await page.getByLabel('Where are you going?').fill('NoSuchDestinationzzzz');
  await expect(page.getByText('No destinations found. Try a city or country name.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect(page.getByLabel('Where are you going?')).toBeFocused();
  await expect(page.getByText('Choose a destination from the suggestions.', { exact: true }).first()).toBeVisible();
  expect(searches).toHaveLength(1);
  expect(new URL(page.url()).searchParams.get('destinationId')).toBe(context.destinationId);
});

test('children require ages and the full trip survives API requests, URL, details, and back', async ({ page }) => {
  const searches = await recordSearches(page);
  const detailInputs: BrowserRequest[] = [];
  await page.route('**/api/v1/deal', async route => {
    const input = tripRequest(route);
    detailInputs.push(input);
    await route.fulfill({ json: { ...detailResponse(), context: searches.at(-1) } });
  });
  await loadResults(page);
  await openTripEditor(page);
  await page.getByRole('button', { name: /^Travelers,/ }).click();
  await page.getByRole('button', { name: 'Increase rooms', exact: true }).click();
  await page.getByRole('button', { name: 'Increase adults', exact: true }).click();
  await page.getByRole('button', { name: 'Increase children', exact: true }).click();
  await page.getByRole('button', { name: 'Increase children', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Who’s traveling?' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Child 1 age', exact: true })).toBeFocused();
  await expect(page.getByText('Enter an age from 0 to 17 for every child. Use 0 for infants under 1.', { exact: true }).first()).toBeVisible();
  expect(searches).toHaveLength(1);
  await chooseAge(page, 1, 0);
  await chooseAge(page, 2, 7);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Travelers, 5 guests · 2 rooms', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect.poll(() => searches.length).toBe(2);
  const expected = { ...context, rooms: 2, adults: 3, childrenAges: [0, 7] };
  expect(searches[1]).toEqual(expected);
  await expect(page.locator('.trip-summary')).toContainText('2 rooms');
  await expect(page.locator('.trip-summary')).toContainText('3 adults');
  await expect(page.locator('.trip-summary')).toContainText('2 children');
  const params = new URL(page.url()).searchParams;
  expect(Object.fromEntries(['rooms', 'adults', 'childrenAges'].map(key => [key, params.get(key)])))
    .toEqual({ rooms: '2', adults: '3', childrenAges: '0,7' });
  await page.getByRole('link', { name: /View likely hotel:.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect.poll(() => detailInputs.length).toBe(1);
  expect(detailInputs[0]).toMatchObject(expected);
  await page.getByRole('link', { name: /Back to results/ }).click();
  await openTripEditor(page);
  await page.getByRole('button', { name: 'Travelers, 5 guests · 2 rooms', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Child 1 age', exact: true })).toHaveValue('0');
  await expect(page.getByRole('combobox', { name: 'Child 2 age', exact: true })).toHaveValue('7');
  expect(searches).toHaveLength(2);
});

test('traveler edits survive Escape and outside-click dismissal without submitting', async ({ page }) => {
  const searches = await recordSearches(page);
  await loadResults(page);
  await openTripEditor(page);
  const trigger = page.getByRole('button', { name: /^Travelers,/ });
  await trigger.click();
  await page.getByRole('button', { name: 'Increase adults', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Who’s traveling?' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName('Travelers, 3 guests · 1 room');
  await trigger.click();
  await page.getByRole('button', { name: 'Increase rooms', exact: true }).click();
  const panel = present(await page.getByRole('dialog', { name: 'Who’s traveling?' }).boundingBox());
  // The responsive popup can cover the page heading; use a visible outside point.
  expect(2 < panel.x || 2 < panel.y).toBe(true);
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog', { name: 'Who’s traveling?' })).toHaveCount(0);
  await expect(trigger).toHaveAccessibleName('Travelers, 3 guests · 2 rooms');
  expect(searches).toHaveLength(1);
});

for (const [name, changes, message] of [
  ['far-future year', { checkIn: '2227-02-02', checkOut: '2227-02-04' }, 'Choose check-in within the next 365 days.'],
  ['impossible calendar date', { checkIn: '2227-02-29', checkOut: '2227-03-02' }, 'Enter a valid check-in date.'],
  ['reversed dates', { checkIn: dateAfter(32), checkOut: dateAfter(30) }, 'Check-out must be after check-in.'],
  ['31-night stay', { checkIn: dateAfter(30), checkOut: dateAfter(61) }, 'Choose a stay of 30 nights or fewer.'],
  ['checkout beyond the horizon', { checkIn: dateAfter(360), checkOut: dateAfter(366) }, 'Choose check-out within the next 365 days.'],
  ['too few adults for rooms', { rooms: 3, adults: 2 }, 'Include at least one adult for each room.'],
  ['missing child age', { childrenAges: 'missing' }, 'Enter an age from 0 to 17 for every child. Use 0 for infants under 1.'],
] as const) {
  test(`an invalid ${name} URL stays invalid and never starts a hotel request`, async ({ page }) => {
    const searches = await recordSearches(page);
    await page.goto(tripPath(changes));
    await expect(page.getByRole('heading', { name: 'Check your trip details', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Search hotels' }).getByRole('alert')).toContainText(message);
    expect(searches).toHaveLength(0);
  });
}

test('checkout calendar disables reversed dates and night 31 while allowing night 30', async ({ page }) => {
  const searches = await recordSearches(page);
  await page.goto(tripPath({ checkIn: dateAfter(30), checkOut: dateAfter(32) }));
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await openTripEditor(page);
  await page.getByLabel('Check-out', { exact: true }).click();
  await expect(await findCalendarDay(page, dateAfter(30))).toBeDisabled();
  const lastAllowed = await findCalendarDay(page, dateAfter(60));
  await expect(lastAllowed).toBeEnabled();
  await expect(await findCalendarDay(page, dateAfter(61))).toBeDisabled();
  await lastAllowed.click();
  await expect(page.getByLabel('Check-out', { exact: true })).toHaveValue(formattedDate(dateAfter(60)));
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toMatchObject({ checkIn: dateAfter(30), checkOut: dateAfter(60) });
});

test('both calendars disable days beyond 365 days and can dismiss with Escape', async ({ page }) => {
  await recordSearches(page);
  await page.goto(tripPath({ checkIn: dateAfter(364), checkOut: dateAfter(365) }));
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await openTripEditor(page);
  for (const label of ['Check-in', 'Check-out']) {
    await page.getByLabel(label, { exact: true }).click();
    await expect(await findCalendarDay(page, dateAfter(365))).toBeEnabled();
    await expect(await findCalendarDay(page, dateAfter(366))).toBeDisabled();
    await expect(calendar(page).getByRole('button', { name: 'Next month', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(calendar(page)).toHaveCount(0);
  }
});

test('changing check-in clears an incompatible checkout and requires a new date', async ({ page }) => {
  const searches = await recordSearches(page);
  await loadResults(page);
  await openTripEditor(page);
  await chooseDate(page, 'Check-in', dateAfter(40));
  await expect(page.getByLabel('Check-out', { exact: true })).toHaveValue('');
  await expect(page.getByText('Choose a new check-out date for this check-in.', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Check-out', { exact: true })).toBeFocused();
  await expect(calendar(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(calendar(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect(page.getByLabel('Check-out', { exact: true })).toBeFocused();
  expect(searches).toHaveLength(1);
  await chooseDate(page, 'Check-out', dateAfter(42));
  await expect(page.getByLabel('Check-out', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toMatchObject({ checkIn: dateAfter(40), checkOut: dateAfter(42) });
});


test('open destination and traveler controls pass Axe without exceptions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.getByLabel('Where are you going?').fill('Tel Aviv');
  await expect(destinationOptions(page).first()).toBeVisible();
  await expect(page.locator('.destination-popup:visible')).toHaveCSS('opacity', '1');
  const checkAccessibility = async (stage: string) => {
    await page.evaluate(async () => {
      const finite = document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime));
      await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
    });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const violations = result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ html, target }) => ({ html, target })),
    }));
    expect.soft(violations, stage).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await checkAccessibility('Open destination suggestions');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Travelers,/ }).click();
  await expect(page.getByRole('dialog', { name: 'Who’s traveling?' })).toBeVisible();
  const addChild = page.getByRole('button', { name: 'Increase children', exact: true });
  await expect(addChild).toBeEnabled();
  await expect(addChild).toBeInViewport({ ratio: 1 });
  const box = present(await addChild.boundingBox());
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(await addChild.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), point)).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('button', { name: 'Travelers, 3 guests · 1 room', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Child 1 age', exact: true })).toBeVisible();
  await checkAccessibility('Open travelers with a required child age');
  await chooseAge(page, 1, 0);
  await expect(page.getByRole('combobox', { name: 'Child 1 age', exact: true })).toHaveValue('0');
  await checkAccessibility('Selected child age');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Travelers, 3 guests · 1 room', exact: true })).toBeFocused();
});

test('every destination suggestion is keyboard reachable, scrolled into view, and canonically selectable', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.setViewportSize({ width: 320, height: 800 });
  const searches = await recordSearches(page);
  await loadResults(page);
  await openTripEditor(page);
  const input = page.getByLabel('Where are you going?');
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/destinations'
    && new URL(response.url()).searchParams.get('q') === 'Israel');
  await input.fill('Israel');
  const destinations = await readDestinations(await responsePromise);
  expect(destinations).toHaveLength(8);
  await expect(destinationOptions(page)).toHaveCount(8);
  const visited = [];
  for (let index = 0; index < destinations.length; index++) {
    if (index > 0) await page.keyboard.press('ArrowDown');
    const option = destinationOptions(page).nth(index);
    await expect(option).toHaveAttribute('aria-selected', 'true');
    await expect(option).toContainText(destinations[index].name);
    const optionId = await option.getAttribute('id');
    expect(optionId).toBeTruthy();
    await expect(input).toHaveAttribute('aria-activedescendant', present(optionId));
    await expect(input).toBeFocused();
    await expect.poll(async () => option.evaluate(element => {
      const holder = element.closest('[role="listbox"]');
      if (!holder || !holder.closest('.destination-popup')) return false;
      const input = document.getElementById('cityName');
      if (!input) return false;
      const ownedIds = `${input.getAttribute('aria-controls') || ''} ${input.getAttribute('aria-owns') || ''}`.trim().split(/\s+/);
      if (!ownedIds.some(id => document.getElementById(id)?.contains(element))) return false;
      const item = element.getBoundingClientRect();
      const bounds = holder.getBoundingClientRect();
      return item.top >= bounds.top - 1 && item.bottom <= bounds.bottom + 1
        && item.left >= bounds.left - 1 && item.right <= bounds.right + 1;
    })).toBe(true);
    visited.push(optionId);
  }
  expect(new Set(visited).size).toBe(8);
  const selected = present(destinations.at(-1));
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue(selected.label);
  await expect(input).toBeFocused();
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  expect(searches).toHaveLength(1);
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toEqual({ ...context, destinationId: selected.id, cityName: selected.label });
  await expect(page.getByRole('heading', { name: `Hotel deals in ${selected.name}` })).toBeVisible();
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();

  await openTripEditor(page);
  await input.fill('Israel');
  await expect(destinationOptions(page).first()).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Check-in', { exact: true })).toBeFocused();
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  await input.fill('Israel');
  await expect(destinationOptions(page).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  await expect(input).toBeFocused();
  expect(searches).toHaveLength(2);
  expect(browserErrors).toEqual([]);
});

test('a valid destination ID with the wrong label adopts the server label through results, details, and back', async ({ page }) => {
  const searches: BrowserRequest[] = [];
  const details: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', async route => {
    searches.push(tripRequest(route));
    await route.fulfill({ json: searchResponse() });
  });
  await page.route('**/api/v1/deal', async route => {
    details.push(tripRequest(route));
    await route.fulfill({ json: detailResponse() });
  });
  await page.goto(tripPath({ cityName: 'Paris, France', sort: 'price' }));
  await expect(page.getByRole('heading', { name: 'Hotel deals in Las Vegas' })).toBeVisible();
  await openTripEditor(page);
  await expect(page.getByLabel('Where are you going?')).toHaveValue(context.cityName);
  await expect.poll(() => new URL(page.url()).searchParams.get('cityName')).toBe(context.cityName);
  await expect(page.getByLabel('Sort by')).toHaveText('Lowest room rate');
  expect(searches).toHaveLength(1);
  expect(searches[0]).toEqual({ ...context, cityName: 'Paris, France' });
  await page.getByRole('link', { name: /View likely hotel:.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect.poll(() => details.length).toBe(1);
  expect(details[0]).toMatchObject({ ...context });
  expect(new URL(page.url()).searchParams.get('cityName')).toBe(context.cityName);
  await page.getByRole('link', { name: /Back to results/ }).click();
  await openTripEditor(page);
  await expect(page.getByLabel('Where are you going?')).toHaveValue(context.cityName);
  await expect(page.getByLabel('Sort by')).toHaveText('Lowest room rate');
  expect(searches).toHaveLength(1);

  const directDetail = `/deal?${queryParams({ ...context, cityName: 'Paris, France', offerId: 'offer-one', hotelId: 'hotel-one' })}`;
  await page.goto(directDetail);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('cityName')).toBe(context.cityName);
  const back = page.getByRole('link', { name: /Back to results/ });
  expect(new URL(present(await back.getAttribute('href')), page.url()).searchParams.get('cityName')).toBe(context.cityName);
  expect(details).toHaveLength(2);
  expect(details[1]).toMatchObject({ ...context, cityName: 'Paris, France' });
  expect(searches).toHaveLength(1);
  await back.click();
  await expect(page.getByRole('heading', { name: 'Hotel deals in Las Vegas' })).toBeVisible();
  await openTripEditor(page);
  await expect(page.getByLabel('Where are you going?')).toHaveValue(context.cityName);
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toEqual(context);
});

test('same-label Shenzhen suggestions select their own destination IDs', async ({ page }) => {
  const searches = await recordSearches(page);
  await loadResults(page);
  for (const [index, destination] of [
    { id: 'geonames:1795565', coordinates: '22.55°N, 114.07°E' },
    { id: 'geonames:1795566', coordinates: '22.18°N, 111.12°E' },
  ].entries()) {
    await openTripEditor(page);
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/destinations'
      && new URL(response.url()).searchParams.get('q') === 'Shenzhen');
    await page.getByLabel('Where are you going?').fill('Shenzhen');
    const destinations = await readDestinations(await responsePromise);
    expect(destinations.filter(city => city.label === 'Shenzhen, Guangdong, China').map(city => city.id))
      .toEqual(['geonames:1795565', 'geonames:1795566']);
    const option = destinationOptions(page).filter({ hasText: destination.coordinates });
    await expect(option).toBeVisible();
    await expect(option).toContainText('Guangdong, China');
    await option.click();
    await expect(page.getByLabel('Where are you going?')).toHaveValue('Shenzhen, Guangdong, China');
    await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
    await expect.poll(() => searches.length).toBe(index + 2);
    expect(searches[index + 1]).toEqual({ ...context, destinationId: destination.id, cityName: 'Shenzhen, Guangdong, China' });
    expect(new URL(page.url()).searchParams.get('destinationId')).toBe(destination.id);
    await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  }
});
