# UI audit fixes — September 8, 2026

This closes the eleven ranked findings from the rendered audit of `431f8f8`.
The original audit and its failure captures remain unchanged under
`output/ui-audit-20260907/`. Public deployment, physical devices, VoiceOver and
first-time-user signoff remain separate gates in ACCEPTANCE.md.

| Finding | Correction | Verification |
| --- | --- | --- |
| Excluded hotel revived through Forward | Current search membership takes precedence; hotel data is no longer stored or recovered through browser history | Held-response browser regression plus stale/new-response reducer cases |
| Failed price refresh clears useful details | Retain the same selection through transient failures; authoritative rejection still clears it | Direct-link refresh → 503 keeps photos/property and a fresh original offer |
| Failed page download traps navigation | Reset the boundary on pathname changes; keep full-page reload recovery | Abort the actual Results chunk, then open Home and Privacy |
| Child-age validation misses focus | Fulfill explicit field focus when the panel actually mounts; avoid document scrolling | Fresh Home pointer flows using X and Done in all four configurations; live in-app check focused `child-age-0` |
| Age placeholder contrast | Scoped enabled-placeholder color, preserving disabled semantics | Computed contrast above 4.5:1 and opened-panel Axe check |
| Inconsistent cooldown actions | One bounded map of five trip deadlines shared by UI and request dispatch; retain deadlines across other trips | Search/detail refresh controls, deadline expiry, A→B→A, no unrelated abort, and no extra blocked POST |
| Expanded IDs break reload | Existing tab view state holds expansion; old usable links migrate without growing the address | Eighteen 1,024-character IDs expand across pages, then reload successfully |
| Unsubmitted Home draft is lost | App-level in-memory ref retains trip and displayed errors; valid submission clears it | Privacy/Terms navigation, Back, first typing, reload clearing and New trip; live in-app check retained dates and travelers |
| Mobile results bury names/prices | One retained editor collapses behind Edit trip; area, quote, previews and handoff use an explicit DOM order | First hotel and price fully inside the 390×844 viewport; editor draft/invalid-link checks |
| Small landing text | Functional labels at least 12px, body/action text 14px and 44px primary targets; hero accommodates content | Rendered mobile checks and 320px reflow |
| Hash jump focuses the hero | Focus the requested content instead of competing h1/hash actions | Home explanation, Terms anchor, Back and Start your search keyboard checks |

No dependencies or production modules were added. The fixes use the existing
React components, Redux state, and session view helpers. Skeptical reviews shaped
the implementation before edits and before commits: removing history fallback
replaced proposed rejection bookkeeping, cooldown storage stayed bounded, and a
single form/quote was retained instead of duplicating responsive components.

## Verification

- `npm run check`: lint, **178 native tests** and production build pass.
- **288 browser combinations** covered across Chromium, mobile Chromium, Firefox
  and WebKit. The final full run passed 287; the remaining Axe setup clicked an
  invisible popup during `appear-prepare`. The recorded trace established this.
  Its corrected setup waits for visible readiness, hit-tests the native click,
  and asserts the child was added before Axe; that case then passed all four
  configurations. No retries, skipped cases, forced clicks or new Axe exceptions.
- Earlier failures during integration exposed a selected-destination status panel
  covering date inputs and large-price overflow. The panel is suppressed once a
  destination is selected; large amounts retain their value and fit/wrap safely.
  Those affected workflows passed after the product corrections. The outside-click
  test uses a verified point outside the responsive popup, not an occluded heading.
- Current frontend entry: `index-DVjQeTdB.js`. The live local preview uses a separate
  snapshot with previous lazy assets retained, so QA builds do not replace its files.
- Live in-app check: Las Vegas, October 8–10, one room, two adults and child age
  seven returned 86 offers. The missing-age focus and Privacy/Back draft flow
  worked before submission; Edit trip opened a usable checkout calendar. Hotel
  details loaded from the real API. In that 390×844 results view, the first price
  began at y=503 and the first hotel occupied y=689–829, both in the first screen.
  These are current layout observations, not a controlled inventory benchmark.
- Three cold production mobile measurements: LCP **2.272 / 2.088 / 2.200 seconds**;
  CLS **0.0009533**. Input-to-render proxies ranged **77.8–154.8ms**. Same recorded
  390×844, 4× CPU, 150ms latency, 1.6Mbps-down profile; all inventory intercepted.
  These are laboratory measurements, not field INP or percentiles.
- A gray header frame after returning Home was checked: it is the inherited
  300ms color transition. Settled desktop/mobile text is white and readable.

Detailed measurements and screenshots are in
`output/verification/performance-ui-audit-fix-2026-09-08T14-37-32-089Z/`.
Current check output is in `output/ui-audit-fixes-20260908/check.log`.

## Deliberate limits

The smaller calendar observations were assessed separately from the eleven
ranked defects. The existing picker remains calendar-based and can navigate to
fully disabled months outside the allowed year. Removing readonly alone can
silently restore an invalid typed date, and this picker version has no public
navigation-bound API. No custom calendar or speculative focus framework was added.
Date existence, ordering, 30-night and one-year validation remain enforced.

Provider quotes can differ from the subsequent Priceline page and are not a
checkout-price guarantee. This task did not change provider integration or treat
that previously recorded difference as a proven calculation defect.
