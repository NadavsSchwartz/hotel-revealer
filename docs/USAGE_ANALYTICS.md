# Usage analytics implementation contract

Goal: explain observed browser visits, sessions, search outcomes, detail outcomes,
and original-offer clicks in the existing daily reports, while separating internal
test and suspected automation traffic. Browser identifiers are estimates, not people.

Scope: first-party browser instrumentation, a bounded ingestion endpoint, retained
usage files on the existing persistent VPS mount, daily reporting and factual
privacy copy. No dependencies, external analytics provider, fingerprinting, raw IP
logging, raw user-agent logging, full URLs, search text, travel dates, children’s
ages, hotel identities, replay, geolocation or booking-conversion claims.

Contract: `shared/usage.ts`; POST JSON to `/api/v1/usage`. Server assigns timestamps
and validates all fields. Random browser IDs expire after 30 days. Tab sessions
expire after 30 minutes without a measured action. Storage blocked, DNT or GPC
means no usage tracking. Automation detection is heuristic, not proof of humanity.

Records: UTC `usage-YYYY-MM-DD.jsonl` under `USAGE_DATA_DIR` (default `usage/`
beside provider state). Keep at most 30 UTC days, 5 MiB per day, bounded pending
writes and request rates. Only usage files are pruned. Persisted records survive
container replacement. Reports explicitly distinguish unavailable or incomplete
collection from zero usage. Operational Docker-log statistics retain their own
coverage limits. Aggregate reports contain no raw browser/session identifiers.

Acceptance: page views are not assets or health checks; search/details success and
failure reflect validated client outcomes; intentional aborts do not become errors;
handoff means a click, not a booking. Referrers are categories only. Reporting
deduplicates event IDs and separates browser/internal/automated activity. Report
definitions disclose tab-session and multi-device limits, blockers and partial days.

Validation: Node 24.20.0 `HOTEL_PROVIDER=disabled npm run check`, focused endpoint,
retention and report tests, production-build browser journeys on desktop/mobile
and supported browser engines, then a separate skeptical review. No provider
requests during tests. Deployment is a separate release step; repository rules
require a request before pushing. Source, local browser, and hosted evidence stay
distinct. Preserve unrelated checkouts and untracked sketches.

Working branch: `feat/usage-analytics`, isolated from deployed revision `eac4423`.
Implementation complete locally on September 12, 2026. Not yet pushed or deployed.

## Delivered behavior

- Browser/session identity, categorized referrals and screen sizes, page views,
  validated search/detail outcomes, and original-offer clicks.
- DNT/GPC and unavailable storage suppress events.
- DNT/GPC and unavailable storage suppress events. Internal-test and suspected
  automated traffic remain separate from ordinary browser totals.
- Bounded first-party ingestion and a persistent daily stream, independent of
  replaced Docker logs. Collector gaps, malformed input, limits and missing files
  remain explicit. Search counts accept the existing 5,000-match domain bound.
- Aggregate daily reports show approximate browsers, observed tab sessions,
  engagement, page/action reach, outcomes and device/source breakdowns. They do
  not assert an ordered conversion funnel, exact people, or bookings.

## Verification evidence

- Node 24.20.0 / npm 11.19.0. Full `npm run check` passed before the scope cleanup;
  the cleanup's type and application test gates passed with **309 tests**.
- **26 Python report tests** passed, including persistent data independent of
  container creation time, bounded malformed input,
  duplicate IDs, missing/partial evidence, and result-count boundaries.
- Focused usage browser rerun: **36/36 passed** across Chromium, Pixel 7
  emulation, Firefox, and WebKit after removing the product-facing controls.
  Provider responses were synthetic or disabled; no provider requests were made.
- Separate skeptical review found no remaining consequential findings. Whitespace checks
  and smoke-script shell parsing passed.

## Remaining release work

The production VPS still runs the pre-analytics image at `eac4423`. No production
usage records have been added by this task. Git push needs an explicit request
under this repository's working agreement. After authorization, publish the
reviewed branch, run CI (including the offline Docker smoke/persistence checks),
deploy the exact tested image, and install the updated `daily-report.py` without
overwriting the host-specific Caddyfile. Verify an internal browser visit and a
partial report on the actual host. Docker is unavailable on this Mac; new image
runtime checks, CI and hosted verification remain outstanding. Existing physical
device and assistive-technology release evidence remains separate.

Browser APIs were checked against MDN during implementation:
[localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage),
[sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage),
[fetch keepalive](https://developer.mozilla.org/en-US/docs/Web/API/Request/keepalive),
and [GPC](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/globalPrivacyControl).
Persistence can be blocked, tab storage can be copied from an opener, and browser
privacy-signal support varies. The implementation handles unavailable APIs and
does not treat these identifiers as exact people or exact independent tabs.
