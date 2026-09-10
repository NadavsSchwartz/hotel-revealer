import { present, chooseSort } from './fixtures.ts';
import type { Page } from '@playwright/test';
import type { BrowserRequest } from './fixtures.ts';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import { queryParams, context, detailResponse, mockOffers, openTripEditor, searchPath, searchResponse, tripRequest } from './fixtures.ts';

async function chooseDestination(page: Page, query: string, region: string) {
  await page.getByLabel('Where are you going?').fill(query);
  const option = page.locator('.destination-popup [role="option"]').filter({ has: page.locator('strong').getByText(query, { exact: true }), hasText: region });
  await expect(option).toBeVisible();
  await option.click();
}

async function chooseDate(page: Page, label: string, date: string) {
  const input = page.getByLabel(label, { exact: true });
  if (await input.getAttribute('aria-expanded') !== 'true') await input.click();
  const calendar = page.locator('.travel-calendar-popup:visible');
  await expect(calendar).toHaveCount(1);
  await expect(calendar).toBeVisible();
  const day = calendar.locator(`[data-day="${date}"]`);
  for (let month = 0; month < 13 && await day.count() === 0; month++) {
    await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
  }
  await expect(day.locator('button')).toBeEnabled();
  await day.locator('button').click();
}

test('cleared inputs are validated and focused without an API request', async ({ page }) => {
  let searches = 0;
  page.on('request', (request) => { if (request.url().includes('/api/v1/hotelDeals')) searches++; });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect(page.getByLabel('Where are you going?')).toBeFocused();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect.poll(() => page.locator('#cityName-error').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  })).toBe(true);
  expect(searches).toBe(0);
});

test('the explicitly disabled provider returns a useful recovery state without live access', async ({ page }) => {
  const health = await page.request.get('/health');
  expect(await health.json()).toMatchObject({ provider: { available: false } });
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'Live search is not connected yet' })).toBeVisible();
  await expect.poll(() => page.locator('.direction-footer').evaluate(footer =>
    Math.abs(footer.getBoundingClientRect().bottom + window.scrollY - document.documentElement.scrollHeight),
  )).toBeLessThan(2);
  await openTripEditor(page);
  await expect(page.getByLabel('Where are you going?')).toHaveValue(context.cityName);
});

test('a likely hotel, unavailable details, and original handoff stay separate', async ({ page }) => {
  const searches: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', async route => {
    searches.push(tripRequest(route));
    await route.fulfill({ json: searchResponse() });
  });
  const details: BrowserRequest[] = [];
  await page.route('**/api/v1/deal', route => {
    details.push(tripRequest(route));
    return route.fulfill({ json: detailResponse() });
  });
  await page.goto('/');
  await chooseDestination(page, 'Las Vegas', 'Nevada, United States');
  await chooseDate(page, 'Check-in', context.checkIn);
  await chooseDate(page, 'Check-out', context.checkOut);
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect(page).toHaveURL(/\/results\?/);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.booking-note').first()).toContainText('Taxes and fees unconfirmed');
  await expect(page.getByRole('link', { name: /View likely hotel:/ })).toHaveCount(1);
  await expect(page.getByText('Likely hotel', { exact: true })).toBeVisible();
  await chooseSort(page, 'Lowest room rate');
  expect(searches).toEqual([context]);
  expect(details).toHaveLength(0);
  await page.getByRole('link', { name: 'View hotel details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Location', exact: true })).toBeVisible();
  await expect(page.getByText('Additional hotel information is unavailable.', { exact: true })).toHaveCount(0);
  await expect(page.locator('.detail-retail')).toHaveCount(0);
  await expect(page.getByText('We couldn’t get the total price.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveAttribute('href', present(searchResponse().offers[0].handoffUrl));
  expect(details).toEqual([{ ...context, offerId: 'offer-one', hotelId: 'hotel-one' }]);
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(page.getByLabel('Sort by')).toHaveText('Lowest room rate');
  await expect(page.getByRole('link', { name: 'View hotel details', exact: true })).toBeFocused();
  expect(searches).toHaveLength(1);
});

test('a partial search without a hotel match has a useful empty state and no offer cards', async ({ page }) => {
  const data = searchResponse();
  data.coverage.status = 'partial';
  data.coverage.reason = 'Page limit';
  data.offers[0].resolution = { status: 'unresolved', reason: 'incomplete_search' };
  data.offers[0].candidates = [];
  await mockOffers(page, data);
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'No hotel matches found', exact: true })).toBeVisible();
  await expect(page.locator('.empty-panel')).toContainText('The search did not finish');
  await expect(page.locator('.offer-card')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Check.*Priceline|View likely hotel:/ })).toHaveCount(0);
});

test('an unrecoverable selection preserves results and offers an explicit fresh search', async ({ page }) => {
  const refreshed = searchResponse();
  refreshed.offers[0].offerId = 'refreshed-offer';
  refreshed.offers[0].handoffUrl = present(refreshed.offers[0].handoffUrl).replace('/offer-one/', '/refreshed-offer/');
  refreshed.offers[0].candidates = [{ ...present(refreshed.offers[0].candidates[0]), hotelId: 'hotel-refreshed', name: 'Cedar House' }];
  let searches = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', async route => {
    searches++;
    if (searches === 2) {
      await pending;
      return route.fulfill({ status: 502, json: { error: { code: 'PROVIDER_UNAVAILABLE' } } });
    }
    await route.fulfill({ json: searches === 1 ? searchResponse() : refreshed });
  });
  await page.route('**/api/v1/deal', route => route.fulfill({ status: 404, json: { error: { code: 'SELECTION_UNAVAILABLE' } } }));
  await page.goto(searchPath);
  await page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t reopen this offer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveAttribute('href', present(searchResponse().offers[0].handoffUrl));
  await expect(page.getByRole('link', { name: /Back to results/ })).toBeVisible();
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
  expect(searches).toBe(1);
  await page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t reopen this offer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Find current deals', exact: true }).click();
  try {
    await expect.poll(() => searches).toBe(2);
    await expect(page.getByRole('button', { name: 'Updating…', exact: true })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'We couldn’t load hotel information', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveAttribute('href', present(searchResponse().offers[0].handoffUrl));
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View likely hotel: Cedar House', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveAttribute('href', present(refreshed.offers[0].handoffUrl));
  expect(searches).toBe(3);
});

test('a withdrawn hotel inference keeps independently available original pricing and handoff', async ({ page }) => {
  const detail = detailResponse();
  detail.offer.resolution = { status: 'unresolved', reason: 'no_match' };
  detail.offer.candidates = [];
  detail.offer.quote = { ...detail.offer.quote, totalCents: 28000, totalTaxesFees: 'included', taxesFees: 'excluded' };
  detail.candidate = null;
  detail.details = null;
  detail.quoteStatus = 'available';
  await page.route('**/api/v1/deal', route => route.fulfill({ json: detail }));
  await page.goto(`/deal?${queryParams({ ...context, offerId: 'offer-one', hotelId: 'hotel-one' })}`);
  await expect(page.getByRole('heading', { name: 'Your Express offer', exact: true })).toBeVisible();
  await expect(page.getByText('We couldn’t match the selected hotel to this offer.', { exact: false })).toBeVisible();
  await expect(page.locator('.detail-quote-panel .quote-price')).toHaveText('$280 total');
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveAttribute('href', present(detail.offer.handoffUrl));
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
});

test('a malformed detail retry preserves the last valid hotel and original offer', async ({ page }) => {
  let calls = 0;
  await mockOffers(page);
  await page.route('**/api/v1/deal', route => route.fulfill({ json: ++calls === 1 ? detailResponse() : { malformed: true } }));
  await page.goto(searchPath);
  await page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Update price', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t read the hotel information', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveAttribute('href', present(searchResponse().offers[0].handoffUrl));
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
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
  let release!: () => void;
  const delay = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', async (route) => {
    const input = tripRequest(route);
    if (input.cityName === context.cityName) await delay;
    await route.fulfill({ json: searchResponse({ context: input }) }).catch(() => {});
  });
  await page.goto(searchPath);
  await openTripEditor(page);
  await chooseDestination(page, 'Chicago', 'Illinois, United States');
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hotel deals in Chicago' })).toBeVisible();
  release();
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await openTripEditor(page);
  await expect(page.getByLabel('Where are you going?')).toHaveValue('Chicago, United States');
  await expect(page.getByRole('heading', { name: 'Hotel deals in Las Vegas' })).toHaveCount(0);
});

test('successful empty results are an empty state, not endless loading', async ({ page }) => {
  await mockOffers(page, searchResponse({ offers: [], coverage: { status: 'complete', reason: null, pagesFetched: 1, offersFound: 0, namedHotelsChecked: 0, unassessedHotels: 0 } }));
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'No hotel matches found' })).toBeVisible();
});

test('a search capacity failure preserves the trip and recovers only when the traveler retries', async ({ page }) => {
  const searches: BrowserRequest[] = [];
  await page.clock.install({ time: Date.now() });
  await page.route('**/api/v1/hotelDeals', (route) => {
    searches.push(tripRequest(route));
    return searches.length === 1
      ? route.fulfill({ status: 503, json: { error: { code: 'RESULT_TOO_LARGE', message: 'internal text is not reflected' } } })
      : route.fulfill({ json: searchResponse() });
  });
  await page.goto(searchPath);
  const notice = page.getByRole('region', { name: 'Search status' });
  await expect(notice.getByRole('heading', { name: 'We couldn’t finish this search' })).toBeVisible();
  await expect(notice).toContainText('Your trip details are saved. Please try again.');
  await expect(page.getByLabel('Where are you going?')).toHaveValue(context.cityName);
  await expect(page.getByText('internal text is not reflected')).toHaveCount(0);
  await expect(notice).not.toContainText(/comparisons|assess safely|different dates|another city/);
  await expect(notice.getByRole('button', { name: 'Edit search', exact: true })).toHaveCount(0);
  await page.clock.fastForward(5000);
  expect(searches).toEqual([context]);
  await notice.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 hotel deal', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(searches).toEqual([context, context]);
});

test('upstream labels are plain text and offsite handoff URLs are rejected', async ({ page }) => {
  const data = searchResponse();
  const hostileName = '<img src=x onerror=alert(1)>';
  present(data.offers[0].candidates[0]).name = hostileName;
  data.offers[0].handoffUrl = 'https://www.priceline.com.evil.example/redirect';
  await mockOffers(page, data);
  await page.goto(searchPath);
  await expect(page.getByRole('link', { name: `View likely hotel: ${hostileName}`, exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Original offer link unavailable' })).toBeDisabled();
});

test('unsupported occupancy URLs cannot silently become a different trip', async ({ page }) => {
  let searches = 0;
  page.on('request', (request) => { if (request.url().includes('/api/v1/hotelDeals')) searches++; });
  await page.goto(searchPath.replace('rooms=1', 'rooms=9'));
  await expect(page.getByRole('heading', { name: 'Check your trip details', exact: true })).toBeVisible();
  expect(searches).toBe(0);
});

async function auditAccessibility(page: Page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
  });
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
}

test('landing and result states have no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.unboxed-application')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const sharedBackground = await page.locator('.unboxed-application').evaluate(element => getComputedStyle(element).backgroundColor);
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
  let results = await auditAccessibility(page);
  expect(results.violations).toEqual([]);
  await mockOffers(page);
  await page.goto(searchPath);
  await expect(page.locator('.unboxed-application')).toHaveCSS('background-color', sharedBackground);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  results = await auditAccessibility(page);
  expect(results.violations).toEqual([]);
  await page.getByRole('link', { name: /View likely hotel:.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.locator('.unboxed-application')).toHaveCSS('background-color', sharedBackground);
  results = await auditAccessibility(page);
  expect(results.violations).toEqual([]);
});

test('320 CSS pixel reflow keeps content and primary controls in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Search hotels', exact: true })).toBeVisible();
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
  search.offers[0].handoffUrl = present(search.offers[0].handoffUrl).replace('/offer-one/', `/${offerId}/`);
  const detail = {
    ...detailResponse(),
    offer: search.offers[0],
    detailStatus: 'available',
    details: { ...detailResponse().details, description: null, address: '123 Synthetic Avenue, Las Vegas' },
  };
  const detailInputs: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: search }));
  await page.route('**/api/v1/deal', async route => {
    detailInputs.push(tripRequest(route));
    await route.fulfill({ json: detail });
  });
  await page.goto(searchPath);
  const candidate = page.getByRole('link', { name: /View likely hotel:.*Juniper House/ });
  const candidateUrl = new URL(present(await candidate.getAttribute('href')), page.url());
  expect(candidateUrl.searchParams.get('offerId')).toBe(offerId);
  await candidate.click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.getByText('123 Synthetic Avenue, Las Vegas', { exact: true })).toBeVisible();
  await expect.poll(() => detailInputs.length).toBe(1);
  expect(detailInputs).toEqual([{ ...context, offerId, hotelId: 'hotel-one' }]);
  expect(new URL(page.url()).searchParams.get('offerId')).toBe(offerId);
  const handoff = page.getByRole('link', { name: /View deal on Priceline/ });
  await expect(handoff).toHaveAttribute('href', present(search.offers[0].handoffUrl));
  await expect(handoff).toHaveAttribute('target', '_blank');
  await page.getByRole('link', { name: /Back to results/ }).click();
  expect(new URL(page.url()).searchParams.has('expanded')).toBe(false);
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeFocused();
  await page.goto(candidateUrl.href);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect.poll(() => detailInputs.length).toBe(2);
  expect(detailInputs[1]).toEqual({ ...context, offerId, hotelId: 'hotel-one' });
  await expect(page.getByText('123 Synthetic Avenue, Las Vegas', { exact: true })).toBeVisible();
  await expect(handoff).toHaveAttribute('href', present(search.offers[0].handoffUrl));
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
  await page.goto(`/deal?${queryParams({ ...context, offerId: detail.offer.offerId, hotelId: present(detail.candidate).hotelId })}`);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  const handoff = page.getByRole('link', { name: /View deal on Priceline/ });
  await expect(handoff).toBeVisible();
  await expect(handoff).toHaveAttribute('href', present(detail.offer.handoffUrl));
  await expect(page.locator('.detail-retail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh retail price', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Separate retail quote', exact: true })).toHaveCount(0);
  await expect(page.getByText('$159', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Original Express quote', exact: true })).toContainText('$119');
  await expect(page.getByText('This quote is out of date.', { exact: true })).toHaveCount(0);
  await page.clock.fastForward(61000);
  await expect(page.getByText('The quoted price needs a refresh.', { exact: true })).toBeVisible();
  await expect(page.locator('.detail-quote-panel .quote-price')).toHaveCount(0);
  await expect(handoff).toHaveAttribute('href', present(detail.offer.handoffUrl));
});

test('result price labels follow the displayed basis, including zero and last-seen totals', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  let response = searchResponse();
  response.expiresAt = new Date(now + 60000).toISOString();
  response.offers[0].quote = { ...response.offers[0].quote, totalCents: 28000, totalTaxesFees: 'included' };
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: response }));
  await page.goto(searchPath);
  await expect(page.getByRole('region', { name: 'Total for your stay', exact: true }).locator('.quote-price')).toHaveText('$280 total');
  await page.clock.fastForward(61000);
  await expect(page.getByRole('region', { name: 'Last seen total', exact: true }).locator('.quote-price')).toHaveText('$280 total');
  await expect(page.getByRole('region', { name: 'Last seen room rate', exact: true })).toHaveCount(0);

  for (const [totalCents, totalTaxesFees, title, amount] of [
    [0, 'included', 'Total for your stay', '$0 total'],
    [28000, undefined, 'Room rate', '$119 / room / night'],
  ] as const) {
    response = searchResponse();
    response.retrievedAt = new Date(now + 61000).toISOString();
    response.expiresAt = new Date(now + 360000).toISOString();
    response.offers[0].quote = { ...response.offers[0].quote, totalCents, totalTaxesFees };
    await page.getByRole('button', { name: 'Update prices', exact: true }).click();
    await expect(page.getByRole('region', { name: title, exact: true }).locator('.quote-price')).toHaveText(amount);
  }
  response.offers[0].quote.nightlyCents = null;
  await page.getByRole('button', { name: 'Update prices', exact: true }).click();
  const stayOnly = page.getByRole('region', { name: 'Price', exact: true });
  await expect(stayOnly.locator('.quote-price')).toHaveText('Rate unavailable');
  await expect(stayOnly.locator('.quote-stay')).toHaveText('$238 for the stay · USD');
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
  search.offers[0].handoffUrl = present(search.offers[0].handoffUrl).replace('/rooms/1/adults/2', '/rooms/2/adults/4');
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: search }));
  await page.route('**/api/v1/deal', route => route.fulfill({ json: { ...detailResponse(), context: trip, offer: search.offers[0] } }));
  const checkQuote = async (title: string, compact = false) => {
    const quote = page.getByRole('region', { name: title, exact: true });
    await expect(quote).toContainText('$119 / room / night');
    await expect(quote).toContainText('$476 for 2 rooms, entire stay');
    if (compact) {
      await expect(quote.locator('.quote-context')).toHaveText('2 nights · 2 rooms');
      await expect(quote.locator('.quote-taxes')).toHaveCount(0);
      const amount = present(await quote.locator('.quote-amount').boundingBox());
      const unit = present(await quote.locator('.quote-price > span').boundingBox());
      expect(unit.x).toBeGreaterThan(amount.x);
      expect(unit.y).toBeLessThan(amount.y + amount.height);
      await expect(page.locator('.offer-booking .provider-handoff > p')).toHaveText('Taxes and fees unconfirmed; check final price and terms on Priceline.');
    } else await expect(quote).toContainText('Taxes and fees are not confirmed');
  };
  await page.goto(`/results?${queryParams(trip)}`);
  await checkQuote('Room rate', true);
  await page.getByRole('link', { name: /View likely hotel:.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await checkQuote('Original Express quote');
});

test('only matched deals count toward local sorting, pagination, and returning from hotel details', async ({ page }) => {
  const search = searchResponse();
  const base = search.offers[0];
  // Deliberately probe the existing browser fallback for a null rating, outside the backend DTO.
  const data = { ...search, offers: Array.from({ length: 25 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0');
    const matched = index !== 0;
    return {
      ...base, offerId: `offer-${ordinal}`, neighborhoodName: `Area ${ordinal}`,
      quote: { ...base.quote, nightlyCents: 11900 + index * 100, stayCents: 23800 + index * 200 },
      resolution: matched ? { status: 'matched' } : { status: 'unresolved', reason: 'no_match' },
      candidates: matched ? [{ ...present(base.candidates[0]), hotelId: `hotel-${ordinal}`, name: `Hotel ${ordinal}`, guestRating: index === 1 ? null : 8 + index / 100 }] : [],
    };
  }) };
  let searches = 0;
  let details = 0;
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: data }); });
  await page.route('**/api/v1/deal', route => {
    details++;
    const input = tripRequest(route);
    const offer = present(data.offers.find(item => item.offerId === input.offerId));
    return route.fulfill({ json: { ...detailResponse(), offer, candidate: present(offer.candidates[0]) } });
  });
  await page.goto(`${searchPath}&page=999&sort=evidence`);
  const cards = page.locator('.offer-list > article');
  await expect(page.getByRole('heading', { name: '24 hotel deals', exact: true })).toBeVisible();
  await expect(page.getByLabel('Sort by')).toHaveText('Lowest room rate');
  await expect(cards).toHaveCount(12);
  await expect(cards.first()).toHaveAccessibleName('Area 14');
  await expect(cards.last()).toHaveAccessibleName('Area 25');
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  const pagination = page.getByRole('navigation', { name: 'Results pages', exact: true });
  await expect(pagination.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await pagination.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(cards.first()).toHaveAccessibleName('Area 02');
  await expect(cards.last()).toHaveAccessibleName('Area 13');
  await expect(page.getByRole('heading', { name: '24 hotel deals', exact: true })).toBeFocused();
  await expect(page.getByText('We couldn’t identify this hotel.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Check total price/ })).toHaveCount(0);
  const selectedLink = cards.nth(8).getByRole('link', { name: 'View likely hotel: Hotel 10', exact: true });
  await selectedLink.scrollIntoViewIfNeeded();
  const savedScrollY = await page.evaluate(() => window.scrollY);
  expect(savedScrollY).toBeGreaterThan(0);
  await selectedLink.click();
  await expect(page.getByRole('heading', { name: 'Hotel 10', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(selectedLink).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - savedScrollY)).toBeLessThanOrEqual(2);
  await chooseSort(page, 'Highest guest rating');
  await expect(cards.first()).toHaveAccessibleName('Area 25');
  await expect(cards.last()).toHaveAccessibleName('Area 14');
  expect(new URL(page.url()).searchParams.get('page')).toBe('1');
  await pagination.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(cards.first()).toHaveAccessibleName('Area 13');
  await expect(cards.last()).toHaveAccessibleName('Area 02');
  await chooseSort(page, 'Highest star rating');
  await expect(cards.first()).toHaveAccessibleName('Area 02');
  expect(new URL(page.url()).searchParams.get('page')).toBe('1');
  await pagination.getByRole('button', { name: 'Next', exact: true }).click();
  await chooseSort(page, 'Biggest discount');
  await expect(cards.first()).toHaveAccessibleName('Area 02');
  expect(new URL(page.url()).searchParams.get('page')).toBe('1');
  expect(searches).toBe(1);
  expect(details).toBe(1);
});

test('the first search shows progress until the request returns an explicit empty result', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', async route => {
    await pending;
    await route.fulfill({ json: searchResponse({ offers: [], coverage: { status: 'complete', reason: null, pagesFetched: 1, offersFound: 0, namedHotelsChecked: 0, unassessedHotels: 0 } }) });
  });
  await page.goto(searchPath);
  const progress = page.getByRole('region', { name: 'Hotel search progress', exact: true });
  try {
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute('aria-busy', 'true');
    await expect(progress.getByRole('heading', { name: 'Searching hotel deals', exact: true })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Search hotels', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
    await expect(page.getByLabel('Where are you going?')).toBeFocused();
    await page.getByRole('button', { name: 'Hide form', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const lenses = progress.locator('.brand-lens');
    await expect(lenses).toHaveCount(2);
    for (const lens of await lenses.all()) {
      await expect(lens).toHaveCSS('animation-name', 'none');
      await expect(lens).toHaveCSS('transform', 'none');
    }
    await expect(page.getByRole('heading', { name: 'No hotel matches found', exact: true })).toHaveCount(0);
    await expect(page.locator('.offer-list > article')).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'No hotel matches found', exact: true })).toBeVisible();
  await expect(progress).toHaveCount(0);
});

test('last-seen room rates remain visible after five minutes, during refresh, and after an update failure', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  const initial = searchResponse({ expiresAt: new Date(now + 300000).toISOString() });
  const updated = searchResponse({ retrievedAt: new Date(now + 301000).toISOString(), expiresAt: new Date(now + 601000).toISOString() });
  updated.offers[0].quote = { ...updated.offers[0].quote, nightlyCents: 12900, stayCents: 25800 };
  let searches = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', async route => {
    searches++;
    if (searches === 1) return route.fulfill({ json: initial });
    if (searches === 2) {
      await pending;
      return route.fulfill({ json: updated });
    }
    return route.fulfill({ status: 503, json: { error: { code: 'PROVIDER_UNAVAILABLE' } } });
  });
  await page.goto(searchPath);
  await expect(page.locator('.quote-price')).toContainText('$119');
  await expect(page.getByText('About these results', { exact: true })).toHaveCount(0);
  await expect(page.locator('.results-toolbar')).toContainText('Prices checked');
  await page.clock.fastForward(301000);
  await expect(page.getByRole('region', { name: 'Last seen room rate', exact: true })).toContainText('$119');
  await expect(page.locator('.booking-note')).toHaveText('Taxes and fees unconfirmed; check current price and terms on Priceline.');
  expect(searches).toBe(1);
  await expect(page.getByText('These quotes need a refresh.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Update prices', exact: true }).click();
  try {
    await expect.poll(() => searches).toBe(2);
    await expect(page.getByRole('region', { name: 'Hotel search results', exact: true })).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('Updating hotel deals', { exact: true })).toBeVisible();
    await expect(page.locator('.results-updating .search-mark')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hotel search progress', exact: true })).toHaveCount(0);
    await expect(page.locator('.quote-price')).toContainText('$119');
    await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByText('$129', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hotel search results', exact: true })).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toBeVisible();
  await openTripEditor(page);
  await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t load hotel information', exact: true })).toBeVisible();
  await expect(page.getByText('$129', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true })).toBeVisible();
  expect(searches).toBe(3);
});

test('a likely hotel keeps property photos and available facts without ranked comparisons', async ({ page }, testInfo) => {
  const data = searchResponse();
  const offer = data.offers[0];
  const candidate = present(offer.candidates[0]);
  candidate.thumbnailUrl = 'https://mobileimg.priceline.com/browser-fixture/juniper.webp';
  const photos = ['one', 'two', 'three'].map(name => `https://mobileimg.priceline.com/browser-fixture/${name}.webp`);
  await page.route('https://mobileimg.priceline.com/browser-fixture/**', route => route.fulfill({
    path: fileURLToPath(new URL('../../frontend/static/media/stay-hero.webp', import.meta.url)),
  }));
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: data }));
  await page.route('**/api/v1/deal', route => route.fulfill({ json: {
    ...detailResponse(), offer, candidate, detailStatus: 'available',
    details: { ...detailResponse().details, images: photos },
  } }));
  await page.goto(searchPath);
  const preview = page.getByRole('link', { name: 'View likely hotel: Juniper House', exact: true });
  await expect.poll(() => preview.getByRole('img', { name: 'Juniper House', exact: true }).evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole('button', { name: /Why .*match/ })).toHaveCount(0);
  await preview.click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Juniper House, property photograph/ })).toHaveCount(3);
  await expect.poll(() => page.locator('.property-photo-grid img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Location', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Amenities', exact: true })).toBeVisible();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (testInfo.project.name === 'chromium') await page.screenshot({ path: testInfo.outputPath(`likely-hotel-${width}.png`), fullPage: true });
  }
});

test('a saved ambiguous-offer link opens a total-only view and preserves the original itinerary', async ({ page }, testInfo) => {
  const data = searchResponse();
  const offer = data.offers[0];
  offer.resolution = { status: 'unresolved', reason: 'ambiguous' };
  offer.candidates = [];
  const requests: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: data }));
  await page.route('**/api/v1/deal', route => {
    requests.push(tripRequest(route));
    return route.fulfill({ json: {
      ...detailResponse(), offer, candidate: null, details: null,
      detailStatus: 'not_requested', quoteStatus: 'unavailable',
    } });
  });
  await page.goto(searchPath);
  await expect(page.getByRole('heading', { name: 'No hotel matches found', exact: true })).toBeVisible();
  await expect(page.locator('.offer-card')).toHaveCount(0);
  await page.goto(`/deal?${queryParams({ ...context, offerId: offer.offerId })}`);
  await expect(page.getByRole('heading', { name: 'Your Express offer', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('hotelId')).toBe(false);
  await expect(page.getByText('We couldn’t get the total price.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update price', exact: true })).toBeEnabled();
  await expect(page.locator('.detail-property-preview, .detail-property-section, .detail-retail')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View deal on Priceline/ })).toHaveAttribute('href', present(offer.handoffUrl));
  expect(requests).toEqual([{ ...context, offerId: offer.offerId }]);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (testInfo.project.name === 'chromium') await page.screenshot({ path: testInfo.outputPath(`offer-only-${width}.png`), fullPage: true });
  }
  const accessibility = await auditAccessibility(page);
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(page.getByRole('heading', { name: 'No hotel matches found', exact: true })).toBeVisible();
  await expect(page.locator('.offer-card')).toHaveCount(0);
});

test('fee-inclusive totals and advertised discounts keep their basis and expire before the offer', async ({ page }, testInfo) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  const trip = { ...context, rooms: 2, adults: 4 };
  const detail = detailResponse();
  detail.context = trip;
  detail.quoteStatus = 'available';
  detail.expiresAt = new Date(now + 300000).toISOString();
  detail.offerExpiresAt = new Date(now + 300000).toISOString();
  detail.offer = {
    ...detail.offer,
    quoteExpiresAt: new Date(now + 60000).toISOString(),
    handoffUrl: present(detail.offer.handoffUrl).replace('/rooms/1/adults/2', '/rooms/2/adults/4'),
    quote: {
      nightlyCents: 11900, stayCents: 47600, totalCents: 53000,
      currency: 'USD', roomCount: 2, nightlyBasis: 'per-room', stayBasis: 'all-rooms',
      taxesFees: 'unknown', totalTaxesFees: 'included',
      advertisedDiscount: { percent: 20, source: 'Priceline' },
    },
  };
  const refreshed = {
    ...detail,
    offer: { ...detail.offer, quoteExpiresAt: new Date(now + 120000).toISOString(), quote: { ...detail.offer.quote, totalCents: 54000 } },
  };
  const requests: BrowserRequest[] = [];
  await page.route('**/api/v1/deal', route => {
    requests.push(tripRequest(route));
    return route.fulfill({ json: requests.length === 1 ? detail : refreshed });
  });
  await page.goto(`/deal?${queryParams({ ...trip, offerId: detail.offer.offerId, hotelId: present(detail.candidate).hotelId })}`);
  const quote = page.getByRole('region', { name: 'Original Express quote', exact: true });
  await expect(quote.locator('.quote-price')).toHaveText('$530 total');
  await expect(quote).toContainText('2 rooms · Entire stay · Taxes & fees included');
  await expect(quote.getByText('20% off', { exact: false })).toBeVisible();
  const discount = quote.getByText('20% off', { exact: false });
  await expect(discount).toHaveAttribute('title', /advertised room-rate discount/);
  await expect(discount).toHaveAttribute('title', /comparison rate, which may be estimated/);
  await expect(discount).toHaveAttribute('title', /Before taxes and fees/);
  await quote.locator('.quote-breakdown > summary').click();
  const row = (name: string) => quote.locator('dl > div').filter({ has: page.getByText(name, { exact: true }) });
  await expect(row('Room / night, before taxes').locator('dd')).toHaveText('$119');
  await expect(row('Room price for the stay').locator('dd')).toHaveText('$476');
  await expect(row('Taxes & fees for the stay').locator('dd')).toHaveText('$54');
  await expect(row('Quoted total').locator('dd')).toHaveText('$530');
  const handoff = page.getByRole('link', { name: /View deal on Priceline/ });
  await expect(handoff).toHaveAttribute('href', present(detail.offer.handoffUrl));
  if (testInfo.project.name === 'chromium') {
    const viewport = present(page.viewportSize());
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await quote.scrollIntoViewIfNeeded();
      await quote.screenshot({ path: testInfo.outputPath(`synthetic-total-${width}.png`) });
    }
    await page.setViewportSize(viewport);
  }
  await page.clock.fastForward(61000);
  await expect(quote.getByText('The quoted price needs a refresh.', { exact: true })).toBeVisible();
  await expect(quote.locator('.quote-price')).toHaveCount(0);
  await expect(quote.getByText('20% off', { exact: false })).toHaveCount(0);
  await expect(handoff).toBeVisible();
  await quote.getByRole('button', { name: 'Update price', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(quote.locator('.quote-price')).toHaveText('$540 total');
  await expect(handoff).toHaveAttribute('href', present(detail.offer.handoffUrl));
  expect(requests).toEqual(Array.from({ length: 2 }, () => ({ ...trip, offerId: detail.offer.offerId, hotelId: present(detail.candidate).hotelId })));
  expect(new URL(page.url()).pathname).toBe('/deal');
});
