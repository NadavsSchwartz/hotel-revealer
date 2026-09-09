import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import { detailResponse } from './fixtures.js';

const picture = fileURLToPath(new URL('../../frontend/static/media/stay-hero.webp', import.meta.url));
const imageUrl = name => `https://images.priceline.com/detail-content/${name}.webp`;
const detailPath = data => `/deal?${new URLSearchParams({ ...data.context, offerId: data.offer.offerId, hotelId: data.candidate.hotelId })}`;
function populated() {
  const data = detailResponse();
  data.detailStatus = 'available';
  data.quoteStatus = 'available';
  data.offer.quote = { ...data.offer.quote, totalCents: 26800, totalTaxesFees: 'included', taxesFees: 'excluded' };
  data.candidate.hotelId = '48700';
  data.candidate.name = 'Harbor & Pine';
  data.details = { ...data.details, description: null, address: '5 Main Street #7, Las Vegas, NV', images: Array.from({ length: 8 }, (_, index) => imageUrl(index + 1)) };
  return data;
}

test('photo browsing loads on demand, handles a failed image and restores keyboard focus', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const data = populated();
  const requested = [];
  let calls = 0;
  await page.route('https://images.priceline.com/detail-content/**', route => {
    requested.push(route.request().url());
    return route.request().url() === imageUrl(5) ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ path: picture });
  });
  await page.route('**/api/v1/deal', route => { calls++; return route.fulfill({ json: data }); });
  await page.goto(detailPath(data));
  const open = page.getByRole('button', { name: 'View all 8 photos', exact: true });
  await expect(open).toBeVisible();
  await expect(page.locator('.property-photo-grid img')).toHaveCount(4);
  expect(requested.some(url => [5, 6, 7, 8].some(index => url === imageUrl(index)))).toBe(false);
  await open.focus();
  await open.press('Enter');
  const viewer = page.getByRole('dialog', { name: 'Harbor & Pine photos', exact: true });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText('1 of 8', { exact: true })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await viewer.getByRole('button', { name: 'Next', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByText('2 of 8', { exact: true })).toBeVisible();
  for (let index = 0; index < 3; index++) await viewer.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(viewer.getByText('This photo couldn’t load. Try another photo.', { exact: true })).toBeVisible();
  await viewer.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(viewer.getByRole('img', { name: /property photograph/ })).toHaveAttribute('src', imageUrl(6));
  await expect.poll(() => viewer.getByRole('img', { name: /property photograph/ }).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(requested.includes(imageUrl(7))).toBe(false);
  expect(requested.includes(imageUrl(8))).toBe(false);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const accessibility = await new AxeBuilder({ page }).include('.property-photo-modal').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('photo-viewer-dark.png') });
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(calls).toBe(1);
});

test('location and reviews link to the named property while amenities retain their qualifiers', async ({ page }, testInfo) => {
  const data = populated();
  data.details.images = [];
  data.details.amenities = ['Ironing services', 'Free Wi-Fi', 'Valet parking (charges may apply)', 'Outdoor pool', 'Breakfast available', 'Wheelchair accessible', 'Fitness center', 'Air conditioning', 'Restaurant', 'Luggage storage'];
  let calls = 0;
  await page.route('**/api/v1/deal', route => { calls++; return route.fulfill({ json: data }); });
  await page.goto(detailPath(data));
  const maps = page.getByRole('link', { name: /Open in Google Maps/ });
  const href = new URL(await maps.getAttribute('href'));
  expect(href.origin + href.pathname).toBe('https://www.google.com/maps/search/');
  expect(href.searchParams.get('api')).toBe('1');
  expect(href.searchParams.get('query')).toBe(`${data.candidate.name}, ${data.details.address}`);
  expect(href.hash).toBe('');
  const reviews = page.getByRole('link', { name: /Read reviews on Priceline/ });
  await expect(reviews).toHaveAttribute('href', 'https://www.priceline.com/relax/at/48700');
  for (const link of [maps, reviews]) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(page.getByRole('link', { name: /Check price on Priceline/ })).toHaveAttribute('href', data.offer.handoffUrl);
  const amenities = page.locator('#hotel-amenities');
  await expect(amenities.getByRole('listitem')).toHaveCount(6);
  await expect(amenities).toContainText('Valet parking (charges may apply)');
  await expect(amenities).toContainText('Breakfast available');
  await expect(amenities).not.toContainText('Free parking');
  await expect(amenities).not.toContainText('Ironing services');
  const expand = page.getByRole('button', { name: 'Show all 10 amenities', exact: true });
  await expand.click();
  await expect(page.getByRole('button', { name: 'Show fewer amenities', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(amenities.getByRole('listitem')).toHaveCount(10);
  await expect(amenities).toContainText('Ironing services');
  await page.getByRole('button', { name: 'Show fewer amenities', exact: true }).click();
  await expect(amenities.getByRole('listitem')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'About the property', exact: true })).toHaveCount(0);
  await expect(page.getByText('Street address unavailable.', { exact: true })).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`hotel-facts-${width}.png`), fullPage: true });
  }
  expect(calls).toBe(1);
});

test('a retained gallery survives a smaller photo response and disappears with withdrawn hotel inference', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const data = populated();
  data.offerExpiresAt = new Date(now + 300000).toISOString();
  data.offer.quoteExpiresAt = new Date(now + 60000).toISOString();
  let release;
  const pause = () => new Promise(resolve => { release = resolve; });
  let calls = 0;
  await page.route('https://images.priceline.com/detail-content/**', route => route.fulfill({ path: picture }));
  await page.route('**/api/v1/deal', async route => {
    calls++;
    if (calls === 1) return route.fulfill({ json: data });
    if (calls === 2) {
      await pause();
      return route.fulfill({ json: { ...data, offer: { ...data.offer, quoteExpiresAt: new Date(now + 120000).toISOString() }, details: { ...data.details, images: [imageUrl('new-one'), imageUrl('new-two')] } } });
    }
    if (calls === 3) await pause();
    if (calls === 3 || calls === 4) return route.fulfill({ json: { ...data,
      offer: { ...data.offer, quoteExpiresAt: new Date(now + calls * 60000).toISOString() },
      details: { ...data.details, images: calls === 3 ? [] : data.details.images.slice(0, 2) } } });
    return route.fulfill({ json: { ...data,
      offer: { ...data.offer, resolution: { status: 'unresolved', reason: 'no_match' }, candidates: [] },
      candidate: null, details: null, detailStatus: 'unavailable' } });
  });
  await page.goto(detailPath(data));
  await expect(page.getByRole('button', { name: 'View all 8 photos' })).toBeVisible();
  await page.clock.fastForward(61000);
  await page.getByRole('button', { name: 'Refresh total price', exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await page.getByRole('button', { name: 'View all 8 photos' }).click();
  const viewer = page.getByRole('dialog', { name: 'Harbor & Pine photos', exact: true });
  for (let index = 0; index < 5; index++) await viewer.getByRole('button', { name: 'Next', exact: true }).click();
  release();
  await expect(viewer.getByText('2 of 2', { exact: true })).toBeVisible();
  await expect(viewer.getByRole('img', { name: /property photograph/ })).toHaveAttribute('src', imageUrl('new-two'));
  await expect(viewer.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  const previous = viewer.getByRole('button', { name: 'Previous', exact: true });
  await previous.focus();
  await previous.press('Enter');
  await expect(viewer.getByRole('img', { name: /property photograph/ })).toHaveAttribute('src', imageUrl('new-one'));
  await expect(previous).toBeDisabled();
  await expect(previous).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(viewer.getByText('1 of 2', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'View all 2 photos' })).toBeFocused();
  await page.clock.fastForward(60000);
  await page.getByRole('button', { name: 'Refresh total price', exact: true }).click();
  await expect.poll(() => calls).toBe(3);
  await page.getByRole('button', { name: 'View all 2 photos' }).click();
  await expect(viewer).toBeVisible();
  release();
  await expect(viewer).toHaveCount(0);
  await page.clock.fastForward(60000);
  await page.getByRole('button', { name: 'Refresh total price', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View all 2 photos' })).toBeVisible();
  await expect(viewer).toHaveCount(0);
  await page.clock.fastForward(60000);
  await page.getByRole('button', { name: 'Refresh total price', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Harbor & Pine', exact: true })).toHaveCount(0);
  await expect(page.locator('.property-photos, .detail-external-link')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Check current price on Priceline/ })).toHaveAttribute('href', data.offer.handoffUrl);
});
