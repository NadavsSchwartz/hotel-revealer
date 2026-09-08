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
| Browser journeys | 140/140 local cases passed | 35 scenarios across Chromium, mobile Chromium, Firefox and WebKit; no retries or skips. Production-build intercepted journeys and real app live flow are separate evidence |
| Automated accessibility | Local matrix passed with one reviewed exception | The existing exception remains limited to one destination-popup holder and one Axe rule below; manual VoiceOver is open and there is no blanket AA claim |
| Manual accessibility | Partial | Earlier keyboard skip-link and 320px/CSS 2× checks; manual VoiceOver, true text enlargement and a full selected-design audit remain unverified |
| Browser/device support | Partial | Engine tests and earlier installed Chrome 152 lab checks; actual Edge/Safari and physical iOS/Android remain unverified |
| Performance | Previous-design baseline plus isolated live timings; gate open | Repeat the browser performance measurement on the selected production design; field INP/p75, controlled live-search latency and hosted sizing remain unverified |
| Security/privacy | Local tests + reviewed limits | Bounded input/output, allowlisted links/images, sanitized logs/errors; retained Router 6 advisories documented in README |
| Live provider / accuracy | Local flow verified; accuracy unverified | Original-offer handoff, observed price/clue semantics and separate retail details checked; known outcomes, future provider compatibility and permission remain unresolved |
| Human usability | Pending Nadav | 3–5 first-time users without coaching; retest consequential confusion |
| Deployment / operations | Scaffolding validated only | Earlier six simulated release cases; interrupted-upstream SIGKILL/restart test passed locally. Docker, host/TLS, real rollback/reboot, memory and hardware/volume-loss durability remain unverified |
| Portfolio release | Open | Actual public live journey and truthful case study tied to the deployed revision, plus the applicable gates above |

## Current live checkpoint

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
