// Bots and fixed policies for e15. Every policy sees the same state the player sees: the
// board, intents, its hand and energy. None of them sees the deck order: searches only
// simulate intervals (runInterval never draws), never the next window's draw.
//
//   random      random deployment, priority and cards
//   greedy      one interval ahead: best deployment, priority, then cards one at a time
//   strong      short search: beam over this window's card lines, each scored after the
//               coming interval plus one more interval of passing
//   nearest     default formation, wolf on nearest, Strike or Firebolt the nearest enemy
//   fixed       default formation, then plays like strong (placement test)
//   damage      strong deployment, strong search limited to Strike and Firebolt
//   none        default formation, wolf on nearest, never plays a card (pure watching)
//   deployOnly  strong deployment and wolf priority, never plays a card

import { applyOffset, dist, neighbors } from "./hex.ts";
import {
  type CardId,
  type Command,
  type Priority,
  type State,
  CARDS,
  PRIORITIES,
  allies,
  apply,
  clone,
  defaultFormation,
  enemies,
  hero,
  legalCards,
  oilCells,
  preview,
  runInterval,
  threats,
  unitAt,
  wolf,
} from "./combat.ts";
import { rng } from "./rng.ts";

// ---------------- scoring -----------------------------------------------------------

export function evaluate(s: State): number {
  const h = hero(s);
  const w = wolf(s);
  if (s.over === "win")
    return 10000 + (h?.hp ?? 0) * 20 + (w ? 40 + w.hp * 6 : 0) - s.interval * 15;
  if (s.over === "lose") return -10000 - enemies(s).reduce((a, e) => a + e.hp * 10, 0);
  let v = -s.interval * 2;
  for (const e of enemies(s)) {
    v -= e.hp * 3 + 12;
    const g = s.ground[e.cell];
    if (g.fire) v += g.firePow * 2;
    if (g.poison) v += 1.5;
  }
  if (h) v += h.hp * 6;
  if (w) v += 30 + w.hp * 3;
  for (const u of allies(s))
    if (u.kind === "servant" || u.kind === "totem") v += 4 + u.hp + u.ttl * 2;
  // the announced attacks, if nobody moves
  for (const t of threats(s)) {
    const cells = t.firstHit != null ? [t.firstHit] : t.enemy.intent!.kind === "ray" ? [] : t.cells;
    for (const c of cells) {
      const u = unitAt(s, c);
      if (!u || u.side !== "A") continue;
      const ward = s.ground[c].ward ? 2 : 0;
      const dmg = Math.max(0, t.damage - ward);
      v -= dmg * (u.kind === "hero" ? 5 : u.kind === "wolf" ? 2.5 : 0.8);
      if (u.kind === "hero" && dmg >= u.hp) v -= 400;
    }
  }
  for (const u of allies(s)) {
    const g = s.ground[u.cell];
    const k = u.kind === "hero" ? 5 : u.kind === "wolf" ? 2 : 0.5;
    if (g.fire) v -= g.firePow * k;
    if (g.poison) v -= k;
  }
  return v;
}

// ---------------- policy plumbing ---------------------------------------------------

export interface WindowInfo {
  interval: number;
  /** Lines the search scored: score and outcome keys (with and without positions). */
  outcomes: { score: number; key: string; keyNoPos: string }[];
  best: number;
  pass: number;
  cats: string;
  legal: number;
  nodes: number;
  ms: number;
  cards: number;
}

export interface Ctx {
  rand: () => number;
  nodes: number;
  /** Collect outcome keys for the decision-variety metrics. */
  record?: WindowInfo[];
}

export interface Policy {
  name: string;
  /** Deployment commands (deploy phase only). */
  deploy(s: State, ctx: Ctx): Command[];
  /** Priority and card commands for the current window (not the commit). */
  window(s: State, ctx: Ctx): Command[];
}

export interface Contract {
  /** Windows where the preview's interval differed from what then happened. */
  previewMismatch: number;
  /** Ally actions logged without a reason, or enemy hits outside the shown footprint. */
  unexplained: number;
  windows: number;
}

export interface FightResult {
  state: State;
  win: boolean;
  intervals: number;
  commands: number;
  cards: number;
  nodes: number;
  ms: number;
  deploy: Command[];
  windows: WindowInfo[];
  contract: Contract;
}

export interface PlayOpts {
  record?: boolean;
  /** Compare every commit with its preview (the control contract). */
  check?: boolean;
}

export function playFight(start: State, p: Policy, seed = 1, o: PlayOpts = {}): FightResult {
  const record = !!o.record;
  const contract: Contract = { previewMismatch: 0, unexplained: 0, windows: 0 };
  const s = clone(start);
  const ctx: Ctx = { rand: rng(seed * 31 + 7), nodes: 0, record: record ? [] : undefined };
  const t0 = performance.now();
  let commands = 0,
    cards = 0;
  const deploy = p.deploy(s, ctx);
  for (const c of deploy) if (apply(s, c)) commands++;
  let guard = 0;
  while (!s.over && guard++ < 40) {
    for (const c of p.window(s, ctx)) {
      if (s.over) break;
      const before = s.priority;
      if (apply(s, c)) {
        if (c.t === "card") {
          cards++;
          commands++;
        } else if (c.t === "priority" && c.mode !== before) commands++;
      }
    }
    if (s.over) break;
    if (o.check) {
      const pv = preview(s);
      // intents as shown: offsets from the enemy, so a knockback moves them with it
      const shown = new Map(enemies(s).map((e) => [e.id, e.intent?.offsets ?? []]));
      apply(s, { t: "commit" });
      contract.windows++;
      const a = s.events.map((e) => e.text).join("\n");
      const b = pv.events.map((e) => e.text).join("\n");
      if (a !== b || pv.hashes[pv.hashes.length - 1] !== s.hashes[s.hashes.length - 1])
        contract.previewMismatch++;
      for (const e of s.events) {
        if (e.t !== "attack" || e.unit == null) continue;
        const u = start.units.find((x) => x.id === e.unit) ?? s.units.find((x) => x.id === e.unit);
        if (u?.side === "A" && !/: /.test(e.text)) contract.unexplained++;
        if (u?.side === "E" && e.cells && e.from != null && shown.has(u.id)) {
          const want = shown
            .get(u.id)!
            .map((x) => applyOffset(e.from!, x))
            .filter((c) => c >= 0);
          if (e.cells.join(",") !== want.join(",")) contract.unexplained++;
        }
      }
    } else apply(s, { t: "commit" });
  }
  return {
    state: s,
    win: s.over === "win",
    intervals: s.interval,
    commands,
    cards,
    nodes: ctx.nodes,
    ms: performance.now() - t0,
    deploy,
    windows: ctx.record ?? [],
    contract,
  };
}

// ---------------- candidates --------------------------------------------------------

/** Legal card plays with obvious duplicates and far-off ground plays pruned (bots only). */
export function candidateCards(s: State, allow?: (id: CardId) => boolean): Command[] {
  const foes = enemies(s);
  const friends = allies(s);
  const near = (c: number, xs: { cell: number }[], r: number) =>
    xs.some((u) => dist(u.cell, c) <= r);
  const out: Command[] = [];
  const oilSeen = new Set<string>();
  for (const cmd of legalCards(s)) {
    if (cmd.t !== "card") continue;
    const id = s.hand[cmd.index];
    if (allow && !allow(id)) continue;
    if (id === "oil") {
      const cells = oilCells(s, cmd);
      const k = [...cells].sort((a, b) => a - b).join(",");
      if (oilSeen.has(k) || !cells.some((c) => near(c, foes, 1))) continue;
      oilSeen.add(k);
    }
    if (id === "miasma" && !near(cmd.target, foes, 1)) continue;
    if (id === "ward" && !near(cmd.target, friends, 1)) continue;
    if (
      id === "firebolt" &&
      !unitAt(s, cmd.target) &&
      s.ground[cmd.target].oil <= 0 &&
      !near(cmd.target, foes, 1)
    )
      continue;
    out.push(cmd);
  }
  return out;
}

function deployPairs(s: State): Command[][] {
  const cells = s.arena.entry.filter((c) => !s.arena.blocked[c]);
  const out: Command[][] = [];
  const hasWolf = !!wolf(s);
  for (const h of cells) {
    if (!hasWolf) {
      out.push([{ t: "deploy", unit: "hero", cell: h }]);
      continue;
    }
    for (const w of cells)
      if (w !== h)
        out.push([
          { t: "deploy", unit: "hero", cell: h },
          { t: "deploy", unit: "wolf", cell: w },
        ]);
  }
  return out;
}

function formationCmds(s: State): Command[] {
  const f = defaultFormation(s.arena, !wolf(s));
  const out: Command[] = [{ t: "deploy", unit: "hero", cell: f.hero }];
  if (wolf(s)) out.push({ t: "deploy", unit: "wolf", cell: f.wolf });
  return out;
}

/** Outcome key after the automatic interval (shared definition, research section 7). */
export function outcomeKey(s: State, positions: boolean): string {
  const units = s.units
    .filter((u) => u.hp > 0)
    .map((u) => `${u.id}:${Math.floor(u.hp / 2)}${positions ? `@${u.cell}` : ""}`)
    .join(" ");
  const hz = s.ground
    .map((g, i) =>
      g.fire || g.oil || g.poison || g.ward
        ? `${i}${g.fire ? "f" : ""}${g.oil ? "o" : ""}${g.poison ? "p" : ""}${g.ward ? "w" : ""}`
        : "",
    )
    .filter(Boolean)
    .join(",");
  return `${s.over ?? ""}|${units}|${hz}|${s.energy}`;
}

// ---------------- search ------------------------------------------------------------

export interface SearchOpts {
  /** Extra intervals of passing after the coming one. */
  rollout: number;
  beam: number;
  allow?: (id: CardId) => boolean;
  priorities?: Priority[];
  /** Max cards (default: what the window allows). */
  maxCards?: number;
}
export const STRONG: SearchOpts = { rollout: 1, beam: 6 };

interface Line {
  cmds: Command[];
  state: State; // after the cards, before the interval
  score: number;
}

function scoreLine(s: State, rollout: number, ctx: Ctx, rec?: WindowInfo["outcomes"]): number {
  const c = clone(s);
  c.quiet = true;
  runInterval(c);
  ctx.nodes++;
  if (rec) rec.push({ score: 0, key: outcomeKey(c, true), keyNoPos: outcomeKey(c, false) });
  for (let i = 0; i < rollout && !c.over; i++) {
    runInterval(c);
    ctx.nodes++;
  }
  const v = evaluate(c);
  if (rec) rec[rec.length - 1].score = v;
  return v;
}

export function searchWindow(
  s: State,
  o: SearchOpts,
  ctx: Ctx,
): { cmds: Command[]; info: WindowInfo } {
  const t0 = performance.now();
  const n0 = ctx.nodes;
  const rec: WindowInfo["outcomes"] | undefined = ctx.record ? [] : undefined;
  const prios = o.priorities ?? (wolf(s) ? PRIORITIES : [s.priority]);
  const base = clone(s);
  base.quiet = true;
  // 1. priority on the pass line
  let bestPrio = prios[0];
  let passScore = -Infinity;
  for (const p of prios) {
    const c = clone(base);
    apply(c, { t: "priority", mode: p });
    const v = scoreLine(c, o.rollout, ctx);
    if (v > passScore) {
      passScore = v;
      bestPrio = p;
    }
  }
  const start = clone(base);
  apply(start, { t: "priority", mode: bestPrio });
  let best: Line = { cmds: [], state: start, score: passScore };
  if (rec) rec.push({ score: passScore, key: "pass", keyNoPos: "pass" });
  // 2. beam over card lines
  const maxCards = Math.min(o.maxCards ?? 99, s.maxCards - s.played);
  let frontier: Line[] = [best];
  let legalCount = 0;
  for (let depth = 0; depth < maxCards && frontier.length; depth++) {
    const next: Line[] = [];
    for (const line of frontier) {
      const cands = candidateCards(line.state, o.allow);
      if (depth === 0) legalCount = cands.length;
      for (const cmd of cands) {
        const c = clone(line.state);
        if (!apply(c, cmd)) continue;
        c.events = [];
        const v = c.over ? (c.over === "win" ? 20000 : -20000) : scoreLine(c, o.rollout, ctx, rec);
        next.push({ cmds: [...line.cmds, cmd], state: c, score: v });
      }
    }
    next.sort((a, b) => b.score - a.score);
    if (next.length && next[0].score > best.score) best = next[0];
    frontier = next.slice(0, o.beam).filter((l) => !l.state.over);
  }
  // 3. re-check the priority with the chosen cards
  let cmds: Command[] = [{ t: "priority", mode: bestPrio }, ...best.cmds];
  if (best.cmds.length && prios.length > 1) {
    for (const p of prios) {
      if (p === bestPrio) continue;
      const c = clone(base);
      apply(c, { t: "priority", mode: p });
      let ok = true;
      for (const cmd of best.cmds) ok = ok && apply(c, cmd);
      if (!ok) continue;
      const v = c.over ? best.score : scoreLine(c, o.rollout, ctx);
      if (v > best.score) {
        best = { ...best, score: v };
        cmds = [{ t: "priority", mode: p }, ...best.cmds];
      }
    }
  }
  const cats = best.cmds.length
    ? [
        ...new Set(
          best.cmds.map((c) => (c.t === "card" ? (CARDS[s.hand[c.index]]?.cat ?? "?") : c.t)),
        ),
      ]
        .sort()
        .join("+")
    : "pass";
  const info: WindowInfo = {
    interval: s.interval,
    outcomes: rec ?? [],
    best: best.score,
    pass: passScore,
    cats,
    legal: legalCount,
    nodes: ctx.nodes - n0,
    ms: performance.now() - t0,
    cards: best.cmds.length,
  };
  ctx.record?.push(info);
  return { cmds, info };
}

/** Search the deployment: score every hero/wolf pair by passing a few intervals, then
 * run the full window search on the best few. */
export function searchDeploy(s: State, o: SearchOpts, ctx: Ctx, playCards: boolean): Command[] {
  const pairs = deployPairs(s);
  const scored: { cmds: Command[]; v: number }[] = [];
  for (const cmds of pairs) {
    const c = clone(s);
    c.quiet = true;
    for (const x of cmds) apply(c, x);
    let bestV = -Infinity;
    for (const p of o.priorities ?? (wolf(c) ? PRIORITIES : [c.priority])) {
      const d = clone(c);
      apply(d, { t: "priority", mode: p });
      bestV = Math.max(bestV, scoreLine(d, 2, ctx));
    }
    scored.push({ cmds, v: bestV });
  }
  scored.sort((a, b) => b.v - a.v);
  if (!playCards) return scored[0].cmds;
  let best = scored[0];
  let bestV = -Infinity;
  for (const cand of scored.slice(0, 3)) {
    const c = clone(s);
    c.quiet = true;
    for (const x of cand.cmds) apply(c, x);
    const sub: Ctx = { rand: ctx.rand, nodes: 0 };
    const r = searchWindow(c, o, sub);
    ctx.nodes += sub.nodes;
    if (r.info.best > bestV) {
      bestV = r.info.best;
      best = cand;
    }
  }
  return best.cmds;
}

// ---------------- policies ----------------------------------------------------------

export function strongPolicy(o: SearchOpts = STRONG, name = "strong"): Policy {
  return {
    name,
    deploy: (s, ctx) => searchDeploy(s, o, ctx, true),
    window: (s, ctx) => searchWindow(s, o, ctx).cmds,
  };
}

export const randomPolicy: Policy = {
  name: "random",
  deploy(s, ctx) {
    const pairs = deployPairs(s);
    return pairs[Math.floor(ctx.rand() * pairs.length)];
  },
  window(s, ctx) {
    const out: Command[] = [{ t: "priority", mode: PRIORITIES[Math.floor(ctx.rand() * 3)] }];
    const n = Math.floor(ctx.rand() * 3);
    const c = clone(s);
    c.quiet = true;
    apply(c, out[0]);
    for (let i = 0; i < n; i++) {
      const opts = legalCards(c);
      if (!opts.length) break;
      const cmd = opts[Math.floor(ctx.rand() * opts.length)];
      apply(c, cmd);
      out.push(cmd);
    }
    return out;
  },
};

/** Random legal cards (for the intervention test); keeps the priority. */
export const randomCardsPolicy: Policy = {
  name: "randomCards",
  deploy: (s) => formationCmds(s),
  window(s, ctx) {
    const out: Command[] = [];
    const c = clone(s);
    c.quiet = true;
    for (let i = 0; i < 2; i++) {
      const opts = legalCards(c);
      if (!opts.length) break;
      const cmd = opts[Math.floor(ctx.rand() * opts.length)];
      apply(c, cmd);
      out.push(cmd);
    }
    return out;
  },
};

export const greedyPolicy: Policy = {
  name: "greedy",
  deploy: (s, ctx) => {
    let best: Command[] = [];
    let bestV = -Infinity;
    for (const cmds of deployPairs(s)) {
      const c = clone(s);
      c.quiet = true;
      for (const x of cmds) apply(c, x);
      const v = scoreLine(c, 0, ctx);
      if (v > bestV) {
        bestV = v;
        best = cmds;
      }
    }
    return best;
  },
  window(s, ctx) {
    const c = clone(s);
    c.quiet = true;
    let bestP: Priority = c.priority;
    let bestV = -Infinity;
    for (const p of wolf(c) ? PRIORITIES : [c.priority]) {
      const d = clone(c);
      apply(d, { t: "priority", mode: p });
      const v = scoreLine(d, 0, ctx);
      if (v > bestV) {
        bestV = v;
        bestP = p;
      }
    }
    const out: Command[] = [{ t: "priority", mode: bestP }];
    apply(c, out[0]);
    for (let i = 0; i < 2 && !c.over; i++) {
      let pick: Command | null = null;
      for (const cmd of candidateCards(c)) {
        const d = clone(c);
        if (!apply(d, cmd)) continue;
        const v = d.over === "win" ? 20000 : scoreLine(d, 0, ctx);
        if (v > bestV) {
          bestV = v;
          pick = cmd;
        }
      }
      if (!pick) break;
      apply(c, pick);
      out.push(pick);
    }
    return out;
  },
};

export const nearestPolicy: Policy = {
  name: "nearest",
  deploy: (s) => formationCmds(s),
  window(s) {
    const out: Command[] = [{ t: "priority", mode: "nearest" }];
    const c = clone(s);
    c.quiet = true;
    apply(c, out[0]);
    for (let i = 0; i < 2 && !c.over; i++) {
      const h = hero(c);
      if (!h) break;
      const foes = enemies(c).sort(
        (a, b) => dist(a.cell, h.cell) - dist(b.cell, h.cell) || a.id - b.id,
      );
      const opts = legalCards(c).filter((x) => {
        if (x.t !== "card") return false;
        const id = c.hand[x.index];
        return (id === "strike" || id === "firebolt") && unitAt(c, x.target)?.side === "E";
      });
      opts.sort((a, b) => {
        if (a.t !== "card" || b.t !== "card") return 0;
        const ia = foes.findIndex((f) => f.cell === a.target),
          ib = foes.findIndex((f) => f.cell === b.target);
        return ia - ib || (c.hand[a.index] === "strike" ? -1 : 1);
      });
      if (!opts.length) break;
      apply(c, opts[0]);
      out.push(opts[0]);
    }
    return out;
  },
};

export const nonePolicy: Policy = {
  name: "none",
  deploy: (s) => formationCmds(s),
  window: () => [{ t: "priority", mode: "nearest" }],
};

export const fixedPolicy: Policy = {
  name: "fixed",
  deploy: (s) => formationCmds(s),
  window: (s, ctx) => searchWindow(s, STRONG, ctx).cmds,
};

const damageOnly = (id: CardId) => id === "strike" || id === "firebolt";
export const damagePolicy: Policy = {
  name: "damage",
  deploy: (s, ctx) => searchDeploy(s, { ...STRONG, allow: damageOnly }, ctx, true),
  window: (s, ctx) => searchWindow(s, { ...STRONG, allow: damageOnly }, ctx).cmds,
};

export const deployOnlyPolicy: Policy = {
  name: "deployOnly",
  deploy: (s, ctx) => searchDeploy(s, STRONG, ctx, false),
  window: (s, ctx) => searchWindow(s, { ...STRONG, maxCards: 0 }, ctx).cmds,
};

/** Any policy with its deployment replaced (paired tests: same deployment). */
export function withDeploy(p: Policy, cmds: Command[], name = p.name): Policy {
  return { name, deploy: () => cmds, window: (s, ctx) => p.window(s, ctx) };
}

/** Strong windows from a given (often random) deployment: placement sensitivity. */
export function strongFrom(cmds: Command[]): Policy {
  return withDeploy(strongPolicy(), cmds, "strongFrom");
}

/** A random legal deployment (for placement samples). */
export function randomDeploy(s: State, r: () => number): Command[] {
  const pairs = deployPairs(s);
  return pairs[Math.floor(r() * pairs.length)];
}

export const POLICIES: Record<string, Policy> = {
  random: randomPolicy,
  greedy: greedyPolicy,
  strong: strongPolicy(),
  nearest: nearestPolicy,
  fixed: fixedPolicy,
  damage: damagePolicy,
  none: nonePolicy,
  deployOnly: deployOnlyPolicy,
};

void neighbors;
