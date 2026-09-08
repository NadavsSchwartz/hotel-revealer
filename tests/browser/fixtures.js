// Synthetic browser fixtures. Never imported by production code or sold as live data.
import { expect } from '@playwright/test';
import { getDestination } from '../../backend/destinations/index.js';

const dateAfter = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const destination = getDestination('geonames:5506956');
export const context = { destinationId: destination.id, cityName: destination.label, checkIn: dateAfter(30), checkOut: dateAfter(32), rooms: 1, adults: 2, childrenAges: [], currency: 'USD' };
export const searchPath = `/results?${new URLSearchParams(context)}`;

export function searchResponse(overrides = {}) {
  const candidate = {
    hotelId: 'hotel-one', name: 'Juniper House', neighborhoodName: 'Downtown', stars: 4,
    guestRating: 8.7, reviewCount: 742, amenities: ['POOL', 'WIFI'], thumbnailUrl: null,
    tier: 'partial', evidence: { supporting: ['Same neighborhood', 'Matching star category', 'Pool advertised'], missing: ['Review count masking is unverified'] },
  };
  const offer = {
    offerId: 'offer-one', neighborhoodName: 'Downtown', stars: 4,
    quote: { nightlyCents: 11900, stayCents: 23800, currency: 'USD', taxesFees: 'unknown' },
    handoffUrl: `https://www.priceline.com/relax/at/express/example/offer-one/from/${context.checkIn.replaceAll('-', '')}/to/${context.checkOut.replaceAll('-', '')}/rooms/1/adults/2?cur=USD`,
    candidates: [candidate, { ...candidate, hotelId: 'hotel-two', name: 'Desert House' }], unassessedCount: 1,
  };
  return {
    context, retrievedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(),
    coverage: { status: 'complete', reason: null, pagesFetched: 1, offersFound: 1, namedHotelsChecked: 3, unassessedHotels: 1 },
    offers: [offer], ...overrides,
  };
}

export function detailResponse() {
  const search = searchResponse();
  return { context, retrievedAt: search.retrievedAt, expiresAt: search.expiresAt,
    offer: search.offers[0], candidate: search.offers[0].candidates[0], detailStatus: 'unavailable',
    details: { description: 'Candidate hotel information for comparison.', images: [], amenities: ['Pool', 'Wi-Fi'], address: 'Downtown, Las Vegas', retailQuote: null },
  };
}

export async function mockOffers(page, response = searchResponse()) {
  await page.route('**/api/v1/hotelDeals', (route) => route.fulfill({ json: response }));
  await page.route('**/api/v1/deal', (route) => route.fulfill({ json: detailResponse() }));
}

export async function openTripEditor(page) {
  const form = page.locator('form[aria-label="Search hotels"]');
  await expect(form).toBeAttached();
  if (!await form.isVisible()) {
    await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  }
  await expect(form).toBeVisible();
}
