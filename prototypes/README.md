# Prototypes

One folder per experiment. Each has a `RESULT.md`; verdicts go into
[../design/direction.md](../design/direction.md).

All web prototypes share one install at the repo root (pnpm workspace):

```sh
vp install             # at the repo root
vp run validate        # at the repo root: format, lint, types, builds, tests, sims
cd prototypes/e11-combat && vp dev
```

Shared: `maps/test01.txt` and `maps/test02.txt` (format in their headers).
Coordinates: x = column (east is +x), y = row (south is +y). North = row - 1.
Tile size 2 m, wall height 3 m, eye height 1.6 m.

## Folders

| Folder                         | What                                                                   |
| ------------------------------ | ---------------------------------------------------------------------- |
| e1-grid-threejs, e1-grid-godot | grid movement in both engines                                          |
| e2-kit                         | Blender-scripted modular wall kit                                      |
| e3-lighting                    | lighting looks                                                         |
| e4-textures                    | painted textures; the source images stay local                         |
| e8-outdoor                     | courtyard: sky, sun and moon, grass, fountain                          |
| e9-polyfork                    | notes on borrowed rigged monsters (files local only, never commit)     |
| e10-code-monsters              | monsters generated in code, painted, animated                          |
| e11-combat                     | the playable slice: rules, game, level, skill and encounter generators |
| e12-asset-gate                 | GLB checker, simplify and bake for generated models, picture sheets    |

## Headless checks

Browser checks need Playwright's headless shell
(`vp exec playwright-core install chromium-headless-shell`) and never open a
window. Run them from the prototype's folder.

| Check                                | Where | Command                                                                  |
| ------------------------------------ | ----- | ------------------------------------------------------------------------ |
| Rules tests                          | e11   | `vp test`                                                                |
| Balance bots                         | e11   | `node scripts/sim.mjs 200 smart` / `GEN=1 node scripts/sim.mjs 40 smart` |
| Skill lab                            | e11   | `node scripts/skilllab.mjs 16 16`                                        |
| Director eval                        | e11   | `node scripts/director-eval.mjs 30`                                      |
| Descent run sim                      | e11   | `node scripts/descent-sim.mjs 40 smart`                                  |
| Descent flow (browser)               | e11   | `node scripts/shots-descent.mjs`                                         |
| Quick-key input (turn during a move) | e11   | `vp build && node scripts/check-input.mjs`                               |
| Playthrough screenshots              | e11   | `vp build && node scripts/shots-game.mjs`                                |
| Visual diff vs baseline              | e11   | `node scripts/visual-diff.mjs` (`approve` sets the local baseline)       |
| Generated level shots                | e11   | `node scripts/shots-gen.mjs 1 2 3`                                       |
| Draw-call budget                     | e11   | `node scripts/bench.mjs [seed]`                                          |
| Frame time on the real GPU           | e11   | `GPU=1 node scripts/bench.mjs [seed]` (add `UNCAPPED=1` for headroom)    |
| Monster sheet                        | e10   | `vp build && node scripts/shots.mjs`                                     |
| Asset gate                           | e12   | `vp build && node scripts/gate.mjs --profile prop file.glb`              |
| TRELLIS prep (simplify, bake, gate)  | e12   | `sh scripts/prep-all.sh` (raw files in `local/trellis-raw`)              |

The playwright scripts look for the headless shell in the macOS Playwright
cache (`~/Library/Caches/ms-playwright`).
