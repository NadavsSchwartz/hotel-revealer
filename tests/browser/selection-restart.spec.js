import { test, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../backend/app.js';
import { createProviderService } from '../../backend/provider/service.js';
import { createPricelineAdapter } from '../../backend/provider/priceline.js';
import { createMemoryStateStore } from '../../backend/provider/state.js';
import { createSelectionStore } from '../../backend/provider/selection-store.js';
import { listingRows } from '../../backend/provider/test-helpers.js';
import { context } from './fixtures.js';

test('reloading an original offer across a real service restart recovers its price and link without reviving a hotel claim', async ({ page }) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hotel-browser-restart-'));
  const filePath = path.join(directory, 'selections.json');
  const offerId = 'a'.repeat(336);
  const originalOfferUrl = createPricelineAdapter({ fetchImpl() { throw new Error('No live provider requests'); } }).originalOfferUrl;
  let rotated = false;
  let listingCalls = 0;
  const detailInputs = [];
  const adapter = {
    originalOfferUrl,
    async listingsPage({ context: trip }) {
      listingCalls += 1;
      const rows = listingRows();
      rows[0].pclnId = rotated ? 'b'.repeat(336) : offerId;
      for (const row of rows) row.location.cityId = 3000015284;
      rows[0].handoffUrl = originalOfferUrl({ context: trip, offerId: rows[0].pclnId, cityId: rows[0].location.cityId });
      return { listings: rows, nextCursor: null };
    },
    async hotelDetails(input) {
      detailInputs.push(input);
      return { description: 'Synthetic hotel information', originalQuote: {
        nightlyCents: 10000, stayCents: 20000, totalCents: 24000, currency: 'USD',
        taxesFees: 'excluded', totalTaxesFees: 'included', roomCount: 1,
        nightlyBasis: 'per-room', stayBasis: 'all-rooms',
      } };
    },
  };
  let service;
  let server;
  async function start(port = 0) {
    service = createProviderService({ adapter, stateStore: createMemoryStateStore(), logger: null,
      selectionStore: createSelectionStore({ filePath, logger: null }) });
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let app;
    try { app = createApp({ service, logger: null }); }
    finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
    server = app.listen(port, '127.0.0.1');
    await once(server, 'listening');
    return server.address().port;
  }
  async function stop() {
    if (server?.listening) await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
    await service?.close();
  }
  try {
    const port = await start();
    await page.goto(`http://127.0.0.1:${port}/results?${new URLSearchParams(context)}`);
    await page.getByRole('link', { name: 'View likely hotel: Example Hotel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Example Hotel', exact: true })).toBeVisible();
    await expect(page.locator('.detail-quote-panel .quote-price')).toHaveText('$240 total');
    const originalUrl = page.url();
    const handoff = await page.getByRole('link', { name: /Check price on Priceline/ }).getAttribute('href');
    await stop();
    rotated = true;
    await start(port);
    await page.reload();
    await expect(page).toHaveURL(originalUrl);
    await expect(page.getByRole('heading', { name: 'Your Express offer', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Example Hotel', exact: true })).toHaveCount(0);
    await expect(page.getByText('We couldn’t verify the selected hotel.', { exact: false })).toBeVisible();
    await expect(page.locator('.detail-quote-panel .quote-price')).toHaveText('$240 total');
    await expect(page.getByRole('link', { name: /Check price on Priceline/ })).toHaveAttribute('href', handoff);
    expect(listingCalls).toBe(1);
    expect(detailInputs).toHaveLength(2);
    expect(detailInputs[1].offerId).toBe(offerId);
    expect(detailInputs[1].hotelId).toBeUndefined();
    const snapshot = JSON.parse(await readFile(filePath, 'utf8'));
    expect(snapshot.records).toHaveLength(1);
    expect(Object.keys(snapshot.records[0]).sort()).toEqual(['cityId', 'expiresAt', 'hash']);
    expect(JSON.stringify(snapshot)).not.toContain(offerId);
    expect(JSON.stringify(snapshot)).not.toContain(context.checkIn);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
