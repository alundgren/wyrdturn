// Bot helpers for the view: auto-continue asks the strong search whether any card line
// beats passing by a clear margin, and the debug handle can let the bot plan a window.
import type { Command, State } from "../rules/combat.ts";
import { STRONG, searchDeploy, searchWindow } from "../rules/bots.ts";

export const NEAR_MARGIN = 10;

export function searchWindowPublic(s: State): { cmds: Command[]; legal: number; gain: number } {
  const r = searchWindow(s, STRONG, { rand: Math.random, nodes: 0 });
  return { cmds: r.cmds, legal: r.info.legal, gain: r.info.best - r.info.pass };
}

export function strongDeploy(s: State): Command[] {
  return searchDeploy(s, STRONG, { rand: Math.random, nodes: 0 }, true);
}
