# Painted dungeon biome pairs

Created 2026-11-13. Eight separate built-in image_gen calls, one per material. No reference images, GUI apps, windows, Blender, engine previews, commits or external downloads. Work products are confined to this biomes directory; image_gen also keeps its own originals in its default generated-images directory.

## Art direction

Uses E4's winning A3 production prompt: graphic chisel marks, simplified detail, crevice accents and sparse worn highlights. The brightness instruction replaces A3's oppressive dark emphasis: broad mid-tone surfaces, mood from hue. Each repeat represents 2 m by 2 m. Wall views are straight-on vertical surfaces; floors are top-down. These are flat albedo previews, not lit engine renders.

## Files and reproduction

Each biome/wall and biome/floor directory contains source.png, basecolor.png, normal.png, roughness.png and preview-3x3.png. Final maps are 1024 x 1024; previews are literal 3072 x 3072 repeats. contact-sheet.png has biome rows and wall/floor columns. prompts.json records exact requests; generation-manifest.json records generated source paths.

Run ../scripts/.venv/bin/python process.py and then ../scripts/.venv/bin/python report.py from this directory to reproduce processing and this report. process.py extracts only function definitions from ../scripts/process.py using AST, so the original script's top-level batch does not run or write outside this directory. Reused functions: read, save, edge, periodic, maps, preview. No app launch helpers are involved.

## Repair and derived maps

Opposite edge values are averaged with the existing quadratic 64-pixel inward feather on both axes. After PNG quantisation, last row and column are copied from first row and column to remove possible one-level rounding differences. All final basecolor, normal and roughness maps have exact matching opposite edges. validation.json records dimensions, edge mean/max errors and luminance statistics from saved files.

Normals reuse the existing wrap-aware Gaussian-smoothed luminance proxy (sigma 2, centred differences times 3), encoded RGB, intended as mild surface detail. Roughness reuses clip(0.9 - smoothed luminance * 0.16). These are heuristic maps, not measured material geometry. Bone colour variations, soot and moss can produce false relief. Treat normals and roughness as linear data and basecolor as sRGB; normalise normals in the shader. Iron is not supplied with a metallic mask, and painted ember colour is not an emission map.

Exact pixel continuity does not guarantee that every mortar line or bone continues naturally across a border. The feather may soften border detail. Tiled previews expose repeated motifs. No in-engine lighting, mipmap or specular evaluation was performed.

## Attempts and verification

One generation attempt per texture; no generation retries. All eight outputs were resized to 1024 x 1024 by the reused read function before repair. Forge and moss received a hue-preserving RGB gain targeting mean luma 112/255 before border repair, because initial forge mean luma was 53.5 (wall) and 72.7 (floor), and moss was 85.1 (wall) and 74.6 (floor). Other materials were unchanged. This is a processing revision, not a generation retry.

| Material    | Mean luma /255 | Median luma /255 | Final edge max /255 (all maps) |
| ----------- | -------------: | ---------------: | -----------------------------: |
| crypt/wall  |          119.2 |            122.4 |                              0 |
| crypt/floor |          119.3 |            122.6 |                              0 |
| forge/wall  |          110.9 |            114.4 |                              0 |
| forge/floor |          111.5 |            113.8 |                              0 |
| moss/wall   |          111.5 |            111.9 |                              0 |
| moss/floor  |          111.3 |            111.5 |                              0 |
| bone/wall   |          109.6 |            109.0 |                              0 |
| bone/floor  |           95.7 |             95.6 |                              0 |

## Visual review notes

The painted marks and hue families are consistent. Crypt carvings and ossuary skull rows repeat recognisably. Moss has diagonal rock groupings that recur across repeats; the floor uses smaller, denser stones than the wall. Forge ember accents are subtle and will not provide light without a separate emission mask. Border repair ensures pixel continuity but cannot guarantee natural continuation of every stone joint.

## Exact prompts

### crypt / wall — attempt 1

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere medieval horror, material readability inspired by Legend of Grimrock. Hand-painted and stylised. NOT dark overall: broad mid-tone surfaces keep dungeon rooms bright; mood comes from hue, dark accents occupy only narrow crevices. Subject: pale cold grey-blue limestone blocks, shallow carved recesses and niche-like relief contained in individual blocks, rubbed edges and bone dust; vertical masonry face, about four to six irregular courses across a 2 metre by 2 metre wall section. Single square 1024x1024 seamless repeating material texture, orthographic straight-on vertical surface filling every pixel. Opposite edges must match, details continue across all borders. Even diffuse illumination; no perspective, no cast shadows, no frame, text, vignette or scene composition. Painted and stylised, not photographic, cute, friendly, polished or toy-like. Output only this single material tile, not a contact sheet.

### crypt / floor — attempt 1

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere medieval horror, material readability inspired by Legend of Grimrock. Hand-painted and stylised. NOT dark overall: broad mid-tone surfaces keep dungeon rooms bright; mood comes from hue, dark accents occupy only narrow crevices. Subject: worn grave slabs of pale cold grey-blue limestone, broad irregular rectangular slabs with faint eroded incisions, bone dust in joints; orthographic top-down ground surface, one repeat covers a 2 metre floor tile. Single square 1024x1024 seamless repeating material texture, orthographic top-down horizontal surface filling every pixel. Opposite edges must match, details continue across all borders. Even diffuse illumination; no perspective, no cast shadows, no frame, text, vignette or scene composition. Painted and stylised, not photographic, cute, friendly, polished or toy-like. Output only this single material tile, not a contact sheet.

### forge / wall — attempt 1

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere medieval horror, material readability inspired by Legend of Grimrock. Hand-painted and stylised. NOT dark overall: broad mid-tone surfaces keep dungeon rooms bright; mood comes from hue, dark accents occupy only narrow crevices. Subject: dark red-brown brick, soot stains and heat-cracked mortar, very sparse hints of muted ember orange in cracks; keep the brick faces readable medium-value terracotta brown rather than near-black; vertical masonry face, six to eight irregular courses in a 2 metre by 2 metre wall section. Single square 1024x1024 seamless repeating material texture, orthographic straight-on vertical surface filling every pixel. Opposite edges must match, details continue across all borders. Even diffuse illumination; no perspective, no cast shadows, no frame, text, vignette or scene composition. Painted and stylised, not photographic, cute, friendly, polished or toy-like. Output only this single material tile, not a contact sheet.

### forge / floor — attempt 1

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere medieval horror, material readability inspired by Legend of Grimrock. Hand-painted and stylised. NOT dark overall: broad mid-tone surfaces keep dungeon rooms bright; mood comes from hue, dark accents occupy only narrow crevices. Subject: iron-plated stone floor, worn broad iron plates set among red-brown stone slabs, ash in joints and sparse subdued rusty orange wear; readable medium-value iron-grey and warm brown; orthographic top-down ground surface, one repeat covers a 2 metre floor tile. Single square 1024x1024 seamless repeating material texture, orthographic top-down horizontal surface filling every pixel. Opposite edges must match, details continue across all borders. Even diffuse illumination; no perspective, no cast shadows, no frame, text, vignette or scene composition. Painted and stylised, not photographic, cute, friendly, polished or toy-like. Output only this single material tile, not a contact sheet.

### moss / wall — attempt 1

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere medieval horror, material readability inspired by Legend of Grimrock. Hand-painted and stylised. NOT dark overall: broad mid-tone surfaces keep dungeon rooms bright; mood comes from hue, dark accents occupy only narrow crevices. Subject: rough cave rock face with olive green moss, small trailing roots and damp cool teal crevices, medium-value grey-green rock planes remain clearly readable; vertical rock face covering 2 metres by 2 metres. Single square 1024x1024 seamless repeating material texture, orthographic straight-on vertical surface filling every pixel. Opposite edges must match, details continue across all borders. Even diffuse illumination; no perspective, no cast shadows, no frame, text, vignette or scene composition. Painted and stylised, not photographic, cute, friendly, polished or toy-like. Output only this single material tile, not a contact sheet.

### moss / floor — attempt 1

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere medieval horror, material readability inspired by Legend of Grimrock. Hand-painted and stylised. NOT dark overall: broad mid-tone surfaces keep dungeon rooms bright; mood comes from hue, dark accents occupy only narrow crevices. Subject: mud and olive green moss over uneven grey-green stones, embedded pebbles and small roots, damp cool teal crevices; medium-value earth and stone; orthographic top-down ground surface, one repeat covers a 2 metre floor tile. Single square 1024x1024 seamless repeating material texture, orthographic top-down horizontal surface filling every pixel. Opposite edges must match, details continue across all borders. Even diffuse illumination; no perspective, no cast shadows, no frame, text, vignette or scene composition. Painted and stylised, not photographic, cute, friendly, polished or toy-like. Output only this single material tile, not a contact sheet.

### bone / wall — attempt 1

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere medieval horror, material readability inspired by Legend of Grimrock. Hand-painted and stylised. NOT dark overall: broad mid-tone surfaces keep dungeon rooms bright; mood comes from hue, dark accents occupy only narrow crevices. Subject: ossuary wall of stacked human skulls and long bones set in warm ochre mortar, yellow-ivory bone with ochre recesses; skulls are realistically proportioned, ancient and austere, no cartoon faces; vertical masonry face covering 2 metres by 2 metres, skulls about life size. Single square 1024x1024 seamless repeating material texture, orthographic straight-on vertical surface filling every pixel. Opposite edges must match, details continue across all borders. Even diffuse illumination; no perspective, no cast shadows, no frame, text, vignette or scene composition. Painted and stylised, not photographic, cute, friendly, polished or toy-like. Output only this single material tile, not a contact sheet.

### bone / floor — attempt 1

Production game texture painted by an environment artist. Graphic chisel marks, deliberately simplified details, high contrast crevice accents, muted midtones, sparse worn highlights. Austere medieval horror, material readability inspired by Legend of Grimrock. Hand-painted and stylised. NOT dark overall: broad mid-tone surfaces keep dungeon rooms bright; mood comes from hue, dark accents occupy only narrow crevices. Subject: packed ochre earth with scattered embedded yellow-ivory bone fragments and small worn stones; restrained bone distribution, fragments lie flat, warm medium-value earth; orthographic top-down ground surface, one repeat covers a 2 metre floor tile. Single square 1024x1024 seamless repeating material texture, orthographic top-down horizontal surface filling every pixel. Opposite edges must match, details continue across all borders. Even diffuse illumination; no perspective, no cast shadows, no frame, text, vignette or scene composition. Painted and stylised, not photographic, cute, friendly, polished or toy-like. Output only this single material tile, not a contact sheet.
