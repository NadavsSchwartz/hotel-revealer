# Hotel Revealer

A small traveler application showing Express deals with one inferred hotel.
It keeps the original offer and its price separate from the hotel inference.
An inferred name is never presented as a verified identity.

**Current status:** local search and candidate details use live Priceline responses.
The cinematic homepage is the actual application entry, not a separate demo.
The adapter uses the public website's GraphQL interface; no API key was required
in the verified flow. Its compatibility and public-release limitations are recorded
in [live integration evidence](docs/LIVE_ACCESS.md). Hosted portfolio signoff remains
subject to the outstanding [acceptance gates](docs/ACCEPTANCE.md).

## Run locally

Requires the exact Node version in `.nvmrc` (24.20.0) and its npm (11.19.0).

```sh
nvm install
nvm use
npm ci
npm run dev
```

The frontend runs at `http://127.0.0.1:5173`; `/api` is proxied to Express on port
5000. No database, map key, browser secret, or live-provider credential is needed.
Set `HOTEL_PROVIDER=disabled` for offline development. Normal startup defaults to
the live public Priceline adapter; CI explicitly disables it.

Use `PORT=5001 npm run dev` when port 5000 is occupied (for example by macOS
AirPlay). The API and frontend proxy use the same `PORT`, including values from
the root `.env`. Keep this command running while editing: it watches backend
imports as well as frontend changes, so both sides use the current source.

For the actual production build:

```sh
npm run build
NODE_ENV=production npm start
```

Open `http://127.0.0.1:5000`. `/health` checks the application without querying a
hotel provider. In production, it also checks the cached HTML-read result: missing
required HTML returns HTTP 500, while ordinary missing assets remain 404.
HTTP 200 does not prove live search is configured. Copy `.env.example` if needed.

For a local live session that must stay usable while QA rebuilds `frontend/dist`,
set `FRONTEND_DIST_DIR` to a separate copied build directory and retain its existing
hashed assets. The verified session used `output/live-access/frontend-snapshot`.
Normal startup and the container continue to use `frontend/dist` by default.

## Verify

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:browser
```

`check` runs lint, native Node domain/API tests, and the production build. Browser
tests start that build and intercept only their own API calls with synthetic
fixtures. The production server has no fixture or demo switch. Chromium, mobile
emulation, Firefox, and WebKit tests do not substitute for actual Chrome/Edge/
Safari, physical mobile-device, or assistive-technology signoff.

Generated evidence lives in ignored `output/`, `test-results/`, and
`playwright-report/`. See [acceptance evidence](docs/ACCEPTANCE.md) for the current
claims and missing release gates. That record identifies the native checks,
production build and browser runs across four engine/viewport configurations.
Real search, selected-offer pricing and provider handoff are checked separately.
The [audit-fix record](docs/AUDIT_FIXES.md) maps the eleven reviewed issues to their
corrections and verification.

## Application boundaries

- `shared/`: calendar-date and traveler validation, and destination-text normalization.
- `backend/destinations/` and `data/`: local GeoNames destination lookup and its
  attributable snapshot. The worldwide catalog stays on the server.
- `backend/domain/`: input validation, conservative normalization and pure matching.
- `backend/provider/`: public Priceline adapter, bounded scheduling, request sharing,
  fresh caches, durable control state, and a test-injection boundary.
- `backend/app.js`: JSON contracts, safe errors, security headers, static SPA and
  app-only health route. `backend/server.js` owns startup and shutdown.
- `frontend/src/traveler/`: React/Redux search, comparison, detail, and recovery UI.
- `deploy/`: optional single-VPS deployment preparation. Hostinger managed hosting
  is a separate deployment candidate; do not run VPS scripts against shared hosting.

The frontend uses React 19, declarative React Router 7, the existing Redux reducer
and thunk middleware, and a styled DayPicker calendar. Native buttons, selects and
a photo `<dialog>` replace Ant Design; Ant Design and Moment are removed. The
traveler workflow and date-only state remain; selected-offer recovery keeps
original pricing and hotel-inference status independent.

Destination autocomplete uses GET `/api/v1/destinations?q=…`, with city/country
search and stable geographic IDs. See [data provenance and refresh](docs/DATA_SOURCES.md).
The form supports rooms, adults, and each child’s age; stays are limited to 30
nights within the next 365 days. These are application limits. Provider-supported
aggregate occupancy and child-age handoff were checked through the real provider UI.
Provider quotes remain distinct from the final room choice and booking total.

The hotel API paths remain POST `/api/v1/hotelDeals` and POST `/api/v1/deal`. The former
encrypted `q` links are retired. Plain date-only URL context makes refresh and
back navigation reproducible. Full JSON contracts are in
[the implementation contract](docs/IMPLEMENTATION.md).

## Matching decisions

Neighborhood and stars establish the initial comparison. Rating, review-count,
and amenity evidence determines supported/partial candidates; missing evidence
remains unknown. The matcher does not invent rounding or masking semantics.
Contradictions require comparable known facts. Price orders candidates only
within a tier and cannot establish identity. Duplicate observations are merged
conservatively, without reconstructing stronger evidence from conflicting rows.

Raw legacy website fields do not establish masked numeric semantics. The public
adapter supplies minimum rating/review clues verified against the provider UI and
an original-offer handoff bound to the same trip. Normalization never invents a
booking URL. Hotel identity remains unverified until independently established.

Retrieved pagination completeness is not exhaustive provider coverage. Offline
fixtures test behavior; they do not measure live identification accuracy.

## Operating limits

One process coordinates all provider work: one active call, a one-second start
gap, at most four waiting requests, and at most three combined search pages of
500 rows each. Admission-to-response deadlines are 20 seconds for searches and
10 seconds for details. Provider and public JSON payloads are capped at 2 MiB.
Search/detail caches hold at most 25/100 entries with five-minute/one-minute
freshness and a 16 MiB serialized-payload budget each. Byte accounting is not a
process-memory bound. Autocomplete admits ten catalog scans per second with a
burst of ten; short, invalid and exact-country queries do not consume scan capacity.
Busy scans return `DESTINATIONS_BUSY` (503) with a one-second `Retry-After` hint.
These are application limits, not verified provider allowances or host capacity.
No automatic retry is used. Details validate the original selection separately
from hotel evidence. Expired complete totals are hidden and can be refreshed
without disabling a safe original-offer link. A failed price refresh preserves the
hotel content and saved results; missing retail inventory does not imply Express
unavailability. An unrecoverable original selection offers “Find current deals”.

Search results, hotel inferences and prices remain process-local. Separately,
`selection-records.json` beside the configured provider-state file stores at most
1,000 records and 256 KiB: an exact trip/offer hash, provider city ID or null, and
an absolute expiry no later than 30 minutes after issuance. Recovery can request
the original offer's current price and reconstruct its validated handoff after a
restart; it never restores a hotel inference or saved price. Reads and price
refreshes do not extend that validity. Expired records are pruned during operation
and startup; startup removes only this cache's orphaned temporary snapshots.
Persistence is best effort: loss falls back to normal selection recovery without
disabling the provider. Provider cooldown/block state remains separately durable
and must survive restart; a recovery record cannot bypass it.

Stop the application and review the cause of a block or interrupted upstream call
before resetting control state:

```sh
npm run provider:reset -- --after-review
```

Then restart the app. A process killed during an upstream call leaves a conservative
block for review. Never reset state to bypass provider restrictions. The runtime
image includes this command; use the [production reset procedure](deploy/README.md#reset-a-reviewed-provider-block)
to stop the app, reset its mounted state with the recorded image, and restart only
after success.

## Security and dependencies

The application renders upstream text as text, accepts only bounded structured
input, validates handoff/image hosts, does not expose a generic URL proxy, and
avoids credentials or trip payloads in routine logs. Search/detailed views must not
be treated as authoritative booking information.

Express stays on major 4; `qs` is overridden to its patched 6.16.0 release.
React Router 7.18.3 removes the two previously reviewed Router advisories from the
installed dependency path. Full and production-only audits recorded on 2026-09-09
UTC reported zero findings; see the [dependency disposition](docs/DEPENDENCY_REVIEW.md)
for exact pins, lockfile identity and limits. Navigation still uses fixed local
paths with encoded query values and allowlisted native provider links.
Do not use `npm audit fix --force` to introduce unreviewed compatibility changes.
ESLint 9 is retained for the React plugin's declared peer compatibility; its
upstream support warning remains a maintenance item.

## Release prerequisites

The remaining delivery gates are known-outcome matching evidence, manual
VoiceOver and real mobile checks, 3–5 first-time-user sessions, performance of the
selected design, host sizing, verified deployment/rollback/reboot, and the actual
public live journey. Nadav removed the earlier provider-permission implementation
gate after confirming there is no partner agreement. This does not establish
provider permission or an exception to the published terms; see
[live access and remaining risks](docs/LIVE_ACCESS.md). No provider messages,
bookings, hosting purchases, domain registrations, or external deployments have
been performed.

## Development checkpoints

Commit coherent, tested milestones and use a separate skeptical reviewer before
substantial checkpoints. The first review fixed cross-page revival of conflicting
offer clues and invalidated browser-held candidate evidence after server rejection.
See `AGENTS.md` for the ongoing working agreement.
