# Three homepage studies

Three independent first-screen designs for Hotel Revealer. This exploration follows
the Afterlight concept and changes the structure and interaction of the homepage.

| Study | Composition | Tradeoff |
| --- | --- | --- |
| Departure | The visitor edits a typeset trip sentence with native destination, date, and traveler controls. | Most direct interaction; less space devoted to a single photograph. |
| Atlas | Three photographic planes surround separate title, search, and clue-explanation areas. | Strongest compositional variety; requires more responsive layout adaptation. |
| Room | An interior scene frames a vertical search panel like a reception desk. | Strong atmosphere and clear search; more dependent on the photograph. |

## View locally

Serve the **sketches directory**, since the studies reuse assets from Afterlight:

```sh
python3 -m http.server 4343 --bind 127.0.0.1 --directory sketches
```

Open http://127.0.0.1:4343/exploration/.

The bottom controls switch between studies. Keys 1, 2, and 3 work while a
direction control has focus; they do not intercept keys inside a study. “Open full size” opens the selected study without the selector.
Room is the selected direction and now opens the expanded homepage in `../room/`.
A URL hash selects another direction. The original first-screen Room study remains
available at `room.html`.

Each page is self-contained HTML/CSS/JavaScript and can also be viewed at its direct
HTTP URL. No dependencies, production routes, or application styles were added.

## Scope

These are interactive visual studies, not replacements for the application.
Search submissions stay local and show explicitly illustrative feedback or a
fictional comparison. No provider request, hotel identification, or booking occurs.
The application's existing worldwide destination lookup, full traveler controls,
and request lifecycle would be reused during any later integration.

## Assets

All imagery and type are reused from `../afterlight/assets/`. Photography is clearly
identified as inspiration; it does not represent actual hotel matches or offers.
Generated-image prompts, photography credit, and font licenses remain in the
[Afterlight source](../afterlight/README.md).

## Verification boundaries

The studies are checked in local Chromium at desktop, compact laptop, tablet, and
mobile sizes. Search/dialog behavior, native input bounds, keyboard access, and
layout collisions receive focused checks. This does not establish physical-device,
manual assistive-technology, real-provider, or production release evidence.

Final checks: each study passed targeted automated axe scans at desktop and mobile
widths, including the tested dialog states. The integrated selector, direction
shortcuts, full-size links, and dialog preservation were checked in the in-app
browser. An independent review caught and fixed selector keys that could dismiss
a study, and date summaries that could stay visible after clearing their inputs.
