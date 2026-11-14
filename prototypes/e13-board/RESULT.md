# E13 result: the room becomes the board

Brief: [design/combat-exploration.md](../../design/combat-exploration.md), view "e13 board".
The fight happens in a room from the e11 level generator. The view starts in first person
inside that room, then the camera rises to an angled top view of the same scene. No new
scene is loaded: walls on the camera side shrink to a low rim and the ceiling fades out, so
the room's floor tiles become the board.

## Play it

```
vp install                      # once, at the repo root
cd prototypes/e13-board
vp dev                          # port 5191
```

Open the URL. `?fight=1` to `?fight=7` picks a hand-made fight (rising difficulty),
`?gen=<seed>` a generated one, `?top` skips the first-person intro.

Mouse: click one of your units (blue ring), click a blue tile to move it, then click a card
(hero) or an ability button (wolf, summons) and click a gold tile. Hovering a target shows
the exact result before you commit. Right click or Esc cancels. End turn button (or E).
Keys: 1-5 cards, Tab cycles your units.

## What is in it

| File                      | What                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/rules/combat.ts`     | All rules, pure TypeScript (no three.js, no DOM): units, cards, abilities, enemy intents, ground effects, push and pull, turn flow, and `preview()`, which runs an action on a copy         |
| `src/rules/levelgen.ts`   | The room layout part of e11's `levelgen.js`, ported to TypeScript (same seeds, same rooms; e11's enemy budget, shrine and key are left out)                                                 |
| `src/rules/encounters.ts` | `boardFromRoom()` (room floor + doors + 2 corridor tiles behind each door), 7 hand-made fights, and the fight generator                                                                     |
| `src/rules/bots.ts`       | random, greedy, strong (beam search over the whole turn, scored after simulating the enemy phase), and three simple policies: nearest, retreat, stack                                       |
| `src/view/*.ts`           | three.js view: kit room with biome textures (`room.ts`), camera rise, TRELLIS monsters with the e11 runtime rig (`rig.ts`, `models.ts`), board overlays, HUD and mouse input (`main.ts`)    |
| `scripts/metrics.ts`      | The metrics from the brief over many generated fights                                                                                                                                       |
| `scripts/shots.ts`        | Headless screenshots (chrome-headless-shell, swiftshader; no window)                                                                                                                        |
| `scripts/peek.ts`         | Prints the hand-made fights and given generated seeds as text maps                                                                                                                          |
| `tests/`                  | 27 Vitest tests: cards, movement, push/pull collisions, brazier topple, oil slide, oil blaze, poison spread, ward, guard armour, intents moving with pushed enemies, friendly fire, preview |

Assets copied from e11: `kit.glb`, the WebP textures (`tex/`), and the gated TRELLIS
models `ghoul-px`, `skeleton`, `spider`, `brazier`, `bones` (about 7 MB in `public/`).

### Rules in short

- **Your side.** Hero (26 HP, move 3) with a 12-card deck, hand of 5, 3 energy. Wolf (16 HP,
  move 4) with Bite, Shoulder (push 2, cooldown 2), Howl (4 block to allies within 2,
  cooldown 3). Up to two summons from cards: Bone Servant (8 HP, Slam: 3 damage + push 1)
  and Spirit Totem (6 HP, cannot move, Lash: 2 damage and pull 1 in a line).
- **Turn.** Each of your units may move once, then act. After acting it can't move. The
  hero acts by playing any number of cards. Then each enemy does its announced attack from
  where it stands now, walks, and announces the next one.
- **Intents** are tiles relative to the enemy. Push an enemy and its attack moves with it.
  Attacks hit everyone on those tiles, enemies included.
- **Ground.** Fire (3 on entry and at round end, 2 rounds), oil (fire on oil turns every
  connected oil tile into a blaze doing 5; pushed units slide on oil), poison cloud (2 at
  round end, thick tiles spread, then it fades), ward circle (-2 damage per hit). Fire on
  poison bursts for 3.
- **Push and pull.** Into a wall or pillar: 2 damage. Into a unit: 2 to both. Into a
  brazier: 2 damage and the brazier topples into a 3-tile line of fire. Shove and Shoulder
  can also topple a brazier directly.
- **Enemies.** Ghoul Brute (Cleave: 6 to 3 tiles in front), Bone Archer (Arrow: 5, line of
  5), Rot Hexer (Blight: 3 to a 3x3 area within 4, leaves poison), Skitter (move 4, Bite: 3,
  +3 if the target has no ally next to it), Shieldbearer (Shield Bash: 4 and push 1; takes 3
  less from hits from the front).
- **Doorways.** Reinforcements walk in at the corridor end behind a door, shown a round
  ahead. A unit standing on that tile holds them back. Killing every enemy on the board wins,
  even with reinforcements still on the way.
- Round 16 ends the fight as a loss (anti-stall).

## Numbers

`node scripts/metrics.ts 100`: 100 generated fights (difficulty 1-5 from the seed, 3 to 6
enemies, 0 or 1 reinforcement) plus the 7 hand-made fights.

| Bot     | Generated win | Rounds (won fights) | Hand-made 1-7 | Time per fight |
| ------- | ------------- | ------------------- | ------------- | -------------- |
| random  | 1%            | 6.0                 | `...W...`     | 2 ms           |
| greedy  | 80%           | 8.7                 | `W.WWWW.`     | 9 ms           |
| strong  | 94%           | 5.8                 | `WWWWWWW`     | 55 ms          |
| nearest | 43%           | 4.5                 | `WWWW...`     | 1 ms           |
| retreat | 28%           | 10.4                | `WW.....`     | 2 ms           |
| stack   | 68%           | 8.8                 | `W.WW.WW`     | 5 ms           |

Win % by difficulty 1 to 5: strong 100, 95, 95, 95, 85; nearest 80, 85, 25, 25, 0.

**Decision variety** (strong bot, per turn): its search finds on average 8.7 turns with
different outcomes (median 8) and 2.6 that are within 8% of the best (median 2). In 27% of
turns only one outcome is that good. The best turn uses the same set of action kinds as
the turn before 12% of the time, and the same main kind 27% of the time. Main kind of a
turn: hazard 32%, defend 18%, push 17%, move only 15%, melee 12%, summon 7%.

"Meaningfully different outcome" means the state after the enemy phase differs in enemies
alive, enemy HP (2 HP buckets), party HP (2 HP buckets), party size, or hazard tiles.

**Dominant patterns.** No simple policy comes close to the strong bot (94%):

| Policy                                               | Win | Gap to strong |
| ---------------------------------------------------- | --- | ------------- |
| nearest: walk to the nearest enemy and hit it        | 43% | 51            |
| retreat: step out of the red tiles, shoot if you can | 28% | 66            |
| stack: greedy, but only Strike, Firebolt and Bite    | 68% | 26            |

**What the strong bot uses** (share of fights / uses per turn): ground effects 100% / 0.75,
push and pull 89% / 0.50, companion 98% / 0.49, summons 93% / 0.34. Damage it does to
enemies: hazards 40%, direct 32%, enemies hitting each other 23%, collisions 5%. Over 107
fights: 171 collisions, 36 brazier topples, 258 combos (mostly fire on poison). Cards played:
firebolt 245, poison 179, totem 145, servant 126, ward 94, shove 90, strike 73, oil 40,
hook 31.

Its turns are short: about 2.1 actions and 0.9 moves per turn with 3.1 units on its side. A
wider search (beam 16 instead of 6) won 39 of 40 instead of 38 of 40 and took the same
number of actions, so this is not a search limit.

## Screenshots

Recreate with `vp build && node scripts/shots.ts` (written to `shots/`, not committed).

| Shot                                                                         | Moment                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [01](shots/board-01-first-person.png)                                        | First person in the Crossroads room as the fight starts                                |
| [02](shots/board-02-rising.png)                                              | The camera rising; ceiling fading, near walls shrinking                                |
| [03](shots/board-03-board-intents.png)                                       | Top view: red hit tiles with damage, intent chips, reinforcement warning on a corridor |
| [04](shots/board-04-move-range.png)                                          | Hero selected: blue move range, path to the hovered tile                               |
| [05](shots/board-05-card-preview.png)                                        | Firebolt selected: gold target lines and the preview text                              |
| [06](shots/board-06-after-two-turns.png)                                     | After two strong-bot turns: poison clouds, fire, totem and servant on the board        |
| [07](shots/board-07-enemy-phase.png)                                         | During the enemy phase                                                                 |
| [08](shots/board-08-rot-garden.png)                                          | Rot Garden: oil slick next to a brazier                                                |
| [09](shots/board-09-generated.png), [10](shots/board-10-generated-later.png) | A generated fight at the start and three turns in                                      |
| [sheet](shots/board-sheet.png)                                               | All of them on one page                                                                |

## What felt good

- **The rise works.** Starting in first person and rising over the same room keeps the
  sense of place: you see the brazier and the pillar from the doorway, then the same props
  become board features. Shrinking only the near walls (not hiding them) keeps the room
  shape readable.
- **The e11 retreat loop is gone.** Stepping out of the red tiles is the weakest policy
  (28%). With four bodies, doorways to hold and attacks that hit enemies too, the best play
  moves enemies, not just your hero.
- **Pushing enemies into each other's attacks is real play.** 23% of the strong bot's damage
  comes from enemies hitting each other, because intents move with a pushed enemy. That is
  the most "board game" part of this view.
- **Room geometry matters.** Pillars, walls and braziers turn pushes into damage (171
  collisions, 36 topples), and doorways hold back reinforcements.
- **Exact preview by construction.** The card preview runs the real rules on a copy, so it
  can't drift. A test checks it against every legal action.

## What did not

- **Small rooms.** The generator's rooms are 5 to 7 tiles wide. With 3 to 4 player units and
  4 to 6 enemies the board is crowded, labels overlap, and units look small at the zoom that
  fits the room. A real game would want generator rooms sized for fights.
- **Fire on poison is too easy.** 258 combos, mostly a firebolt into a poisoned tile.
  Hazards do 40% of the damage and the hazard cards are played most. Oil is rarely worth it
  (40 plays): it only pays when fire follows, and fire alone is already strong.
- **The extra units are thin.** The strong bot uses about 3 of roughly 9 possible actions per
  turn. Summons are mostly bodies to block a doorway or soak a hit; the wolf's Howl is its
  most useful skill. Controlling four units adds clicks more than decisions.
- **Readability costs.** Red tiles, damage numbers, intent chips, HP bars, hazards and move
  range all sit on the same floor. It reads in a few seconds in the screenshots, but a
  purple "move into danger" tile and stacked numbers need a human check.
- **Placeholder party art.** The hero, wolf and totem are code-built shapes; enemies reuse
  three TRELLIS meshes with tints (hexer = purple ghoul, guard = blue skeleton with shield).

## Open questions

- **Turn order.** "All your units, then all enemies" is simple and the bots handle it. Whether
  a person finds a four-unit turn too long is untested. Alternating unit by unit would make
  intents harder to plan around.
- **Difficulty for a person.** The strong bot reads every intent and every preview; 94% is a
  ceiling, not a target.
- **Bigger rooms.** Does the view hold up with 8x8 rooms and more pillars, or does it need
  zoom and pan? The camera fits the whole board today.
- **Fewer units?** A hero plus the wolf, with one summon, might keep most of the decisions
  with half the clicks. Worth measuring the same metrics with the party size as a setting.
- **Enemy phase length.** Watching 4 to 6 enemies act one by one takes several seconds per
  round. A fast-forward or simultaneous moves may be needed.
