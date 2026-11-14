# Up-front choices, then a fight that plays itself

Research date: 2026-11-14. This is a research proposal, not a prototype verdict.

**Recommendation (opinion):** build e18 in e14's side view. Before a fight you see
the enemies and what they do, then make four choices: which 3 hero skills to bring
(summons are skills, so they compete for the same 3 places), the order of your units
in the 4 slots, one focus rule for the whole party, and one charm that fires once on a
set trigger. Then the fight runs on cooldowns for 15-40 seconds with no input. After
it, a result screen shows damage by source, the key moments, what beat you, and one
change to your setup that would have flipped the result. Bosses pause between phases
for a new set of choices.

## Evidence and limits

I read `design/direction.md`, `design/combat-exploration.md`,
`research/autobattler-combat.md`, `research/combat-views.md`,
`research/tower-defense-combat.md`, and the `RESULT.md` of e14 (main), e15, e16 and e17
(their branches).

Game facts below come from store pages, wikis, guides and reviews found by web search on
the research date. Wikis go out of date and guides disagree; where they do, I say so.
No game was played or timed for this report. Lessons, rules and numbers for e18 are
design opinions to test, not facts.

What the owner has said so far, taken as given: fighting on the exploration grid (e11)
is boring; the tactics board (e13) is messy and tedious; side-view lanes (e14) are
promising and the owner likes that look; the hex autobattler with paused card windows
(e15) is too messy; first-person depth lanes (e16) are worse; e17's card play for every
unit at a faster pace is not it. Turn-by-turn card play is out.

## 1. Prior art

For each game: what you decide, when, how the fight is shown, how long it runs, what
makes the choice matter, and what went wrong. "Lesson" is my reading for Wyrdturn.

### Build first, then watch (no input during the fight)

| Game                                   | What you decide, and when                                                                                                                                                                                             | The fight                                                                                                                                                                                      | What makes choices matter                                                                                                                                                                                                                            | What went wrong                                                                                                                                                                                                                                                                                    | Lesson                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **The Bazaar** (Tempo)                 | Between fights you buy, sell and arrange items on a board. Each item has a cooldown in seconds.                                                                                                                       | Two boards fire items on their timers. A sandstorm starts at 30 s (one item starts it at 7 s, per [PCGamesN](https://www.pcgamesn.com/the-bazaar/mak-new-hero-season-1)) and ends long fights. | Cooldown timing, item order and adjacency, and "charge" effects that push another item's cooldown forward ([Mobalytics keywords](https://mobalytics.gg/the-bazaar/guides/keywords-and-terms)). You fight other players' saved builds.                | The public complaints at launch were about payments, not the fights ([PC Gamer](https://www.pcgamer.com/games/card-games/after-its-disastrous-launch-last-year-im-here-to-tell-you-that-2025s-most-promising-auto-battler-finally-lives-up-to-its-potential)); balance was rough for months after. | Timers in seconds are easy to read and easy to simulate. A hard clock (sandstorm) keeps every fight short.                                 |
| **Backpack Battles**                   | Between rounds you place items in a grid backpack. Neighbours buff each other (marked with stars).                                                                                                                    | Items fire on cooldowns, no input. Fatigue starts at 17 s and grows by 1 damage each second ([wiki](<https://backpackbattles.wiki.gg/wiki/Fatigue_(demo)>), demo page, may be out of date).    | Placement next to the right neighbours; timing of cooldowns.                                                                                                                                                                                         | Players report winning by just outlasting until fatigue kills the other side ([Steam](https://steamcommunity.com/app/2427700/discussions/0/4290313152640235930)).                                                                                                                                  | Fatigue caps length, but it must not become the plan. Our "dark" timer should hurt both sides and start late enough.                       |
| **Super Auto Pets**                    | Between battles you buy pets, merge them and set their order in a row of 5.                                                                                                                                           | Front pets trade hits until one side is empty. Start-of-battle abilities go in attack order, highest first ([wiki glossary](https://superautopets.wiki.gg/wiki/Glossary)).                     | Order: "faint" and "hurt" pets go where their trigger helps; buffs aimed at the front pet.                                                                                                                                                           | Players call it random; some like the building and find watching the battle boring ([Taptap review](https://www.taptap.io/post/1557189)). Fast fights are hard to follow; one player found the replay button easy to miss ([itch.io](https://itch.io/post/8974512)).                               | Row order is a strong, simple choice. Make replays and the "why" impossible to miss.                                                       |
| **Storybook Brawl**                    | Shop phase: characters, spells and up to 3 treasures. 7 board places in a front row and a back row ([PC Gamer](https://www.pcgamer.com/storybook-brawls-tries-to-iterate-on-what-hearthstone-battlegrounds-started)). | Automatic.                                                                                                                                                                                     | Treasures (pick 1 of 3) change how the board plays; guides call them the most important choice ([HSReplay](https://articles.hsreplay.net/2022/10/11/the-must-know-strategies-to-get-started-in-storybook-brawl/)). The 7-unit cap forces trade-offs. | PC Gamer found it unwelcoming and unfocused. The game was later replaced by a successor.                                                                                                                                                                                                           | A hard cap on slots does most of the work. Rare "treasures" that change rules give runs their story.                                       |
| **Hearthstone Battlegrounds**          | Recruit phase: buy minions, set their order.                                                                                                                                                                          | Minions attack in turn order; combat is automatic.                                                                                                                                             | Order and keywords (taunt, divine shield, deathrattle). A third-party simulator, Bob's Buddy, gives win odds for a board ([HSReplay](https://articles.hsreplay.net/2020/04/24/introducing-bobs-buddy/)).                                             | Its authors say a few attacks can swing a fight; randomness makes some losses feel unearned.                                                                                                                                                                                                       | A simulator that runs your board many times is cheap and players trust it. For us the fight is deterministic, so one run is the truth.     |
| **Teamfight Tactics, Dota Underlords** | Buy and place units on a hex board before each round; scout other players' boards.                                                                                                                                    | Automatic, about 30 s of planning time per round ([guide](https://www.bamboogaming.net/tft/scouting-positioning)).                                                                             | Placement against the board you expect to meet; scouting tells you what to counter ([Mobalytics](https://mobalytics.gg/blog/tft/tft-how-to-adapt-positioning/)).                                                                                     | Underlords reviews say luck decides too much ([Pocket Gamer](https://www.pocketgamer.com/dota-underlords/review/)); it stopped getting updates.                                                                                                                                                    | Scouting is what makes placement a choice instead of a habit.                                                                              |
| **Mechabellum**                        | Each round both players get the same 4 offers, pick and place units; you can't see the enemy's new units until the fight ([Lawod](https://www.lawod.com/?p=13083)).                                                   | Automatic, with a deploy-then-watch loop.                                                                                                                                                      | Clear counters (chaff, chaff clear, carry); you counter what you saw last round ([Final Boss](https://finalboss.io/mechabellum-beginner-guide-to-unit-roles-deployment-and)). Guides tell you to read last round's damage numbers.                   | Some players dislike its random free units.                                                                                                                                                                                                                                                        | Simple counters you can see are the strongest way to make a pre-fight choice matter. Damage per unit after the fight teaches the counters. |
| **Gratuitous Space Battles**           | Design ships, set orders and positions, under a budget ([Positech](https://positech.co.uk/gratuitousspacebattles)).                                                                                                   | You only watch; you can pause, change speed and view each shot's effect during and after ([Jayisgames](https://Jayisgames.com/review/gratuitous-space-battles.php)).                           | Fleet design and orders.                                                                                                                                                                                                                             | Hard to see what is happening when ships leave the screen; GSB2 had easy cheese builds ([PC Gamer](https://www.pcgamer.com/au/gratuitous-space-battles-2-review/)).                                                                                                                                | The after-fight breakdown is how you learn. Keep the whole fight on one screen.                                                            |
| **Despot's Game**                      | Between rooms: buy humans, give them items that set their class, mutate them.                                                                                                                                         | Large automatic brawls.                                                                                                                                                                        | Army mix and items.                                                                                                                                                                                                                                  | Reviews call runs too random; there is no map, so you can't plan a route ([Gigazine](https://gigazine.net/gsc_news/en/20211114-dystopian-army-builder/), [But Why Tho](https://butwhytho.net/2022/10/09/review-despots-game-dystopian-army-builder-brings-rogue-lite-to-auto-battlers-pc/)).       | Show the next fight before you commit. Random paths with no preview remove the choice.                                                     |
| **Loop Hero**                          | Place tiles around a loop; equip gear.                                                                                                                                                                                | Fully automatic fights while the hero walks.                                                                                                                                                   | Gear and tile placement.                                                                                                                                                                                                                             | The most common complaint: you are a spectator, gear is luck, and even at higher speed it feels slow ([TechRadar](https://www.techradar.com/news/i-love-loop-hero-but-it-doesnt-respect-my-time-at-all), [RPGamer](https://rpgamer.com/2021/03/loop-hero-deep-look/)).                             | Short fights and a skip button. Choices must be about the coming fight, not only stat gear.                                                |
| **The Last Flame**                     | Between fights: heroes, items, relics, the path and positions ([Steam](https://store.steampowered.com/app/1830970/The_Last_Flame)).                                                                                   | Automatic.                                                                                                                                                                                     | Path choice and build; players compare it to a solo Teamfight Tactics at your own pace.                                                                                                                                                              | Grind and little visual variety. Covered in more depth in [autobattler-combat.md](autobattler-combat.md).                                                                                                                                                                                          | A solo autobattler works when the map lets you pick your fights.                                                                           |
| **Soda Dungeon 1 and 2**               | Pick party members and gear; Soda Dungeon 2 adds Soda Script for party behaviour ([Steam](https://store.steampowered.com/app/946050)).                                                                                | Auto battles through floors, as an idle game.                                                                                                                                                  | Party and gear.                                                                                                                                                                                                                                      | Long stretches of no input (15+ minutes per area); AI choices look poor at times.                                                                                                                                                                                                                  | An auto-resolved dungeon fight must stay short and have a reason to watch.                                                                 |
| **Hero's Hour**                        | Army, hero, spells; place troops before battle ([Steam](https://store.steampowered.com/app/1656780)).                                                                                                                 | Real-time auto battle, but you can still cast spells and give commands.                                                                                                                        | Army mix and spells.                                                                                                                                                                                                                                 | Fights can be chaotic.                                                                                                                                                                                                                                                                             | Not a pure up-front game. A middle ground we already ruled out (e15).                                                                      |

### Rules you write for your allies

| Game                            | What you decide                                                                                                                                                                                                                                                                                                                                                                                             | Lesson                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Final Fantasy XII gambits**   | A list of "condition, then action" rules per character; the first rule from the top whose condition holds fires ([StrategyWiki](https://strategywiki.org/wiki/Final_Fantasy_XII/Gambits)). New conditions are bought in shops. Order matters as much as the conditions.                                                                                                                                     | Very expressive, but it is programming. For a 30 s fight, one rule for the party is enough.                                         |
| **Dragon Age: Origins tactics** | Condition and action slots per companion; you get more slots with levels or skills (sources disagree on the counts, [wiki](https://dragonage.fandom.com/wiki/Combat_Tactics)). Players found the default list limiting.                                                                                                                                                                                     | Few slots force you to choose what matters.                                                                                         |
| **Unicorn Overlord**            | Each unit has a priority list of skills with up to 2 conditions each. Fights are always automatic. Before a fight you see a forecast of the damage; a player reported it is exact ([Prima](https://primagames.com/gaming/unicorn-overlord-tactics-and-conditions-explained), [forum](https://forums.penny-arcade.com/discussion/236345/unicorn-overlord-vanillaware-tactics-and-spherical-continuity/p13)). | Deterministic fights make an exact forecast possible. A full forecast solves the fight for you, so e18 shows threats, not outcomes. |
| **Ogre Battle (1993)**          | One tactic per squad: Best (biggest threat), Strong (most HP), Weak (fewest HP), Leader ([Wikipedia](https://en.wikipedia.org/wiki/Ogre_Battle:_The_March_of_the_Black_Queen)). Killing the leader makes the squad leave.                                                                                                                                                                                   | The simplest version that works: one word decides targets for the whole squad. e18's focus rule copies this idea.                   |

### Formation and dice (not autobattlers, but useful)

| Game                  | What it shows                                                                                                                                                                                                                                                                                        | Lesson                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Darkest Dungeon**   | Each skill works only from some ranks and reaches some ranks; order decides what you can use and who gets hit ([guide](https://www.gamepressure.com/newsroom/darkest-dungeon-2-how-to-change-party-order-in-combat-and-outside/z555f5)). In DD2 you set the order at the Crossroads or in the coach. | Slot rules make order a real choice. e14 already has them.                                              |
| **Slice & Dice**      | Turn-based dice fights; between fights you pick an item or a class upgrade ([PC Gamer](https://www.pcgamer.com/games/roguelike/heres-slice-and-dice-the-roguelike-rpg-where-each-of-your-party-members-is-a-different-die)). Undo is free up to your last reroll.                                    | Not automatic. Between-fight picks that change dice faces are a good model for small, visible upgrades. |
| **Dicey Dungeons**    | Checked: it is **not** an autobattler. You place rolled dice into equipment each turn ([Wikipedia](https://www.wikipedia.com/wiki/Dicey_Dungeons)).                                                                                                                                                  | Only the equipment-slot limit is relevant: a small backpack forces trade-offs.                          |
| **Legend of Keepers** | You set rooms of monsters and traps; combat is turn-based, not automatic ([TechRaptor](https://techraptor.net/gaming/reviews/legend-of-keepers-review)). Reviewers say the best defenders show up fast and the rest get dropped.                                                                     | A dominant setup appears quickly when enemies don't vary. Enemy variety is what keeps choices alive.    |

## 2. Ways to make up-front choices matter

Each idea, with how e18 uses it.

1. **Scouting.** Show the enemies and exactly what they do before you choose: which
   slot each attack aims at, armour, who heals, who sets fire. Mechabellum and TFT show
   that counters only matter if you see what you counter. e18: every enemy card lists
   its abilities with a small 4-slot diagram, and your slots show which enemies aim at
   them.
2. **Counters and synergies.** A few hard counters you can name: poison ignores
   armour; hook pulls a back-row archer to the front; ward cuts the brute's big hits;
   oil then fire makes a blaze; frost slows a caster's cooldown. Synergies inside your
   own 3 skills (oil + firebolt) compete with counters (miasma for the warden).
3. **Formation and order.** Darkest Dungeon's slot rules: skills work from some slots
   and reach some slots, enemies aim at slots. Archers hit the back, brutes the front,
   spiders the weakest. Order then decides who takes what.
4. **Ally rules.** One focus rule for the party (Ogre Battle): front, weakest, back,
   or biggest. Gambit lists are too much for a 30 s fight.
5. **Timed abilities.** Cooldowns in seconds, like The Bazaar. Fast cheap hits against
   slow big ones; frost and poison work on the clock.
6. **Charms with set triggers.** One charm per fight that fires once: "when an ally
   drops below 40%, heal 10", "at 1 s, ward your front two slots", "the first ally who
   would fall stays at 1 HP". The trigger is shown and logged, so you see it work.
7. **Risk choices.** In a run, pick the next fight from two doors, each showing its
   enemies and its reward. A harder door gives a better reward.
8. **Builds that grow.** After each won fight pick 1 of 3: a new skill, a new charm,
   or an upgrade. More options, same 3 places: choosing gets harder, not easier.
9. **Limited slots.** 3 skill places for everything, including summons. A summon is a
   body that blocks and hits, but costs a damage or utility skill.
10. **Boss phases.** The boss changes what it does at HP thresholds, and the fight
    pauses so you can change your setup. A setup that beats phase 1 should lose
    phase 2.

### Showing why a fight went the way it did

- **Damage by source**, both ways: which of your skills, units and ground effects did
  the damage, and which enemy abilities hurt you (Gratuitous Space Battles,
  Mechabellum's damage numbers).
- **Key moments**: kills, ally deaths, combos (blaze, flash), the charm firing, the
  biggest hit, phase changes, each with its time. Click one to jump the replay there.
- **What beat you**: the enemy ability that did the most damage to the hero, and the
  moment the hero's side fell behind for good.
- **One change that flips it**: the fight is deterministic, so after a loss the game
  can try every single change to your setup (one skill, one swap, the focus, the charm)
  and name one that wins. After a win it names the closest call instead. This is the
  strongest teaching tool we have, and it costs a few hundred simulations.
- **HP over time** for both sides, as a small graph.
- **Replay** at 1x or 2x, and skip.

## 3. How our pieces map

| Piece                              | In e18                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hero                               | Slot-bound unit with 3 chosen skills on cooldowns. Losing the hero loses the fight.                                                                                                  |
| Pet (Rustback beetle, e17's model) | Always comes. Fixed kit: Bite (front) and Drag (pulls a back-row enemy forward). Uses the party's focus rule.                                                                        |
| Up to 2 summons                    | Bone Servant (blocks, bashes and pushes) and Spirit Totem (heals the weakest ally) are hero skills: bringing one takes one of the 3 places, and the unit starts the fight in a slot. |
| Ground effects                     | Fire, oil, ice, poison and ward live on slots, from e14. Fire on oil becomes a blaze; fire on poison flashes; fire on ice melts both. Ice slows cooldowns by half.                   |
| Push and pull                      | e14's rules: a pushed unit swaps with the one behind (both take 1); at the back wall it takes 3; oil makes it slide one further. Heavy units ignore a 1-slot push.                   |
| Side-view slots                    | 4 slots per side, no gaps, everyone behind steps up when a unit falls.                                                                                                               |

## 4. e18 proposal

### What you decide before a fight (four choices)

1. **Skills**: 3 of the hero's owned skills (9 in a single fight, fewer at the start of
   a run). Summons are skills.
2. **Formation**: the order of hero, pet and your summons in your slots.
3. **Focus**: front, weakest, back or biggest. All your units use it to pick among the
   targets they can reach.
4. **Charm**: 1 of your owned charms, with a fixed trigger.

That's about 8,000 setups in a single fight: a lot for a person, few enough for a bot to
try them all.

### Fight rules

- Time in steps of 0.1 s; 1 s of fight is 1 s at 1x. No randomness: the same setup
  always gives the same fight.
- Every ability has a cooldown, the slots it can be used from and the slots it reaches.
  When it's ready and has a target, it fires. A unit that can't use anything from its
  slot for 1.5 s steps one slot towards where it can.
- Enemies aim by kind: brutes and wardens at the front, archers at the back, spiders
  at the weakest, priests at fixed slot pairs (fire rain on slots 1-2, bile on 2-3).
- From 30 s "the dark" hurts every unit on both sides, rising each 5 s, so fights end
  by about 45 s. It is logged as its own damage source.
- Win: every enemy falls. Loss: the hero falls.

### Boss with phases

The Ossuary King, three phases:

1. **Bone wall** (100-60%): the King in front with armour 3 and a pushing smash, two
   archers behind. Wants poison or armour breaking, and ward in front.
2. **Rite of embers** (60-30%): the King steps to the back, raises two brutes in front
   and rains fire on your slots 1-3. Wants reach to the back (hook, firebolt, focus
   back), frost on the King.
3. **Last stand** (below 30%): the King comes forward without armour, smashes faster
   and pulses damage over all your slots. Wants burst and healing.

Between phases the fight pauses, you see the next phase's abilities, and you choose a
new setup (all four choices; hero and pet HP carry over, ground clears).

### A short run (`?run`)

Four fights, then the boss. Before each fight, pick one of two doors; each shows its
enemies and its reward (the harder door has a rarer reward). After each win, pick 1 of
3 rewards: a new skill, a new charm, or an upgrade (+damage on a skill, +HP for hero or
pet, a faster cooldown). The hero starts with 5 skills and 2 charms. HP refills
between fights; a loss ends the run.

### Content

- 5 enemy kinds from e14 (brute, archer, priest, spider, warden) plus the boss.
- 6 hand-made fights, each built so a different counter wins: archers behind a warden,
  spiders that dive the weakest, a priest's fire rain, a heavy front, a mixed line, a
  mini-boss.
- A generator: budget by difficulty, melee in front, casters behind, a role mix rule so
  each fight has a clear threat, and sometimes oil or poison on the ground at the start.

### Bots and gates

- **Strong**: tries every setup and picks the best (win, then HP left, then time).
- **Default**: one fixed sensible setup (Strike, Firebolt, Bone Servant; servant,
  hero, pet; focus front; healing charm).
- **Random**: a random setup per fight.
- **Blind**: the single setup that wins most over all fights, used everywhere. This is
  the "one build wins everything" test: if it comes close to strong, scouting doesn't pay.

Proposed gates (to check against the numbers, not facts):

| Gate             | Pass if                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Choices matter   | strong beats default by 25+ win points and random by 40+ on generated fights                                                   |
| Adapting pays    | strong beats blind by 15+ win points; strong's best setup differs between fights (no one skill set in more than 30% of fights) |
| No dead option   | every skill, focus rule and charm is in strong's pick in 5%+ of fights; none in more than 70%                                  |
| Fights are close | in a typical fight 5-50% of all setups win; strong's winning fights end with the hero at a median 30-80% HP                    |
| Fight length     | median 15-40 s at 1x for strong's fights; 90% under 45 s                                                                       |
| Features count   | turning off ground effects, push/pull, focus or charms changes strong's best setup in 25%+ of fights                           |
| Boss phases      | re-choosing between phases beats keeping the phase-1 setup by 20+ win points                                                   |
| Readability      | after a default loss, a single change wins in 50%+ of fights (losses are explainable)                                          |
