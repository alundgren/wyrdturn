# E12 result: asset gate (research priority #2)

`node scripts/gate.mjs --profile prop|monster|kit|tree file.glb ...`
(run `vp build` once first). No window opens: pictures come from
headless Chromium.

Per file:

- Khronos glTF validator (errors fail the asset).
- Stats: tris, verts, meshes, materials, texture sizes (read from the
  PNG/JPEG headers), skins, animations, bounds, file size.
- Geometry: degenerate triangles, non-manifold edges and open-edge ratio
  (positions welded first so UV seams don't count), UV presence, UVs
  outside 0-1, UV area, skin weights that don't sum to 1.
- Budgets per profile (first guesses for 60 fps on the MacBook Air):
  prop 8k tris, monster 15k + wants a skeleton, kit piece 2k, tree 12k;
  textures up to 2048; plausible height range (catches wrong scale).
- Picture sheet `reports/<name>.png`: front, side, back, 3/4, top,
  silhouette (black on white: role readability) and an in-game view
  (one tile away, eye height, dungeon light).
- `reports/report.json` + `reports/report.md`; exit code 1 on any FAIL.

Verdict: PASS, WARN (budget, scale, origin, holes, no rig) or FAIL
(validator errors, unreadable, missing UVs on textured triangles, bad
skin weights, render failure, or more than 4x the triangle budget).

## Calibration run

| File                                                 | Verdict | Why                                                                 |
| ---------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| fixtures/broken-truncated.glb (kit.glb cut at 60 KB) | FAIL    | unreadable, validator error                                         |
| polyfork ghoul (3.2k tris, rigged)                   | WARN    | open edges/non-manifold: flat-shaded card parts, expected           |
| polyfork bone warrior (5k tris, rigged)              | WARN    | same                                                                |
| our outdoor.glb (trees + fountain)                   | WARN    | trees sink 13 cm below origin (root flare), card-like foliage edges |
| our kit.glb (all pieces in one file)                 | WARN    | whole library measured as one asset; gate per piece later           |

Known limits: no deformation check over animation yet (research item:
sample poses over time), no per-node gating for multi-piece libraries,
budgets need tuning against the E3/E7 performance route.

## TRELLIS -> game pipeline (2026-11-14)

14 TRELLIS models from the PC (`assets-incoming/`, gitignored, ~2.5 GB
with PLY sources): 10 monsters/props (E5/E6) + 4 trees (E8). Raw: ~280k
tris, 10-15 MB each, arbitrary scale. Gate verdict on a raw chest: FAIL
(282k tris, origin off the floor, 692 non-manifold edges).

What did NOT work (each caught by the gate's picture sheet):

1. Blender collapse-decimate on the raw mesh: TRELLIS meshes are loose
   triangles, so the mesh tore apart (74% open edges).
2. Weld first, then decimate: shape survives but the texture scrambles
   (thousands of tiny UV islands collapse together).
3. meshoptimizer simplify keeping UVs: stops at ~41k tris whatever the
   error limit (UV seams lock vertices).

What works: `sh scripts/prep-all.sh`

1. `scripts/prep.mjs` (glTF-Transform): same rotation/scale/floor offset
   for a full-res copy and a shape-only copy (UVs dropped, then weld +
   meshoptimizer simplify to the triangle target).
2. `blender/bake_from_high.py` (headless): Smart-UV the low-poly, bake
   base colour from the high-poly (Cycles, selected-to-active), 1024 px.
   ~3 s per asset. Results (all WARN, none FAIL; warnings are non-manifold
   edges, which are harmless for rendering):

| Asset                        | Tris          | MB          | Notes                                |
| ---------------------------- | ------------- | ----------- | ------------------------------------ |
| chest / chest-px             | 3.9k / 4.0k   | 0.31 / 0.36 | default cleaner, Pixal3D needs +90 X |
| bones, brazier, door, sconce | 3.0-5.2k      | 0.28-0.34   | good at game distance                |
| ghoul / ghoul-px             | 12.4k / 12.5k | 0.74        | Pixal3D clearly better face/anatomy  |
| skeleton                     | 12.1k         | 0.84        | sword + shield read well             |
| spider                       | 11.7k         | 0.78        | bristles become blobs; no rig        |
| oak, dead, cypress, shrub    | 5-9.6k        | 0.43-0.77   | dead tree and shrub best             |

Monsters are animated by an auto-rig in code (`e11-combat/src/autorig.js`):
joints guessed from the mesh (height bands, extreme vertices for hands,
lowest vertices for feet), bones with identity rest rotation, weights by
distance to bone segments (inverse 4th power, top 3, left/right masks).
The existing procedural animations (idle/walk/attack/hit/death) then
work unchanged. The spider gets whole-body motion only.
Check: `cd ../e10-code-monsters && vp build && Q=trellis node scripts/shots.mjs`.

Verdict: TRELLIS + this pipeline gives clearly better-looking monsters
and props than the code monsters, at ~4-12k tris and < 1 MB each, with
no hand work. Weak spots: dark baked albedo (lifted x1.6-1.8 in game),
fused parts (chest lid, weapons), crude skinning at joints (fine at grid
distance), non-humanoids need a different rig.
