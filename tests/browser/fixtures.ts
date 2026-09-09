// Synthetic browser fixtures. Never imported by production code or sold as live data.
import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import assert from 'node:assert/strict';
import type { Candidate, Destination, DetailRequest, DetailResponse, Offer, SearchResponse, TripContext } from '../../shared/contracts.ts';
import { getDestination } from '../../backend/destinations/index.ts';

const dateAfter = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const destination = getDestination('geonames:5506956');
assert(destination, 'The synthetic Las Vegas destination must exist in the catalog');
export const context: TripContext = { destinationId: destination.id, cityName: destination.label, checkIn: dateAfter(30), checkOut: dateAfter(32), rooms: 1, adults: 2, childrenAges: [], currency: 'USD' };
export const searchPath = `/results?${queryParams(context)}`;

export function searchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  const candidate: Candidate = {
    hotelId: 'hotel-one', name: 'Juniper House', neighborhoodName: 'Downtown', stars: 4,
    guestRating: 8.7, reviewCount: 742, amenities: ['POOL', 'WIFI'], thumbnailUrl: null,
  };
  const offer: Offer = {
    offerId: 'offer-one', neighborhoodName: 'Downtown', stars: 4,
    clues: { guestRating: { kind: 'unknown' }, reviewCount: { kind: 'unknown' }, amenities: null },
    quote: { nightlyCents: 11900, stayCents: 23800, currency: 'USD', nightlyBasis: 'per-room', stayBasis: 'all-rooms', roomCount: 1, taxesFees: 'unknown' },
    handoffUrl: `https://www.priceline.com/relax/at/express/example/offer-one/from/${context.checkIn.replaceAll('-', '')}/to/${context.checkOut.replaceAll('-', '')}/rooms/1/adults/2?cur=USD`,
    resolution: { status: 'matched' }, candidates: [candidate],
  };
  return {
    context, retrievedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(),
    coverage: { status: 'complete', reason: null, pagesFetched: 1, offersFound: 1, namedHotelsChecked: 3, unassessedHotels: 1 },
    offers: [offer], ...overrides,
  };
}

export function detailResponse(): DetailResponse {
  const search = searchResponse();
  return { context, retrievedAt: search.retrievedAt, expiresAt: search.expiresAt,
    offerExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    offer: search.offers[0], candidate: search.offers[0].candidates[0] ?? null, detailStatus: 'unavailable', quoteStatus: 'unavailable',
    details: { description: 'Hotel information for this likely match.', images: [], amenities: ['Pool', 'Wi-Fi'], address: 'Downtown, Las Vegas', retailQuote: null },
  };
}

export async function mockOffers(page: Page, response: unknown = searchResponse()) {
  await page.route('**/api/v1/hotelDeals', (route) => route.fulfill({ json: response }));
  await page.route('**/api/v1/deal', (route) => route.fulfill({ json: detailResponse() }));
}

export async function chooseSort(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Sort by', exact: true }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

export async function openTripEditor(page: Page) {
  const form = page.locator('form[aria-label="Search hotels"]');
  await expect(form).toBeAttached();
  if (!await form.isVisible()) {
    await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Where are you going?', exact: true })).toBeFocused();
  }
  await expect(form).toBeVisible();
}

// Match native URLSearchParams' JavaScript string coercion independently of the app's URL helpers.
export function queryParams(values: object): URLSearchParams {
  return new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)]));
}

// Assert the outbound HTTP shape before using it as a typed response echo.
export type BrowserRequest = TripContext & Partial<Pick<DetailRequest, 'offerId' | 'hotelId'>>;

function assertTripRequest(value: unknown): asserts value is BrowserRequest {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert('destinationId' in value && typeof value.destinationId === 'string');
  assert('cityName' in value && typeof value.cityName === 'string');
  assert('checkIn' in value && typeof value.checkIn === 'string');
  assert('checkOut' in value && typeof value.checkOut === 'string');
  assert('rooms' in value && typeof value.rooms === 'number');
  assert('adults' in value && typeof value.adults === 'number');
  assert('childrenAges' in value && Array.isArray(value.childrenAges));
  const childrenAges: unknown[] = value.childrenAges;
  assert(childrenAges.every((age): age is number => typeof age === 'number'));
  assert('currency' in value && (value.currency === 'USD' || value.currency === 'EUR' || value.currency === 'GBP' || value.currency === 'CAD' || value.currency === 'AUD'));
  assert(!('offerId' in value) || typeof value.offerId === 'string');
  assert(!('hotelId' in value) || typeof value.hotelId === 'string');
}

export function tripRequest(route: Route): BrowserRequest {
  const value: unknown = route.request().postDataJSON();
  assertTripRequest(value);
  return value;
}

export function present<Value>(value: Value): NonNullable<Value> {
  assert(value !== null && value !== undefined, 'Expected a present fixture or rendered element');
  return value;
}

export async function readDestinations(response: { json(): Promise<unknown> }): Promise<Destination[]> {
  const payload = await response.json();
  assert(payload && typeof payload === 'object' && 'destinations' in payload && Array.isArray(payload.destinations));
  const destinations: unknown[] = payload.destinations;
  return destinations.map(value => {
    assertDestination(value);
    return value;
  });
}

function assertDestination(value: unknown): asserts value is Destination {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  for (const field of ['id', 'name', 'label', 'countryCode', 'countryName', 'regionName', 'timezone']) {
    assert(field in value && typeof Reflect.get(value, field) === 'string');
  }
  assert('latitude' in value && typeof value.latitude === 'number' && Number.isFinite(value.latitude));
  assert('longitude' in value && typeof value.longitude === 'number' && Number.isFinite(value.longitude));
}
