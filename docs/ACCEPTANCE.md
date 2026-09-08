# Acceptance evidence

Updated 2026-09-08 Pacific time. This records observed evidence,
not a blanket readiness claim. Local live search, candidate details and provider
handoff have been exercised. Public release still needs the external verification
below. Nadav removed the earlier provider-permission implementation gate; no
permission or exception to the published terms has been established.

| Gate | Current status | Required evidence / remaining limit |
| --- | --- | --- |
| Domain correctness | Local tests passed | Conservative clues, ambiguity, dates, duplicates/page partitions, order invariance and bounded IDs/work; known live hotel outcomes still absent |
| Provider/API | Live adapter implemented; local tests passed | Real public listing/detail responses, geography guard, bounded work, coalescing, freshness, error classification and interrupted-call block persistence; no external API support guarantee |
| Production build | Local passed | Pinned Node 24/npm workspace install, lint and Vite/Express production build |
| Browser journeys | 296/296 passed in the isolated hero/loading snapshot | 74 scenarios across Chromium, mobile Chromium, Firefox and WebKit; snapshot excludes concurrent uncommitted backend/configuration work, as recorded below |
| Automated accessibility | Local matrix passed with one reviewed exception | The existing exception remains limited to one destination-popup holder and one Axe rule below; manual VoiceOver is open and there is no blanket AA claim |
| Manual accessibility | Partial | Earlier keyboard skip-link and 320px/CSS 2× checks; manual VoiceOver, true text enlargement and a full selected-design audit remain unverified |
| Browser/device support | Partial | Engine tests and earlier installed Chrome 152 lab checks; actual Edge/Safari and physical iOS/Android remain unverified |
| Performance | Current homepage meets the local mobile target | LCP 1.992/1.924/1.920s; CLS 0.000655. Local production laboratory protocol below; field/hosted performance remains unverified |
| Security/privacy | Local tests + reviewed limits | Bounded input/output, allowlisted links/images, sanitized logs/errors; current dependency findings and reachability in DEPENDENCY_REVIEW.md |
| Live provider / accuracy | Local flow verified; accuracy unverified | Original-offer handoff, observed price/clue semantics and separate retail details checked; known outcomes, future provider compatibility and permission remain unresolved |
| Human usability | Pending Nadav | 3–5 first-time users without coaching; retest consequential confusion |
| Deployment / operations | Scaffolding validated only | Earlier six simulated release cases; interrupted-upstream SIGKILL/restart test passed locally. Docker, host/TLS, real rollback/reboot, memory and hardware/volume-loss durability remain unverified |
| Portfolio release | Open | Actual public live journey and truthful case study tied to the deployed revision, plus the applicable gates above |

## Homepage copy and navigation cleanup

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

Axe's `scrollable-region-focusable` rule flags the destination popup's
`.destination-popup .rc-virtual-list-holder`. The combobox keeps DOM focus on its
input and exposes the active option through `aria-activedescendant`, following the
[W3C APG combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
The popup is intentionally outside the page's Tab sequence. A separate browser
check exercises all eight distinct options, owned active IDs, scrolling into the
visible popup bounds, Enter selection of the correct geographic ID, and Tab/Escape
exit. The exception applies only to that single holder and rule; other Axe findings
still fail the check. Manual VoiceOver/Safari validation remains an open release gate.
