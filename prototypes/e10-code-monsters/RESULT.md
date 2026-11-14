# E10 result: monsters generated in code (first pass)

`src/monster.js` builds skinned, animated monsters at runtime from a body
plan, polyfork-style, but with UVs so painted textures wrap the body.

- Body plans: `biped` (ghoul, brute, cultist) and `crawler` (spider,
  crawler). Archetypes are param sets with seeded variation
  (`ARCHETYPES`, `makeArchetype(name, seed, mats)`).
- Mesh: rings swept along bone chains, skinned to the segment bone with
  blending at joints; caps on ends; cones for claws, teeth and spines;
  glowing eye spheres on the head bone. ~2.3k-3k tris, 17-21 bones.
- Textures: painted tiling textures from the Codex helper
  (`textures/<name>/basecolor|normal|roughness.png`), canvas fallback.
- Animation: procedural, no keyframes: idle, walk, attack (wind-up,
  strike, recover), hit, death.

## Agent self-check

`npm run build && node scripts/shots.mjs` renders every monster alone
from fixed cameras in each state (headless, no window) and writes
`shots/sheet.png` (rows = monsters, columns = states) plus
`shots/info.json` (tris, bones, page errors). This caught three bugs in
the first run: attack swing ending behind the body, spider sinking into
the ground on death, ghoul too thin.

## Verdict so far

- Works and animates; variants are free (seed + params).
- Looks like programmer art: smooth tubes, no silhouette detail (no
  ragged cloth, armour plates, sharp shapes). Readable at grid distance.
- Compare with TRELLIS output from the PC (E5) when it arrives.
- Ideas to raise quality: add "attachments" (armour plates, cloth strips,
  horns, skull helmets) as small rigid meshes on bones, sharper profile
  curves per ring (non-circular cross sections), and painted decals.

Viewer: `npm run dev`, keys 1-5 states, N new seeds, `?arch=ghoul&count=4`.

## Update: quality pass (attachments, lumps, skeleton)

- `lump` option: ring radius varies around and along each chain, so
  bodies read as gnarled flesh instead of smooth pipes.
- Attachments: rigid meshes parented to bones (pauldron plates, helmet,
  hood, horns, blade, round shield, cloth strips, rib cage). Cloth and
  hoods use a double-sided material clone.
- New archetype `skeleton` (bone texture, ribs, helmet, sword, shield).
- Brute: horns, pauldrons, loincloth. Cultist: hood, robe strips, dagger.
- Self-check now frames each monster by its idle-pose height (two bugs
  found while doing this: stale world matrices, and measuring in the
  previous monster's death pose).

Still programmer art next to hand-made or TRELLIS sculpts, but now each
archetype has a readable silhouette and role (shield + sword, hood +
dagger, horns + bulk).
