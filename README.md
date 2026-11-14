# Wyrdturn

A painted, grid-based first-person dungeon crawler roguelite: step-and-turn
movement in the style of Eye of the Beholder and Lands of Lore, strict
turn-based combat with visible enemy intents, and progression within and
across runs. Built with AI agents. The long-term goal is procedural levels
with an AI game master.

The real game hasn't started yet. This repo holds the exploration:
prototypes, research and design decisions.

## Layout

- `prototypes/`: experiments, one folder each with a `RESULT.md`.
  `e11-combat` is the playable slice.
- `research/`: research reports (prior art, combat and progression,
  generation and self-checks)
- `design/`: current decisions; start at [design/direction.md](design/direction.md)

## Play the slice

Prerequisites: [Vite+](https://viteplus.dev/) (the `vp` command). It
installs the pinned Node.js (26 LTS) and pnpm for you.

```sh
vp install
cd prototypes/e11-combat
vp dev             # open the printed URL, press 1
```

W/A/S/D move, Q/E turn (turning is free), 1-4 skills, Space waits.
Red floor tiles show where an enemy will hit next.

## Check

```sh
vp run validate    # format, lint, types, builds, unit tests, fast balance sims
```

Browser-based checks (screenshots, visual diff, frame-time bench) are listed
in [prototypes/README.md](prototypes/README.md).

Agents, and people working with them: start with [AGENTS.md](AGENTS.md).

## License

Code and original assets: [MIT](LICENSE).
