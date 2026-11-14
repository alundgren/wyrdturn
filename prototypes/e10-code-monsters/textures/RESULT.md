# E10 creature textures

Created 2026-11-13 with six independent built-in image_gen calls. No commits, GUI applications, browser windows, or engine previews. All authored files are within this textures directory; generator originals were automatically saved by the tool and copied here. No delegates were launched.

## Deliverables

Each of ghoul-skin, bone, chitin, rusty-armour, leather-cloth and scales contains:

- `basecolor.png`: 1024×1024 RGB, use sRGB.
- `normal.png`: 1024×1024 RGB tangent normal, positive Y/OpenGL convention; use as linear data.
- `roughness.png`: 1024×1024 grayscale, white means rough; use as linear data.
- `preview-3x3.png`: literal 3072×3072 repeat without lines masking borders.
- `offset-preview.png`: half-tile offset inspection image.
- `generated.png`: untouched generator output (1254×1254), retained for provenance.

`contact-sheet.png` is a labelled 1800×1380 overview with a true 3×3 repeat per material. `prompts.json` records the exact inputs; `generation-manifest.json` maps each material to its tool source.

## Processing and checks

Adapted E4's scripts/process.py: reuse its exact periodic() function by extracting only that function, avoiding the original batch's writes outside this folder. Lanczos resize to 1024 square; average opposite edges and feather the correction inward over 64 pixels with quadratic weights, separately on both axes. This is the edge-blend repair described in E4, plus a 512-pixel offset inspection image. It is not a whole-tile mirror. Border correction may soften details and cannot invent missing continuations of plates, wrinkles or cracks.

Normal height is Rec.709 weighted luminance, Gaussian sigma 2 with wrap sampling. Central differences times 2 provide mild relief; normal vector is (-dx,+dy,1), then normalised. Edge-correct and renormalise before encoding. Roughness is a material-specific baseline plus (0.5 minus blurred luminance) times 0.12, clipped to 0.5–0.98. Baselines: skin 0.80, bone 0.88, chitin 0.68, iron 0.82, leather/cloth 0.94, scales 0.75. These are heuristic maps derived from colour, not measured surface geometry or physical roughness. Veins and stains can create false relief; keep normal intensity modest in the engine. No metallic map is supplied.

Ran the inspected Pillow/NumPy/SciPy processing script without desktop effects. Assertions verify all 18 final maps are 1024 square and both pairs of opposite edges are pixel-identical. Raw average edge errors were 4.14–9.27 levels out of 255; final errors are zero. Per-material metrics are in validation.json. Viewed the contact sheet through file-image inspection without launching an app.

## Art review and retries

One generation per material; no retries and no cute or friendly outputs. All six original images needed numeric border repair. Skin has readable veins and blotches; bone is a broad yellowed surface with finer cracks. Chitin uses plum-brown overlapping plates; iron has rusty riveted divisions; leather combines torn strips with exposed rough weave; scales use a slate-blue overlapping pattern. Chitin and leather are the darkest materials, as requested for their surface colours, and should be checked under prototype lighting.

The set has visible repeating motifs, particularly iron divisions and the directional rows of scales/wraps. Painted edge accents and crevice tones remain despite the no-shadow prompt; these are not perfectly lighting-neutral PBR albedos. Numeric continuity does not guarantee uninterrupted material structure. No in-engine lighting, UV scale or distance readability test was run because the task prohibits GUI apps. Review the supplied full-resolution repeats when choosing creature UV scale.

## Reproduce derived assets

Run from `prototypes/`:

```sh
e4-textures/scripts/.venv/bin/python e10-code-monsters/textures/process.py
```

Uses E4's existing Pillow/NumPy/SciPy environment. Generator seeds/model version were not exposed, so regeneration from prompts is not pixel-reproducible.

## Exact prompts

### ghoul-skin

Production game base colour texture painted by an environment artist for a grid-based first-person fantasy dungeon crawler. Hand-painted stylised material readability inspired by Legend of Grimrock and Warcraft painting. Broad deliberate brush marks, simplified details readable at game distance, clear material forms, rich muted colour variation. Grim and austere but NOT dark overall: predominantly mid-tone values, sparse dark crevice accents and restrained painted edge wear. Subject: Pale grey-green diseased creature skin, branching muted veins, irregular ochre and violet blotches, broad wrinkles. Continuous skin surface, no anatomy or body parts. Single seamless tileable 1024x1024 square texture; straight-on orthographic surface filling every pixel, equal-scale details across all borders, opposite edges must match. Flat even diffuse light, no directional lighting, no cast shadows or baked ambient occlusion, no perspective, no objects, no background, no vignette, no border, no text. Not cute, friendly, cartoon characters, glossy 3D render, or photorealistic.

### bone

Production game base colour texture painted by an environment artist for a grid-based first-person fantasy dungeon crawler. Hand-painted stylised material readability inspired by Legend of Grimrock and Warcraft painting. Broad deliberate brush marks, simplified details readable at game distance, clear material forms, rich muted colour variation. Grim and austere but NOT dark overall: predominantly mid-tone values, sparse dark crevice accents and restrained painted edge wear. Subject: Old yellowed bone surface, ivory and ochre midtones, sparse branching cracks and ingrained grime. Continuous bone material, no skeletons or individual bones. Single seamless tileable 1024x1024 square texture; straight-on orthographic surface filling every pixel, equal-scale details across all borders, opposite edges must match. Flat even diffuse light, no directional lighting, no cast shadows or baked ambient occlusion, no perspective, no objects, no background, no vignette, no border, no text. Not cute, friendly, cartoon characters, glossy 3D render, or photorealistic.

### chitin

Production game base colour texture painted by an environment artist for a grid-based first-person fantasy dungeon crawler. Hand-painted stylised material readability inspired by Legend of Grimrock and Warcraft painting. Broad deliberate brush marks, simplified details readable at game distance, clear material forms, rich muted colour variation. Grim and austere but NOT dark overall: predominantly mid-tone values, sparse dark crevice accents and restrained painted edge wear. Subject: Dark brown-purple insect carapace plates with lighter worn edges, broad irregular overlapping plates, plum and umber colour variation. Keep the dark material readable in lifted midtones. Single seamless tileable 1024x1024 square texture; straight-on orthographic surface filling every pixel, equal-scale details across all borders, opposite edges must match. Flat even diffuse light, no directional lighting, no cast shadows or baked ambient occlusion, no perspective, no objects, no background, no vignette, no border, no text. Not cute, friendly, cartoon characters, glossy 3D render, or photorealistic.

### rusty-armour

Production game base colour texture painted by an environment artist for a grid-based first-person fantasy dungeon crawler. Hand-painted stylised material readability inspired by Legend of Grimrock and Warcraft painting. Broad deliberate brush marks, simplified details readable at game distance, clear material forms, rich muted colour variation. Grim and austere but NOT dark overall: predominantly mid-tone values, sparse dark crevice accents and restrained painted edge wear. Subject: Dented iron plates with rust and small rivets, irregular broad plate divisions, cool grey iron and burnt orange corrosion. Continuous armour material, no armour object or silhouette. Single seamless tileable 1024x1024 square texture; straight-on orthographic surface filling every pixel, equal-scale details across all borders, opposite edges must match. Flat even diffuse light, no directional lighting, no cast shadows or baked ambient occlusion, no perspective, no objects, no background, no vignette, no border, no text. Not cute, friendly, cartoon characters, glossy 3D render, or photorealistic.

### leather-cloth

Production game base colour texture painted by an environment artist for a grid-based first-person fantasy dungeon crawler. Hand-painted stylised material readability inspired by Legend of Grimrock and Warcraft painting. Broad deliberate brush marks, simplified details readable at game distance, clear material forms, rich muted colour variation. Grim and austere but NOT dark overall: predominantly mid-tone values, sparse dark crevice accents and restrained painted edge wear. Subject: Torn dark leather and rough cloth wrap, broad overlapping weathered strips, frayed edges and coarse weave, muted umber and dusty taupe midtones. Continuous wrapping material, no garment or object. Single seamless tileable 1024x1024 square texture; straight-on orthographic surface filling every pixel, equal-scale details across all borders, opposite edges must match. Flat even diffuse light, no directional lighting, no cast shadows or baked ambient occlusion, no perspective, no objects, no background, no vignette, no border, no text. Not cute, friendly, cartoon characters, glossy 3D render, or photorealistic.

### scales

Production game base colour texture painted by an environment artist for a grid-based first-person fantasy dungeon crawler. Hand-painted stylised material readability inspired by Legend of Grimrock and Warcraft painting. Broad deliberate brush marks, simplified details readable at game distance, clear material forms, rich muted colour variation. Grim and austere but NOT dark overall: predominantly mid-tone values, sparse dark crevice accents and restrained painted edge wear. Subject: Grey-blue reptile scales, broad irregular interlocking scales, slate blue and muted teal variations with worn lighter edges. Continuous hide, no creature or body parts. Single seamless tileable 1024x1024 square texture; straight-on orthographic surface filling every pixel, equal-scale details across all borders, opposite edges must match. Flat even diffuse light, no directional lighting, no cast shadows or baked ambient occlusion, no perspective, no objects, no background, no vignette, no border, no text. Not cute, friendly, cartoon characters, glossy 3D render, or photorealistic.
