# e14 lanes: Darkest Dungeon style side-view combat

Question: is a side view with 4 slots per side, where position decides what you can do,
a fun combat view for Wyrdturn? Brief: [design/combat-exploration.md](../../design/combat-exploration.md).

Short answer from the bots: yes, there is real depth. Simple fixed plans lose almost every
fight (1-3%), the strong bot wins 92%, and its best turn is almost never the same kind of
turn twice in a row. The main risks are how lethal it is when you ignore intents, how much
there is to read per turn, and a companion that mostly exists to die in the front slot.
Nobody has played it yet; all numbers come from bots that read every intent perfectly.

## Run it

```sh
cd prototypes/e14-lanes
vp dev --port 5188              # play in the browser (?fight=1..6, ?gen=<seed>)
vp test                         # rules tests
node scripts/metrics.ts 300     # the metrics below
vp build && node scripts/shots.ts   # headless screenshots into shots/ (no window)
```

Controls: click a card, then a lit target ring. Click one of your units to see its
abilities; click an ability, then a target. With a unit selected, lit neighbour slots
swap places with it. Hover any lit target to see the exact result before you commit.
Right-click or Esc cancels, E ends the turn, keys 1-5 pick cards.

## What is built

- **Rules** (`src/rules.ts`, `src/content.ts`): pure TypeScript, no three.js or DOM. The
  game, tests, bots and metrics all use it.
- **Your side:** the Hero (deck of 12 cards, hand of 5, 3 energy), a companion
  (Rustback, 3 abilities with cooldowns: Bite, Drag, Shell Wall), up to 2 summons made by
  cards (Bone Servant: Bash 3 + push; Spirit Totem: Mend 4). All player controlled, any
  order, then all enemies act.
- **Slots decide everything.** Every card and ability lists the slots it can be used from
  and the slots it reaches (shown on the card as a small 4+4 lane). Strike works from
  slots 1-2, Firebolt from 2-4, Miasma from 2-4, and so on.
- **No gaps.** Units always fill a row from the front. Moving means swapping with a
  neighbour: 1 energy for the hero, the whole action for anyone else. When someone dies,
  everyone behind steps up.
- **Push and pull with consequences.** A pushed unit crashes into the one behind it:
  they trade places and both take 1. The last unit in a row slams into the back wall for 3. Being forced into fire or poison hurts at once. Oil makes a pushed unit slide one
  slot further. The Grave Warden is heavy and ignores a 1-slot push or pull.
- **Ground effects on slots:** fire (2 per round), oil (fire on oil becomes a Blaze: 3
  burst, 4 per round, spreads along oiled slots), poison cloud (hurts, drifts to
  neighbours, thins by 1 a round), ward circle (hits there deal 2 less). Fire on a poison
  cloud makes a Flash for double the cloud's strength.
- **Visible intents aimed at slots.** Every enemy shows its next action and the slot it
  hits; your slots show red rings and the total incoming damage. A strike aimed at a slot
  that is now empty lands on the nearest unit it can still reach, so stepping aside moves
  the blow onto someone else instead of erasing it. An enemy pushed or pulled out of the
  slots its ability needs loses that action ("out of position").
- **5 enemy kinds:** Bone Brute (melee, Smash pushes), Bone Archer (ranged), Bile Priest
  (area caster: Fire Rain on 2 slots, Bile Cloud), Cave Spider (flanker: hits past the
  front row, then skitters back), Grave Warden (armour 2, heavy, shields allies).
- **6 hand-made fights** plus a generator (`generate(seed, difficulty)`): budget by
  difficulty, melee in front, casters and archers behind, sometimes oil or poison on the
  ground at the start.
- **View** (`src/stage.ts`, `src/main.ts`): side view in three.js, a hall built from the
  e11 kit with the painted crypt and moss textures, e11's post stack (AO, bloom, grade).
  TRELLIS skeleton, ghoul and spider meshes for enemies, rigged at runtime with
  `autorig.ts` and animated with e11's `animate()`. The hero, companion and Bone Servant
  are e10/e11 code monsters (there is no TRELLIS hero or wolf); the totem is built in code.
- **Bots** (`src/bots.ts`): random; greedy (one action at a time by the immediate score,
  which already counts the shown intents); strong (beam search over the whole turn, width
  8, depth 10, each line scored after simulating the enemy phase); and three fixed
  policies: nearest (always hit the nearest enemy as hard as possible), retreat (hero to
  the back slot, then hit with whatever reaches), stack (always the highest-damage card).

## Numbers

`node scripts/metrics.ts 300` (300 generated fights, difficulty 1-6, same fights for every
bot):

| Bot     | Win rate | Avg rounds |
| ------- | -------: | ---------: |
| random  |       1% |        3.3 |
| greedy  |      63% |       10.5 |
| strong  |      92% |        9.4 |
| nearest |       1% |        2.2 |
| retreat |       1% |        2.2 |
| stack   |       3% |        2.3 |

**Decision variety** (strong bot's turns):

- Distinct outcomes per turn (after the enemy phase, HP rounded to steps of 3): median
  54, mean 73.
- Of those, within 5 points (about 5 damage) of the best: median 6, mean 8.9. So most
  turns have several real options, not one obvious play.
- Best turn is the same kind as last turn (same set of move types): 4%.
- Most common turn kinds: attack + push/pull 9%, attack + defend + push/pull 6%,
  attack + defend 5%, attack 4%, push/pull 4%.

**Dominant patterns:** no simple policy comes close. Nearest, retreat and stack win 1-3%
against the strong bot's 92%. Greedy reaches 63%, 29 points behind.

**What the strong bot uses** (share of its turns): ground effects 38%, push/pull 52%,
companion abilities 29%, summon abilities 28%, moves 34%, defend (ward, block, heal) 48%.
Per fight: 3.1 summons made, 2.5 blazes, 2.1 flashes, 6.4 collisions, 1.2 wall slams,
3.7 units forced into a hazard, 3.0 enemy actions lost to position. 43% of the damage
dealt to enemies comes from fire and poison.

The companion is used in 78% of the turns it is alive, but it dies in 71% of fights,
on average in round 3.1, so it is alive for only 37% of all turns.

**Hand-made fights** (30 runs each, win rate / average rounds):

| Fight             | random   | greedy     | strong     |
| ----------------- | -------- | ---------- | ---------- |
| 1. Bone Gate      | 3% / 4.2 | 100% / 5.5 | 100% / 4.0 |
| 2. Spider Cellar  | 3% / 3.5 | 87% / 7.0  | 100% / 4.1 |
| 3. Crossfire      | 7% / 3.3 | 100% / 6.9 | 100% / 4.3 |
| 4. Bile Chapel    | 3% / 3.4 | 100% / 7.6 | 100% / 5.3 |
| 5. Warden's Wall  | 0% / 4.3 | 93% / 10.6 | 100% / 6.7 |
| 6. The Deep Choir | 0% / 2.6 | 23% / 10.1 | 77% / 8.6  |

## Screenshots

Made by `scripts/shots.ts` in chrome-headless-shell (SwiftShader, 1280×720). They are not
committed; run the script to recreate them.

- `shots/1-start-intents.png`: a fight starts. Intents over each enemy with the target
  slot; the hero's slot shows a red ring and "-23": all three enemies aim at it.
- `shots/2-card-preview-blaze.png`: Firebolt selected and aimed at an oiled slot. The
  preview lists both Blazes and the damage before you play it.
- `shots/3-pull-preview.png`: the companion's Drag on the back archer; the preview shows
  the crash and the collision damage, HP bars show the loss in pale.
- `shots/4-after-player-turn.png`, `shots/5-enemy-turn.png`,
  `shots/5b-next-turn.png`: a bot turn, the enemy turn mid-animation (damage numbers,
  "out of position!"), and the next turn.
- `shots/6-mid-fight.png`: round 3 of The Deep Choir: poison clouds on both sides,
  fire incoming, Grave Warden shielding a priest.
- `shots/7-victory.png`: win screen.
- `shots/8-mouse-hover-preview.png`: real mouse input (click card, hover target). The
  script then clicks and checks the enemy lost HP.

## What felt good

- **Every turn is a small position puzzle.** Because intents aim at slots and your
  abilities depend on your slot, "who stands where" is the decision. The 4% repeat rate
  and the 1-3% win rate of simple policies say the same thing: you cannot autopilot it.
- **Disruption is satisfying.** Pulling a priest into the front row so its Fire Rain
  fizzles, or pushing a brute through a burning slot, reads clearly in the preview and
  pays off. The strong bot does it in half its turns.
- **Combos are easy to see.** Oil then fire, or poison then fire, shows up in the
  preview with the exact numbers, so players can find them without reading rules.
- **The preview carries the readability.** Hovering a target shows the exact events, and
  the enemy intents and red rings update to the state after your action (an enemy you
  are about to pull shows its intent crossed out).
- The side view keeps all 8 units, 8 slots and their effects on one screen; no camera
  work is needed.

## What didn't

- **It is lethal.** The enemy AI weights the hero highly, so in round 1 the hero often
  faces 20+ incoming damage out of 28 HP. Policies that ignore intents die in about 2
  rounds. For bots that is "depth"; for a person it may feel harsh. The fix is probably
  cheaper early fights, not weaker rules.
- **A lot to read.** Up to 4 intents, 8 slots with up to 4 effects each, 5 cards with
  slot rules, cooldowns. Without the hover preview it would not be playable.
- **The companion is a meat shield.** It starts in the front slot and dies in 71% of
  fights around round 3. Summons are mostly used as blockers too. If pets should feel
  like partners, they need a safer job or a way back.
- **Push/pull may become the one trick.** It is in 52% of strong turns, and pulling an
  enemy out of position cancels a whole action. The heavy Grave Warden is the only
  counter so far.
- **Balance moved a lot.** The first version had two holes the bots found at once:
  stepping into an empty slot dodged every hit, and the team could hide in the back
  slots out of melee reach. "Hits on an empty slot land on the nearest unit in reach" and
  "no gaps" fixed both. Before tuning, fire did about half of all damage.
- **Art gaps.** No TRELLIS hero or wolf exists, so the hero is the code cultist and the
  companion is the code crawler, which reads as a spider next to the Cave Spider. The
  TRELLIS skeletons render dark even with the fill light.

## Notes and open questions

- **Turn order** (all of your units in any order, then all enemies) worked well for the
  bots: it lets you set up combos across units (hook, then strike, then bite). Whether it
  feels right to a person is untested.
- Greedy wins 63% because its score already includes the shown intents. Reading intents
  is most of the skill; looking ahead adds the rest.
- The strong bot plays a turn in about 3 ms (24 ms per fight), so a search-based helper
  ("show me a good move") would be cheap.
- Open: should pets be allowed to die? Should enemies resist displacement more (several
  heavy kinds, or "brace" intents)? How much of the hover preview survives on a gamepad?
  How should this view connect to the first-person exploration (load a lane scene from
  the room you fought in)?
- Files: the GLBs (skeleton, ghoul-px, spider, brazier, bones) and WebP textures are
  copies from e11 (5.5 MB in `public/`). `monster.ts`, `autorig.ts` and `post.ts` are e11
  code converted to TypeScript with loose types.
