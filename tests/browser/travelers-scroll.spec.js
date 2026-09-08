import { test, expect } from '@playwright/test';
import { mockOffers, searchPath } from './fixtures.js';

const travelerDialog = page => page.getByRole('dialog', { name: 'Who’s traveling?', exact: true });
const travelerTrigger = page => page.getByRole('button', { name: /^Travelers,/ });

async function clickWithoutScrolling(locator) {
  // locator.click() scrolls portal ancestors before dispatching its pointer event.
  // These checks measure application scrolling, so click an already-visible target.
  await expect.poll(() => locator.evaluate(element => {
    const popup = element.closest('.travelers-popup');
    return !popup || Number(getComputedStyle(popup).opacity) === 1;
  })).toBe(true);
  await expect(locator).toBeInViewport({ ratio: 1 });
  const rect = await locator.boundingBox();
  await locator.page().mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

async function prepare(page, width, screen) {
  await page.setViewportSize({ width, height: 844 });
  await mockOffers(page);
  await page.goto(screen === 'home' ? '/' : searchPath);
  if (screen === 'results') await expect(page.getByText('$119', { exact: false }).first()).toBeVisible();
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

async function expectPanelInViewport(page) {
  await expect(travelerDialog(page)).toBeVisible();
  await expect.poll(() => travelerDialog(page).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight + 1
      && rect.left >= 0 && rect.right <= window.innerWidth + 1;
  })).toBe(true);
}

async function expectNoPageScroll(page, initialScroll) {
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
      const placement = await page.locator('.travelers-popup:visible').getAttribute('class');
      const side = placement.match(/ant-popover-placement-(\w+)/)[1];

      await clickWithoutScrolling(page.getByRole('button', { name: 'Increase adults', exact: true }));
      await expect(trigger).toHaveAccessibleName('Travelers, 3 guests · 1 room');
      await expectNoPageScroll(page, initialScroll);
      for (let child = 1; child <= 3; child++) {
        await clickWithoutScrolling(page.getByRole('button', { name: 'Increase children', exact: true }));
        await expect(page.getByRole('combobox', { name: `Child ${child} age`, exact: true })).toBeAttached();
        await expectPanelInViewport(page);
        await expect(page.locator('.travelers-popup:visible')).toHaveClass(new RegExp(`ant-popover-placement-${side}`));
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
    await page.getByRole('button', { name: 'Search', exact: true }).click();
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
  const rect = await travelerDialog(page).boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  const done = page.getByRole('button', { name: 'Done', exact: true });
  for (let gesture = 0; gesture < 3; gesture++) {
    const visible = await done.evaluate(element => {
      const button = element.getBoundingClientRect();
      const bounds = element.closest('.travelers-panel').getBoundingClientRect();
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
