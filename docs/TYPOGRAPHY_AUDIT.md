# Typography and interface copy review — September 9, 2026

The “Take a closer look” closing section has been removed, together with its unused link import and section/button styles. The homepage now ends with the three-step guide followed by the existing footer. The typography and copy recommendations below are not implemented.

The main weaknesses are line breaks that separate meaningful phrases, inconsistent emphasis between related text, and small guidance at the exact point where a traveler needs to make a decision. Manrope itself is a reasonable fit; replacing the font would leave most of these problems intact.

## Evidence and scope

- Reviewed the current production build locally, using Node 24.20.0. The provider was disabled. Results and detail screens used the repository's synthetic fixtures, with a representative long hotel name; this is UI evidence, not live hotel or pricing verification.
- Captured 22 baseline states: home at 1440, 768, 390 and 320px; dark home at 1440 and 390px; results at all four widths; details at 1440, 390 and 320px; privacy at 768, 760, 390 and 320px; mobile validation, calendar, travelers, provider error and route-loading states.
- Additional probes covered a result with a fee-inclusive total, 320px text-spacing overrides on home/results/privacy/terms/credits, and a temporary balanced-wrap proposal at 1440, 390 and 320px. Proposed styles were applied only inside the audit browser.
- Measured computed styles after fonts loaded. No page-level horizontal overflow or JavaScript page errors occurred in the baseline captures. The five text-spacing probes had no page-level horizontal overflow. These checks do not establish complete accessibility conformance or absence of all internal clipping.
- `HOTEL_PROVIDER=disabled npm run check` passed: typecheck, lint, 291 tests, production build. Existing responsive and theme suites passed all 36 cases across Chromium, mobile Chromium, Firefox and WebKit. Independent source review found no actionable defect in the removal diff.
- Screenshots and measurement JSON are local, ignored artifacts in `output/verification/typography/`. Hosted appearance, physical devices, screen-reader use, and human usability were not tested in this pass.

Local evidence: [updated dark homepage](../output/verification/typography/home-dark-1440.png), [narrow result card](../output/verification/typography/results-320.png), [traveler guidance](../output/verification/typography/travelers-390.png), [mobile details](../output/verification/typography/detail-390.png), [mobile policy](../output/verification/typography/privacy-320.png), [total-price label](../output/verification/typography/total-result-320.png).

## Ranked findings

### 1. Essential form guidance is too small — high priority

**Observed:** At 390px, the labels are 14px and input values 16px, but validation messages are 11px. Traveler constraints such as “At least 1 adult per room” and age ranges are 11px; the autosave explanation is 10px. Calendar guidance is also 11px. The hierarchy makes required help look like incidental fine print.

**Impact:** People who cannot complete the form must read the smallest text on the screen to understand why. The red error color does not compensate for its size. In the captured blank-submit state, the destination help popup also visually covers the destination validation area; investigate that placement separately rather than treating it as a font-size fix.

**Smallest correction:** Give errors, age labels, constraints and meaningful helper text a consistent 13–14px role, with comfortable line height. Keep existing 16px input text. Let panels grow instead of squeezing their content.

**Evidence:** `search-controls.css:27,54,64,68`; `travel-dates.css:38`. Captures: `validation-390.png`, `travelers-390.png`, `calendar-390.png`. Small type alone is a usability finding, not proof of an accessibility violation.

### 2. Hotel names lose space and emphasis in results — high priority

**Observed:** At 320px, the name receives only **103px** beside a fixed 105px image and 14px gap. “The STRAT Hotel, Casino & Tower” becomes four lines: “The STRAT / Hotel, / Casino & / Tower.” The rating's “guests” becomes an isolated line. At 1440px, the neighborhood is 25px/650 while the hotel name is 22px/600. At 320px, they are 20px versus 18px.

**Impact:** The identity the product is trying to reveal reads as secondary content. A missing-photo placeholder consumes the same scarce width as an actual photograph. The ordinary layout prevents overflow, but does so at the expense of scanning and readable line lengths.

**Smallest correction:** Allocate more width to the name on narrow cards—reduce the thumbnail allocation or stack it above the identity—before reducing text size. Keep the hotel name visually primary and the neighborhood secondary across breakpoints. Preserve the “Likely hotel” qualifier so stronger typography does not imply verified identity.

**Evidence:** `results.css:60,66,72,171,175,195–197`; `Results.tsx:354–367`. Captures: `results-320.png`, `results-768.png`, `results-1440.png`. The four-line name is directly observed; arbitrary mid-word splitting for other names remains an inference from `overflow-wrap: anywhere`.

### 3. The price heading can disagree with the number's basis — medium priority

**Observed in a synthetic total-price state:** A card shows “ROOM RATE” above “$280 total,” followed by “Entire stay · USD.” The number and small unit are correct for the fixture, but the heading still describes a room rate even when the emphasized amount includes the entire stay and fees.

**Impact:** Readers must resolve the label conflict themselves. On ordinary cards, the 13px price unit and 12px fee warning also receive much less emphasis than the amount. This is a labeling and hierarchy problem, not evidence of incorrect price arithmetic.

**Smallest correction:** Derive the heading from the displayed metric: “Room rate” for nightly pricing and “Total for your stay” for an inclusive total, with equivalent wording for stale values. Keep the unit and fee status legible and adjacent to the amount. Do not alter calculations in a typography change.

**Evidence:** `Results.tsx:372`; `components.tsx:73–89`; `results.css:82–86`; `details.css:150–172`. Capture: `total-result-320.png`. The fixture proves rendering behavior; it does not establish how often a live search receives a total.

### 4. Priceline phrases break at the wrong words — medium priority

**Observed:** At 1440 and 768px, the 440px hero measure produces:

> Explore the likely hotel behind a Priceline Express\
> Deal before you book.

At 390px, the first guide step ends with “Priceline Express” and places “Deals.” alone on the following line. The 18px desktop / 17px mobile body size is already adequate; making it smaller would treat the symptom.

**Smallest correction:** Make wrapping aware of the phrase “Priceline Express Deal(s),” and adjust the measure or concise wording where necessary. Keep “likely” or equivalent uncertainty language. Avoid a fixed desktop `<br>` or an unbreakable entire sentence.

**Important experiment:** `text-wrap: balance` alone improves the hero at 1440 and 390px, but at 320px it creates a new “Priceline Express / Deal” split. It is not a complete fix. A responsive phrase group must still be able to wrap when enlarged text exceeds its available width. Browser balancing targets line lengths, not semantic phrase boundaries. [MDN text-wrap documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-wrap).

**Evidence:** `Home.tsx:11,55`; `room-home.css:28,64,89`. Captures: `home-light-1440.png`, `home-light-390.png`, `proposed-balance-1440.png`, `proposed-balance-320.png`.

### 5. Mobile detail headings flatten the hierarchy — medium priority

**Observed:** On the 390px detail screen, the hotel title is 32px, while “About this hotel,” “Location,” and “Amenities” are 30px. Those section headings are actually smaller on desktop, at 28px. A one-line address or short amenities list is introduced with almost the same emphasis as the property identity.

**Impact:** The page feels like repeated title blocks rather than a clear progression from hotel identity to supporting facts. The 14px body text makes the jumps more pronounced.

**Smallest correction:** Keep the hotel title primary, reduce mobile supporting headings to roughly 22–24px, and assess 15–16px for substantive descriptions. Keep the existing price panel's internal hierarchy distinct from the prose sections.

**Evidence:** `details.css:36,239–253,401,466–467`. Captures: `detail-390.png`, `detail-1440.png`. The measurements are observed; the proposed size range is a design recommendation.

### 6. Policy type scales in the wrong direction — medium priority

**Observed:** At 768px, the policy title is 34px. At 760px it jumps to 43px, while paragraph text drops from 16px to 14px. At 320px, nested page and card padding leave a 214px reading measure. “Privacy, plainly.” occupies two large lines above long, small-text paragraphs.

**Impact:** Narrower screens receive a larger title and smaller content—the opposite of a useful reading hierarchy. The extra inner padding makes already long policy pages unnecessarily narrow. Privacy, terms and credits share this styling.

**Smallest correction:** Remove the fixed mobile title-size jump, retain a continuous responsive scale, keep body text near 16px, and reclaim some reading width on the narrowest screens.

**Evidence:** `styles.css:1145–1176,1457–1461,1645`. Captures: `privacy-768.png`, `privacy-760.png`, `privacy-320.png`. Shared-page coverage was supplemented with 320px spacing probes for terms and credits.

### 7. Metadata wording and labels create avoidable reading work — lower priority

**Observed:** Result metadata says “8.7/10 guests,” while details say “Guest rating.” Result cards also layer “01 / EXPRESS OFFER,” neighborhood, “Hotel name withheld,” “LIKELY HOTEL,” “ROOM RATE,” and fee language before a traveler finishes comparing the property and cost.

**Impact:** The numeric rating's label is ambiguous, and many similarly styled small uppercase labels compete for attention. Some qualify different things, so simply deleting them would lose meaning.

**Smallest correction:** Use a consistent rating phrase such as “Guest rating: 8.7/10.” Prioritize hotel identity, price basis and the inference qualifier; make the offer index and redundant presentation labels less prominent. Preserve uncertainty and fee disclosures.

**Evidence:** `Results.tsx:350–372`; `Details.tsx:189–192`; `results.css:59,62,73,82`. Captures: `results-320.png`, `results-1440.png`, `detail-390.png`. This is a copy and hierarchy judgment, not a functional defect.

### 8. The secondary marketing heading has a forced, awkward phrase break — lower priority

**Observed:** “A name opens / up the picture.” has a hardcoded break between “opens” and “up.” It uses a large 52px desktop / 36px mobile heading for an abstract statement, while the practical explanation is smaller and muted. The hero's intentional two-sentence break is clearer by comparison.

**Smallest correction:** Consider a direct heading such as “See the hotel behind the offer,” or preserve the existing wording while allowing a better phrase boundary. Treat the wording as an editorial decision. Do not apply forced line breaks to all headings or replace the font to solve this.

**Evidence:** `Home.tsx:28`; `room-home.css:37,91`. Captures: `home-light-1440.png`, `home-light-390.png`.

## Copy and phrase review

The supplied README feedback is relevant to repetition, abstract language and unnecessary technical detail. Its audience-specific advice should not be imported wholesale. An interface should tell travelers what they can see, what a price means, and what happens next. It does not need to explain the implementation or sound like an engineering README.

The app already has several strong short phrases: “Your hotel. Out of hiding.”, “Start with your trip”, “Edit trip”, “View hotel details”, and “View deal on Priceline.” Keep them. The secondary homepage pitch and several state messages need more editing than the main headline or buttons.

### Concrete copy candidates

These are recommendations, not approved or implemented replacements. Ordinary home/detail/loading examples were rendered; additional recovery messages below were inspected in source rather than individually reproduced.

| Current text | Proposed treatment | Why / source |
| --- | --- | --- |
| “Explore the likely hotel behind a Priceline Express Deal before you book.” | “Find the likely hotel behind a Priceline Express Deal.” | More direct, fewer words, still qualified. Phrase wrapping must be tested separately. `Home.tsx:11`. |
| “A name opens up the picture.” | “See the hotel behind the offer.” | States the benefit in familiar language. Retain a visible “likely” qualifier elsewhere in the section. `Home.tsx:28`. |
| “A likely hotel gives you somewhere to look closer. See the place behind the offer before deciding whether it fits your trip.” | “Check the address, amenities and available hotel details.” | The current two sentences repeat the premise rather than explain what information is available. `Home.tsx:29`. |
| “Put the location in context.” / “Find the details that matter.” | “Check the location.” / “See the amenities.” | Concrete labels suit the address and amenities shown immediately beside them. `Home.tsx:31–32`. |
| “Explore one likely hotel and its available details. Deals that can’t be resolved stay unidentified.” | “Review the likely hotel. We show deals only when we can suggest one hotel.” | Describes what appears in results, which filter to matched offers, rather than an internal unresolved state. `Home.tsx:56`; `Results.tsx:182`. |
| “Preparing your search” + “Getting your search ready.” | Keep the title; remove the duplicate sentence. | Two lines say the same thing. Likewise, “We’ll show the results as soon as they’re ready” adds little below “Searching hotel deals.” Keep the refresh-state note about existing results because it explains useful behavior. `SearchProgress.tsx:9,16`. |
| “Close editor” | “Close trip details” | The control collapses a trip form; “editor” is application vocabulary. Do not call it “Save” or “Apply”—closing does not submit the edited search. `Results.tsx:289`. |
| “Your last retrieved results are shown below.” | “Your previous results are shown below.” | “Retrieved” exposes implementation language without adding meaning. Keep the stale-price label and timestamp. `Results.tsx:309`. |
| “The hotel provider is unavailable” | “We couldn’t load hotel information.” | State the failure in terms of what the traveler needs. The shared component also appears on detail pages, so avoid a search-only replacement. `components.tsx:170–172`. |
| “We could not verify this response” | “We couldn’t read the hotel information.” | “Response” is an API concept. Preserve the explanation that information was incomplete or inconsistent; do not imply the hotel itself was verified. `components.tsx:174–176`. |
| “This offer could not be recovered” | “We couldn’t reopen this offer.” | Describes the failed action. Do not say “sold out” or “expired” when the error does not establish that. `components.tsx:178–184`. |
| “A complete total is unavailable. Check the current price on Priceline or try again.” | “We couldn’t get the total price. Check Priceline or try again.” | More natural wording, with both available actions preserved. `Details.tsx:221`. |
| “The hotel name is inferred from the deal information, and is not guaranteed.” | “The deal details suggest this hotel, but its name is not confirmed.” | Uses ordinary language beside “Likely hotel.” Keep one clear explanation rather than a stack of synonyms. `Details.tsx:151`. |

### Put each qualification where it helps a decision

“State risks once” needs to be applied by surface and subject. Results and details can each be opened directly, so a qualification on one page does not serve every traveler. Hotel identity, tax inclusion and stale prices also describe different things; they should not be collapsed into one vague disclaimer.

- **Hotel identity:** Keep a short “Likely hotel” label next to each name, plus one plain explanation on the results/detail surface. Avoid repeatedly adding “inferred,” “not verified,” “not guaranteed” and “uncertain” to adjacent sentences. Do not strengthen this to “confirmed” or “most likely” just to sound confident; the current contract supplies one inferred match, not a calibrated probability ranking.
- **Price:** Keep the actual unit, tax/fee status and freshness next to the amount. These facts are part of interpreting the price, not optional defensive prose. Shorten surrounding sentences instead.
- **Booking:** Keep “View deal on Priceline” and a single nearby instruction to check the final price and terms. Do not add another generic caution beneath every property fact.
- **Failure:** State what failed, what is still available when that matters, and the next action. Repeating “Your trip details are preserved” across different error branches is not automatically repetition on screen: usually only one branch renders. Prefer “saved” to “preserved,” but verify whether it means the current page/tab rather than durable storage before making a stronger persistence claim.

### Secondary pages and wording to avoid

Terms and privacy have a different job from the homepage. Longer explanations there can be appropriate. Keep real data-use, attribution, availability and independent-project disclosures. In particular, the claims about how searches and identifiers are stored should not be shortened until their meaning is preserved. The interface does not benefit from adding caching, deterministic-matcher or cooldown implementation details to ordinary search screens.

The terms already repeat identity uncertainty and price limitations across several paragraphs (`App.tsx:98–146`). Consolidation is worth a separate editorial pass, but it is lower priority than the core traveler flow and must retain the distinct facts. The root README was not changed.

The useful voice rule is: one idea per sentence; name the thing the traveler sees; use the button to state the next action. Avoid making every heading metaphorical or every status message a formal three-sentence explanation. Some personality belongs in the main headline; practical controls should remain plain.

## What should remain

The active application uses one self-hosted variable Manrope family. Old serif rules in the base stylesheet are overridden or belong to inactive UI; they are not evidence of active font mixing. The existing 16px form values, normal body tracking, generous prose line heights and clearly separated primary buttons are good foundations. The loading and provider-error states have a clearer heading/body distinction than the problematic detail and policy screens. Light and dark themes passed the existing theme checks.

The large hero size and tight display tracking are stylistic choices. No clipping was observed at the measured normal widths, so they should not lead the fix list. Likewise, 12px footer text is a lower concern than 11px instructions needed to complete a search.

## Suggested implementation order and acceptance

1. Correct the hero/guide phrase wraps and essential helper/error sizes. Verify 320, 390, 768 and 1440px after fonts load, including increased text spacing.
2. Give narrow hotel names sufficient width and align price labels with the visible basis. Use long-name, nightly, total, stale and multiroom fixtures. Preserve amounts, units and qualifications.
3. Normalize detail and policy heading/body relationships. Check both sides of the 760px breakpoint, long paragraphs and narrow cards.
4. Apply the copy candidates selectively, then recheck wrapping. Shortening text can solve layout problems, but should not erase price basis, uncertainty or actual recovery behavior.

Use a small set of text roles rather than another blanket override stylesheet: input values 16px, substantive body text 15–17px, required help 13–14px, and supporting metadata 12–13px. These are proposed design targets, not standards-mandated minima. Existing component styles can express them without a new dependency or typography framework.

Future acceptance should include no lost content or controls at 320 CSS pixels and no loss under user text-spacing overrides. Those are the relevant behaviors described by [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) and [W3C Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html). The spacing probe used 1.5 line height, 2em paragraph spacing, 0.12em letter spacing and 0.16em word spacing. A no-overflow measurement by itself is not a complete conformance audit.
