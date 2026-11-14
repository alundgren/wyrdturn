# E2 result: modular dungeon kit from Blender

**Works.** One Python script builds the whole kit in headless Blender
(`-b`, no window) and exports one GLB. The three.js scene (copied from
E3, "moody" look) now builds the level from kit pieces instead of boxes.

## Kit (`out/kit.glb`, 149 KB, built by `blender/build_kit.py`)

| Piece                   | Tris    | Used for                                                                |
| ----------------------- | ------- | ----------------------------------------------------------------------- |
| kit_wall                | 764     | wall face on a tile edge, with plinth and cornice, slightly uneven face |
| kit_corner              | 324     | column where walls meet (hides corner seams)                            |
| kit_floor / kit_ceiling | 12 each | one tile                                                                |
| kit_beam                | 108     | wooden ceiling beam, every other tile                                   |
| kit_doorway             | 88      | stone partition with round-arched opening (boolean cut)                 |
| kit_doorframe           | 324     | wooden posts and lintel in the opening                                  |
| kit_sconce              | 492     | iron torch holder; flame and light added in code                        |

Rebuild:

```
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python blender/build_kit.py -- "$PWD/out/kit.glb" && cp out/kit.glb public/
```

## How it fits together

- Walls sit on tile edges (thin walls), not as whole solid tiles.
- Columns go on every grid corner where wall edges meet, except straight runs.
- UVs are world-space box projection at 1 texture per 2 m, so all pieces
  share texel density and the E4 textures line up across pieces.
- Materials are swapped by name (wall, floor, wood, iron) in three.js.
  This is the hook for cheap variants later: same kit, other textures.

## What I learned

- Blender MCP was not needed. A plain bpy script run headless is
  repeatable and an agent can rerun it after every tweak. Took ~30 min
  including placement code.
- Same stone on columns and walls looked like see-through stripes.
  Columns now use smaller, lighter stone (`trimMat`).
- Pillar ('P') is still a code cylinder.

## Screenshots

`shots/` (`LOOKS=moody vp run shots`). Real-GPU fps not measured on this
version yet; piece count went up (~300 meshes, no instancing yet). If it
drops, merge static pieces or use InstancedMesh per piece.
