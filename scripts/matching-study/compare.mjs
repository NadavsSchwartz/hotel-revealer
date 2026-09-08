// Offline comparison. The input is a saved capture, never an upstream request.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { matchOriginal } from './original.mjs';
import { isValidOffer, isValidHotel, matchRefactored } from './refactored.mjs';
import { normalizeListings } from '../../backend/domain/normalization.js';
import { matchListings } from '../../backend/domain/matching.js';

const filename = process.argv[2];
if (!filename) throw new Error('Usage: node scripts/matching-study/compare.mjs <saved-capture.json>');
const capture = JSON.parse(await readFile(filename, 'utf8'));
assert.ok(Array.isArray(capture.pages) && capture.pages.length > 0, 'Expected captured listing pages');
const rows = capture.pages.flatMap(page => {
  assert.ok(Array.isArray(page.listings), 'Each captured page must have listings');
  return page.listings;
});
const offers = rows.filter(row => row.hotelType === 'SOPQ');
const hotels = rows.filter(row => row.hotelType === 'RTL');
assert.ok(offers.length && hotels.length, 'Both opaque and named rows are required');
assert.ok(offers.every(row => Object.hasOwn(row.ratesSummary, 'minStrikePrice')), 'Capture lacks the original strike-price field');
assert.ok(rows.every(row => Object.hasOwn(row, 'amenitiesIcons')), 'Capture lacks the original amenity-icon field');
const validOffers = offers.filter(isValidOffer);
const validHotels = hotels.filter(isValidHotel);
const original = matchOriginal(validOffers, validHotels);
const refactored = matchRefactored(offers, hotels);
assert.deepEqual(refactored.pairs, original, 'Refactor changed pair membership, order or duplicate observations');
let rawOriginal;
try {
  const pairs = matchOriginal(offers, hotels);
  rawOriginal = { pairs: pairs.length, equalToRefactor: JSON.stringify(pairs) === JSON.stringify(refactored.pairs) };
} catch {
  rawOriginal = { error: 'Original predicate throws on incomplete rows; parity covers eligible rows only.' };
}
const normalized = normalizeListings(rows);
const current = matchListings(normalized.offers, normalized.hotels).offers;
const currentPairs = current.flatMap(offer => offer.candidates.map(hotel => [offer.offerId, hotel.hotelId]));
// Canonicalize only the cross-policy report: the app stringifies numeric IDs. Exact
// refactor parity above still compares raw values, types and arrival order.
const reportId = id => String(id);
const pairKey = ([offerId, hotelId]) => JSON.stringify([reportId(offerId), reportId(hotelId)]);
const oldSet = new Set(original.map(pairKey));
const currentSet = new Set(currentPairs.map(pairKey));
const histogram = pairs => {
  const groups = new Map(offers.map(offer => [reportId(offer.pclnId), new Set()]));
  for (const [offerId, hotelId] of pairs) groups.get(reportId(offerId)).add(reportId(hotelId));
  const counts = { zero: 0, one: 0, multiple: 0 };
  for (const ids of groups.values()) counts[ids.size === 0 ? 'zero' : ids.size === 1 ? 'one' : 'multiple']++;
  return counts;
};
const milliseconds = fn => {
  for (let i = 0; i < 20; i++) fn();
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return Number(((samples[49] + samples[50]) / 2).toFixed(3));
};
console.log(JSON.stringify({
  capture: { filename, startedAt: capture.startedAt, context: capture.context, requests: capture.requests,
    retrieval: capture.result?.coverage ?? null },
  rows: { offers: offers.length, hotels: hotels.length, rejectedOffers: refactored.rejectedOffers, rejectedHotels: refactored.rejectedHotels },
  parity: { equal: true, orderedPairs: original.length, distinctPairs: oldSet.size, outcomes: histogram(original), rawOriginal },
  currentMatcher: { distinctPairs: currentSet.size, outcomes: histogram(currentPairs),
    sharedWithOriginal: [...oldSet].filter(pair => currentSet.has(pair)).length,
    onlyOriginal: [...oldSet].filter(pair => !currentSet.has(pair)).length,
    onlyCurrent: [...currentSet].filter(pair => !oldSet.has(pair)).length },
  work: { originalComparisons: validOffers.length * validHotels.length, refactoredComparisons: refactored.comparisons,
    originalMedianMs: milliseconds(() => matchOriginal(validOffers, validHotels)),
    refactoredMedianMs: milliseconds(() => matchRefactored(offers, hotels)), measuredIterations: 100 },
  limitation: 'Parity proves refactor equivalence on eligible rows, not correct hotel identity. Timing is local CPU time for this capture, not end-to-end latency.',
}, null, 2));
