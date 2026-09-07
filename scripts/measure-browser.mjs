// Local laboratory evidence only. Does not query a live hotel provider.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { mockOffers, searchPath } from '../tests/browser/fixtures.js';

const baseURL = process.env.LOCAL_URL || 'http://127.0.0.1:4320';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('This verification script only targets a local server.');
const output = 'output/verification';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const runs = [];
try {
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150, downloadThroughput: 1600000 / 8,
      uploadThroughput: 750000 / 8, connectionType: 'cellular4g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.lab = { lcpMs: 0, cls: 0, interactions: [] };
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.lab.lcpMs = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.lab.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (entry.interactionId) window.lab.interactions.push(entry.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Search offers' }).click();
    await page.getByLabel('Where are you going?').fill('Las Vegas, Nevada');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    runs.push(await page.evaluate(() => ({ ...window.lab, transferBytes: performance.getEntriesByType('resource').reduce((sum, resource) => sum + resource.transferSize, 0), overflow: document.documentElement.scrollWidth > innerWidth })));
    await context.close();
  }
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${output}/home-desktop.png`, fullPage: true });
  await page.keyboard.press('Tab');
  const firstKeyboardTarget = await page.locator(':focus').innerText();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${output}/home-mobile.png`, fullPage: true });
  await mockOffers(page);
  await page.goto(searchPath);
  await page.getByRole('button', { name: /Compare 2 candidates/ }).click();
  await page.screenshot({ path: `${output}/comparison-mobile-test-only.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: `${output}/comparison-desktop-test-only.png`, fullPage: true });
  await page.getByRole('link', { name: /View candidate.*Juniper House/ }).click();
  await page.getByRole('heading', { name: 'Juniper House', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/candidate-desktop-test-only.png`, fullPage: true });
  // Separate zoom/reflow check; this is not a full assistive-technology review.
  await page.goto('/');
  await page.addStyleTag({ content: 'html { zoom: 2; }' });
  const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const report = {
    measuredAt: new Date().toISOString(), browser: browser.version(), environment: 'Local production build; installed Chrome; no live hotel calls',
    profile: { viewport: '390x844', cpuSlowdown: 4, latencyMs: 150, downloadMbps: 1.6, uploadMbps: 0.75, cache: 'disabled each run' },
    runs, firstKeyboardTarget, zoomOverflow,
    limits: 'These are laboratory LCP/CLS and sampled event durations, not field p75/INP, real mobile-device evidence, or deployed VPS capacity. Comparison/detail screenshots use intercepted synthetic test responses; homepage screenshots use the real disabled-provider application.',
  };
  await writeFile(`${output}/browser-lab.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  await context.close();
} finally {
  await browser.close();
}
