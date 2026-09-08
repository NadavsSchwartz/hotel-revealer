import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { context, detailResponse, searchPath, searchResponse } from './fixtures.js';

const destinationOptions = page => page.locator('.destination-popup .ant-select-item-option');
const calendar = page => page.locator('.travel-calendar-popup:visible:not(.ant-slide-up-leave)');
const tripPath = changes => `/results?${new URLSearchParams({ ...context, ...changes })}`;
const dateAfter = days => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const formattedDate = value => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));

async function findCalendarDay(page, date) {
  await expect(calendar(page)).toHaveCount(1);
  await expect(calendar(page)).toBeVisible();
  const day = calendar(page).locator(`td[title="${date}"]`);
  for (let month = 0; month < 13 && await day.count() === 0; month++) {
    await calendar(page).locator('.ant-picker-header-next-btn').click();
  }
  await expect(day).toBeVisible();
  return day;
}

async function chooseDate(page, label, date) {
  await page.getByLabel(label, { exact: true }).click();
  const day = await findCalendarDay(page, date);
  await expect(day).not.toHaveClass(/ant-picker-cell-disabled/);
  await day.locator('.ant-picker-cell-inner').click();
}

async function chooseAge(page, child, age) {
  await page.getByRole('combobox', { name: `Child ${child} age`, exact: true }).click();
  const field = page.locator('.child-age-field').filter({ has: page.getByText(`Child ${child} age`, { exact: true }) });
  await field.locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: new RegExp(`^${age === 0 ? 'Under 1' : age}$`) }).click();
}

async function recordSearches(page) {
  const searches = [];
  await page.route('**/api/v1/hotelDeals', async route => {
    const input = route.request().postDataJSON();
    searches.push(input);
    await route.fulfill({ json: searchResponse({ context: input }) });
  });
  return searches;
}

async function loadResults(page) {
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
    expect(response.status()).toBe(200);
    const { destinations } = await response.json();
    expect(destinations).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'geonames:293397', name: 'Tel Aviv', countryCode: 'IL' })]));
    expect(destinations.every(destination => destination.countryCode === 'IL')).toBe(true);
    await expect(destinationOptions(page).filter({ has: page.getByText('Tel Aviv', { exact: true }) })).toBeVisible();
  }
  await destinationOptions(page).filter({ has: page.getByText('Tel Aviv', { exact: true }) }).click();
  await expect(page.getByLabel('Where are you going?')).toHaveValue('Tel Aviv, Israel');
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  expect(hotelSearches).toBe(0);
});

test('keyboard destination selection keeps the canonical city and waits for explicit search', async ({ page }) => {
  const searches = await recordSearches(page);
  await loadResults(page);
  const input = page.getByLabel('Where are you going?');
  await input.fill('Israel');
  await expect(destinationOptions(page).first()).toContainText('Jerusalem');
  await input.press('ArrowDown');
  await expect(page.locator('.destination-popup .ant-select-item-option-active')).toContainText('Tel Aviv');
  await input.press('Enter');
  await expect(input).toHaveValue('Tel Aviv, Israel');
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  expect(searches).toHaveLength(1);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A closer look at Tel Aviv.' })).toBeVisible();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toEqual({ ...context, destinationId: 'geonames:293397', cityName: 'Tel Aviv, Israel' });
});

test('editing a selected destination cannot reuse its identity for an unknown city', async ({ page }) => {
  const searches = await recordSearches(page);
  await loadResults(page);
  await page.getByLabel('Where are you going?').fill('NoSuchDestinationzzzz');
  await expect(page.getByText('No destinations found. Try a city or country name.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Where are you going?')).toBeFocused();
  await expect(page.getByText('Choose a destination from the suggestions.', { exact: true }).first()).toBeVisible();
  expect(searches).toHaveLength(1);
  expect(new URL(page.url()).searchParams.get('destinationId')).toBe(context.destinationId);
});

test('children require ages and the full trip survives API requests, URL, details, and back', async ({ page }) => {
  const searches = await recordSearches(page);
  const detailInputs = [];
  await page.route('**/api/v1/deal', async route => {
    const input = route.request().postDataJSON();
    detailInputs.push(input);
    await route.fulfill({ json: { ...detailResponse(), context: searches.at(-1) } });
  });
  await loadResults(page);
  await page.getByRole('button', { name: /^Travelers,/ }).click();
  await page.getByRole('button', { name: 'Increase rooms', exact: true }).click();
  await page.getByRole('button', { name: 'Increase adults', exact: true }).click();
  await page.getByRole('button', { name: 'Increase children', exact: true }).click();
  await page.getByRole('button', { name: 'Increase children', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Who’s traveling?' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Child 1 age', exact: true })).toBeFocused();
  await expect(page.getByText('Enter an age from 0 to 17 for every child. Use 0 for infants under 1.', { exact: true }).first()).toBeVisible();
  expect(searches).toHaveLength(1);
  await chooseAge(page, 1, 0);
  await chooseAge(page, 2, 7);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Travelers, 5 guests · 2 rooms', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => searches.length).toBe(2);
  const expected = { ...context, rooms: 2, adults: 3, childrenAges: [0, 7] };
  expect(searches[1]).toEqual(expected);
  await expect(page.locator('.trip-summary')).toContainText('2 rooms');
  await expect(page.locator('.trip-summary')).toContainText('3 adults');
  await expect(page.locator('.trip-summary')).toContainText('2 children');
  const params = new URL(page.url()).searchParams;
  expect(Object.fromEntries(['rooms', 'adults', 'childrenAges'].map(key => [key, params.get(key)])))
    .toEqual({ rooms: '2', adults: '3', childrenAges: '0,7' });
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  await page.getByRole('link', { name: /View candidate.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect.poll(() => detailInputs.length).toBe(1);
  expect(detailInputs[0]).toMatchObject(expected);
  await page.getByRole('link', { name: /Back to results/ }).click();
  await page.getByRole('button', { name: 'Travelers, 5 guests · 2 rooms', exact: true }).click();
  await expect(page.locator('.child-age-field').filter({ has: page.getByText('Child 1 age', { exact: true }) })).toContainText('Under 1');
  await expect(page.locator('.child-age-field').filter({ has: page.getByText('Child 2 age', { exact: true }) })).toContainText('7');
  expect(searches).toHaveLength(2);
});

test('traveler edits survive Escape and outside-click dismissal without submitting', async ({ page }) => {
  const searches = await recordSearches(page);
  await loadResults(page);
  const trigger = page.getByRole('button', { name: /^Travelers,/ });
  await trigger.click();
  await page.getByRole('button', { name: 'Increase adults', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Who’s traveling?' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName('Travelers, 3 guests · 1 room');
  await trigger.click();
  await page.getByRole('button', { name: 'Increase rooms', exact: true }).click();
  await page.getByRole('heading', { name: 'A closer look at Las Vegas.' }).click();
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
]) {
  test(`an invalid ${name} URL stays invalid and never starts a hotel request`, async ({ page }) => {
    const searches = await recordSearches(page);
    await page.goto(tripPath(changes));
    await expect(page.getByRole('heading', { name: /Let’s check your trip/ })).toBeVisible();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Search hotels' }).getByRole('alert')).toContainText(message);
    expect(searches).toHaveLength(0);
  });
}

test('checkout calendar disables reversed dates and night 31 while allowing night 30', async ({ page }) => {
  const searches = await recordSearches(page);
  await page.goto(tripPath({ checkIn: dateAfter(30), checkOut: dateAfter(32) }));
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await page.getByLabel('Check-out', { exact: true }).click();
  await expect(await findCalendarDay(page, dateAfter(30))).toHaveClass(/ant-picker-cell-disabled/);
  const lastAllowed = await findCalendarDay(page, dateAfter(60));
  await expect(lastAllowed).not.toHaveClass(/ant-picker-cell-disabled/);
  await expect(await findCalendarDay(page, dateAfter(61))).toHaveClass(/ant-picker-cell-disabled/);
  await lastAllowed.locator('.ant-picker-cell-inner').click();
  await expect(page.getByLabel('Check-out', { exact: true })).toHaveValue(formattedDate(dateAfter(60)));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toMatchObject({ checkIn: dateAfter(30), checkOut: dateAfter(60) });
});

test('both calendars disable days beyond 365 days and can dismiss with Escape', async ({ page }) => {
  await recordSearches(page);
  await page.goto(tripPath({ checkIn: dateAfter(364), checkOut: dateAfter(365) }));
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  for (const label of ['Check-in', 'Check-out']) {
    await page.getByLabel(label, { exact: true }).click();
    await expect(await findCalendarDay(page, dateAfter(365))).not.toHaveClass(/ant-picker-cell-disabled/);
    await expect(await findCalendarDay(page, dateAfter(366))).toHaveClass(/ant-picker-cell-disabled/);
    await calendar(page).locator('.ant-picker-header-next-btn').click();
    await expect(calendar(page).locator('td.ant-picker-cell-in-view:not(.ant-picker-cell-disabled)')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(calendar(page)).toHaveCount(0);
  }
});

test('changing check-in clears an incompatible checkout and requires a new date', async ({ page }) => {
  const searches = await recordSearches(page);
  await loadResults(page);
  await chooseDate(page, 'Check-in', dateAfter(40));
  await expect(page.getByLabel('Check-out', { exact: true })).toHaveValue('');
  await expect(page.getByText('Choose a new check-out date for this check-in.', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Check-out', { exact: true })).toBeFocused();
  await expect(calendar(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(calendar(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Check-out', { exact: true })).toBeFocused();
  expect(searches).toHaveLength(1);
  await chooseDate(page, 'Check-out', dateAfter(42));
  await expect(page.getByLabel('Check-out', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toMatchObject({ checkIn: dateAfter(40), checkOut: dateAfter(42) });
});


test('open destination and traveler controls pass Axe with one reviewed combobox exception', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.getByLabel('Where are you going?').fill('Tel Aviv');
  await expect(destinationOptions(page).first()).toBeVisible();
  const checkAccessibility = async stage => {
    await page.evaluate(async () => {
      const finite = document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime));
      await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
    });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    // APG comboboxes keep DOM focus on the input, outside the popup's Tab sequence.
    // The all-eight-suggestions test verifies owned active IDs, scrolling, selection,
    // and Tab/Escape exit. This disposition applies to this rule and holder only.
    // https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
    const onlyDestinationHolder = stage === 'Open destination suggestions'
      && await page.locator('.rc-virtual-list-holder').count() === 1
      && await page.locator('.destination-popup .rc-virtual-list-holder').count() === 1;
    const violations = result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.filter(node => !(onlyDestinationHolder && id === 'scrollable-region-focusable'
        && node.target.length === 1 && node.target[0] === '.rc-virtual-list-holder'))
        .map(({ html, target }) => ({ html, target })),
    })).filter(({ nodes }) => nodes.length > 0);
    expect.soft(violations, stage).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await checkAccessibility('Open destination suggestions');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Travelers,/ }).click();
  await page.getByRole('button', { name: 'Increase children', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Who’s traveling?' })).toBeVisible();
  await checkAccessibility('Open travelers with a required child age');
  await chooseAge(page, 1, 0);
  await expect(page.getByRole('combobox', { name: 'Child 1 age', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.child-age-field .ant-select-dropdown:visible')).toHaveCount(0);
  await checkAccessibility('Selected child age with its dropdown closed');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Travelers, 3 guests · 1 room', exact: true })).toBeFocused();
});

test('every destination suggestion is keyboard reachable, scrolled into view, and canonically selectable', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.setViewportSize({ width: 320, height: 800 });
  const searches = await recordSearches(page);
  await loadResults(page);
  const input = page.getByLabel('Where are you going?');
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/destinations'
    && new URL(response.url()).searchParams.get('q') === 'Israel');
  await input.fill('Israel');
  const { destinations } = await (await responsePromise).json();
  expect(destinations).toHaveLength(8);
  await expect(destinationOptions(page)).toHaveCount(8);
  const visited = [];
  for (let index = 0; index < destinations.length; index++) {
    if (index > 0) await input.press('ArrowDown');
    const option = destinationOptions(page).nth(index);
    await expect(option).toHaveClass(/ant-select-item-option-active/);
    await expect(option).toContainText(destinations[index].name);
    const optionId = await option.getAttribute('id');
    expect(optionId).toBeTruthy();
    await expect(input).toHaveAttribute('aria-activedescendant', optionId);
    await expect(input).toBeFocused();
    await expect.poll(async () => option.evaluate(element => {
      const holder = element.closest('.rc-virtual-list-holder');
      if (!holder || !holder.closest('.destination-popup')) return false;
      const input = document.getElementById('cityName');
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
  const selected = destinations.at(-1);
  await input.press('Enter');
  await expect(input).toHaveValue(selected.label);
  await expect(input).toBeFocused();
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  expect(searches).toHaveLength(1);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toEqual({ ...context, destinationId: selected.id, cityName: selected.label });
  await expect(page.getByRole('heading', { name: `A closer look at ${selected.name}.` })).toBeVisible();
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();

  await input.fill('Israel');
  await expect(destinationOptions(page).first()).toBeVisible();
  await input.press('Tab');
  await expect(page.getByLabel('Check-in', { exact: true })).toBeFocused();
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  await input.fill('Israel');
  await expect(destinationOptions(page).first()).toBeVisible();
  await input.press('Escape');
  await expect(page.locator('.destination-popup:visible')).toHaveCount(0);
  await expect(input).toBeFocused();
  expect(searches).toHaveLength(2);
  expect(browserErrors).toEqual([]);
});

test('a valid destination ID with the wrong label adopts the server label through results, details, and back', async ({ page }) => {
  const searches = [];
  const details = [];
  await page.route('**/api/v1/hotelDeals', async route => {
    searches.push(route.request().postDataJSON());
    await route.fulfill({ json: searchResponse() });
  });
  await page.route('**/api/v1/deal', async route => {
    details.push(route.request().postDataJSON());
    await route.fulfill({ json: detailResponse() });
  });
  await page.goto(tripPath({ cityName: 'Paris, France', sort: 'price' }));
  await expect(page.getByRole('heading', { name: 'A closer look at Las Vegas.' })).toBeVisible();
  await expect(page.getByLabel('Where are you going?')).toHaveValue(context.cityName);
  await expect.poll(() => new URL(page.url()).searchParams.get('cityName')).toBe(context.cityName);
  await expect(page.getByLabel('Sort by')).toHaveValue('price');
  expect(searches).toHaveLength(1);
  expect(searches[0]).toEqual({ ...context, cityName: 'Paris, France' });
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  await page.getByRole('link', { name: /View candidate.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect.poll(() => details.length).toBe(1);
  expect(details[0]).toMatchObject(context);
  expect(new URL(page.url()).searchParams.get('cityName')).toBe(context.cityName);
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(page.getByLabel('Where are you going?')).toHaveValue(context.cityName);
  await expect(page.getByLabel('Sort by')).toHaveValue('price');
  expect(searches).toHaveLength(1);

  const directDetail = `/deal?${new URLSearchParams({ ...context, cityName: 'Paris, France', offerId: 'offer-one', hotelId: 'hotel-one' })}`;
  await page.goto(directDetail);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('cityName')).toBe(context.cityName);
  const back = page.getByRole('link', { name: /Back to results/ });
  expect(new URL(await back.getAttribute('href'), page.url()).searchParams.get('cityName')).toBe(context.cityName);
  expect(details).toHaveLength(2);
  expect(details[1]).toMatchObject({ ...context, cityName: 'Paris, France' });
  expect(searches).toHaveLength(1);
  await back.click();
  await expect(page.getByRole('heading', { name: 'A closer look at Las Vegas.' })).toBeVisible();
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
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/destinations'
      && new URL(response.url()).searchParams.get('q') === 'Shenzhen');
    await page.getByLabel('Where are you going?').fill('Shenzhen');
    const { destinations } = await (await responsePromise).json();
    expect(destinations.filter(city => city.label === 'Shenzhen, Guangdong, China').map(city => city.id))
      .toEqual(['geonames:1795565', 'geonames:1795566']);
    const option = destinationOptions(page).filter({ hasText: destination.coordinates });
    await expect(option).toBeVisible();
    await expect(option).toContainText('Guangdong, China');
    await option.click();
    await expect(page.getByLabel('Where are you going?')).toHaveValue('Shenzhen, Guangdong, China');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect.poll(() => searches.length).toBe(index + 2);
    expect(searches[index + 1]).toEqual({ ...context, destinationId: destination.id, cityName: 'Shenzhen, Guangdong, China' });
    expect(new URL(page.url()).searchParams.get('destinationId')).toBe(destination.id);
    await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  }
});
