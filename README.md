# Hotel Revealer

A small traveler application for comparing an unnamed Express offer with possible
named hotels. It keeps the original offer, candidate evidence, and retail hotel
information separate. A candidate is never presented as a verified identity.

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

For the actual production build:

```sh
npm run build
NODE_ENV=production npm start
```

Open `http://127.0.0.1:5000`. `/health` checks the application without querying a
hotel provider. HTTP 200 from this endpoint proves the app is responding, not that
live search is configured. Copy `.env.example` if configuration is needed.

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
claims and missing release gates. The current integration passed lint, 169 native
tests and the production build. All 200 browser cases are covered and passing
across four engine/viewport configurations; the evidence records the exact runs.
Real search, selected-offer pricing and provider handoff are checked separately.

## Application boundaries

- `shared/`: shared calendar-date and traveler validation; original city labels
  retained for legacy links.
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
freshness. These are application limits, not verified provider allowances.
No automatic retry is used. Details revalidate the offer/candidate relationship.
An expired retail quote is hidden and can be refreshed without disabling a still
fresh original offer; missing retail inventory does not imply Express unavailability.

Only provider cooldown/block control state is persisted in `var/`. Search results
remain process-local and are lost on restart. The block must survive restart.
Stop the application and review the cause of a block or interrupted upstream call
before resetting control state:

```sh
npm run provider:reset -- --after-review
```

Then restart the app. A process killed during an upstream call leaves a conservative
block for review. Never reset state to bypass provider restrictions.

## Security and remaining dependency advisories

The application renders upstream text as text, accepts only bounded structured
input, validates handoff/image hosts, does not expose a generic URL proxy, and
avoids credentials or trip payloads in routine logs. Search/detailed views must not
be treated as authoritative booking information.

Express stays on major 4; `qs` is overridden to its patched 6.16.0 release.
Ant Design 4 keeps its existing components. Its transitive `rc-select` is pinned
to 14.4.3 for correct nonvirtual option semantics while retaining Ant Design 4's
icon props and normal Tab navigation. Child popups explicitly control open state.
Moment was already present through Ant Design; it is pinned directly because the
date controls import it. Neither change introduces a new UI framework.
The retained React Router 6 line has two advisory entries: the SSR deserialization
path is not used by this client-only SPA; internal navigation uses fixed local
paths with encoded query values, and provider navigation uses allowlisted native
links. Targeted link tests and a source review are required before claiming these
paths are unreachable. Do not run `npm audit fix --force` and silently change the
React/router major versions. ESLint 9 is retained for the React plugin's declared
peer compatibility; it emits an upstream support warning and should be reviewed
when the plugin supports the next major.

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
