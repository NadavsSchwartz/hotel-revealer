# Live integration evidence

**Updated 2026-09-07 Pacific time (2026-09-08 UTC): local live search, candidate
details and original-offer handoff verified; hosted release remains unverified.**

Nadav confirmed there is no existing partner agreement and explicitly directed
normal public-endpoint implementation for the public open-source app. That removes
the earlier provider-permission prerequisite as an implementation gate. It does
not establish provider permission or an exception to the published terms. The
previous research and unsent inquiry remain below as historical records.

## Implemented access

Normal server startup defaults to `HOTEL_PROVIDER=priceline`; tests explicitly use
`HOTEL_PROVIDER=disabled`. The production app uses the selected cinematic homepage
and its actual search/results/detail routes. It has no fixture or demo endpoint.

The adapter sends ordinary JSON POST requests to
`https://www.priceline.com/pws/v0/pcln-graph/`, an endpoint used by the current public
website. The observed requests required no API key. It sends normal content and
accept headers with no cookies or credentials and rejects redirects. No identity
spoofing, proxy rotation, challenge solving or automatic retry is implemented.
The public website interface can change without notice; successful requests do not
establish a supported external API, uptime commitment or permission to reuse data.

Combined searches request named retail (`RTL`) and opaque Express (`SOPQ`) rows
with `first:500`. The service bounds retrieval to three pages, one active upstream
call, a one-second start gap and four queued requests. Search/detail deadlines are
20/10 seconds from admission; streamed upstream and public JSON payloads are capped
at 2 MiB. Search/detail caches hold at most 25/100 entries for five/one minutes.
These are application limits, not verified provider traffic or caching allowances.

Before dispatch, durable disabled state is written. The classified outcome is
restored after the upstream call. A child-process SIGKILL test demonstrates that
an interrupted call remains blocked after restart. Hardware or volume loss is
unproven. Stop the app and review a block or interrupted call before running
`npm run provider:reset -- --after-review`, then restart. Do not use reset to
bypass provider restrictions.

## Recorded live evidence

### Currency verification — September 8, 2026

The selector supports USD, EUR, GBP, CAD and AUD. Priceline's public
[hotel page](https://www.priceline.com/hotels) lists all five as accepted currencies.
Fresh synthetic public searches for Las Vegas, October 12–14, one room, two adults
and no children returned listing `minCurrencyCode` values matching each requested
non-USD currency. One newly returned Express offer per currency then returned
matching nightly/total prefixes: EUR `€`, GBP `£`, CAD `C$`, and AUD `AU$`.
The corresponding two-night base/total pairs were EUR 240/414.21,
GBP 206/356.06, CAD 384/664.19, and AUD 386/666.70. These are independent
point-in-time quotes, not exchange-rate comparisons or hotel identity evidence.
No saved personal trip was reused, and no booking was made.

Amounts are supplied by the provider, with no client conversion. Search, details,
quote normalization and handoff URLs carry the selected currency; currency
fallbacks suppress affected prices. Original totals still require the exact
rate/base/fee corroboration described below. Rendered provider checkout parity
for these non-USD probes and hosted deployment remain unverified.

The local artifacts below are ignored files under `output/live-access/`; they are
not committed inventory fixtures. `flow-research.md` records the bounded public
website/bundle research, the selected request shape and its limits.

| Observation | Evidence and limit |
| --- | --- |
| Initial Las Vegas listing probe | `listing-probe.json` and its summary: HTTP 200 JSON, 10 retail rows, 2,346 ms, 7,919 bytes; no recorded challenge |
| Combined 100-row search | `listing-combined.json` and its summary: 98 named hotels and 2 Express offers out of 371 reported rows, 2,976 ms, 83,936 bytes |
| Combined 500-row search | `listing-large.json` and its summary: all 371 reported rows, comprising 271 named hotels and 100 Express offers, 4,583 ms, 331,538 bytes |
| Historical multi-room base arithmetic | `family-page.json`: two rooms, four adults, requested child age 7, three nights. Base arithmetic agrees subject to display rounding, but the old plain-age API encoding was incorrect; this does not verify child occupancy |
| Tel Aviv listing probe | `tel-aviv-page.json`: one Express offer and 99 named hotels. Provider city country code was `IS`, not GeoNames ISO `IL` |
| Coordinate-only route | `coordinate-only-summary.json`: HTTP 200 with provider error 498, “Null exact match or null matched city”; no recorded challenge. This did not establish a usable coordinate-only search |
| Named-hotel details | `detail-probe.json`, plus the actual app flow described below, establish separate retail detail retrieval; they do not verify hidden hotel identity |
| Listing discounts | `pricing-listings.json`: the combined query returns provider `displaySavingsPct`; this adds no per-offer detail request |
| Historical one-room total agreement | `original-total-display-s.json` and `modern-total.json`: both quote USD 66 nightly, USD 198 base stay and USD 439.02 total; the modern response explicitly includes taxes and fees. Agreement for this one-room probe did not validate the legacy total for multiple rooms |
| Superseded legacy family total | `family-original-total.json`, captured 2026-09-08 03:40:21 UTC: USD 66 nightly, USD 396 base stay and USD 873.06 legacy total. Old child encoding and the later-discovered legacy multi-room fee defect prevent treating this as validated family pricing; the saved offer also later displayed as unavailable on Priceline |
| Modern family total | `modern-family-total.json`, captured 2026-09-08 03:54:59 UTC: September 21–24, two rooms, four adults and child age 7 encoded as `{age:'1-7'}`. Root and matching room rate report USD 4 nightly, USD 24 base stay and USD 375.90 total, explicitly including taxes and fees; reported property fees are USD 339.78 |
| Corrected child-age listing request | `ordinal-children-listing.json`, captured 2026-09-08 03:57:14 UTC: `children:['1-7']` returns 67 Express offers and 213 named hotels. The compared Express row reports USD 4 nightly, USD 24 base stay and 80% advertised base-rate discount, consistent with modern pricing |

The two combined Las Vegas probes used September 21–24, 2026, one room, two adults,
USD and the same request options. The 500-row probe retrieved that snapshot in one
call. It is evidence for that request size in that search, not a worldwide page
limit guarantee, controlled latency benchmark or measured reduction in blocking.
Retrieved completeness never means every possible hidden hotel was identified.

The earlier actual app journey began at the homepage on
[127.0.0.1:4320](http://127.0.0.1:4320): type/select Tel Aviv, choose September 21–26,
one room and two adults, then click Search. It returned four Express offers and
20 displayed candidates after checking **332 named hotels in one page**. Crowne
Plaza City Center (`9056603`) showed four provider photos, 12 amenities, the address
“136 Menachem Road Azrieli Center 5” and a separate retail quote. The original-offer
link opened Priceline with the same five nights, one room and two adults. No
booking was made. Port 4330 was only a temporary redirect to the same local app;
one process performed provider work.

Priceline displayed USD 183 nightly and USD 967 total in that handoff. The app
recorded a USD 915 base-stay quote with tax/fee inclusion unknown; it did not
guarantee that amount as the final provider total. This difference reinforces the
need to keep source quotes and provider checkout information distinct.

An earlier app run for that trip checked 295 named hotels across three old
100-row pages in 9.628 seconds and showed a USD 237.54 retail nightly candidate
quote. It preceded the 500-row optimization. Inventory and quotes are point-in-time
observations, so these runs are not a controlled before/after latency comparison.
Address display now works without a description.

## Added quote and comparison contract

Search offers now expose normalized `clues` for guest rating, review count and
amenities. Each candidate's `evidence.comparisons` has stable keys for
`neighborhood`, `stars`, `guestRating`, `reviewCount` and `amenities`, with `match`
or `unknown` values. Known contradictions exclude a candidate; matching values
remain evidence for a possible hotel, not an identity confirmation.

Listing quotes may include `advertisedDiscount:{percent,source:'Priceline'}` from
`displaySavingsPct`. Selected original quotes use only the modern root nightly
`savingsPercentage`. These are provider-reported base-rate discounts; they are not savings
derived from a candidate's retail rate or discounts on a fee-inclusive total.
In the recorded Las Vegas probe, the base-rate discount was 61%, while the modern
total response reported 42%. Priceline's [savings disclosure](https://www.priceline.com/partner/savings-day)
also permits an average-based estimated retail comparator. Missing/invalid
discounts are omitted. The app does not promise “you save” a computed amount.

Opening a candidate sends one HTTP request with two root GraphQL resolver calls.
The `details:hotelDetails` alias uses only the named `hotelID`; the modern
`original:sopqHotelDetails` alias uses only the opaque `pclnId`, with the same
dates, rooms, adults, child ages and USD currency. The app does not fetch room
details for every result or derive original totals from candidate retail rates.

The legacy original `hotelDetails.grandTotal` path and preferred-summary-rate
selection were removed. A later two-room STRAT comparison exposed a legacy total
of USD 198.10 versus a modern total of USD 375.90, with missing second-room
property fees despite plausible base arithmetic. The earlier one-room agreement
and family arithmetic checks did not establish complete multi-room fees.

The modern parser requires `$` prefixes on root `MIN_PRICE` and `GRAND_TOTAL`,
an explicit description that the total includes taxes and fees, and exactly one
identified room rate whose `AVERAGE_NIGHTLY_RATE` and `TOTAL` equal both root
amounts. That rate's `EXCLUSIVE_PER_STAY` supplies the base stay. Amounts must be
positive exact decimal cents; fractional cents are rejected rather than rounded
into agreement. For all room counts, base cents must exactly equal nightly cents
× calendar nights × rooms. Even a one-cent mismatch leaves the listing fallback.
The provider total is never multiplied and property fees are never inferred.
Conservative matching can omit a total when rounding or multiple rates prevent
an exact match; it does not establish every room allocation.

Child encoding was also corrected: legacy listing/named-detail calls use
one-based ordinal-age strings, such as `['1-0','2-7']`, and modern occupancy uses
`[{age:'1-0'},{age:'2-7'}]`. Public context stays `[0,7]` and handoff URLs use
plain ages `/children/0,7`. The old `['7']` API request returned different
inventory and a USD 3 nightly/USD 18 base quote for the compared offer; the
corrected `['1-7']` request returns USD 4/USD 24, agreeing with modern pricing.
Earlier plain-age API probes are therefore historical, not child-occupancy proof.

When valid, the original quote adds `totalCents` and `totalTaxesFees:'included'`
to `offer.quote`; its separate nightly and stay base amounts use
`taxesFees:'excluded'`. The USD 439.02 API quote above is an actual provider-quoted
amount, corroborated by the modern response's explicit tax/fee description. A
separate rendered website check showed USD 418.77 for the linked offer. Those
amounts did not agree, and the cause was not established; neither this field nor
the handoff link guarantees an identical website or final checkout price. A saved
legacy family offer also subsequently displayed as unavailable.

The corrected application subsequently completed the fresh family journey:
`ux-live-search.json` and `ux-live-detail.json` record 67 offers/213 named hotels,
USD 4 nightly, USD 24 base and USD 375.90 inclusive original quote for the STRAT
comparison (not a confirmed identity). The actual browser displayed the quote,
expired it and refreshed it. Its original link opened Priceline with September
21–24, two rooms, four adults and one child. Expanded provider price details showed
USD 24 base, USD 7.98 taxes/fees and USD 339.78 property fees: USD 371.76 total.
This remaining API/website difference has no established cause. No booking was
made, and neither future availability nor exact checkout-price parity is claimed.

If original pricing is missing, invalid, ambiguous or unavailable, no inclusive
total is invented and the listing quote remains. Named details can still be
available in that case. Conversely, a valid original total can accompany
`detailStatus:'unavailable'` when named metadata fails. Listing tax/fee treatment
remains `unknown`; final room selection, optional incidentals and any later
provider price changes remain outside this quote contract.

## Provider handoff and interpretation

The ordinary provider guest editor and rendered Express page were checked for
aggregate rooms/adults and child ages. The verified route preserves the same trip:

```text
/relax-ui/at/express/{cityId}/{opaqueOfferId}
/from/YYYYMMDD/to/YYYYMMDD/rooms/2/adults/4/children/7,0?cur=USD
```

This is an original opaque offer link. A named candidate's retail rate remains
separate. Room allocation and the final bookable room choice still occur at the
provider; a listing cannot promise the final booking total. Quotes may change
between retrieval and handoff. Tax/fee inclusion defaults to `unknown` for listing
and retail base quotes; the separately verified original-detail total uses the
explicit inclusion contract above. These probes do not establish worldwide
pricing accuracy or agreement between the API and every provider web session.

The provider UI displayed masked rating/review clues as minimums, including “7+” /
“3000+” and “8+” / “2100+”. The adapter explicitly marks those clues as minimums.
It does not reinterpret raw legacy fields or claim a candidate is a verified match.
Opaque IDs are bounded at 1024 safe characters; named hotel IDs at 200. Images must
pass the local host allowlist, including the observed `mobileimg.pclncdn.com` CDN.

For geography, every nonempty page must contain a valid named hotel or opaque
neighborhood with coordinates within 100 km of the selected GeoNames place.
Otherwise the API returns `PROVIDER_DESTINATION_UNSUPPORTED` (422). This guards
against distant namesakes but does not establish exact provider city boundaries,
worldwide inventory or the meaning of non-ISO provider country codes.

`offerExpiresAt` keeps the five-minute search relationship and original-offer link
separate from the one-minute details lifetime. An inclusive original quote also
has its own nested `offer.quoteExpiresAt`, 60 seconds after retrieval. The cached
total is not extended by search revalidation; an expired total falls back to the
current listing quote rather than borrowing the link's longer lifetime. The UI
must hide expired original totals and retail quotes and offer refresh while an
independently fresh original-offer link can remain available.

## Remaining evidence and risks

The normal public flow works locally. Provider permission, contractual allowance
for pre-booking identification, display/image reuse, cache duration, deep links
and traffic remain unresolved. No known-outcome dataset establishes live matching
accuracy. Manual VoiceOver, physical devices, first-time-user sessions, performance
of the selected design, hosted memory/concurrency, deployment/rollback/reboot and
the actual public live journey remain open in [ACCEPTANCE.md](ACCEPTANCE.md).

No provider inquiry, partner application, booking, purchase or deployment was
performed as part of this work. Ordinary successful access does not establish a
legal exception or permission, and a block or challenge is not bypassed.

## Historical terms and partner research

The following findings were recorded during the earlier prerequisite review on
2026-09-07. They explain the unresolved permission risk; they are not a current
instruction to pause implementation under Nadav's updated direction.

- [Priceline terms, §3.2.5](https://www.priceline.com/static-pages/terms_en.html)
  expressly prohibit automated identification of Express Deal and Pricebreaker
  suppliers before booking. Section 2.2.1 separately requires express written
  permission for automated content collection, copying/display, and deep booking links.
  These terms were retrieved during this review.
- [The official PPS status page](https://status.pricelinepartnersolutions.com/)
  lists hotel search, pre-book and booking services. An endpoint name containing
  `Express` does not establish that it supplies Priceline.com's hidden Express Deal
  inventory or permits identifying suppliers.
- The official partner-network repository's
  [onboarding document](https://github.com/priceline-partner-network/api-documentation/blob/master/src/getting-started.md)
  directs new applicants to its
  [affiliate contact form](https://pricelinepartnernetwork.com/contact?type=affiliate),
  existing partners to their account manager for API access, and describes
  certification before production launch. **This is historical guidance:** the
  repository was last updated in 2022. Current onboarding requirements and the
  contact form's availability were not verified.
- At that review, the [PPS website](https://pricelinepartnersolutions.com/) and
  [developer portal](https://pricelinepartnersolutions.com/developers/) returned 403
  to the research tool. No authenticated documentation was accessed.

No published authorization for Hotel Revealer's specific identification use was
found. This does not establish that a negotiated exception is impossible.
Successful ordinary website requests, generic affiliate acceptance, or possession
of an API key would not by themselves resolve the stated use restriction.

## Superseded prerequisite checklist

The earlier proposal asked for written authorization covering identification and
public presentation, current partner documentation/credentials, confirmed
cache/display/link/traffic terms, and a scoped authorized-integration test. It also
required disabling live access until those items passed. Nadav explicitly removed
that implementation gate after confirming there is no partner agreement. Those
permissions have not thereby been obtained; the concerns remain documented above.
No generic affiliate acceptance or API key would itself prove an exception for
this specific identification use.

## Historical inquiry draft — not sent

This draft predates the updated implementation direction and is retained for
reference. It has not been submitted and does not gate current implementation.


**Subject: Permission and API suitability for Hotel Revealer**

Hello Priceline Partner Solutions,

I'm developing Hotel Revealer, a small public portfolio application for occasional
travelers. It would compare Priceline Express Deal clues with named hotel listings
for the same dates, display possible hotel candidates with uncertainty clearly
stated, and link travelers to the original Priceline offer to book.

Before implementing live access, can Priceline expressly authorize this automated
pre-booking candidate-identification use, including public display? I understand
that the public terms prohibit automated identification of Express Deal suppliers.

If this use can be approved, which partner integration supplies the relevant
opaque offers, named listings, hotel details, and original-offer links? Please also
confirm permitted caching durations, attribution/display rules, traffic limits,
access costs, and launch requirements.

The planned interface supports English/USD, worldwide destination search, room
and adult counts, and children’s ages, with no bookings or payments handled by my
application. Please confirm supported destinations, per-room occupancy and age
requirements, permitted stay lengths, and whether supplied quotes represent one
room or the entire requested trip.

Thank you,
Nadav Schwartz

## Historical research boundary

The initial terms/onboarding review queried public documentation only and did not
query inventory. Later, explicitly directed public-access work made the bounded
live listing/detail requests and browser checks recorded above. Neither phase
sent the inquiry, submitted a partner application, booked a hotel or bypassed an
access control. Hosted behavior and live identification accuracy remain unverified.
