# Priceline shortlist agreement — 2026-09-10

**11 of 11 checkable offers were inside Priceline’s named-hotel shortlist.**
Fifteen offers were selected from a target of twenty. Four selected offers could
not be checked at property level, and London supplied no matched offers because
its search exceeded the existing deadline. No selected offer was outside a named shortlist.

This measures shortlist membership, not which hotel a booking would actually reveal.

## Method

- Live application: https://hotelrevealer.tech, using the deployed `58f9c1f` application.
- Fixed trip: September 24–26, 2026; one room, two adults, no children; USD.
  Dates were fourteen days after the UTC collection date.
- Cities: Los Angeles, Las Vegas, New York, London. The first five distinct
  matched offers under lowest room rate were frozen before opening their handoffs.
- Each original-offer page was checked for the selected offer ID, dates, occupancy
  and USD. Only hotel IDs linked under the explicit guaranteed-hotel section counted.
  Brand logos and similar-property recommendations did not count.
- Searches and page visits were sequential. There were no bookings, provider-state
  resets, substituted offers, or alternate searches to improve the sample.

## Results

| City | Planned | Selected | Inside shortlist | Outside shortlist | Uncheckable selected offers | Unfilled slots |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Los Angeles | 5 | 5 | 5 | 0 | 0 | 0 |
| Las Vegas | 5 | 5 | 4 | 0 | 1 | 0 |
| New York | 5 | 5 | 2 | 0 | 3 | 0 |
| London | 5 | 0 | 0 | 0 | 0 | 5 |
| **Total** | **20** | **15** | **11** | **0** | **4** | **5** |

The eleven property-level checks cover 73.3% of the selected offers and 55% of
the planned sample. The sample uses one itinerary and favors the cheapest deals;
it is not a representative accuracy estimate.

## Selected offers

| Case | Application hotel (Priceline ID) | Result | Guaranteed hotel IDs or limitation |
| --- | --- | --- | --- |
| LA-01 | Ramada by Wyndham Pasadena (`43118`) | inside shortlist | 39116, 19305804, 43118 |
| LA-02 | Torrance Inn LAX Airport Area (`2674905`) | inside shortlist | 24131506, 2674905, 41606 |
| LA-03 | Rodeway Inn Commerce - Los Angeles (`21143506`) | inside shortlist | 1763803, 63030205, 21143506 |
| LA-04 | Quality Inn & Suites Bell Gardens-Los Angeles (`2506105`) | inside shortlist | 40199, 5241205, 2506105 |
| LA-05 | Rodeway Inn Regalodge (`41878`) | inside shortlist | 41878, 9170404, 301407703 |
| LV-01 | Arizona Charlie's Decatur (`48734`) | uncheckable | No named-hotel shortlist displayed. |
| LV-02 | Circus Circus Hotel, Casino & Theme Park (`48948`) | inside shortlist | 600821794, 600822832, 48948 |
| LV-03 | Downtowner Boutique Hotel (`46294`) | inside shortlist | 46294, 1879603, 48943 |
| LV-04 | Arizona Charlie's Boulder (`48728`) | inside shortlist | 309379603, 48728, 20019004 |
| LV-05 | Thunderbird Boutique Hotel (`3791405`) | inside shortlist | 3791405, 26746603, 58057305 |
| NY-01 | Floral Park Motor Lodge (`40652`) | uncheckable | No named-hotel shortlist displayed. |
| NY-02 | Days Inn by Wyndham Brooklyn Marine Park (`69893403`) | uncheckable | Brand logos only; no named-property IDs. |
| NY-03 | GLo Best Western Bronx NYC (`336368903`) | inside shortlist | 600208991, 1571503, 336368903 |
| NY-04 | Holiday Inn Express And Suites Bronx NYC By IHG (`233157904`) | inside shortlist | 66369503, 233157904, 254663503 |
| NY-05 | Hilton Garden Inn Queens/Jfk Airport (`1881804`) | uncheckable | No named-hotel shortlist displayed. |

## London and retained evidence

London returned partial coverage at `2026-09-10T02:29:50.975Z`. The correlated
provider log recorded `DEADLINE_EXCEEDED`, two fetched pages, and 20,032 ms.
All 39 eligible offers were unresolved due to incomplete coverage, leaving no
matched cards to select. Its five unfilled slots are not counted as checked offers.

Raw identifiers, timestamps, page snapshots, screenshots, frozen selections, and
the bounded London log excerpt remain in ignored local evidence at
`output/verification/targeted-cleanup/shortlist/`. The evidence record contains
all fifteen selected offers. Browser attachment failures required reopening the
same first Los Angeles offer for its screenshot; no replacement offer was selected.
For Las Vegas and New York, `providerUrl` records the browser-reported final page
URL; their text captures contain the page content. Los Angeles accessibility
captures also include the final URL.

Evidence record SHA-256: `ed5746e80eb8acd413d0f42f8764bc9bb1dc4e5e6a8a29955533efbe2bb33505`.

The production matcher and its eligibility rules were not changed by this check.
