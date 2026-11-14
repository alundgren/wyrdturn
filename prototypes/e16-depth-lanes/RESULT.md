# e16 depth lanes: first-person combat in lanes ahead of the party

Question: can Wyrdturn keep its first-person view in combat, with enemies in 3 lanes and 5
rows in front of the party, and still have real choices about where you stand, how far
you reach and what you put in the way? Research and the full proposal:
[research/depth-lanes.md](../../research/depth-lanes.md).

Short answer from the bots: mostly yes. Where you stand matters a lot: a hero that never
leaves the middle lane wins 21% where the strong bot wins 94%, and with no sideways steps at
all the win rate falls to 21%. Blockers (-26 points when removed), push and pull (-31) and
the wolf (-14) all matter. The e11 trap is gone: hit-then-step-back wins 11%. The weak
spot is depth: the rules about which rows a card reaches only cost about 5 win points, which
fails the research gate by a hair. 10 of 11 gates pass (300 fights).

Nobody has played it yet. All numbers come from bots that read every intent perfectly.

## Run it

```sh
cd prototypes/e16-depth-lanes
vp dev --port 5196                     # play in the browser
vp test                                # rules tests
node scripts/metrics.ts 300            # the numbers below (about 2 minutes)
node scripts/metrics.ts 300 --write    # same, and rewrites the Numbers section here
node scripts/peek.ts 2 strong          # one fight as text maps, turn by turn (gen:13 for a generated one)
vp build && node scripts/shots.ts      # headless screenshots into shots/ (no window)
```

URL options: `?fight=1..6` for a hand-made fight, `?gen=<seed>` for a generated one
(`&d=1..5` sets the difficulty, otherwise it comes from the seed), `&seed=<n>` for the
deck shuffle.

## How to play

- You are the hero on the party line (row 0, the three blue cells nearest you). The gold
  ring is your cell. The wolf and a Spirit Totem can stand on the line too.
- Enemies walk toward you down the lanes. Each one shows its next action over its head.
  Red cells with a number show where an attack will land and for how much.
- **Cards:** click a card, then a green cell. The small grid on each card shows what it can
  reach from where you stand. Hover a green cell to see the result first, and what the
  enemy turn would then do to you.
- **Step:** ◀ ▶ (or A/D, arrow keys, or a click on the line cell beside you) moves the
  hero one lane for 1 energy. Swapping with the wolf is allowed.
- **Wolf:** the panel on the left. One action a turn (Bite, Shove sideways, Guard) and one
  free step.
- **Summons:** click the button over a Bone Servant (Bash) or a Spirit Totem (Ward, then a
  line cell).
- **End turn:** the button, E or Enter. Hover it to see what all enemies will do.
- Keys 1-5 pick cards. Esc or right-click cancels.

## What is built

- **Rules** (`src/rules/combat.ts`, `src/rules/encounters.ts`): pure TypeScript, no
  three.js or DOM. The game, tests, bots and metrics all use the same code.
- **Field:** 3 lanes × rows 1-5, plus the party line (row 0). One unit per cell. Enemies
  enter at row 5. Waves are announced one round before they come through the far door.
- **Your side:** hero (30 HP, 12-card deck, hand 5, 3 energy), wolf (16 HP: Bite 4 on the
  first enemy in its lane in rows 1-2, Shove one lane sideways, Guard -4 on the next hit
  on the hero), up to 2 summons (Bone Servant 12 HP, a blocker with Bash 3 + push; Spirit
  Totem 6 HP, wards a line cell).
- **Reach:** Strike hits row 1 of your lane, Spear Thrust rows 1-2, Firebolt the first
  enemy in rows 1-4, Hook the first enemy in your lane, Oil, Frost and Miasma are lobs that
  aim at cells. Where you stand decides what you can hit.
- **Enemies (6):** Ghoul (walks; at row 1 cleaves the 3 line cells in front of it), Spearman
  (thrusts 2 cells, through a blocker), Bone Archer (arrows fly down the hero's lane and hit
  the first body, so a servant in front catches them), Bile Priest (lobs fire or poison on
  the hero's line cell, ignores blockers), Cave Spider (fast, goes around blockers), Grave
  Warden (slow, armour 2, ignores pushes). A walker at row 1 with an empty lane in front
  claws the line cell beside it, so one step sideways is not a free dodge.
- **Ground:** fire (2 a round), oil (fire on it blazes for 3 and spreads through oil), ice
  (a walker on it loses its next move), poison (1 a round), ward (hits there deal 2 less).
- **Push and pull:** along a lane (Shove 2 back, Bash 1 back, Hook to row 1) and across
  lanes (wolf Shove). Crashes cost both units 2, walls 3. Attacks are committed: push a
  ghoul back and its claw hits the empty row in front of it.
- **Preview = result:** every hover runs the real rules on a copy. The metrics check that
  the preview matches what happens on every committed turn.
- **6 hand-made fights** (Bone Gate, Arrow Lanes, Spear Wall, Oil Cellar, Bile Choir,
  Warden's Wall) and a generator (`generate(seed, difficulty)`) with a budget per
  difficulty, waves, and a validator.
- **View** (`src/view/`): first person in three.js. A corridor built from the e11 kit with
  the painted crypt WebP textures, the e11 post stack, TRELLIS skeleton, ghoul and spider
  meshes rigged at runtime with the e15 rig code. The wolf, totem, the spear and the
  warden's shield are built in code. The hero is the camera; the camera slides with the
  hero's lane.
- **Bots** (`src/rules/bots.ts`): random, greedy (best single action at a time, reads
  intents), strong (beam search over the whole turn, each line scored after the enemy
  phase), and fixed policies for the dominant-pattern tests: middle, edge, blockFront,
  hitDodge, damage-only, nearest.

## Numbers

<!-- metrics:start (written by node scripts/metrics.ts 300 --write) -->

Sample: 300 generated fights (seeds 1-300, difficulty 1-5 in turn), the same seeds and deck order for every policy and config; 6 hand-made fights x 30 deck seeds. Strong search: beam 6, up to 8 actions per turn, each line scored after the enemy phase and the new intents. 95% intervals: Wilson for win rates, paired bootstrap (1000 resamples) for differences.

### Success and pacing

| Policy     |  Win (95% CI) | Lost to time | Rounds (all) | Rounds (wins) | Hero HP left (wins) | Wolf alive | ms/fight |
| ---------- | ------------: | -----------: | -----------: | ------------: | ------------------: | ---------: | -------: |
| strong     | 94% (91%-96%) |           4% |         11.9 |          11.5 |                23.8 |        79% |       46 |
| random     |    0% (0%-2%) |           0% |          4.7 |          17.0 |                21.0 |        47% |        0 |
| greedy     | 55% (49%-61%) |          30% |         15.3 |          13.0 |                22.8 |        57% |        7 |
| middle     | 21% (17%-26%) |           8% |         10.1 |          11.0 |                22.7 |        89% |       28 |
| edge       | 42% (36%-47%) |           9% |         11.1 |          11.5 |                25.2 |        84% |       33 |
| blockFront | 14% (10%-18%) |           0% |          5.7 |           8.5 |                10.0 |        78% |        0 |
| hitDodge   |  11% (8%-15%) |           0% |          6.6 |           9.9 |                11.1 |        13% |        0 |
| damage     | 22% (18%-27%) |          24% |         11.9 |           9.7 |                19.5 |        34% |        8 |
| nearest    |    5% (3%-8%) |           0% |          4.4 |           7.9 |                 9.1 |        87% |        0 |

Win rate by difficulty:

| Policy     |   d1 |   d2 |  d3 |  d4 |  d5 |
| ---------- | ---: | ---: | --: | --: | --: |
| strong     | 100% | 100% | 92% | 88% | 90% |
| random     |   2% |   0% |  0% |  0% |  0% |
| greedy     |  88% |  77% | 57% | 37% | 17% |
| middle     |  42% |  42% | 13% |  7% |  2% |
| edge       |  67% |  65% | 37% | 23% | 17% |
| blockFront |  47% |  17% |  3% |  2% |  0% |
| hitDodge   |  38% |  10% |  8% |  0% |  0% |
| damage     |  60% |  28% | 20% |  3% |  0% |
| nearest    |  20% |   2% |  2% |  0% |  0% |

Hand-made fights (30 deck seeds each), win rate / average rounds:

| Fight            |      strong |      greedy |     random |   hitDodge |    nearest |
| ---------------- | ----------: | ----------: | ---------: | ---------: | ---------: |
| 1. Bone Gate     |  100% / 7.6 |  100% / 8.6 |   0% / 5.7 |   0% / 6.2 |   0% / 6.4 |
| 2. Arrow Lanes   |  100% / 9.8 | 100% / 11.2 |   0% / 4.6 |   0% / 3.8 |   0% / 3.8 |
| 3. Spear Wall    |  100% / 7.1 |  100% / 9.6 | 20% / 10.5 | 100% / 8.5 | 100% / 8.3 |
| 4. Oil Cellar    |  100% / 7.6 |  90% / 11.2 |   0% / 7.8 | 100% / 8.2 |  97% / 7.2 |
| 5. Bile Choir    | 100% / 10.9 |  90% / 14.0 |   0% / 4.5 |  0% / 10.1 |   0% / 4.0 |
| 6. Warden's Wall |  97% / 12.5 |  50% / 16.5 |   0% / 4.5 |   0% / 5.2 |   0% / 4.0 |

### Decision variety (strong bot)

- Turns: 3565 (11.9 per fight).
- Distinct outcomes after the enemy phase (alive units, HP in 2-point steps, positions, ground): median 92, mean 122.5. Without positions and ground: median 18.
- Near-best outcomes (within 5 score points, about 2 hero HP, of the best): median 9, mean 16.3.
- Best turn uses the same set of action kinds as the turn before: 5%.
- Turns where nothing beats passing by 5+ points: 8%.
- Most common turns (kinds of action used): ground 7%, ground+summon+wolf 6%, ground+wolf 5%, damage+step+summon+wolf 5%, damage+ground+summon+wolf 4%, ground+summon 4%.

### Dominant patterns

| Policy     | What it does                                                     | Strong minus policy, win |
| ---------- | ---------------------------------------------------------------- | -----------------------: |
| random     | random legal actions                                             |        94 pts (91 to 96) |
| greedy     | best single action at a time, reads intents                      |        39 pts (33 to 45) |
| middle     | strong, but the hero never leaves the middle lane                |        73 pts (67 to 78) |
| edge       | strong, but the hero goes to the left lane and stays             |        52 pts (47 to 58) |
| blockFront | always a Bone Servant in front of the hero, then hit the nearest |        80 pts (76 to 85) |
| hitDodge   | hit the nearest from your lane, then step out of the red cell    |        83 pts (78 to 87) |
| damage     | strong, but only damage cards                                    |        72 pts (67 to 77) |
| nearest    | always hit the nearest enemy as hard as possible                 |        89 pts (86 to 92) |

### Lanes, reach and blockers (strong bot)

- Hero ends the turn in lane left / middle / right: 34% / 33% / 33%. Hero steps 5.8 per fight, of which dodges (out of a red cell into a safe one) 3.3; wolf steps 2.4.
- Hit-and-dodge turns (card damage, then a step out of a red cell): 6% of turns.
- Damage to enemies by source: front 3%, pierce 2%, lane 17%, lob 7%, wolf 18%, summon 12%, ground 34%, collide 6%.
- Kills by row (1 = next to the line): row 1 22%, row 2 41%, row 3 29%, row 4 8%, row 5 0%.
- Blockers per fight: 3.6 summons, 19.9 damage absorbed by them, 2.7 arrows caught, 1.3 walker moves stopped, 3.8 walkers stuck in ice.
- Summon placement, top cells: totem lane 1 row 1 14%, servant lane 1 row 1 13%, servant lane 0 row 1 12%, servant lane 2 row 1 12%. Relative to the hero: own lane row 1 37%, other lane row 1 36%, own lane row 2 11%, other lane row 2 10%, other lane row 0 6%.
- Ground and push per fight: 7.9 ignites, 2.7 blazes, 1.7 enemies forced into a hazard, 1.8 collisions, 0.0 wall slams.
- Cards played per fight: Firebolt 5.6, Frost 3.3, Oil Flask 2.3, Bone Servant 2.1, Miasma 2.0, Hook 1.6, Spirit Totem 1.5, Spear Thrust 0.8, Strike 0.6, Shove 0.2.
- Wolf: dies in 21% of fights; 5.0 bites, 0.1 shoves, 1.3 guards (4.1 damage prevented) per fight. Ward prevented 4.1 per fight.
- Clutter: at most 6 enemies on the field; rounds with more than 6 enemies or 8 ground cells: 0%.

### Feature-off tests (strong bot)

| Turned off                                                                       | Win |  Win change (95% CI) | Median hero HP change |
| -------------------------------------------------------------------------------- | --: | -------------------: | --------------------: |
| ground cards off (Oil, Frost, Miasma become Strike; Firebolt does not ignite)    | 87% |   -7 pts (-11 to -3) |                     0 |
| push and pull off (Shove, Hook become Strike; no wolf Shove; Bash does not push) | 63% | -31 pts (-36 to -26) |                    -3 |
| sideways steps off (hero and wolf never step)                                    | 21% | -73 pts (-78 to -67) |                   -20 |
| summons off (Bone Servant, Spirit Totem become Strike)                           | 68% | -26 pts (-32 to -21) |                    -8 |
| all blockers off (summons and Frost become Strike)                               | 68% | -26 pts (-31 to -21) |                    -8 |
| no wolf                                                                          | 80% |  -14 pts (-19 to -9) |                    -2 |
| wolf skills off (body stays)                                                     | 80% | -14 pts (-19 to -10) |                    -4 |
| depth off (front and pierce attacks reach any row)                               | 99% |       5 pts (2 to 8) |                     1 |
| lane reach off (lane cards aim at any lane)                                      | 99% |       5 pts (3 to 8) |                     0 |

### Control contract

Checked 16657 committed turns (strong, greedy, random and every hand-made run): 0 differences between the end-of-turn preview and what happened. Generator rejections: 0 of 300 drafts.

### Failure gates (provisional, from the research)

| Gate                                                                                                 |   Result |                                    Value |
| ---------------------------------------------------------------------------------------------------- | -------: | ---------------------------------------: |
| Dominant lane: middle and edge policies 5+ points behind strong, hero in one lane under 70% of turns |     pass | middle 73 pts, edge 52 pts, top lane 34% |
| Dominant block: block-front 5+ points behind strong, no summon cell above 70%                        |     pass |                     80 pts, top cell 14% |
| Sideways matters: turning off steps costs 10+ points                                                 |     pass |                                   73 pts |
| Depth and reach matter: depth off or lane reach off moves win rate by 5+ points                      | **fail** |                 depth 5 pts, lanes 5 pts |
| Blockers matter: all blockers off costs 5+ points                                                    |     pass |                                   26 pts |
| Step-back trap: hit-and-dodge 10+ points behind strong, under 40% of strong turns                    |     pass |                      83 pts, 6% of turns |
| Wolf: dies in at most 50% of fights, skills worth 5+ points                                          |     pass |                21% deaths, skills 14 pts |
| Decisions: simple policies 5+ points behind, best turn repeats its kinds under 40%                   |     pass | closest simple policy 39 pts, repeats 5% |
| Clutter: over 6 enemies or 8 ground cells in under 10% of rounds                                     |     pass |                                       0% |
| Control contract: no preview mismatch                                                                |     pass |                               0 of 16657 |
| Not too easy: strong 80-95%, random under 20%                                                        |     pass |                    strong 94%, random 0% |

Whole run: 130 s.

<!-- metrics:end -->

## What looks good

- **Lanes are a real choice.** The strong bot ends turns evenly in all three lanes (34 / 33
  / 33%), steps about 6 times a fight, and half of those steps dodge a red cell. Fixing the
  hero in one lane costs 52-73 points.
- **The step-back trap is gone.** Hit-and-dodge is 83 points behind strong and only 6% of
  strong turns look like it. The ghoul cleave and the diagonal claw at row 1 make one step
  sideways a plan, not an escape.
- **Blockers do a job.** Servants catch 2.7 arrows and absorb about 20 damage a fight. No
  single summon cell is used more than 14% of the time, so there is no one "always put it
  here" answer.
- **Preview = result.** 0 differences in 16657 committed turns. Hovering End turn lists
  exactly what will happen.
- **Readable picture.** In the shots the cell grid, the red damage cells (with numbers),
  the blue party line and the green targets of the selected card are all easy to see.
  Enemy intents sit over their heads in short pills ("Claw 6", "Aimed Shot 4 (blocked)").
- **Variety.** About 92 distinct outcomes per turn, 9 near-best lines, and the best turn
  repeats last turn's kinds only 5% of the time. The greedy bot is 39 points behind strong.

## What does not

- **Depth and reach barely matter (gate fails).** Letting front and pierce cards hit any
  row, or lane cards hit any lane, only raises the win rate from 94% to 99% (+5 points).
  Part of this is a ceiling (strong already wins 94%), but most damage comes from wide
  sources: ground 34%, wolf 18%, Firebolt (lane) 17%, summons 12%. Strike and Spear Thrust
  together do 5%. Rows mostly decide _when_ an enemy reaches you, not _what you can hit_.
- **Fire does a third of all damage.** Firebolt is the most played card (5.6 a fight).
  Turning ground off still only costs 7 points, so fire replaces other damage more than it
  creates new plays.
- **Shove is almost never played** (0.2 a fight), and wolf Shove 0.1. Hook (1.6) is the
  push/pull card that does the work.
- **Too easy for the strong bot at difficulty 1-2** (100%), and fights 1-4 are 100% for
  both strong and greedy. Fight 6 (Warden's Wall) is the only hand-made fight that
  separates them (97% against 50%).
- **Busy screen in big fights.** With 6 enemies, 2 summons and ground effects (shot 6),
  the far labels crowd the top of the screen. The Spirit Totem is a tall pillar with a
  bright orb right in front of the camera and hides part of its lane. The warden's shield
  is a plain box.
- **Software rendering is slow.** On a machine without a GPU, the headless shots render at
  about 0.7 s a frame, so `shots.ts` takes about 5 minutes. On a real GPU it should be fast;
  nobody has measured it there yet.

## Open questions

- Is it fun and easy to read for a person? Nobody has played it.
- How to make depth matter more: more front-only damage (Strike, Thrust) and less lane
  damage, enemies that are only hittable in some rows (a shielded front, a back row that
  only lobs reach), or a damage bonus for close range.
- Should Firebolt be weaker, or should fire stop stacking with oil, so that cards with a
  fixed reach carry more of the fight?
- Is 3 lanes enough? Every lane is either "mine", "next to me" or "far". A 4th lane would
  make "far" more common but makes the corridor wider than the explore grid.
- The view looks down quite steeply now so the party line stays above the hand of cards.
  Does it still feel like first person, or should the hand get smaller instead?
- Frame time on a real GPU.
