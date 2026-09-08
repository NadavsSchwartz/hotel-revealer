# Room — expanded homepage

The selected Room study, developed into a complete interactive homepage sketch.
The approved architectural scene, olive reception desk, and quiet type hierarchy
remain the entry. The page continues through a candidate comparison, the
search-to-booking process, practical questions, and a return-to-search invitation.

## Preview

Serve the sketches directory from the repository root:

```sh
python3 -m http.server 4343 --bind 127.0.0.1 --directory sketches
```

Open http://127.0.0.1:4343/room/. The exploration selector also routes Room to this
expanded page. The original first-screen study remains in `../exploration/room.html`.
Use HTTP; the scripts are JavaScript modules.

## Interactive behavior

- Destination, dates, and traveler presets create a local illustrative trip preview.
- The date dialog keeps drafts separate from applied dates. Cancel, Escape, and
  outside dismissal discard unapplied edits. Applying dates can continue a search
  that was waiting for them.
- Date limits follow the application’s calendar rules: no more than 30 nights,
  with checkout within the next 365 days.
- A valid search scrolls to the comparison, announces the chosen trip, and moves
  focus to its heading. It does not contact a hotel provider.
- The Paloma and The Atlas buttons demonstrate supporting versus missing evidence.
  Candidate identity remains unverified in both states.
- Search invitations return focus to the destination field. FAQ disclosures and
  the named credits dialog use native keyboard behavior.

## Scope and integration boundary

This remains a design sketch. The examples are fictional and the traveler control
is a simple adult-count preset for one room. No production homepage, search route,
provider, or booking flow was replaced.

Any application integration should retain the existing worldwide destination
lookup, complete room/adult/child controls, validation, loading/recovery states,
URL context, and real matching contracts. No new dependencies were introduced.

## Verification

The integrated page was rendered and inspected in Chromium at 1440×1000,
1280×720, 832×900, 390×844, and 320×800. There was no horizontal overflow or
observed overlap between the hero, reception, header/footer, and process content.

Focused checks covered search continuation, applied-versus-draft dates, cancelled
edits, native date boundaries, whitespace recovery, keyboard candidate selection,
search-anchor focus, FAQ controls, and credits. Automated axe scans found no
violations in the tested main, candidate, date-dialog, and credits states at
desktop/mobile sizes. Final comparison geometry was also checked at 320px.

These checks are local prototype evidence, not physical-device, manual
assistive-technology, real-provider, or release certification.

## Assets and source

The page reuses `../afterlight/assets/afterlight-terrace.png`,
`atlas-inspiration.webp`, `manrope.woff2`, and `bodoni-italic.ttf`. All are available
locally; no runtime image or font CDN is required. Original generation prompts,
photography attribution, and font licenses are documented with
[Afterlight](../afterlight/README.md). Imagery is explicitly inspiration, never
evidence of a hotel match or bookable offer.

`index.html` is the complete page. `style.css` and `page.js` own the scene and
trip interactions; `comparison.css` and `comparison.js` own the illustrative
comparison. There is no build step or generated HTML fragment to keep in sync.
