# Original matching rules in production

The study imports `matchObservations` from `backend/domain/matching.js`. There is
one production implementation and an independent test oracle, `original.mjs`,
which reproduces the conjunction in `728f9ed:backend/util/helpers.js`.

## Preserved behavior and limits

Matching runs on adapted raw observations before display normalization. It retains:

- Strict price, star and neighborhood equality, including raw number/string types.
- The original inclusive rating and review-count bounds.
- Exact JSON equality for highlighted amenities and icons, including array and
  object-property order.
- Arrival order and repeated rate observations in the raw pair results.

The promoted eligibility checks require nonempty IDs, finite numbers or numeric
strings, comparison objects and both amenity arrays. They do not coerce values
used by strict equality. Named rows require explicit RTL type or a nonempty
program name; the predicate excludes exactly `Express_Deal`. Empty amenity arrays
remain eligible. The independent legacy predicate can throw or match equal absent
values on incomplete rows, so parity assertions cover eligible observations.

Production rejects more than 100,000 eligible raw observation pairs or more than
5,000 retained matching pairs with `RESULT_TOO_LARGE`. Duplicate rates count
before grouping hotel IDs; a response never truncates matches into a unique hotel.

After matching, production normalizes safe display fields and returns one likely
hotel or an unresolved result. Partial coverage wins over all other outcomes;
missing or conflicting facts precede ambiguity, no match and a single identity.
Repeated rates for one coherent hotel remain one hotel. Tier ranking and the
previous supporting-evidence model are retired.

## Saved capture replay

The existing September 8, 2026 capture contains 102 offers and 271 named hotels
for Las Vegas, September 21–24, one room, two adults and no children. It contains
both `ratesSummary.minStrikePrice` and `amenitiesIcons`. The capture used one
request through the guarded provider service and took about 4.9 seconds. This
integration replay reused the saved file and made no provider request.

The production matcher and independent original returned the same 60 ordered
pairs over 27,270 eligible comparisons. One offer lacked a review count and one
hotel lacked highlighted amenities. The public resolutions were:

| Resolution | Offers |
| --- | ---: |
| Matched | 60 |
| Unresolved: no match | 41 |
| Unresolved: missing facts | 1 |
| Unresolved: ambiguous | 0 |

These pairs and outcomes are deterministic replay evidence, not independently
verified identities. Removing the source hotel from a synthetic example can
leave a unique compatible neighbor, so uniqueness does not prove identity.

The earlier study recorded 180 pairs under the previous application policy.
That policy comparison is historical; the application now uses the original
predicates. Earlier index experiments did not improve local CPU time and were
removed. No performance improvement or identification accuracy is claimed.

## Reproduce

Use Node 24.20.0 from `.nvmrc` and the existing root workspace dependencies:

```sh
node --test backend/domain/matching.test.js backend/domain/normalization.test.js scripts/matching-study/*.test.mjs
node scripts/matching-study/compare.mjs output/original-matching/current-listings.json
```

The 41 focused tests cover every original predicate, boundaries and types, parity
on deterministically varied rows, raw limits, resolution precedence, duplicate
rates, missing/conflicting facts and safe display normalization. Whole-application
and browser verification are recorded in `docs/ACCEPTANCE.md`.

The comparison tool reads saved `{ pages: [{ listings: [...] }], context, ... }`
data and makes no network requests. Capture and report files under
`output/original-matching/` are ignored local artifacts. A fresh clone can run the
deterministic tests without a capture. This work does not establish worldwide
coverage, family-search accuracy, provider uptime or public readiness.
