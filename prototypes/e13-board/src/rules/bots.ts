// Bots for the board fight. All of them play through act() and legalActions(), the same
// entry points as the mouse UI.
//   random  - random legal actions, ends the turn at random
//   greedy  - one action at a time, the best by evaluate() (looks at the visible intents,
//             not at what enemies do after)
//   strong  - beam search over the whole player turn; every candidate turn is scored after
//             simulating the enemy phase, so it sees pushes, hazards and dodges pay off
//   simple policies, to test for dominant patterns:
//     nearest - every unit walks to the nearest enemy and hits it
//     retreat - every unit steps out of the hit tiles, away from enemies, then shoots if it can
//     stack   - the greedy bot, but only damage cards (Strike, Firebolt) and Bite

import {
  ABILITIES,
  CARDS,
  act,
  clone,
  enemies,
  hero,
  intentDamage,
  intentTiles,
  key,
  legalActions,
  manhattan,
  party,
  peekGround,
  reachable,
  unitAt,
  type Action,
  type Cat,
  type State,
  type Unit,
} from "./combat.ts";
import { rng } from "./rng.ts";

const W: Record<string, number> = { hero: 3, wolf: 1.2, servant: 0.6, totem: 0.6 };
const ALIVE: Record<string, number> = { hero: 0, wolf: 8, servant: 3, totem: 3 };

/** Position value from the player's side. Counts the damage the visible intents will do. */
export function evaluate(s: State): number {
  if (s.over === "win") return 1000 + (hero(s)?.hp ?? 0) * 3 - s.round * 4;
  if (s.over === "loss") return -1000 - enemies(s).reduce((a, e) => a + e.hp, 0);
  let v = 0;
  for (const u of party(s)) v += u.hp * (W[u.kind] ?? 1) + (ALIVE[u.kind] ?? 0) + u.block * 0.3;
  for (const e of enemies(s)) v -= e.hp * 2 + 8;
  v -= s.reinforcements.length * 12;
  for (const e of enemies(s)) {
    for (const p of intentTiles(s, e)) {
      const u = unitAt(s, p);
      if (!u || u === e) continue;
      const dmg = Math.max(0, intentDamage(s, e, p) - u.block - (peekGround(s, p)?.ward ? 2 : 0));
      v += u.side === "player" ? -dmg * (W[u.kind] ?? 1) * 0.9 : dmg * 1.6;
    }
  }
  for (const u of s.units) {
    const g = peekGround(s, u);
    if (!g) continue;
    const hurt = (g.fire ? (g.blaze ? 5 : 3) : 0) + (g.poison ? 2 : 0);
    v += u.side === "enemy" ? hurt * 1.6 : -hurt * (W[u.kind] ?? 1);
  }
  return v;
}

export interface TurnInfo {
  actions: Action[];
  /** Strong bot only: distinct outcomes among candidate turns, and among the good ones. */
  distinct?: number;
  viable?: number;
  candidates?: number;
}
export type Bot = (s: State, r: () => number) => TurnInfo;

function apply(s: State, a: Action): boolean {
  return act(s, a).ok;
}

export const randomBot: Bot = (s, r) => {
  const actions: Action[] = [];
  for (let i = 0; i < 12 && !s.over; i++) {
    const all = legalActions(s);
    if (!all.length || r() < 0.15) break;
    const a = all[Math.floor(r() * all.length)];
    if (apply(s, a)) actions.push(a);
  }
  if (!s.over) {
    apply(s, { type: "end" });
    actions.push({ type: "end" });
  }
  return { actions };
};

function greedyWith(filter: (s: State, a: Action) => boolean): Bot {
  return (s) => {
    const actions: Action[] = [];
    for (let i = 0; i < 14 && !s.over; i++) {
      const base = evaluate(s);
      let best: { a: Action; v: number } | null = null;
      for (const a of legalActions(s)) {
        if (!filter(s, a)) continue;
        const c = clone(s);
        if (!act(c, a).ok) continue;
        const v = evaluate(c);
        if (!best || v > best.v) best = { a, v };
      }
      if (!best || best.v <= base + 0.01) break;
      apply(s, best.a);
      actions.push(best.a);
    }
    if (!s.over) {
      apply(s, { type: "end" });
      actions.push({ type: "end" });
    }
    return { actions };
  };
}
export const greedyBot = greedyWith(() => true);
export const stackBot = greedyWith((s, a) => {
  if (a.type === "card") return ["strike", "firebolt"].includes(s.hand[a.index]);
  if (a.type === "ability") return a.ability === "bite";
  return true;
});

/** Compact fingerprint of a state for de-duplicating search nodes. */
function sig(s: State): string {
  const u = s.units
    .map((x) => `${x.id}:${x.x},${x.y},${x.hp},${x.moveLeft},${x.acted ? 1 : 0},${x.block}`)
    .join(";");
  const g = Object.keys(s.ground)
    .sort()
    .map((k) => `${k}${JSON.stringify(s.ground[k])}`)
    .join("");
  return `${u}|${s.hand.join(",")}|${s.energy}|${g}|${s.braziers.length}`;
}
/** What a turn actually changed after the enemies answered: used for decision variety. */
function outcome(s: State): string {
  const eh = enemies(s).reduce((a, e) => a + e.hp, 0);
  const ph = party(s).reduce((a, e) => a + e.hp, 0);
  const hazards = Object.values(s.ground).filter((g) => g.fire || g.poison).length;
  return `${s.over ?? ""}|${enemies(s).length}|${Math.round(eh / 2)}|${Math.round(ph / 2)}|${party(s).length}|${Math.min(hazards, 6) >> 1}`;
}

export interface StrongOpts {
  beam?: number;
  depth?: number;
}
export function strongBot(opts: StrongOpts = {}): Bot {
  const beam = opts.beam ?? 6,
    depth = opts.depth ?? 8;
  return (s) => {
    type Node = { s: State; actions: Action[]; v: number };
    let frontier: Node[] = [{ s: clone(s), actions: [], v: evaluate(s) }];
    const finished: { actions: Action[]; v: number; out: string }[] = [];
    const seenEnd = new Set<string>();
    for (let d = 0; d <= depth && frontier.length; d++) {
      const next: Node[] = [];
      const seen = new Set<string>();
      for (const n of frontier) {
        const k = sig(n.s);
        if (!seenEnd.has(k)) {
          seenEnd.add(k);
          const f = clone(n.s);
          act(f, { type: "end" });
          finished.push({
            actions: [...n.actions, { type: "end" }],
            v: evaluate(f),
            out: outcome(f),
          });
        }
        if (d === depth || n.s.over) continue;
        for (const a of legalActions(n.s)) {
          const c = clone(n.s);
          if (!act(c, a).ok) continue;
          const ck = sig(c);
          if (seen.has(ck)) continue;
          seen.add(ck);
          if (c.over) {
            finished.push({ actions: [...n.actions, a], v: evaluate(c), out: outcome(c) });
            continue;
          }
          next.push({ s: c, actions: [...n.actions, a], v: evaluate(c) });
        }
      }
      next.sort((a, b) => b.v - a.v);
      frontier = next.slice(0, beam);
    }
    finished.sort((a, b) => b.v - a.v);
    const best = finished[0];
    const margin = Math.max(8, Math.abs(best.v) * 0.08);
    const distinct = new Set(finished.map((f) => f.out)).size;
    const viable = new Set(finished.filter((f) => f.v >= best.v - margin).map((f) => f.out)).size;
    for (const a of best.actions) if (!s.over) apply(s, a);
    return { actions: best.actions, distinct, viable, candidates: finished.length };
  };
}

// ---------------- simple policies -------------------------------------------------

function nearestEnemy(s: State, u: Unit): Unit | undefined {
  let best: Unit | undefined;
  for (const e of enemies(s)) if (!best || manhattan(e, u) < manhattan(best, u)) best = e;
  return best;
}

function attackAdjacent(s: State, u: Unit, actions: Action[]) {
  const options =
    u.kind === "hero"
      ? s.hand.map((c, index) => ({ c, index })).filter((x) => x.c === "strike")
      : [];
  for (const e of enemies(s)) {
    if (manhattan(e, u) !== 1) continue;
    if (u.kind === "hero") {
      for (const o of options) {
        const a: Action = { type: "card", index: s.hand.indexOf(o.c), at: { x: e.x, y: e.y } };
        if (s.hand.indexOf(o.c) >= 0 && apply(s, a)) actions.push(a);
      }
    } else {
      const ab = u.kind === "wolf" ? "bite" : u.kind === "servant" ? "slam" : null;
      if (ab) {
        const a: Action = { type: "ability", unit: u.id, ability: ab, at: { x: e.x, y: e.y } };
        if (apply(s, a)) actions.push(a);
      }
    }
    return;
  }
}

/** Fire every line attack that would hit an enemy first. */
function shootLines(s: State, u: Unit, actions: Action[]) {
  for (const e of enemies(s)) {
    if (u.kind === "hero") {
      const i = s.hand.indexOf("firebolt");
      if (i < 0) return;
      const a: Action = { type: "card", index: i, at: { x: e.x, y: e.y } };
      const c = clone(s);
      if (
        act(c, a).ok &&
        enemies(c).reduce((x, y) => x + y.hp, 0) < enemies(s).reduce((x, y) => x + y.hp, 0)
      ) {
        apply(s, a);
        actions.push(a);
      }
    } else if (u.kind === "totem" && !u.acted) {
      const a: Action = { type: "ability", unit: u.id, ability: "lash", at: { x: e.x, y: e.y } };
      if (apply(s, a)) actions.push(a);
    }
  }
}

export const nearestBot: Bot = (s) => {
  const actions: Action[] = [];
  for (const u of party(s)) {
    if (s.over || !s.units.includes(u)) continue;
    const e = nearestEnemy(s, u);
    if (!e) break;
    if (manhattan(e, u) > 1 && u.moveLeft > 0) {
      let best: { k: string; d: number } | null = null;
      for (const k of reachable(s, u).keys()) {
        const [x, y] = k.split(",").map(Number);
        const d = manhattan({ x, y }, e);
        if (!best || d < best.d) best = { k, d };
      }
      if (best && best.d < manhattan(u, e)) {
        const [x, y] = best.k.split(",").map(Number);
        const a: Action = { type: "move", unit: u.id, to: { x, y } };
        if (apply(s, a)) actions.push(a);
      }
    }
    attackAdjacent(s, u, actions);
    shootLines(s, u, actions);
  }
  if (!s.over) {
    apply(s, { type: "end" });
    actions.push({ type: "end" });
  }
  return { actions };
};

export const retreatBot: Bot = (s) => {
  const actions: Action[] = [];
  const danger = new Set<string>();
  for (const e of enemies(s)) for (const p of intentTiles(s, e)) danger.add(key(p));
  for (const u of party(s)) {
    if (s.over || !s.units.includes(u)) continue;
    if (u.moveLeft > 0) {
      let best: { k: string; v: number } | null = null;
      const here = key(u);
      for (const k of [here, ...reachable(s, u).keys()]) {
        const [x, y] = k.split(",").map(Number);
        const near = Math.min(...enemies(s).map((e) => manhattan(e, { x, y })));
        const v = (danger.has(k) ? -100 : 0) + near;
        if (!best || v > best.v) best = { k, v };
      }
      if (best && best.k !== here) {
        const [x, y] = best.k.split(",").map(Number);
        const a: Action = { type: "move", unit: u.id, to: { x, y } };
        if (apply(s, a)) actions.push(a);
      }
    }
    attackAdjacent(s, u, actions);
    shootLines(s, u, actions);
  }
  if (!s.over) {
    apply(s, { type: "end" });
    actions.push({ type: "end" });
  }
  return { actions };
};

// ---------------- running fights ---------------------------------------------------

export interface FightResult {
  win: boolean;
  rounds: number;
  turns: {
    distinct?: number;
    viable?: number;
    candidates?: number;
    cats: string[];
    primary: string;
  }[];
  stats: State["stats"];
}

/** Category of each action in a turn, read before the action is applied. */
function catsOf(s: State, actions: Action[]): (Cat | "move")[] {
  const c = clone(s);
  const out: (Cat | "move")[] = [];
  for (const a of actions) {
    if (a.type === "move") out.push("move");
    else if (a.type === "card") out.push(CARDS[c.hand[a.index]].cat);
    else if (a.type === "ability") out.push(ABILITIES[a.ability].cat);
    if (a.type !== "end") act(c, a);
  }
  return out;
}

export function playFight(start: State, bot: Bot, seed = 1): FightResult {
  const s = clone(start);
  const r = rng(seed);
  const turns: FightResult["turns"] = [];
  for (let guard = 0; guard < 40 && !s.over; guard++) {
    const before = clone(s);
    const info = bot(s, r);
    s.events = [];
    const cats = catsOf(before, info.actions);
    const counts = new Map<string, number>();
    for (const c of cats) if (c !== "move") counts.set(c, (counts.get(c) ?? 0) + 1);
    const primary =
      [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "move";
    turns.push({
      distinct: info.distinct,
      viable: info.viable,
      candidates: info.candidates,
      cats: [...new Set(cats.filter((c) => c !== "move"))].sort(),
      primary,
    });
  }
  return { win: s.over === "win", rounds: s.round, turns, stats: s.stats };
}

export const BOTS: Record<string, Bot> = {
  random: randomBot,
  greedy: greedyBot,
  strong: strongBot(),
  nearest: nearestBot,
  retreat: retreatBot,
  stack: stackBot,
};
