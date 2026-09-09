# Afterlight — homepage sketch

A photographic homepage concept for Hotel Revealer. The image appears as the
upright face of a print; a folded edge leads to a continuous paper surface holding
the trip search, evidence comparison, and practical questions.

## Preview

Serve this directory over HTTP. From the repository root:

```sh
python3 -m http.server 4342 --bind 127.0.0.1 --directory sketches/afterlight
```

Open http://127.0.0.1:4342. Opening the HTML as a file is not the interactive preview:
the page uses JavaScript modules.

This remains separate from the application. Search validates the local fields and
opens the fictional example; it does not request live offers. The application’s
destination autocomplete, complete traveler controls, and real search lifecycle
would be reused if the direction is integrated. Traveler presets are illustrative.

## What works

- One entrance fold, with a static reduced-motion alternative.
- Trip destination and calendar-date validation; search moves focus to the example.
- A semantic comparison table with five criterion buttons that highlight a full
  row and explain the supporting or missing evidence.
- Sideways table scrolling with a visible hint and sticky criteria when necessary.
- Native FAQ disclosures and a named credits dialog with Escape dismissal.

## Verification

The integrated page was rendered and visually inspected in local Chromium at
desktop and mobile sizes. Width checks cover 320, 390, 650, 768, 960, 1024, 1440,
and 1920 CSS pixels. The comparison scrolls inside its own region rather than
overflowing the document.

Verified search preview, destination focus, all five criterion selections, keyboard
selection, native horizontal keyboard scrolling, FAQ expansion, dialog opening,
Escape dismissal, and restored dialog-trigger focus. Automated axe checks found
no WCAG 2 A/AA or 2.1 AA violations at 1440px and 390px. These are local automated
checks, not manual assistive-technology or physical-device certification.

All data and pictures in the comparison are illustrative. Supporting clues never
become a confirmed identity. Unknown review counts and amenities remain unknown.

## Sources and imagery

- `assets/afterlight-terrace.png`: original 1536 × 1024 image generated with the
  built-in image-generation tool. Fictional hotel scene, not a real property/offer.
- `assets/paloma-inspiration.png`: generated Mediterranean pool image from direction
  02. Its original prompt is in `assets/paloma-PROMPT.txt`.
- `assets/atlas-inspiration.webp`: project photography by Christian Lambert,
  https://unsplash.com/photos/vmIWr0NnpCQ, under https://unsplash.com/license.
- Bodoni Moda: The Bodoni Moda Project Authors,
  https://github.com/indestructible-type/Bodoni. SIL Open Font License included.
- Manrope: existing project font by Mikhail Sharanda and Mirko Velimirovic.
  SIL Open Font License included.

### Final terrace image prompt

Use case: photorealistic-natural. Asset type: immersive hero photograph for a mature, unconventional travel comparison website. A single incredibly beautiful and understated editorial photograph, landscape 3:2 composition. Quiet boutique hotel terrace at the last light of dusk, looking out across still silver-blue Mediterranean water. The camera is inside a shadowed room looking outward through a very wide open architectural doorway. Soft translucent linen curtains hang from the right edge, slightly moved by breeze. Travertine terrace floor, one beautifully crafted low dark walnut lounge chair on the right, a tiny side table with a half-finished amber drink. Just one warmly lit neighboring hotel window under a sculptural pale limestone arch at the far right. Beyond the terrace a low stone ledge, a soft line of distant cypress and open water. Upper left half is a calm hazy dusk sky, slate lavender and silver fading toward a thin warm muted apricot horizon. There is an exquisite balance of plum-black foreground shadows, cool water, and tiny warm points of interior light. Lived-in natural atmosphere, traces of human presence but no visible people. Shot on a medium-format camera, genuine photographic slight grain, natural lens falloff, imperfect material textures. Compose the window/terrace view across the upper two-thirds, bottom left is in deep quiet shadow with lots of usable space for restrained white web text. Cinematic, intimate, refined, mysterious, emotionally inviting. Avoid the look of an architectural 3D render. No central infinity pool, no drone view, no symmetry, no tropical resort cliches, no text or logos, no UI, no watermarks. Entirely fictional travel inspiration, not a real hotel offer.
