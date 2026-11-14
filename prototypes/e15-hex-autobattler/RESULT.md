# e15 hex autobattler: automatic squad, paused card windows

Question: does a hex board where the squad acts on its own, with short paused card
windows between automatic intervals, keep the useful tactical choices of e13/e14 while
cutting routine unit commands? Spec: [research/autobattler-combat.md](../../research/autobattler-combat.md)
sections 4-7 (where it differs from [design/combat-exploration.md](../../design/combat-exploration.md),
the research wins).

Short answer from the bots: cards and timing matter a lot, the wolf now earns its place,
and the control contract holds (previews and replays match exactly). But **placement
barely matters**: a fixed formation wins almost as often as searched deployment, so the
deployment phase is mostly decoration. And the bots win by turning enemies on each
other: 40% of enemy damage comes from other enemies' attacks. Nobody has played it yet;
every number comes from bots that read every intent perfectly.

## Run it

```sh
cd prototypes/e15-hex-autobattler
vp dev                               # http://localhost:5195/
vp test                              # rules tests
node scripts/metrics.ts 300          # the metrics below (about 15 min on 4 cores); rewrites this file's numbers
vp build && node scripts/shots.ts    # headless screenshots into shots/ (no window)
node scripts/peek.ts [seeds...]      # hand-made (or generated) fights as text maps
node scripts/moments.ts              # find a push into fire, a saved pet and a deliberate pass in bot play
```

URL parameters: `?fight=1..6` hand-made fight, `?gen=<seed>` generated fight
(`&d=1..5` difficulty), `&seed=<n>` deck shuffle, `?run` a short run (fights 1, 3, 5,
then 6, with an upgrade pick after each win).

How to play:

1. **Deploy.** Click the hero or the wolf, then a blue hex in the two left columns.
   Enemies' first attacks (red hexes) already aim at the entry side. Pick the wolf's
   priority on the left (hover a priority to preview it). You may play one opening card.
   Then **Start fight**.
2. **Read the preview.** The board always shows the exact next interval: blue arrows are
   your units' automatic moves, gold arrows their attacks, red hexes enemy attacks with
   damage, dashed red arrows enemy moves, pale HP shows what each unit will lose. The
   right panel lists the same interval as text, with reasons ("Wolf bites Archer: lowest
   reachable HP (6)"). Hover a unit for its own plan.
3. **Window.** Play up to two cards (3 energy), or pass. Click a card, hover a lit hex to
   see the new result and the new next interval, click to play. Reposition and Oil take
   two clicks (ally then destination; centre then a neighbour). Undo (Ctrl+Z) works
   inside a window. Esc or right-click cancels.
4. **Commit.** Enter / E or the button. Playback controls: Pause (space), Step (S),
   0.5x / 1x / 2x. Click a line in the event log to highlight its hexes. **Auto** keeps
   committing while no card beats passing by a clear margin, and stops when one does.

## What is built

| File                                                    | What                                                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/rules/hex.ts`                                      | 7 x 6 odd-row offset hex grid: neighbours, distance, rays                                                                                                                          |
| `src/rules/combat.ts`                                   | All rules, pure TypeScript, deterministic: interval resolution, enemy intents and AI, ally AI with reasons, cards, ground, push/pull, state hashes, `preview()`, `replay()`        |
| `src/rules/encounters.ts`                               | Room-to-hex conversion, 6 hand-made fights, the generator (5 budgets, 5 role families, mirror, shift, no-hazard rooms) and its validator                                           |
| `src/rules/levelgen.ts`, `rng.ts`                       | e13's copy of the e11 level generator and seeded random numbers                                                                                                                    |
| `src/rules/bots.ts`                                     | random, greedy, strong and the fixed policies; `playFight` with the preview/footprint contract check                                                                               |
| `src/view/*`                                            | three.js view: crypt room from the e2 kit, hex overlays, arrows, TRELLIS enemies on the e11 runtime rig (e13's `rig.ts`, `models.ts`), e11 post stack (`post.ts`), HUD (`main.ts`) |
| `scripts/metrics.ts` (+ `jobs.ts`, `metrics-worker.ts`) | The research's metric table and failure gates on worker threads                                                                                                                    |
| `scripts/shots.ts`, `moments.ts`, `peek.ts`             | Screenshots, bot-play moments, text maps                                                                                                                                           |
| `tests/rules.test.ts`                                   | 26 Vitest tests: grid, arena, interval order, cards, push/pull, oil blaze, brazier, ward, guard front, wolf priority and guard, routing, preview = resolution, replay hashes       |

Assets (3.5 MB in `public/`): `kit.glb`, the crypt WebP textures and the gated TRELLIS
`skeleton`, `ghoul-px`, `spider`, `brazier` models, copied from e14. Hero, wolf and totem
are e13's code-built figures (no TRELLIS hero or wolf exists).

### Rules as built (and where they go beyond the research)

- **Interval:** allies in creation order (hero, wolf, summons) each move at most one hex,
  then hit if adjacent. Then each enemy does its announced attack, then moves. Ground
  ticks, summons age, enemies announce again. Window: discard, draw 5, 3 energy, at most
  2 cards (1 in the opening window). Loss after interval 15.
- **Enemy attacks** are axial offsets fixed at announcement, so a pushed enemy carries its
  attack with it. They hit everyone in the footprint, enemies too. An empty footprint
  misses; nothing ever retargets. A dead enemy's attack is cancelled.
- **Units and cards** use the research's numbers (hero 26, wolf 16, Strike 4, Firebolt 3,
  fire 2, blaze 4, poison 1, ward -2, wall 2, collision 1 each, ...).
- **Choices I had to make** (the research left them open):
  - Ward cuts attacks and collisions, not fire or poison ticks.
  - Entering fire or poison hurts (fire 2/4, poison 1), whether you walk or are pushed.
  - Oil: a unit pushed onto oil slides one more hex (once per push).
  - A unit pushed into the brazier topples it: fire on the unit's hex.
  - The archer's arrow flies to its mark and stops there; it does not continue past an
    ally who stepped away.
  - Guard stance: the wolf steps back next to the hero (one hex) if it is not, and gives
    3 block only when the hero stands in an attack footprint; otherwise it bites what is
    next to it.
  - Enemies avoid walking into the attacks of enemies who still act this interval and
    detour (up to 2 hexes) around fire and poison. Without this, about a third of all
    enemy damage was friendly fire and greedy won 97%.
  - First intents aim at the entry columns, so you deploy against known blows.
  - Generated fights: budget 8 + 5 x difficulty (max 6 enemies) and +2 enemy HP per
    difficulty step above 1. With the research's plain numbers the strong bot won 100%
    and greedy 97%, which hides every difference.
- **Arena from a room:** every arena is the same 7 x 6 template with blocked corners. The
  generated room supplies the entry wall and door row, the pillar (mapped into columns
  3-5), and the far exit door, which becomes the right-side door with a brazier next to
  it. The view shows the conversion ("level 41 room 3: 7x6 tiles, entry door on the east
  wall -> door at row 5 ...") in the left panel. Hand-made fights may move the pillar or
  add rubble; that is noted too.
- **Upgrades** (`?run`): +1 hero damage; +2 wolf HP and +1 guard block; a Strike replaced
  by a utility card. No shop, no meta progress.

## Numbers

<!-- metrics:start (written by scripts/metrics.ts) -->

Sample: 300 generated fights (seeds 1-300, difficulty 1-5, 60 each), the same seeds for every
policy and config; 6 hand-made fights x 30 deck seeds. Rules version: e15 v1.
Strong search: beam 6 over this window's card lines (all legal plays, far-off ground plays pruned),
each scored after the coming interval plus 1 interval of passing; deployment: every hero/wolf pair
scored over 3 intervals, the best 3 searched fully. It never sees the deck order. 95% intervals:
Wilson for win rates, paired bootstrap (1000 resamples over seeds) for differences.

### Success and pacing

| Policy     |  Win (95% CI) | Intervals (all) | Intervals (wins) | Hero alive | Wolf alive | Cards/fight | Commands/fight | ms/fight |
| ---------- | ------------: | --------------: | ---------------: | ---------: | ---------: | ----------: | -------------: | -------: |
| strong     | 90% (86%-93%) |            10.6 |             10.1 |       100% |        90% |        16.1 |           21.9 |      703 |
| greedy     | 70% (65%-75%) |            12.2 |             11.0 |       100% |        81% |        19.0 |           25.8 |      119 |
| random     |    4% (2%-7%) |             6.4 |              9.4 |         5% |        29% |         6.3 |           12.6 |        2 |
| nearest    | 15% (11%-19%) |             6.2 |              7.3 |        15% |         7% |         5.3 |            7.3 |        2 |
| fixed      | 87% (83%-91%) |            11.1 |             10.5 |       100% |        84% |        16.8 |           22.7 |      533 |
| damage     | 51% (45%-57%) |             8.7 |              9.4 |        52% |        34% |         7.0 |           11.6 |      135 |
| deployOnly |  10% (7%-14%) |             8.2 |             10.4 |        11% |        19% |         0.0 |            4.4 |      107 |
| none       |    2% (1%-4%) |             6.1 |              8.8 |         2% |         5% |         0.0 |            2.0 |        1 |

Win rate by difficulty:

| Policy     |              d1 |              d2 |            d3 |            d4 |            d5 |
| ---------- | --------------: | --------------: | ------------: | ------------: | ------------: |
| strong     | 100% (94%-100%) | 100% (94%-100%) | 83% (72%-91%) | 87% (76%-93%) | 78% (66%-87%) |
| greedy     |   95% (86%-98%) |   83% (72%-91%) | 77% (65%-86%) | 45% (33%-58%) | 50% (38%-62%) |
| random     |    15% (8%-26%) |     3% (1%-11%) |   0% (-0%-6%) |    2% (0%-9%) |   0% (-0%-6%) |
| nearest    |   45% (33%-58%) |   22% (13%-34%) |   3% (1%-11%) |   3% (1%-11%) |   0% (-0%-6%) |
| fixed      | 100% (94%-100%) |   95% (86%-98%) | 83% (72%-91%) | 85% (74%-92%) | 73% (61%-83%) |
| damage     |   88% (78%-94%) |   57% (44%-68%) | 48% (36%-61%) | 28% (19%-41%) | 33% (23%-46%) |
| deployOnly |   33% (23%-46%) |    17% (9%-28%) |    2% (0%-9%) |   0% (-0%-6%) |   0% (-0%-6%) |
| none       |     8% (4%-18%) |     0% (-0%-6%) |   0% (-0%-6%) |   0% (-0%-6%) |   0% (-0%-6%) |

Resolution time at 1x (2 s per interval, strong bot): median 22 s, p90 30 s. Timeouts (interval 15): 10%. Human planning time is not measured by bots.

Hand-made fights (30 deck seeds each), win rate / average intervals:

| Fight            |     strong |     greedy |     random |    nearest |      fixed |        none |
| ---------------- | ---------: | ---------: | ---------: | ---------: | ---------: | ----------: |
| 1. Bone Gate     | 100% / 6.8 | 100% / 6.7 |  73% / 8.7 | 100% / 4.9 | 100% / 6.2 |  100% / 7.0 |
| 2. Arrow Slit    | 100% / 7.3 | 100% / 6.9 |  23% / 8.3 | 100% / 7.2 | 100% / 7.5 | 100% / 11.0 |
| 3. Oil Gate      | 100% / 8.2 | 100% / 8.8 |  13% / 9.7 | 27% / 10.0 |  97% / 9.8 |    0% / 8.0 |
| 4. Bile Pit      | 100% / 7.2 | 100% / 8.3 |  33% / 9.2 |  13% / 7.9 | 100% / 7.1 |    0% / 7.0 |
| 5. Skitter Nest  | 100% / 7.2 | 100% / 8.2 | 63% / 10.3 | 100% / 6.7 | 100% / 7.6 |  100% / 7.0 |
| 6. Warden's Rite | 100% / 9.8 | 80% / 13.1 |   3% / 7.4 |   0% / 5.0 |  97% / 8.9 |    0% / 5.0 |

### Decision variety (strong bot, per window)

- Windows: 3219 (10.7 per fight).
- Distinct outcomes after the interval (alive IDs, HP in 2-point steps, occupied hexes, hazards, energy left): median 119, mean 140.1. Without positions: median 78, mean 104.7.
- Near-best (within 10 score points of the best line): median 7, mean 24.1; without positions median 5, mean 17.5.
- Best line is the same card categories as the window before: 5%.
- Forced passes (no legal card): 0%. Chosen pass while cards were legal: 9%.
- Most common best lines: summon 18%, ground 11%, pass 10%, damage 6%, move 6%, damage+summon 6%.

### Dominant patterns

| Policy     | Strong minus policy, win |
| ---------- | -----------------------: |
| greedy     |        20 pts (14 to 25) |
| fixed      |          2 pts (-3 to 6) |
| damage     |        39 pts (32 to 45) |
| nearest    |        75 pts (69 to 80) |
| deployOnly |        79 pts (74 to 83) |
| none       |        88 pts (84 to 91) |
| random     |        86 pts (81 to 89) |

### Feature relevance (strong bot)

Per fight: cards 16.1 (damage 2.8, move 2.9, push 0.5, ground 3.2, defend 2.0, summon 4.5).
Ground: 2.2 ignites, 0.7 blazes (1.2 hexes), 0.2 brazier topples, 1.2 units forced into a hazard, 0.6 oil slides.
Push/pull: 0.2 Shoulders, 0.3 Hooks, 5.0 servant knockbacks, 1.5 collisions, 2.1 enemy wall slams.
Pet: 3.1 bites (8.0 damage), 2.4 guards (7.1 block). Summons: 4.5 made, 5.5 servant slams, 8.9 totem block.
Damage to enemies: 16% from fire and poison, 7% from collisions and walls, 40% from other enemies' attacks. Prevented for allies: 18.9 by ward, 7.3 by block per fight.

| Feature removed                                                      | Win | Win change (95% CI) | Median squad HP change |
| -------------------------------------------------------------------- | --: | ------------------: | ---------------------: |
| ground cards off (Oil, Miasma, Ward; Firebolt does not ignite)       | 77% | -13 pts (-17 to -9) |                     -6 |
| push/pull off (Shoulder, Hook; servant does not knock back)          | 84% |  -6 pts (-10 to -2) |                     -2 |
| summons off                                                          | 92% |     2 pts (-0 to 6) |                     -5 |
| pet skills off (wolf body stays, never bites or guards, no Shoulder) | 77% | -13 pts (-17 to -9) |                     -3 |
| no wolf at all                                                       | 84% |  -6 pts (-10 to -2) |                    -13 |
| wolf priority locked to nearest                                      | 87% |    -3 pts (-6 to 2) |                     -4 |

### Placement sensitivity and adaptive placement

| 4 random legal deployments, then | Win per sample (low-high) | Best / worst per fight | Squad HP best / median / worst | Fights whose winner changes |
| -------------------------------- | ------------------------: | ---------------------: | -----------------------------: | --------------------------: |
| strong cards                     |                   86%-89% |              98% / 71% |             36.2 / 33.3 / 26.1 |                         27% |
| no cards (priority only)         |                     4%-6% |               12% / 0% |                5.5 / 2.1 / 0.1 |                         11% |

| Formations                | Adaptive (strong) | Fixed formation | Adaptive minus fixed |
| ------------------------- | ----------------: | --------------: | -------------------: |
| base                      |               90% |             87% |      2 pts (-3 to 7) |
| mirror                    |               88% |             87% |      1 pts (-2 to 6) |
| shift                     |               88% |             86% |      1 pts (-1 to 5) |
| held-out (mirror + shift) |               88% |             87% |      1 pts (-2 to 4) |

### Intervention value and timing value (same deployment as the strong bot)

| Instead of strong cards | Win | Strong minus this, win | Strong minus this, squad HP |
| ----------------------- | --: | ---------------------: | --------------------------: |
| same:pass               | 10% |      79 pts (74 to 84) |            30.2 (median 32) |
| same:damage             | 51% |      38 pts (31 to 45) |            23.8 (median 24) |
| same:random             |  6% |      84 pts (79 to 87) |            30.9 (median 32) |
| frontload               | 22% |      68 pts (62 to 74) |            27.9 (median 29) |

Front-loading: the opening window may play as many cards as the strong bot played in that fight (capped at the 12-card deck, mean 6.2 played) with the same total energy, drawn from the top of the same shuffled deck; nothing after. Cards that strong drew only after a reshuffle are not available at setup.

### Priority value

Strong with free wolf priority vs locked to nearest: 90% vs 87%. Wolf target changes per fight 0.2 (locked: 0.5). Invalid targets: 0 by rule (targets are chosen from legal reachable cells). Path stalls (an ally holds because no path exists): 0.2 per fight.

### Companion value

Strong bot: wolf dies in 10% of fights (45% of those fights were still won). Bites 3.1, guards 2.4 per fight. Greedy: 19% deaths; no-intervention: 95%.
Skills removed, body kept: win 77% vs 90%; no wolf at all: 84%.

### Build concentration (strong bot, one upgrade each)

| Build | rush | ranged | casters | flank | mixed | all |
| ----- | ---: | -----: | ------: | ----: | ----: | --: |
| base  |  95% |    98% |     72% |   98% |   85% | 90% |
| dmg   | 100% |    97% |     78% |   98% |   95% | 94% |
| wolf  |  98% |    95% |     70% |  100% |   88% | 90% |
| ward  |  97% |    85% |     77% |   98% |   78% | 87% |
| oil   |  93% |    97% |     72% |  100% |   85% | 89% |

Best build per family (3+ points clear, else tie): rush tie, ranged tie, casters tie, flank tie, mixed dmg.
Card plays per fight (strong): reposition 2.9, servant 2.8, firebolt 2.4, miasma 2.3, ward 2.0, totem 1.7, oil 0.9, strike 0.5, hook 0.3, shoulder 0.2.

### Watch burden

- Windows with no useful affordable choice (no legal card, or the best card line beats passing by less than 10 points): 13%. With margin 5: 10%; margin 20: 22%.
- An auto-continue that stops only at a useful choice would stop at 87% of windows.
- Forced waits (no legal card at all): 0%.
- Playback: median 22 s per fight at 1x. Planning time is a human observation; with an assumed 10 s per window the playback share would be 17%.

### Predictability

Checked 2580 fights (strong, greedy, random and all hand-made runs), 23706 committed windows: preview/resolution mismatches 0, unexplained retargets (ally actions without a logged reason, enemy hits outside the shown footprint) 0, replay hash mismatches 0. Path stalls 0.2 per fight.
Generator rejections over 900 setups (base, mirrored, shifted): opening damage 93.

### Performance

Strong bot: 703 ms per fight, 47.2 ms and 299 simulated intervals per window (p90 628). Whole run: 901 s on 4 worker threads.

### Failure gates (provisional, from the research)

| Gate                                                                                              |   Result |                                               Value |
| ------------------------------------------------------------------------------------------------- | -------: | --------------------------------------------------: |
| Placement: adaptive beats the fixed formation by 5+ points on held-out (mirrored, shifted) fights | **fail** |                                               1 pts |
| Cards: strong cards beat passing by 10+ win points or 10%+ of squad HP (median)                   |     pass |                               79 pts, median HP +32 |
| Combinations: damage-only is 5+ points behind strong, and no single build wins every family       |     pass |           39 pts; no single build on top everywhere |
| Watching: at most half the windows lack a useful choice, and median fights stay under 90 s        |     pass | 13% without a useful choice, median resolution 22 s |
| Pet: dies in at most 50% of fights, and removing its skills costs 5+ points                       |     pass |                     10% deaths, skills worth 13 pts |
| Control contract: no preview mismatch, unexplained retarget or replay divergence                  |     pass |                                           0 / 0 / 0 |
| Opposite failure: placement still changes the winner under strong cards (10%+ of fights)          |     pass |                                       27% of fights |

<!-- metrics:end -->

## Screenshots

`scripts/shots.ts` in chrome-headless-shell (SwiftShader, 1280x720). Not committed; run
the script to recreate them. The push, pet and pass moments come from real strong-bot
play found by `scripts/moments.ts`; the script checks the view reaches the same state
hash as the rules run.

- `1-deployment.png`: Arrow Slit. Hero selected, blue entry hexes, red hexes where the
  first attacks land; hovering an entry hex previews interval 1 from there.
- `2-next-interval-preview.png`: after interval 1. Arrows for every automatic move and
  attack, red hexes with damage, pale HP loss, the wolf's reason on hover.
- `3-push-into-hazard-preview.png`, `3b-after-push.png`: Bile Pit, Hook drags a Hexer in
  through poison; the preview shows the poison hit and the kill it sets up.
- `4a-pet-in-danger.png`, `4b-pet-saved-preview.png`: generated fight 18. Passing ends
  with "Wolf dies" (two hexer blasts and poison); Ward plus a Bone Servant keep it alive.
- `5-deliberate-pass.png`: Bone Gate, cards are legal but the interval already does the
  job.
- `6a-playback.png`, `6-victory.png`: mid-playback and the win screen.
- `7-mouse-hover-preview.png`: real mouse input: deploy by clicking, click a card, hover
  a hex; the script then clicks and checks the card was played.

## What looks good

- **The control contract works.** 23,706 committed windows: zero preview mismatches, zero
  unexplained retargets, zero replay hash differences. The preview is the real rules on a
  copy, and it never draws the next hand.
- **Cards and timing carry the game.** Passing every window with the same deployment
  wins 10% instead of 90%; spending the same cards up front wins 22%. Damage-only cards
  win 51%. Decisions vary a lot: about 119 distinct outcomes per window, the best line
  repeats its card kinds only 5% of the time, and only 13% of windows have nothing worth
  playing. Watching does not dominate by these numbers.
- **The wolf is a partner, not a blocker** (unlike e14, where it died in 71% of fights).
  The strong bot loses it in 10% of fights, and removing its bite and guard (body kept)
  costs 13 win points. Its priority choice adds about 3 points.
- **Fewer commands.** The squad's walking and basic hits are free. The strong bot issues
  about 22 commands per fight (16 cards, the rest deployment and priority changes) over
  about 11 intervals; nobody moves units one by one.
- **Short playback.** Median 22 s of animation per fight at 1x (p90 30 s).

## What doesn't

- **Placement fails its gate.** Fixed formation vs searched deployment: 1 point apart on
  held-out mirrored and shifted fights (87% vs 88%). Bad random deployments still lose
  more (worst of 4 per fight wins 71% vs best 98%; winner changes in 27% of fights), so
  placement is not meaningless, but a sensible default is as good as thinking about it.
  The cause is visible in play: the first blows land on the entry side, the squad walks
  one hex per interval, and Reposition (the most played card) fixes any position later.
- **Enemy friendly fire carries the bots.** 40% of the damage enemies take comes from
  other enemies' attacks (servant knockbacks, Hook and Shoulder putting enemies into
  each other's footprints). It is legal, readable and fun to find once; as the main
  damage source it may make every fight the same trick.
- **Summons are played most but add nothing to wins** (removing them: +2 points, within
  noise, though squad HP drops by 5). Bone Servant and Spirit Totem are used as cheap
  blockers and knockback, like in e14.
- **Fights run long.** About 11 intervals per fight against the 6-10 target, and 10% of
  strong-bot fights end at the 15-interval limit with the hero alive. That came with the
  extra enemy HP needed to keep the bots below 100%.
- **Hand-made fights are too easy.** The strong bot wins all six at 100%, and "do
  nothing" still wins Bone Gate, Arrow Slit and Skitter Nest. They need retuning after a
  human playtest.
- **Reading load is high.** Up to 6 enemies with footprints, 42 hexes of ground effects,
  arrows for every unit. The hover preview and per-unit detail help, but the screenshots
  are busy. Whether a person can predict the next damage quickly is untested.
- **Frame time is not measured on a real GPU.** In headless SwiftShader the view runs at
  50-110 ms per frame, which says nothing about the MacBook Air target.

## Notes and open questions

- Geometry differs from e13 (squares, free movement) and e14 (slots), so win rates are
  not directly comparable; the shared outcome key above uses alive IDs, HP in 2-point
  steps, occupied hexes, hazards and energy.
- Strong-bot cost: about 47 ms and 300 simulated intervals per window, so a "suggest a
  good play" helper is cheap.
- Open: make deployment matter (enemies that start closer, a first interval that
  resolves before any card, or no Reposition in the opening hand)? Cap enemy friendly
  fire (enemies do not hurt each other, or only by displacement)? Make summons more than
  blockers? The research's human task (predict the next damage, explain the pet's target,
  win a mixed fight, name the deciding choice) is the next step and needs a person.
