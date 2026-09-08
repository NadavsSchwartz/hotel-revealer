# Hotel Revealer implementation contract

Approved scope: live candidate comparison for a small public portfolio; English,
USD, with worldwide destination search, room/adult counts and children’s ages
added at Nadav’s request. Quality gates precede schedule. No demo substitute.

## Status — 2026-09-07

Canonical checkout starts at `728f9edf2f33dc0604cffa42c1b17b5ad9865edc`.
The earlier Documents/Codex checkout contains six partial edits and is preserved.
Live access and release are BLOCKED: no authorization covering automated
pre-booking supplier identification/public display has been established.
The independent local application, offline tests and deployment preparation can
proceed; production must not make provider requests by default.

Priceline's current terms specifically prohibit automated Express Deal supplier
identification. Partner onboarding alone is not evidence of an exception.
Sources: https://www.priceline.com/static-pages/terms_en.html and
https://github.com/priceline-partner-network/api-documentation/blob/master/src/getting-started.md.

## Shared wire contract

- Context: `{destinationId, cityName, checkIn, checkOut, rooms, adults,
  childrenAges:[], currency:'USD'}`. Dates are ISO calendar dates. Destination IDs
  use `geonames:<ID>` and the server supplies the authoritative label. Legacy
  city/state URLs resolve through the attributable geographic bridge. Successful
  responses reconcile the visible label and URL without changing trip identity.
- GET `/api/v1/destinations?q=…` searches the server’s GeoNames snapshot and returns
  at most eight suggestions by default. This endpoint makes no hotel-provider call.
  See `docs/DATA_SOURCES.md` for coverage, licensing, memory and refresh evidence.
- Shared limits: 1–8 rooms, 1–16 adults with at least one per room, up to eight
  children aged 0–17 (0 represents under one). Every child requires an age.
  Omitted occupancy defaults to one room/two adults/no children; explicit invalid
  values are rejected. Room allocation is not yet modeled.
- Both dates must be within 365 days of local today, checkout follows check-in,
  and stays are at most 30 calendar nights. Server validation permits one day of
  grace at both UTC boundaries to accommodate the client’s local calendar date.
  These are application defaults. A permitted adapter must verify provider date,
  occupancy, destination mapping, and multi-room price semantics before live use.
- Error response: `{error:{code,message,retryAt?,requestId?}}`.
- Search: `{context,retrievedAt,expiresAt,coverage,offers}`.
- Coverage: `{status:'complete'|'partial',reason:null|string,pagesFetched,
  offersFound,namedHotelsChecked,unassessedHotels}`. Complete means retrieved
  pagination only, never exhaustive hidden inventory or verified identity.
- Offer: `{offerId,neighborhoodName,stars,quote,handoffUrl,candidates,
  unassessedCount}`. Quote: `{nightlyCents,stayCents,currency:'USD',
  taxesFees:'included'|'excluded'|'unknown'}`; missing amounts are null.
- Candidate: `{hotelId,name,neighborhoodName,stars,guestRating,reviewCount,
  amenities,thumbnailUrl,tier:'supported'|'partial',evidence:{supporting:[],missing:[]}}`.
- Detail input: context fields plus `{offerId,hotelId}`.
- Detail response: `{context,retrievedAt,expiresAt,offer,candidate,
  details:{description,images:[],amenities:[],address,retailQuote:null|object},
  detailStatus:'available'|'unavailable'}`. A missing retail rate does not
  establish Express unavailability. Search relationship is checked server-side.
- The API paths stay POST `/api/v1/hotelDeals` and POST `/api/v1/deal`.
- No test response mode or fixture switch is exposed by the production server.

## Internal interfaces / work ownership

- Domain owns `shared/` and `backend/domain/`: validateSearch(input, now),
  validateDetail(input, now), normalizeListings(raw), matchOffers(offers, hotels).
- `normalizeListings` returns `{offers,hotels,invalidRows}`. Normalized offers:
  `{offerId,cityId,neighborhoodId,neighborhoodName,stars,quote,handoffUrl,
  clues:{guestRating,reviewCount,amenities}}`. Numeric clues use
  `{kind:'exact'|'minimum'|'range'|'unknown',value?,min?,max?}`. Amenities:
  `{codes:[],complete:boolean}` or null. Never invent raw masking semantics.
- Normalized named hotels include candidate display fields, `neighborhoodId`,
  `amenities` (codes or null), `amenitiesComplete`, and `retailQuote`.
- `matchOffers` returns public offer objects. No I/O. Stable hotel-ID tie break.
- Provider/API owns `backend/provider/`, `backend/app.js`, `backend/server.js`,
  routes/controllers/middleware. Factory `createApp({service,logger}={})` permits
  test injection. Service methods `search(input)` and `detail(input)` return wire
  responses. Default service refuses access with `PROVIDER_NOT_CONFIGURED` (503).
- Frontend owns `frontend/` except generated lockfiles. Keep React/Redux/antd.
  The destination combobox, calendar popups, and traveler selector share validation
  and preserve URL context. Calendar values remain date-only through the adapter boundary.
- Root owns package installation/lockfiles, CI/deployment, docs and integration.
  Only root runs dependency installation to avoid shared-lock races.

## Required verification / remaining external gates

Run domain/API tests, production build, lint, browser journeys and automated
accessibility checks. Record exact results; do not treat mocks as live evidence.
Manual VoiceOver, real mobile devices, known hotel outcomes, 3–5 first-time users,
permitted live data, host sizing, deployment/rollback/reboot and public release
remain explicit gates until completed. No purchase, booking, message or domain
registration is authorized by implementation of this plan.
