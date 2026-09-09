import { present } from './fixtures.ts';
import type { Page, Locator } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { addCalendarDays, localToday } from '../../shared/travel.ts';
import { mockOffers, openTripEditor, searchPath } from './fixtures.ts';

declare global {
  interface Window { travelerScrollPositions: number[] }
}

const travelerDialog = (page: Page) => page.getByRole('dialog', { name: 'Who’s traveling?', exact: true });
const travelerTrigger = (page: Page) => page.getByRole('button', { name: /^Travelers,/ });

async function clickWithoutScrolling(locator: Locator) {
  // locator.click() scrolls portal ancestors before dispatching its pointer event.
  // These checks measure application scrolling, so click an already-visible target.
  await expect.poll(() => locator.evaluate(element => {
    const popup = element.closest('.travelers-popup');
    return !popup || Number(getComputedStyle(popup).opacity) === 1;
  })).toBe(true);
  await expect(locator).toBeInViewport({ ratio: 1 });
  const rect = present(await locator.boundingBox());
  await locator.page().mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

async function prepare(page: Page, width: number, screen: string) {
  await page.setViewportSize({ width, height: 844 });
  await mockOffers(page);
  await page.goto(screen === 'home' ? '/' : searchPath);
  if (screen === 'results') {
    await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
    await openTripEditor(page);
  }
  await page.evaluate(async () => { await document.fonts.ready; });
  const trigger = travelerTrigger(page);
  await trigger.evaluate(element => window.scrollTo({
    top: window.scrollY + element.getBoundingClientRect().top - 260,
    behavior: 'instant',
  }));
  await expect(trigger).toBeInViewport();
  return page.evaluate(() => {
    window.travelerScrollPositions = [window.scrollY];
    window.addEventListener('scroll', () => window.travelerScrollPositions.push(window.scrollY));
    return window.scrollY;
  });
}

async function expectPanelInViewport(page: Page) {
  await expect(travelerDialog(page)).toBeVisible();
  await expect.poll(() => travelerDialog(page).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight + 1
      && rect.left >= 0 && rect.right <= window.innerWidth + 1;
  })).toBe(true);
}

async function expectNoPageScroll(page: Page, initialScroll: number) {
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScroll);
  const positions = await page.evaluate(() => window.travelerScrollPositions);
  expect(positions.every(position => Math.abs(position - initialScroll) <= 1), JSON.stringify(positions)).toBe(true);
}

for (const width of [390, 1440]) {
  for (const screen of ['home', 'results']) {
    test(`traveler pointer edits preserve page position on ${screen} at ${width}px`, async ({ page }) => {
      const initialScroll = await prepare(page, width, screen);
      expect(initialScroll).toBeGreaterThan(0);
      const trigger = travelerTrigger(page);
      await clickWithoutScrolling(trigger);
      await expectPanelInViewport(page);
      await expect(trigger).toBeFocused();
      await expectNoPageScroll(page, initialScroll);
      const side = await page.locator('.travelers-popup:visible').getAttribute('data-placement');
      expect(['top', 'bottom']).toContain(side);

      await clickWithoutScrolling(page.getByRole('button', { name: 'Increase adults', exact: true }));
      await expect(trigger).toHaveAccessibleName('Travelers, 3 guests · 1 room');
      await expectNoPageScroll(page, initialScroll);
      for (let child = 1; child <= 3; child++) {
        await clickWithoutScrolling(page.getByRole('button', { name: 'Increase children', exact: true }));
        await expect(page.getByRole('combobox', { name: `Child ${child} age`, exact: true })).toBeAttached();
        await expectPanelInViewport(page);
        await expect(page.locator('.travelers-popup:visible')).toHaveAttribute('data-placement', present(side));
        await expectNoPageScroll(page, initialScroll);
      }
      expect(await travelerDialog(page).evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
      for (let child = 3; child > 0; child--) {
        await clickWithoutScrolling(page.getByRole('button', { name: 'Decrease children', exact: true }));
        await expect(page.getByRole('combobox', { name: `Child ${child} age`, exact: true })).toHaveCount(0);
        await expectPanelInViewport(page);
        await expectNoPageScroll(page, initialScroll);
      }
      await clickWithoutScrolling(page.getByRole('button', { name: 'Done', exact: true }));
      await expect(travelerDialog(page)).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expectNoPageScroll(page, initialScroll);
      await clickWithoutScrolling(trigger);
      await expectPanelInViewport(page);
      await page.keyboard.press('Escape');
      await expect(travelerDialog(page)).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expectNoPageScroll(page, initialScroll);
    });
  }

  test(`travelers preserve keyboard and required age focus at ${width}px`, async ({ page }) => {
    const initialScroll = await prepare(page, width, 'results');
    const trigger = travelerTrigger(page);
    await trigger.focus();
    await trigger.press('Enter');
    await expectPanelInViewport(page);
    await expect(page.getByRole('button', { name: 'Increase rooms', exact: true })).toBeFocused();
    await expectNoPageScroll(page, initialScroll);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expectPanelInViewport(page);
    await page.getByRole('button', { name: 'Increase children', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
    await expectPanelInViewport(page);
    const childAge = page.getByRole('combobox', { name: 'Child 1 age', exact: true });
    await expect(childAge).toBeFocused();
    await expect(childAge).toBeInViewport();
    await expect(travelerDialog(page).getByText('Enter an age from 0 to 17 for every child. Use 0 for infants under 1.', { exact: true })).toBeVisible();
  });
}

test('travelers remain usable when the viewport changes while open', async ({ page }) => {
  await prepare(page, 390, 'results');
  const trigger = travelerTrigger(page);
  await clickWithoutScrolling(trigger);
  await expectPanelInViewport(page);
  for (let child = 1; child <= 3; child++) {
    await clickWithoutScrolling(page.getByRole('button', { name: 'Increase children', exact: true }));
    await expect(page.getByRole('combobox', { name: `Child ${child} age`, exact: true })).toBeAttached();
  }
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 600 }]) {
    await page.setViewportSize(viewport);
    await expectPanelInViewport(page);
    await expect(trigger).toBeInViewport();
    await expect(trigger).toHaveAccessibleName('Travelers, 5 guests · 1 room');
  }
  const scrollBeforePanelScroll = await page.evaluate(() => {
    window.travelerScrollPositions = [window.scrollY];
    return window.scrollY;
  });
  const rect = present(await travelerDialog(page).boundingBox());
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  const done = page.getByRole('button', { name: 'Done', exact: true });
  for (let gesture = 0; gesture < 3; gesture++) {
    const visible = await done.evaluate(element => {
      const button = element.getBoundingClientRect();
      const panel = element.closest('.travelers-panel');
      if (!panel) return false;
      const bounds = panel.getBoundingClientRect();
      return button.top >= bounds.top && button.bottom <= bounds.bottom;
    });
    if (visible) break;
    const previousScroll = await travelerDialog(page).evaluate(element => element.scrollTop);
    await page.mouse.wheel(0, 1000);
    await expect.poll(() => travelerDialog(page).evaluate(element => element.scrollTop)).toBeGreaterThan(previousScroll);
  }
  await expect(done).toBeInViewport({ ratio: 1 });
  await clickWithoutScrolling(done);
  await expect(travelerDialog(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectNoPageScroll(page, scrollBeforePanelScroll);
});


async function enterFreshHomeTrip(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Where are you going?', exact: true }).fill('Las Vegas');
  await page.getByRole('option').filter({ hasText: 'Nevada' }).first().click();
  const checkIn = addCalendarDays(localToday(), 14);
  const checkOut = addCalendarDays(checkIn, 3);
  await page.getByRole('combobox', { name: 'Check-in', exact: true }).click();
  for (const [label, date] of [['Check-in', checkIn], ['Check-out', checkOut]]) {
    const calendar = page.getByRole('dialog', { name: `${label} calendar`, exact: true });
    await expect(calendar).toBeVisible();
    const day = calendar.locator(`[data-day="${date}"] button`);
    for (let month = 0; month < 12 && await day.count() === 0; month++) {
      await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
    }
    await day.click();
  }
}

for (const width of [390, 1440]) {
  for (const dismissal of ['Close travelers', 'Done']) {
    test(`fresh Home pointer validation focuses the missing child age after ${dismissal} at ${width}px`, async ({ page }) => {
      let hotelRequests = 0;
      await page.route('**/api/v1/hotelDeals', route => {
        hotelRequests++;
        return route.fulfill({ status: 503, json: { error: { code: 'PROVIDER_NOT_CONFIGURED' } } });
      });
      await enterFreshHomeTrip(page, width);
      await travelerTrigger(page).click();
      await expectPanelInViewport(page);
      await clickWithoutScrolling(page.getByRole('button', { name: 'Increase children', exact: true }));
      const childAge = page.getByRole('combobox', { name: 'Child 1 age', exact: true });
      await expect(childAge).toBeAttached();
      await page.getByRole('button', { name: dismissal, exact: true }).click();
      await expect(travelerDialog(page)).toHaveCount(0);
      await page.getByRole('button', { name: 'Search hotels', exact: true }).click();
      await expectPanelInViewport(page);
      await expect(childAge).toBeFocused();
      await expect(childAge).toBeInViewport();
      await expect(childAge).toHaveAttribute('aria-invalid', 'true');
      await expect(travelerDialog(page).locator('#travelers-childrenAges-error')).toBeVisible();
      expect(hotelRequests).toBe(0);
    });
  }
}

test('the enabled child-age placeholder meets text contrast and the opened panel passes Axe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await travelerTrigger(page).click();
  await expectPanelInViewport(page);
  await clickWithoutScrolling(page.getByRole('button', { name: 'Increase children', exact: true }));
  const childAge = page.getByRole('combobox', { name: 'Child 1 age', exact: true });
  await expect(childAge).toBeEnabled();
  await expect(childAge).toHaveValue('');
  await expect(childAge.locator('option:checked')).toHaveText('Select age');
  await expect.poll(() => page.locator('.travelers-popup:visible').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  const colors = await childAge.evaluate(element => {
    const channels = (color: string) => {
      const values = color.match(/[\d.]+/g);
      if (!values) throw new Error(`No numeric channels in computed color: ${color}`);
      return values.map(Number);
    };
    const foreground = channels(getComputedStyle(element).color);
    let background = [255, 255, 255, 1];
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      const color = channels(getComputedStyle(parent).backgroundColor);
      if ((color[3] ?? 1) === 1) { background = color; break; }
    }
    let opacity = foreground[3] ?? 1;
    for (let node: Element | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    const rendered = foreground.slice(0, 3).map((value, index) => value * opacity + background[index] * (1 - opacity));
    const luminance = (values: number[]) => values.slice(0, 3).map(value => value / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const levels = [luminance(rendered), luminance(background)].sort((a, b) => b - a);
    return { foreground: rendered, background: background.slice(0, 3), opacity, contrast: (levels[0] + 0.05) / (levels[1] + 0.05) };
  });
  expect(colors.background).toEqual([255, 254, 248]);
  expect(colors.opacity).toBe(1);
  expect(colors.contrast, JSON.stringify(colors)).toBeGreaterThanOrEqual(4.5);
  const audit = await new AxeBuilder({ page }).include('.travelers-popup').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(audit.violations).toEqual([]);
});
