import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockOffers, openTripEditor, searchPath } from './fixtures.js';

async function expectReadable(page, stage) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
  });
  const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect.soft(result.violations.map(({ id, nodes }) => ({
    id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
  })), stage).toEqual([]);
}

test('theme follows the system until a keyboard choice and persists across navigation and reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  const toggle = page.getByRole('button', { name: 'Switch to dark theme', exact: true });
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await toggle.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Privacy, plainly.' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('theme remains usable when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage unavailable', 'SecurityError'); } });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('dark home and its destination and traveler portals remain readable', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expectReadable(page, 'home');
  await page.screenshot({ path: testInfo.outputPath('dark-home.png'), fullPage: true });
  await page.getByLabel('Where are you going?').fill('Tel Aviv');
  await expect(page.locator('.destination-popup:visible')).toHaveCSS('opacity', '1');
  await expectReadable(page, 'destination suggestions');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Travelers,/ }).click();
  await expect(page.locator('.travelers-popup:visible')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Increase children', exact: true }).click();
  await expectReadable(page, 'travelers');
  await page.getByRole('combobox', { name: 'Child 1 age', exact: true }).click();
  await expect(page.locator('.child-age-field .ant-select-dropdown:visible')).toHaveCSS('opacity', '1');
  await expectReadable(page, 'child ages');
});

test('dark results, selected calendar dates, hotel details and policy remain readable', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await mockOffers(page);
  await page.goto(searchPath);
  await expect(page.getByRole('link', { name: 'View hotel & prices', exact: true })).toBeVisible();
  await expectReadable(page, 'results');
  await openTripEditor(page);
  await page.getByLabel('Check-in', { exact: true }).click();
  await expect(page.locator('.travel-calendar-popup:visible')).toHaveCSS('opacity', '1');
  await expectReadable(page, 'calendar including selected date');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'View hotel & prices', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Juniper House' })).toBeVisible();
  await expectReadable(page, 'hotel details');
  await page.screenshot({ path: testInfo.outputPath('dark-details.png'), fullPage: true });
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expectReadable(page, 'privacy');
});
