# Direction

Current decisions for Wyrdturn. Each prototype ends by adding its verdict
here; details and numbers stay in the prototype's `RESULT.md`.

## The game

- One hero, first person, on a 2 m grid. Step and 90° turn with short
  tweens. Turning is free; every other action takes one world turn.
- Strict turns with visible enemy intents: enemies show what they will do
  next, and red floor tiles mark the tiles they will hit.
- A run is a Descent of generated floors. The build (skills, upgrades,
  relics) carries between floors; unlocks carry between runs.
- Long term: procedural levels plus an AI game master. The game master
  proposes; the engine validates every proposal before applying it.
  Assets must therefore be cheap to vary (recolours, swapped parts, new
  monsters from old ones), not one-off models.

## Look

- Painted and stylised, not realistic.
- Bright by default. Base light is readable everywhere. Mood comes from
  shadows, colour tint and shifts between places (indoor and outdoor,
  themed zones). Torches are warm accents, not the only light.
- Torch lights fade gently (decay 1) and sit about 1 m from the wall, so
  walls near them don't burn out to white.

## Tech

- Three.js and Vite. Godot felt the same to play (E1), but Three.js lets
  agents take headless screenshots and run headless checks.
- Target: 60 fps at 1080p on an Apple-silicon MacBook Air. The playable
  slice runs at 60 fps there, with about 2× frame-time headroom on a
  generated floor (measured with the GPU bench in `prototypes/e11-combat`).

## Assets

- Walls, floors and architecture: built by Blender scripts (E2 kit), not by
  generators. TRELLIS can't do exact architecture.
- Textures: painted sets from image generation, made tileable and turned
  into basecolor/normal/roughness (E4). Shipped as WebP.
- Monsters, props and trees: TRELLIS 2 meshes, run through the asset gate
  (simplify the mesh, bake colour onto it, check budgets) in about 3 s each.
  Humanoids get a skeleton at runtime from `autorig.js`.
- Code-built monsters (E10) lost a blind comparison against TRELLIS 2-0.
  They stay useful for cheap variants and as a fallback.

## Prototype verdicts

| Prototype | Question | Verdict |
| --- | --- | --- |
| e1 grid (Three.js, Godot) | Which engine? | Three.js, for headless agent checks |
| e2 kit | Can scripts in Blender make clean, tiling level pieces? | Yes |
| e3 lighting | How much mood comes from lighting? | Most of it; "moody" look picked, made brighter later |
| e4 textures | Where do textures come from? | Image generation, processed to tile |
| e8 outdoor | Can open-air spaces work? | Yes: sky, sun and moon, grass, trees, fountain |
| e9 polyfork | What can borrowed rigged monsters teach us? | Procedural animation ideas; the files can't be redistributed |
| e10 code monsters | Code-built monsters vs TRELLIS? | TRELLIS wins; code stays for variants |
| e11 combat | Is the combat loop fun and checkable? | Playable Descent loop with bots and generators |
| e12 asset gate | Can generated models become game-ready without a person? | Yes, about 3 s per model |

## Open questions

- Difficulty for a person. The smart bot clears a 3-floor Descent 63-73%
  of the time, but it reads every intent perfectly.
- The LLM proposer for the game master, behind the existing director
  validator.
- Sound, and the first-person weapon art (the sword is a placeholder).
- A human-rated calibration set for the visual critic.
