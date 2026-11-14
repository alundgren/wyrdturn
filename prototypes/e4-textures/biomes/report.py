from pathlib import Path
import json
R=Path(__file__).resolve().parent
prompts=json.loads((R/'prompts.json').read_text())
metrics=json.loads((R/'validation.json').read_text())
text='''# Painted dungeon biome pairs

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

| Material | Mean luma /255 | Median luma /255 | Final edge max /255 (all maps) |
| --- | ---: | ---: | ---: |
'''
for key,m in metrics.items():text+=f"| {key} | {m['basecolor_luminance_mean_255']:.1f} | {m['basecolor_luminance_percentiles_255'][1]:.1f} | 0 |\n"
text+='\n## Visual review notes\n\nThe painted marks and hue families are consistent. Crypt carvings and ossuary skull rows repeat recognisably. Moss has diagonal rock groupings that recur across repeats; the floor uses smaller, denser stones than the wall. Forge ember accents are subtle and will not provide light without a separate emission mask. Border repair ensures pixel continuity but cannot guarantee natural continuation of every stone joint.\n\n## Exact prompts\n'
for p in prompts:text+=f"\n### {p['biome']} / {p['kind']} — attempt 1\n\n{p['prompt']}\n"
(R/'RESULT.md').write_text(text)
