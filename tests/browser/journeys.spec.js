import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import { context, detailResponse, mockOffers, openTripEditor, searchPath, searchResponse } from './fixtures.js';

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
  await page.getByRole('button', { name: 'Find hotel deals', exact: true }).click();
  await expect(page.getByLabel('Where are you going?')).toBeFocused();
  await expect(page.getByRole('alert')).toBeVisible();
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
  await page.getByRole('button', { name: 'Find hotel deals', exact: true }).click();
  await expect(page).toHaveURL(/\/results\?/);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Additional taxes and fees may apply').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'View possible hotel: Juniper House', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View possible hotel: Desert House', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Why these matches?', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desert House', exact: true })).toBeVisible();
  await page.getByLabel('Sort by').selectOption('price');
  expect(searches).toHaveLength(1);
  expect(searches[0]).toEqual(context);
  await page.getByRole('link', { name: /View hotel details.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await expect(page.getByText('Additional hotel details are unavailable')).toBeVisible();
  await expect(page.getByText('One of 2 hotels matching this offer', { exact: true })).toBeVisible();
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
  await expect(page.getByText('These quotes need a refresh.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Why these matches?', exact: true }).click();
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh Express offers', exact: true })).toBeEnabled();
});

test('a rejected relationship invalidates cached matches and returns to a fresh search', async ({ page }) => {
  const refreshed = searchResponse();
  refreshed.offers[0].offerId = 'refreshed-offer';
  refreshed.offers[0].handoffUrl = refreshed.offers[0].handoffUrl.replace('/offer-one/', '/refreshed-offer/');
  refreshed.offers[0].candidates = [{ ...refreshed.offers[0].candidates[0], hotelId: 'hotel-refreshed', name: 'Cedar House' }];
  let searches = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', async route => {
    searches++;
    if (searches > 1) await pending;
    await route.fulfill({ json: searches === 1 ? searchResponse() : refreshed });
  });
  await page.route('**/api/v1/deal', route => route.fulfill({ status: 409, json: { error: { code: 'INVALID_SELECTION' } } }));
  await page.goto(searchPath);
  await page.getByRole('link', { name: 'View possible hotel: Juniper House', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'This match needs a fresh search', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Back to results/ })).toBeVisible();
  await page.getByRole('button', { name: 'Return to results', exact: true }).click();
  try {
    await expect.poll(() => searches).toBe(2);
    await expect(page.getByRole('region', { name: 'Hotel search progress', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View possible hotel: Juniper House', exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole('link', { name: 'View possible hotel: Cedar House', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toHaveAttribute('href', refreshed.offers[0].handoffUrl);
  expect(searches).toBe(2);
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
  await openTripEditor(page);
  await chooseDestination(page, 'Chicago', 'Illinois, United States');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hotel matches in Chicago' })).toBeVisible();
  release();
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await openTripEditor(page);
  await expect(page.getByLabel('Where are you going?')).toHaveValue('Chicago, United States');
  await expect(page.getByRole('heading', { name: 'Hotel matches in Las Vegas' })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Why these matches?', exact: true }).click();
  await expect(page.getByRole('heading', { name: hostileName, exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Original offer unavailable' })).toBeDisabled();
});

test('unsupported occupancy URLs cannot silently become a different trip', async ({ page }) => {
  let searches = 0;
  page.on('request', (request) => { if (request.url().includes('/api/v1/hotelDeals')) searches++; });
  await page.goto(searchPath.replace('rooms=1', 'rooms=9'));
  await expect(page.getByRole('heading', { name: 'Check your trip details', exact: true })).toBeVisible();
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
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
  let results = await auditAccessibility(page);
  expect(results.violations).toEqual([]);
  await mockOffers(page);
  await page.goto(searchPath);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Why these matches?', exact: true }).click();
  results = await auditAccessibility(page);
  expect(results.violations).toEqual([]);
  await page.getByRole('link', { name: /View hotel details.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  results = await auditAccessibility(page);
  expect(results.violations).toEqual([]);
});

test('320 CSS pixel reflow keeps content and primary controls in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Find hotel deals', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Why these matches?', exact: true }).click();
  const candidate = page.getByRole('link', { name: /View hotel details.*Juniper House/ });
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
  expect(new URL(page.url()).searchParams.has('expanded')).toBe(false);
  await expect(page.getByRole('button', { name: 'Hide match details', exact: true })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Refresh Express offers', exact: true })).toBeEnabled();
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
    await expect(quote).toContainText('Additional taxes and fees may apply');
  };
  await page.goto(`/results?${new URLSearchParams(trip)}`);
  await checkQuote();
  await page.getByRole('button', { name: 'Why these matches?', exact: true }).click();
  await page.getByRole('link', { name: /View hotel details.*Juniper House/ }).click();
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toBeVisible();
  await checkQuote();
});

test('offer pagination, sorting and expansion are local and return to the same results page', async ({ page }) => {
  const data = searchResponse();
  const base = data.offers[0];
  data.offers = Array.from({ length: 25 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0');
    const strong = [16, 24].includes(index);
    return {
      ...base,
      offerId: `offer-${ordinal}`,
      neighborhoodName: `Area ${ordinal}`,
      unassessedCount: 0,
      quote: { ...base.quote, nightlyCents: 11900 + index * 100, stayCents: 23800 + index * 200 },
      candidates: base.candidates.map((candidate, position) => ({
        ...candidate,
        hotelId: `hotel-${ordinal}-${position + 1}`,
        name: `Hotel ${ordinal}${position === 0 ? 'A' : 'B'}`,
        tier: strong ? 'supported' : 'partial',
        evidence: strong ? { supporting: ['Area agrees', 'Hotel class agrees', 'Guest score agrees', 'Review count agrees', 'Features agree'], missing: [] } : candidate.evidence,
      })),
    };
  });
  data.coverage = { ...data.coverage, offersFound: 25, namedHotelsChecked: 50, unassessedHotels: 0 };
  let searches = 0;
  let details = 0;
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: data }); });
  await page.route('**/api/v1/deal', route => {
    details++;
    const input = route.request().postDataJSON();
    const offer = data.offers.find(item => item.offerId === input.offerId);
    const candidate = offer.candidates.find(item => item.hotelId === input.hotelId);
    return route.fulfill({ json: { ...detailResponse(), offer, candidate } });
  });
  await page.goto(searchPath);
  const cards = page.locator('.offer-list > article');
  await expect(cards).toHaveCount(12);
  await expect(cards.first()).toHaveAccessibleName('Area 17');
  await page.getByLabel('Sort by').selectOption('price');
  await expect(cards.first()).toHaveAccessibleName('Area 01');
  await expect(cards.last()).toHaveAccessibleName('Area 12');
  await cards.first().getByRole('button', { name: 'Why these matches?', exact: true }).click();
  await expect(cards.first().getByRole('heading', { name: 'Hotel 01A', exact: true })).toBeVisible();
  const pagination = page.getByRole('navigation', { name: 'Results pages', exact: true });
  await pagination.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(cards).toHaveCount(12);
  await expect(cards.first()).toHaveAccessibleName('Area 13');
  await expect(cards.last()).toHaveAccessibleName('Area 24');
  await expect(page.getByRole('heading', { name: '25 Express offers', exact: true })).toBeFocused();
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  await cards.first().getByRole('button', { name: 'Why these matches?', exact: true }).click();
  await cards.first().getByRole('link', { name: /View hotel details.*Hotel 13A/ }).click();
  await expect(page.getByRole('heading', { name: 'Hotel 13A', exact: true })).toBeVisible();
  await expect.poll(() => details).toBe(1);
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(cards.first()).toHaveAccessibleName('Area 13');
  await expect(page.getByLabel('Sort by')).toHaveValue('price');
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  await expect(cards.first().getByRole('heading', { name: 'Hotel 13A', exact: true })).toBeVisible();
  await expect(cards.first().getByRole('link', { name: /View hotel details.*Hotel 13A/ })).toBeFocused();
  await pagination.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAccessibleName('Area 25');
  await expect(pagination.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByLabel('Sort by').selectOption('evidence');
  await expect(cards).toHaveCount(12);
  await expect(cards.first()).toHaveAccessibleName('Area 17');
  expect(new URL(page.url()).searchParams.get('page')).toBe('1');
  expect(searches).toBe(1);
  expect(details).toBe(1);
});

test('the first search shows progress until the request returns an explicit empty result', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', async route => {
    await pending;
    await route.fulfill({ json: searchResponse({ offers: [], coverage: { status: 'complete', reason: null, pagesFetched: 1, offersFound: 0, namedHotelsChecked: 0, unassessedHotels: 0 } }) });
  });
  await page.goto(searchPath);
  const progress = page.getByRole('region', { name: 'Hotel search progress', exact: true });
  try {
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute('aria-busy', 'true');
    await expect(progress.getByRole('heading', { name: 'Finding your hotel matches', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No Express offers were returned', exact: true })).toHaveCount(0);
    await expect(page.locator('.offer-list > article')).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'No Express offers were returned', exact: true })).toBeVisible();
  await expect(progress).toHaveCount(0);
});

test('cached comparisons remain visible during a refresh and after an update failure', async ({ page }) => {
  const stale = searchResponse({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  const updated = searchResponse();
  updated.offers[0].quote = { ...updated.offers[0].quote, nightlyCents: 12900, stayCents: 25800 };
  let searches = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/hotelDeals', async route => {
    searches++;
    if (searches === 1) return route.fulfill({ json: stale });
    if (searches === 2) {
      await pending;
      return route.fulfill({ json: updated });
    }
    return route.fulfill({ status: 503, json: { error: { code: 'PROVIDER_UNAVAILABLE' } } });
  });
  await page.goto(searchPath);
  await expect(page.getByText('These quotes need a refresh.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh search', exact: true }).click();
  try {
    await expect.poll(() => searches).toBe(2);
    await expect(page.getByRole('region', { name: 'Hotel search results', exact: true })).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('Updating prices and hotel matches', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hotel search progress', exact: true })).toHaveCount(0);
    await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'View possible hotel: Juniper House', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Updating offer…', exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByText('$129', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hotel search results', exact: true })).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('link', { name: /View original Express offer/ })).toBeVisible();
  await openTripEditor(page);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The hotel provider is unavailable', exact: true })).toBeVisible();
  await expect(page.getByText('$129', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'View possible hotel: Juniper House', exact: true })).toBeVisible();
  expect(searches).toBe(3);
});

test('previews and property photos lead while the numerical comparison stays available on demand', async ({ page }) => {
  const data = searchResponse();
  const offer = data.offers[0];
  offer.clues = {
    guestRating: { kind: 'minimum', value: 8 },
    reviewCount: { kind: 'range', min: 700, max: 800 },
    amenities: { codes: ['SPOOL', 'FINTRNT'] },
  };
  const candidate = offer.candidates[0];
  candidate.thumbnailUrl = 'https://mobileimg.priceline.com/browser-fixture/juniper.webp';
  candidate.amenities = ['SPOOL', 'FINTRNT', 'FITSPA'];
  candidate.evidence = {
    supporting: [], missing: ['Feature coverage is incomplete'],
    comparisons: { neighborhood: 'match', stars: 'match', guestRating: 'match', reviewCount: 'match', amenities: 'unknown' },
  };
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
  const preview = page.getByRole('link', { name: 'View possible hotel: Juniper House', exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.getByRole('img', { name: 'Juniper House', exact: true }).evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Juniper House', exact: true })).toHaveCount(0);
  const comparison = page.getByRole('table', { name: 'Express offer compared with Juniper House', exact: true });
  await expect(comparison).toHaveCount(0);
  await page.getByRole('button', { name: 'Why these matches?', exact: true }).click();
  const checkComparison = async () => {
    await expect(comparison).toBeVisible();
    await expect(comparison.getByRole('columnheader')).toHaveText(['Clue', 'Express offer', 'This hotel']);
    const score = comparison.getByRole('row', { name: /Guest score/ });
    await expect(score.getByRole('cell').nth(0)).toHaveText('8+ / 10');
    await expect(score.getByRole('cell').nth(1)).toContainText('8.7 / 10');
    await expect(score.getByRole('cell').nth(1)).toContainText('Agrees');
    const reviews = comparison.getByRole('row', { name: /Reviews/ });
    await expect(reviews.getByRole('cell').nth(0)).toHaveText('700–800');
    await expect(reviews.getByRole('cell').nth(1)).toContainText('742');
    const features = comparison.getByRole('row', { name: /Features/ });
    await expect(features.getByRole('cell').nth(0)).toHaveText('Pool · Free internet');
    await expect(features.getByRole('cell').nth(1)).toContainText('Fitness center');
    await expect(features.getByRole('cell').nth(1)).toContainText('Not assessed');
  };
  await checkComparison();
  await page.getByRole('link', { name: /View hotel details.*Juniper House/ }).click();
  await expect(page.getByText('One of 2 hotels matching this offer', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Juniper House, property photograph/ })).toHaveCount(3);
  await expect.poll(() => page.locator('.detail-gallery img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(comparison).toHaveCount(0);
  const property = await page.locator('.detail-property-preview').boundingBox();
  const explanation = await page.locator('.detail-evidence').boundingBox();
  expect(property.y).toBeLessThan(explanation.y);
  await page.locator('.detail-evidence > summary').click();
  await checkComparison();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a large ambiguous match group reveals eight more hotels locally and retains them on return', async ({ page }) => {
  const data = searchResponse();
  const offer = data.offers[0];
  const original = offer.candidates[0];
  offer.unassessedCount = 0;
  data.coverage = { ...data.coverage, offersFound: 1, namedHotelsChecked: 20, unassessedHotels: 0 };
  offer.candidates = Array.from({ length: 20 }, (_, index) => ({
    ...original,
    hotelId: `ambiguous-hotel-${String(index + 1).padStart(2, '0')}`,
    name: `Hotel ${String(index + 1).padStart(2, '0')}`,
  }));
  let searches = 0;
  const details = [];
  await page.route('**/api/v1/hotelDeals', route => { searches++; return route.fulfill({ json: data }); });
  await page.route('**/api/v1/deal', route => {
    const input = route.request().postDataJSON();
    details.push(input);
    return route.fulfill({ json: { ...detailResponse(), offer, candidate: offer.candidates.find(item => item.hotelId === input.hotelId) } });
  });
  await page.goto(searchPath);
  await expect(page.getByRole('link', { name: /View possible hotel:/ })).toHaveCount(2);
  await expect(page.getByText('+18 more possible hotels in the comparison', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Why these matches?', exact: true }).click();
  const rows = page.locator('.candidate-row');
  await expect(rows).toHaveCount(8);
  await expect(rows.last()).toHaveAccessibleName('Hotel match: Hotel 08');
  await page.getByRole('button', { name: 'Show 8 more hotels', exact: true }).click();
  await expect(rows).toHaveCount(16);
  await expect(rows.last()).toHaveAccessibleName('Hotel match: Hotel 16');
  expect(searches).toBe(1);
  await page.getByRole('link', { name: /View hotel details.*Hotel 16/ }).click();
  await expect(page.getByRole('heading', { name: 'Hotel 16', exact: true })).toBeVisible();
  await expect(page.getByText('One of 20 hotels matching this offer', { exact: true })).toBeVisible();
  await expect.poll(() => details.length).toBe(1);
  expect(details[0]).toEqual({ ...context, offerId: offer.offerId, hotelId: 'ambiguous-hotel-16' });
  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(rows).toHaveCount(16);
  await expect(page.getByRole('button', { name: 'Show 4 more hotels', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View hotel details.*Hotel 16/ })).toBeFocused();
  expect(searches).toBe(1);
});

test('fee-inclusive totals and advertised discounts keep their basis and expire before the offer', async ({ page }, testInfo) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  const trip = { ...context, rooms: 2, adults: 4 };
  const detail = detailResponse();
  detail.context = trip;
  detail.expiresAt = new Date(now + 300000).toISOString();
  detail.offerExpiresAt = new Date(now + 300000).toISOString();
  detail.offer = {
    ...detail.offer,
    quoteExpiresAt: new Date(now + 60000).toISOString(),
    handoffUrl: detail.offer.handoffUrl.replace('/rooms/1/adults/2', '/rooms/2/adults/4'),
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
  const requests = [];
  await page.route('**/api/v1/deal', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: requests.length === 1 ? detail : refreshed });
  });
  await page.goto(`/deal?${new URLSearchParams({ ...trip, offerId: detail.offer.offerId, hotelId: detail.candidate.hotelId })}`);
  const quote = page.getByRole('region', { name: 'Original Express quote', exact: true });
  await expect(quote.locator('.quote-price')).toHaveText('$530 total');
  await expect(quote).toContainText('2 rooms · Entire stay · Taxes & fees included');
  await expect(quote.getByText('20% off', { exact: false })).toBeVisible();
  const discount = quote.getByText('20% off', { exact: false });
  await expect(discount).toHaveAttribute('title', /advertised room-rate discount/);
  await expect(discount).toHaveAttribute('title', /comparison rate, which may be estimated/);
  await expect(discount).toHaveAttribute('title', /Before taxes and fees/);
  await quote.locator('.quote-breakdown > summary').click();
  const row = name => quote.locator('dl > div').filter({ has: page.getByText(name, { exact: true }) });
  await expect(row('Room / night, before taxes').locator('dd')).toHaveText('$119');
  await expect(row('Room price for the stay').locator('dd')).toHaveText('$476');
  await expect(row('Taxes & fees for the stay').locator('dd')).toHaveText('$54');
  await expect(row('Quoted total').locator('dd')).toHaveText('$530');
  const handoff = page.getByRole('link', { name: /View original Express offer/ });
  await expect(handoff).toHaveAttribute('href', detail.offer.handoffUrl);
  if (testInfo.project.name === 'chromium') {
    const viewport = page.viewportSize();
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
  await quote.getByRole('button', { name: 'Refresh total price', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(quote.locator('.quote-price')).toHaveText('$540 total');
  await expect(handoff).toHaveAttribute('href', detail.offer.handoffUrl);
  expect(requests).toEqual(Array.from({ length: 2 }, () => ({ ...trip, offerId: detail.offer.offerId, hotelId: detail.candidate.hotelId })));
  expect(new URL(page.url()).pathname).toBe('/deal');
});
