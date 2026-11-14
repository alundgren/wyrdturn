# E8 result: outdoor courtyard (first pass)

Map `src/test02.txt` (also `../maps/test02.txt`): a walled courtyard with
grass, 4 trees and a fountain, through an arched door from a small
dungeon part. Built on the E2 kit app ("moody" look).

## What is in it

- **Sky dome** (`src/sky.js`): one painted-style shader for gradient,
  sun/moon disc and glow, drifting fbm clouds and twinkling stars.
  Presets day / dusk / night (key **T**, or `?time=`).
- **Sun/moon**: directional light with a 2048 shadow map over the whole
  map. Shadows still drawn only when the time changes.
- **Indoor/outdoor blend**: base light and fog fade between dungeon
  values and the sky preset depending on the tile you stand on.
- **Grass** (`src/grass.js`): ~21k instanced blades, wind sway in the
  vertex shader, colour variation, kept clear of trees and fountain.
  `?grass=` sets blades per tile (default 260).
- **Trees and fountain**: `blender/build_outdoor.py` (headless). Trees
  are tapered branches + noisy foliage blobs (~850 tris). Fountain is an
  octagonal two-tier basin (~490 tris) with animated ripple water and a
  small particle spray.

## What I learned

- Sky, clouds, stars and sun shadows were easy and cheap. Day and dusk
  already look good.
- Grass needed one trick: both sides of each blade must use an "up"
  normal, otherwise half the blades render black.
- Procedural Blender trees look like low-poly lumps. Not painted enough.
  Try TRELLIS trees (gaming PC) or painted leaf cards next.
- Ground texture is a quick canvas placeholder. Needs a painted grass/dirt
  texture from Codex image_gen like E4.

## Not measured

Real-GPU fps with 21k grass blades + sun shadows. Check on the Mac.

## Update: bright-by-default lighting

Human feedback: too dark even with sliders maxed; the game should not be
dark by default. Changes: strong hemisphere base light (3.0), coloured
indoor haze instead of near-black fog (#6b5a48, density 0.03), torches
as accents (14), lantern 4 with gentle falloff, vignette 0.3, a
"texture brightness" multiplier (1.6), brighter ceiling and bounce tint,
brighter day/dusk/night presets. Tune panel (G) now has tint colour
pickers. Saved values use a new key (`tune-v2`), so old dark values are
ignored.

## Update: TRELLIS trees + painted ground (2026-11-14)

- Trees: TRELLIS dead tree, cypress, oak and thorn shrub from the PC,
  prepped by e12 (5-9.6k tris each, baked colour), replace the Blender
  lumps. `?trees=code` brings the lumps back for comparison.
- Ground: Codex painted grass (default), dirt under trees and shrubs,
  flagstone path tiles (`=` in the map). `?ground=canvas` for the old one.
- Map now has a cross-shaped path to the fountain and two shrubs ('b').
- Verdict: the dead tree and shrub look like a real game; the oak reads
  as an umbrella-shaped canopy (OK at distance). Grass blades + painted
  grass texture work together.
Shots: `shots/moody-day-courtyard.png`, `shots/moody-dusk-trees.png`.
