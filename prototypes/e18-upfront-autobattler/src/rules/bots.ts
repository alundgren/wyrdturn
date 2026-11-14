// Bots that choose setups. Fights are deterministic, so a bot can simply try setups.
//   strong  - tries every setup and keeps the best (win, then HP left, then time)
//   default - one fixed sensible setup
//   random  - a random setup
//   blind   - one setup chosen once for all fights (see metrics), never adapts
import { BOSS_PHASES } from "./content.ts";
import { pickOne } from "./rng.ts";
import {
  DEFAULT_OPTS,
  hero,
  nextPhase,
  runToEnd,
  sideHp,
  sideMax,
  startFight,
  type Encounter,
  type Mods,
  type Result,
  type RuleOpts,
  type Setup,
  type State,
} from "./sim.ts";
import { allSetups, defaultFor, neighbours, type Change, type Pool } from "./setup.ts";

export interface Outcome {
  result: Result;
  t: number;
  heroHp: number; // share of max
  ourHp: number; // share of your side's max HP left
  enemyHp: number; // share of the enemies' max HP left
  score: number;
}

export function outcome(s: State): Outcome {
  const h = hero(s);
  const ourHp = sideHp(s, "P") / sideMax(s, "P");
  const enemyHp = sideHp(s, "E") / sideMax(s, "E");
  const won = s.over === "win" || s.over === "phase";
  const score = won ? 1e6 + 1000 * ourHp - s.t : 1000 * (1 - enemyHp) - s.t;
  return {
    result: s.over!,
    t: s.t,
    heroHp: Math.max(0, h.hp) / h.maxHp,
    ourHp,
    enemyHp,
    score,
  };
}

export const play = (enc: Encounter, setup: Setup, opts: RuleOpts = DEFAULT_OPTS, mods?: Mods) =>
  outcome(runToEnd(startFight(enc, setup, opts, mods)));

export const won = (o: Outcome) => o.result !== "loss";

export interface Scored {
  setup: Setup;
  o: Outcome;
}

export function scoreAll(enc: Encounter, setups: Setup[], opts = DEFAULT_OPTS, mods?: Mods) {
  return setups.map((setup) => ({ setup, o: play(enc, setup, opts, mods) }));
}

export function best(scored: Scored[]): Scored {
  let b = scored[0];
  for (const x of scored) if (x.o.score > b.o.score) b = x;
  return b;
}

export function strong(enc: Encounter, pool: Pool, opts = DEFAULT_OPTS, mods?: Mods): Scored {
  return best(scoreAll(enc, allSetups(pool), opts, mods));
}

export function randomSetup(r: () => number, pool: Pool): Setup {
  return pickOne(r, allSetups(pool));
}

export const defaultBot = (pool: Pool) => defaultFor(pool);

// ---------------- boss: phases --------------------------------------------------------------

export interface BossPlay {
  result: "win" | "loss";
  phases: { setup: Setup; result: Result; t: number }[];
  t: number;
  heroHp: number;
}

// Plays the boss with a chooser that sees the state at the start of each phase.
export function playBoss(
  enc: Encounter,
  choose: (phase: number, start: (setup: Setup) => State) => Setup,
  opts = DEFAULT_OPTS,
  mods?: Mods,
): BossPlay {
  let prev: State | null = null;
  const phases: BossPlay["phases"] = [];
  let total = 0;
  for (let n = 0; n < BOSS_PHASES.length; n++) {
    const p = prev;
    const start = (setup: Setup) =>
      p ? nextPhase(p, setup, mods) : startFight(enc, setup, opts, mods);
    const setup = choose(n, start);
    const s = runToEnd(start(setup));
    phases.push({ setup, result: s.over!, t: s.t });
    total += s.t;
    if (s.over === "loss") return { result: "loss", phases, t: total, heroHp: 0 };
    if (s.over === "win") {
      const h = hero(s);
      return { result: "win", phases, t: total, heroHp: h.hp / h.maxHp };
    }
    prev = s;
  }
  return { result: "loss", phases, t: total, heroHp: 0 };
}

// Greedy per phase: the best setup for the phase in front of you (it can't see later phases).
export function bossAdaptive(pool: Pool) {
  // the phase start already carries the rule switches
  return (_n: number, start: (s: Setup) => State) => {
    let b: Scored | null = null;
    for (const setup of allSetups(pool)) {
      const o = outcome(runToEnd(start(setup)));
      if (!b || o.score > b.o.score) b = { setup, o };
    }
    return b!.setup;
  };
}

// ---------------- explaining a result ---------------------------------------------------------

// After a loss: single changes that win, best first. After a win: what would have lost.
export function oneChange(
  enc: Encounter,
  setup: Setup,
  pool: Pool,
  opts = DEFAULT_OPTS,
  mods?: Mods,
  start?: (s: Setup) => State,
): { flips: (Change & { o: Outcome })[]; base: Outcome } {
  const run = (s: Setup) => outcome(runToEnd(start ? start(s) : startFight(enc, s, opts, mods)));
  const base = run(setup);
  const flips: (Change & { o: Outcome })[] = [];
  for (const c of neighbours(setup, pool)) {
    const o = run(c.setup);
    if (won(o) !== won(base)) flips.push({ ...c, o });
  }
  flips.sort((a, b) => (won(base) ? a.o.score - b.o.score : b.o.score - a.o.score));
  return { flips, base };
}
