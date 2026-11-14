# E3 result: lighting and mood (first pass)

Ran on placeholder canvas textures (bricks and flagstones drawn in code),
since E4's real textures are not done yet. Same map and movement as E1.

## Looks (`?look=` in the URL)

| Look | What it adds |
| --- | --- |
| base | E1 as is: one strong light on the camera |
| lit | tone mapping (ACES), exp fog, dim cold fill light, weak lantern, 6 flickering wall torches |
| moody | lit + torch shadows, ambient occlusion (GTAO), bloom, colour grade, vignette, grain |
| painted | moody + Kuwahara filter (smooths detail into brush-like patches) |

Contact sheet: `shots/contact-sheet.png` (rows = looks, columns = spots).

## What I learned

- Lighting does most of the mood. Even the drawn-in-code bricks look like
  a dungeon in "moody / torch-hall".
- Wall torches with dark gaps between them read much better than one
  light on the camera. Keep the player's own light weak.
- three.js lights use real units now. First try was almost black.
  Torches needed intensity ~26 (candela), not 2-6.
- Colour grading must multiply, not add. Adding blue to the shadows
  turned the whole frame navy.
- The Kuwahara "painted" filter is subtle at radius 3. It softens noise,
  but the painted look must come from the textures (E4), not a filter.

## Risks / not measured

- Real frame rate is unknown. Screenshots use a software renderer.
  "moody" has 6 shadow-casting point lights (6 shadow renders each per
  frame) plus AO and bloom. That may be too much for the MacBook Air.
  Fix if needed: shadows only on the 2 nearest torches.
- Placeholder textures. Redo the sheet with E4 textures.

## Try it

```
cd prototypes/e3-lighting
npm run dev
```

Then open the URL with `?look=moody` (or base, lit, painted). The top
left shows real fps on your machine.

## Update: with E4 textures

Now uses E4 method A3 (Codex image_gen) textures by default: base colour,
normal and roughness for wall, floor, wood (door frame) and iron (torch
holder). Copied into `public/tex/`. `?tex=canvas` brings back the
code-drawn bricks.

- Big step up. "moody / torch-hall" and "moody / pillar" look like a
  real painted dungeon crawler.
- Darker textures needed a stronger player lantern (20, was 10),
  otherwise spots far from torches went black.
- Stones read large (one texture per 2 m wall face, 1.5x vertical).
  Fine for now; tune with E2's tile kit.
- Torch is still a cone on a stick. Needs a real model (E6).
- Wall corners show a hard line where two boxes meet. A real tile
  kit (E2) with trims and corner pieces fixes that.

## Update: tested on the MacBook Air (human, 2026-11-13)

- First run: ~30 fps in "moody". Cause: 6 shadow-casting point lights
  re-rendered every frame (36 shadow passes) plus full-size Retina AO.
- Fixes: shadow maps drawn once (`shadowMap.autoUpdate = false`, torches
  and walls are static), AO at half resolution, pixel ratio capped at 1.5
  (`?dpr=` to change). Now 60 fps (likely the display cap).
- Brightness: the earlier level was right. Tried brighter, reverted.
- Verdict: "moody" is the look. Good enough for now.
- Known: too few light sources. Add more torches/braziers later.
- Keys 1-4 switch looks and keep your position.
