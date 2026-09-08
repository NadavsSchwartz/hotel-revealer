import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { context, mockOffers, openTripEditor, searchPath, searchResponse } from './fixtures.js';

const fullDate = value => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const dateAfter = (value, days) => new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

test('open calendars expose named controls and readable selectable dates', async ({ page }) => {
  await mockOffers(page);
  await page.goto(searchPath);
  await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
  await openTripEditor(page);
  for (const [label, field] of [['Check-in', 'checkIn'], ['Check-out', 'checkOut']]) {
    await page.getByLabel(label, { exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    const calendar = page.locator('.travel-calendar-popup:visible:not(.ant-slide-up-leave)');
    await expect(calendar).toHaveCount(1);
    await expect(calendar).toBeVisible();
    const dialog = page.getByRole('dialog', { name: `${label} calendar`, exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveAttribute('aria-controls', `${field}-calendar`);
    for (const name of ['Previous year', 'Previous month', 'Next month', 'Next year']) {
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
    if (field === 'checkIn') {
      await dialog.locator('.ant-picker-month-btn').click();
      await expect(dialog.getByRole('button', { name: 'Previous year', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Next year', exact: true })).toBeVisible();
      await dialog.locator('.ant-picker-year-btn').click();
      await expect(dialog.getByRole('button', { name: 'Previous decade', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Next decade', exact: true })).toBeVisible();
      await dialog.locator('.ant-picker-decade-btn').click();
      await expect(dialog.getByRole('button', { name: 'Previous century', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Next century', exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await expect(page.getByLabel(label, { exact: true })).toBeFocused();
  }
});

test('calendar buttons announce selected dates and preserve keyboard and pointer selection', async ({ page }) => {
  const searches = [];
  await page.route('**/api/v1/hotelDeals', route => {
    const input = route.request().postDataJSON();
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
  await checkIn.press('ArrowRight');
  await checkIn.press('Enter');
  const newCheckIn = dateAfter(context.checkIn, 1);
  await expect(page.locator('#checkIn-selection')).toHaveText(`Check-in selected: ${fullDate(newCheckIn)}.`);
  await expect(page.locator('#checkIn-selection')).toHaveAttribute('aria-live', 'polite');
  await expect(checkOut).toBeFocused();
  const dialog = page.getByRole('dialog', { name: 'Check-out calendar', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: fullDate(newCheckIn), exact: true })).toBeDisabled();
  await checkOut.press('Tab');
  await checkOut.press('ArrowRight');
  await checkOut.press('Enter');
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
