# E1 grid camera, Godot version: result

## Godot version

Godot 4.7.2 stable (`4.7.2.stable.official.ed1daf0bf`), official macOS
universal build from GitHub releases. SHA-512 checked against the release's
`SHA512-SUMS.txt`. It lives in `../../tools/godot-4.7.2/Godot.app`
(the `tools/` folder is gitignored with `*`). It is not in `/Applications`.

GDScript, Forward+ renderer (`project.godot`).

## Files

| File | What it does |
| --- | --- |
| `project.godot`, `main.tscn` | Project and a one-node main scene. Everything else is built in code. |
| `maps/test01.txt` | Copy of `../maps/test01.txt`. |
| `scripts/dungeon_map.gd` | Pure map parser: tiles, start, `is_walkable`. |
| `scripts/grid_mover.gd` | Pure movement logic: position, facing, `can_move`, `apply`, one-slot input buffer (`submit` / `finish_action`). No nodes. |
| `scripts/main.gd` | Visuals: grey boxes, camera, torch light, key input, tweens. |
| `tests/run_tests.gd` | Headless tests. |

Why the map is copied in: Godot can only see files under the project folder
through `res://`. Reading `../maps/test01.txt` would need an absolute OS path
and would break if the game were ever exported. The copy is a plain `cp`. If
the shared map changes, copy it again:
`cp ../maps/test01.txt maps/test01.txt`.

## What works

- Map loads from the text file. Wall tiles and outside tiles are 2 x 3 x 2 m
  boxes. Floor and ceiling are a 2 m plane per open tile. The pillar is a thin
  cylinder (radius 0.22 m). The door is two posts and a lintel, turned to
  match the passage direction.
- Camera at 1.6 m eye height, starts on `S` facing north.
- W/S or Up/Down step forward/back. A/D strafe. Q/E or Left/Right turn 90
  degrees.
- Step tween 180 ms, turn tween 150 ms (sine ease). Walking into a wall or the
  pillar does a 140 ms nudge of 0.25 m and back, no move.
- Input during a tween goes into a one-slot buffer. If you press several keys
  during one tween, the newest one wins. Holding a move key repeats steps
  (key echo fills the buffer). Holding a turn key does not spin.
- The grid state changes right away when a command is accepted. The tween
  only shows it. So the logic never waits on the visuals.
- One warm OmniLight (colour 1.0/0.68/0.38, range 9 m, shadows on) on the
  camera, plus a very dim blue-grey ambient so far walls are not pure black.

Not checked: how it looks and feels. Headless Godot does not render, so there
are no screenshots. The human needs to run the play command below.

## Test command and output

From `prototypes/e1-grid-godot/`:

```sh
../../tools/godot-4.7.2/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```

Output (exit code 0):

```
Godot Engine v4.7.2.stable.official.ed1daf0bf - https://godotengine.org

Unit tests (pure logic)
  ok   map file loads
  ok   map is 10x10 (got 10x10)
  ok   outside the map is not walkable
  ok   start position is S at (2,8) (got (2, 8))
  ok   start facing is north
  ok   wall south of start blocks BACK
  ok   bumping a wall does not move
  ok   forward into floor moves to (2,7)
  ok   left from north wraps to west
  ok   right from west wraps to north
  ok   four right turns return to north
  ok   five left turns end at west
  ok   strafe left moves west, keeps facing
  ok   strafe right while facing east is blocked by wall
  ok   map has door at (5,3)
  ok   door tile is walkable
  ok   walk through door to (6,3)
  ok   map has pillar at (7,5)
  ok   pillar blocks
  ok   bump into pillar, no move
  ok   first input starts an action
  ok   input during action is buffered, not run
  ok   buffer holds one input, newest wins
  ok   buffered input has not changed state yet
  ok   finishing runs the buffered turn
  ok   still busy while buffered action animates; buffer empty
  ok   finishing with empty buffer goes idle
  ok   idle mover accepts input again
Integration test (main scene, headless, no rendering)
  ok   camera starts at S, eye height 1.6 (got (4.0, 1.6, 16.0))
  ok   W stepped camera one tile north (got (4.0, 1.6, 14.0))
  ok   buffered E turned camera to east (yaw -1.571)
  ok   Up arrow stepped east (got (6.0, 1.6, 14.0))
  ok   one OmniLight on the camera
33 checks, 0 failures
```

The integration part loads `main.tscn`, sends real key events, and lets the
tweens run frame by frame. So it also checks that the buffered key is played
after the step ends.

Failure check: I broke one check on purpose in a temporary copy. It printed
`FAIL` and exited with code 1. The copy was deleted.

Also ran the main scene alone for 120 frames with no errors:
`Godot --headless --path . --quit-after 120`.

## Time and friction

- Total: about 10 minutes of wall-clock time, including the 170 MB download.
- Download: easy. `gh api .../releases/latest` gave the asset URL, then
  `curl` and `unzip`. No quarantine prompt because it came from `curl`, not a
  browser.
- No `timeout` command on this Mac. I used `perl -e 'alarm 60; exec @ARGV'`
  as a guard in case Godot hung. It never did.
- Import step: not needed. There are no textures or models, so a fresh
  project ran straight away and did not even create a `.godot/` folder. Once
  E2 adds glTF files, the agent will need to run
  `Godot --headless --path . --import` first.
- I avoided `class_name` and used `preload(...)` instead. `class_name` needs
  the global class cache that the editor or the import step writes. Without
  it, a fresh `--script` run may not find the class names.
- GDScript errors: none. Tests passed on the first run.
- Headless limits: no rendering at all, so no screenshots. Light, materials,
  and feel can only be judged by a human running it, or by a later setup with
  a real (isolated) display.

## How easy for an agent

Very easy for logic and tests. Godot's headless mode plus `--script` gives a
fast test loop with a real scene tree, real input events, and real tweens.
Building the scene in code, not in `.tscn` files, keeps it all in plain text
that an agent can read and edit safely.

The weak point is visuals. An agent cannot see what it built here. That
matters for E3 (lighting) and anything about look and feel.

## Play it (human only, opens a window)

From `prototypes/e1-grid-godot/`:

```sh
../../tools/godot-4.7.2/Godot.app/Contents/MacOS/Godot --path .
```

Open it in the editor instead:

```sh
../../tools/godot-4.7.2/Godot.app/Contents/MacOS/Godot --path . -e
```

## Other

The Three.js version is being built in parallel in `../e1-grid-threejs` by
someone else. I did not touch it.
