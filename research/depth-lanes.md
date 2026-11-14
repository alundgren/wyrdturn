# Depth lanes: first-person combat in lanes ahead of the party

Research date: 2026-11-14. This is a research proposal, not a prototype verdict.

**Recommendation (opinion):** test a 3-lane, 5-row field in front of a party that holds one
fixed front line. The party never steps forward or back; the hero and the wolf step
sideways between the three lanes. Enemies walk down their lanes toward the line and show
committed intents on floor cells. Reach is counted in rows: a sword hits row 1, a spear rows
1-2, a bolt the first enemy in the lane, a thrown flask any cell. Blockers (summons, ice)
stand in lanes to stop walkers and catch arrows, but not spears or lobbed spells. Keep it to
three lanes, five enemy kinds and a handful of cards, because readability beat feature
count in every playtest so far.

## Evidence and project context

I read `design/direction.md`, `design/combat-exploration.md`, `research/combat-views.md`,
`research/autobattler-combat.md` and the RESULT files of e11, e14 and e15 (e15 lives on the
`e15-hex-autobattler` branch). Owner playtests so far:

| Prototype                       | Verdict from play                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| e11, fights on the explore grid | Boring: it turns into stepping back and hitting, or strafing around a fountain                    |
| e13, tactics board              | Messy and tedious                                                                                 |
| e14, Darkest Dungeon slots      | Promising, needs tuning; simple readable positions were the good part                             |
| e15, hex autobattler            | Too messy (bots also showed placement barely mattered and 40% of damage came from enemy-on-enemy) |

The owner's brief for e16: keep the blobber viewport, extend it into depth lanes, keep "a
bit of positioning with reach, depth, putting up blockers, sideways movement", and "a grid
where the enemies move but you don't, sort of".

External mechanics below come from reviews, guides, wikis and developer statements found by
web search. Lessons and every number in the proposal are my opinions or hypotheses. I did
not play any of these games for this report. Community sources (wikis, forum posts) can be
out of date; I mark them where it matters.

## 1. Findings per game

### Shogun Showdown (Roboatino, 2023)

- **Positions:** one horizontal line of tiles. You move forward or back, turn around, wait,
  queue attack tiles and fire them. Facing matters: the bow fires the way you face, the
  sword hits tiles next to you. Tiles can move enemies, including into each other's attacks.
  [Turn Based Lovers](https://turnbasedlovers.com/review/shogun-showdown-a-roguelite-that-really-packs-a-punch-review/),
  [PC Gamer review](https://www.pcgamer.com/games/roguelike/shogun-showdown-review),
  [Yahoo / GamesRadar](https://sg.news.yahoo.com/roguelike-obsession-turn-based-strategy-103023324.html)
- **What stops one trick:** every action costs a turn and every enemy acts after it, so
  "move away" is never free. Enemies come from both sides, so there is no safe end of the
  line. Enemy attacks are fixed in a direction, so swapping places makes an attack point at
  nothing or at another enemy.
- **Readable because:** one line, few units, every enemy telegraphs its attack and when it
  comes. The developer listing stresses minimal randomness.
- **What failed:** longevity and random upgrades, not the combat
  ([Steam summary](https://vaporlens.app/app/2084000/shogun_showdown)).
- **Lesson (opinion):** one axis of movement is enough for real decisions if each move costs
  something and attacks are fixed in space. Our lanes are the same idea turned sideways.

### Cobalt Core (Rocket Rat Games, 2023)

- **Positions:** two ships face each other across a column grid; each ship part sits in a
  column. You slide your ship left and right (move cards or the Evade resource) so your
  cannons line up with weak enemy parts and enemy cannons point at empty space or armour.
  Drones and junk in the middle can be moved to block shots.
  [PC Gamer](https://www.pcgamer.com/cobalt-core-review/),
  [Rogueliker](https://rogueliker.com/cobalt-core-review),
  [Turn Based Lovers](https://turnbasedlovers.com/review/cobalt-core-review)
- **What stops one trick:** lining up to shoot and stepping out of the way pull in opposite
  directions; movement is a spent resource; the enemy also moves.
- **Readable because:** intents show damage per cannon, per column.
- **What failed:** enemy movement is not telegraphed, and reviewers say it can make or break
  a fight.
- **Lesson:** this is the closest match to "sideways movement matters". Make alignment
  (stand in the lane you want to hit) and dodging (leave the lane that will be hit) compete,
  make each step cost energy, and telegraph enemy lane changes too.

### Plants vs. Zombies (PopCap, 2009) and lane defense

- **Positions:** 5 or 6 lanes; zombies walk down one lane; most plants only hit their own
  lane. Walls (Wall-nut) stall a lane. Director George Fan dropped classic tower-defense
  mazing as too awkward and moved to lanes; Tapper is a cited influence.
  [PvZ wiki](https://plantsvszombies.wiki.gg/wiki/Plants_vs_Zombies),
  [PC Gamer: early designs](https://pcgamer.com/plants-vs-zombies-turns-10-creator-shows-original-designs),
  [StrategyWiki](https://strategywiki.org/wiki/Plants_vs._Zombies/Gameplay)
- **What stops one trick:** zombie types counter single answers (poles vault walls,
  diggers skip the front, balloons fly over), and waves keep arriving, so stalling is a
  clock, not a win.
- **Readable because:** one direction of travel, each lane a clear strip.
- **What failed:** one player noted two far lanes looked like one lane for a while. Lane
  separation on the floor has to be strong.
- **Lesson:** blockers are good when some enemies ignore them. Reinforcement waves turn
  stalling into a cost.

### Inscryption (Daniel Mullins, 2021)

- **Positions:** 4 lanes per side; a card attacks the opposing slot; an empty slot means
  damage goes through. Sigils change reach: Airborne flies over blockers, Mighty Leap blocks
  fliers, Bifurcated and Trifurcated Strike hit neighbouring lanes. The opponent's next cards
  are shown in a preview row.
  [PC Invasion guide](https://pcinvasion.com/inscryption-beginners-guide-card-upgrades-vendors/2),
  [Superjump: Kaycee's Mod](https://superjumpmagazine.com/kaycees-mod-101-the-basics)
- **What stops one trick:** blocking is a real choice because some attackers skip blockers
  and some blockers only stop some attackers.
- **Lesson:** give attacks a small set of named reach rules that interact with blockers:
  "stopped by the first body", "goes over", "hits two deep".

### Monster Train (Shiny Shoe, 2020) and Wildfrost (Deadpan, 2023)

- **Monster Train:** enemies climb floor by floor toward the Pyre; attacks hit the front
  unit of a floor first, so the front unit soaks. Spells affect one floor.
  [Rogueliker](https://rogueliker.com/monster-train-review/),
  [Medium: Going Rogue](https://medium.com/@gwenckatz/going-rogue-monster-train-de73fde50fea)
- **Wildfrost:** two rows of three slots per side; a basic attack hits the front unit in the
  opposite row; every unit shows a countdown to its next action.
  [Wildfrost wiki](https://wildfrostwiki.com/Getting_Started),
  [The Sixth Axis](https://thesixthaxis.com/2023/04/11/wildfrost-review-a-hot-new-card-game)
- **What failed:** Monster Train players reported that drawing units in the wrong order
  could cripple a run, and Monster Train 2 reworked that. Wildfrost reviews note that random
  draws can leave a deck without a plan.
- **Lesson:** "the front body takes the hit" is instantly readable. Order-of-draw bad luck
  needs a fallback that is always available (here: the sideways step and a basic strike
  card).

### Wizardry and Etrian Odyssey (front and back rows)

- **Positions:** Wizardry: the front row (usually three) is the only part of the party that
  melee can reach and the only part that can melee; spells and missiles reach anyone. Later
  games let the back row use slings and long weapons. Etrian Odyssey: enemies also stand in
  rows, the front row guards the back, and skills like piercing arrows go through the front
  row; Line Guard protects a whole row.
  [Wizardry wiki: Party](https://wizardry.wiki.gg/wiki/Party),
  [Wurb: Wizardry III combat](https://www.wurb.com/stack/archives/684),
  [Siliconera: EO IV classes](https://www.siliconera.com/etrian-odyssey-ivs-killer-class-of-assassins-and-hp-restoring-dancers/)
- **What stops one trick:** not much. Positions are set before the fight and rarely change.
  Community advice converges on one formation (fighters front, casters back). Sources
  disagree on details between games.
- **Lesson:** depth-based reach (melee 1, piercing 2, ranged any) is the classic, easy to
  learn rule. But rows that never change become a menu choice, not a fight decision.
  Something has to move during the fight: here, the enemies walk down the rows.

### Vambrace: Cold Soul (Devespresso, 2019)

- **Positions:** Darkest Dungeon style ranks; short, medium and long range per class; the two
  front spots are for melee.
  [COGconnected](https://cogconnected.com/review/vambrace-cold-soul-review/),
  [Cubed3](https://cubed3.com/review/5636/1/vambrace-cold-soul-xbox-one.html)
- **What failed:** reviews call the fights shallow and repetitive (2/5 to 3.5/5); the move
  lists are thin, so the right formation is obvious and stays right.
- **Lesson:** range bands alone do not make decisions. Positions need to be threatened and
  changed by the fight itself.

### Darkest Dungeon (Red Hook, 2016)

- **Positions:** 4 ranks a side; skills list the ranks they work from and reach; shuffles and
  knockback move heroes out of their useful rank.
  [DD2 wiki: Skills](https://darkestdungeon2.wiki.fextralife.com/Skills)
- **What failed (and what e14 confirmed):** being moved out of position switches off skills,
  which is clear but punishing; players have to check each skill's ranks one by one. In e14,
  displacement that cancels an enemy action became the go-to move (52% of strong-bot
  turns).
- **Lesson:** keep "where can this be used from" to one rule per card, shown on the card. Let
  displacement move an attack rather than delete it.

### Into the Breach (Subset Games, 2018)

- **Positions:** 8×8 board; every enemy attack is telegraphed on tiles before you act; most
  weapons push. Pushing an enemy moves its attack with it, so a push can turn an attack onto
  another enemy or into empty ground. The developers wanted every death to feel like your
  own fault and kept numbers small.
  [80.lv on the GDC 2019 postmortem](https://80.lv/articles/gdc-2019-an-inside-look-at-into-the-breach),
  [GDC Vault](https://www.gdcvault.com/play/1025772/),
  [Game Developer: Road to the IGF](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-)
- **What stops one trick:** you protect buildings, not only your units, so dodging is not
  enough; each mech has one or two weapons, so you cannot answer everything every turn.
- **Lesson:** committed intents on cells, and "the attack travels with the attacker", are the
  most readable rules we know. In e15 they also let bots win by making enemies hit each
  other (40% of damage). E16 should keep the travelling attack but stop enemies hurting
  each other.

### Ring of Pain (Twice Different, 2020)

- **Positions:** cards in a ring around you; you step one way or the other; living enemies
  block the way and some attack from further back in the ring; exploding enemies walk to you.
  [GameSpot](https://www.gamespot.com/reviews/ring-of-pain-review/1900-6417596/),
  [Prima guide](https://primagames.com/gaming/ring-of-pain-enemy-guide)
- **What failed:** reviewers mention luck and mechanics that need more explanation.
- **Lesson:** a tiny, first-person-ish set of positions (two neighbours) still gives choices
  when enemies have range and blocking. Unexplained rules hurt more than fewer rules.

### Mega Man Battle Network and One Step From Eden (3×3 per side)

- **Positions:** each side moves inside its own 3×3 panels and shoots across; rows and
  columns decide what lines up; cracked or broken panels change where you can stand.
  [Wikibooks: combat basics](https://en.wikibooks.org/wiki/Mega_Man_Battle_Network/Combat_Basics),
  [Game mechanics notes](https://saschb2b.github.io/game-mechanics/games/mega-man-battle-network/battle-system)
- **What failed (One Step From Eden):** real-time speed plus many effects; reviewers say the
  attack warnings stop helping when the screen fills with effects.
  [The Xbox Hub](https://www.thexboxhub.com/?p=119780),
  [Nintendo Life](https://www.nintendolife.com/reviews/switch-eshop/one_step_from_eden)
- **Lesson:** a 3-wide strip is enough room for dodging to matter. Turn-based keeps the
  warnings readable; we must also cap how many effects can be on screen.

### Legend of Grimrock (Almost Human, 2012): the trap to avoid

- Real-time grid blobber. Reviewers and players describe combat as strafing and turning
  while cooldowns reset, and circling an enemy to hit its flank before it turns ("kiting").
  It only gets tense when you are cornered by several enemies.
  [Scientific Gamer](https://scientificgamer.com/thoughts-legend-of-grimrock/),
  [RPG Codex review round-up](https://rpgcodex.net/article.php?id=8084),
  [Game Wisdom analysis](https://game-wisdom.com/?p=743)
- **Lesson:** this is the e11 problem in a shipped game. Free movement in every direction plus
  enemies that chase you means retreating is always right. Removing forward and backward
  movement for the party, and making every step cost energy, removes the loop by rule
  rather than by tuning.

### Checked and not useful

- **Book of Demons** is isometric, not first person; cards are skills and gear; I found no
  lane combat. Reviewers found the combat repetitive.
  [TechRaptor preview](https://techraptor.net/content/book-of-demons-preview)
- **Dungeon Encounters** uses ATB combat with HP and two armour bars and no front or back
  rows; positioning lives on the exploration map, not in fights.
  [RPG Site](https://www.rpgsite.net/review/12067-dungeon-encounters-review),
  [Wccftech](https://wccftech.com/review/dungeon-encounters-live-and-die-by-the-atb/amp/)
- I found no shipped first-person blobber where enemies walk down lanes in front of a fixed
  party line. The idea is a mix of lane defense (PvZ), alignment (Cobalt Core), committed
  cell intents (Into the Breach) and row reach (Wizardry). Treat that as unverified: the
  owner mentioned "a few games out there", and a search on specific titles may find them.

## 2. What the findings say for e16

1. **Remove retreat by rule.** The party holds row 0. No forward or back moves for the hero or
   wolf. That ends kiting (Grimrock, e11).
2. **Sideways steps cost energy** and compete with alignment: lane cards only hit your own
   lane (Cobalt Core). A step costs 1 of 3 energy, so dodging, lining up and playing cards
   share one budget (Shogun Showdown).
3. **Committed cell intents**, shown as red cells with the damage number. Stepping out of a
   red cell dodges it; the enemy then has to spend its next turn shifting lanes. That is a
   real gain bought with energy, not a free escape.
4. **Waves make stalling a cost** (PvZ). Reinforcements arrive in row 5 on set rounds; the
   fight has a round limit.
5. **Reach in rows** with three named rules: _front_ (hits the first body in the lane),
   _pierce_ (hits two rows), _lob_ (hits a chosen cell, ignores bodies) (Inscryption,
   Wizardry, Etrian Odyssey).
6. **Blockers stop some threats, not all:** summons stop walkers and arrows, spears reach
   past them, lobs ignore them (PvZ, Inscryption).
7. **Pushes move attacks, not delete them,** and enemies never damage each other
   (Into the Breach, e14 and e15 lessons).
8. **Cap clutter:** 3 lanes, at most 6 enemies on the field, ground effects limited to the
   field, one intent marker per enemy (One Step From Eden, e13, e15).

## 3. Concrete e16 proposal

Everything below is a proposed experiment. Do not change direction.md until a playable result
exists.

### Field

- **3 lanes × 5 rows** in front of the party line. Cells are 2 m like the explore grid, so the
  field is 6 m wide and 10 m deep: a corridor in front of you.
- **Row 0 is the party line**, three cells (left, middle, right). The hero, the wolf and at
  most one totem stand there. Row 1 is next to the line, row 5 is the far end where
  reinforcements enter.
- **The camera** is the party's eyes, a little behind and above row 0, sliding sideways with
  the hero (a blobber strafe). It keeps all 15 field cells and the three line cells in view.
- One unit per cell. Enemies never stand on row 0.

### Your side

| Unit         |  HP | Moves                                                    | Actions                                                                           |
| ------------ | --: | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Hero         |  30 | Step one lane sideways: 1 energy; swaps with the wolf    | 12-card deck, hand 5, 3 energy                                                    |
| Wolf         |  16 | One free sideways step per turn, into an empty line cell | Bite (3 to row 1 in its lane, every turn); Shove (cooldown 2); Guard (cooldown 3) |
| Bone Servant |   8 | Stands where summoned (rows 1-2), never moves            | Blocks walkers and arrows; Bash: 2 to the enemy in front and push it 1 row back   |
| Spirit Totem |   6 | Stands on an empty line cell or row 1                    | Ward: put a ward on a line cell for one enemy phase                               |

- **Wolf Shove:** push the enemy in row 1 of the wolf's lane one lane sideways (choose the
  side). **Wolf Guard:** the next hit on the hero this enemy phase deals 4 less.
- At most 2 summons. Summons last until killed.

### Cards (12)

| Card         | Cost | Reach                           | Effect                                                                     |
| ------------ | ---: | ------------------------------- | -------------------------------------------------------------------------- |
| Strike ×2    |    1 | front: row 1 in your lane       | 5 damage                                                                   |
| Spear Thrust |    1 | pierce: rows 1 and 2, your lane | 3 to each                                                                  |
| Firebolt ×2  |    1 | first enemy in your lane        | 3 damage, sets its cell on fire                                            |
| Shove        |    1 | front                           | push the enemy 2 rows back                                                 |
| Hook         |    1 | first enemy in your lane        | pull it to row 1                                                           |
| Oil Flask    |    1 | lob: any field cell             | oil on the cell and the one behind it                                      |
| Frost        |    1 | lob: rows 1-3                   | ice on the cell; a walker that enters stops there; 2 damage to an occupant |
| Miasma       |    2 | lob: rows 2-5                   | poison on the cell and both side neighbours                                |
| Bone Servant |    2 | any empty cell, rows 1-2        | summon                                                                     |
| Spirit Totem |    2 | empty line cell or row 1        | summon                                                                     |

The hero's lane decides what most cards can reach. That is the alignment half of sideways
movement.

### Enemies and intents

Each enemy shows one intent: an arrow for a move, red cells with a number for an attack.

| Enemy        |  HP | Behaviour                                                                    | Reach rule                                 | Job                                 |
| ------------ | --: | ---------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| Ghoul        |  12 | Walks 1 row a turn; at row 1 claws the line cell in its lane for 5           | front                                      | Pressure; teaches blocking          |
| Spearman     |  10 | Walks to row 2 and stops; thrusts rows 1 and 0 of its lane for 4             | pierce: hits through a blocker             | Teaches that blockers are not walls |
| Bone Archer  |   8 | Stays in rows 4-5, shifts lanes to line up; shoots its lane for 4            | front: the first body in the lane takes it | Rewards blockers and dodging        |
| Bile Priest  |   9 | Stays in rows 4-5; lobs onto a line cell: 2 damage and poison (or fire)      | lob: ignores blockers                      | Forces sideways steps               |
| Cave Spider  |   6 | Walks 2 rows a turn; at row 1 changes lane toward an open lane; bites for 3  | front                                      | Flanker; punishes an unguarded lane |
| Grave Warden |  16 | Walks every other turn; armour 2; heavy (ignores 1-row pushes); bashes for 4 | front; lane shots hit it first             | Shields what walks behind it        |

- **Walking:** if the cell ahead holds a summon or another enemy, the walker stops. Next turn
  it attacks the summon (its intent says so).
- **Committed:** attacks are fixed to cells relative to the enemy when announced. Pushing an
  enemy moves its red cells with it. An attack on an empty cell misses. Enemy attacks never
  hurt enemies.
- **Archer shots** follow the lane, and hit the first body (ally or summon) at the moment
  they fire. The red cell shows the current first body, so a summon placed in front moves
  the marker.
- **Empty lane:** a walker at row 1 with nobody on the line cell in its lane shifts one lane
  toward the nearest ally instead of attacking. That turn is the price of your dodge.

### Ground effects (field and line cells)

| Effect | How it starts        | What it does                                                 | Lasts           |
| ------ | -------------------- | ------------------------------------------------------------ | --------------- |
| Fire   | Firebolt, priest lob | 2 damage at end of round to whoever stands there; 2 on entry | 2 rounds        |
| Oil    | Oil Flask            | Fire on oil becomes blaze: 4 damage, spreads to touching oil | until burned    |
| Ice    | Frost                | A walker entering stops there for the turn; fire melts it    | 3 rounds        |
| Poison | Miasma, priest lob   | 1 damage at end of round                                     | 3 rounds        |
| Ward   | Totem                | Hits on that line cell deal 2 less                           | one enemy phase |

No other combos in the first version (e13 and e14 found explosions easy to exploit).

### Push and pull

- **Along a lane:** Shove pushes back 2 rows; Bone Servant's Bash 1 row; Hook pulls forward
  to row 1. A pushed unit that hits another enemy stops; both take 2. Past row 5 it slams the
  back wall for 3. Cells crossed trigger fire, poison and ice.
- **Across lanes:** wolf Shove, 1 lane. Into the side wall: 3. Into an enemy: both take 2.
- Moving an enemy moves its attack. Pushing a ghoul back makes its claw hit an empty cell;
  pushing an archer sideways sends its arrow down the other lane.

### Turn order

1. Enemies show intents.
2. Player turn: draw to 5, 3 energy. Play cards, step the hero, use the wolf and summons in
   any order. Every card and ability shows its result before you commit (pale HP loss, moved
   red cells, crossed-out intents).
3. Enemy phase: each enemy does its intent, front row first.
4. Ground ticks, effects fade, waves arrive in row 5 if due.
5. Enemies announce new intents.

Win: no enemies left and no waves to come. Loss: the hero dies, or the round limit ends
(12 here; the build uses 20).

### Fights

| #   | Name          | What it teaches                           | Enemies                                           |
| --- | ------------- | ----------------------------------------- | ------------------------------------------------- |
| 1   | Bone Gate     | Reach and alignment                       | 2 ghouls, 1 archer                                |
| 2   | Arrow Lanes   | Blocking arrows, dodging                  | 2 archers in side lanes, 1 ghoul; wave of 1 ghoul |
| 3   | Spear Wall    | Pierce reach, push and pull               | 2 spearmen, 1 ghoul                               |
| 4   | Oil Cellar    | Oil and fire, ice stalling                | Oil on the middle lane, 2 ghouls, 2 spiders       |
| 5   | Bile Choir    | Lobs that ignore blockers; sideways steps | Warden in front, 2 priests behind; wave           |
| 6   | Warden's Wall | All of it                                 | Warden, archer, priest, spiders; 2 waves          |

**Generator:** a seed and a difficulty 1-5. An HP budget picks enemies by role (walkers start
in rows 3-5, shooters and casters in rows 4-5), splits the budget into a first group and 0-2
waves, and may place oil or ice. A validator rejects fields where the first enemy phase can
deal more than 60% of the hero's HP, or where two enemies share a cell.

### Bots

- **random:** random legal actions, then end turn.
- **greedy:** one action at a time, each picked by the score after simulating the enemy
  phase (so it reads intents).
- **strong:** beam search over the whole turn, each line scored after the enemy phase and the
  new intents.
- **Fixed policies** for the dominant pattern test: _middle_ (the hero never leaves the
  middle lane, otherwise strong), _edge_ (same, left lane), _block-front_ (always summons in
  front of the hero first), _hit-and-dodge_ (strike, then step out of the red cell when it
  can), _damage-only_ (only damage cards), _no-move_ (strong, but neither hero nor wolf may
  step).
- Bots see only what a player sees: intents and the field, never the deck order or waves
  that have not been announced (waves are announced one round ahead).

### Metrics

| Metric             | Report                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success and pacing | Win rate (Wilson 95%) per bot and difficulty; rounds per fight; hero and wolf survival                                                                                                                   |
| Decision variety   | Distinct outcomes per turn; near-best lines; how often the best turn repeats last turn's kinds                                                                                                           |
| Dominant patterns  | Strong minus each fixed policy, in win points, with a paired bootstrap interval                                                                                                                          |
| Lane use           | Share of turns the hero ends in each lane; sideways steps per fight; steps that dodge a red cell                                                                                                         |
| Reach and depth    | Damage by reach rule (front, pierce, first-in-lane, lob); kill row distribution                                                                                                                          |
| Blockers           | Summons made, hits they absorbed, arrows caught, rounds of walker delay                                                                                                                                  |
| Ground, push, pull | Ignites, blazes, units forced through hazards, collisions, wall slams                                                                                                                                    |
| Companion          | Wolf death rate; bites, shoves, guards per fight                                                                                                                                                         |
| Step-back trap     | Share of strong turns that attack and then step out of a red cell ("hit and dodge")                                                                                                                      |
| Feature-off tests  | Win change with each turned off: ground cards, push and pull, sideways steps, summons, all blockers, wolf, wolf skills, depth reach (every attack reaches any row), lane reach (lane cards hit any lane) |

### Failure gates (provisional)

| Gate                   | Fails when                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Dominant lane          | _middle_ or _edge_ policy within 5 points of strong, or the hero ends 70%+ of turns in one lane         |
| Dominant block         | _block-front_ within 5 points of strong, or 70%+ of summons go to one lane-and-row                      |
| Sideways matters       | Turning off sideways steps costs less than 10 win points                                                |
| Depth and reach matter | "Every attack reaches any row" or "lane cards hit any lane" changes win rate by less than 5 points      |
| Blockers matter        | Turning off all blockers costs less than 5 points                                                       |
| Step-back trap         | _hit-and-dodge_ within 10 points of strong, or 40%+ of strong turns are hit-and-dodge                   |
| Wolf                   | Dies in more than 50% of fights, or removing its skills costs less than 5 points                        |
| Decisions              | Simple policies within 5 points of strong, or the best turn repeats its kinds more than 40% of the time |
| Clutter                | More than 6 enemies or 8 ground cells on the field at once in more than 10% of rounds                   |
| Control contract       | Any difference between the preview and what happens                                                     |

Also watch the opposite failure: if the strong bot wins everything and random wins a lot, the
fights are too easy to tell anything apart; tune the generator until strong is near 85-90%.

### What the build changed

Bot runs in `prototypes/e16-depth-lanes` showed problems with some of the numbers above. The
prototype changed them. Its `RESULT.md` has the numbers that came out.

- **Hit-and-dodge was almost as good as the strong bot** (84% against 90% wins). A walker at
  row 1 with an empty line cell in its lane now claws the line cell beside it (hero first),
  and a ghoul at row 1 cleaves its line cell and both cells beside it. Stepping one lane away
  is no longer a free dodge.
- **Archers were easy to ignore, so blockers were worth less than Strike.** Arrows now aim at
  the hero: they fly down the hero's lane and hit the first body there, so a Bone Servant in
  front of the hero catches them. An archer whose arrow is blocked walks forward to row 3. At
  row 1 it stabs for 2.
- **Fire did half of all damage and a damage-only deck was as good as the full one.**
  Firebolt reaches rows 1-4 only, a blaze deals 3 (not 4), and Strike deals 6.
- **Fights ran out of time with full HP.** The round limit is 20 (not 12), and waves carry
  the pressure.
- **Summons cost 1** (not 2). Bone Servant has 12 HP and Bash deals 3.
- **Wolf Bite** deals 4 to the first enemy in its lane, rows 1-2.
- **Enemy damage:** ghoul 6, spearman 5, archer 4, spider 4, warden 5, priest 3 (lob that
  alternates poison and fire on the hero's line cell). Priests back off from rows 1-3.
- **Generator:** enemy cost per type (spider 2; ghoul, spearman, archer 3; priest 4; warden
  5), budget 10 + 4 × difficulty, and enemies get +1 HP per difficulty step above 1.

### Deliverable

`prototypes/e16-depth-lanes`: pure TypeScript rules, Vitest tests, the first-person view in
the e11 look (crypt kit, painted WebP textures, TRELLIS enemies on the runtime rig), bots,
`scripts/metrics.ts` with the gates above, `scripts/shots.ts` for headless screenshots, and a
RESULT.md. A person still has to play it: bots cannot say whether it is fun or easy to read.
