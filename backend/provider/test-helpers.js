import { setImmediate } from 'node:timers/promises';

const testNow = Date.now();
const dateAfter = days => new Date(testNow + days * 86_400_000).toISOString().slice(0, 10);
export const futureContext = { cityName: 'Las Vegas, Nevada', checkIn: dateAfter(30), checkOut: dateAfter(32) };

export const listingRows = () => [
  {
    pclnId: 'offer-1', starRating: 4, overallGuestRating: 9, totalReviewCount: 100,
    hotelFeatures: { highlightedAmenities: [] }, amenitiesIcons: [],
    location: { cityId: 'city-1', neighborhoodID: 'area-1', neighborhoodName: 'The Strip' },
    ratesSummary: { programName: 'Express_Deal', minPrice: 100, minStrikePrice: 140, displayPricePerStay: 200, minCurrencyCode: 'USD' },
    clues: { guestRating: { kind: 'minimum', value: 8 } },
    handoffUrl: 'https://www.priceline.com/original-offer',
  },
  {
    hotelFeatures: { highlightedAmenities: [] }, amenitiesIcons: [],
    hotelId: 'hotel-1', name: 'Example Hotel', starRating: 4, overallGuestRating: 9, totalReviewCount: 100,
    location: { cityId: 'city-1', neighborhoodID: 'area-1', neighborhoodName: 'The Strip' },
    ratesSummary: { programName: 'RETAIL', minPrice: 140, minCurrencyCode: 'USD' },
  },
];

// Yield past queued promise work; tests waiting for I/O need its completion signal.
export const flush = () => setImmediate();

export function manualClock(initial = testNow) {
  let current = initial;
  let id = 0;
  const timers = new Map();
  return {
    now: () => current,
    setTimeout(fn, ms) { const key = ++id; timers.set(key, { at: current + Math.max(0, ms), fn }); return key; },
    clearTimeout(key) { timers.delete(key); },
    async advance(ms) {
      const target = current + ms;
      await flush();
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        current = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await flush();
      }
      current = target;
      await flush();
    },
  };
}
