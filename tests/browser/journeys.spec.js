import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { context, detailResponse, mockOffers, searchPath, searchResponse } from './fixtures.js';

async function chooseDestination(page, query, region) {
  await page.getByLabel('Where are you going?').fill(query);
  const option = page.locator('.destination-popup .ant-select-item-option').filter({ has: page.locator('strong').getByText(query, { exact: true }), hasText: region });
  await expect(option).toBeVisible();
  await option.click();
}

async function chooseDate(page, label, date) {
  await page.getByLabel(label, { exact: true }).click();
  const calendar = page.locator('.travel-calendar-popup:visible:not(.ant-slide-up-leave)');
  await expect(calendar).toHaveCount(1);
  await expect(calendar).toBeVisible();
  const day = calendar.locator(`td[title="${date}"]`);
  for (let month = 0; month < 13 && await day.count() === 0; month++) {
    await calendar.locator('.ant-picker-header-next-btn').click();
  }
  await expect(day).not.toHaveClass(/ant-picker-cell-disabled/);
  await day.locator('.ant-picker-cell-inner').click();
}

test('cleared inputs are validated and focused without an API request', async ({ page }) => {
  let searches = 0;
  page.on('request', (request) => { if (request.url().includes('/api/v1/hotelDeals')) searches++; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Where are you going?')).toBeFocused();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(searches).toBe(0);
});

test('the explicitly disabled provider returns a useful recovery state without live access', async ({ page }) => {
  const health = await page.request.get('/health');
  expect(await health.json()).toMatchObject({ provider: { available: false } });
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'Live search is not connected yet' })).toBeVisible();
  await expect(page.getByLabel('Where are you going?')).toHaveValue(context.cityName);
});

test('offer ambiguity, retail failure, and original handoff stay separate', async ({ page }) => {
  const searches = [];
  await page.route('**/api/v1/hotelDeals', async (route) => {
    searches.push(route.request().postDataJSON());
    await route.fulfill({ json: searchResponse() });
  });
  await page.route('**/api/v1/deal', (route) => route.fulfill({ json: detailResponse() }));
  await page.goto('/');
  await chooseDestination(page, 'Las Vegas', 'Nevada, United States');
  await chooseDate(page, 'Check-in', context.checkIn);
  await chooseDate(page, 'Check-out', context.checkOut);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/results\?/);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Taxes and fees not confirmed').first()).toBeVisible();
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desert House', exact: true })).toBeVisible();
  await page.getByLabel('Sort by').selectOption('price');
  expect(searches).toHaveLength(1);
  expect(searches[0]).toEqual(context);
  await page.getByRole('link', { name: /View candidate.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.getByText('Additional hotel details are unavailable')).toBeVisible();
  const handoff = page.getByRole('link', { name: /View original Express offer/ });
  await expect(handoff).toHaveAttribute('href', searchResponse().offers[0].handoffUrl);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(page.getByLabel('Sort by')).toHaveValue('price');
  await expect(page.getByRole('heading', { name: 'Desert House', exact: true })).toBeVisible();
  expect(searches).toHaveLength(1);
});

test('partial inventory and stale prices remain explicit and cannot hand off as fresh', async ({ page }) => {
  const data = searchResponse();
  data.coverage.status = 'partial';
  data.coverage.reason = 'Page limit';
  data.expiresAt = new Date(Date.now() - 1000).toISOString();
  await mockOffers(page, data);
  await page.goto(searchPath);
  await expect(page.getByText('Partial results', { exact: true })).toBeVisible();
  await expect(page.getByText('These results are out of date.')).toBeVisible();
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Original offer unavailable' })).toBeDisabled();
});

test('a rejected relationship invalidates browser-held candidate evidence and handoff', async ({ page }) => {
  await mockOffers(page);
  await page.route('**/api/v1/deal', (route) => route.fulfill({ status: 409, json: { error: { code: 'INVALID_SELECTION' } } }));
  await page.goto(searchPath);
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  await page.getByRole('link', { name: /View candidate.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'This candidate cannot be opened' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Back to results/ })).toBeVisible();
});

test('cooldown disables retry until its time and then recovers', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/v1/hotelDeals', (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 429, json: { error: { code: 'PROVIDER_COOLDOWN', message: 'unused', retryAt: new Date(Date.now() + 1200).toISOString() } } })
      : route.fulfill({ json: searchResponse() });
  });
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'The provider needs a short pause' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  expect(attempts).toBe(2);
});

test('a slower earlier search cannot overwrite the next trip', async ({ page }) => {
  let release;
  const delay = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', async (route) => {
    const input = route.request().postDataJSON();
    if (input.cityName === context.cityName) await delay;
    await route.fulfill({ json: searchResponse({ context: input }) }).catch(() => {});
  });
  await page.goto(searchPath);
  await chooseDestination(page, 'Chicago', 'Illinois, United States');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A closer look at Chicago.' })).toBeVisible();
  release();
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel('Where are you going?')).toHaveValue('Chicago, United States');
  await expect(page.getByRole('heading', { name: 'A closer look at Las Vegas.' })).toHaveCount(0);
});

test('successful empty results are an empty state, not endless loading', async ({ page }) => {
  await mockOffers(page, searchResponse({ offers: [], coverage: { status: 'complete', reason: null, pagesFetched: 1, offersFound: 0, namedHotelsChecked: 0, unassessedHotels: 0 } }));
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: /no .*offers/i })).toBeVisible();
});

test('oversized comparisons explain recovery without returning a misleading shortlist', async ({ page }) => {
  await page.route('**/api/v1/hotelDeals', (route) => route.fulfill({ status: 503, json: { error: { code: 'RESULT_TOO_LARGE', message: 'internal text is not reflected' } } }));
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'Too many possible comparisons' })).toBeVisible();
  await expect(page.getByLabel('Where are you going?')).toHaveValue(context.cityName);
  await expect(page.getByText('internal text is not reflected')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
});

test('upstream labels are plain text and offsite handoff URLs are rejected', async ({ page }) => {
  const data = searchResponse();
  const hostileName = '<img src=x onerror=alert(1)>';
  data.offers[0].candidates[0].name = hostileName;
  data.offers[0].handoffUrl = 'https://www.priceline.com.evil.example/redirect';
  await mockOffers(page, data);
  await page.goto(searchPath);
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  await expect(page.getByRole('heading', { name: hostileName, exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Original offer unavailable' })).toBeDisabled();
});

test('unsupported occupancy URLs cannot silently become a different trip', async ({ page }) => {
  let searches = 0;
  page.on('request', (request) => { if (request.url().includes('/api/v1/hotelDeals')) searches++; });
  await page.goto(searchPath.replace('rooms=1', 'rooms=9'));
  await expect(page.getByRole('heading', { name: /Let’s check your trip/ })).toBeVisible();
  expect(searches).toBe(0);
});

async function auditAccessibility(page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
  });
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
}

test('landing and result states have no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  let results = await auditAccessibility(page);
  expect(results.violations).toEqual([]);
  await mockOffers(page);
  await page.goto(searchPath);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  results = await auditAccessibility(page);
  expect(results.violations).toEqual([]);
  await page.getByRole('link', { name: /View candidate.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  results = await auditAccessibility(page);
  expect(results.violations).toEqual([]);
});

test('320 CSS pixel reflow keeps content and primary controls in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
  await mockOffers(page);
  await page.goto(searchPath);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test('a 336-character Express offer ID survives candidate URLs, detail requests, and the original handoff', async ({ page }) => {
  const offerId = 'a1b2c3d4'.repeat(42);
  expect(offerId).toHaveLength(336);
  const search = searchResponse();
  search.offers[0].offerId = offerId;
  search.offers[0].handoffUrl = search.offers[0].handoffUrl.replace('/offer-one/', `/${offerId}/`);
  const detail = {
    ...detailResponse(),
    offer: search.offers[0],
    detailStatus: 'available',
    details: { ...detailResponse().details, description: null, address: '123 Synthetic Avenue, Las Vegas' },
  };
  const detailInputs = [];
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: search }));
  await page.route('**/api/v1/deal', async route => {
    detailInputs.push(route.request().postDataJSON());
    await route.fulfill({ json: detail });
  });
  await page.goto(searchPath);
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  const candidate = page.getByRole('link', { name: /View candidate.*Juniper House/ });
  const candidateUrl = new URL(await candidate.getAttribute('href'), page.url());
  expect(candidateUrl.searchParams.get('offerId')).toBe(offerId);
  await candidate.click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.getByText('123 Synthetic Avenue, Las Vegas', { exact: true })).toBeVisible();
  await expect.poll(() => detailInputs.length).toBe(1);
  expect(detailInputs).toEqual([{ ...context, offerId, hotelId: 'hotel-one' }]);
  expect(new URL(page.url()).searchParams.get('offerId')).toBe(offerId);
  const handoff = page.getByRole('link', { name: /View original Express offer/ });
  await expect(handoff).toHaveAttribute('href', search.offers[0].handoffUrl);
  await expect(handoff).toHaveAttribute('target', '_blank');
  await page.getByRole('link', { name: /Back to results/ }).click();
  expect(new URL(page.url()).searchParams.getAll('expanded')).toContain(offerId);
  await page.goto(candidateUrl.href);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect.poll(() => detailInputs.length).toBe(2);
  expect(detailInputs[1]).toEqual({ ...context, offerId, hotelId: 'hotel-one' });
  await expect(page.getByText('123 Synthetic Avenue, Las Vegas', { exact: true })).toBeVisible();
  await expect(handoff).toHaveAttribute('href', search.offers[0].handoffUrl);
});

test('expired candidate metadata preserves a fresh offer until the offer itself expires', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  const detail = {
    ...detailResponse(),
    expiresAt: new Date(now - 1000).toISOString(),
    offerExpiresAt: new Date(now + 60000).toISOString(),
    detailStatus: 'available',
    details: {
      ...detailResponse().details,
      retailQuote: { nightlyCents: 15900, stayCents: 31800, currency: 'USD', taxesFees: 'included' },
    },
  };
  await page.route('**/api/v1/deal', route => route.fulfill({ json: detail }));
  await page.goto(`/deal?${new URLSearchParams({ ...context, offerId: detail.offer.offerId, hotelId: detail.candidate.hotelId })}`);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  const handoff = page.getByRole('link', { name: /View original Express offer/ });
  await expect(handoff).toBeVisible();
  await expect(handoff).toHaveAttribute('href', detail.offer.handoffUrl);
  await expect(page.getByText('The retail price is out of date.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh retail price', exact: true })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Separate retail quote', exact: true })).toHaveCount(0);
  await expect(page.getByText('$159', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Original Express quote', exact: true })).toContainText('$119');
  await expect(page.getByText('This quote is out of date.', { exact: true })).toHaveCount(0);
  await page.clock.fastForward(61000);
  await expect(page.getByText('This quote is out of date.', { exact: true })).toBeVisible();
  await expect(handoff).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Original offer unavailable', exact: true })).toBeDisabled();
});

test('multiroom quotes distinguish a per-room nightly rate from the entire stay total', async ({ page }) => {
  const trip = { ...context, rooms: 2, adults: 4 };
  const search = searchResponse({ context: trip });
  search.offers[0].quote = {
    ...search.offers[0].quote,
    nightlyCents: 11900,
    stayCents: 47600,
    roomCount: 2,
    nightlyBasis: 'per-room',
    stayBasis: 'all-rooms',
  };
  search.offers[0].handoffUrl = search.offers[0].handoffUrl.replace('/rooms/1/adults/2', '/rooms/2/adults/4');
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: search }));
  await page.route('**/api/v1/deal', route => route.fulfill({ json: { ...detailResponse(), context: trip, offer: search.offers[0] } }));
  const checkQuote = async () => {
    const quote = page.getByRole('region', { name: 'Original Express quote', exact: true });
    await expect(quote).toContainText('$119 / room / night');
    await expect(quote).toContainText('$476 for 2 rooms, entire stay');
    await expect(quote).toContainText('Taxes and fees not confirmed');
  };
  await page.goto(`/results?${new URLSearchParams(trip)}`);
  await checkQuote();
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  await page.getByRole('link', { name: /View candidate.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await checkQuote();
});
