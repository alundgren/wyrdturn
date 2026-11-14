# Combat exploration: fights off the dungeon view

## Why

In the first-person slice (`prototypes/e11-combat`), fights happen on the
same grid you explore. Playtesting showed the classic problem of this genre:
the best play is stepping back, hitting, and circling around obstacles. It is
boring, and the camera makes positions hard to read.

So exploration stays first person on the grid, and fights move to a
dedicated combat view. Two views are tested side by side, with the same
units and the same kinds of effects, so the comparison is about the view and
its rules, not the content.

## Shared rules for both prototypes

- **Your side.** One hero, one companion (a pet, for example a wolf) and up
  to two summons (made by hero cards during the fight, for example a bone
  servant or a spirit totem). The player controls all of them. For this
  test they move and use abilities the same way, like separate heroes. How
  companions and summons progress is out of scope.
- **Turn order.** Simple sides: the player acts with all their units in any
  order, then enemies act. Keep it simple; note in the result whether the
  ordering felt right.
- **Cards.** The hero has a small deck (about 12 cards) and draws a hand of
  5 each turn, with 3 energy. The companion has 2 to 3 fixed abilities with
  cooldowns (not cards), so both systems get tested. Summons have one fixed
  ability each.
- **Visible intents.** Every enemy shows what it will do next turn, and where.
  The player can always see which tiles or slots will be hit.
- **Ground or slot effects.** At least: fire (damages whoever stands in it
  at end of turn), ice or oil (changes movement or makes the next fire
  bigger), poison cloud (lingers and spreads or fades), and a buff zone (for
  example a ward circle). Effects combine where it makes sense: oil plus fire
  becomes a bigger fire.
- **Movement effects.** Push and pull, with consequences: pushing into a wall,
  another unit or a hazard does something.
- **Enemies.** 4 to 5 enemy kinds with different roles (melee brute,
  ranged, area caster that makes ground effects, a fast flanker, an armoured
  guard). Reuse the TRELLIS models in `prototypes/e11-combat/public/trellis`
  (ghoul, skeleton, spider, and others) and `autorig.js` for humanoids.
- **Encounters.** At least 6 hand-made fights of rising difficulty plus a
  simple generator, so bots can play many varied fights.

## The two views

- **e13 board: "the room becomes the board".** The fight happens in the room
  where it started. The camera leaves first person and rises to an angled
  top view of the same room, without loading a new scene. The room's floor
  tiles are the board. Walls, pillars and doorways are obstacles and
  chokepoints; props can matter (knock over a brazier to make fire). Units
  move a number of tiles, then act. Use rooms from the e11 level generator
  (`prototypes/e11-combat/src/levelgen.js`) so fights happen in real
  generated rooms.
- **e14 lanes: Darkest Dungeon style.** A side view: your units stand in a
  row of 4 slots facing 4 enemy slots. Position decides which abilities can
  be used and which slots they reach. Push, pull and swap move units between
  slots. Ground effects live on slots. Moving one slot costs an action.

## What each prototype must deliver

- Written in TypeScript, built with Vite+ (`vp`), in its own folder under
  `prototypes/`. Follow the repo's `AGENTS.md`.
- Rules as pure code (no three.js, no DOM), shared by the game, the tests,
  and the bots.
- A playable browser view with mouse controls, readable in a few seconds:
  intents, hazard tiles or slots, whose turn it is, what a card will do
  before you play it.
- Unit tests for the rules.
- Bots: a random bot, a greedy one-turn bot, and a stronger bot (for example
  a short search over the player's turn).
- A metrics script that reports, over many generated fights:
  - win rate per bot and average fight length,
  - **decision variety**: per turn, how many distinct legal plays lead to
    meaningfully different outcomes, and how often the best play is the same
    kind of move as last turn,
  - **dominant patterns**: whether one simple policy (always attack the
    nearest, always retreat, always stack one card) comes close to the strong
    bot. Close means the fights lack depth.
  - how often ground effects, push and pull, companions and summons are used
    by the strong bot (if it never uses them, they don't matter yet).
- Headless screenshots of a few fight moments (no window ever opens), and a
  `RESULT.md` with the numbers, screenshots, what felt good, what didn't, and
  open questions.
