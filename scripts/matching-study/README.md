# Original matching refactor

This is the completed comparison step for preserving the original matcher while
simplifying its implementation. It is offline tooling; the running app still uses
`backend/domain/matching.js`. Replacing its matching policy and result presentation
is a separate integration change.

## Implementation

- `original.mjs` independently reproduces the conjunction in
  `728f9ed:backend/util/helpers.js`, with synchronous iteration and ordered
  `[offerId, hotelId]` results. It supplies the behavior reference.
- `refactored.mjs` validates each observation once, uses straightforward loops and
  short-circuit checks, and returns the same ordered pairs for eligible input.
- `matching.test.mjs` covers every condition, rounded boundaries, strict raw types,
  array/object order, missing facts, duplicate rate observations, several hotels
  per offer and several offers per hotel. A deterministic varied sample checks
  ordered parity against the independent reference.
- `compare.mjs` replays a saved capture through both versions and the current app
  matcher. It asserts exact eligible-row parity and separately reports whether
  running the original on all raw rows agrees or throws.

The refactor retains strict price, star and neighborhood equality; the original
rating and review bounds; and exact JSON equality for highlighted amenities and
icons. It preserves offer/hotel arrival order and repeated rate observations.
It does not convert prices to cents, sort amenities or deduplicate observations.

Missing required facts are an explicit behavior change: the refactor rejects and
counts those rows. The old function could throw or match two absent values.
Eligibility requires nonempty IDs, finite numeric values or numeric strings,
comparison objects and both amenity arrays. Values keep their original types.
A named row must have an explicit RTL type or a nonempty program name; the exact
`Express_Deal` program is excluded by the predicate. Empty amenity arrays remain
eligible, as in the original. These rules are input availability checks, not a
claim that all accepted fields establish identity.

## Current capture: 8 September 2026

One request through the existing adapter/service, including its deadline and
durable provider state, retrieved all 373 reported rows: 102 Express offers and
271 named hotels. Context: Las Vegas, 21–24 September 2026, one room, two adults,
no children, USD. Capture started at 18:35:08 UTC and completed at 18:35:13 UTC.

The query added only fields used by the original matcher:

```graphql
ratesSummary { minStrikePrice } # alongside existing selected rate fields
amenitiesIcons { iconName amenityName __typename }
```

All rows contained both selected fields. Every Express strike price was a decimal
string. One Express row lacked a review count and one named hotel lacked
highlighted amenities; both were rejected and neither matched in the original.
The capture contains adapted listing rows before domain normalization. The
adapter retains the comparison values and arrays; it fills null retail program
names with `RETAIL`, which has the same outcome under the original exclusion.

| Result on this capture | Original | Refactored | Current app |
| --- | ---: | ---: | ---: |
| Offer/hotel pairs | 60 | 60 | 180 |
| Offers with one distinct matching hotel | 60 | 60 | 60 |
| Offers with multiple distinct matching hotels | 0 | 0 | 38 |
| Offers with no matching hotel | 42 | 42 | 4 |

All 60 original pairs appear in the current app's results. Its other 120 pairs
come from a different matching policy; they are not automatically wrong hotels.
Original and refactored results agree exactly, including order, on this whole
capture and on eligible rows separately.

The strike-price condition matters in this sample: after the original program,
star, neighborhood and rating checks, 287 pairs remain. Exact strike-price equality
reduces them to 60; the review and amenity checks retain those 60. Removing only
strike-price equality would admit matches for 37 previously unmatched offers.
That observation does not justify removing it or establish current strike-price
semantics universally. The retained rules remain unchanged.

A star/neighborhood index reduced eligible pair visits from 27,270 to 394, but its
measured median was slower (0.316 ms versus 0.209 ms), so it was removed. The final
plain refactor measured 0.246 ms versus 0.198 ms for the reference in a separate
run, including validation. Each measurement used 20 warmups and 100 iterations.
These are local CPU observations on one small capture; no speedup is claimed.
The single capture took about 4.9 seconds, overwhelmingly outside matching work.

## Reproduce

Use Node 24.20.0 from `.nvmrc`. No additional dependencies are required.

```sh
node --test scripts/matching-study/matching.test.mjs
node scripts/matching-study/compare.mjs output/original-matching/current-listings.json
npm run check
```

Verified on Node 24.20.0: all 189 repository tests, lint and the production build
pass. A separate skeptical review found and verified the fix for numeric-ID report
grouping. No browser check was needed because application behavior is unchanged.

The capture and JSON report are ignored local artifacts under
`output/original-matching/`; they are not shipped inventory. The comparison tool
requires saved `{ pages: [{ listings: [...] }], context, ... }` data with both
original fields selected and performs no network requests. A fresh clone can run
the deterministic tests but needs its own capture for the live-data replay.

This establishes original-rule viability and refactor equivalence for one current
search. It does not measure hotel-identification accuracy, worldwide coverage,
family-search matching or provider uptime. Before integrating, retain these raw
comparison facts through the adapter and match observations before the current
normalizer discards fields or merges conflicting rates. Public output should
handle zero, one and multiple distinct hotel IDs explicitly; choosing the first
match would change the preserved behavior.
