# Acceptance evidence

Updated 2026-09-07 Pacific time (2026-09-08 UTC). This records observed evidence,
not a blanket readiness claim. Local live search, candidate details and provider
handoff have been exercised. Public release still needs the external verification
below. Nadav removed the earlier provider-permission implementation gate; no
permission or exception to the published terms has been established.

| Gate | Current status | Required evidence / remaining limit |
| --- | --- | --- |
| Domain correctness | Local tests passed | Conservative clues, ambiguity, dates, duplicates/page partitions, order invariance and bounded IDs/work; known live hotel outcomes still absent |
| Provider/API | Live adapter implemented; local tests passed | Real public listing/detail responses, geography guard, bounded work, coalescing, freshness, error classification and interrupted-call block persistence; no external API support guarantee |
| Production build | Local passed | Pinned Node 24/npm workspace install, lint and Vite/Express production build |
| Browser journeys | 200 local cases covered and passing | 50 scenarios across Chromium, mobile Chromium, Firefox and WebKit; exact runs below. Production-build intercepted journeys and real app live flow are separate evidence |
| Automated accessibility | Local matrix passed with one reviewed exception | The existing exception remains limited to one destination-popup holder and one Axe rule below; manual VoiceOver is open and there is no blanket AA claim |
| Manual accessibility | Partial | Earlier keyboard skip-link and 320px/CSS 2× checks; manual VoiceOver, true text enlargement and a full selected-design audit remain unverified |
| Browser/device support | Partial | Engine tests and earlier installed Chrome 152 lab checks; actual Edge/Safari and physical iOS/Android remain unverified |
| Performance | Current local mobile LCP/CLS target passed in three runs | LCP 2.352/2.144/2.160s; CLS 0.001181. Field INP/p75, controlled live-search latency and hosted sizing remain unverified |
| Security/privacy | Local tests + reviewed limits | Bounded input/output, allowlisted links/images, sanitized logs/errors; current dependency findings and reachability in DEPENDENCY_REVIEW.md |
| Live provider / accuracy | Local flow verified; accuracy unverified | Original-offer handoff, observed price/clue semantics and separate retail details checked; known outcomes, future provider compatibility and permission remain unresolved |
| Human usability | Pending Nadav | 3–5 first-time users without coaching; retest consequential confusion |
| Deployment / operations | Scaffolding validated only | Earlier six simulated release cases; interrupted-upstream SIGKILL/restart test passed locally. Docker, host/TLS, real rollback/reboot, memory and hardware/volume-loss durability remain unverified |
| Portfolio release | Open | Actual public live journey and truthful case study tied to the deployed revision, plus the applicable gates above |

## Comparison and family-pricing milestone (`6954d01`)

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
