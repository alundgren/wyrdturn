# e17 lanes: drawing cards for the whole party, and faster turns

Question: in e14's side view, should the pet and summons draw cards too instead of using
fixed abilities, and can a turn-based fight feel faster without losing clarity?
Research: [research/lanes-deck-and-pace.md](../../research/lanes-deck-and-pace.md).
Start: a copy of [e14-lanes](../e14-lanes/RESULT.md) (same view, art and rules).

Short answer from the bots: all three deck models play about as well as e14, so the choice
comes down to feel and reading load. **Squad hands** (every unit draws its own small hand)
keep the pet and summons busy with almost no dead draws and the fewest clicks, so it is the
default. The **fast pace** cuts the time you wait per round from 4.5 s to 1.5 s and clicks
per round by about a fifth, with no change to the rules. Nobody has played it yet.

## Run it

```sh
cd prototypes/e17-lanes-deck-pace
vp run dev                          # play at http://localhost:5197 (plain `vp dev` uses 5173)
vp test                             # rules, deck models, fixes and pace tests
node scripts/metrics.ts 200         # the numbers below (--quick skips feature-off runs)
vp build && node scripts/shots.ts   # headless screenshots and browser checks into shots/
```

URL switches (the deck and pace pickers in the top-left corner set the first two):

| Switch                                         | Default | What it does                                                                                                                                                                 |
| ---------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deck=squad\|party\|hero`                      | `squad` | The deck model (below).                                                                                                                                                      |
| `pace=fast\|classic`                           | `fast`  | Preset for the six pacing flags. `classic` is e14's timing and clicks.                                                                                                       |
| `anim=0.6`                                     | 0.6     | Multiplies every animation and pause (e14 = 1).                                                                                                                              |
| `skip=1`                                       | on      | Click empty floor or press Space to finish the running animation.                                                                                                            |
| `buffer=1`                                     | on      | You can pick and play during animations. Your own animation finishes at once; input given during the enemy turn waits for it.                                                |
| `group=1`                                      | on      | Enemy actions start 0.3 s apart (× anim) instead of 0.9 s each. Rules order is unchanged.                                                                                    |
| `oneclick=1`                                   | on      | A card with a single target plays on the card click. You can drag a card onto a slot. In `deck=hero`, the pet's and summons' abilities show in the hand bar as dashed cards. |
| `autoend=1`                                    | on      | After your last playable card the turn ends by itself; a banner shows it and any click or key cancels.                                                                       |
| `short=1`                                      | on      | Enemy HP × 0.75, enemy damage × 1.25: fewer, bigger hits.                                                                                                                    |
| `spread=1`, `fallback=1`, `fire=1`, `revive=1` | on      | Fixes for e14's problems (below). `rules=e14` turns all four and `short` off.                                                                                                |
| `fight=1..6`, `gen=<seed>`                     | 1       | Hand-made fight, or a generated one.                                                                                                                                         |

Example: `http://localhost:5197/?deck=party&pace=classic&fight=3`.

Controls: click a card, then a lit target ring (hover first to see the exact result).
Click one of your units, then a lit neighbour slot, to swap. Right-click or Esc cancels,
E ends the turn, Space skips an animation, keys 1-9 pick the hero's cards.

## Deck models

| Model   | Hero                                 | Pet (Rustback)                                                  | Summons                                                                     | Budget                                                       |
| ------- | ------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `hero`  | 12-card deck, hand 5                 | 3 fixed abilities with cooldowns                                | one fixed ability each                                                      | 3 energy for the hero; others act once                       |
| `party` | 10 cards in one 14-card deck, hand 6 | 4 cards in the same deck (Bite ×2 cost 0, Drag 1, Shell Wall 1) | a summon shuffles 2 cost-0 cards in when it rises; they leave when it falls | 3 shared energy; the card's owner plays it from its own slot |
| `squad` | own 10-card deck, hand 4, 3 actions  | own 5-card deck, hand 2, 1 action                               | own 3-card deck, hand 2, 1 action                                           | a card or a move per action                                  |

Changed from the research proposal: the squad hero has hand 4 and 3 actions, not hand 3
and 2. With 2 actions the strong bot won only 50-85%; the hero did too little.

Moving (swap with a neighbour) is always there: 1 energy for the hero in `hero` and
`party`, the unit's action for others in `hero`, one free move per turn for non-hero units
in `party`, one action in `squad`. Cards of a unit that isn't on the field are never dealt.

## Fixes for e14's problems

| Problem (owner)                | Fix (switch)                                                                                                                                                                                      | Effect (feature off → on, squad deck, 200 fights)                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Round 1 is harsh               | `spread`: in round 1 at most one enemy strike aims at each of your slots; later, a slot with 8+ incoming damage is worth 0.3× to the next enemy. Enemies with nothing left to aim at "get ready". | round-1 damage aimed at the hero 20.9 → 9.6                          |
| Pull is too strong             | `fallback`: an enemy moved out of the slots its ability needs uses its other ability if that works, else moves into position. The intent shows what it will do instead.                           | enemy actions lost per fight 2.5 → 0.3                               |
| Fire combos are too strong     | `fire`: Blaze burns 3 per round for 2 rounds (e14: 4 for 3), Flash deals 1.5× the cloud (e14: 2×).                                                                                                | share of enemy damage from fire and poison 51% → 46%                 |
| The pet died in most fights    | `revive`: the pet is knocked out, not killed, and comes back after 2 rounds in the first free slot with half HP. Pet HP 18 → 22.                                                                  | strong bot wins 77% → 95%; pet on the field 46% (e14) → 87% of turns |
| The pet looks like the spider  | A code-built teal beetle with a horn, a round shell and short legs replaces the crawler.                                                                                                          | see `shots/4-pet-and-spider.png`                                     |
| Bone Servant had nothing to do | Bash works from slots 1-3 and reaches enemy slots 1-2 (e14: from 1-2, reaches 1).                                                                                                                 | servant dead-draw turns about 50% → 10% (e14 rules)                  |

Pet HP and the servant's Bash are content changes, so they are also in the `e14` column
below; everything else in that column is e14's rules.

## Numbers

`node scripts/metrics.ts 200`: 200 generated fights, difficulty 1-6, the same fights for
every bot and model. "e14" = deck `hero` with `rules=e14`. Pace numbers come from the
strong bot's fights, with the click model and timing table in `src/pace.ts` (the same
table the view waits on).

**Win rate / rounds per fight**

| Bot     | e14        | hero      | party     | squad     |
| ------- | ---------- | --------- | --------- | --------- |
| random  | 1% / 3.3   | 4% / 3.6  | 4% / 3.6  | 1% / 3.3  |
| greedy  | 74% / 10.1 | 81% / 8.3 | 78% / 8.6 | 73% / 8.5 |
| strong  | 94% / 9.1  | 99% / 7.1 | 98% / 7.1 | 95% / 7.4 |
| nearest | 1% / 2.2   | 6% / 2.6  | 4% / 2.6  | 1% / 2.5  |
| retreat | 1% / 2.2   | 7% / 2.7  | 3% / 2.5  | 2% / 2.6  |
| stack   | 3% / 2.4   | 10% / 2.8 | 7% / 2.9  | 11% / 3.0 |

**Pace** (per round / per fight)

| Pace    | Measure              | e14      | hero     | party    | squad    |
| ------- | -------------------- | -------- | -------- | -------- | -------- |
| classic | clicks               | 8.4 / 76 | 9.6 / 68 | 9.2 / 66 | 8.1 / 60 |
| classic | seconds of animation | 4.3 / 39 | 4.5 / 32 | 4.7 / 34 | 4.5 / 33 |
| classic | seconds you wait     | 4.3 / 39 | 4.5 / 32 | 4.7 / 34 | 4.5 / 33 |
| fast    | clicks               | 6.2 / 57 | 7.0 / 50 | 7.7 / 55 | 6.6 / 49 |
| fast    | seconds of animation | 2.1 / 19 | 2.1 / 15 | 2.2 / 16 | 2.1 / 16 |
| fast    | seconds you wait     | 1.5 / 13 | 1.5 / 11 | 1.5 / 11 | 1.5 / 11 |

So e14 as it was (classic, e14 rules) costs 76 clicks and 39 s of waiting per fight; the
default (squad, fast) costs 49 clicks and 11 s, and the fight is 7.4 rounds instead of 9.1.
Thinking time isn't measured; the bots don't think like people.

**Decision variety** (strong bot)

| Measure                                   | e14 | hero | party | squad |
| ----------------------------------------- | --: | ---: | ----: | ----: |
| distinct outcomes per turn (median)       |  63 |  102 |    80 |    83 |
| of those within 5 points of best (median) |   6 |    7 |     7 |     6 |
| best turn same kind as last turn          |  4% |   3% |    2% |    2% |
| best fixed policy behind strong           | 91% |  89% |   91% |   84% |
| greedy behind strong                      | 20% |  18% |   20% |   22% |

No simple policy comes close in any model. The most common turn kinds are spread thin
(each under 8%), for example "attack + push/pull" in `hero` and "hazard + move +
push/pull" in `squad`.

**Who acts** (strong bot): acts in % of turns on the field / cards or abilities played per
fight / dead-draw turns (turns where the unit has nothing it can play at turn start)

| Unit         | e14             | hero            | party           | squad           |
| ------------ | --------------- | --------------- | --------------- | --------------- |
| Hero         | 97% / 20.1 / 0% | 98% / 16.1 / 0% | 96% / 14.0 / 2% | 96% / 14.8 / 1% |
| Rustback     | 78% / 3.3 / 0%  | 71% / 4.5 / 1%  | 70% / 6.7 / 16% | 69% / 4.5 / 3%  |
| Bone Servant | 61% / 1.2 / 10% | 61% / 1.1 / 20% | 51% / 1.3 / 42% | 61% / 1.3 / 4%  |
| Spirit Totem | 73% / 2.6 / 0%  | 77% / 2.2 / 0%  | 59% / 2.1 / 27% | 82% / 2.1 / 0%  |

| Measure                                  | e14             | hero       | party      | squad      |
| ---------------------------------------- | --------------- | ---------- | ---------- | ---------- |
| pet falls (knocked out with `revive`)    | 64% (round 3.6) | 82% (4.6)  | 87% (4.5)  | 100% (4.7) |
| pet on the field, share of turns         | 46%             | 90%        | 89%        | 87%        |
| round-1 damage aimed at the hero         | 16.5            | 9.6        | 9.6        | 9.6        |
| enemy damage from fire and poison        | 44%             | 40%        | 40%        | 46%        |
| of it: fire / blaze / flash / poison     | 26/5/5/7%       | 19/6/4/10% | 19/6/4/11% | 21/7/5/13% |
| enemy actions lost / switched (fallback) | 3.0 / 0         | 0.3 / 1.8  | 0.3 / 1.7  | 0.3 / 1.9  |

**Feature off** (strong bot, squad deck, one switch off at a time)

| Off      | Win | Rounds | Ground share | Round-1 hero | Enemy actions lost |
| -------- | --: | -----: | -----------: | -----------: | -----------------: |
| (all on) | 95% |    7.4 |          46% |          9.6 |               0.29 |
| short    | 98% |    9.3 |          48% |          7.7 |               0.38 |
| spread   | 97% |    8.0 |          45% |         20.9 |               0.65 |
| fallback | 99% |    7.1 |          45% |          9.6 |               2.52 |
| fire     | 98% |    6.7 |          51% |          9.6 |               0.26 |
| revive   | 77% |    8.3 |          43% |          9.6 |               0.27 |

## Screenshots and browser checks

`scripts/shots.ts` runs chrome-headless-shell (SwiftShader, 1280×720, no window). It now
also finds the Linux Playwright cache, so it runs on Linux as well as the Mac. Screenshots
are not committed; run the script to recreate them.

- `shots/1-deck-party.png`, `2-deck-squad.png`, `3-deck-hero.png`: the same fight start in
  each model. Party cards carry an owner tag; squad shows one labelled hand per unit with
  its actions left; hero shows the pet's abilities as dashed cards next to the hero's hand.
- `shots/4-pet-and-spider.png`: the new teal beetle next to the Cave Spider.
- `shots/5-hook-preview-fallback.png`: hovering Chain Hook on an enemy; the pulled
  Bone Brute's Smash is crossed out and it shows what it does instead.
- `shots/6-enemy-turn-fast.png`: the enemy turn mid-animation with enemies acting together.
- `shots/8-mid-fight-squad.png`, `9-victory.png`.
- `shots/10-drag-preview.png`: a card being dragged onto an enemy with the preview shown.

Checks in the same script (it fails if one fails): dragging a card onto an enemy plays
it; a single-target card plays on one click; with one card in hand, playing it ends the
turn by itself; the enemy turn of The Deep Choir in the browser is never shorter than the
pace model's wait, and fast is quicker than classic. Software rendering stretches every
timer. The Deep Choir's enemy turn waits 4.1 s (classic) and 1.4 s (fast) by the pace
model; on a Linux machine with SwiftShader it took 6.1-8.6 s and 4.2-4.3 s in two runs.
So the browser time is only a lower-bound check here; on the Mac's GPU it should sit close
to the model, which `shots.ts` prints.

## What looks good

- **Fast pace is free.** It changes no rules, the strong bot's results don't move, and
  the waiting per round drops by two thirds. Your own animations never block you.
- **Squad hands keep everyone busy.** The pet acts in 69% of its turns and the summons in
  61-82%, with dead draws at 0-4%. Every unit's choice is small (1 of 2 for the pet), and
  the cross-unit order still matters (hook, then strike, then bite).
- **Party deck gives the pet the biggest role** (6.7 plays per fight, twice e14) and adds a
  real trade-off: shared energy between hero and pet cards.
- **The fixes each do their one job**, as the feature-off table shows. Round 1 now aims
  9.6 damage at the hero instead of 16-21.
- **The pet no longer reads as an enemy.** Teal shell and horn next to the black spider.

## What doesn't

- **Party deck starves units.** The pet has nothing to play in 16% of its turns, the
  servant in 42%, the totem in 27%: their few cards are diluted in a 14-card deck. More
  summon cards would fix the numbers but make the deck noisier.
- **Squad shows the most cards.** With two summons there are up to 10 cards on screen;
  the hand bar shrinks them to 74 px wide. Readable in screenshots, but crowded.
- **It got easier.** The strong bot wins 95-99% against e14's 94%, mostly from `revive`
  (off: 77%). Greedy wins 73-81%. People don't play like the strong bot, so the real
  difficulty is still unknown; `short` and the generator budget are the knobs.
- **Fire is still big.** With the fix, fire and poison still deal 40-46% of enemy damage;
  plain fire (Firebolt and units pushed into fire) is the largest part, not the combos.
- **"Gets ready" in round 1** can mean that most enemies do nothing in the first round
  (Crossfire: only the brute attacks). That reads calm, maybe too calm.
- **Auto end turn** only fires after you have played something this turn, and the cancel
  window is short (0.4 s at the fast pace). Untested with a person.
- **Click model limits.** Clicks are counted for the click path only (a drag counts the
  same as a single-target click); thinking time and misclicks aren't measured.

## Open questions

- Which deck model feels best in play? The bots can't tell them apart on win rate.
- Should the pet be knocked out (and come back) in the real game? It makes the pet a
  partner for the whole fight, and the bots lean on it hard (77% → 95%).
- Is "enemies act together" readable when four hits land within a second? The log lists
  them in order; the screenshot can't show motion.
- Hero art is still the code cultist placeholder.
- Files: the GLBs and WebP textures in `public/` are the same files as e14's (git stores
  them once). `monster.ts`, `autorig.ts` and `post.ts` are e14's.
