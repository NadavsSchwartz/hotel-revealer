import { test, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { openTripEditor, searchPath, searchResponse } from './fixtures.ts';

async function renderedFormStyle(form: Locator) {
  return form.evaluate(element => {
    const boxProperties = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
      'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'];
    const textProperties = ['font-family', 'font-size', 'font-weight', 'line-height'];
    const read = (target: Element, properties: string[]) => {
      const style = getComputedStyle(target);
      return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
    };
    const button = element.querySelector('button[type="submit"]');
    if (!button) throw new Error('Expected the hotel search submit button');
    return {
      form: read(element, boxProperties),
      fields: [...element.querySelectorAll('.trip-control')].map(field => read(field, boxProperties)),
      labels: [...element.querySelectorAll('.trip-control > label')].map(label => read(label, [...textProperties, 'margin-bottom'])),
      values: [...element.querySelectorAll('.trip-control input, .travelers-trigger')].map(value => read(value, textProperties)),
      button: read(button, [...boxProperties, ...textProperties, 'min-height']),
      buttonHeight: button.getBoundingClientRect().height,
    };
  });
}

test('home and results share search field spacing, borders, and typography at desktop and mobile widths', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/hotelDeals', route => route.fulfill({ json: searchResponse() }));

  for (const width of [1440, 832, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const form = page.getByRole('form', { name: 'Search hotels', exact: true });
    await expect(form).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    const { buttonHeight: homeHeight, ...home } = await renderedFormStyle(form);
    expect(home.fields).toHaveLength(4);
    expect(home.labels).toHaveLength(4);
    expect(home.values).toHaveLength(4);
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Home overflow at ${width}px`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
    await form.screenshot({ path: testInfo.outputPath(`home-form-${width}.png`) });

    await page.goto(searchPath);
    await expect(page.locator('.quote-price').first()).toContainText('$119');
    await openTripEditor(page);
    await page.evaluate(async () => { await document.fonts.ready; });
    const { buttonHeight: resultsHeight, ...results } = await renderedFormStyle(form);
    expect.soft(results, `Search form appearance at ${width}px`).toEqual(home);
    expect.soft(resultsHeight, `Search button height at ${width}px`).toBeCloseTo(homeHeight, 1);
    expect.soft(resultsHeight, `Search touch target at ${width}px`).toBeGreaterThanOrEqual(44);
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Results overflow at ${width}px`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`results-${width}.png`), fullPage: true });
    await form.screenshot({ path: testInfo.outputPath(`results-form-${width}.png`) });
  }
});
