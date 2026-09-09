# Acceptance evidence

Updated **2026-09-09 UTC**. This records observed evidence, not a blanket readiness
claim. The current modernization results below supersede the earlier 278-native /
420-browser summary. Historical sections retain the results and limitations of
their original revisions; they are not repeated verification of the current tree.

## Modernization — 2026-09-09

The migration starts at `6bf14b2`; dependency checkpoints culminated at `2cf7f32`.
The verified TypeScript code and runtime integration are committed as **`6c3a9ad`**.
Application modules and Node/Playwright test suites are typed;
shared contracts preserve editable versus validated trips, provider and public
responses, and request-dependent identity checks. Runtime validation remains in
place because TypeScript erases. Existing matching, request sharing, cancellation,
recovery keys, pricing separation, and the single-process architecture remain.

| Gate | Current result | Evidence and limit |
| --- | --- | --- |
| Type coverage | Passed | 94 application/test/support source files covered, none uncovered; invalid-assignment and implicit-`any` probes rejected without writing probe files |
| Static checks and native tests | Passed again after clean install | Strict server/frontend/test configurations, typed lint, and 291/291 native tests; no skips or failures |
| Production browser build | Passed and reproduced | Clean `npm ci` followed by checks/build reproduces all 46 files byte-for-byte against the 436-browser-tested build; backend uses native Node 24 type stripping |
| Browser journeys | Passed: 436/436 in 3.3 minutes | 109 scenarios across Chromium, mobile Chromium, Firefox, and WebKit; TypeScript specs run against the production build with synthetic API fixtures |
| Presentation and rendered UI | Checked locally | README/Mermaid and source links checked; final 1440×1100 desktop and 390×844 mobile captures inspected without console errors or horizontal overflow; no live deployment link added |
| Dependency audits | Passed: zero known findings | Full and production-only final reports match the lock identity in [DEPENDENCY_REVIEW.md](DEPENDENCY_REVIEW.md); this is an advisory check, not a blanket security claim |
| Development runtime | Passed | Root `npm run dev` starts the native TypeScript backend and serves TSX through Vite; health and proxy checks pass with provider disabled |
| Production-only runtime snapshot | Passed locally | Filtered snapshot excludes tests and a clean production-only install excludes compiler, lint, and Vite; native TypeScript startup, health, HTML/Brotli, API 404, catalog lookup, reviewed synthetic stopped-state reset, restart, and graceful stop pass |
| Container and deployment | Image execution incomplete | Dockerfile/filtering static review and shell validation pass, including 12 simulated release scenarios; Docker is unavailable, so image execution, non-root/read-only behavior, container persistence, and resource limits remain unverified |
| Performance | Compared locally; costs recorded below | All capacity assertions passed; catalog import and retained heap increased, while RSS and peak health latency varied between runs. No speedup or fixed RSS-delta claim |
| Live provider / accuracy | No new proof | Earlier local flows are recorded below; known hotel outcomes, future provider compatibility, and permission remain unresolved |
| Accessibility and devices | Partial | Automated browser checks passed; physical mobile, actual Edge/Safari, VoiceOver, and full manual accessibility signoff remain separate |
| Human usability / hosted release | Open | First-time-user sessions, actual public journey, hosting/TLS, rollback/reboot, and hardware/volume-loss durability remain unverified |

Local evidence lives in ignored `output/verification/modernization/`:

- `type-coverage.json` records configuration coverage and rejected type-error probes.
- `typescript-check.log` records strict typechecking, lint, 291 native tests, and the build.
- `clean-install.log` and `clean-install-check.log` record successful `npm ci` and
  repeated checks; `clean-install-build.json` confirms 46 byte-identical build files.
- `typescript-browser.log` records the complete 436-execution TypeScript browser run.
- `final-audit-all.json` and `final-audit-production.json` record zero known findings
  for the final TypeScript dependency graph.
- `runtime-smoke.json` records the production-only local snapshot checks and
  explicitly records `imageExecuted: false`; `runtime-install.log` records installation.
- `dev-smoke.json` records native backend, TSX entry, and Vite proxy checks.
- `performance-comparison.json` and `startup-comparison.json` retain all reported
  capacity runs, asset totals, and paired catalog-import samples.
- `final-desktop.jpg` and `final-mobile.jpg` retain the inspected rendered captures.
- `dependencies-browser.log` records the earlier passing 436-execution JavaScript
  dependency checkpoint; it is distinct from the later TypeScript result.

Focused regression coverage includes malformed destination entries and retry,
Express startup port conflicts without false success logs, body-size errors,
compression/HEAD/static routes, environment precedence and quiet loading, and
response shape/identity validation. Browser scenarios retain independent fixture
oracles, including deliberate malformed-wire and nullable-display fallback cases.
No hosted, live-provider, real provider-state reset, or manual device proof is
implied by these local checks. See [modernization status](MODERNIZATION.md) for
checkpoint progress and [live integration evidence](LIVE_ACCESS.md) for earlier
provider observations and their limits.

### Modernization performance comparison

Node 24.20.0 was used throughout. The capacity harness compares the starting
revision with an initial TypeScript working tree and a rerun of committed
`6c3a9ad` with no dirty source paths. All capacity assertions passed.

| Capacity observation | Baseline `6bf14b2` | Initial TypeScript tree | Committed `6c3a9ad` |
| --- | ---: | ---: | ---: |
| Peak RSS | 332.63 MiB | 352.72 MiB | 319.42 MiB |
| Peak sampled heap | 149.92 MiB | 176.84 MiB | 176.55 MiB |
| Maximum sampled health latency | 80.07 ms | 59.68 ms | 262.23 ms |

Both after-runs had higher sampled peak heap. RSS and maximum health latency
varied; these runs do not establish a fixed RSS improvement/regression or a
speedup. They are synthetic local measurements, not Linux cgroup or hosted proof.

Five alternating fresh-process catalog imports compared the final JavaScript
checkpoint `2cf7f32` with `6c3a9ad`, using a warm filesystem and excluding Node
bootstrap. Median import time increased from **1,292.57 to 1,642.06 ms** (+349.49 ms);
post-GC heap increased from **76.04 to 80.05 MiB** (+4.01 MiB). The after version
combines native type stripping and catalog validation; this does not isolate
those costs or measure full application/hosted startup.

| All generated JS/CSS assets | Baseline `6bf14b2` | `6c3a9ad` |
| --- | ---: | ---: |
| Uncompressed | 559,543 B | 565,432 B |
| Brotli | 148,602 B | 150,029 B |
| gzip | 158,775 B | 160,227 B |

These totals include every generated JS/CSS asset, including lazy chunks; they
are not cold-page transfer measurements. The earlier performance improvements
below belong to earlier revisions.

## Historical remediation and selected-offer recovery

Lifecycle core `51a3ab8` and recovery `d71e2b6` separate an original offer from the inferred hotel and
its quote. Partial discovery, missing facts, absent membership and transport
failures do not disprove earlier matching evidence. Complete contradictory
same-offer evidence can hide a selected hotel without discarding a separately
valid original quote or handoff. Refresh failures preserve previous same-hotel
content and quote expiry; detail outcomes do not delete the saved shortlist.
An unrecoverable exact offer returns `SELECTION_UNAVAILABLE` with “Find current
deals”, rather than a repeating detail retry. Optional `refreshError` is strictly
validated as one allowed code and requires `quoteStatus:'unavailable'`.

The current selection store additionally permits restart recovery from only
`{hash,cityId,expiresAt}` records, capped at 1,000 records/256 KiB with 30-minute
absolute validity. The hash binds the exact trip and offer; city ID may be null.
No raw trip, opaque offer ID, hotel inference, price or link is stored. Recovery
can refresh only the original offer and reconstruct its validated handoff; it
cannot revive the selected hotel. Active/startup pruning and narrow crash-temp
cleanup bound usable recovery data. Best-effort snapshot failures do not disable
the provider or bypass its separately durable block. Pending shared work and
snapshot I/O keep admission held after an HTTP deadline or disconnect until that
work actually settles. See [the implementation contract](IMPLEMENTATION.md) for
the limits, response shapes and stopped-process retention caveat.

The native controls, styled DayPicker and photo `<dialog>` replace Ant Design and
Moment. The previous rc-virtual-list Axe exception is retired. Missing production
HTML reports 500, hotel responses reuse bounded serialization, destination
postings preserve the existing ranking, and refreshed browser searches retain
their recent position. Exact dependency pins and the saved full/production audits
are in [DEPENDENCY_REVIEW.md](DEPENDENCY_REVIEW.md). Integrated verification passed with **278 native tests**, lint, production build
and **420 browser cases** (105 scenarios across four projects), without retries or
skips. The first browser run passed 415/420: four obsolete retry-button expectations
and one editor-autofocus setup race were corrected. The focused nine cases and
then the complete matrix passed. The restart case uses normal HTTP routes, a real
service and temporary files with a synthetic provider; rotating discovery after
restart does not trigger discovery or restore a hotel claim.

Two skeptical reviewers checked correctness and complexity at each migration gate.
Consequential findings were fixed and re-reviewed, including malformed identity
responses, incomplete matching evidence, actual-work admission lifetime and crash-left
recovery snapshots. No new live provider, Docker, hosted or manual assistive-technology
proof is implied. Logs and screenshots are retained locally under
`output/verification/remediation-20260909/` (ignored).

### Matched local measurements

Before is `60f0cf7`; final application behavior is `d71e2b6`, with browser setup
corrections in `0ba5709` and the measured recovery-aware harness in `ca25b22`.
Node 24.20.0/npm 11.19.0 were used explicitly throughout.

| Measurement | Before | After | Scope |
| --- | ---: | ---: | --- |
| Cold-page JavaScript body transfer | 220,002 B | 127,875 B | **41.9% lower**; built entry served with Brotli, calendar loaded initially |
| Cold-page CSS body transfer | 29,300 B | 12,454 B | **57.5% lower** |
| Mobile lab LCP, three runs | 2,548 / 2,216 / 2,232 ms | 1,852 / 1,660 / 1,660 ms | Cold Chromium 390×844, 4× CPU slowdown, 150 ms latency, 1.6 Mbps |
| Warm `san` lookup median | 17.30 ms | 6.64 ms | **2.6× faster**; 2,586 temporary differential checks preserved exact results/order |
| Catalog import median | 307.1 ms | 512.3 ms | Five alternating fresh Node processes per revision, warm filesystem; +205.2 ms |
| Catalog retained heap after GC | 59.70 MiB | 72.59 MiB | +12.89 MiB; separate from process RSS |
| Full capacity-profile peak RSS | 333.08 MiB | 354.02 MiB | Same synthetic full cache/queue scenario; +20.94 MiB |

The already-narrow `Paris France` lookup changed from 0.56 to 0.63 ms; the index
is not a universal speedup. Matching/ranking policy is unchanged. Capacity passed
its existing overload, queue, coalescing, cache and health assertions. The final
run includes recovery hashes in memory but excludes recovery disk I/O, provider
network/response parsing, TLS and Linux cgroup behavior. It leaves 157.98 MiB to
the proposed 512 MiB budget locally; this does not validate container capacity.
Full before/after reports are under `capacity-2026-09-09T04-15-30-937Z` in the
isolated baseline worktree and `capacity-2026-09-09T04-38-24-094Z` in local output.

Final calendar/month/traveler interactions reported maximum Event Timing event
durations of 120 / 88 / 80 ms across the three throttled runs (16 ms reporting
threshold). This is a small lab sample, not field INP or a before/after interaction
comparison. Final light/dark home, destination, calendar, result and detail
captures cover 320, 390 and 1440 px; representative renders were inspected, with
no browser page errors. Keyboard, reduced-motion, date boundaries, DST, child
ages and photo recovery are covered by the passing browser matrix.

CI now configures a network-disabled image smoke/reset run under 512 MiB, 0.8 CPU
and 100 PIDs and checks the runtime configuration. Docker is unavailable locally,
so image execution/reset persistence and resource bounds still need CI evidence;
the smoke itself does not constitute loaded-container capacity proof. Twelve
simulated release scenarios verify bootstrap isolation, unchanged existing Caddy,
rollback behavior and fail-closed release-record mismatch handling. No push,
deployment, real provider-state reset or live provider request was part of this work.

## Hotel photos, location and review links

Verified UI revision `45fafcf56bb80b6c481d4a4b19908675a1c0ed11`, source tree
`67c92c144a565903cb5a36deb3ae06c8bb849d32`. Details now offers a photo viewer,
Google Maps link, named-hotel reviews link and six prioritized amenities with an
expandable full list. Existing data and the installed Ant Design modal are reused;
no dependencies, review API, maps SDK or added hotel-provider requests were added.
Repeated and empty property sections are removed. Source amenity qualifiers,
original-offer pricing/handoff and rejected-identity protections remain intact.

`npm run check` passed with 227 native tests, lint and a production build. Final
28 affected browser cases passed across Chromium, mobile Chromium, Firefox and
WebKit. Checks ran on an isolated snapshot to exclude concurrent backend/deployment
work. The initial full matrix passed 370 cases and exposed two gallery focus
failures; those were fixed and retested in the affected matrix, not claimed as a
new full-suite pass. Review also caught and verified empty-photo refresh resetting
viewer state. Boundary controls retain focus via `aria-disabled` while movement
stays a no-op; keyboard arrows, Escape, pointer opening and trigger restoration
are tested. The existing date helper now uses an already-open checkout calendar.

Images beyond the first four are requested only during browsing. Tests exercise
failed images, smaller/empty/restored photo responses, rejected matches, preserved
booking links and exact map query encoding. Mobile light/dark screenshots and
modal Axe checks were reviewed. Priceline's public `/relax/at/48700` page was
verified to expose reviews without dates; the link opens the named hotel page,
since its reviews modal has no verified permalink. Reviews are not embedded.
Evidence is under `output/verification/detail-content/`. Manual assistive-technology,
physical-device, live identity and public-release gates remain separate.

## Offer expiry and repeated-alert repair

Verified September 8, 2026. Logs for the supplied screenshots showed whole-city
retrieval inside a 10-second detail request, followed by exact-ID rejection.
Search-price expiry was also discarding previously issued offer matching evidence.
The server now retains that exact context/offer evidence in bounded memory for up
to 30 minutes, independently of five-minute listing and one-minute total freshness.
Known offers refresh directly; no replacement ID is guessed and newer same-ID
candidate contradictions still revoke the earlier binding, including queued requests.

Rejected selections now have one fresh-search recovery action, with no price
button that repeats the rejected request. Transient refresh errors on a known
offer stay beside the price while the hotel content remains visible.

Actual Brave check: a GBP offer for H by H Hospitality stayed open beyond the
original search's five-minute lifetime. Refresh request
`f1a0ac8a-b069-46d6-b204-4cd6fd95d69a` returned HTTP 200 in 723ms, with one upstream
call and zero city-page fetches. The page retained the property and showed a new
GBP 105.49 total without a mismatch or timeout alert. This validates that one
provider snapshot; price availability and hotel identity are not guaranteed.

`npm run check` passed (227 native tests, lint, production build). All 152 focused
expiry/recovery, traveler-journey, currency and theme browser cases passed across
Chromium, mobile Chromium, Firefox and WebKit. Logs are in
`output/verification/offer-refresh/` and the live development request log under
`output/verification/currency-hardening/`. The scoped independent review found
and verified the queued quote-only matching-evidence correction. No deployment
or booking was performed. Server restart/eviction or the retention limit can still
require a fresh search; this does not suppress genuine provider failures.

## Currency runtime and offer-selection repair

Verified September 8, 2026 in the user's existing Brave tab at `127.0.0.1:5173`.
The frontend reached an older, non-watched backend on port 5001, which still
returned `UNSUPPORTED_CONTEXT: Prices are available in USD only.` The previous
currency checks did not establish this running frontend/backend integration.
The stale processes were replaced with `PORT=5001 npm run dev`, preserving the
provider's durable state. The existing backend watcher now tracks source imports;
the frontend proxy uses the same loaded `PORT` as the backend.

A second live failure occurred when changing currency on a hotel-details page:
the new city search exceeded the 10-second detail deadline, and a cached retry
then rejected the old offer ID. The EUR and GBP snapshots had different opaque
offer IDs for the same named hotel. Currency changes from details now return to
normal results search, preserving trip and rating sort while removing the old
selection. Timeouts, matching rules and selection validation remain unchanged.

The original Los Angeles September 8–9 search returned live EUR and GBP results.
Garvey Inn's EUR details showed a quoted total of 57.97; a newly selected GBP
offer for H by H Hospitality showed a quoted total of 105.49, property details,
and a GBP provider link. These are independent point-in-time quotes, not an
exchange-rate comparison or a claim of verified hotel identity/checkout parity.

`npm run check` passed (221 native tests, lint, production build). All 64 focused
currency/theme/navigation browser cases passed across the four configured
engines/viewports. The currency test now uses different offer IDs per currency,
rejects old IDs, and verifies fresh selection and preserved sort/history.
Independent source review found no remaining blocking issue in this scoped fix.
Logs are in `output/verification/currency-hardening/`. No booking or deployment
was performed; the existing release gates remain open.

## Large-city matcher regression repair

Verified 2026-09-08 at 16:09–16:10 Pacific, against base `4b33340` plus the
raw neighborhood/star index repair. The tested matcher SHA-256 is
`f09c388c73f66c0b3a21c10572c6a5c4d942bc40e177978bf510d96d577baafb`.
The later `429fa50` rewrite had restored the Cartesian-product rejection and
reduced the large-city fixture below its threshold. Regression fixtures now
explicitly exceed 100,000 theoretical pairs while testing actual bounded work,
both unique and ambiguous results, raw ordered parity, two pages and cache reuse.

- Node 24.20.0: `npm run check` passed (lint, 216 tests, production build).
- Twenty focused production browser cases passed across Chromium, mobile
  Chromium, Firefox and WebKit. Independent scoped review found no defects.
- Offline saved-provider replay preserved all 60 ordered matching pairs while
  reducing comparisons from 27,270 to 394; this is parity, not identity proof.
- The existing production backend on port 5001 was restarted with the same
  provider mode and durable state. The exact Los Angeles September 8–9 trip
  returned HTTP 200: 153 API offers, 782 named hotels across two pages, 111 matched
  deals, 40 no-match offers and two offers with missing facts. The browser showed
  “111 hotel deals” and 12 cards on the first page; unresolved offers stayed hidden.
- Fresh retrieval and cached reload succeeded; cache-hit logs recorded zero
  upstream calls. Desktop/mobile screenshots had no horizontal overflow. Garvey
  Inn details and quote were available, its original-offer link preserved dates,
  one room, two adults and USD, and return-to-results passed with no page errors.

Artifacts: `output/verification/large-city-regression/` contains check/browser
logs, offline replay, live response and summary, source hash, and desktop/mobile
screenshots. Concurrent frontend style edits are outside this matcher repair.
No booking or hosted verification was performed; the release gates above remain.

## Matched results and control cleanup

Verified code: `a63bd9c86cd1394f4a393504d7f331dfb94842e8` (results implementation
`f2943dd`, followed by the mobile first-screen correction). This user-directed
follow-up supersedes the earlier decision to display unresolved offers.

- Results include only matched deals, filtered before counts, sorting and paging.
  Empty and incomplete searches explain why no hotel matches are shown. Internal
  unresolved observations and existing offer-only URLs retain their recovery and
  diagnostic behavior; filtering does not reduce upstream matching work.
- Sorting is “Lowest room rate” or “Highest guest rating”. Hotel/prices is the
  primary card action; Priceline is a secondary external link. Internal arrows,
  traveler controls and sort indicators use aligned icons. Padded controls and
  an outward focus ring replace the clipping inset border.
- The five-minute search-cache timer no longer hides listing rates or raises a
  page-wide alert. Historical rates say “Last seen room rate”, with one dated
  “Prices checked” line and an update action. Complete detail quotes still expire
  after one minute. The technical “About these results” block, repeated one-night
  amount, noninteractive amenity arrows and empty retail-price section are removed.

`HOTEL_PROVIDER=disabled npm run check` passed (lint, 213 native tests, production
build); all 316 browser cases then passed without retries or skips. The final
commit has the identical Git source tree to the tested snapshot (`0811a63`), as
recorded in `output/verification/results-simplification/source-verification.json`.
Initial browser checks caught a redundant click on an already-open checkout
calendar and the mobile price/unit falling below the first screen. The helper now
uses the open calendar; shorter repeated copy and 16px card gaps restore both the
hotel and full nightly price/unit within 390×844. Assertions were retained.

Separate skeptical source and visual reviews approved the changes. Rendered
checks cover 320, 390, 768, 1280 and 1440px with no horizontal overflow; focused
text has 10–16px of inset. Latest screenshots/measurements are under
`output/playwright/results-controls/`; test logs and retained failure evidence are
under `output/verification/results-simplification/`. Browser inventory was mocked;
no hotel-provider requests, dependency changes or deployment were made in this
follow-up. The local server was restarted and its current HTML/assets checked.
Existing public-release and manual device/accessibility gates remain open.

## Single-hotel resolution and on-demand totals

Verified code: `2e53c010bb09d87d75b012b8de57628df803e14a`. This local milestone
preserves the original raw matching rules and returns one candidate or explicit
`resolution` (`no_match`, `ambiguous`, `missing_facts`, `incomplete_search`).
Multi-candidate expansion, comparison batches and ranking are retired. `/deal`
accepts an optional strictly validated hotel ID; offer-only responses have null
candidate/details, `detailStatus:not_requested`, and explicit `quoteStatus`.
Both views retain the safe original-offer handoff when local prices expire.
Unavailable totals retry upstream; successful quotes retain caching/coalescing.

- **Local gates:** `HOTEL_PROVIDER=disabled npm run check` passed (lint, 213 native
  tests, production build), then all 316 browser cases passed without retries or
  skips. Verification used an isolated archive of the committed source and the
  existing Node 24.20.0/npm 11.19.0 workspace dependencies. Concurrent homepage
  design/assets were preserved and excluded. Initial browser run: 315/316; one
  WebKit child-age focus failure did not reproduce in 14 targeted runs or the
  final full matrix. Its cause remains unverified; no assertion was weakened.
- **Independent reviews:** fixed a stale offer-only hotel hint after newer search
  results, a nameless duplicate hiding conflicting hotel facts, and an ineffective
  unavailable-total retry. Final reviews found no consequential open code issue.
  Redux singleton state and search snapshot identity remain intact.
- **Matching/capacity:** saved-data replay retained exactly 60 original ordered
  pairs, with no provider request. Final stub capacity run at `2e53c01` had no dirty
  measured source: 321.16 MiB peak RSS, 91.49 ms maximum health latency; fresh and
  cached named/offer-only requests, concurrent searches, and both raw-work limits
  passed. The accepted fixture used 4,000 comparisons and a 21,779-byte search
  response. This is a macOS sample, not worst-case memory or hosted sizing proof.
- **Bounded live check:** two invented Las Vegas trips, September 21–24: one
  room/two adults, then two rooms/four adults/child age 7. Searches returned 100
  offers (65 matched) and 70 offers (33 matched); live matching exercised the added
  strike-price/icon fields. Both named and offer-only paths returned complete
  quotes for both trips, with correct null fields on offer-only responses.
  The family original-offer URL opened with the correct dates/occupants. Its
  $79 × 3 nights × 2 rooms base agreed at $474, but Priceline displayed $760.32
  total versus the API quote's $781.98. The difference is unexplained. No booking,
  purchase, provider reset, deployment or push occurred.

Evidence: `output/verification/single-hotel-local/` (final and initial logs, unique
live response captures and supplier observation),
`output/verification/capacity-2026-09-08T22-01-46-946Z/capacity.json`, and
`output/original-matching/production-resolution-20260908.json`.

The current exact-cent, currency, fee-inclusion and rate/breakdown corroboration
gates remain; plausible totals may still be withheld. Resolution counts are
diagnostic only, with no match-rate anomaly detection. Public HTTPS, old-tab
recovery after deployment, rollback/reboot, notification delivery, physical devices,
manual accessibility and first-time-user sessions remain open release gates.
Neither these checks nor a unique match establish measured identity accuracy or
website/checkout price parity.

## Compact result-card pricing

Result cards group the quoted amount, baseline-aligned unit, bound trip nights and
rooms, supplied stay price, and actions in one column. Unusually large amounts can
wrap without clipping. A single 12px bottom note combines the fee qualification
and Priceline terms, including stale, missing-price and missing-link states.
Fee-inclusive totals keep their total basis; detail-page wording is preserved.
No stay price is calculated from the nightly rate.

Isolated `d65b85d` plus this patch passed lint, 221 native tests and a production
build. The 40-case focused browser run passed 39 cases; its WebKit appearance test
sampled an unstyled background. Waiting for font readiness retained the same
assertions and passed two targeted reruns. Pricing, multiroom, fee, currency,
stale, dark-mode and narrow-layout checks passed. Independent review approved
the final production captures in `output/verification/price-card/`.

## Shared application design

The accepted homepage palette, Manrope typography, page gutters, rounded controls,
and light card surfaces now also govern results, offer details, policies, loading
and recovery. The homepage retains its photographic header treatment; legal prose
retains its readable column width. Duplicate homepage shell rules were removed.
Verification used isolated `986e3ee` plus this styling patch: `npm run check` passed
with 216 native tests, then all 316 existing browser cases passed. A final tablet
editor adjustment passed 12 targeted reruns. Existing tests now check shared page
backgrounds and complete date text at 832px and 320px. Desktop/tablet/mobile
production renders confirmed the first mobile hotel and room rate remain visible.
Independent review approved the resolved button, gutter and date-layout findings.
Evidence is in `output/verification/app-design/`; pictured hotels are test fixtures.
This evidence excludes concurrent currency/theme features. No runtime logic or
dependencies were added by the styling pass.

## Homepage copy and navigation cleanup

The final landing composition uses a warm ivory canvas, a photographic hero with
an inset working search, a sourced hotel-details preview, and a compact process
and closing action. The STRAT preview contains saved property information only;
it has no price, score, property photograph or confirmed-identity claim. Its small
source record is in `sketches/room/assets/property-preview-source.json`.

Verification used isolated `8e3d69d` plus only the landing changes/assets, because
concurrent work was rebuilding the shared production directory. Lint, 213 native
tests and the production build passed, followed by 52 affected browser cases
across all four projects. Independent review checked full-page composition,
contrast and open controls. Reported contrast issues were fixed; the calendar now
uses the existing viewport-alignment option. Existing layout coverage checks both
headline visibility and a fully visible calendar in normal/reduced motion.

Production renders cover 2560, 1440, 1280, 768, 390 and 320px, with no horizontal
overflow. The default action remains visible at 1280x720, 390x844 and 320x800.
The homepage portion of the existing three-cold-run mobile protocol measured LCP
2.300/2.284/2.268s and CLS 0 after adding the font preload and asynchronous image
decoding. The initial 2.956/2.104/2.144s sample is retained; the retired comparison
benchmark was excluded. These are local homepage measurements, not field p75.
Evidence: `output/verification/landing-final/`, including production captures and
both `performance/` and `performance-final/`. No dependency, store or new test
suite was added. Unrelated concurrent results work is outside this UI evidence.

Earlier homepage checkpoints follow.

The current entrance joins a full-width search form to a bounded panorama, with
responsive rows below 1100px. The requested form note, example caption and footer
independence line are removed. The reveal graphic now uses conceptual copy instead
of fictional hotel facts. An additional section explains location and atmosphere,
using the existing pool photo with its attribution retained on Credits.
`npm run check` passed with 210 native tests, and 36 affected browser cases passed
across the four projects. Six viewport renders had no horizontal overflow; filled
dates fit at 1280px, 1101px and 768px. Production and development were inspected.
Independent review verified settled popups and corrected the guest-ratings wording.
The existing three-run mobile lab measured LCP 1.992/1.924/1.920s and CLS 0.000655
for `7d58873-plus-home-composition`, with no page errors. Evidence is under
`output/verification/home-composition/`. No dependencies, components, state or
test suites were added. These results establish local UI behavior, not hotel identity.

Earlier cleanup checkpoints:

The homepage now leads with “Find the hotel behind the deal.” in one type style.
Repeated navigation, section search links, inline credits and the second decorative
photo were removed; credits and legal links remain in the footer. Existing section
anchors and search behavior are retained. An independent skeptical review inspected
the code and desktop/mobile renders without blocking findings. `npm run check`
passed with 207 native tests. The affected journey, navigation, accessibility and
mobile-layout files passed all 140 browser cases across the four existing projects.
Development renders at 1440, 1280, 390 and 320px had no horizontal overflow;
the production wide-screen render and short-desktop action check also passed.
Screenshots are in `output/verification/home-clarity/` and the browser test output.
This pass adds no components, dependencies or test suites. Prior performance
measurements below were not rerun for this copy and navigation cleanup.

The follow-up value section replaces the comparison table with a compact,
explicitly fictional unnamed-offer → identified-hotel example. Process and FAQ
copy are combined into three steps, including unresolved outcomes and the final
Priceline booking checks. Retired question anchors focus the merged heading.
`npm run check` passed again (207 native tests), followed by 20 targeted browser
cases covering navigation, accessibility and reflow across all four projects.
These checks preceded concurrent matcher/results edits and do not certify that work.
Section renders at 1440, 768, 390 and 320px showed no overflow; development and
production geometry matched at 1440 and 390px. Screenshots are in
`output/verification/home-value/`. No new components, dependencies, assets or
test suites were added; performance was not remeasured for these lower sections.

## Rebuilt search hero and loading experience

`1960fab` replaces the fixed-width floating reception with a centered 1360px
content grid, large solid-surface headline, ivory form and separate photograph.
The working panel measured 693px wide at 2560px. Its action was fully visible at
1280x720; at 768px it ended at y=600, ahead of the photo at y=698. The shared
filled H/doorway mark replaces the outlined emblem in header, footer and favicon.
The old decorative FAQ emblem was removed in final cleanup.

`7c488c0` replaces the timed word wipe/dots with a stateless branded search state,
a compact refresh variant and a consistent lazy-route fallback. Trip context and
editing remain available. Actual request state controls dismissal; cached results
remain visible during refresh. The light sweep uses CSS transform/opacity only;
reduced motion retains a static visible mark. No backend/API changes, dependencies,
new stores or minimum loading duration were introduced.

Independent reviews inspected all six planned viewport sizes, the mark at
16/24/40px, animation frames, reduced motion, fast completion, refresh failure and
request deadline. Development and production geometry/typography/color checks
matched at 1280x720 and 390x844, with no hero contrast violations or page overflow.
One wide/short-screen regression was added; existing readability and loading tests
were extended rather than duplicated.

Final verification used a detached `7c488c0` checkout plus only the FAQ-emblem
cleanup: lint, 198 native tests, production build and all 296 browser cases passed.
This isolated the UI from concurrent uncommitted backend/configuration edits;
those edits are not certified by these results. Earlier active-tree failures
(static-cache expectations and WebKit chunk reload) are retained in logs and were
not patched as part of this UI task.

The existing three-cold-context Chrome 152 lab measured LCP at
1.968/1.924/1.920s and CLS at 0.001434 in every run. No page errors or Room-image
requests on direct synthetic Results navigation were recorded. The report names
`7c488c0-plus-emblem-cleanup` and measured HTML SHA-256
`05a5f3ad9c8affd61bc1078bf88de06a4ab758369361eb978f207eb65315ac1e`.
These are local laboratory results, not field p75 or live-provider latency.

Evidence: `output/verification/hero-loading/`, including the review captures,
`isolated-check.log`, `isolated-browser.log`, and `performance/browser-lab.json`.
The hotel matcher, physical-device verification, manual assistive-technology
coverage and public-release requirements remain separate from this visual work.

## Room visual completion across the search journey

Following the review of both the homepage and results/details, `c07af48` completes
the shared Room logo, footer, favicon, olive controls and warm ivory reading
surfaces across the actual flow. Results, property details, prices, evidence,
loading/recovery screens and popups now use the same visual identity. The footer
also reaches the viewport bottom on short pages and returns keyboard focus to
the homepage entrance. Existing layout and search/data behavior are preserved.

- Pinned Node 24.20.0: lint, all 189 native tests and production build passed.
- The complete four-project browser run passed 292/292. After the short-page
  footer fix, all 16 affected status/navigation/reflow cases passed.
- Existing calendar and destination/traveler accessibility cases now exercise
  reduced motion and explicitly verify popup opacity. Both initially reproduced
  invisible popups; the final fix passed all 8 cases across the four browser projects.
  No new test scenarios, dependencies or data abstractions were added.
- Independent senior review checked populated results/details, photographs,
  quote/evidence panels, statuses, footer, calendar and travelers at 1440, 832,
  390 and 320px. No page overflow or clipped controls remained in those checks.
  These are local synthetic-fixture and browser observations, not provider,
  physical-device, VoiceOver or user-usability certification.

The reduced-motion repair retains effectively instantaneous animation completion
so Ant popup classes clear. Transitions remain disabled: enabling even tiny
coordinate transitions caused WebKit to measure stale dropdown positions and
leave child-age options offscreen. No focus or placement code was rewritten.

Evidence is under `output/verification/room-completion/`, including review
screenshots marked `test-only`, full and focused test logs, and the retained
WebKit failure trace. Current visual completion does not change the candidate
API or establish hotel identity; single-hotel selection and consistent product
claims remain a separate functional release dependency.

## Room homepage — local verification

The selected expanded Room design is integrated with the existing destination,
dates, occupancy, draft and search-navigation behavior. The page has one static,
explicitly fictional hotel reveal, a three-step process and native FAQs. No
provider/API/identification changes or dependencies were added. Commits `6e65741`
and `1722254` contain the entrance and complete page; the final adjustment makes
mobile WebP the first picture source and aligns its homepage-only preload.

**Release dependency:** this homepage expresses the intended one-hotel-per-deal
product. The matcher, Results, Details and Terms still implement the existing
candidate model. Their separate identification work must land before public
release. No live hotel identity or accuracy was established in this task, and
nothing was pushed or deployed.

- `npm run check`: lint, 178 native tests and production build passed.
- Full browser suite: 291/292 cases passed. Firefox's existing Results test
  “travelers preserve keyboard and required age focus at 1440px” failed its
  child-age focus assertion once, then passed 3/3 isolated reruns. Cause is
  unconfirmed; it is not established as pre-existing. The focus code and assertion
  remain unchanged. After the final image-format adjustment, both existing
  Chromium/mobile 320px reflow checks passed. All four runs of the new destination loading/error/retry
  regression passed. Original matrix and rerun logs are retained.
- Independent skeptical reviews preceded each implementation milestone. Fixed
  mobile navigation visibility, traveler and skip-link focus contrast, mobile
  heading spacing and redundant FAQ decoration in accessible names. Final
  aggregate code/test review found no additional actionable issues.
- Rendered at 1440x1000, 1280x720, 832x900, 390x844 and 320x800 without horizontal
  page overflow. Checked keyboard/anchor/FAQ behavior, long destination and
  validation text, open controls, and lazy workflow-photo loading. 720x500 reflow
  represents a 200% equivalent viewport for 1440x1000, with reduced-motion
  emulation; actual browser zoom, physical devices and VoiceOver remain unverified.
- Direct Results and Details entry loaded no Room images or homepage preload
  links; those in-app checks used incomplete-link states. The existing lab also
  verified zero Room-image requests on valid synthetic Results navigation.

The existing three-cold-context Chrome lab measured AVIF-first LCP at
2.572/1.992/1.984s, with the first run above the 2.5s target. Prioritizing the
already-generated mobile WebP measured 2.216/2.032/2.016s with CLS 0.000695 in all
three runs. This demonstrates passing local measurements, not a proven decoder
root cause or field percentile. Desktop retains AVIF. Inventory was intercepted
and external origins blocked; no real-provider latency was measured.

Evidence lives under `output/verification/room-production/`: `logs/`,
`layout.json`, `direct-routes.json`, viewport captures and
`final-workflow-desktop.png`. `performance/browser-lab.json` retains the first
batch; `performance-webp/browser-lab.json` contains the final batch. Both report
Git HEAD `1722254`; the latter includes the then-uncommitted two-line mobile image
selection change. Its measured HTML SHA-256 is
`8fe43aba1de0785c4296d85ca81adf871484a4190db03d5c0e9478a220032693`.
The lab's full-page screenshots can show the offscreen lazy photograph unloaded;
the separate workflow capture verifies it rendered after scrolling.

## Rendered audit corrections (`4dd2217`)

The eleven ranked findings from the subsequent browser audit are addressed in
the existing application modules. [AUDIT_FIXES.md](AUDIT_FIXES.md) records each
correction, skeptical review decisions, the exact browser runs and the remaining
calendar tradeoffs. Current verification includes 178 native tests, 288 browser
combinations covered, the production build, and an actual in-app search/detail
check. No dependencies or production modules were added.

## Earlier comparison and family-pricing milestone (`6954d01`)

Hotel names, photos, match strength and original-offer pricing lead the comparison.
Detailed clue values remain available on demand. Results paginate 12 offers;
expanded comparisons reveal eight hotels at a time and preserve the revealed
count, focus and scroll when returning from a hotel. Refresh keeps prior results
visible; a rejected selection invalidates only the affected original shortlist.

The search animation uses a restrained wordmark reveal with a reduced-motion
alternative. Travelers retain page position for pointer actions, preserve keyboard
and validation focus, and recompute the panel's bounds when the viewport changes.
Calendar navigation and selected dates now expose accessible names and states.
Responsive results/details CSS no longer declares text below 12px.

Final native suite: **169 passed** after the current provider correction. The
shared lint/build check passed before that backend-only correction; its unchanged
frontend artifact is `index-BmlF8wpI.js`. All **200 browser combinations** are
covered: Chromium initially passed 49/50, its obsolete tooltip-copy assertion was
updated and the targeted case passed, then mobile/Firefox/WebKit passed 150/150.
No automatic retries, skipped tests or new Axe exceptions were added. Exact runs
and explicitly synthetic screenshots are in
`output/verification/current-ui-fixtures/browser-verification.md`.

Live verification exposed two pricing defects that stubs alone did not establish:
legacy plain-age API inputs did not carry the intended child occupancy, and the
legacy total could omit a second room's property fees. Both are corrected. API
children use ordinal-age strings (`1-7` for the first child aged seven); provider
URLs retain plain ages. The original quote now uses current `sopqHotelDetails`
pricing, independently of the named hotel's retail price. An ambiguous, malformed
or inconsistent price falls back to the listing quote without claiming fee
inclusion. Totals are never multiplied or estimated. See LIVE_ACCESS.md for the
observed inputs, amounts and stricter quote-selection contract.

The final normal API check requested Las Vegas, September 21–24, two rooms, four
adults and a seven-year-old child. It returned **67 Express offers and 213 named
hotels in one page**, in 2,752ms for that one uncached request. The selected STRAT
comparison returned 20 photos and a **USD 375.90** original-offer quote: USD 24 base
stay and USD 351.90 combined taxes/fees. Details took 4,407ms, including one HTTP
request with two separate provider resolvers. These are single observations,
not latency percentiles. The actual browser displayed the total and breakdown;
after its one-minute expiry, refreshing restored the quote. Hotel identity is
still an evidence-based possibility, not a verified outcome.

Following the corrected original-offer URL opened Priceline with the same three
nights, two rooms, four adults and one child. Its expanded price details displayed
USD 24 base, USD 7.98 taxes/fees and USD 339.78 property fees, totaling USD 371.76.
The API quote was USD 375.90. This remaining source-context difference is recorded,
not attributed to a proven promotion or presented as exact checkout-price parity.
No booking was made.

Search cards retain listing prices, with clearly labeled provider-advertised
room-rate discounts. Inclusive quotes are fetched only for a selected offer;
retrieving full prices for every result would add upstream work. The quote expires
after one minute independently of the five-minute offer relationship. A current
provider page can apply different pricing or promotions; this is not a guarantee
of a final checkout amount.

Local capacity measurements used a stub, never Priceline. The 25-search workload
peaked at 404.77MiB RSS on the development Mac; this is not Linux/VPS sizing proof.
An eight-operation HTTP cap bounds cache/shared-request serialization work. A
separate cached burst still measured about 477ms health latency, so saturation
responsiveness remains an explicit limit. Reports are under
`output/verification/capacity-*`. The external monitor now checks app-reported
provider availability without fetching inventory. Real hosted deployment, TLS,
rollback/reboot, physical devices, VoiceOver and first-time-user signoff remain open.

Current performance uses installed Chrome 152.0.7977.83, a fresh 390×844 context
per run, 4× CPU throttling, 150ms latency, 1.6Mbps down/0.75Mbps up and disabled
browser cache. All inventory is intercepted before navigation. The original
selected-design baseline measured LCP **5.748/5.712/8.020s**. Static compression
and early homepage-only image discovery reduced it to **2.804/2.548/2.528s**, still
above the target. Keeping the same mobile photo dimensions/crop and compressing
its AVIF from 113,860 to 46,294 bytes produced **2.352/2.144/2.160s**; all three
final runs meet 2.5s. CLS remained **0.001181**. This is laboratory evidence, not
field percentiles. The final report is
`output/verification/performance-frontend-ux--2026-09-08T04-15-39-751Z/`.
Direct results/detail navigation made no homepage-hero requests. The 100-offer
fixture renders 12 cards and made no extra upstream calls for sorting, expansion
or pagination. Final input-to-verified-render proxies were 126–184ms for validation,
88–112ms for sorting, 109–111ms for expansion and 108–147ms for pagination. These
sampled proxies do not establish field INP.

## Earlier live checkpoint (`22a957a`)

This application integration builds on `eb27e2d` (worldwide destinations and trip
controls) and `b3f8b59` (live adapter and durable request recovery). The verification
below covers the integrated cinematic homepage and real search/detail routes.

The final `npm run check` passed lint, **129 native tests** and the production
build. The full browser matrix passed **140/140 cases**: 35 scenarios across
Chromium, mobile Chromium, Firefox and WebKit, with no retries or skips. It retains
the earlier 128 cases and adds long opaque IDs/address-only details, independent
retail-versus-original expiry, and multi-room quote labels. Browser fixtures
intercept only test-owned API calls with live access explicitly disabled. They
verify deterministic behavior, not live hotel identity or price accuracy. The
existing exact Axe combobox exception remains; manual VoiceOver remains open.

Separate actual app verification began on the homepage: type and select Tel Aviv,
choose September 21–26, one room and two adults, then submit Search. The app returned
four Express offers and 20 displayed candidates after checking **332 named hotels
in one page**. Crowne Plaza City Center (`9056603`) opened with four real provider
photos, 12 amenities, the address “136 Menachem Road Azrieli Center 5” and a separate
retail quote. The app’s original-offer link opened Priceline with the same five
nights, one room and two adults. Priceline displayed USD 183 nightly and USD 967
total; the app’s USD 915 base-stay quote was not presented as a guaranteed total,
and tax/fee inclusion remained unknown. No booking was made. The older three-page
295-named-hotel timing is retained as historical evidence in LIVE_ACCESS.md, not
as the current retrieval result or a controlled performance comparison.

A larger saved Las Vegas probe retrieved all 371 reported rows in one 500-row
request: 271 named hotels and 100 Express offers, 4,583 ms and 331,538 bytes. This
supports the current combined-request shape for that trip. It does not establish
worldwide completeness, sustained capacity or fewer provider challenges. The
family provider UI verified aggregate guests/child ages and same-context opaque
offer routing; minimum rating/review semantics were also checked on rendered
provider offers. See [LIVE_ACCESS.md](LIVE_ACCESS.md) for exact artifacts and limits.

The verified local runtime was [127.0.0.1:4320](http://127.0.0.1:4320); port 4330
was a temporary redirect to that same app, not a second provider process. A local
frontend snapshot kept already-loaded lazy asset URLs available during QA builds.
This is local runtime evidence, not hosted deployment or rollback proof.

The selected cinematic homepage is now the actual application entry. Earlier
isolated design renders remain historical previews. Existing performance evidence
predates this design and must not be presented as its measured performance.

## Accessibility checklist

Target WCAG 2.2 AA across all owned screens/states, including privacy/terms and
shared navigation. Test labels and errors, headings/landmarks, screen-reader
status announcements, keyboard date entry, no traps, visible/unobscured focus,
restored focus after navigation, measured text/control contrast, 200% text, 320px
reflow, primary touch targets, and reduced motion. Automated success is only one
part of this assessment; do not call it certification.

## Usability session script

Nadav recruits 3–5 first-time users. Give only a trip and the task of comparing an
Express offer, reviewing a candidate, and identifying the original booking link.
Observe without coaching. Ask participants to explain what a candidate means,
which quote applies, what remains uncertain, and where booking occurs. Record
anonymous participant IDs, task outcomes, confusing moments and fixes. Retest
blocking or consequential price/identity confusion. This is qualitative evidence,
not a statistically established conversion or accuracy metric.

## Historical hosting research and screenshot decision

The supplied Hostinger Unlimited cart recorded during the earlier review shows
$53.89 for 12 months, a first-year hotelrevealer.com registration at no extra
charge, and $16.99/month hosting renewal.
The later public price card shows a different 48-month offer at $3.99/month.
Neither screenshot proves purchase, domain ownership, or infrastructure readiness.

The earlier official-documentation review found managed Node 24 tooling, Express
build entry configuration, environment variables and application restarts.
Managed hosting may reduce operational work, but single-instance coordination and
durable provider control state across deploys/restarts still need verification for
the exact plan.
Sources: https://www.hostinger.com/web-hosting,
https://www.hostinger.com/nodejs-hosting,
https://github.com/hostinger/api-cli/blob/main/docs/hostinger_hosting_nodejs_update-build-settings.md.

Do not infer Docker/root access from Node support. Keep VPS deployment preparation
portable and do not purchase either product before confirming fit and exact cost.

## Historical local evidence

- `output/verification/browser-lab.json` records installed Chrome 152.0.7977.83,
  three cold-cache 390×844 runs, CPU 4×, 150 ms latency, 1.6 Mbps down/0.75 Mbps up.
  The initial unsplit entry measured 2.404–2.668 s LCP; deferring comparison/detail
  code produced 2.288–2.524 s. These small local samples do not establish field
  percentiles or deployed performance. Do not round the slowest run into a pass.
- `output/verification/home-*.png` from the earlier checkpoint show the then
  disabled-provider application; they are not current live/design proof.
  Files containing `test-only` in their name show synthetic intercepted responses,
  not live hotel identities or prices.
- Skeptical milestone review identified and fixed conflicting offer-clue revival
  across page partitions, and cached evidence/handoff retained after server-side
  selection rejection. Later live work added a conservative disabled-state write
  before upstream dispatch and a SIGKILL/restart test. That test closes the
  process-interruption gap; hardware or volume loss is still unverified.
- Local match work is capped at 100,000 comparisons and 5,000 candidate objects;
  provider/public payloads are capped at 2 MiB. Oversize returns an explicit 503,
  never a silently truncated shortlist. Cache limits therefore bound response
  storage as well as entry count. These are application defaults, not provider limits.

Previous local checkpoint (`336a3e4`): 76 native tests and 52 browser cases passed;
lint and production build passed. That browser count represents 13 scenarios across
four engine/viewport projects.

## Committed destination and traveler controls (`eb27e2d`)

This checkpoint added the attributable worldwide GeoNames lookup, stable IDs,
calendar popups, room/adult counts, and required child ages. The skeptical review
found and corrected duplicate-label selection, city/state country-code ambiguity,
canonical-label display after edited URLs, and the UTC-ahead date-horizon boundary.
That checkpoint preceded the live provider adapter; geographic coverage still
does not establish hotel coverage. Subsequent provider UI and snapshot checks
established the observed aggregate occupancy and multi-room price basis, while
per-room assignment remains outside the application model.

`npm run check` passed: lint, 96 native tests, and the production build. The full
browser suite passed 128 cases (32 scenarios in Chromium, mobile Chromium,
Firefox, and WebKit), without retries or skips. This includes first-input retention,
same-label geographic selection, canonical labels, and restored calendar focus
before Escape and after replacement-date selection.

Clean `npm ci` in a separate temporary directory followed by a production build
also passed using that checkpoint’s workspace manifest/lock structure and source.
This verifies local reproducibility, not fresh Linux/VPS operation. The initial-input race and keyed
calendar focus loss were reproduced and fixed before this checkpoint.

The earlier cinematic design exploration is in ignored `output/design-options/`.
Its Chrome renders at 1440px and 390px had no horizontal overflow or console errors.
That preview evidence is historical; the selected homepage has since been wired
into the actual app and verified as recorded above. Its performance measurements
and manual release gates remain open.

### Reviewed combobox check

Historical exception: the current native combobox has removed this holder and
rule exclusion. This record describes the earlier Ant Design implementation only.

Axe's `scrollable-region-focusable` rule flags the destination popup's
`.destination-popup .rc-virtual-list-holder`. The combobox keeps DOM focus on its
input and exposes the active option through `aria-activedescendant`, following the
[W3C APG combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
The popup is intentionally outside the page's Tab sequence. A separate browser
check exercises all eight distinct options, owned active IDs, scrolling into the
visible popup bounds, Enter selection of the correct geographic ID, and Tab/Escape
exit. The exception applies only to that single holder and rule; other Axe findings
still fail the check. Manual VoiceOver/Safari validation remains an open release gate.


### Currency and theme controls — September 8, 2026

Removed the header's Hotels/How it works links and added currency and theme controls
on every page, including mobile. USD/EUR/GBP/CAD/AUD selections request provider
prices in that currency and carry through trip URLs, summaries, all quote amounts,
and the original-offer link. Saved currency and theme choices survive reload;
system theme is followed until a manual choice. No dependencies were added.

Validation: `npm run check` passed (221 native tests, lint, production build);
final frontend edits passed lint and build. The focused production-build currency,
theme, navigation and mobile-layout suites passed all 80 cases across Chromium,
mobile Chromium, Firefox and WebKit. They cover draft preservation, route variants,
Back/Forward, new currency requests without relabeling old amounts, fee/retail
quotes and links, theme persistence, unavailable storage, 320px controls and
automated dark-theme contrast including calendar/destination/traveler portals.
Full-page desktop/mobile screenshots were inspected, including WebKit dark mode.
The independent review's draft-loss and route-matching findings were fixed and
regression-tested. Fresh public synthetic currency probes are recorded in
`docs/LIVE_ACCESS.md`. Hosted deployment, provider checkout-price parity and
manual assistive-technology validation were not performed for this change.
