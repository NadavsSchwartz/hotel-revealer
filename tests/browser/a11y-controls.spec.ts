import type { BrowserRequest } from './fixtures.ts';
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { addCalendarDays, localToday, TRAVEL_LIMITS } from '../../shared/travel.ts';
import { queryParams, context, mockOffers, openTripEditor, searchPath, searchResponse, tripRequest } from './fixtures.ts';

const fullDate = (value: string) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const dateAfter = addCalendarDays;

for (const timezoneId of ['America/Los_Angeles', 'Asia/Tokyo']) {
  test.describe(`date-only calendar in ${timezoneId}`, () => {
    test.use({ timezoneId });
    test('selection across the November DST boundary preserves submitted calendar dates', async ({ page }) => {
      await page.clock.install({ time: new Date('2026-10-01T12:00:00Z') });
      const trip = { ...context, checkIn: '2026-10-31', checkOut: '2026-11-02' };
      const searches: BrowserRequest[] = [];
      await page.route('**/api/v1/hotelDeals', route => {
        const input = tripRequest(route);
        searches.push(input);
        return route.fulfill({ json: searchResponse({ context: input }) });
      });
      await page.goto(`/results?${queryParams(trip)}`);
      await expect(page.getByRole('link', { name: 'View hotel & prices', exact: true })).toBeVisible();
      await openTripEditor(page);
      await page.getByLabel('Check-in', { exact: true }).click();
      await page.getByRole('dialog', { name: 'Check-in calendar' }).locator('[data-day="2026-11-01"] button').click();
      await page.getByRole('dialog', { name: 'Check-out calendar' }).locator('[data-day="2026-11-03"] button').click();
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect.poll(() => searches.length).toBe(2);
      expect(searches[1]).toEqual({ ...trip, checkIn: '2026-11-01', checkOut: '2026-11-03' });
    });
  });
}

test('open calendars expose named controls and readable selectable dates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockOffers(page);
  await page.goto(searchPath);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await openTripEditor(page);
  for (const [label, field] of [['Check-in', 'checkIn'], ['Check-out', 'checkOut']] as const) {
    await page.getByLabel(label, { exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    const calendar = page.locator('.travel-calendar-popup:visible');
    await expect(calendar).toHaveCount(1);
    await expect(calendar).toBeVisible();
    await expect(calendar).toHaveCSS('opacity', '1');
    const dialog = page.getByRole('dialog', { name: `${label} calendar`, exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveAttribute('aria-controls', `${field}-calendar`);
    for (const name of ['Previous month', 'Next month']) {
      await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(dialog.getByRole('button', { name: `Selected, ${fullDate(context[field])}`, exact: true })).toBeEnabled();
    await page.evaluate(async () => {
      const finite = document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime));
      await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
    });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect.soft(result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })),
    })), `${label} calendar`).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await expect(page.getByLabel(label, { exact: true })).toBeFocused();
  }
});

test('calendar buttons announce selected dates and preserve keyboard and pointer selection', async ({ page }) => {
  const searches: BrowserRequest[] = [];
  await page.route('**/api/v1/hotelDeals', route => {
    const input = tripRequest(route);
    searches.push(input);
    return route.fulfill({ json: searchResponse({ context: input }) });
  });
  await page.goto(searchPath);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await openTripEditor(page);
  const checkIn = page.getByRole('combobox', { name: 'Check-in', exact: true });
  const checkOut = page.getByRole('combobox', { name: 'Check-out', exact: true });
  await expect(checkIn).toHaveAttribute('aria-expanded', 'false');
  await checkIn.focus();
  await checkIn.press('ArrowDown');
  await expect(page.getByRole('dialog', { name: 'Check-in calendar', exact: true })).toBeVisible();
  await checkIn.press('Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const newCheckIn = dateAfter(context.checkIn, 1);
  await expect(page.locator('#checkIn-selection')).toHaveText(`Check-in selected: ${fullDate(newCheckIn)}.`);
  await expect(page.locator('#checkIn-selection')).toHaveAttribute('aria-live', 'polite');
  await expect(checkOut).toBeFocused();
  const dialog = page.getByRole('dialog', { name: 'Check-out calendar', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: fullDate(newCheckIn), exact: true })).toBeDisabled();
  await checkOut.press('Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const keyboardCheckOut = dateAfter(context.checkOut, 1);
  await expect(page.locator('#checkOut-selection')).toHaveText(`Check-out selected: ${fullDate(keyboardCheckOut)}.`);
  await expect(dialog).toBeHidden();
  await expect(checkOut).toHaveAttribute('aria-expanded', 'false');
  expect(await checkOut.getAttribute('aria-controls')).toBeNull();
  await checkOut.press('ArrowDown');
  await expect(dialog.getByRole('button', { name: `Selected, ${fullDate(keyboardCheckOut)}`, exact: true })).toBeVisible();
  const pointerCheckOut = dateAfter(context.checkOut, 2);
  await dialog.getByRole('button', { name: fullDate(pointerCheckOut), exact: true }).click();
  await expect(page.locator('#checkOut-selection')).toHaveText(`Check-out selected: ${fullDate(pointerCheckOut)}.`);
  await expect(dialog).toBeHidden();
  await expect(checkOut).toBeFocused();
  expect(searches).toHaveLength(1);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1]).toEqual({ ...context, checkIn: newCheckIn, checkOut: pointerCheckOut });
});


test('calendar month navigation stops at the booking horizon and returns to the selected date on reopen', async ({ page }) => {
  await mockOffers(page);
  await page.goto(searchPath);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await openTripEditor(page);
  const trigger = page.getByRole('combobox', { name: 'Check-in', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Check-in calendar', exact: true });
  const previous = dialog.getByRole('button', { name: 'Previous month', exact: true });
  const next = dialog.getByRole('button', { name: 'Next month', exact: true });
  const today = localToday();
  const latest = addCalendarDays(today, TRAVEL_LIMITS.maxAdvanceDays);
  for (let count = 0; count < 13 && await previous.isEnabled(); count += 1) await previous.click();
  await expect(previous).toBeDisabled();
  await expect(dialog.locator(`[data-day="${today}"]`)).not.toHaveAttribute('data-outside', 'true');
  await expect(dialog.locator(`[data-day="${today}"] button`)).toBeEnabled();
  for (let count = 0; count < 13 && await next.isEnabled(); count += 1) await next.click();
  await expect(next).toBeDisabled();
  await expect(dialog.locator(`[data-day="${latest}"]`)).not.toHaveAttribute('data-outside', 'true');
  await expect(dialog.locator(`[data-day="${latest}"] button`)).toBeEnabled();
  await expect(trigger).toHaveValue(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${context.checkIn}T12:00:00Z`)));
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.press('ArrowDown');
  await expect(dialog.getByRole('button', { name: `Selected, ${fullDate(context.checkIn)}`, exact: true })).toBeEnabled();
});
