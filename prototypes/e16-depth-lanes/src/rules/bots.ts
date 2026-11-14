// Bots for e16: random, greedy, strong (beam search over a whole turn) and fixed policies
// used to look for dominant patterns. They only see what a player sees: the field, the
// intents, their hand and waves due next round. They never see the deck order.
import {
  type Action,
  type CardId,
  type State,
  CARDS,
  MAX_ROUNDS,
  UNIT_HP,
  apply,
  canPlay,
  cardTargets,
  clone,
  endTurn,
  firstEnemy,
  hero,
  isRed,
  legalActions,
  outcomeKey,
  stateHash,
  threats,
  unitAt,
  wolf,
} from "./combat.ts";
import { step as rngStep } from "./rng.ts";

// ---------------- scoring ---------------------------------------------------------

export function evaluate(s: State): number {
  if (s.over === "loss") return -1000 + s.round;
  const h = hero(s);
  const w = wolf(s);
  let score = 0;
  let enemyHp = 0;
  let enemyN = 0;
  let near = 0;
  for (const u of s.units) {
    if (u.side === "E") {
      enemyHp += u.hp;
      enemyN++;
      near += Math.max(0, 4 - u.row);
    } else if (u.kind === "servant" || u.kind === "totem") score += 0.4 * u.hp + 2;
  }
  for (const wv of s.waves) for (const sp of wv.spawns) enemyHp += UNIT_HP[sp.kind] + s.hpBonus;
  score -= 1.5 * enemyHp + 4 * enemyN + 0.6 * near;
  if (h) score += 3 * h.hp;
  if (w) score += 12 + 1.0 * w.hp;
  if (s.over === "win") score += 300 - 3 * s.round;
  else {
    // incoming next turn (the intents just announced)
    for (const t of threats(s)) {
      const v = unitAt(s, t.cell.lane, t.cell.row);
      if (!v || v.side !== "P") continue;
      if (v.kind === "hero") score -= 1.6 * t.dmg;
      else if (v.kind === "wolf") score -= 0.7 * t.dmg;
      else score -= 0.2 * t.dmg;
    }
    score -= 3 * s.round;
    // the far-off round limit
    if (s.round > MAX_ROUNDS - 4) score -= 5 * enemyHp;
  }
  return score;
}

// Score of a mid-turn state if the player ended the turn now.
export function evalEnd(s: State, keys?: Map<string, number>): number {
  const t = clone(s);
  endTurn(t);
  const v = evaluate(t);
  if (keys) {
    const k = outcomeKey(t);
    const old = keys.get(k);
    if (old === undefined || v > old) keys.set(k, v);
  }
  return v;
}

// Mid-turn key for de-duplicating beam nodes.
function midKey(s: State): string {
  return (
    outcomeKey(s) +
    `|${s.energy}|${s.hand.slice().sort().join("")}|${s.wolfStepped}${s.wolfActed}|${s.summonActed.join(",")}` +
    `|${s.units.map((u) => (u.frozen ? "f" : "") + u.guard).join("")}|${s.ground.map((g) => (g.ward ? 1 : 0)).join("")}`
  );
}

// Bots skip ground plays far from any enemy (they are legal, just never useful).
function useful(s: State, a: Action): boolean {
  if (a.t !== "card" || !a.cell) return true;
  const c = s.hand[a.idx];
  if (c !== "oil" && c !== "frost" && c !== "miasma") return true;
  const { lane, row } = a.cell;
  return s.units.some(
    (u) =>
      u.side === "E" &&
      Math.abs(u.lane - lane) <= (c === "miasma" ? 1 : 0) &&
      u.row - row >= -1 &&
      u.row - row <= 2,
  );
}

export type Filter = (s: State, a: Action) => boolean;

export interface SearchResult {
  line: Action[];
  score: number;
  outcomes: Map<string, number>; // distinct end-of-round outcomes seen, best score each
  passScore: number;
}

export function search(s: State, width = 6, depth = 8, filter?: Filter): SearchResult {
  const outcomes = new Map<string, number>();
  const passScore = evalEnd(s, outcomes);
  let best = { line: [] as Action[], score: passScore };
  let beam = [{ st: s, line: [] as Action[], score: passScore }];
  for (let d = 0; d < depth && beam.length; d++) {
    const cand: typeof beam = [];
    const seen = new Set<string>();
    for (const node of beam) {
      for (const a of legalActions(node.st)) {
        if (a.t === "end" || !useful(node.st, a) || (filter && !filter(node.st, a))) continue;
        const st = clone(node.st);
        apply(st, a, false);
        const k = midKey(st);
        if (seen.has(k)) continue;
        seen.add(k);
        const score = st.over === "win" ? evaluate(st) : evalEnd(st, outcomes);
        if (st.over === "win") outcomes.set(outcomeKey(st), score);
        cand.push({ st, line: [...node.line, a], score });
      }
    }
    cand.sort((x, y) => y.score - x.score);
    beam = cand.slice(0, width).filter((n) => !n.st.over);
    if (cand.length && cand[0].score > best.score)
      best = { line: cand[0].line, score: cand[0].score };
  }
  return { ...best, outcomes, passScore };
}

// ---------------- bots ------------------------------------------------------------

export type Bot = (s: State) => Action[];

// The random bot has its own random numbers, so it never changes the fight's deck order.
let botRng = 1;
export function seedRandomBot(seed: number): void {
  botRng = seed >>> 0 || 1;
}
function rand(): number {
  const [v, n] = rngStep(botRng);
  botRng = n;
  return v;
}

export const randomBot: Bot = (s0) => {
  const s = clone(s0);
  const line: Action[] = [];
  for (let i = 0; i < 12; i++) {
    const acts = legalActions(s).filter((a) => a.t !== "end");
    if (!acts.length || rand() < 0.2) break;
    const a = acts[Math.floor(rand() * acts.length)];
    apply(s, a, false);
    line.push(a);
    if (s.over) break;
  }
  return line;
};

export const greedyBot: Bot = (s0) => {
  const s = clone(s0);
  const line: Action[] = [];
  for (let i = 0; i < 12; i++) {
    let best: Action | null = null;
    let bestScore = evalEnd(s);
    for (const a of legalActions(s)) {
      if (a.t === "end" || !useful(s, a)) continue;
      const t = clone(s);
      apply(t, a, false);
      const v = t.over === "win" ? evaluate(t) : evalEnd(t);
      if (v > bestScore + 1e-9) {
        bestScore = v;
        best = a;
      }
    }
    if (!best) break;
    apply(s, best, false);
    line.push(best);
    if (s.over) break;
  }
  return line;
};

export const strongBot: Bot = (s) => search(s).line;

export function filteredStrong(filter: Filter): Bot {
  return (s) => search(s, 6, 8, filter).line;
}

// Hero never leaves the middle lane.
export const middleBot = filteredStrong(
  (s, a) => !(a.t === "step" && a.id === hero(s)?.id && hero(s)!.lane + a.dir !== 1),
);
// Hero walks to the left lane and stays there.
export const edgeBot = filteredStrong(
  (s, a) => !(a.t === "step" && a.id === hero(s)?.id && a.dir !== -1),
);
// Only damage cards.
export const damageBot = filteredStrong(
  (s, a) => a.t !== "card" || CARDS[s.hand[a.idx]].kind === "damage",
);

// Scripted: always put a Bone Servant right in front of the hero first, then hit the
// nearest enemy like the nearest bot.
export const blockFrontBot: Bot = (s0) => {
  const s = clone(s0);
  const line: Action[] = [];
  const h = hero(s)!;
  const idx = s.hand.indexOf("servant");
  if (idx >= 0 && canPlay(s, idx)) {
    const cells = cardTargets(s, "servant").filter((c) => c.lane === h.lane);
    if (cells.length) {
      const a: Action = { t: "card", idx, cell: cells[0] };
      apply(s, a, false);
      line.push(a);
    }
  }
  if (s.over) return line;
  return [...line, ...nearestBot(s)];
};

const DMG_ORDER: CardId[] = ["strike", "thrust", "firebolt"];

// Scripted: hit the nearest enemy as hard as possible from where you stand (step toward it
// if nothing is in reach), bite and bash. With `dodge`, finish by stepping out of a red cell.
function scripted(dodge: boolean): Bot {
  return (s0) => {
    const s = clone(s0);
    const line: Action[] = [];
    const doIt = (a: Action) => {
      apply(s, a, false);
      line.push(a);
    };
    for (let guard = 0; guard < 10 && !s.over; guard++) {
      const h = hero(s);
      if (!h) break;
      let acted = false;
      for (const c of DMG_ORDER) {
        const idx = s.hand.indexOf(c);
        if (idx < 0 || !canPlay(s, idx)) continue;
        if (dodge && s.energy <= 1 && isRed(s, h.lane, 0)) break; // keep 1 energy to dodge
        const cells = cardTargets(s, c);
        if (!cells.length) continue;
        cells.sort((a, b) => a.row - b.row);
        doIt({ t: "card", idx, cell: cells[0] });
        acted = true;
        break;
      }
      if (acted) continue;
      if (!firstEnemy(s, h.lane) && s.energy >= 2 && s.opts.sideways) {
        // step toward the nearest enemy's lane
        const es = s.units.filter((u) => u.side === "E").sort((a, b) => a.row - b.row);
        if (es.length) {
          const dir = es[0].lane > h.lane ? 1 : -1;
          const st = legalActions(s).find((a) => a.t === "step" && a.id === h.id && a.dir === dir);
          if (st) {
            doIt(st);
            continue;
          }
        }
      }
      break;
    }
    const acts = legalActions(s);
    const bite = acts.find((a) => a.t === "ability" && a.ab === "bite");
    if (bite) doIt(bite);
    for (const a of legalActions(s)) if (a.t === "ability" && a.ab === "bash") doIt(a);
    const h = hero(s);
    if (dodge && h && isRed(s, h.lane, 0) && !s.over) {
      const step = legalActions(s).find(
        (a) => a.t === "step" && a.id === h.id && !isRed(s, h.lane + a.dir, 0),
      );
      if (step) doIt(step);
    }
    return line;
  };
}
export const nearestBot = scripted(false);
export const hitDodgeBot = scripted(true);

export const BOTS: Record<string, Bot> = {
  random: randomBot,
  greedy: greedyBot,
  strong: strongBot,
  middle: middleBot,
  edge: edgeBot,
  blockFront: blockFrontBot,
  hitDodge: hitDodgeBot,
  damage: damageBot,
  nearest: nearestBot,
};

// ---------------- play a fight ----------------------------------------------------

export interface TurnInfo {
  before: State;
  line: Action[];
  predicted: string; // state hash the preview promised after the enemy phase
  actual: string;
}

// Play until the fight ends. The bot's line is applied for real, then the turn ends.
// `predicted` is the end-of-round preview (rules on a copy), `actual` what happened.
export function playFight(s: State, bot: Bot, onTurn?: (t: TurnInfo) => void): State {
  while (!s.over) {
    const before = clone(s);
    const line = bot(s);
    for (const a of line) {
      if (s.over) break;
      if (!apply(s, a)) throw new Error(`bot played an illegal action ${JSON.stringify(a)}`);
    }
    let predicted = "";
    if (!s.over) {
      const p = clone(s);
      endTurn(p);
      predicted = stateHash(p);
      endTurn(s);
    } else predicted = stateHash(s);
    onTurn?.({ before, line, predicted, actual: stateHash(s) });
  }
  return s;
}

// Category set of a line, for "same kind as last turn" and usage counts.
export function categories(s0: State, line: Action[]): string[] {
  const s = clone(s0);
  const out = new Set<string>();
  for (const a of line) {
    if (a.t === "card") out.add(CARDS[s.hand[a.idx]].kind);
    else if (a.t === "step") out.add(a.id === hero(s)?.id ? "step" : "wolf");
    else if (a.t === "ability") out.add(a.id === wolf(s)?.id ? "wolf" : "summon");
    apply(s, a, false);
  }
  return [...out].sort();
}
