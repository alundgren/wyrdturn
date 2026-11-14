# e18 up-front autobattler: choose before the fight, then watch

Question: if every choice is made before a fight and the fight then plays itself in
15-40 seconds, can those choices still matter, feel like your own, and can you see why
you won or lost? Research and proposal: [research/upfront-autobattler.md](../../research/upfront-autobattler.md).
View, art and models: copied from e17 (e14's side view).

Short answer from the bots: yes, so far. The best setup per fight wins 95% of
generated fights, a fixed default 36% and a random setup 14%. No single setup works
everywhere (one setup for all fights: 68%), so scouting the enemies pays. The strong
bot's fights take 24 s at 1x (median). On the boss, a setup kept through all three
phases wins 9% of the time; choosing again between phases wins 100%. 9 of 10 gates
pass; the "back" focus fails (picked in 3% of fights). Nobody has played it yet: every
number comes from bots that try all 9,800 setups, which no person will do.

## Run it

```sh
cd prototypes/e18-upfront-autobattler
vp run dev                               # play at http://localhost:5198 (plain `vp dev` uses 5173)
vp test                                  # rules tests
node scripts/metrics.ts 160 --off 60     # the numbers below (about 8 min on 4 cores); add --write to update this file
node scripts/metrics.ts 40 --quick       # a fast look (no feature-off, boss or runs; about 40 s)
vp build && node scripts/shots.ts        # headless screenshots and browser checks into shots/ (no window)
```

URLs (the picker in the top-left corner switches between them):

| URL                                            | What                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| `http://localhost:5198/?fight=1` .. `?fight=6` | the six hand-made fights                                  |
| `?gen=<seed>&d=1..5`                           | a generated fight (difficulty 3 if `d` is left out)       |
| `?boss`                                        | the Ossuary King, three phases                            |
| `?run` (`&seed=<n>`)                           | a run: 4 fights with door and reward picks, then the boss |
| `&speed=2`                                     | start fights at 2x                                        |

## How to play

1. **Scout.** Each enemy's label lists what it does: "Shoot 5 to your back unit, every
   3 s (from 2-4)". Red tags under your slots show what aims at each slot right now, so
   you see a change of formation move the blows.
2. **Choose four things** in the bottom panel:
   - **Skills:** bring 3 of the hero's 9. Raise Servant and Spirit Totem are summons:
     they take a skill place and put a unit in your row. Each skill shows the slots it
     works from; a skill the hero can't use from its slot is struck through on the
     hero's label.
   - **Formation:** click two of your units (in the panel or on the floor) to swap them.
     Slot 1 is the front.
   - **Focus:** front, weakest, back or threat (the enemy dealing the most damage
     right now). Every unit of yours uses it to pick among the enemies it can reach.
   - **Charm:** one, it fires once on its trigger (shown on the button).
3. **Fight!** (or Enter). The fight plays by itself. 1x, 2x and Skip (Space) are the
   only controls. Small bars under each unit show its abilities recharging.
4. **Result.** What decided it in one line, a change to your setup that would have
   flipped the result (or close calls after a win), damage by source both ways, HP over
   time, and key moments. Click a moment to replay from just before it.
5. **Boss.** At 65% and 40% HP the fight pauses. You see the next phase and choose a
   whole new setup. Hero and pet keep their HP (plus 25% of max); summons are raised
   fresh.
6. **Run.** Pick one of two doors (each shows its enemies; the hard door gives 2 rewards
   instead of 1), fight, pick rewards (new skills, charms, upgrades), and so on. Start:
   Strike, Firebolt, Hook, Raise Servant; Smelling Salts, Spark Powder. A loss ends the
   run.

## What is built

| File                                      | What                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/rules/content.ts`                    | Units, the 9 skills, 5 charms, 5 enemy kinds and the boss's 3 phases (data only)                                                            |
| `src/rules/sim.ts`                        | The fight simulator: 0.1 s steps, cooldowns, slots, targeting, ground, push and pull, charms, the dark, boss phases. Pure and deterministic |
| `src/rules/setup.ts`                      | The four choices: every setup, the default, the setups one change away                                                                      |
| `src/rules/encounters.ts`                 | 6 hand-made fights, the boss, the generator                                                                                                 |
| `src/rules/bots.ts`                       | Bots (strong, default, random; boss per phase), "one change" search                                                                         |
| `src/rules/report.ts`                     | Why it went that way: damage by source, key moments, HP curve, verdict                                                                      |
| `src/rules/run.ts`                        | Run mode: doors, rewards, growth                                                                                                            |
| `src/main.ts`, `index.html`               | The browser game                                                                                                                            |
| `src/view/*`                              | e17's stage, monster, autorig and post files; e18 adds ice and the King's look                                                              |
| `scripts/metrics.ts`, `metrics-worker.ts` | The numbers and gates below, on worker threads                                                                                              |
| `scripts/shots.ts`                        | Headless screenshots and browser checks                                                                                                     |
| `tests/rules.test.ts`                     | 19 Vitest tests                                                                                                                             |

Assets in `public/` are e14's files (same bytes, so git stores them once).

### Rules in short

- **Time:** steps of 0.1 s; 1 s of fight is 1 s at 1x. No randomness.
- **Abilities** have a cooldown in seconds, the slots they work from and the slots they
  reach. A ready ability with a target fires; one per unit per step; abilities start
  half charged. A unit that can't use anything from its slot for 1.5 s steps one slot
  towards where it can.
- **Enemies aim by kind:** brute and warden at your front, archer at your back, spider
  at your weakest, priest on fixed slots. Your units aim by your focus.
- **Rows have no gaps.** When a unit falls, everyone behind steps up, into whatever
  burns there.
- **Ground** lives on slots: fire 2/s (ignores armour), oil (fire on it: blaze, 3 burst
  and 3/s, spreads along oil; pushed units slide on it), ice (recharge at half speed),
  poison 2/s (ignores armour and shields), ward (hits deal 2 less). Fire on poison
  flashes for 4; fire and ice cancel.
- **Push** swaps with the unit behind (both take 1) or slams the last unit into the wall
  (3). **Pull** swaps forward. Being forced into fire or poison hurts at once. Heavy
  units (warden, King) can't be moved.
- **The dark:** from 30 s everyone takes 1 a second, +1 every 5 s.
- **Win** when every enemy falls; **lose** when the hero falls.

<!-- metrics:start (written by scripts/metrics.ts --write) -->

Sample: 160 generated fights (seeds 1-160, difficulty 1-5 in turn), the 6 hand-made fights and the boss. Every one of the 9800 setups is played on every fight (fights are deterministic, so one play is the result). Run: `node scripts/metrics.ts 160 --off 60`, 543 s on 4 threads.

### Win rate by policy (generated fights)

| Policy  | Win | What it is                                                                                              |
| ------- | --: | ------------------------------------------------------------------------------------------------------- |
| strong  | 95% | best of all setups for this fight                                                                       |
| blind   | 68% | one setup for every fight, picked on the other half of the fights (in-sample: 69%, `cleave+strike+totem | hero>pet>totem   | weakest | spark`) |
| default | 36% | `firebolt+servant+strike                                                                                | servant>hero>pet | front   | salts`  |
| random  | 14% | a random setup (exact: the share of setups that win, averaged)                                          |

### Does the best setup change from fight to fight?

- 86 different best setups in 160 fights; 29 different skill sets.
- Most common best skill set: `frost+miasma+totem` 21%, `oil+servant+totem` 11%, `hook+miasma+totem` 8%.

Strong bot's picks (share of fights):

| Choice    | Options                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Skills    | Strike 37%, Cleave 19%, Firebolt 16%, Oil Flask 25%, Frost Shard 25%, Miasma 64%, Hook 26%, Raise Servant 30%, Spirit Totem 59% |
| Focus     | front 24%, weakest 49%, back 3%, threat 24%                                                                                     |
| Charm     | Smelling Salts 18%, Spark Powder 31%, Ward Stone 18%, Last Breath 8%, Quickening 26%                                            |
| Hero slot | slot 1 36%, slot 2 31%, slot 3 26%, slot 4 8%                                                                                   |

### What each choice is worth

Fix one choice to its single best value for all fights and still choose the rest per fight:

| Choice fixed | Best fixed value     | Win | Lost vs strong |
| ------------ | -------------------- | --: | -------------: |
| skills       | `hook+miasma+strike` | 90% |          5 pts |
| formation    | `pet>hero`           | 93% |          2 pts |
| hero slot    | `slot 2`             | 93% |          2 pts |
| focus        | `weakest`            | 93% |          2 pts |
| charm        | `quicken`            | 92% |          3 pts |

### How close, how long

| Measure                                                |              Value |
| ------------------------------------------------------ | -----------------: |
| Share of setups that win, median fight (p10-p90)       |        9% (0%-34%) |
| Fights where 5-50% of setups win                       |                57% |
| Fights nobody can win / everything wins                |            5% / 0% |
| Hero HP left in strong's wins, median (p10-p90)        |     74% (39%-100%) |
| Strong's fight length at 1x, median (p10-p90)          | 24.1 s (16.3-30.3) |
| Strong's fights over 45 s                              |                 0% |
| Default's fight length, median                         |             22.0 s |
| Median fight length over all setups (median of fights) |             22.0 s |
| Default losses where one change wins / two changes win |   44% / 71% of 103 |

### Feature-off tests (first 60 generated fights)

| Turned off                | Strong | Default | Random | Blind | Strong - default | Best setup changes | Best skills change |
| ------------------------- | -----: | ------: | -----: | ----: | ---------------: | -----------------: | -----------------: |
| nothing                   |    97% |     38% |    15% |   67% |           58 pts |                  - |                  - |
| ground effects            |    95% |     12% |     5% |   77% |           83 pts |               100% |                98% |
| push and pull             |    87% |     32% |    11% |   63% |           55 pts |                92% |                82% |
| focus rule (always front) |    88% |     38% |    16% |   62% |           50 pts |                77% |                55% |
| charms                    |    83% |     17% |     8% |   48% |           67 pts |                95% |                70% |
| the dark                  |    97% |     38% |    14% |   60% |           58 pts |                25% |                17% |

### Hand-made fights

| Fight          | Enemies                        | Setups that win | Default      | Strong: setup            | Strong: length, hero HP |
| -------------- | ------------------------------ | --------------: | ------------ | ------------------------ | ----------------------- |
| 1 Bone Gate    | brute, brute, archer           |             60% | win, 16.0 s  | `oil+servant+totem       | pet>servant>totem>hero  | front   | spark`     | win, 18.7 s, 83%  |
| 2 Arrow Slit   | warden, archer, archer, archer |             12% | win, 26.4 s  | `hook+miasma+totem       | pet>totem>hero          | weakest | salts`     | win, 27.0 s, 76%  |
| 3 Skitter Nest | spider, spider, spider, spider |             67% | win, 18.8 s  | `firebolt+miasma+servant | pet>servant>hero        | front   | wardstone` | win, 12.3 s, 100% |
| 4 Ember Choir  | brute, priest, priest          |              9% | loss, 17.6 s | `cleave+servant+strike   | servant>pet>hero        | front   | spark`     | win, 12.5 s, 63%  |
| 5 Iron Line    | warden, warden, archer         |             20% | loss, 40.0 s | `miasma+strike+totem     | totem>hero>pet          | back    | salts`     | win, 30.0 s, 100% |
| 6 Grave Court  | brute, spider, priest, warden  |              1% | loss, 19.0 s | `frost+miasma+strike     | hero>pet                | threat  | salts`     | win, 27.0 s, 57%  |

### Boss (three phases)

| Policy                         | Result | Phases reached | Length |
| ------------------------------ | ------ | -------------: | -----: |
| adaptive: best setup per phase | win    |              3 | 78.9 s |
| keep: phase-1 best kept        | win    |              3 | 92.1 s |
| default                        | loss   |              1 | 28.5 s |

- Setups that win all three phases without changing: 112 of 9800 (1%); best `firebolt+oil+totem|totem>pet>hero|weakest|quicken`.
- Share of setups that clear each phase from the adaptive bot's position: 22%, 47%, 47%.
- Setups that clear phase 1: 2175 (22%). Of 32 of them (evenly spaced), kept for the whole fight: 9% win; re-chosen for phases 2 and 3 (best setup per phase): 100% win.
- Adaptive picks: phase 1 `frost+miasma+totem|hero>pet>totem|weakest|quicken`; phase 2 `oil+servant+totem|hero>pet>servant>totem|back|spark`; phase 3 `frost+strike+totem|pet>hero>totem|front|quicken`.

### Runs (24 seeds: 4 fights, then the boss)

| Policy  | Run won | Lost before the boss | Lost to the boss | Hard doors taken (per run) |
| ------- | ------: | -------------------: | ---------------: | -------------------------: |
| strong  |     96% |                   4% |               0% |                        3.6 |
| default |      0% |                  96% |               4% |                        0.0 |

### Gates

| Gate                                                                                                    | Value                                        | Pass     |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------- |
| Choices matter: strong - default >= 25 pts and strong - random >= 40 pts                                | 59 / 81 pts                                  | pass     |
| Adapting pays: strong - blind >= 15 pts                                                                 | 27 pts                                       | pass     |
| No dominant skill set: top best skill set in <= 30% of fights                                           | 21%                                          | pass     |
| No dead or forced option: every skill, focus and charm picked in 5-70% of fights                        | 3%-64%                                       | **fail** |
| Fights are close: 5-50% of setups win in half the fights or more                                        | 57%                                          | pass     |
| Wins are not walkovers: median hero HP left 30-80%                                                      | 74%                                          | pass     |
| Length: strong's median 15-40 s, 90% under 45 s                                                         | 24.1 s, p90 30.3 s                           | pass     |
| Losses are explainable: two changes or fewer win after 50%+ of default losses                           | 44% one, 71% two                             | pass     |
| Features count: turning off ground, push/pull, focus or charms changes the best setup in 25%+ of fights | ground 100%, push 92%, focus 77%, charms 95% | pass     |
| Boss phases: re-choosing beats keeping the phase-1 setup by 20+ pts                                     | 91 pts                                       | pass     |

<!-- metrics:end -->

## Screenshots

`vp build && node scripts/shots.ts` writes 9 shots into `shots/` (not committed): setup,
a changed setup, mid-fight, a win and a loss result, boss phases 1 and 2, run doors and
a run reward. It also checks: Skip shows the result, Iron Line with the default setup
is a loss and the loss screen names a change, 2x runs twice as fast, boss phase 1 ends
in a pause and offers a new setup, the run starts at the doors and a won fight offers
rewards, and the page has no errors.

This machine has no real GPU. Chrome draws in software at about 4 fps, so the 2x check
skips itself here (it needs 15 fps). All other checks pass. On the Mac, run the same
command and the 2x check runs too.

## What looks good

- **Scouting is on the stage, not in a panel.** Each enemy's label says what it does,
  and the red tags under your slots show what will hit each one. Swap two units and the
  tags move. That is the main way a person can reason about a setup before Fight.
- **Losses come with a fix.** After 44% of default losses a single change would have
  won, and after 71% two changes would. The result screen shows the best single
  change, so "why did I lose" has a concrete answer, such as "put the Totem behind
  the Servant".
- **Every system changes the answer.** Turning off ground effects, push and pull, the
  focus rule or charms changes the best setup in 77-100% of fights. None of them is
  decoration.
- **The boss pause works.** The phase-1 best setup, kept through the whole fight, still
  wins this time, but a random phase-1 winner kept to the end wins only 9% of the time.
  Phase 2 (fire on your slots, raised brutes) asks for a different answer than phase 1
  (armour and archers).
- **Fights are short and end.** Median 24 s; no fight by the strong bot goes past 45 s.
  The dark from 30 s ends stalls without changing the best setup much (25%).

## What doesn't work yet

- **The "back" focus is almost dead** (3% of fights). Archers and priests stand at the
  back, but "threat" or "weakest" usually reaches them anyway. It needs a reason to
  exist, for example extra damage to the last enemy, or it should go.
- **Each single choice is worth little on its own.** Fixing any one of them for all
  fights costs only 2-5 points. The win comes from getting the four together right.
  That may be fine for a bot, but a person can't try 9,800 setups and may not feel which
  choice mattered.
- **Totem and Miasma are picked most** (59% and 64% of fights). They pass the 70% gate,
  but they are close to "always take".
- **Hand-made fights are uneven.** Setups that win: 60%, 12%, 67%, 9%, 20%, 1%. Grave
  Court (fight 6) has one winning setup in a hundred; that is a puzzle, not a fight.
- **The default setup is weak** (36%), and the run's default bot wins 0 runs. A person
  who doesn't read the enemies will lose fast. Good for "choices matter", bad for a
  first play.
- **The bot sees everything.** It tries every setup with perfect knowledge of the
  outcome. A person sees labels and tags and has to guess. The gap between those two is
  the real question, and only play can answer it.
- **2x timing is untested here** (software GPU, see Screenshots).

## Open questions

- Can a person find a winning setup from the labels and tags in one or two tries, or
  does it feel like guessing? Play fights 2, 4 and 6 to see.
- Does watching a 24 s fight with no input feel good, or is Skip pressed every time?
- Is the one-change hint on the result screen enough to learn from, or does it give the
  answer away?
- Should "back" focus be changed or cut?
- Should a run start with a stronger default setup, so the first fight is not a wall?
