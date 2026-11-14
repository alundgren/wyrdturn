# Tactical hex autobattler combat

Research date: 2026-11-14. This is a research proposal, not a prototype verdict.

**Recommendation (opinion):** test persistent hex combat with automatic basic actions and short, paused card windows. Keep one hero, one pet and up to two summons. Give the player control over deployment, a few clear priorities and a limited number of interventions. Do not copy an army recruitment economy.

## Evidence and project context

I read `design/direction.md` and `research/combat-progression.md` on main. I also read `design/combat-exploration.md`, `research/combat-views.md`, and both prototype results from `origin/combat-exploration`. Those unmerged files provide the comparison baseline. Their links will only resolve when that work is present. The older single-hero skill proposal is not the current combat brief.

External mechanics below are sourced evidence. Lessons, recommendations, prototype rules and numerical thresholds are opinions or hypotheses. Reception samples are individual reports, not a representative survey. No referenced game was played or timed for this report. Exact current balance values were not audited. A store animation's “Pause animation” label is a website control, not evidence of a combat pause feature.

The baseline keeps exploration first person and moves fights to a dedicated view. It has hero cards, pet abilities, two summon slots, visible intents, ground effects and displacement. E13 reports 94% strong-bot wins over 100 generated fights; e14 reports 92% over 300. These are different samples and rules. They do not establish that either view is better. E13 reports many unused unit actions. E14 reports pet deaths in 71% of fights. Automation might reduce routine commands, but it must not make the pet a disposable blocker by default.

## 1. The Last Flame

### What a fight and run involve

The developer describes automated combat surrounded by route selection, resource management, recruitment, equipment crafting and deployment. The store lists difficulty progression, endless play and challenge modes. Its catalogue numbers are marketing descriptions, not a count verified here. [Developer store description](https://store.steampowered.com/app/1830970/The_Last_Flame/).

The following separates confirmed mechanics from missing detail.

| Part          | Evidence                                                                                                                                                                                                                                                                                                          | Consequence for Wyrdturn (opinion)                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Squad         | The developer describes a team of five heroes with items, passives, active abilities and global effects. [Developer release discussion](https://www.reddit.com/r/slaythespire/comments/1hzp2m2/)                                                                                                                  | Five independent recruits differ from one persistent hero and a named pet. Borrow interaction depth rather than roster size. |
| Deployment    | Positioning before automated combat is explicit in the store description. An early developer discussion says the hex map serves initial positioning. [Store](https://store.steampowered.com/app/1830970/The_Last_Flame/), [early discussion](https://www.reddit.com/r/Games/comments/1ad715f/)                    | Hex deployment does not prove persistent hex movement. E15 needs its own movement contract.                                  |
| During battle | Combat is automated. Developer update notes distinguish auto-attacks, actives, passives and item effects in the recap. [Official updates](https://steamcommunity.com/app/1830970/announcements/)                                                                                                                  | “Active ability” does not necessarily mean a button the player presses. Do not present it as manual spellcasting.            |
| Abilities     | The developer identifies hero passives and actives as build components. Official recap notes separately attribute damage, healing and shielding to these sources. [Release discussion](https://www.reddit.com/r/slaythespire/comments/1hzp2m2/), [updates](https://steamcommunity.com/app/1830970/announcements/) | A unit's automatic action should be as inspectable as its equipment.                                                         |
| Items         | Looting and crafting gear are explicit. The developer explains that items, skills, origins and relics can redirect a run more than initial hero choice. [Store](https://store.steampowered.com/app/1830970/The_Last_Flame/), [developer discussion](https://www.reddit.com/r/Games/comments/1d14586/)             | Let upgrades change a pet's job instead of merely adding damage.                                                             |
| Synergy       | Origins are described as team buffs. An early developer answer explicitly distinguishes the game from origin/class trait systems. [Demo discussion](https://www.reddit.com/r/Games/comments/157jiq3/), [early-access discussion](https://www.reddit.com/r/Games/comments/1ad715f/)                                | Do not call this TFT's threshold trait system. Conditional global effects can support a small squad.                         |
| Run decisions | The developer lists hero selection, item choices, levelling timing, route choices, shopping, relics and Flame management as sources of advantage. [Developer discussion](https://www.reddit.com/r/Games/comments/1ad715f/)                                                                                        | Agency can sit between fights, provided choices change later combat in visible ways.                                         |
| Between runs  | The developer describes unlocking heroes, items, relics and origins. [Developer release discussion](https://www.reddit.com/r/pcgaming/comments/1991zj2/i_just_released_my_first_game_the_last_flame_a/)                                                                                                           | Prefer new options over permanent statistical advantages for the experiment.                                                 |

**A supported fight outline:** inspect the encounter, arrange the team, choose its equipment and build, start the automated battle, inspect the result, then use the next route and reward decisions to adapt. Exact menu ordering was not verified. A player strategy discussion describes separating damage dealers against area threats and arranging a formation to delay an enemy. This supports encounter-specific deployment, not a universal safe back corner. [Player positioning examples](https://steamcommunity.com/app/1830970/discussions/0/561408759868584039/).

**Important uncertainty:** I could confirm initial hex placement, automatic combat, build systems, run routes and combat recaps. I could not confirm the current complete targeting algorithm, exact mana/cooldown formulas, every equipment restriction, or current pause/rewind behavior. I found no dependable evidence of player-issued mid-fight moves, manual target orders, terrain combinations or hero card interventions. These must not be attributed to The Last Flame. Persistent movement on discrete hexes after deployment also remains unconfirmed.

The developer's January 2025 response to requests for slower fights promised half speed. Later official notes confirm 0.5× speed. Those sources do not establish rewind or arbitrary pause today. [Dated discussion](https://steamcommunity.com/app/1830970/discussions/0/592886010360160600/), [official update history](https://steamcommunity.com/app/1830970/announcements/).

### Run structure and agency

The store confirms a run-based map and resource decisions. Player advice describes acts containing ordinary fights, elites, shops and campfires. Official historical updates describe a fourth act with additional bosses. Treat exact route counts and advice as version-specific, not current mandatory rules. [Player route advice](https://steamcommunity.com/app/1830970/discussions/0/561408759868584039/), [official history](https://steamcommunity.com/app/1830970/announcements/).

Flame is a run survival resource in developer discussions. Recruitment, equipment, origins and relics make each fight the test of accumulated decisions. Difficulty and endless modes give a reason to improve builds after a clear. This differs from preserving moment-to-moment control over a vulnerable dungeon hero. **Inference:** The Last Flame can satisfy a player who enjoys diagnosing a machine they built. It does not by itself demonstrate that watching that machine satisfies Wyrdturn's card-and-intent brief.

### What sampled players praise and criticise

A January 2025 Steam reviewer praises solo play at one's own pace, composition, crafting and positional decisions. They also praise animation previews and contribution summaries, while finding some interactions unclear. [Steam review sample](https://steamcommunity.com/app/1830970/reviews/?browsefilter=toprated).

Players in the early-access discussion praise adapting equipment and replacing temporary heroes without feeling that early investment was wasted. Other commenters dislike restarting to find a desired combination. A release discussion also contains concern that unlocks dilute desired hero/item pools. [Early discussion](https://www.reddit.com/r/Games/comments/1ad715f/), [release discussion](https://www.reddit.com/r/slaythespire/comments/1hzp2m2/).

The speed discussion supplies a precise criticism: aggregate damage totals do not show whether a scaling build struggled early. Players wanted time to inspect causes during battle. The developer agreed that slower playback would help. This is evidence for readable event history, not proof that all players want direct control. [Discussion](https://steamcommunity.com/app/1830970/discussions/0/592886010360160600/).

**Lesson (opinion):** preserve flexible build changes and causal summaries. Avoid large random pools and unexplained automatic targeting. Show when a build works, not just its final total damage.

## 2. Related games

These are selected mechanics, not full reviews. The lesson column is design opinion. PvP drafting games are useful references, but their opponent uncertainty and economic competition are not requirements for a single-player dungeon.

| Game              | Sourced mechanic                                                                                                                                                                                                                                                                                   | Lesson for our small squad                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Teamfight Tactics | Drafting and deployment precede automated rounds. Riot's beginner guide covers items, economy and positioning. [Official overview](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/what-is-teamfight-tactics/), [official guide](https://www.youtube.com/watch?v=SP20lQatN2c) | Scout threats and adapt placement. Avoid requiring a large trait roster to make two allies interesting.                                       |
| Dota Underlords   | Recruitment, upgrades and alliances are central to its automated battles. [Valve description](https://store.steampowered.com/app/1046930/Dota_Underlords/)                                                                                                                                         | Team interactions can be legible categories. A shopping economy could overwhelm the dungeon expedition.                                       |
| Auto Chess        | Drodo describes inherited Dota Auto Chess strategy and an eight-player competition. [Developer description](https://store.steampowered.com/app/1530300/Auto_Chess/)                                                                                                                                | Copy drafting trade-offs only if needed. Do not confuse a square deployment board with persistent hex tactics.                                |
| Super Auto Pets   | Pets have distinct abilities; players build teams for automatic battles, including asynchronous play. [Developer description](https://store.steampowered.com/app/1714040/Super_Auto_Pets/)                                                                                                         | Few bodies can support strong trigger chains. Order and role can matter without map navigation.                                               |
| Mechabellum       | Positioning, counters and unit upgrades build an automatic army battle. [Developer description](https://store.steampowered.com/app/669330/Mechabellum/)                                                                                                                                            | Use encounter-specific counterplacement. Its army scale is unsuitable for a named pet.                                                        |
| Backpack Battles  | Buy, craft and arrange items in inventory before automatic combat. [Developer description](https://store.steampowered.com/app/2427700/Backpack_Battles/)                                                                                                                                           | Spatial agency can exist before combat. Inventory adjacency is not battlefield agency.                                                        |
| Despot's Game     | Equip humans and guide an army through procedural dungeons. [Developer description](https://store.steampowered.com/app/1227280/Despots_Game_Dystopian_Battle_Simulator/)                                                                                                                           | Dungeon composition and automated armies fit together. Disposable troops would weaken pet attachment.                                         |
| Hero's Hour       | Turn-based exploration combines with real-time battles and hero spells. [Developer description](https://store.steampowered.com/app/1656780/Heros_Hour/)                                                                                                                                            | Hero magic can give the player a job while troops act. Keep that job spatial and bounded.                                                     |
| Legion TD 2       | Build defenses against enemy waves; prediction and preparation are explicit. [Developer description](https://store.steampowered.com/app/469600/Legion_TD_2/)                                                                                                                                       | Known threat categories make preparation meaningful. Avoid a universal defense formation.                                                     |
| The Bazaar        | Shops build an item board whose effects trigger automatically in battles. [PC Gamer description](https://www.pcgamer.com/games/card-games/after-its-disastrous-launch-last-year-im-here-to-tell-you-that-2025s-most-promising-auto-battler-finally-lives-up-to-its-potential/)                     | Engine building can carry agency. This is not evidence for spatial unit combat.                                                               |
| Storybook Brawl   | Its developer describes drafting story characters for an eight-player autobattler. [Archived developer site](https://sbbwebsite.netlify.app/)                                                                                                                                                      | Themed units make interactions easier to remember. Treat it as historical prior art, not a service recommendation.                            |
| Hadean Tactics    | Explicitly combines roguelike deckbuilding with cards influencing automatic units. [Developer description](https://store.steampowered.com/app/1260590/Hadean_Tactics/)                                                                                                                             | Closest control-system reference. Cards should alter a developing battle, not merely add damage.                                              |
| Tales & Tactics   | Single-player roguelike squad drafting, equipment and deployment; listed as hex-grid combat. [Developer description](https://store.steampowered.com/app/1652250/Tales___Tactics/)                                                                                                                  | Another relevant hex deployment reference. Verify persistent movement before borrowing exact terrain rules.                                   |
| Astronarch        | Three starting heroes in a compact roguelike autobattler. [Player beginner guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2395108692)                                                                                                                                               | Small teams are viable. This community source does not verify exact current positioning rules.                                                |
| Loop Hero         | Terrain and enemy cards construct the expedition traversed by an automatic hero. [Developer description](https://store.steampowered.com/app/1282730/Loop_Hero/)                                                                                                                                    | Low direct fight agency is compatible with expedition agency. It is the wrong target if we promise reactive intent play.                      |
| Darkest Dungeon   | Rank-dependent skills and displacement make formation important in commanded battles. [Developer description](https://store.steampowered.com/app/262060/Darkest_Dungeon/)                                                                                                                          | Contrast: the player selects actions. Preserve useful fallbacks when automation leaves a pet out of position.                                 |
| Into the Breach   | Its developers connect telegraphed attacks with defensive tactical play. [Design postmortem](https://media.gdcvault.com/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf)                                                                                                        | High-agency opposite: each unit command can prevent a specific disaster. Use this to test whether automation removes the satisfying decision. |

## 3. Agency patterns

All recommendations in this section are proposals. They are not claims that every reference implements them.

| Pattern             | Player decision                           | Useful small-squad version                                                | Failure to test                                           |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| Deployment          | Who starts near which threat?             | Fully reveal enemy placement and first intents before placing two allies. | The same front pet/back hero formation always wins.       |
| Formation           | Adjacency, interception, protected routes | Wolf guards an ally; totem supplies a small ward radius.                  | Clumping is always best, or always punished.              |
| Target priorities   | Which valid target does the unit prefer?  | Nearest, lowest HP, or protect hero. Show selected target and reason.     | Priority is ignored by pathfinding or secretly retargets. |
| Gambits             | Ordered condition/action rules            | Two readable rules per pet, chosen from presets.                          | Programming menus take longer than battles.               |
| Intervention        | When to spend a limited command?          | A card moves an ally, displaces a threat or creates a ward.               | The best move is always immediate damage.                 |
| Pauses              | When to stop and inspect?                 | Guaranteed planning boundary before each short automatic interval.        | Reflex timing becomes mandatory.                          |
| Positional skills   | Lines, arcs, adjacency and distance       | Cone cleave, line hook, adjacency guard.                                  | Automatic walking erases setup before it pays off.        |
| Terrain             | Where to create or avoid effects?         | Two-step oil/fire combo, short-lived poison, ward.                        | Hazard avoidance makes unit routes unpredictable.         |
| Between-fight build | Which interaction improves the squad?     | One pet upgrade or hero card choice.                                      | A numerical damage upgrade beats every new behavior.      |

Final Fantasy XII provides the gambit reference: assign conditions and actions to party members rather than repeatedly issuing those actions. Square Enix's official trailer introduces that system; later updates add switchable sets. [Official trailer](https://www.youtube.com/watch?v=ba3SJ2E0pDE), [official update](https://www.square-enix-games.com/en_EU/home/final-fantasy-xii-the-zodiac-age-pc-ps4-update).

Do not build a general scripting language for e15. Example pet rules: “If the hero is threatened and I can intercept, guard; otherwise bite the nearest enemy.” A lowest-HP priority only considers reachable targets. Explicit fallback: approach the nearest safe attack cell, otherwise hold. Show the path and fallback before commitment.

## 4. Fit with Wyrdturn

A small squad needs combinations between identities, not bonuses for collecting six matching recruits. The hero ignites oil, the wolf pushes a target onto it, and the totem keeps the hero alive beside it. Each participant has a separate job. The player should be able to name why the pet helped.

**Cards should work in both phases, but primarily as mid-fight interventions.** Pre-fight-only cards would test a build simulator rather than the existing card-and-intent promise. Allow one opening card from the actual hand at its normal cost. Do not provide a separate setup deck. Then offer bounded intervention windows during combat. A queued pet priority remains useful between windows. Basic attacks do not require cards.

Persistent ground effects require persistent hex occupancy. Keep a dedicated arena derived from room size, entrances and a few obstacles. Do not claim a square dungeon tile equals a hex. Map room features to a validated hex template, and show the conversion. Preserve room identity through the pillar, door and brazier rather than exact floor geometry.

The future AI game master chooses approved enemy IDs, positions, terrain and rewards. It cannot write new combat rules or change committed intents. Validate deployment space, connected paths, hazard budgets, reachable threats, opening damage and at least one affordable response. Rejection and fallback counts belong in generator metrics. No live model integration is needed for e15.

## 5. Readability and pacing

**Proposed targets, not measured facts:** six to ten automatic intervals per fight. Each interval animates in about two seconds at 1×. Aim for 15–30 seconds of resolution and 45–90 seconds total including decisions. Record actual human planning time separately. Bot runtime cannot estimate it.

Offer pause, step, 0.5×, 1× and 2× playback. Speed changes presentation only. Planning has no clock. No last-millisecond spell timing. Use an event timeline with source, target, path, damage and the reason for target selection. Selecting an event highlights its hexes. Example: “Wolf chose skeleton: lowest reachable HP. Shoulder pushed it into oil. Fire dealt 5.” Aggregate meters alone cannot explain the order.

Show the next interval's committed paths and attacks, not a prediction of the entire fight. After a card, preview the exact new interval using the actual rules on a copy. Use icons and text as well as color. Only show detailed labels for the inspected unit; retain a simple total threat marker for every ally.

Save initial state, seed, commands and per-interval state hashes. Replay and rewind playback should reproduce events exactly. Allow undo while planning. Rewinding a committed interval is a debug feature initially, not a free run resource. Test a limited retry later if failure feels hard to diagnose.

To avoid passive watching, every interval should expose a comprehensible choice, including holding resources. Do not force a click when no useful intervention exists. Add an auto-continue option that stops at the next affordable meaningful choice. Measure how often it stops and how often the player merely waits.

## 6. Concrete e15 proposal

Everything below is a proposed experiment. Do not change direction.md until a playable result exists.

### Core loop and resolution contract

1. Enter a room in first person. Open its hex arena. Show all enemies, obstacles, hazards and first intents.
2. Deploy hero and wolf freely within the entry zone. Select pet priority and inspect automatic paths. Draw five from a 12-card deck. Spend up to three energy, including an optional opening card.
3. Commit one automatic interval. Each living ally moves at most one hex, then performs its basic action if in range. Then enemies execute their announced attacks. Resolve ground ticks and publish new enemy intents.
4. Pause. Draw to five after discarding the old hand. Reset three energy. Play at most two cards, or hold. Automatic attacks still happen when the player passes.
5. Repeat until all enemies die or the hero dies. Round 16 is a loss. Return to exploration. For a short run, offer one of three upgrades after each of three fights, then a final mixed fight.

This is a hybrid autobattler with turn boundaries, not fully continuous combat. That is deliberate. A later continuous version needs a separate experiment. The first prototype asks whether automatic routine actions preserve useful tactical choices with fewer commands.

Use a compact 7-by-6 offset hex board with blocked corner cells. Adjacent distance is one; straight rays use the six hex directions. One unit per cell. No diagonal corner rule. Deployment occupies two entry columns. At most four allies and six enemies. Keep enough free cells to route around one blocker.

Enemy attack cells are offsets from the enemy's position at announcement. Displacement moves that footprint, matching e13's useful enemy-friendly-fire behavior. Facing stays fixed until the next announcement. If the enemy dies, its attack is cancelled. An empty footprint misses; it never silently retargets. Enemy movement happens after its attack, then it announces again. Allies act in hero, wolf, summon creation order. The preview uses this exact order. Blocking prevents movement; it does not swap units.

### Units and abilities

Numbers are initial tuning hypotheses. No crits, hit rolls, resistances, attack-speed stats or equipment inventory.

| Unit         |  HP | Automatic action                                                  | Distinct job                                                                   |
| ------------ | --: | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Hero         |  26 | Strike adjacent target for 3; otherwise approach                  | Cards and personal survival                                                    |
| Wolf         |  16 | Bite for 3; choose nearest or lowest reachable HP                 | Finish targets; guard preset instead gives 3 block to adjacent threatened hero |
| Bone Servant |   8 | Slam adjacent for 2 and push 1                                    | Temporary displacement; lasts three intervals                                  |
| Spirit Totem |   6 | Stationary; grant 2 block to nearest ally within 2                | Safe support anchor; lasts three intervals                                     |
| Brute        |  14 | Announce forward three-hex cleave for 5                           | Punish clumping                                                                |
| Archer       |  10 | Announce ray up to 4 hexes for 4                                  | Reward line disruption                                                         |
| Hexer        |  10 | Announce target cell and neighbors for 2; leave poison            | Force relocation                                                               |
| Skitter      |   8 | Move up to 2 after attack; bite for 3, +2 against isolated target | Make separation a trade-off                                                    |
| Guard        |  18 | Bash for 3 and push 1; frontal damage reduced by 2                | Resist direct damage; invite flanking                                          |

For allies, priorities choose among legal reachable attack cells, then shortest safe routes; ties use fixed unit/cell IDs. Avoid fire and poison if an equal-length safe route exists. Do not auto-dodge committed attacks. That is an intervention opportunity. Guard stance holds position. No oscillating movement when a destination is blocked.

### Twelve-card starter deck

Two copies each of Strike and Firebolt; one copy of each other card gives twelve cards total. Range uses hex distance with walls blocking rays. Cards are hero actions; the hero must be alive. Utility targets within four hexes of the hero unless specified.

| Card         | Energy | Effect                                                                           |
| ------------ | -----: | -------------------------------------------------------------------------------- |
| Strike ×2    |      1 | Deal 4 to adjacent enemy                                                         |
| Firebolt ×2  |      1 | Deal 3 along a ray of up to 4; ignite target hex                                 |
| Reposition   |      1 | Move one ally up to 2 clear hexes; suppress its automatic movement this interval |
| Shoulder     |      1 | Wolf pushes an adjacent enemy 2 hexes; no damage except collisions               |
| Hook         |      1 | Pull an enemy in a clear hero ray up to 3 hexes away by 2                        |
| Oil          |      1 | Coat target hex and two selected adjacent hexes for 3 intervals                  |
| Miasma       |      2 | Place poison on target and neighbors for 2 intervals                             |
| Ward         |      1 | Place a ward on one hex and neighbors for 2 intervals                            |
| Bone Servant |      2 | Summon on empty adjacent hex; maximum two summons combined                       |
| Spirit Totem |      2 | Same placement limit; stationary support summon                                  |

A new summon acts in the current interval. At the cap, summon cards are illegal rather than replacing a unit silently. Starting hand is seeded; keep one guaranteed utility card in tutorial fights only. Illegal cards cost nothing. Empty deck reshuffles discard deterministically.

Fire deals 2 on entry and at interval end for two intervals. Igniting connected oil consumes it and makes fire deal 4 there. Poison deals 1 at interval end for two intervals; it does not spread in the first test. Ward reduces each hit by 2, minimum zero. Push/pull into a wall deals 2; into a unit deals 1 to both and stops. Forced entry triggers hazards once per crossed cell. No recursive collision chains. Omit ice initially; oil supplies the required movement interaction. Do not add fire/poison explosions yet: e13 already found them too easy to exploit.

Rewards: choose +1 hero basic damage, +2 wolf HP with guard block +1, or replace one Strike with a second utility card from the existing catalogue. Use identical reward offers across paired bot runs. Reset builds on death. No metaprogression, shop or large trait pool in this slice.

### Five rules most likely to make it fun

1. Preview the exact next interval. Automatic behavior must be a promise the player can understand.
2. Basic attacks are free; cards change positions, hazards and survival. Routine damage should not consume every decision.
3. Give each ally a different useful job. Protecting the wolf must sometimes be better than letting it absorb a hit.
4. Placement matters after the opening. Persistent hazards, attack footprints and short movement keep hex decisions relevant.
5. Limit interventions, not thinking time. Two cards per interval make choosing a response more important than issuing many commands.

## 7. Comparison, bot harness and failure criteria

Build six authored encounters: introduction, archer behind cover, oil chokepoint, poison pressure, isolated-target flanker, and mixed guard/hexer. Add a seeded generator with five difficulty budgets. Include mirrored formations and a room without hazards. Use the same role counts, HP budgets and reward sequence across comparisons where possible. Geometry and turn rules cannot be identical between hexes, squares and lanes; disclose those differences.

Run random, greedy one-interval and strong short-search bots. Also run nearest-target, fixed-formation, damage-only, no-intervention and deployment-only policies. Every policy gets the same legal observations. Strong search must not see future deck order or unrevealed generated content. Log search budget and time. Pure rules must drive bots, previews and browser playback.

Reuse the combat-exploration metric families, but normalize per decision window and per fight. Do not compare e13's 8.7 distinct turns directly with e14's 73: their bucketing and search differ. Recompute with a shared definition: state after the automatic interval, alive IDs, HP in 2-point buckets, occupied cells, hazards and remaining energy. Also report results without positions in the state key so harmless walking does not inflate variety.

| Metric                | Report and comparison                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success and pacing    | Win rate with confidence intervals by policy/difficulty; rounds for all fights and wins separately; hero/pet survival; median and p90 resolution time; commands per fight |
| Decision variety      | Distinct resulting states, near-best outcomes within a fixed score margin, repeated action categories, forced-pass frequency                                              |
| Dominant patterns     | Percentage-point win gap between strong and each simple policy; best fixed build across held-out encounter families                                                       |
| Feature relevance     | Ground, push/pull, pet and summon use per fight/window; damage, prevented damage and wins lost when each feature is disabled                                              |
| Placement sensitivity | With build, cards and intervention policy fixed, compare legal deployment samples: best/median/worst win and HP outcome; fraction of fights whose winner changes          |
| Adaptive placement    | Compare one fixed formation against encounter-aware placement on identical seeds; include mirrored and shifted enemy formations                                           |
| Intervention value    | Paired seeded fights with same deployment: strong cards versus pass, damage-only and random legal cards; report win delta and surviving HP delta                          |
| Timing value          | Same card budget spent only before combat versus distributed windows; hold draw order fixed and disclose cards not yet available at setup                                 |
| Priority value        | Nearest versus chosen presets with deployment fixed; target changes, invalid targets and blocked-path frequency                                                           |
| Companion value       | Pet survival, attacks, guards, threat interceptions, avoidable deaths; remove pet abilities while retaining its body to distinguish skill from soaking damage             |
| Build concentration   | Pick rate and outcome by card/upgrade; strongest build's win share; performance on held-out role combinations                                                             |
| Watch burden          | Automatic intervals with no meaningful affordable intervention, forced waits, playback share of fight time; human planning time remains a separate observation            |
| Predictability        | Preview/resolution mismatches, changed targets without a logged reason, replay hash mismatches, path stalls and generator rejection reasons                               |
| Performance           | Bot milliseconds per fight, search nodes/window, browser frame-time median/p95 at the established target resolution                                                       |

Use at least 300 paired seeds, split by difficulty, plus all authored fights. Publish sample size, simulation version, policy budgets and uncertainty. Bootstrap paired differences over seeds; a Wilson interval is suitable for an individual win rate. Disable one feature at a time. Do not interpret frequent use as proof of value: automatic Bite can fire every interval and still contribute nothing important.

**Provisional failure gates, not established standards:**

- Fixed formation within 5 percentage points of adaptive deployment on held-out fights: placement probably lacks value.
- Strong interventions improve wins by less than 10 points and median surviving HP by less than 10% of starting squad HP: cards probably lack value. Inspect ceiling effects before rejecting.
- Damage-only within 5 points of strong, or one build wins almost every encounter family: combinations probably lack value.
- More than half of decision windows have no useful choice, or median fights exceed 90 seconds with few interventions: watching probably dominates.
- Pet death above 50%, or removing its skills barely changes outcomes: the pet probably remains a blocker.
- Any preview mismatch, unexplained retarget or replay divergence: the control contract is broken, regardless of win rate.

Also test the opposite failure. If strong cards rescue almost every bad deployment and deployment sensitivity vanishes, the automatic squad is decorative. If the outcome is nearly invariant under every legal intervention, fights are decided before they start. Neither extreme meets the brief.

### Deliverable and decision

Implement only `prototypes/e15-hex-autobattler` later. It should contain pure TypeScript rules, rules tests, a mouse-playable view, deterministic bots, metrics and headless screenshots. Include recorded states for a placement-sensitive opening, a saved pet, a push into oil/fire and a deliberate pass. Inspect at least one short play or bot replay before writing its RESULT.md.

Compare all three prototypes with the same short human task: predict the next damage, explain why the pet chose its target, win one mixed fight, and name the decision that changed the outcome. Record errors, time and commands. Bots cannot establish fun or reading effort.

Proceed only if e15 preserves meaningful placement and card responses while reducing routine unit commands. Prefer e13 if explicit unit coordination supplies the interesting choices. Prefer e14 if hex routes and overlays add reading without useful decisions. Record the eventual verdict in direction.md after measurement; this research makes no selection.
