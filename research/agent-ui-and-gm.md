# Agent-readable UI and the game master

Research date: 2026-11-14. Two outside projects checked for ideas: Vercel's
UI SDK (for agents and the game master) and a three.js ambient occlusion
demo (for the look). Neither is added to the project. The ideas below are
recorded so we can use them when we build the game master and the HUD.

## Vercel UI SDK

- What: `@ui-sdk/*` from Vercel Labs, beta `0.1.0-beta.2`, Apache-2.0,
  repo created October 2026. Headless UI behaviours (focus, keyboard,
  popups, drag and drop, dialogs) plus an "agent bridge".
  [Repo](https://github.com/vercel-labs/ui), [docs](https://ui-sdk.dev),
  [agent docs](https://github.com/vercel-labs/ui/blob/main/apps/docs/content/docs/agents/index.mdx).
- The agent bridge: the agent calls `snapshot()` and gets a short JSON list
  of what is on screen and which actions are allowed right now. It then
  calls `act()` with steps like `{ ref, action, args }`. The app approves or
  refuses each step (`allow` callback), changes are tagged
  `source: "agent"`, and marked elements need a human to confirm.
- Vercel's own benchmark (one settings task, three runs): 5 tool calls
  instead of 16, 6.8k instead of 39.8k tokens read, 16 s instead of 41 s.
  One task only, so a hint, not proof.
- Related but different: Vercel's json-render (`@json-render/core`,
  Apache-2.0), where an LLM outputs UI as JSON picked from a fixed catalog
  of components checked with zod schemas, optionally streamed as JSON lines.

Verdict: borrow the ideas, don't add the package. It is a young beta, the
agent bridge is documented for React, and our HUD is mostly display over a
three.js canvas, not complex widgets. Look again at 1.0 or if debug panels
get complex.

### Idea 1: the game master sees only legal moves

The game master already sits behind the director validator in
`prototypes/e11-combat`. Copy the bridge pattern:

- Each time it is asked, the engine sends a small snapshot: things with a
  short `ref`, their state, and only the actions legal for them right now.
  If an action isn't allowed, it isn't listed. Smaller prompts, fewer
  invalid proposals.
- A fixed catalog of encounter, room, reward and NPC line types, each with a
  schema. The model picks from the catalog and fills fields; it never
  invents types.
- It answers with steps. The validator checks every step, refuses bad ones
  and says why, so a retry can fix them.
- Every change is tagged `source: "gm"` so logs and replays show who did
  what.
- Risky steps (big rewards, a boss) get extra limits or a budget.

```json
{
  "steps": [
    { "ref": "room:r7", "action": "spawnEncounter", "args": ["ghoul_pack", { "tier": 2 }] },
    { "ref": "room:r7", "action": "addLoot", "args": ["potion_minor", 1] },
    { "ref": "npc:mira", "action": "say", "args": ["warn_ambush"] }
  ],
  "reason": "Hero is at full HP after two easy rooms; raise pressure."
}
```

### Idea 2: a debug snapshot for agents

Debug builds expose `window.__game.snapshot()` (HP, hand, intents, open
panels, enabled buttons as JSON) and `window.__game.act(steps)` for debug
actions. Agents check state through JSON first, which is cheaper and exact,
and take screenshots only to judge how things look. The prototypes already
do part of this ad hoc for their screenshot scripts; this would make it one
shared, documented pattern.

## DP-NNS-AO for three.js

- What: [wrong-nebula/DP-NNS-AO-for-threejs](https://github.com/wrong-nebula/DP-NNS-AO-for-threejs),
  a one-page demo (three.js 0.170, WebGL2), created 2026-11-14, 3 commits.
  Despite the name, the ambient occlusion is classic signed-distance-field
  AO: bake a 3D grid of "distance to the nearest wall", then sample it along
  each pixel's normal. The DP-NNS search was tried for baking and dropped.
- Their numbers (Apple M1, 720p, one scene): 0.16 ms against 3.8 ms for
  three.js SSAO and 9.0 ms for GTAO. Not compared with N8AO or baked AO.
- **No licence file**, so its code can't be copied into this MIT repo. It
  also replaces scene materials with custom shaders instead of adding a
  post-processing pass.

Verdict: don't use it. The idea suits a grid dungeon (walls are boxes, so
distance is cheap), and could be written from public sources such as
[Inigo Quilez's distance-field notes](https://iquilezles.org/articles/nvscene2008/rwwtt.pdf)
if we ever want it. If we want ambient occlusion, try first:

1. Bake AO in Blender into the kit pieces (free at runtime).
2. Darken corners per grid cell from the level generator, which knows where
   the walls are.
3. [N8AO](https://github.com/N8python/n8ao) (MIT) for monsters and props, measured
   with the GPU bench in `prototypes/e11-combat` before keeping it.
