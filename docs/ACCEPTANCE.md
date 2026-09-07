# Acceptance evidence

Updated 2026-09-07. This records observed evidence, not a blanket readiness claim.
The release remains blocked on authorized live access and external verification.

| Gate | Current status | Required evidence |
| --- | --- | --- |
| Domain correctness | Local tests passed | Constraints, ambiguity, date boundaries, duplicates/page partitions, order invariance and explicit size limits |
| Provider/API | Offline tests passed | Bounded work, coalescing, freshness, errors, partial pages, routine state persistence and default refusal; live adapter absent |
| Production build | Local passed | Pinned Node24/npm workspace install, lint and Vite/Express production build |
| Browser journeys | Local engine checks passed | Production-build search/details/recovery/navigation with test-only interception; including the rejected-selection regression |
| Automated accessibility | Passed on tested states | Axe A/AA on home, expanded results and candidate details in Chromium, Firefox, WebKit and mobile emulation |
| Manual accessibility | Partial | Keyboard skip-link and 320px reflow checked; CSS2x zoom has no overflow. Manual VoiceOver, true text enlargement and full criterion audit remain unverified |
| Browser/device support | Partial | Engine tests and installed Chrome152 lab checks; actual Edge/Safari and physical iOS/Android remain unverified |
| Performance | Local lab only; gate open | LCP2.288–2.524s over3runs, CLS0, sampled events64–128ms. One LCP run slightly above2.5s; fieldINP/p75, live results latency and hosted sizing unverified |
| Security/privacy | Local tests + reviewed limits | Bounded input/output, safe links, sanitized logs/errors; retained Router6 advisories documented in README |
| Live provider / accuracy | BLOCKED | Specific permission, current API fields and independently known hotel outcomes |
| Human usability | Pending Nadav | 3–5 first-time users without coaching; retest consequential confusion |
| Deployment / operations | Scaffolding validated only | Shell/Python/YAML guards and6 simulated release cases passed; Docker, host/TLS, real rollback/reboot and disk-failure block durability unverified |
| Portfolio release | BLOCKED | Actual public live journey and truthful case study tied to deployed revision |

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

## Hosting screenshot decision

The supplied Hostinger Unlimited cart shows $53.89 for 12 months, a first-year
hotelrevealer.com registration at no extra charge, and $16.99/month hosting renewal.
The later public price card shows a different 48-month offer at $3.99/month.
Neither screenshot proves purchase, domain ownership, or infrastructure readiness.

Hostinger's official managed Node tooling supports Node 24, Express build entry
configuration, environment variables and application restarts. Managed hosting
may reduce operational work, but single-instance coordination and durable provider
control state across deploys/restarts still need verification for the exact plan.
Sources: https://www.hostinger.com/web-hosting,
https://www.hostinger.com/nodejs-hosting,
https://github.com/hostinger/api-cli/blob/main/docs/hostinger_hosting_nodejs_update-build-settings.md.

Do not infer Docker/root access from Node support. Keep VPS deployment preparation
portable and do not purchase either product before confirming fit and exact cost.


## Recorded local evidence

- `output/verification/browser-lab.json` records installed Chrome152.0.7977.83,
  three cold-cache390×844 runs, CPU4×,150ms latency,1.6Mbps down/0.75Mbps up.
  The initial unsplit entry measured2.404–2.668sLCP; deferring comparison/detail
  code produced2.288–2.524s. These small local samples do not establish field
  percentiles or deployed performance. Do not round the slowest run into a pass.
- `output/verification/home-*.png` show the actual disabled-provider application.
  Files containing `test-only` in their name show synthetic intercepted responses,
  not live hotel identities or prices.
- Skeptical milestone review identified and fixed conflicting offer-clue revival
  across page partitions, and cached evidence/handoff retained after server-side
  selection rejection. A failed block-state write across restart remains an
  explicit prerequisite for future live operation.
- Local match work is capped at100,000 comparisons and5,000 candidate objects;
  provider/public payloads are capped at2MiB. Oversize returns an explicit503,
  never a silently truncated shortlist. Cache limits therefore bound response
  storage as well as entry count. These are application defaults, not provider limits.

Final local checkpoint: 76 native tests and 52 browser cases passed; lint and production build passed. The browser count is 13 scenarios across four engine/viewport projects, not 52 different product workflows.
