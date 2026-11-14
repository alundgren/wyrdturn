# E11 result: playable combat slice "Ember Scout"

Design from `research/combat-progression.md` (Recommendation): one hero,
strict turns on the grid, enemies show their next action, 8 skills from a
small rules vocabulary (Physical/Fire/Frost, Burn, Chill, Block), 3 enemy
roles, a reward after each room and a tiny meta unlock.

## Play it

```
cd prototypes/e11-combat
vp dev
```

Open the URL. 1/2 pick a start, W/A/S/D move (1 turn in combat), Q/E
turn (free), 1-4 skills, Space wait, G tuning panel. Walk east into the
rooms. Meta progress is saved in the browser (`ember-scout-meta-v1`).

## What is in it

- `src/combat.js`: all rules, pure JS (no three.js). Skills, enemies,
  relics and presets are data tables. Same code for game, tests and sim.
- `src/rooms.json` + `src/slice.txt`: 4 rooms (Ghoul; Ghoul + Cultist
  archer; Brute warden; Brute + Cultist).
- `src/game.js`: input, E10 code monsters as enemies (walk/attack/hit/
  death animations), red floor markers for announced attacks (orange for
  wind-ups), labels with HP, Burn/Chill and intent, skill bar with live
  damage preview from the same rules, minimap with threats, log,
  "your tile will be hit" warning, door bars while locked in, reward /
  start / end screens.
- E2 kit dungeon + bright lighting from E8.

## Agent self-checks

| Check                   | Command                                                   | What it catches                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules tests             | `vp test`                                                 | 11 acceptance scenarios from the research (wait = one enemy phase, free turning, dodging a locked attack, cooldowns, Burn/Chill timing, unique occupancy, meta unlock) |
| Balance sim             | `node scripts/sim.mjs 200 smart 2 4` and `... 1000 naive` | 2-ply lookahead bot and a naive bot play seeded runs; win rate, HP left, where runs end, stalemates                                                                    |
| Playthrough screenshots | `vp build && node scripts/shots-game.mjs`                 | Scripted run in headless Chromium: start, room 1, attack intent, fight, reward, room 2; contact sheet `shots/game-sheet.png`, page errors in `shots/game-check.json`   |

The sim found two real rule bugs on its first runs:

1. Enemies stepped toward where the hero _was_; a hero walking along a
   wall was trailed diagonally forever. Moves are now announced as
   "Moves" but planned at execution time toward the hero's current tile.
2. Archers only checked row/column alignment, not line of sight, and
   bounced between two tiles behind a pillar.

The screenshot check found one readability bug: an attack on the hero's
own tile is invisible in first person (the marker is under the camera),
so there is now a red banner + pulsing screen edge.

## Balance today (2026-11-14, numbers are a starting point)

| Bot                          | Ember Scout                         | Frost Scout                                              |
| ---------------------------- | ----------------------------------- | -------------------------------------------------------- |
| Smart (2-ply)                | 100% wins, ~20/30 HP left, 19 turns | 46% wins, ~6 HP left; rest stalemate at low HP vs archer |
| Naive (hit what is in front) | 0% wins, always dies in room 4      | 0%, dies in rooms 3-4                                    |

Reading: good play wins comfortably with Ember, Frost is much harder
(no ranged damage-over-time). Rooms 3-4 (Brute) punish players who don't
dodge wind-ups. Real players sit between the bots. Combat is fully
deterministic (only rewards use the seed).

## Open design questions

- Dodging is free, so a careful player can stall forever against a lone
  melee enemy, and low-HP players stalemate archers. Options: a soft
  enrage after N turns, rooms that always mix ranged + melee, or a small
  reward for fast clears.
- Frost Scout needs a damage source or the Frost Ward earlier.
- Monsters stand on the next tile and fill the screen; consider placing
  them a bit back from the tile centre or lowering the camera FOV.

## Update: generated levels (`src/levelgen.js`)

Seeded generator producing the same data as the hand-made slice (map
text + rooms with enemies), so rules, game and sim work unchanged.
Play one: `vp dev`, then open `/?gen=7` (any number).

- Rooms placed with 2-tile gaps, connected by a spanning tree + 1 loop,
  L-shaped corridors with single-tile doors. Start = leaf room, end =
  deepest room. Encounters bought from a budget that grows with depth
  (chaser 2, archer 3, warden 4; no warden at depth 1; archers need room
  length >= 4; end room +2). Pillars for cover in bigger rooms.
- `validate()`: start exists, all floor reachable, borders closed, every
  room has a door, spawns on floor, unique, >= 3 steps from doors, >= 3
  combat rooms. Layouts with accidental doors or corridors through rooms
  are rejected and retried.
- 1000 seeds: 0 failures, 9.5 attempts on average (max 83).
- One torch per combat room plus hashed extras; shadows on the first 6.

| Check                                               | Command                                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Generator over many seeds + bot difficulty per seed | `GEN=1 PER_SEED=1 node scripts/sim.mjs 40 smart 2 4`                                                              |
| Screenshot each combat room of given seeds          | `vp build && node scripts/shots-gen.mjs 1 2 3` -> `shots/gen-sheet.png`, `shots/gen-report.json` (ASCII + checks) |

Bot results on generated levels (seeds 1-40 smart, 1-200 naive):

| Bot   | Ember                  | Frost                |
| ----- | ---------------------- | -------------------- |
| Smart | 77.5% wins, ~8 HP left | 35% wins, ~4 HP left |
| Naive | 0%, dies in rooms 2-4  | 0%                   |

Generated levels give a better difficulty curve than the hand-made
slice (where the smart bot always won with Ember).

## Update: generated skills + skill lab (`src/skillgen.js`, `scripts/skilllab.mjs`)

Skills are generated only from ops the engine already runs: element
(fire/frost/physical) + target (adjacent, ray 3, arc, burning-within-3,
self) + primary effect (damage or block) + rider (Burn, Chill, push,
Chill adjacent). A power formula sets the cooldown
(`cooldown = round((power - 5) / 2.5)`, Strike = 5 power = free).
`validateSkill` rejects unknown ops, elemental names without an
elemental effect, and skills that are just a worse Strike/Guard.

The skill lab gives each generated skill to the smart bot (slot 4,
replacing Frost Dart) on 16 generated levels and compares with the
baseline kit and with "no 4th skill". `node scripts/skilllab.mjs 16 16`
(~18 s). Output also in `shots/skilllab.json`.

Three passes, each driven by the lab's flags:

1. Arc skills too strong, 3 "useless" skills (worse Strike/Guard), fire
   "wards" that were just Block with a fire name.
2. Arc price 1.6 -> 2.0, elemental riders required, redundancy rules:
   no useless skills left; arc and a chill ray still too strong.
3. Arc 2.4, Chill value 2.5 -> 3.5: 1 of 16 flagged too strong
   (Glacial Shard: 6 Frost ray + Chill; its combo with Ember Bolt is not
   captured by additive pricing; exactly what the lab is for).

Caveat: 16 levels per skill is noisy (baseline moved 31% -> 44% between
runs because the bot breaks ties randomly). Use more levels or a seeded
tie-break before trusting small differences.

## Update: room themes (colour and mood per place)

Rooms carry a `theme` (crypt, forge, moss, bone or none). A theme tints
the stone (cloned wall/floor/ceiling materials), the base light and
bounce colour, the haze, and the torch light + flame colour. The light
fades smoothly when the hero walks between rooms. The slice uses
moss / crypt / forge / bone for rooms 1-4; the generator picks themes
per room (start room plain). Data-only, so a game master can choose them.
Shots: `shots/game-06-room2.png` (crypt), `shots/gen-sheet.png`.

## Update: performance route + static batching

`?bench=1` visits fixed spots and records frame time (avg, p95), draw
calls and triangles per spot (whole frame incl. post passes;
`renderer.info.autoReset = false`). In your browser it gives real fps;
`node scripts/bench.mjs [genSeed]` runs it headless and checks the
draw-call / triangle budget (450 calls, 400k tris, first guesses).

The first headless run found generated levels at up to **1041 draw
calls** per view (every kit piece was its own mesh). Fixes:

- merge static kit meshes per material per 12 m chunk (`?nobatch` to
  compare), camera far plane 30 m (fog hides it anyway);
- result: slice 265 -> 79 calls, generated seed 2: 1041 -> ~207 calls,
  ~285k tris (GTAO renders the scene twice, so tris are doubled).

The batching first deleted the torch lights (a sconce is a mesh with the
flame + light as children). A side-by-side screenshot (`?nobatch` vs
batched) caught it; fixed by re-attaching child lights before removal.
This is why we want automatic image diffs (next).

## Update: visual regression check (research priority #1)

`node scripts/visual-diff.mjs approve` saves the current `shots/game-*`
as the baseline; `node scripts/visual-diff.mjs` compares a new run:
changed-pixel fraction (pixelmatch, threshold 0.12), mean brightness
change, heat maps in `shots/diff/`. Flags CHANGED (> 2% pixels) and
DARKER/BRIGHTER (> 8%). Exit code 1 when anything is flagged.

To make captures repeatable: fixed game seed in the playthrough
(`newGame('ember', 4242)`) and a frozen clock while capturing
(`window.__freeze`), so monster poses, torch flicker and film grain are
identical. Same build twice: all images "same" (max 1.4%).

Proof: re-introducing the torch-light bug flagged 4 of 6 images as
CHANGED+DARKER (-15% to -21% brightness), the same bug I first found by
eye.

## Update: deterministic director (research priority #11, first half)

`src/director.js`: engine state -> compact observation (HP ratio, damage
and turns in the last room, skills, relic) -> smoothed pressure score ->
proposer returns a data command `{ type: 'chooseEncounter', roomId,
enemies: [catalog ids], budget, reason }` -> validator (current room,
known ids, max 3 enemies, budget within +-3 of the authored budget) ->
placement with the generator's spawn rules -> apply, else fall back to
the authored encounter. Hooked into `checkRoomEntry` via `run.director`.
The proposer is a plain function, so an LLM adapter can replace it
without touching the engine.

`node scripts/director-eval.mjs 30` (same 30 generated levels):

| Bot   | Director off          | Director on           |
| ----- | --------------------- | --------------------- |
| Smart | 70% wins, 5.9 HP left | 77% wins, 7.1 HP left |
| Naive | 0%                    | 0%                    |

Bad proposals (unknown "dragon", 4 wardens, wrong room, unknown command):
24/24 rejected, game continued with the authored encounter, no crash.

Honest read: the plumbing and the safety net work; the pressure ->
budget mapping barely changes outcomes yet (the bot's HP after a room is
a weak signal, and +-2 budget is small). Next: tune target and shift
range with the sim, add "recovery" options (heal shrine, easier room)
instead of only budget changes, then try an LLM proposer behind the
same validator.

## Update: lock and key (research priority #4, first recipe)

Generated levels now lock every door of the deepest room with a gilded
gate (`L`) and hide an Iron Key (`K`) in the deepest other combat room,
preferring a branch off the start-to-end path, so the player has to
explore. Rules: gates block until the hero has the key; stepping on the
key takes it. Validation is state-aware: the key must be reachable with
all gates closed (a plain flood fill would accept a key locked behind
its own gate; there is a test for exactly that). 1000 seeds, 0 failures.
The bot fetches the key first: smart Ember wins 90% on seeds 1-40.
Visuals: rising gilded gate, spinning glowing key, gold on the minimap,
"Iron Key" in the hero panel. Shots: `shots/gen-3-key.png`,
`shots/gen-3-gate.png`. Tests: 14 pass.

## Update: anti-stall and Frost Scout tuning

- **Enrage + Dread** (data in `RULES`): after 12 turns in a room enemies
  get +1 damage every 4 turns ("Enraged +N" on labels); from enrage 2
  the room drains 1 HP per turn. Enrage alone did not stop stalling (a
  hero who is never hit doesn't care about damage); the Dread clock did.
  Stuck runs: Frost 53/100 -> 0, generated levels 4-13/40 -> 0; average
  turns per run on generated levels 114-310 -> 33-37.
- **Frost Scout** kit tested with the smart bot on 40 generated levels:
  Bash 38%, Cleave 63%, Frost Ward 70% (Ember reference 78%). Kit is now
  Strike, Guard, Frost Dart, Frost Ward: close in difficulty, different
  play style (defensive, chill) from Ember (burn damage).

## Update: TRELLIS monsters and props in the game

Default now: Ghoul = TRELLIS Pixal3D ghoul, Warden = TRELLIS skeleton
warrior (both auto-rigged at runtime), Cultist archer stays a code
monster. `?monsters=code` switches back to code monsters only. Rooms get
a lit TRELLIS brazier in a free corner (max 4 brazier lights), bone
piles, and a chest next to the key. Bench still in budget (generated
seed 3: 193 calls). Visual baseline re-approved for the new look.

## Update: rest shrine, Lurker, label fix

- **Rest shrine** (`H`): the generator turns the cheapest middle-depth
  combat room into a safe crypt room with a shrine (TRELLIS brazier with
  a cold flame). Stepping on it heals 12 once. Validator counts it as
  floor; 1000/1000 levels have one. Bot detours to it when down 8+ HP.
- **Lurker** (4th enemy role, cost 3, depth 2+): 8 HP, 5 damage, moves 2
  tiles per turn so you can't outpace it. Uses the TRELLIS spider with
  whole-body motion (no rig). ~1.8 per generated level.
- Smart bot on generated levels now: Ember 85%, Frost 80% (shrine helps;
  the 2-ply bot sees every intent, so humans will find it harder).
- Labels: hidden for dead enemies and anything behind the camera (the
  generated-level screenshots showed floating labels with no monster).
- 15 tests pass; visual diff vs baseline: no changes.

## Update: Descent mode (a real run loop)

Start screen default is now **Descent**: 3 generated floors (D toggles
the hand-made training slice). Clear every room of a floor (key, gate,
shrine on each) and a stair takes you down; HP, skills, upgrades and
relic carry over (sessionStorage, the page reloads with the next
`?gen=&floor=`). Deeper floors: bigger room budgets (+1.5 per floor) and
one more room. Meta tracks best floor.

Checks:

- `node scripts/descent-sim.mjs 40 smart`: smart bot clears all 3
  floors in 63% (Ember) / 73% (Frost); HP after floor 1 ~11-12.
- `vp build && node scripts/shots-descent.mjs`: headless browser
  starts a Descent, descends twice, asserts HP/upgrade/relic carried,
  screenshots each floor. All ok, no page errors.

## Update: first-person sword and casting hand

A code-built sword (steel blade, wood grip) is parented to the camera:
idle bob, slash for Strike/Bash/Cleave, raised block for Guard, and a
glowing orb + light in the off hand for spells (element colour). The
screenshot check found two bugs before you saw them: the swing used the
real clock while captures freeze it (no pose showed), and the first
sword was huge and blown out white next to the lantern.
Placeholder art: a TRELLIS or painted weapon would look better.

## Update: blind visual critic packet (research priority #9, tool part)

`node scripts/critic-packet.mjs <dirA> <dirB> [pattern]` builds blind
side-by-side pairs (each pair twice, sides swapped), a fixed rubric
(`critic/RUBRIC.md`: readability, painted consistency, lighting, intent
clarity, defects; hard failures decide alone) and a hidden key. The
judge (agent or human) writes `critic/answers.json`, then `--score`
reveals which version won and counts mirrored pairs judged
inconsistently (order bias).

First use, me as judge, TRELLIS vs code monsters in the same frames:
TRELLIS 2 wins, code 0, 2 ties, 0 inconsistent mirrored pairs. The ties
exposed a bug in the playthrough check: "04-mid-fight" was taken after
the fight ended (reward screen). Fixed (shot after the first action).
Not done: a calibrated set of human-approved/rejected images to measure
how often the judge agrees with you.

## Update: biome wall/floor sets

Each room theme now has its own painted wall + floor texture set
(`e4-textures/biomes/`: crypt limestone + grave slabs, forge brick +
iron plates, moss cave rock + mossy stones, bone ossuary + earth), on
top of the theme's light, haze and torch colours. `?biomes=tint` falls
back to tinting the default stone. Two fixes from the screenshots: the
global texture-brightness boost blew the mid-tone biome textures out, so
they skip it; forge light softened (orange light on orange brick).
Bench seed 4: 227 calls, in budget. Visual baseline re-approved.
