// Bots for e17 (from e14), for every deck model: random, greedy (one action at a time, no look past the turn), strong (beam
// search over the whole player turn, scoring each line after simulating the enemy phase),
// and three simple fixed policies used to look for dominant patterns. Pure logic.
import {
  type Action,
  type State,
  abilityOf,
  allies,
  apply,
  cardAbility,
  clone,
  endTurn,
  enemies,
  hero,
  legalActions,
  nextRandom,
  SLOTS,
  slotOf,
  threats,
  unitAt,
  unitById,
  type Ability,
} from "./rules.ts";

export type Bot = (s: State) => Action[]; // the actions for one player turn, ending with "end"

const VALUE: Record<string, number> = { hero: 2.5, beetle: 0.9, servant: 0.5, totem: 0.5 };
const ALIVE: Record<string, number> = { hero: 0, beetle: 10, servant: 4, totem: 4 };

export function evaluate(s: State): number {
  if (s.over === "win") return 10000 + (hero(s)?.hp ?? 0) * 20 - s.round * 5;
  if (s.over === "lose") return -10000 - enemies(s).reduce((a, e) => a + e.hp, 0);
  let v = 0;
  for (const e of enemies(s)) {
    v -= e.hp + 7;
    const g = s.ground.E[slotOf(s, e)];
    if (g.fire) v += (g.blaze ? 5 : 3) * 0.9;
    if (g.poison) v += g.poison * 0.9;
    if (g.oil) v += 0.6;
  }
  for (const u of allies(s)) {
    v += u.hp * (VALUE[u.kind] ?? 0.5) + (ALIVE[u.kind] ?? 0);
    const g = s.ground.P[slotOf(s, u)];
    if (g.fire) v -= (g.blaze ? 5 : 3) * (u.kind === "hero" ? 2 : 0.8);
    if (g.poison) v -= g.poison * (u.kind === "hero" ? 2 : 0.8);
  }
  // shown intents: what lands next enemy phase if nothing changes
  const blockLeft = new Map<number, number>();
  for (const t of threats(s)) {
    if (t.side !== "P") continue;
    const u = unitAt(s, "P", t.slot);
    if (!u) continue;
    const b = blockLeft.get(u.id) ?? u.block;
    const ward = s.ground.P[t.slot].ward ? 2 : 0;
    const raw = Math.max(0, t.damage - ward);
    const taken = Math.max(0, raw - b);
    blockLeft.set(u.id, Math.max(0, b - raw));
    v -= taken * (u.kind === "hero" ? 2 : 0.8) + (t.hazard ? 2 : 0);
  }
  return v;
}

function afterEnemyPhase(s: State): number {
  if (s.over) return evaluate(s);
  const c = clone(s);
  endTurn(c);
  return evaluate(c);
}

export function signature(s: State): string {
  const u = s.units.map((x) => `${x.id}:${x.hp}:${x.block}:${x.ap}`).join(",");
  const g = (["P", "E"] as const)
    .map((side) =>
      s.ground[side]
        .map((x) => `${x.fire}${x.blaze ? "b" : ""}${x.oil ? "o" : ""}${x.poison}${x.ward}`)
        .join("."),
    )
    .join("|");
  const hands = Object.entries(s.piles)
    .map(([k, p]) => `${k}:${[...p.hand].sort((a, b) => a.localeCompare(b)).join(".")}`)
    .join(";");
  return `${s.slots.P.join(".")}|${s.slots.E.join(".")}|${u}|${g}|${s.energy}|${hands}`;
}

// ---------------- random --------------------------------------------------------------

export const randomBot: Bot = (s) => {
  const c = clone(s),
    out: Action[] = [];
  for (let i = 0; i < 30; i++) {
    const acts = legalActions(c);
    const end = acts[acts.length - 1];
    const pick =
      acts.length === 1 || nextRandom(c) < 0.12
        ? end
        : acts[Math.floor(nextRandom(c) * (acts.length - 1))];
    if (pick.kind === "end") break;
    apply(c, pick);
    out.push(pick);
    if (c.over) break;
  }
  out.push({ kind: "end" });
  return out;
};

// ---------------- greedy: best single action by the immediate score -------------------

export const greedyBot: Bot = (s) => {
  const c = clone(s),
    out: Action[] = [];
  for (let i = 0; i < 30 && !c.over; i++) {
    const base = evaluate(c);
    let best: Action | null = null,
      bestV = base + 0.01;
    for (const a of legalActions(c)) {
      if (a.kind === "end") continue;
      const d = clone(c);
      apply(d, a);
      const v = evaluate(d);
      if (v > bestV) {
        bestV = v;
        best = a;
      }
    }
    if (!best) break;
    apply(c, best);
    out.push(best);
  }
  out.push({ kind: "end" });
  return out;
};

// ---------------- strong: beam search over the turn --------------------------------

export interface SearchResult {
  seq: Action[];
  score: number;
  outcomes: { sig: string; coarse: string; score: number }[]; // every distinct end-of-turn line it scored
}

export function search(s: State, width = 8, depth = 10): SearchResult {
  const outcomes: { sig: string; coarse: string; score: number }[] = [];
  const seenEnd = new Set<string>();
  const record = (st: State, score: number) => {
    const c = clone(st);
    if (!c.over) endTurn(c);
    const sig = outcomeSig(c);
    if (!seenEnd.has(sig)) {
      seenEnd.add(sig);
      outcomes.push({ sig, coarse: coarseSig(c), score });
    }
  };
  let best = { seq: [] as Action[], score: afterEnemyPhase(s) };
  record(s, best.score);
  let beam = [{ st: s, seq: [] as Action[] }];
  const seen = new Set<string>([signature(s)]);
  for (let d = 0; d < depth; d++) {
    const kids: { st: State; seq: Action[]; score: number }[] = [];
    for (const node of beam) {
      if (node.st.over) continue;
      for (const a of legalActions(node.st)) {
        if (a.kind === "end") continue;
        const c = clone(node.st);
        apply(c, a);
        const sig = signature(c);
        if (seen.has(sig)) continue;
        seen.add(sig);
        const score = afterEnemyPhase(c);
        record(c, score);
        const kid = { st: c, seq: [...node.seq, a], score };
        kids.push(kid);
        if (score > best.score) best = kid;
      }
    }
    if (!kids.length) break;
    kids.sort((a, b) => b.score - a.score);
    beam = kids.slice(0, width);
  }
  return { seq: [...best.seq, { kind: "end" }], score: best.score, outcomes };
}

// What a turn changed, ignoring the order it was done in: positions, HP and ground after
// the enemy phase.
export function outcomeSig(s: State): string {
  const u = s.units.map((x) => `${x.id}:${x.hp}`).join(",");
  const g = (["P", "E"] as const)
    .map((side) =>
      s.ground[side].map((x) => `${x.fire}${x.oil ? "o" : ""}${x.poison}${x.ward}`).join("."),
    )
    .join("|");
  return `${s.over ?? ""}|${s.slots.P.join(".")}|${s.slots.E.join(".")}|${u}|${g}`;
}

// The same, with HP rounded to steps of 3 and ground reduced to which effects are present:
// two lines that differ by a point of damage count as the same outcome.
export function coarseSig(s: State): string {
  const u = s.units.map((x) => `${x.id}:${Math.ceil(x.hp / 3)}`).join(",");
  const g = (["P", "E"] as const)
    .map((side) =>
      s.ground[side]
        .map(
          (x) =>
            `${x.fire ? "f" : ""}${x.oil ? "o" : ""}${x.poison ? "p" : ""}${x.ward ? "w" : ""}`,
        )
        .join("."),
    )
    .join("|");
  return `${s.over ?? ""}|${s.slots.P.join(".")}|${s.slots.E.join(".")}|${u}|${g}`;
}

// What kind of move an action is, for the usage and repetition metrics.
// Who acts: the unit kind behind a card or ability ("hero", "beetle", "servant", "totem").
export function actor(s: State, a: Action): string | null {
  if (a.kind === "end") return null;
  return unitById(s, a.unit)?.kind ?? null;
}

export function categories(s: State, a: Action): string[] {
  if (a.kind === "move") return ["move"];
  if (a.kind === "end") return [];
  const ab = abilityFor(s, a);
  if (!ab) return [];
  const out = new Set<string>();
  for (const e of ab.effects) {
    if (e.op === "damage") out.add("attack");
    if (e.op === "push" || e.op === "pull") out.add("push/pull");
    if (e.op === "fire" || e.op === "oil" || e.op === "poison") out.add("hazard");
    if (e.op === "ward" || e.op === "block" || e.op === "heal") out.add("defend");
    if (e.op === "summon") out.add("summon");
  }
  if (out.has("push/pull") || out.has("hazard")) out.delete("attack"); // the attack is the side dish
  return [...out];
}

export const strongBot: Bot = (s) => search(s).seq;

// ---------------- simple fixed policies -------------------------------------------------

function abilityFor(s: State, a: Action): Ability | undefined {
  if (a.kind === "card") return cardAbility(s.piles[a.pile].hand[a.card]);
  if (a.kind === "ability") {
    const u = unitById(s, a.unit);
    return u ? abilityOf(u, a.ability) : undefined;
  }
  return undefined;
}
const damageOf = (ab: Ability | undefined) =>
  ab?.effects.reduce((x, e) => x + (e.op === "damage" ? e.amount : 0), 0) ?? 0;

function runPolicy(s: State, pick: (c: State, acts: Action[]) => Action | null): Action[] {
  const c = clone(s),
    out: Action[] = [];
  for (let i = 0; i < 30 && !c.over; i++) {
    const a = pick(c, legalActions(c));
    if (!a || a.kind === "end") break;
    apply(c, a);
    out.push(a);
  }
  out.push({ kind: "end" });
  return out;
}

// Always hit the nearest enemy (lowest occupied slot) as hard as possible. Never moves.
export const nearestBot: Bot = (s) =>
  runPolicy(s, (c, acts) => {
    const near = c.slots.E.findIndex((x) => x != null);
    let best: Action | null = null,
      bestD = 0;
    for (const a of acts) {
      if (a.kind !== "card" && a.kind !== "ability") continue;
      const ab = abilityFor(c, a);
      const d = damageOf(ab) + (a.target === near ? 100 : 0);
      if (damageOf(ab) > 0 && (ab?.target === "foe" || ab?.target === "foeSlot") && d > bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  });

// Always pull the hero to the back slot first, then deal whatever damage reaches.
export const retreatBot: Bot = (s) =>
  runPolicy(s, (c, acts) => {
    const h = hero(c);
    if (h && slotOf(c, h) < SLOTS - 1) {
      const mv = acts.find((a) => a.kind === "move" && a.unit === h.id && a.to > slotOf(c, h));
      if (mv) return mv;
    }
    let best: Action | null = null,
      bestD = 0;
    for (const a of acts) {
      const d = damageOf(abilityFor(c, a));
      if (d > bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  });

// Spam the same thing: play the highest-damage card every time, every unit uses its first
// usable ability on the first target. No moves, no thinking about ground or intents.
export const stackBot: Bot = (s) =>
  runPolicy(s, (c, acts) => {
    let best: Action | null = null,
      bestD = -1;
    for (const a of acts) {
      if (a.kind === "move" || a.kind === "end") continue;
      const d = damageOf(abilityFor(c, a)) * 10 - (a.kind === "card" ? 0 : 1);
      if (d > bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  });

export const BOTS: Record<string, Bot> = {
  random: randomBot,
  greedy: greedyBot,
  strong: strongBot,
  nearest: nearestBot,
  retreat: retreatBot,
  stack: stackBot,
};

// Play one whole fight with a bot. onTurn sees the state at the start of each turn.
export function playFight(s: State, bot: Bot, onTurn?: (s: State, seq: Action[]) => void): State {
  while (!s.over) {
    const seq = bot(s);
    onTurn?.(s, seq);
    for (const a of seq) {
      if (!apply(s, a)) throw new Error(`bot played an illegal action ${JSON.stringify(a)}`);
      if (s.over || a.kind === "end") break;
    }
  }
  return s;
}
