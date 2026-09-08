# Hotel Revealer implementation contract

Approved scope: Room shows only deals with one inferred hotel in search results,
fetches complete prices on demand, and preserves the original supplier handoff.
Unresolved observations remain in the API for diagnostics and revalidation; they
are excluded from result counts, sorting and pagination.
The application supports English, USD, worldwide destination search, room/adult
counts and children’s ages. This milestone covers local implementation and
verification; public-release gates remain separate. No demo substitute.

## Status — 2026-09-08

Canonical checkout: `/Users/nadavschwartz/Developer/hotel-revealer/hotel-revealer`.
The selected homepage uses the real search/detail routes. The original matcher
now runs before display normalization, and both named-hotel and offer-only detail
views can request an original-offer total. Multi-candidate expansion and ranking
have been retired. The earlier Documents/Codex checkout is preserved.
Nadav subsequently directed normal public-endpoint integration despite no partner
agreement, removing the earlier permission prerequisite from implementation.
Earlier local checks verified live listing/detail responses and original-offer links.
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
  Public context and handoff URLs retain plain ages. The adapter encodes each
  child as a one-based ordinal plus age: `[0,7]` becomes `['1-0','2-7']` for
  legacy listing/named-detail requests and `[{age:'1-0'},{age:'2-7'}]` for the
  modern original-offer request. Plain-age API strings were incorrect and are
  superseded; `/children/0,7` remains the correct handoff URL format.
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
- Offer: `{offerId,neighborhoodName,stars,clues,quote,handoffUrl,resolution,
  candidates,quoteExpiresAt?}`. Public `clues` contain the normalized
  `guestRating`, `reviewCount` and `amenities` evidence described below.
  Quote: `{nightlyCents,stayCents,currency:'USD',
  taxesFees:'included'|'excluded'|'unknown'}`; missing amounts are null.
  Verified price-basis metadata is optional: `{roomCount,nightlyBasis:'per-room',
  stayBasis:'all-rooms'}`. The adapter preserves provider stay amounts rather than
  inventing a total. Listing quote tax/fee treatment remains unknown.
  Optional `advertisedDiscount:{percent,source:'Priceline'}` is a provider-reported
  base-rate discount, not a discount on the tax-inclusive total or savings computed
  from an inferred hotel. Invalid or absent discounts are omitted.
  A separately retrieved original-offer quote can add
  `{totalCents,totalTaxesFees:'included'}`; its nightly/stay base amounts retain
  `taxesFees:'excluded'`. Missing or invalid totals are omitted, never synthesized.
  Opaque offer IDs permit up to 1024 safe characters; named hotel IDs remain 200.
- Resolution: `{status:'matched'}` or `{status:'unresolved',reason}`. Reasons have
  this precedence: `incomplete_search` for partial coverage; `missing_facts` for
  missing required offer facts or incoherent matching identity; `ambiguous` for
  multiple distinct matching hotel IDs; `no_match` for none. Exactly one coherent
  eligible hotel produces `matched`. Repeated rates for one ID are one identity.
  `candidates` is a compatibility array containing exactly one hotel when matched,
  otherwise empty. Missing or malformed resolution requires a controlled refresh;
  an older candidates-only response cannot establish an identification.
- Candidate: `{hotelId,name,neighborhoodName,stars,guestRating,reviewCount,
  amenities,thumbnailUrl}`. Cards say “Likely hotel” and explain once that names
  are inferred from deal information. A search with no matched offers shows
  “No hotel matches found”, with a retry explanation for incomplete searches.
  Matching is not a guarantee or a measured identification-accuracy claim.
- Detail input: context fields plus required `offerId` and optional `hotelId`.
  An omitted hotel is valid; supplied empty, null or malformed hotel IDs are not.
  The server revalidates offer membership in the requested itinerary and, when
  supplied, the hotel relationship. A rejected hotel returns `INVALID_SELECTION`
  rather than silently changing the request into a successful named response.
  Offer-only cache/coalescing keys are `[canonicalTripKey,offerId,null]`.
- Detail response: `{context,retrievedAt,expiresAt,offerExpiresAt,offer,candidate,
  details,detailStatus:'available'|'unavailable'|'not_requested',
  quoteStatus:'available'|'unavailable'}`. Named details contain
  `{description,images:[],amenities:[],address,retailQuote:null|object}`.
  Offer-only responses have `candidate:null`, `details:null`, and
  `detailStatus:'not_requested'`, even if the revalidated offer is now matched.
  That view links explicitly to the hotel-detail view. A missing retail rate does
  not establish Express unavailability. Expected quote failures retain the
  validated offer and usable handoff; unexpected processing failures remain
  controlled HTTP 500s with private diagnostics. Unavailable totals are not cached,
  so an explicit retry can request pricing again; concurrent retries still coalesce.
  Metadata cache expiry does not shorten the separately revalidated offer expiry.
  An accepted original-offer total replaces `offer.quote` and adds the nested
  `offer.quoteExpiresAt` (60 seconds from retrieval). `offerExpiresAt` still tracks
  the five-minute search relationship; it does not extend price freshness or
  determine whether a safe supplier URL can be opened. Cached inclusive quotes
  are reused only while their own expiry
  is fresh. Expired complete totals in Details are withdrawn while a separately validated, safe
  supplier URL remains usable, including during refresh. The action becomes
  “Check current price on Priceline” for stale or unavailable prices. An unsafe or
  missing URL remains unavailable. A named hotel’s retail URL never substitutes
  for the opaque Express offer.
  Address rendering does not depend on description availability; the current
  adapter supplies no unverified description field.
- The API paths stay POST `/api/v1/hotelDeals` and POST `/api/v1/deal`.
- No test response mode or fixture switch is exposed by the production server.

## Matching, pricing and recovery

- `matchObservations` applies the original predicates to adapted raw rows:
  strict star, neighborhood and strike-price equality; rating/review-count
  bounds; and order-sensitive highlighted-amenity and icon equality. Eligibility
  checks do not coerce the values used for strict equality: `'150'` and `'150.0'`
  remain different. The listing query includes `minStrikePrice` and
  `amenitiesIcons`. The independent original study implementation is the test
  oracle; the study imports the production matcher.
- Work is bounded before public result construction: at most 100,000 comparison
  attempts and 5,000 retained matching pairs, counting repeated raw observations.
  Exceeding either returns `RESULT_TOO_LARGE` (503), never a truncated unique
  match. Existing page, row and payload bounds also apply. Display normalization
  and grouping by distinct hotel ID happen after matching; conflicting rows must
  not manufacture a coherent identity.
- Results show only valid `matched` offers. Full matching and API observations
  remain intact; filtering reduces the rendered list, not provider search work.
  Result counts describe deals, since different offers can infer the same hotel.
- Cards retain listing room rates with their supported per-room/night basis and
  unknown tax/fee treatment. Sorting offers “Lowest room rate” (default) and
  “Highest guest rating”, with unavailable values last and stable price/ID ties.
  Sorting and paging do not issue provider requests. Supplier room-rate discounts
  remain separate from total-price savings.
- The five-minute search-cache expiry no longer hides historical listing prices
  or raises a page-wide alert. Cards label them “Last seen room rate”; one short
  date/time and “Update prices” action appear above the list. Updates respect the
  existing service cache and cooldown. The one-minute complete-total expiry in
  Details is unchanged. No automatic pricing or polling is added.
- “View hotel & prices” is the primary card action and opens `/deal` with trip,
  offer and hotel IDs. The original Priceline offer is a secondary external link.
  The technical “About these results” disclosure is retired. Existing offer-only
  URLs remain supported for recovery, with no result-card entry point; those
  views retain their null-candidate binding rules and pricing/handoff behavior.
- The existing Redux structure and singleton request status remain. Request IDs
  prevent superseded completions from restoring loading or stale results. Detail
  guards check offer membership for offer-only views and offer-plus-hotel
  membership for named views. A newer search can reject an older relationship;
  an older detail response cannot restore it. A rejected identity is hidden while
  an independently validated offer can retain its handoff. Detail totals stay in
  detail state/cache and do not replace search snapshots or their object identity.

## Internal interfaces / work ownership

- Domain owns `shared/` and `backend/domain/`: validateSearch(input, now),
  validateDetail(input, now), normalizeListings(raw), matchObservations(offers,
  hotels), matchListings(offers, hotels, {coverageStatus}).
- `normalizeListings` returns `{offers,hotels,invalidRows}`. Normalized offers:
  `{offerId,cityId,neighborhoodId,neighborhoodName,stars,quote,handoffUrl,
  clues:{guestRating,reviewCount,amenities}}`. Numeric clues use
  `{kind:'exact'|'minimum'|'range'|'unknown',value?,min?,max?}`. Amenities:
  `{codes:[],complete:boolean}` or null. Never invent raw masking semantics.
- Normalized named hotels include candidate display fields, `neighborhoodId`,
  `amenities` (codes or null), `amenitiesComplete`, and `retailQuote`.
- `matchListings` returns `{offers,unassessedHotels,invalidRows}`. Matching and
  public resolution perform no I/O; ambiguity is not settled by ranking.
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
- Listing discounts come from `displaySavingsPct` without another provider request.
  Opening named details sends one HTTP request with two root GraphQL resolver
  calls: `details:hotelDetails` uses the named `hotelID`;
  `original:sopqHotelDetails` uses only the opaque `pclnId`. Both use the same
  travel context. Opening offer-only details sends a quote-only query containing
  the `original:sopqHotelDetails` root; it never invokes the named resolver with a
  missing ID. Room totals are not fetched for every search result, and named
  retail rates never price the original offer. Legacy original
  `hotelDetails.grandTotal` was removed after a
  multi-room probe undercounted property fees despite correct base arithmetic.
  The modern original response must follow a USD request, return `$` currency
  prefixes for root `MIN_PRICE` and `GRAND_TOTAL`, and explicitly describe the
  total as including taxes and fees. Exactly one identified room rate must match
  both root amounts through `AVERAGE_NIGHTLY_RATE` and `TOTAL`. Its
  `EXCLUSIVE_PER_STAY` supplies the base stay. Decimal amounts must convert to
  exact positive cents; fractional-cent rounding cannot create a match.
  For every room count, base-stay cents must exactly equal nightly cents × the
  shared calendar-night count × rooms. Any ambiguity or mismatch, including one
  cent, leaves the listing quote unchanged. There is no rounding tolerance or
  multiplication of the provider total. The quote's optional discount comes only
  from the root nightly `savingsPercentage`, not the total's savings percentage.
  A valid-looking total can still be withheld when rate/breakdown corroboration
  fails. Relaxing or separating those gates is deferred. No property fees are
  inferred or added to a complete provider total.
  Named detail availability and original quote availability are independent:
  missing original pricing leaves the listing quote; missing named details can
  return `detailStatus:'unavailable'` while retaining a valid original total.
  A recoverable failure of both leaves the revalidated offer with unavailable
  details. Offer-only requests keep `detailStatus:'not_requested'` when a total is
  unavailable.
  The inclusive total is the provider API's quote, not a guarantee of the website
  or checkout price. A recorded API total of $439.02 differed from $418.77 shown
  in the browser; [LIVE_ACCESS.md](LIVE_ACCESS.md) records the scope and limits.
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

## Bounded operational visibility

`/health` keeps its process-health status and `provider.available`, and adds
`provider.search`: `{status,eligibleOffers,matched,unresolved,
lastSuccessfulFreshSearch,consecutiveUnexpectedFailures}`. Startup status is
`unknown`, counts and last-success time are null, and the failure counter is zero.
After an observation, status is `observed`. After a successful fresh search,
`unresolved` contains counts for `no_match`, `ambiguous`, `missing_facts` and
`incomplete_search`; counts remain null if no search has succeeded.

Counts describe the last successful fresh underlying search. `eligibleOffers`
counts public offers eligible for the traveler journey, including those missing
matching facts. Cache hits and coalesced followers do not multiply observations;
fresh search work during detail revalidation is counted. Unexpected internal
search errors increment the consecutive failure counter while retaining the last
successful counts; a successful fresh search, including empty or unresolved
inventory, resets it. Expected provider errors retain their existing availability
and recovery behavior. The existing monitor fails after three consecutive
unexpected search failures.

This summary is bounded, in memory and diagnostic only. It logs no trip or hotel
identity and does not detect a well-formed provider change that drives matches to
zero. Baseline-aware anomaly detection and scheduled hotel searches are deferred.

## Required verification / remaining external gates

Run `HOTEL_PROVIDER=disabled npm run check` before `npm run test:browser`, because
browser tests serve the production build. Use `npm run measure:capacity` with the
stubbed adapter for raw matching, concurrent searches, and fresh/cached named and
offer-only detail work. Do not load-test the provider. See
[ACCEPTANCE.md](ACCEPTANCE.md) for the verified revision, checks and observed
capacity. Existing live evidence in [LIVE_ACCESS.md](LIVE_ACCESS.md) does not
establish new matcher or quote-only behavior; record any bounded live checks
separately. Browser fixtures are not live identity or pricing evidence.
Manual VoiceOver, real mobile devices, known hotel outcomes, 3–5 first-time users,
selected-design performance, host sizing, deployment/rollback/reboot and the public
live journey remain explicit gates until completed. Hosted HTTPS, old-tab
deployment recovery, real rollback/reboot and notification delivery also require
their own evidence. Provider permission and
published-terms restrictions remain unresolved risks; they are no longer an
implementation pause under Nadav’s updated direction. No purchase, booking,
message or domain registration is authorized by implementation of this plan.
