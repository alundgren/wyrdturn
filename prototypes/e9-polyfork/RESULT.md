# E9 result: Polyfork monsters in the courtyard (learning test)

Downloaded (anonymous CDN, no key) into `download/` (gitignored; the
licence forbids redistributing the files): GLB, `.mjs` source and API
JSON for:

| Asset | Tris | Clips | Notes |
| --- | --- | --- | --- |
| flesh-eater-base "Wide-Jawed Ghoul" | 3,194 | Walk, Idle, Run | quadruped, also has procedural IK legs (`/cdn/walk.mjs`) |
| bone-warrior-base "Skull-Helmed Bone Warrior" | 4,996 | Idle, Walk, Run | 22-bone Mixamo skeleton |
| shambling-ghoul-256f2f "Shambling Ghoul" | 3,697 | Idle, Walk, Run | 31 bones (with face), part of a `dungeon-crypt` kit |

Shown in the E8 courtyard (`public/polyfork/`, also gitignored). Keys:
**M** cycles clips, **P** toggles a painted-texture overlay test.
Shots: `../e8-outdoor/shots/e9-*.png`.

## How they are made (from the .mjs source)

- 100% code. `createAsset(options)` builds a `THREE.Group` at runtime.
- Body = swept tubes: ring cross-sections ("stations") placed along each
  limb, then skinned (`sweep`, `ringN`, `limb`, `legStations`,
  `trunkSkin`, `skinnedMesh`). Parts are named for animation (Head, Jaw,
  Tail, LeftFrontUpLeg ...).
- No UVs or textures: one shared material, colours per vertex.
- Many knobs per creature (ghoul: skin/shade colours, claws, build,
  neck, head, gape, spines, ears, tail). Variants are free.
- Humanoids share one Mixamo-named skeleton, so CC0 clips (Quaternius)
  and any Mixamo animation retarget onto every character.

## What I learned

- Animated monsters with idle/walk/run in our scene took ~15 minutes.
  Rigging and animation, our biggest risk, is a solved problem if the
  monster is built on a standard skeleton.
- Look: clean, flat low-poly. The bone warrior and wide-jawed ghoul read
  as monsters; the shambling ghoul reads as a man in a loincloth.
  Doesn't match the painted style.
- The quick triplanar "paint" overlay (P) barely changes them. Painted
  look needs real UVs + painted textures, not a filter.

## What this means for our own monsters

Option A, "Polyfork-style": generate monsters in code (or a Blender
script) as swept, skinned tubes on a standard Mixamo skeleton, but add
UVs so painted textures (Codex image_gen) can go on. Gives rigging,
animation retargeting and endless variants (knobs) for free. Good fit
for the AI game master idea.

Option B, TRELLIS: better-looking static sculpt from a concept image,
but needs remeshing, UVs survive, and rigging + skinning per monster.

Next test: compare a TRELLIS monster from the PC (E5) side by side, and
try auto-rigging one TRELLIS mesh onto the Mixamo skeleton.
