import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reporting crosses the raw-ID reference contract and the app's normalized IDs.
test('saved-capture replay reports numeric and padded offer IDs without changing raw parity', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'matching-replay-'));
  try {
    for (const offerId of [123, '  offer-a  ']) {
      const facts = {
        starRating: 4, overallGuestRating: 8, totalReviewCount: 1200,
        location: { cityId: 'city', neighborhoodID: 'area' },
        hotelFeatures: { highlightedAmenities: ['POOL'] },
        amenitiesIcons: [{ iconName: 'pool', amenityName: 'Pool' }],
      };
      const rows = [
        { ...facts, hotelType: 'SOPQ', pclnId: offerId,
          ratesSummary: { programName: 'Express_Deal', minPrice: '100', minStrikePrice: '150', minCurrencyCode: 'USD' } },
        { ...facts, hotelType: 'RTL', hotelId: 101, name: 'Hotel A',
          ratesSummary: { programName: 'Retail', minPrice: '150', minCurrencyCode: 'USD' } },
      ];
      const filename = path.join(directory, 'capture.json');
      await writeFile(filename, JSON.stringify({ pages: [{ listings: rows, nextCursor: null }] }));
      const report = JSON.parse(execFileSync(process.execPath,
        [fileURLToPath(new URL('./compare.mjs', import.meta.url)), filename], { encoding: 'utf8' }));
      assert.equal(report.parity.equal, true);
      assert.equal(report.parity.rawOriginal.equalToRefactor, true);
      assert.equal(report.parity.orderedPairs, 1);
      // The app stringifies numeric IDs but rejects padded IDs. Preserve that
      // policy difference in the report instead of trimming it into agreement.
      const currentMatches = typeof offerId === 'number' ? 1 : 0;
      assert.deepEqual(report.currentMatcher.outcomes, { zero: 1 - currentMatches, one: currentMatches, multiple: 0 });
      assert.equal(report.currentMatcher.sharedWithOriginal, currentMatches);
      assert.equal(report.currentMatcher.onlyOriginal, 1 - currentMatches);
      assert.equal(report.currentMatcher.onlyCurrent, 0);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
