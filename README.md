# Hotel Revealer

Explore Priceline Express deals before booking, with one inferred hotel when the
available clues support it. **Hotel identity is inferred, not verified.** The
original offer, its current price, and the hotel inference remain separate.

![Hotel Revealer homepage with destination, dates, and traveler controls](docs/media/homepage.jpg)

## Engineering highlights

- **Conflicting evidence stays unknown.** Duplicate observations cannot restore a
  matching fact previously invalidated by a conflict. Raw matching values remain
  separate from display normalization. See [normalization](backend/domain/normalization.js)
  and [matching rules](backend/domain/matching.js).
- **Provider work has explicit limits.** Admission, request sharing, a bounded
  queue, deadlines, and persisted cooldowns coordinate one upstream call at a time.
  Cache hits and shared followers avoid new upstream work. See the
  [service](backend/provider/service.js) and [operating contract](backend/provider/README.md#budgets-caches-and-state).
- **Restart recovery preserves the original offer.** A bounded snapshot stores an
  exact trip/offer hash, optional provider city ID, and expiry. It can fetch a fresh
  original-offer quote and rebuild its handoff without reviving saved prices or a hotel inference.
  See the [selection store](backend/provider/selection-store.js).
- **Checks preserve independent evidence.** Differential tests retain the original
  matching implementation as a reference. Diagnostics allow only shipped source
  locations and controlled categories, excluding raw provider errors and trip data.
  See the [matching study](scripts/matching-study/README.md) and [diagnostics](backend/diagnostics.js).

## Architecture

React and Redux provide the traveler workflow. One Express process serves the
production build, local destination lookup, and hotel APIs.

```mermaid
flowchart TD
  Browser["Browser: search, results, details"] --> HTTP["Express: validation and HTTP admission"]
  HTTP -->|"Destination lookup"| Catalog["Local GeoNames catalog"]
  HTTP -->|"Hotel APIs"| Service["Provider service: shared work<br/>20s search / 10s detail deadline"]
  Service --> Cache{"Fresh cached response?"}
  Cache -->|"Yes: no upstream call"| Response["Response to browser"]
  Cache -->|"No"| Quota["Upstream admission"]
  Quota --> Queue["Scheduler: 1 active, 4 queued<br/>1s minimum start gap"]
  Queue -->|"Deadline-bound AbortSignal"| Adapter["Priceline adapter"]
  Adapter <--> Provider["Public Priceline website API"]
  Adapter --> Domain["Normalization, matching, quote validation"]
  Domain -->|"Eligible results"| Memory["Bounded in-memory caches"]
  Domain --> Response
  Memory -.-> Cache
  Service <--> Selection["Selection recovery snapshot<br/>hash, city ID, expiry"]
  Queue <--> State["Durable cooldown / block state"]
  Response --> Browser
```

A disconnected caller does not cancel shared work needed by another caller.
Admission remains held until pending work settles. Destination lookup makes no
provider request. The checksummed GeoNames catalog is vendored for reproducible,
offline startup and stays on the server; see [data provenance and refresh](docs/DATA_SOURCES.md).

## Run locally

Use Node **24.20.0** from `.nvmrc` and npm **11.19.0** with the root workspace lockfile.

```sh
nvm install
nvm use
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`; the frontend proxies `/api` to Express on port 5000.
The development command watches both frontend and backend source. Use
`PORT=5001 npm run dev` if port 5000 is occupied. Root `.env` values also apply;
see [.env.example](.env.example).

Normal startup uses the public Priceline adapter. No provider credential was
required in the recorded local flow. For offline development, use
`HOTEL_PROVIDER=disabled npm run dev`; destination lookup and the interface remain
available, while hotel requests report that the provider is not configured.

To serve the production build:

```sh
npm run build
NODE_ENV=production npm start
```

Open `http://127.0.0.1:5000`. `/health` checks application readiness, including
required production HTML, without calling the provider. It does not prove live
hotel search works.

## Verify

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:browser
```

`check` runs the configured static checks, native tests, and production build.
Browser tests use that build and intercept their own API requests with synthetic
fixtures; the production server has no fixture or demo endpoint. CI disables the
live provider.

The [acceptance record](docs/ACCEPTANCE.md) binds results to tested revisions and
distinguishes native tests, browser scenarios, live observations, and unresolved
gates. Browser configurations cover Chromium, mobile Chromium emulation, Firefox,
and WebKit; they do not establish physical-device or manual accessibility support.
Generated evidence stays in ignored `output/`, `test-results/`, and `playwright-report/`.

## Limits and evidence

- **Matching accuracy is unverified.** A unique inferred hotel is not an established
  identity. Missing facts stay unknown, price cannot establish identity, and
  retrieved pagination is not exhaustive provider inventory. Final booking terms
  and totals must be checked with the provider.
- **Live compatibility is a separate gate.** Local live searches, details, and
  handoffs are recorded in [live integration evidence](docs/LIVE_ACCESS.md).
  They do not establish future compatibility or permission for public use.
- **Operate one application process.** Queue, cache, request, and payload limits
  are application safeguards, not measured hosting capacity or provider allowances.
  Review an interrupted call or block before using the
  [stopped-process reset procedure](deploy/README.md#reset-a-reviewed-provider-block).
- **Public release remains open.** Container and hosted operation, rollback/reboot,
  real devices, manual assistive technology, known hotel outcomes, and first-time
  user sessions require their own evidence. Deployment files are preparation, not
  proof of a running public service.

Use the [documentation index](docs/README.md) for API contracts, dependency decisions,
data attribution, deployment preparation, and detailed verification history.
