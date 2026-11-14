# E4: painted dark fantasy textures

Run: 2026-11-13, Apple silicon MacBook Air. No commits. All experiment work is inside this directory. No GUI was opened or controlled; Blender ran only with the explicit `-b` command below. The already running human Blender process was left untouched. No Blender MCP calls were made. Blender's installed startup add-on printed its unregister message on exit; that is not an MCP invocation.

## Decision

**Painted-look ranking: A > B > C.** Use A3 as the visual direction for the dungeon, B as the dependable PBR baseline, and C for inexpensive masks and parameterised variations. This is a flat-albedo comparison, not an in-engine lighting or performance evaluation.

| Method | What worked | Failure / practical consequence |
| --- | --- | --- |
| A: Codex image_gen | Strong painted chipped masonry, broad irregular flagstones, split vertical wood and convincingly oxidised iron. Production prompt (trial 3) is the most cohesive dark set. | Prompting tileability did not produce exact matching pixels. Mortar and wood details can terminate at a tile border. Edge correction removes colour jumps, not all structural errors. Albedo includes painted highlights and crevice shading; inferred normals are not measured geometry. |
| B: Poly Haven + scripted paint-over | Reliable source PBR maps; wrap-aware Kuwahara filter simplifies small details; monastery floor has useful irregular slabs. | Castle wall retains a photographic scale and busy detail; metal retains too much yellow. Wood remains close to filtered photography. Stronger filtering trades readable wear for smearing. |
| C: Blender nodes, emission bake | Very fast, deterministic, editable colour bands; rust mask and palette changes are inexpensive. | Flat colour bands look like camouflage rather than brushwork. Regular masonry/plank grid is obvious. Initial floor was wall bricks; changed to larger aligned slabs. Initial wood grain ran horizontally; corrected noise scaling. Floor still resembles regular tiles rather than convincingly worn flagstone. This is a failed art-direction candidate, preserved for comparison. |

A1 uses explicit grim game painting; A2 uses gouache; A3 uses production texture language. A2 is consistently softer and lighter, especially the floor. **No trial became cute or friendly**: this experiment does not reproduce that earlier concern. The negative constraints and concrete material descriptions were used together, so this run cannot establish which prevented it. Three samples per material are insufficient to estimate a general failure rate.

Trial 3 was selected consistently across all four materials for palette coherence, rather than selecting a different style for each. All twelve originals and repaired trials are retained.

## Files and maps

- `contact-sheet.png`: 3840×2180 labelled sheet, four materials × eight columns. Each cell is a true 3×3 repeat, without lines covering boundaries. Columns: A1, A2, A3, B, C, then A3/B/C wet variants.
- `method-a/{material}-trial-{1,2,3}.png`: unmodified generator outputs. `prompts.json` and `generation-manifest.json` record exact inputs and source provenance.
- `method-{a,b,c}/{wall,floor,wood,iron}/basecolor.png`: 1024×1024 RGB final textures. `preview-3x3.png`: full-resolution 3072×3072 flat test.
- Each selected material has `normal.png` and `roughness.png`. A uses luminance-derived OpenGL-style normals and heuristic roughness, **not true generated PBR**. C bakes procedural colour and height through emission, then derives normals and roughness from height. B retains the downloaded OpenGL normal and roughness, with border correction. Their photographic fine detail can disagree with the simplified paint-over albedo.
- `wet-basecolor.png`, `wet-roughness.png`, `wet-3x3.png`: cheap variant for every material and method. Multiply RGB by (0.65, 0.72, 0.73) and set roughness to 0.28; reuse normal. This is a deliberately simple wet-look parameter trial, not simulated water. Flat previews show colour only; specular response remains untested.
- A also includes `trial-N-raw-3x3.png` and `trial-N-3x3.png` for before/after inspection. B includes `source-3x3.png`. C retains raw baked colour/height and `materials.blend` with the four procedural materials.

## Tiling and validation

All processing is scripted. The repair averages opposite edge values and feathers the correction inward over 64 pixels with a quadratic weight, on both axes. It avoids mirroring the whole image but can make a blurred border band. Kuwahara uses four overlapping 9×9 neighbourhoods and selects the lowest-variance mean; filters wrap across boundaries. B then uses 19 tonal levels, desaturation, cool grading, and **local material-edge** darkening (not a frame vignette).

Pixel continuity is not proof of convincing repetition: the corrected C floor has visible regular grid repetition; C rust has recognisable repeating patches; generated stone joints can bend or end at a repeated boundary. These are documented defects, not hidden by the previews. Treat C as research output and review A at game scale before accepting it as a production material. No claim of a visually flawless seamless production set is made.

`edge-metrics.json` stores raw/pre-repair/final opposite-edge mean absolute error (0–255 scale). A's selected `before` field is after saving its initial repaired trial; use `a/{material}/trial-3/raw_edge_MAE_255` for the real raw baseline. Final on-disk checks are recorded in `validation.json`; floating-point metrics before PNG quantisation can differ by one level. Edge averaging can slightly alter normal length; normalise sampled normals in the shader. Roughness and normals are data textures; base colour is sRGB. No metallic map was inferred: use a manually reviewed iron/rust mask before claiming physically correct metal response.

## Licence and sources

All B source assets are **CC0** according to [Poly Haven's asset licence](https://polyhaven.com/license), verified during this run. Attribution is optional; provenance is retained anyway. Manifest contains download URLs, API-provided MD5 hashes, asset IDs and licence URL per map. Licence applies to the assets, not the site's logos or example renders. No site example renders were used.

| Material | Asset | Licence |
| --- | --- | --- |
| wall | [castle_brick_01](https://polyhaven.com/a/castle_brick_01) | CC0 |
| floor | [monastery_stone_floor](https://polyhaven.com/a/monastery_stone_floor) | CC0 |
| wood | [medieval_wood](https://polyhaven.com/a/medieval_wood) | CC0 |
| iron | [rusty_metal_03](https://polyhaven.com/a/rusty_metal_03) | CC0 |

A is generated through the supplied Codex image_gen tool, not CC0 library content. No third-party texture image was supplied to the generator; named games were style references in text. This report does not independently establish copyright protection or exclusivity for generated output. C uses original procedural node definitions and no external image textures.

## Reproduction and time

From this experiment folder:

```sh
scripts/.venv/bin/python scripts/download.py
/Applications/Blender.app/Contents/MacOS/Blender -b -t 4 --python scripts/bake.py
scripts/.venv/bin/python scripts/process.py
scripts/.venv/bin/python scripts/verify_downloads.py
scripts/.venv/bin/python scripts/report.py
```

Python dependencies: Pillow 13.0.0, NumPy 2.5.4, SciPy 1.18.1 (local `scripts/.venv`). Imagegen reruns require the supplied tool and exact `method-a/prompts.json`; seeds/model version were not exposed, so pixel-identical regeneration is unavailable. Scripts contain no app launches beyond the separately documented background Blender command.

Download initially failed with Python HTTP 403; switched to curl. A map lookup initially used `rough`; API uses `Rough`; corrected and reran. Completed B downloads took 21.3 s. Blender 5.3.0 Release Candidate, Cycles CPU emission bakes, 1 sample, four CPU threads: final eight-map bake plus saves took 0.69 s inside Blender (startup excluded). First bake took 0.70 s; a second run corrected floor proportions and grain direction. Final processing of all trials/maps/previews took about 14 s. These compute times exclude authoring, review, tool latency, and image generation.

Image generation: twelve independent calls dispatched together; approximately 5.5 minutes elapsed from prompt recording to copying the completed outputs (includes orchestration overhead). Overall research/implementation effort was approximately 15 minutes; this is a rough wall-clock estimate, not an artist-production benchmark.

## Recommended next pipeline

1. Approve A3 palette and mark size on a corridor wall and floor at the intended texel density. Keep B as a relightable reference, particularly its roughness and surface depth.
2. Use generated albedo only after 3×3 raw/repaired inspection; reject bent joints and repair them with material-aware painting rather than ever-wider blur. Share one art reference in future runs to reduce palette drift.
3. Generate height/roughness from procedural geometry or reviewed B maps matched to the approved layout. Do not combine unrelated stone normals with generated joints. Reduce photographic normal detail to match the painted base colour.
4. Add grime, damp and rust as separate repeatable masks; tint and roughness changes are cheap across every method. C is useful for those masks even though its base art did not meet the target.
5. Verify actual torch lighting, mipmaps, texture scale, specular response and long-corridor repetition in E3/E7. This experiment deliberately did not start an engine, browser, or GUI.

## Exact prompts (sent verbatim)

### wall — trial 1

Hand-painted grim dungeon game albedo. Broad angular brush strokes, restrained charcoal and earth palette, severe weathering. Inspired by the material readability of Legend of Grimrock and grim Warcraft environment painting. Subject: old dungeon stone wall, uneven courses of chipped grey masonry, soot-filled mortar and damp grime. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### wall — trial 2

Traditional gouache material study digitised for a dark fantasy game. Layered opaque pigment, dry-brush edge wear, coarse planar value groups, desaturated umber and cold grey. Subject: old dungeon stone wall, uneven courses of chipped grey masonry, soot-filled mortar and damp grime. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### wall — trial 3

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere oppressive medieval horror. Subject: old dungeon stone wall, uneven courses of chipped grey masonry, soot-filled mortar and damp grime. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### floor — trial 1

Hand-painted grim dungeon game albedo. Broad angular brush strokes, restrained charcoal and earth palette, severe weathering. Inspired by the material readability of Legend of Grimrock and grim Warcraft environment painting. Subject: ancient flagstone floor, broad worn irregular slate slabs, chipped edges and filthy joints. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### floor — trial 2

Traditional gouache material study digitised for a dark fantasy game. Layered opaque pigment, dry-brush edge wear, coarse planar value groups, desaturated umber and cold grey. Subject: ancient flagstone floor, broad worn irregular slate slabs, chipped edges and filthy joints. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### floor — trial 3

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere oppressive medieval horror. Subject: ancient flagstone floor, broad worn irregular slate slabs, chipped edges and filthy joints. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### wood — trial 1

Hand-painted grim dungeon game albedo. Broad angular brush strokes, restrained charcoal and earth palette, severe weathering. Inspired by the material readability of Legend of Grimrock and grim Warcraft environment painting. Subject: old wood door planks, vertical split oak boards, splinters, rot and blackened grain. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### wood — trial 2

Traditional gouache material study digitised for a dark fantasy game. Layered opaque pigment, dry-brush edge wear, coarse planar value groups, desaturated umber and cold grey. Subject: old wood door planks, vertical split oak boards, splinters, rot and blackened grain. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### wood — trial 3

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere oppressive medieval horror. Subject: old wood door planks, vertical split oak boards, splinters, rot and blackened grain. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### iron — trial 1

Hand-painted grim dungeon game albedo. Broad angular brush strokes, restrained charcoal and earth palette, severe weathering. Inspired by the material readability of Legend of Grimrock and grim Warcraft environment painting. Subject: rusted iron plate, flaking dark oxide, orange-brown corrosion islands and hammered pits. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### iron — trial 2

Traditional gouache material study digitised for a dark fantasy game. Layered opaque pigment, dry-brush edge wear, coarse planar value groups, desaturated umber and cold grey. Subject: rusted iron plate, flaking dark oxide, orange-brown corrosion islands and hammered pits. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

### iron — trial 3

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere oppressive medieval horror. Subject: rusted iron plate, flaking dark oxide, orange-brown corrosion islands and hammered pits. Single square 1024x1024 seamless repeating material texture, orthographic straight-on surface filling every pixel. Opposite edges must match. Even diffuse illumination; no perspective, no cast shadows, no frame, text, objects, ornaments or vignette. Painted and stylised, not photographic, cute, friendly, polished or toy-like.

