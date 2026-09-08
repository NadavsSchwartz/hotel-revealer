# Hotel Revealer implementation contract

Approved scope: live candidate comparison for a small public portfolio; English,
USD, with worldwide destination search, room/adult counts and children’s ages
added at Nadav’s request. Quality gates precede schedule. No demo substitute.

## Status — 2026-09-07

Canonical checkout: `/Users/nadavschwartz/Developer/hotel-revealer/hotel-revealer`.
This application integration builds on `eb27e2d` (worldwide destinations and
validated trip controls) and `b3f8b59` (live adapter and durable request recovery).
The selected homepage uses the real search/detail routes. The earlier
Documents/Codex checkout is preserved.
Nadav subsequently directed normal public-endpoint integration despite no partner
agreement, removing the earlier permission prerequisite from implementation. Live
local listing/detail responses and original-offer links have now been verified.
Provider permission is not established; the documented terms findings remain.
Normal server startup enables the public adapter; tests use `HOTEL_PROVIDER=disabled`.

The earlier published-terms review found an explicit restriction on automated
Express Deal supplier identification. This implementation direction does not
establish permission or an exception. The research, live probes, handoff evidence
and remaining compatibility risks are recorded in [LIVE_ACCESS.md](LIVE_ACCESS.md).

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
  These are application defaults. The live adapter passes aggregate room/adult
  totals and child ages as verified in the provider guest editor. It does not
  establish that every accepted trip has provider inventory or a bookable room
  allocation. Observed multi-room quotes use per-room nightly and all-room stay
  amounts; final room selection, tax/fee inclusion and checkout totals remain
  provider responsibilities.
- Error response: `{error:{code,message,retryAt?,requestId?}}`.
- Search: `{context,retrievedAt,expiresAt,coverage,offers}`.
- Coverage: `{status:'complete'|'partial',reason:null|string,pagesFetched,
  offersFound,namedHotelsChecked,unassessedHotels}`. Complete means retrieved
  pagination only, never exhaustive hidden inventory or verified identity.
- Offer: `{offerId,neighborhoodName,stars,quote,handoffUrl,candidates,
  unassessedCount}`. Quote: `{nightlyCents,stayCents,currency:'USD',
  taxesFees:'included'|'excluded'|'unknown'}`; missing amounts are null.
  Verified price-basis metadata is optional: `{roomCount,nightlyBasis:'per-room',
  stayBasis:'all-rooms'}`. The adapter preserves provider stay amounts rather than
  inventing a total. Fee inclusion stays unknown without explicit source evidence.
  Opaque offer IDs permit up to 1024 safe characters; named hotel IDs remain 200.
- Candidate: `{hotelId,name,neighborhoodName,stars,guestRating,reviewCount,
  amenities,thumbnailUrl,tier:'supported'|'partial',evidence:{supporting:[],missing:[]}}`.
- Detail input: context fields plus `{offerId,hotelId}`.
- Detail response: `{context,retrievedAt,expiresAt,offerExpiresAt,offer,candidate,
  details:{description,images:[],amenities:[],address,retailQuote:null|object},
  detailStatus:'available'|'unavailable'}`. A missing retail rate does not
  establish Express unavailability. Search relationship is checked server-side.
  Metadata cache expiry does not shorten the separately revalidated offer expiry.
  The UI hides an expired retail quote and offers detail refresh while preserving
  a fresh original-offer link. Address rendering does not depend on description
  availability; the current adapter supplies no unverified description field.
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
  responses. The service factory without an adapter refuses access with
  `PROVIDER_NOT_CONFIGURED` (503); the server explicitly injects the public adapter.
- Frontend owns `frontend/` except generated lockfiles. Keep React/Redux/antd.
  The destination combobox, calendar popups, and traveler selector share validation
  and preserve URL context. Calendar values remain date-only through the adapter boundary.
- Root owns package installation/lockfiles, CI/deployment, docs and integration.
  Only root runs dependency installation to avoid shared-lock races.

## Live adapter and operating contract

- `backend/provider/priceline.js` sends ordinary JSON POST requests to the public
  `/pws/v0/pcln-graph/` endpoint with content/accept headers, no credentials, and
  redirects rejected. It uses no cookies, identity spoofing, proxy rotation,
  challenge solving or automatic retries. Public website compatibility is not a
  supported external API guarantee.
- Searches combine `RTL` named hotels and `SOPQ` Express offers, requesting 500
  rows per page. The coordinator permits at most three pages. Incomplete retrieval
  stays explicit; retrieved pagination completeness is not exhaustive inventory.
- Each nonempty page must contain a named hotel's coordinates or an opaque
  offer's neighborhood coordinates within 100 km of the selected GeoNames place.
  Otherwise the API returns `PROVIDER_DESTINATION_UNSUPPORTED` (422). This catches
  distant namesakes, but does not prove an exact provider city-boundary match.
  Provider country codes are not assumed to be ISO codes; Tel Aviv returned `IS`.
- The service permits one active upstream call, a one-second start gap and four
  queued requests. Admission-to-response deadlines are 20 seconds for search and
  10 seconds for detail. Streamed upstream JSON and public payloads have a 2 MiB
  bound; search/detail caches hold 25/100 entries with five-minute/one-minute TTLs.
- Before an actual upstream call, the service durably records disabled control
  state, then restores the classified outcome after completion. State writes are
  serialized. A child-process SIGKILL test proves that interruption during the call
  leaves access blocked after restart. Hardware/volume-loss durability is unproven.
  Stop the app, review the cause, run `npm run provider:reset -- --after-review`,
  then restart. A challenge is not retried or bypassed.
- The selected cinematic homepage is wired into the actual `App`; the production
  flow uses the real search/results/detail routes. Isolated design previews remain
  historical artifacts, not a replacement for that flow.

## Required verification / remaining external gates

The integration passed `npm run check` (lint, 129 native tests and production
build) and all 140 browser cases (35 scenarios in four engine/viewport projects),
with no retries or skips. The existing single-holder Axe combobox exception
remains. The real homepage-to-Tel-Aviv-details-to-Priceline journey also passed;
see [ACCEPTANCE.md](ACCEPTANCE.md) for evidence and limits. Do not treat browser
fixtures as live identity or pricing evidence.
Manual VoiceOver, real mobile devices, known hotel outcomes, 3–5 first-time users,
selected-design performance, host sizing, deployment/rollback/reboot and the public
live journey remain explicit gates until completed. Provider permission and
published-terms restrictions remain unresolved risks; they are no longer an
implementation pause under Nadav’s updated direction. No purchase, booking,
message or domain registration is authorized by implementation of this plan.
