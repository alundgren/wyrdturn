# Lanes: drawing cards for the whole party, and fast turns

Research date: 2026-11-14. This is a research proposal for e17, not a prototype verdict.

**Recommendation (opinion):** keep e14's side view and rules, and test three deck models
side by side as URL switches: e14's hero deck (pet and summons use fixed abilities), one
**shared party deck** where every card names the unit that plays it, and **squad hands**,
where every unit draws its own small hand and gets its own actions. Add a pacing package
where every item is a switch: faster animations with click-to-skip, input during
animations, enemies acting almost together, one-click play, auto end turn and shorter
fights. Measure clicks and seconds of animation per round with the same bots, so "faster"
is a number and not a feeling.

## Evidence and limits

The owner's verdicts so far: e14 lanes are the direction ("promising, lots of tweaking
needed"); e13 board, e15 hex autobattler and e16 first-person depth lanes were rejected.
Known e14 problems: round 1 is harsh, Pull is too strong, fire combos are too strong, the
pet looks like the enemy spider, the hero art is a placeholder, and the pet died in most
fights (71% in the bot runs).

Game facts below come from wikis, reviews, rulebooks and player discussions, linked in
place. Where a search did not confirm a detail I say so. No game was played or timed for
this report. The lessons and numbers are design opinions and experiments for e17, not
facts about those games.

## 1. Deck models for a party of hero, pet and summons

### What other games do

| Game                      | Model                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Lesson for us                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card Hunter               | Each character has its **own deck** built from class, race and equipment; each round every character is dealt new cards and keeps at most two ([Wikipedia](https://en.wikipedia.org/wiki/Card_Hunter)).                                                                                                                                                                                                                                                                                         | Per-unit decks guarantee every unit has something to do. Deckbuilding happens through gear, not card picks.                                                    |
| Gloomhaven                | Each character holds a hand chosen before the scenario and plays **two cards a round**, the top half of one and the bottom half of the other. Any card can be played as a basic Attack 2 or Move 2. Running out of cards exhausts the character ([rulebook summary](https://lehi-innovation.github.io/boardgame-rules/rules/gloomhaven/), [Dized](https://rules.dized.com/game/I7lEsCGOS2-zgol-ZRNf3g/ZD4XtJDISLeR-J40FGjSng/performing-ability-card-actions)).                                 | "Any card can be a basic action" kills dead draws. The hand is also a clock, which we don't need.                                                              |
| Griftlands                | Two **separate decks** for two kinds of conflict (battle and negotiation), with the same turn structure ([PC Gamer](https://www.pcgamer.com/griftlands-complex-double-deck-building-shows-promise-in-early-access)). Allies and pets help in fights ([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Griftlands)); I did not confirm how pet actions are chosen.                                                                                                                   | Two decks work when they never compete for the same turn. Not our case: all our units fight at once.                                                           |
| Cobalt Core               | Three crew members each add their cards to **one ship deck**, and the cards you see depend on who is in the crew ([wiki](https://cobaltcore.wiki.gg/wiki/Cards)). From memory, not confirmed here: an enemy status can make one crew member "missing" so their cards can't be played for a while. A player report describes a bug where a dead crew member's cards stayed in the deck ([itch.io](https://itch.io/post/11968790)).                                                               | One shared deck with owners works and reads well when every card shows its owner. The rule for an absent owner must be explicit.                               |
| Banners of Ruin           | Party of up to 6 in two ranks; every party member adds its own cards to **one deck**, and card effects move characters between ranks ([Steam](https://store.steampowered.com/app/1075740), [GameFAQs guide](https://gamefaqs.gamespot.com/pc/289315-banners-of-ruin/faqs/80103)). One review calls most cards bad for the deck ([Medium](https://medium.com/@blackguardgaming/banners-of-ruin-review-beautiful-but-flawed-9e3a57f08d0a)).                                                       | The closest match to "shared party deck plus positions". The risk shows too: with many owners, the deck gets diluted and drafting new cards gets worse.        |
| Monster Train             | **One deck** holds both unit cards and spell cards. Units go onto one of three floors and fight on their own; spells cycle back ([community guide](https://naguide.com/?p=17343), [Select Button review](https://selectbutton.com/reviews/monster-train-review)).                                                                                                                                                                                                                               | A summon card can put a body on the board that then acts by itself. Cards decide _what and where_, not every swing.                                            |
| Wildfrost                 | One deck of companions (they stay on the board) and items (used once). Every unit has a **counter** that ticks down each turn; at 0 it acts on its own and resets ([wiki: Counter](https://wildfrostwiki.com/Counter), [Getting Started](https://wildfrostwiki.com/Getting_Started)).                                                                                                                                                                                                           | Units with timers need no clicks at all, and the countdown is a clear intent. A possible later idea for summons.                                               |
| Inscryption               | Creatures are cards played into four lanes. A free **side deck** of squirrels feeds sacrifices and blocks ([TechRaptor guide](https://techraptor.net/gaming/guides/inscryption-guide-beginners)).                                                                                                                                                                                                                                                                                               | A small guaranteed side pile is another fix for dead draws.                                                                                                    |
| Fights in Tight Spaces    | One deck, 3 momentum a turn that can't be saved. Attacks build combo; moving lowers it. Many enemies must stand right in front of you to hit, so a one-space push is a key defensive card ([TheSixthAxis](https://www.thesixthaxis.com/2021/12/02/fights-in-tight-spaces-review/), [guide](https://www.magicgameworld.com/?p=125934)).                                                                                                                                                          | Position cards are strongest when an enemy's attack needs a spot. Same lesson as e14's "out of position", which is too strong when it erases the whole action. |
| Slay the Spire            | One hero, one deck, 3 energy, hand 5, enemy intents shown. A Fast Mode option speeds up animations ([Steam discussion](https://steamcommunity.com/app/646570/discussions/0/2549465882935485677)).                                                                                                                                                                                                                                                                                               | The baseline e14 already copies.                                                                                                                               |
| Slice & Dice              | Instead of cards, each of five heroes rolls **its own die**; you lock some and reroll the rest up to twice ([PC Gamer](https://www.pcgamer.com/games/roguelike/heres-slice-and-dice-the-roguelike-rpg-where-each-of-your-party-members-is-a-different-die), [Thinky Games](https://thinkygames.com/reviews/slice-and-dice-youll-just-keep-rollin/)).                                                                                                                                            | Every unit gets exactly one random action a turn, and rerolls give control back. Very fast to read. The same idea as "squad hands" with a hand size of one.    |
| Darkest Dungeon (1 and 2) | **No cards.** A hero brings 4 skills into a fight in the first game ([LP archive](https://lparchive.org/Darkest-Dungeon/Update%2002)), 5 in the second ([Fextralife](https://darkestdungeon2.wiki.fextralife.com/Skills)). Skills need certain ranks. Turn order is rolled each round from speed plus a random number (1-6 in the second game, per [wiki.gg](https://darkestdungeon.wiki.gg/wiki/Combat_Mechanics_%28Darkest_Dungeon_II%29)); I did not confirm the first game's exact formula. | Fixed loadouts are readable and every unit always has options. Variety comes from position, not from draws. This is what our pet and summons do in e14.        |

### What each model does to us

**A. Hero deck, fixed pet and summon abilities (e14 today).**

- Decisions: the hero's hand changes each turn; the pet's 3 abilities never do. The pet
  turn turns into "Bite unless Drag is ready".
- Readability: good. Only the hero's 5 cards change.
- Deckbuilding: only the hero's deck grows. Pets would progress by unlocking abilities.
- Goes wrong: the pet feels static ("not cards") and in e14 it mostly exists to die in
  the front slot.

**B. One shared party deck, every card names its owner.**

- Decisions: one energy pool for everybody, so each turn asks "is the pet's Drag worth
  more than the hero's Firebolt?". Owner slot rules still apply: the pet's Bite needs the
  pet in slot 1 or 2.
- Readability: one hand to read, but each card needs an owner badge, and the target rings
  start from the owner, not from the hero.
- Deckbuilding: cards are added per owner. A new pet gets its cards into the deck; a pet
  upgrade means better pet cards.
- Goes wrong: **starving** (the pet's cards don't come up for two turns), **dead draws**
  (the pet is dead or out of position and its cards sit in hand), **dilution** (more
  owners means fewer of each owner's cards per hand; the Banners of Ruin complaint).
- Fixes: cards of a dead owner leave the deck at once, and a card drawn for a dead owner
  is replaced. Summons shuffle their own cards in when they rise and take them out when
  they fall. Count dead draws so we see how often it bites.

**C. Squad hands: every unit has its own small deck and its own actions.**

- Decisions: each unit picks from its own few cards (hero 2 of 3, pet 1 of 2, summons 1
  of 2). Like Card Hunter and Slice & Dice. Every unit acts every turn, so nobody starves.
- Readability: more cards on screen in total, but each group is tiny and labelled. The
  order across units still matters (hook first, then strike).
- Deckbuilding: per unit. A pet card pick only competes with other pet cards.
- Goes wrong: less tension (no shared budget), more clicks if every unit must act, and
  random small hands can leave a unit with nothing useful from its slot.
- Fixes: moving (swap with a neighbour) is always available as the unit's action, so a
  unit with a bad hand can reposition. One card per unit per turn keeps clicks down.

### Slots and cards together

- A card lists the slots its user can play it from and the slots it reaches. e14's small
  4+4 lane picture on the card already shows this; keep it for every owner.
- In a shared deck the lane picture must show the **owner's** slot, not the hero's.
- Cards that move units (Shove, Hook, Drag, Web Line) are what make slots matter. The
  problem in e14 is not that they exist but that an enemy moved out of its slots loses its
  whole action. Fights in Tight Spaces has the same pattern (enemies must be in front of
  you to attack) and limits it with push-immune enemies.
- Darkest Dungeon's answer to "a unit got shuffled into a slot where it can do nothing" is
  that every hero has at least one skill usable from most ranks, and moving is always an
  option. e17 keeps moving available to every unit in every model.

## 2. Making turn-based combat feel fast

The time a player spends in a fight is thinking time plus input time plus waiting time.
Most tricks below cut waiting and input; only short fights cut thinking. Clarity is lost
when things happen faster than the eye can follow who did what.

| Technique                           | Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Clarity risk                                                                                      | For e17                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faster animations, click to skip    | Slay the Spire's Fast Mode option ([Steam](https://steamcommunity.com/app/646570/discussions/0/2549465882935485677)); a speed-up mod for it only speeds up the animations that block the game ([SuperFastMode](https://github.com/houeland/SuperFastMode)). Player feedback in other games asks for skipping with one press, not a long hold ([Starbound forum](https://forums.playstarbound.com/threads/battle-animation-skipping-should-just-be-a-single-click-press.151970/)). | Low if the end state stays on screen and a log lists what happened.                               | Speed factor 0.6 by default; a click or Space finishes the current animation at once.                                                                           |
| Input during animations (buffering) | Common in action games; for turn-based games the advice is to let input finish the current animation instantly ([Turn-Based Game Feel Prototype](https://savagehill.itch.io/turn-based-game-feel-prototype)), and to watch out for one input counting twice ([Medium](https://medium.com/@yosispring/input-buffering-action-canceling-and-also-forbidden-knowledge-47a3f8a95151)).                                                                                                | Low for your own actions (you know what you did). Higher during the enemy turn.                   | Your own actions never block input: a new click finishes the last animation and goes on.                                                                        |
| Enemies acting together             | Marvel Snap plays both players' turns at the same time, and a match lasts only six turns, about three minutes ([Game Developer](https://www.gamedeveloper.com/game-platforms/designers-don-t-sleep-on-marvel-snap-s-simultaneous-turns)). Into the Breach resolves enemy attacks in a fixed, visible order ([PC Gamer tips](https://www.pcgamer.com/uk/into-the-breach-tips)).                                                                                                    | Medium: four hits at once are hard to follow. Short overlaps keep the order readable.             | Enemy actions start 0.3 s apart instead of waiting 0.9 s each; rules order stays the same.                                                                      |
| Fewer clicks per action             | Shogun Showdown: some actions (queuing a tile) don't use the turn, and intents sit above enemies' heads ([PC Gamer review](https://www.pcgamer.com/games/roguelike/shogun-showdown-review), [Boiling Steam](https://boilingsteam.com/shogun-showdown-review/)).                                                                                                                                                                                                                   | Low, as long as the preview still appears before an action that has a choice.                     | One click plays a card that has only one legal target. Pet and summon abilities sit in the hand bar as cards, not behind a unit click. Drag a card onto a slot. |
| Auto end turn                       | Common in card games once nothing is playable.                                                                                                                                                                                                                                                                                                                                                                                                                                    | Annoying if it ends a turn you wanted to use for moving.                                          | End the turn by itself when no card or ability can be played; a short banner shows it and any click cancels.                                                    |
| Short fights: fewer, bigger hits    | Marvel Snap's fixed six turns; Shogun Showdown's quick, deadly turns. One player found late enemies there attack "too quickly", with no time to react ([itch.io](https://roboatino.itch.io/shogunshowdown/comments?before=153)).                                                                                                                                                                                                                                                  | Bigger hits make mistakes fatal; with intents shown that is fair, but round 1 must not be a trap. | Enemy HP × 0.7. Fewer rounds, same choices per round.                                                                                                           |
| Timelines and initiative            | Darkest Dungeon rolls turn order from speed each round; Wildfrost counters tick down and units act at 0 ([wiki](https://wildfrostwiki.com/Counter)); Gloomhaven picks order from an initiative number on the played card.                                                                                                                                                                                                                                                         | Interleaved turns are dramatic but slow: every unit is its own beat, and you wait for each enemy. | Keep e14's "your side, then their side". It is the fastest order: one long input phase, one short enemy phase. Not tested as a switch.                          |
| Juice that reads as speed           | Fights in Tight Spaces plays the whole fight back afterwards as one real-time action scene ([store page](https://store.epicgames.com/p/fights-in-tight-spaces)). Hit-stop, screen shake and short sharp tweens make turns feel quick without hiding information.                                                                                                                                                                                                                  | Low.                                                                                              | Later. e17 keeps e14's animations, just shorter.                                                                                                                |

What makes it **feel** fast without losing clarity, in order of value per effort (opinion):

1. Never block the player's own input. Waiting on your own animation is pure friction.
2. Shorter, overlapping enemy animations, with the log listing every event in order.
3. Fewer clicks for obvious actions (single target, abilities visible without opening a
   unit).
4. Fewer rounds per fight through less enemy HP, not through more damage to the player.
5. Auto end turn, with a visible cancel.

## 3. e17 proposal

### Deck models (`?deck=`)

| Switch       | Hero                                       | Pet (Rustback)                                                | Summons                                                            | Budget                                                   |
| ------------ | ------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| `deck=hero`  | 12-card deck, hand 5                       | 3 fixed abilities with cooldowns, one per turn                | one fixed ability each, one per turn                               | 3 energy for the hero; pet and summons act for free      |
| `deck=party` | 10 cards in one 14-card party deck, hand 6 | 4 cards in the same deck (Bite ×2 at 0, Drag 1, Shell Wall 1) | rising shuffles 2 of its cards in (cost 0); falling takes them out | 3 shared energy; the card's owner plays it from its slot |
| `deck=squad` | own 10-card deck, hand 3, 2 actions        | own 5-card deck, hand 2, 1 action                             | own 3-card deck, hand 2, 1 action                                  | one card or one move per action; no energy               |

Moving (swap with a neighbour) stays available in all three: 1 energy for the hero in
`hero` and `party`, the unit's action for others; one action in `squad`.

### Pacing package (`?pace=classic|fast`, every item also its own flag)

| Flag       | Classic | Fast (default) | What it does                                                                         |
| ---------- | ------- | -------------- | ------------------------------------------------------------------------------------ |
| `anim`     | 1       | 0.6            | Multiplies every animation and pause.                                                |
| `skip`     | off     | on             | Click or Space finishes the running animation at once.                               |
| `buffer`   | off     | on             | Input works during your own animations; a new action finishes the old one first.     |
| `group`    | off     | on             | Enemy actions start 0.3 s apart (× `anim`) instead of 0.9 s each.                    |
| `oneclick` | off     | on             | Single-target cards play on one click; abilities show in the hand bar; drag to play. |
| `autoend`  | off     | on             | The turn ends by itself when nothing but moving is left.                             |
| `short`    | off     | on             | Enemy HP × 0.7 (a rules switch, so it changes win rate and rounds).                  |

Starting numbers: e14 waits 0.52 s after each of your steps, 0.9 s after each enemy
action and 0.6 s after other enemy-phase steps; a fight lasts 9.4 rounds for the strong
bot. Targets for `fast`: under 2.5 s of enemy-turn waiting per round, under 8 clicks per
round, and 6-7 rounds per fight, with strong-bot win rate within 5 points of `classic`.

### Fixes for known e14 problems (rules switches, on by default)

- **Harsh round 1:** enemies spread their aim. An enemy picking a target slot that
  already has 8+ incoming damage values it at half. Expected: less "-23 on the hero" in
  round 1.
- **Pull too strong:** an enemy moved out of the slots its ability needs uses its other
  ability if that one works from the new slot, and only fails if neither does.
- **Fire combos too strong:** Blaze 3 per round instead of 4, burns 2 rounds instead of 3;
  Flash deals 1.5× the cloud's strength instead of 2×. Target: under 35% of enemy damage
  from ground (e14: 43%).
- **Pet looks like the spider:** a code-built beetle (round shell, short legs) in teal
  bronze instead of the crawler.
- **Pet dies most fights:** pet HP 18 → 22; the spread aim also takes pressure off the
  front slot.

### How bots and timings measure it

- Same bots as e14 (random, greedy, strong beam search, nearest, retreat, stack), run on
  every deck model over the same generated fights.
- `scripts/metrics.ts` reports per deck model: win rate, rounds per fight, **clicks per
  round and per fight** (from a click model per action and pace), **seconds of
  animation per round and per fight** and **seconds the player has to wait** (from the
  same timing table the view uses, in `src/pace.ts`), decision variety (distinct
  outcomes per turn, same kind of turn as last time), dominant patterns (fixed policies
  vs strong), how often each unit's cards or abilities are played, and dead draws (turns
  where a living unit has no card or ability it can use).
- Feature-off runs: the strong bot with each rules fix turned off, one at a time, to show
  what each does.
- Fail signs: a deck model where the pet acts in under half its turns (starving), more
  than 25% dead-draw turns for any unit, `fast` changing the strong bot's win rate by
  more than 5 points, or a fixed policy within 10 points of the strong bot.
