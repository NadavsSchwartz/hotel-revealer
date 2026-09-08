// Local laboratory evidence only. Inventory is intercepted before every navigation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { detailResponse, searchResponse, searchPath } from '../tests/browser/fixtures.js';

const baseURL = process.env.LOCAL_URL || 'http://127.0.0.1:4320';
const origin = new URL(baseURL).origin;
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('This verification script only targets a local server.');
const gitRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const measuredRevision = process.env.MEASURED_REVISION || gitRevision;
const measuredAt = new Date().toISOString();
const output = path.resolve(process.env.OUTPUT_DIR || `output/verification/performance-${measuredRevision.slice(0, 12)}-${measuredAt.replaceAll(/[:.]/g, '-')}`);
await mkdir(path.dirname(output), { recursive: true });
// Refuse to overwrite an earlier measurement, including a supplied OUTPUT_DIR.
await mkdir(output);

const fixtureDelayMs = 500;
const fixtureOfferCount = 100;
const profile = { viewport: { width: 390, height: 844 }, cpuSlowdown: 4, latencyMs: 150, downloadMbps: 1.6, uploadMbps: 0.75, cache: 'disabled; fresh browser context per run', deviceScaleFactor: 1 };
const fixture = searchResponse();
fixture.offers = Array.from({ length: fixtureOfferCount }, (_, index) => ({
  ...fixture.offers[0], offerId: `offer-lab-${String(index + 1).padStart(3, '0')}`,
  neighborhoodName: `Test district ${index + 1}`,
  candidates: fixture.offers[0].candidates.map((candidate) => ({ ...candidate, tier: index === 0 ? 'supported' : candidate.tier })),
  quote: { ...fixture.offers[0].quote, nightlyCents: 20000 - index * 100, stayCents: (20000 - index * 100) * 2 },
}));
fixture.coverage = { ...fixture.coverage, offersFound: fixtureOfferCount, namedHotelsChecked: fixtureOfferCount * 3, unassessedHotels: fixtureOfferCount };

async function installFixtures(context, response = fixture) {
  const requests = { search: 0, detail: 0, blockedExternal: [] };
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      requests.blockedExternal.push(url.origin + url.pathname);
      return route.abort('blockedbyclient');
    }
    if (/^\/api\/v1\/(hotelDeals|deal)(?:\/|$)/.test(url.pathname)) {
      const isSearch = url.pathname.split('/')[3] === 'hotelDeals';
      requests[isSearch ? 'search' : 'detail']++;
      await delay(fixtureDelayMs);
      return route.fulfill({ json: isSearch ? response : detailResponse() });
    }
    return route.continue();
  });
  return requests;
}

async function installObservers(page) {
  await page.addInitScript(() => {
    window.lab = { lcp: null, cls: 0, clsTotal: 0, clsWindow: { start: 0, last: 0, value: 0 }, events: [], longTasks: [], action: null, supported: PerformanceObserver.supportedEntryTypes };
    const observe = (type, callback, options = {}) => {
      if (PerformanceObserver.supportedEntryTypes.includes(type)) new PerformanceObserver((list) => callback(list.getEntries())).observe({ type, buffered: true, ...options });
    };
    observe('largest-contentful-paint', (entries) => {
      for (const entry of entries) window.lab.lcp = { startTime: entry.startTime, renderTime: entry.renderTime, loadTime: entry.loadTime, size: entry.size, url: entry.url, element: entry.element?.outerHTML.slice(0, 600) };
    });
    observe('layout-shift', (entries) => {
      for (const entry of entries) {
        if (entry.hadRecentInput) continue;
        const lab = window.lab;
        if (entry.startTime - lab.clsWindow.last > 1000 || entry.startTime - lab.clsWindow.start > 5000) lab.clsWindow = { start: entry.startTime, last: entry.startTime, value: 0 };
        lab.clsWindow.value += entry.value;
        lab.clsWindow.last = entry.startTime;
        lab.clsTotal += entry.value;
        lab.cls = Math.max(lab.cls, lab.clsWindow.value);
      }
    });
    observe('event', (entries) => {
      for (const entry of entries) if (entry.interactionId) window.lab.events.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration, interactionId: entry.interactionId, inputDelayMs: entry.processingStart - entry.startTime, processingMs: entry.processingEnd - entry.processingStart });
    }, { durationThreshold: 16 });
    observe('longtask', (entries) => { for (const entry of entries) window.lab.longTasks.push({ startTime: entry.startTime, duration: entry.duration }); });
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, (event) => {
      if (window.lab.action && window.lab.action.startTime === null) window.lab.action.startTime = event.timeStamp;
    }, true);
  });
}

const afterPaint = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))));

async function sampleAction(page, name, action, waitForResult) {
  const eventIndex = await page.evaluate((name) => {
    window.lab.action = { name, startTime: null };
    return window.lab.events.length;
  }, name);
  await action();
  await waitForResult();
  const renderedAt = await afterPaint(page);
  const actionTiming = await page.evaluate(() => window.lab.action);
  assert.notEqual(actionTiming.startTime, null, `${name}: no trusted input event captured`);
  // Event Timing delivery is asynchronous; this wait is outside the render interval.
  await page.waitForTimeout(120);
  const events = await page.evaluate((index) => window.lab.events.slice(index), eventIndex);
  return { name, inputToVerifiedRenderMs: renderedAt - actionTiming.startTime, events, maxSampledEventDurationMs: events.length ? Math.max(...events.map((entry) => entry.duration)) : null };
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0].toJSON();
    const groups = Object.fromEntries(['js', 'css', 'image', 'font', 'other'].map((name) => [name, { requests: 0, transferBytes: 0, encodedBodyBytes: 0, decodedBodyBytes: 0 }]));
    const resources = performance.getEntriesByType('resource').map((entry) => {
      const pathname = new URL(entry.name).pathname;
      const group = /\.m?js$/.test(pathname) ? 'js' : /\.css$/.test(pathname) ? 'css' : /\.(avif|webp|png|jpe?g|svg|gif)$/.test(pathname) ? 'image' : /\.(woff2?|ttf|otf)$/.test(pathname) ? 'font' : 'other';
      groups[group].requests++;
      for (const [key, source] of [['transferBytes', 'transferSize'], ['encodedBodyBytes', 'encodedBodySize'], ['decodedBodyBytes', 'decodedBodySize']]) groups[group][key] += entry[source];
      return { url: entry.name, group, initiatorType: entry.initiatorType, startTime: entry.startTime, requestStart: entry.requestStart, responseStart: entry.responseStart, responseEnd: entry.responseEnd, duration: entry.duration, transferBytes: entry.transferSize, encodedBodyBytes: entry.encodedBodySize, decodedBodyBytes: entry.decodedBodySize };
    });
    const lcp = window.lab.lcp;
    const lcpResource = lcp?.url ? resources.find((entry) => entry.url === lcp.url) : null;
    return {
      lcpMs: lcp?.startTime ?? null, lcp, cls: window.lab.cls, clsTotal: window.lab.clsTotal,
      lcpBreakdown: lcpResource ? { documentTtfbMs: navigation.responseStart, resourceLoadDelayMs: lcpResource.requestStart - navigation.responseStart, resourceLoadDurationMs: lcpResource.responseEnd - lcpResource.requestStart, elementRenderDelayMs: lcp.startTime - lcpResource.responseEnd } : null,
      supportedObservers: window.lab.supported, longTasks: window.lab.longTasks,
      navigation, resourceGroups: groups, resources: resources.sort((a, b) => b.responseEnd - a.responseEnd),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

const browser = await chromium.launch({ channel: 'chrome' });
const runs = [];
try {
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({ baseURL, viewport: profile.viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const requests = await installFixtures(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await installObservers(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8, connectionType: 'cellular4g' });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const homeResponse = await page.goto('/', { waitUntil: 'networkidle' });
    const documentSha256 = createHash('sha256').update(await homeResponse.body()).digest('hex');
    await page.evaluate(() => document.fonts.ready);
    await afterPaint(page);
    const home = await readMetrics(page);
    if (run === 1) await page.screenshot({ path: `${output}/home-mobile-current.png`, fullPage: true });
    const searchButton = page.getByRole('button', { name: 'Find hotel deals', exact: true });
    await searchButton.scrollIntoViewIfNeeded();
    const validation = await sampleAction(page, 'empty search validation', () => searchButton.click(), () => page.locator('#cityName[aria-invalid="true"]').waitFor());
    assert.equal(requests.search, 0, 'Invalid form must not request inventory');
    assert.equal(requests.detail, 0);

    // A cold results navigation isolates rendering with a fixed synthetic response.
    await page.goto(searchPath, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: `${fixtureOfferCount} Express offers`, exact: true }).waitFor();
    await page.locator('.offer-card').last().waitFor();
    const resultsRenderedAt = await afterPaint(page);
    const fixtureSearchTiming = await page.evaluate((renderedAt) => {
      const request = performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === '/api/v1/hotelDeals');
      if (!request) throw new Error('No intercepted inventory timing recorded');
      return { navigationToRenderedResultsMs: renderedAt, requestStartMs: request.startTime, requestToResponseEndMs: request.responseEnd - request.startTime, responseEndToRenderedResultsMs: renderedAt - request.responseEnd };
    }, resultsRenderedAt);
    const results = await readMetrics(page);
    const renderedOfferCount = await page.locator('.offer-card').count();
    assert.equal(renderedOfferCount, 12, 'The 100-offer fixture must render a bounded first page');
    assert.equal(await page.locator('.offer-card').first().getAttribute('aria-labelledby'), 'offer-offer-lab-001-title');
    const sort = page.getByLabel('Sort by');
    await sort.focus();
    // Native select type-ahead chooses "Nightly price" on installed Chrome.
    const sorting = await sampleAction(page, 'sort 100 fixture offers by price', () => page.keyboard.press('n'), () => page.waitForFunction(() => document.querySelector('.offer-card')?.getAttribute('aria-labelledby') === 'offer-offer-lab-100-title'));
    const compare = page.getByRole('button', { name: 'Why these matches?', exact: true }).first();
    await compare.scrollIntoViewIfNeeded();
    const expansion = await sampleAction(page, 'expand first fixture comparison', () => compare.click(), () => page.locator('.offer-expanded').waitFor());
    if (run === 1) await page.screenshot({ path: `${output}/comparison-mobile-100-offers-test-only.png` });
    const nextPage = page.getByRole('navigation', { name: 'Results pages' }).getByRole('button', { name: /Next/ });
    await nextPage.scrollIntoViewIfNeeded();
    const pagination = await sampleAction(page, 'next page in 100 fixture offers', () => nextPage.click(), () => page.waitForFunction(() => document.querySelector('.offer-card')?.getAttribute('aria-labelledby') === 'offer-offer-lab-088-title'));
    assert.equal(requests.search, 1, 'Sort/expansion must not request more inventory');
    assert.equal(requests.detail, 0);
    assert.deepEqual(pageErrors, []);
    runs.push({ run, documentSha256, home, validation, fixtureResults: { ...fixtureSearchTiming, offerCount: fixtureOfferCount, renderedOfferCount, metrics: results, sorting, expansion, pagination }, interceptedRequests: requests, pageErrors });
    console.log(JSON.stringify({ run, homeLcpMs: home.lcpMs, homeCls: home.cls, fixtureResultsMs: fixtureSearchTiming.navigationToRenderedResultsMs, actionRenderMs: [validation, sorting, expansion, pagination].map((entry) => [entry.name, entry.inputToVerifiedRenderMs]) }));
    await context.close();
  }

  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await installFixtures(context, searchResponse());
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${output}/home-desktop-current.png`, fullPage: true });
  await page.goto(searchPath);
  await page.getByRole('button', { name: 'Why these matches?', exact: true }).click();
  await page.screenshot({ path: `${output}/comparison-desktop-test-only.png`, fullPage: true });
  await context.close();

  const report = {
    measuredAt, browser: browser.version(), gitRevision, measuredRevision, output,
    environment: 'Local production-build snapshot; installed Chrome; inventory endpoints intercepted before every navigation; external origins blocked',
    baseURL, profile, fixture: { offerCount: fixtureOfferCount, candidatesPerOffer: 2, responseDelayMs: fixtureDelayMs, realProviderLatency: false },
    runs,
    summary: { homeLcpMs: runs.map((run) => run.home.lcpMs), homeCls: runs.map((run) => run.home.cls), homeLcpTargetMs: 2500, allHomeRunsWithinLcpTarget: runs.every((run) => run.home.lcpMs !== null && run.home.lcpMs <= 2500) },
    limits: [
      'Three cold local lab runs are not field p75, real-device evidence, hosted capacity, or field INP.',
      'Event Timing reports only events at or above its 16 ms threshold. A null maximum means no qualifying sample, not zero latency. Browser event durations are quantized.',
      'Input-to-verified-render uses trusted input time through a DOM condition and two animation frames; it includes automation observation overhead and is a rendering proxy, not INP.',
      'Results navigation and response/render timings use 100 synthetic offers and a fixed 500 ms route delay; fulfilled-response transfer/throttling is not real provider/network performance.',
      'Resource transfer bytes are Resource Timing transferSize (including response header estimates); encoded/decoded body sizes are retained. The navigation document is reported separately.',
      'Font completion and network-idle delimit the initial-page sample. Screenshots named test-only use synthetic inventory, not actual hotels or prices.',
    ],
  };
  await writeFile(`${output}/browser-lab.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, browser: report.browser, measuredRevision, summary: report.summary }));
} finally {
  await browser.close();
}
