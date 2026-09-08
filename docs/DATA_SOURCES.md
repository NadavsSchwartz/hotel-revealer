# Data sources

## Geographic destinations

Destination autocomplete uses a checked-in derivative of [GeoNames](https://www.geonames.org/),
licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
The [GeoNames download readme](https://download.geonames.org/export/dump/readme.txt)
states the license and describes the source columns. Attribution: **GeoNames**.
The application changes the source format, normalizes search aliases, joins country
and region names, and excludes historical, abandoned, and destroyed place records.

The source files were retrieved on **2026-09-07 at 22:00 UTC**:

- [cities5000.zip](https://download.geonames.org/export/dump/cities5000.zip): populated places, geographic IDs, coordinates, time zones, population, and alternate names.
- [countryInfo.txt](https://download.geonames.org/export/dump/countryInfo.txt): country/territory names and ISO codes.
- [admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt): first-order administrative region names.
- [readme.txt](https://download.geonames.org/export/dump/readme.txt): format, coverage, and license documentation.

Exact retrieval time, source URLs, response modification dates, byte counts, SHA-256
checksums, output checksum, and tuple columns are recorded in
[`data/destinations-source.json`](../data/destinations-source.json).

## Coverage and limits

The imported snapshot contains **69,656 places in 245 country/territory codes**.
GeoNames describes `cities5000` as places with population over 5,000 or first-order
administrative seats; actual source records also include smaller administrative
places and sections of populated places. This is worldwide geographic coverage,
including Israel, Tel Aviv, smaller cities, and source-provided names in multiple
scripts. It does not cover every village or every possible spelling.

The import removes 41 records with GeoNames feature codes `PPLH`, `PPLQ`, `PPLW`, or
`PPLCH`, according to the [GeoNames feature definitions](https://www.geonames.org/export/codes.html).
Remaining records and administrative assignments follow the source. Alternate
names can include older names and transliterations. GeoNames provides its data
without a warranty of accuracy, timeliness, or completeness.

These are geographic destinations. Inclusion does **not** establish hotel inventory,
provider support, current travel availability, rates, or a Priceline destination ID.
The destination lookup makes no provider request. The live Priceline adapter
searches using the selected canonical label and rejects a nonempty page unless a
named hotel or opaque neighborhood has published coordinates within 100 km of the
selected GeoNames place. This guard detects distant namesakes; it does not prove
exact provider city boundaries or inventory support for the entire catalog.
The provider returned country code `IS` for Tel Aviv, so it is not compared as if
it were the GeoNames ISO code `IL`. A coordinate-only probe returned provider
error 498; no supported coordinate-only route was established.

## Search behavior and storage

The 13,367,078-byte worldwide catalog lives in `data/destinations.json` and is loaded
only by `backend/destinations/index.js`. The frontend requests a bounded result list
from the application's destination endpoint; it does not import the world catalog.
Records use stable `geonames:<numeric ID>` IDs, city and country names, region,
coordinates, and source time zone. Labels include the region when a city name repeats
within a country.

Search ignores case, diacritics, and common punctuation. It ranks exact city names,
exact aliases, name prefixes, alias prefixes, and token prefixes, then uses source
population, normalized name, and ID as deterministic ties. An exact country name,
ISO code, or supported country alias returns that country's cities. Partial country
queries can also show cities whose own names match. Country suffixes qualify a city;
country-first queries and regions use contextual tokens. If a two-letter country
suffix produces no city matches, an exact administrative-code fallback supports
queries such as “Los Angeles CA” and “Chicago IL”; country matches retain priority.
Duplicate display labels retain distinct geographic IDs and show coordinates in
the suggestion list. There is no edit-distance
or unrestricted fuzzy search. Queries over 100 characters or containing control
characters are rejected; fewer than two normalized characters return no results.
The default result limit is eight, with a hard maximum of ten.

City aliases come from GeoNames. Country aliases additionally include a small set of
common English abbreviations and Hebrew names, including `ישראל`; those additions
are explicit in the import script. They add search terms, not geographic records.

`data/destinations-legacy.json` maps all 1,000 original US city/state labels to exact
IDs for old URLs. `data/destinations-legacy-public.json` is a separate 74,104-byte
browser-safe bridge containing `[originalLabel, destinationId, canonicalLabel]`
tuples. It lets existing URLs acquire the same canonical identity on both sides of
the API without sending the worldwide catalog to the browser. Original names come
from `shared/cities.js`; three spelling bridges are explicit in the import script
and resolve to source records in the specified state.

## Reproduce or refresh

Python's standard library is sufficient; no packages, API key, or paid service are
required. From the repository root, download and build a fresh snapshot:

```sh
python3 scripts/import-destinations.py --download --source-dir /tmp/hotel-revealer-geonames
```

To reproduce the exact derived files from retained source files and their download
manifest without accessing the network:

```sh
python3 scripts/import-destinations.py --source-dir /tmp/hotel-revealer-geonames
```

The importer verifies source checksums, unique IDs, expected worldwide coverage,
and every legacy city/state mapping before replacing output. Review catalog and
source metadata changes together, rerun destination tests and application checks,
and update snapshot counts and measurements in this document when refreshing.
Raw downloaded files are kept outside the repository and are not application
runtime dependencies.

## Local verification

On 2026-09-07, Node **24.20.0** on macOS arm64 passed eight destination tests covering
Israel and Hebrew names, smaller non-US cities, accent/alias matching, country and
region disambiguation, all legacy mappings, invalid IDs, malformed queries, and
result bounds. Run them with:

```sh
node --test backend/destinations/*.test.js
```

A local measurement loaded the full catalog once, warmed each of eight representative
queries once, and measured five synchronous searches per query using `performance.now()`:

| Query | Mean milliseconds |
| --- | ---: |
| Tel Aviv | 20.34 |
| Israel | 0.01 |
| תל אביב | 12.10 |
| Zikhron Yaaqov | 15.64 |
| Sao Paulo | 17.11 |
| Paris France | 0.72 |
| Portland Maine | 14.72 |
| zzqxxunlistedplace | 17.50 |

Module initialization took 539 ms. With `node --expose-gc` and one explicit collection
after initialization, the isolated process retained 60.95 MiB of JavaScript heap and
reported 287.72 MiB RSS (including runtime and startup allocations). These local
microbenchmarks are not hosted-load or whole-application memory measurements.

## Live hotel information

Hotel listings and selected named-hotel details come from Priceline's public
website GraphQL endpoint `/pws/v0/pcln-graph/`, checked on 2026-09-07 Pacific time
(2026-09-08 UTC). Combined listings distinguish retail `RTL` rows from opaque
`SOPQ` Express offers. The adapter preserves that distinction and uses only
observed fields; it does not claim a candidate is the hidden hotel.

The provider's rendered offer UI establishes minimum semantics for masked ratings
and review counts, such as “7+” and “3000+”. Prices use the observed per-room
nightly/all-room stay basis, retaining provider-supplied stay amounts. Taxes and
fees remain `unknown` unless separately evidenced. The provider may change a
quote between retrieval and handoff; the final room and booking total are not
established by a listing snapshot. In the verified five-night Tel Aviv handoff,
the app recorded a USD 915 base-stay quote while Priceline displayed USD 183
nightly and USD 967 total. That observation does not establish the fee composition;
the app retains unknown inclusion and directs final price checks to the provider.

Details supply named-hotel images, amenities, address and a separate retail quote.
The current adapter deliberately supplies no description because a current field
was not verified. Image URLs must pass the local CDN allowlist, including the
observed `mobileimg.pclncdn.com` host; remote text is rendered as text.

These sources are separate from GeoNames and its CC BY 4.0 license. No Priceline
partner agreement or data/image redistribution permission has been established.
Nadav directed public-endpoint implementation despite that unresolved matter;
see [LIVE_ACCESS.md](LIVE_ACCESS.md) for the historical terms review, current flow
evidence and remaining risks. Saved raw probes in ignored `output/live-access/`
are local verification artifacts, not a licensed distributable dataset or a
production fallback. No production fixture/demo endpoint is exposed.
