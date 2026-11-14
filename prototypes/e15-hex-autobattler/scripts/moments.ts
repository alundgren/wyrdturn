// Find recorded moments in strong-bot play for the screenshots and RESULT.md:
//   push   a window where the bot's card forces an enemy into fire or a blaze
//   pet    a window where passing would kill the wolf and the bot's cards save it
//   pass   a window where cards were legal but the bot chose to pass
// Usage: node scripts/moments.ts   (prints JSON). Fights are named like the view's URL:
// {fight: 1..6} for hand-made fights, {gen: seed} for generated ones; deck seed `seed`.
import {
  type Command,
  type State,
  apply,
  clone,
  hashState,
  newFight,
  preview,
  wolf,
} from "../src/rules/combat.ts";
import { AUTHORED_COUNT, authored, generate } from "../src/rules/encounters.ts";
import { STRONG, searchDeploy, searchWindow } from "../src/rules/bots.ts";

export interface Moment {
  fight?: number;
  gen?: number;
  seed: number;
  /** 0 = deploy window, k = window after interval k. */
  window: number;
  cmds: Command[];
  note: string;
  /** State hash when the window opens (the view must reach the same state). */
  hash: string;
}

function scan(
  make: () => State,
  where: { fight?: number; gen?: number; seed: number },
  found: Record<string, Moment>,
) {
  const s = make();
  const ctx = { rand: Math.random, nodes: 0 };
  let w = 0;
  const dep = searchDeploy(s, STRONG, ctx, true);
  for (const c of dep) apply(s, c);
  while (!s.over && w < 16) {
    const hash = hashState(s);
    const { cmds, info } = searchWindow(s, STRONG, ctx);
    const cards = cmds.filter((c) => c.t === "card");
    const withLine = clone(s);
    for (const c of cmds) apply(withLine, c);
    const stats0 = s.stats.forcedIntoHazard ?? 0;
    if (
      !found.push &&
      (withLine.stats.forcedIntoHazard ?? 0) > stats0 &&
      cards.some((c) => c.t === "card" && ["shoulder", "hook"].includes(s.hand[c.index]))
    )
      found.push = {
        ...where,
        window: w,
        cmds: w === 0 ? [...dep, ...cmds] : cmds,
        note: "card pushes or pulls an enemy into a hazard",
        hash,
      };
    if (!found.pet && wolf(s) && cards.length) {
      const pass = clone(s);
      for (const c of cmds) if (c.t === "priority") apply(pass, c);
      const pv = preview(pass);
      const pl = preview(withLine);
      if (!wolf(pv) && wolf(pl) && !pv.over && !pl.over)
        found.pet = {
          ...where,
          window: w,
          cmds: w === 0 ? [...dep, ...cmds] : cmds,
          note: "passing kills the wolf; the cards save it",
          hash,
        };
    }
    if (!found.pass && w > 0 && info.legal > 0 && !cards.length)
      found.pass = { ...where, window: w, cmds, note: "cards were legal; the bot passed", hash };
    for (const c of cmds) apply(s, c);
    apply(s, { t: "commit" });
    w++;
  }
}

export function findMoments(): Record<string, Moment> {
  const found: Record<string, Moment> = {};
  for (let f = 0; f < AUTHORED_COUNT && Object.keys(found).length < 3; f++)
    for (let seed = 1; seed <= 6 && Object.keys(found).length < 3; seed++)
      scan(() => newFight(authored(f), seed), { fight: f + 1, seed }, found);
  for (let g = 1; g <= 80 && Object.keys(found).length < 3; g++)
    scan(() => newFight(generate(g), 1), { gen: g, seed: 1 }, found);
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`)
  console.log(JSON.stringify(findMoments(), null, 1));
