// Board combat rules for e13 ("the room becomes the board"). Pure TypeScript: no three.js,
// no DOM. The game view, the tests, the bots and the metrics script all run this code.
//
// Round contract:
//   player phase: every player unit may move once (up to its Move), then act. The hero acts
//     by playing cards (3 energy); the wolf and summons use one ability each. Moving after
//     acting is not allowed. End turn discards the hand.
//   enemy phase (id order): each enemy does its announced intent from where it stands now
//     (so pushing an enemy moves its attack with it), then walks and announces its next one.
//   round end: reinforcements arrive, fire and poison tick on whoever stands in them, poison
//     spreads and fades, effects count down. New round: block clears, cooldowns tick, draw 5.
//
// Intents hit every unit on their tiles, friend or foe. Pushes and pulls stop at obstacles
// and do collision damage; braziers topple into a line of fire.

import { step } from "./rng.ts";
import type { Theme } from "./levelgen.ts";

// ---------------- geometry -------------------------------------------------------

export interface Pos {
  x: number;
  y: number;
}
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Pos[] = [
  { x: 0, y: -1 }, // N
  { x: 1, y: 0 }, // E
  { x: 0, y: 1 }, // S
  { x: -1, y: 0 }, // W
];
export const key = (p: Pos) => `${p.x},${p.y}`;
export const add = (p: Pos, d: Pos, n = 1): Pos => ({ x: p.x + d.x * n, y: p.y + d.y * n });
export const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
/** Direction from a to b when they share a row or column, else null. */
export function dirTo(a: Pos, b: Pos): Dir | null {
  if (a.x === b.x && b.y < a.y) return 0;
  if (a.y === b.y && b.x > a.x) return 1;
  if (a.x === b.x && b.y > a.y) return 2;
  if (a.y === b.y && b.x < a.x) return 3;
  return null;
}
/** Rough facing from a toward b (bigger axis wins). */
export function faceToward(a: Pos, b: Pos): Dir {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 1 : 3;
  return dy >= 0 ? 2 : 0;
}

// ---------------- board (static per fight) ---------------------------------------

export interface Board {
  /** Level grid from levelgen, for the view. */
  grid: string[][];
  room: { x0: number; y0: number; x1: number; y1: number };
  theme: Theme | null;
  /** Walkable tiles of the fight: room floor, door tiles and a short stretch of corridor. */
  cells: string[];
  /** Static obstacles inside the board (pillars). */
  pillars: Pos[];
  doors: Pos[];
  /** Door the party came in through and the corridor tile outside it. */
  entry: Pos;
  entryOutside: Pos;
  /** Corridor ends where reinforcements appear. */
  spawns: Pos[];
}

// ---------------- data -----------------------------------------------------------

export type Side = "player" | "enemy";
export type Kind =
  | "hero"
  | "wolf"
  | "servant"
  | "totem"
  | "brute"
  | "archer"
  | "hexer"
  | "skitter"
  | "guard";
export type EnemyKind = "brute" | "archer" | "hexer" | "skitter" | "guard";
export const ENEMY_KINDS: EnemyKind[] = ["brute", "archer", "hexer", "skitter", "guard"];

export interface UnitDef {
  name: string;
  side: Side;
  hp: number;
  move: number;
  abilities: string[];
  role: string;
}
export const UNITS: Record<Kind, UnitDef> = {
  hero: { name: "Hero", side: "player", hp: 26, move: 3, abilities: [], role: "Cards" },
  wolf: {
    name: "Wolf",
    side: "player",
    hp: 16,
    move: 4,
    abilities: ["bite", "shoulder", "howl"],
    role: "Companion",
  },
  servant: {
    name: "Bone Servant",
    side: "player",
    hp: 8,
    move: 3,
    abilities: ["slam"],
    role: "Summon",
  },
  totem: {
    name: "Spirit Totem",
    side: "player",
    hp: 6,
    move: 0,
    abilities: ["lash"],
    role: "Summon",
  },
  brute: {
    name: "Ghoul Brute",
    side: "enemy",
    hp: 18,
    move: 3,
    abilities: ["cleave"],
    role: "Melee brute",
  },
  archer: {
    name: "Bone Archer",
    side: "enemy",
    hp: 10,
    move: 2,
    abilities: ["arrow"],
    role: "Ranged",
  },
  hexer: {
    name: "Rot Hexer",
    side: "enemy",
    hp: 12,
    move: 2,
    abilities: ["blight"],
    role: "Area caster",
  },
  skitter: {
    name: "Skitter",
    side: "enemy",
    hp: 8,
    move: 4,
    abilities: ["bite"],
    role: "Fast flanker",
  },
  guard: {
    name: "Shieldbearer",
    side: "enemy",
    hp: 16,
    move: 2,
    abilities: ["bash"],
    role: "Armoured guard",
  },
};

export const RULES = {
  energy: 3,
  hand: 5,
  maxSummons: 2,
  fireDamage: 3,
  blazeDamage: 5,
  fireRounds: 2,
  poisonDamage: 2,
  poisonRounds: 3,
  wardReduce: 2,
  wardRounds: 2,
  collision: 2,
  burst: 3, // poison cloud ignited by fire
  guardArmour: 3,
  skitterAlone: 3,
  maxRounds: 16,
};

export type CardId =
  | "strike"
  | "shove"
  | "hook"
  | "firebolt"
  | "oil"
  | "poison"
  | "ward"
  | "servant"
  | "totem";
export type Target = "adjacent" | "line" | "tile" | "empty";
export interface CardDef {
  name: string;
  cost: number;
  target: Target;
  range: number;
  text: string;
  /** Category for the metrics: what kind of play this is. */
  cat: Cat;
}
export type Cat = "melee" | "ranged" | "push" | "hazard" | "summon" | "defend";
export const CARDS: Record<CardId, CardDef> = {
  strike: {
    name: "Strike",
    cost: 1,
    target: "adjacent",
    range: 1,
    text: "6 damage to an adjacent unit",
    cat: "melee",
  },
  shove: {
    name: "Shove",
    cost: 1,
    target: "adjacent",
    range: 1,
    text: "2 damage, push 2. Topples a brazier",
    cat: "push",
  },
  hook: {
    name: "Hook",
    cost: 1,
    target: "line",
    range: 4,
    text: "Pull the first unit in a line (4) up to 3 tiles",
    cat: "push",
  },
  firebolt: {
    name: "Firebolt",
    cost: 2,
    target: "line",
    range: 5,
    text: "3 damage to the first unit in a line (5), sets its tile on fire",
    cat: "hazard",
  },
  oil: {
    name: "Oil Flask",
    cost: 1,
    target: "tile",
    range: 4,
    text: "Oil on a plus of 5 tiles (4). Fire on oil blazes",
    cat: "hazard",
  },
  poison: {
    name: "Poison Vial",
    cost: 1,
    target: "tile",
    range: 4,
    text: "Poison cloud 3x3 (4) for 3 rounds; spreads, then fades",
    cat: "hazard",
  },
  ward: {
    name: "Ward Circle",
    cost: 1,
    target: "tile",
    range: 2,
    text: "Ward 3x3 (2) for 2 rounds: -2 damage per hit inside",
    cat: "defend",
  },
  servant: {
    name: "Raise Servant",
    cost: 2,
    target: "empty",
    range: 2,
    text: "Summon a Bone Servant (8 HP, Slam) on an empty tile (2)",
    cat: "summon",
  },
  totem: {
    name: "Spirit Totem",
    cost: 1,
    target: "empty",
    range: 2,
    text: "Summon a Spirit Totem (6 HP, Lash) on an empty tile (2)",
    cat: "summon",
  },
};
export const DECK: CardId[] = [
  "strike",
  "strike",
  "shove",
  "shove",
  "hook",
  "firebolt",
  "firebolt",
  "oil",
  "poison",
  "ward",
  "servant",
  "totem",
];

export type AbilityId = "bite" | "shoulder" | "howl" | "slam" | "lash";
export interface AbilityDef {
  name: string;
  cooldown: number;
  target: Target | "self";
  range: number;
  text: string;
  cat: Cat;
}
export const ABILITIES: Record<AbilityId, AbilityDef> = {
  bite: {
    name: "Bite",
    cooldown: 0,
    target: "adjacent",
    range: 1,
    text: "4 damage to an adjacent unit",
    cat: "melee",
  },
  shoulder: {
    name: "Shoulder",
    cooldown: 2,
    target: "adjacent",
    range: 1,
    text: "Push an adjacent unit 2 tiles. Topples a brazier. Cooldown 2",
    cat: "push",
  },
  howl: {
    name: "Howl",
    cooldown: 3,
    target: "self",
    range: 0,
    text: "Allies within 2 gain 4 Block until your next turn. Cooldown 3",
    cat: "defend",
  },
  slam: {
    name: "Slam",
    cooldown: 0,
    target: "adjacent",
    range: 1,
    text: "3 damage and push 1",
    cat: "push",
  },
  lash: {
    name: "Lash",
    cooldown: 0,
    target: "line",
    range: 3,
    text: "2 damage to the first unit in a line (3), pull it 1 tile",
    cat: "push",
  },
};

// Enemy attacks. Tiles are always relative to where the enemy stands when it acts.
export type AttackId = "cleave" | "arrow" | "blight" | "bite" | "bash";
export const ATTACKS: Record<AttackId, { name: string; damage: number; text: string }> = {
  cleave: { name: "Cleave", damage: 6, text: "6 to the 3 tiles in front" },
  arrow: { name: "Arrow", damage: 5, text: "5 to the first unit in a line (5)" },
  blight: { name: "Blight", damage: 3, text: "3 to a 3x3 area (4) and leaves poison" },
  bite: {
    name: "Bite",
    damage: 3,
    text: "3 to the tile in front, +3 if the target has no ally next to it",
  },
  bash: { name: "Shield Bash", damage: 4, text: "4 to the tile in front and push 1" },
};
const ATTACK_OF: Record<EnemyKind, AttackId> = {
  brute: "cleave",
  archer: "arrow",
  hexer: "blight",
  skitter: "bite",
  guard: "bash",
};

// ---------------- state ----------------------------------------------------------

export interface Intent {
  attack: AttackId;
  dir: Dir;
  /** Blight only: target centre, relative to the enemy. */
  off?: Pos;
}
export interface Unit {
  id: number;
  kind: Kind;
  side: Side;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  block: number;
  moveLeft: number;
  acted: boolean;
  facing: Dir;
  cooldowns: Partial<Record<AbilityId, number>>;
  intent: Intent | null;
}
export interface Ground {
  fire?: number;
  blaze?: boolean;
  oil?: boolean;
  poison?: number;
  ward?: number;
}
export interface Reinforcement {
  round: number;
  kind: EnemyKind;
  spawn: number;
}
export interface Stats {
  cards: Partial<Record<CardId, number>>;
  abilities: Partial<Record<AbilityId, number>>;
  pushes: number;
  pulls: number;
  collisions: number;
  topples: number;
  combos: number;
  summons: number;
  /** Damage to enemies by source. */
  dmgDirect: number;
  dmgHazard: number;
  dmgCollision: number;
  dmgFriendly: number;
  dmgTaken: number;
}
export type Ev =
  | { t: "move"; id: number; path: Pos[] }
  | { t: "push"; id: number; path: Pos[]; hit: "wall" | "unit" | "brazier" | null }
  | { t: "damage"; id: number; amount: number; source: DmgSource }
  | { t: "heal"; id: number; amount: number }
  | { t: "block"; id: number; amount: number }
  | { t: "death"; id: number }
  | { t: "act"; id: number; name: string; tiles: Pos[]; dir: Dir | null }
  | { t: "card"; card: CardId; at: Pos }
  | { t: "summon"; id: number }
  | { t: "spawn"; id: number }
  | { t: "topple"; at: Pos; dir: Dir }
  | { t: "combo"; at: Pos; text: string }
  | { t: "phase"; phase: "enemy" | "player" | "round" };
export type DmgSource = "direct" | "hazard" | "collision" | "poison";

export interface State {
  board: Board;
  units: Unit[];
  ground: Record<string, Ground>;
  braziers: Pos[];
  deck: CardId[];
  hand: CardId[];
  discard: CardId[];
  energy: number;
  round: number;
  over: null | "win" | "loss";
  nextId: number;
  rand: number;
  reinforcements: Reinforcement[];
  events: Ev[];
  stats: Stats;
  /** Set while the enemy phase runs: who is acting (for friendly fire stats). */
  actor: Side;
}

export interface Setup {
  board: Board;
  enemies: { kind: EnemyKind; x: number; y: number }[];
  braziers: Pos[];
  oil?: Pos[];
  reinforcements?: Reinforcement[];
  seed: number;
}

export function newStats(): Stats {
  return {
    cards: {},
    abilities: {},
    pushes: 0,
    pulls: 0,
    collisions: 0,
    topples: 0,
    combos: 0,
    summons: 0,
    dmgDirect: 0,
    dmgHazard: 0,
    dmgCollision: 0,
    dmgFriendly: 0,
    dmgTaken: 0,
  };
}

function makeUnit(s: State, kind: Kind, p: Pos, facing: Dir = 2): Unit {
  const d = UNITS[kind];
  const u: Unit = {
    id: s.nextId++,
    kind,
    side: d.side,
    x: p.x,
    y: p.y,
    hp: d.hp,
    maxHp: d.hp,
    block: 0,
    moveLeft: d.move,
    acted: false,
    facing,
    cooldowns: {},
    intent: null,
  };
  s.units.push(u);
  return u;
}

export function newFight(setup: Setup): State {
  const b = setup.board;
  const s: State = {
    board: b,
    units: [],
    ground: {},
    braziers: setup.braziers.map((p) => ({ ...p })),
    deck: [],
    hand: [],
    discard: [],
    energy: RULES.energy,
    round: 1,
    over: null,
    nextId: 1,
    rand: setup.seed >>> 0,
    reinforcements: (setup.reinforcements ?? []).map((r) => ({ ...r })),
    events: [],
    stats: newStats(),
    actor: "player",
  };
  for (const p of setup.oil ?? []) if (walkable(s, p)) groundAt(s, p).oil = true;
  // party: hero one tile inside the entry door, wolf next to it
  const inward = dirTo(b.entryOutside, b.entry) ?? 2;
  const heroAt = add(b.entry, DIRS[inward]);
  makeUnit(s, "hero", free(s, heroAt) ? heroAt : b.entry, inward);
  const hero = s.units[0];
  const wolfAt =
    [add(hero, DIRS[(inward + 1) % 4]), add(hero, DIRS[(inward + 3) % 4]), b.entry].find((p) =>
      free(s, p),
    ) ?? nearestFree(s, hero);
  if (wolfAt) makeUnit(s, "wolf", wolfAt, inward);
  for (const e of setup.enemies) makeUnit(s, e.kind, e, faceToward(e, hero));
  // shuffle the deck and draw
  s.deck = shuffle(s, [...DECK]);
  draw(s, RULES.hand);
  // first intents are announced without moving, so the opening view is calm
  for (const e of enemies(s)) planIntent(s, e, 0);
  s.events = [];
  return s;
}

// ---------------- cloning ---------------------------------------------------------

/** Deep copy of everything that changes; the board is shared (it never changes). */
export function clone(s: State): State {
  const ground: Record<string, Ground> = {};
  for (const k in s.ground) ground[k] = { ...s.ground[k] };
  return {
    ...s,
    units: s.units.map((u) => ({
      ...u,
      cooldowns: { ...u.cooldowns },
      intent: u.intent ? { ...u.intent } : null,
    })),
    ground,
    braziers: s.braziers.map((p) => ({ ...p })),
    deck: [...s.deck],
    hand: [...s.hand],
    discard: [...s.discard],
    reinforcements: s.reinforcements.map((r) => ({ ...r })),
    events: [],
    stats: { ...s.stats, cards: { ...s.stats.cards }, abilities: { ...s.stats.abilities } },
  };
}

// ---------------- queries ---------------------------------------------------------

const cellSets = new WeakMap<Board, Set<string>>();
const pillarSets = new WeakMap<Board, Set<string>>();
function cellSet(b: Board): Set<string> {
  let c = cellSets.get(b);
  if (!c) cellSets.set(b, (c = new Set(b.cells)));
  return c;
}
function pillarSet(b: Board): Set<string> {
  let c = pillarSets.get(b);
  if (!c) pillarSets.set(b, (c = new Set(b.pillars.map(key))));
  return c;
}
/** A board tile a unit could stand on, ignoring units and braziers. */
export function walkable(s: State, p: Pos): boolean {
  const k = key(p);
  return cellSet(s.board).has(k) && !pillarSet(s.board).has(k);
}
export const unitAt = (s: State, p: Pos) => s.units.find((u) => u.x === p.x && u.y === p.y);
export const brazierAt = (s: State, p: Pos) => s.braziers.findIndex((b) => same(b, p));
export const free = (s: State, p: Pos) => walkable(s, p) && !unitAt(s, p) && brazierAt(s, p) < 0;
export const enemies = (s: State) => s.units.filter((u) => u.side === "enemy");
export const party = (s: State) => s.units.filter((u) => u.side === "player");
export const hero = (s: State) => s.units.find((u) => u.kind === "hero");
export const summons = (s: State) =>
  s.units.filter((u) => u.kind === "servant" || u.kind === "totem");
export const groundAt = (s: State, p: Pos): Ground => (s.ground[key(p)] ??= {});
export const peekGround = (s: State, p: Pos): Ground | undefined => s.ground[key(p)];

function nearestFree(s: State, from: Pos): Pos | null {
  let best: Pos | null = null;
  for (const k of s.board.cells) {
    const [x, y] = k.split(",").map(Number);
    const p = { x, y };
    if (!free(s, p)) continue;
    if (!best || manhattan(p, from) < manhattan(best, from)) best = p;
  }
  return best;
}

/** Tiles along a line from `from` (exclusive) up to `range`, stopping at the first unit,
 * brazier or obstacle. `stop` is what ended it (the unit or brazier tile is included). */
export function ray(s: State, from: Pos, dir: Dir, range: number) {
  const tiles: Pos[] = [];
  let p = from;
  for (let i = 0; i < range; i++) {
    p = add(p, DIRS[dir]);
    if (!walkable(s, p)) return { tiles, stop: "wall" as const, at: p };
    tiles.push(p);
    if (unitAt(s, p)) return { tiles, stop: "unit" as const, at: p };
    if (brazierAt(s, p) >= 0) return { tiles, stop: "brazier" as const, at: p };
  }
  return { tiles, stop: null, at: p };
}

/** Reachable tiles for a unit this turn, with the path to each. Prefers paths that avoid
 * fire and poison when two paths are equally short. */
export function reachable(s: State, u: Unit, limit = u.moveLeft): Map<string, Pos[]> {
  const out = new Map<string, Pos[]>();
  const best = new Map<string, number>();
  type N = { p: Pos; steps: number; cost: number; path: Pos[] };
  const q: N[] = [{ p: { x: u.x, y: u.y }, steps: 0, cost: 0, path: [] }];
  best.set(key(u), 0);
  while (q.length) {
    q.sort((a, b) => a.cost - b.cost);
    const n = q.shift()!;
    if (n.steps > 0 && !out.has(key(n.p))) out.set(key(n.p), n.path);
    if (n.steps >= limit) continue;
    for (const d of DIRS) {
      const p = add(n.p, d);
      if (!free(s, p)) continue;
      const g = peekGround(s, p);
      const cost = n.cost + 10 + (g?.fire ? 6 : 0) + (g?.poison ? 3 : 0);
      const k = key(p);
      if ((best.get(k) ?? Infinity) <= cost) continue;
      best.set(k, cost);
      q.push({ p, steps: n.steps + 1, cost, path: [...n.path, p] });
    }
  }
  return out;
}

/** Walking distance ignoring units (for enemy approach). */
function distanceField(s: State, targets: Pos[]): Map<string, number> {
  const d = new Map<string, number>();
  const q: Pos[] = [];
  for (const t of targets) {
    d.set(key(t), 0);
    q.push(t);
  }
  while (q.length) {
    const p = q.shift()!;
    const dp = d.get(key(p))!;
    for (const dd of DIRS) {
      const n = add(p, dd);
      if (!walkable(s, n) || brazierAt(s, n) >= 0 || d.has(key(n))) continue;
      d.set(key(n), dp + 1);
      q.push(n);
    }
  }
  return d;
}

// ---------------- damage, hazards, forced movement --------------------------------

function damage(s: State, u: Unit, amount: number, source: DmgSource, from?: Pos): number {
  if (s.over || !s.units.includes(u)) return 0;
  let a = amount;
  const g = peekGround(s, u);
  if (g?.ward && source !== "poison") a -= RULES.wardReduce;
  if (u.kind === "guard" && source === "direct" && from) {
    const f = DIRS[u.facing];
    if ((from.x - u.x) * f.x + (from.y - u.y) * f.y > 0) a -= RULES.guardArmour;
  }
  a = Math.max(0, a);
  if (source !== "poison" && u.block > 0) {
    const b = Math.min(u.block, a);
    u.block -= b;
    a -= b;
  }
  if (a <= 0) return 0;
  u.hp -= a;
  s.events.push({ t: "damage", id: u.id, amount: a, source });
  const st = s.stats;
  if (u.side === "enemy") {
    if (s.actor === "enemy" && source === "direct") st.dmgFriendly += a;
    else if (source === "direct") st.dmgDirect += a;
    else if (source === "collision") st.dmgCollision += a;
    else st.dmgHazard += a;
  } else st.dmgTaken += a;
  if (u.hp <= 0) kill(s, u);
  return a;
}

function kill(s: State, u: Unit) {
  s.units = s.units.filter((x) => x !== u);
  s.events.push({ t: "death", id: u.id });
  if (u.kind === "hero") s.over = "loss";
  else if (!enemies(s).length) s.over = "win";
}

function fireDamage(g: Ground | undefined) {
  return g?.blaze ? RULES.blazeDamage : RULES.fireDamage;
}

/** A unit steps onto or is pushed onto a tile: fire hurts right away. */
function enterTile(s: State, u: Unit) {
  const g = peekGround(s, u);
  if (g?.fire) damage(s, u, fireDamage(g), "hazard");
}

/** Set a tile on fire. Oil turns into a blaze through every connected oil tile;
 * a poison cloud bursts. Units on newly burning tiles take fire damage. */
export function ignite(s: State, at: Pos) {
  if (!walkable(s, at)) return;
  const g = groundAt(s, at);
  const lit: Pos[] = [];
  if (g.oil) {
    // flood through connected oil
    const seen = new Set([key(at)]);
    const q = [at];
    while (q.length) {
      const p = q.shift()!;
      lit.push(p);
      for (const d of DIRS) {
        const n = add(p, d);
        if (seen.has(key(n)) || !peekGround(s, n)?.oil) continue;
        seen.add(key(n));
        q.push(n);
      }
    }
    for (const p of lit) {
      const gg = groundAt(s, p);
      gg.oil = false;
      gg.blaze = true;
      gg.fire = RULES.fireRounds + 1;
    }
    s.stats.combos++;
    s.events.push({ t: "combo", at, text: `Oil blaze x${lit.length}` });
  } else {
    lit.push(at);
    g.fire = Math.max(g.fire ?? 0, RULES.fireRounds);
  }
  for (const p of lit) {
    const gg = groundAt(s, p);
    if (gg.poison) {
      gg.poison = 0;
      const u = unitAt(s, p);
      if (u) damage(s, u, RULES.burst, "hazard");
      s.stats.combos++;
      s.events.push({ t: "combo", at: p, text: "Poison burst" });
    }
    const u = unitAt(s, p);
    if (u) damage(s, u, fireDamage(gg), "hazard");
  }
}

function topple(s: State, i: number, dir: Dir) {
  const b = s.braziers[i];
  s.braziers.splice(i, 1);
  s.stats.topples++;
  s.events.push({ t: "topple", at: b, dir });
  ignite(s, b);
  let p = b;
  for (let k = 0; k < 2; k++) {
    p = add(p, DIRS[dir]);
    if (!walkable(s, p)) break;
    ignite(s, p);
  }
}

/** Push (or pull, with the direction toward the puller) a unit up to n tiles.
 * Hitting a wall or pillar: 2 damage. Hitting a unit: 2 damage to both. Hitting a brazier:
 * 2 damage and the brazier topples on. Ending on oil slides one more tile per oil tile. */
export function shove(s: State, u: Unit, dir: Dir, n: number, kind: "push" | "pull") {
  if (kind === "push") s.stats.pushes++;
  else s.stats.pulls++;
  const path: Pos[] = [];
  let hit: "wall" | "unit" | "brazier" | null = null;
  let left = n,
    slides = 0;
  while (left > 0) {
    const nxt = add(u, DIRS[dir]);
    if (!walkable(s, nxt)) hit = "wall";
    else if (unitAt(s, nxt)) hit = "unit";
    else if (brazierAt(s, nxt) >= 0) hit = "brazier";
    if (hit) break;
    u.x = nxt.x;
    u.y = nxt.y;
    path.push(nxt);
    left--;
    if (left === 0 && peekGround(s, u)?.oil && slides < 3) {
      left++;
      slides++;
    }
  }
  s.events.push({ t: "push", id: u.id, path, hit });
  for (let i = 0; i < path.length && s.units.includes(u); i++) {
    const g = peekGround(s, path[i]);
    if (g?.fire) damage(s, u, fireDamage(g), "hazard");
  }
  if (!hit || !s.units.includes(u)) return;
  s.stats.collisions++;
  const nxt = add(u, DIRS[dir]);
  if (hit === "unit") {
    const other = unitAt(s, nxt)!;
    damage(s, u, RULES.collision, "collision");
    damage(s, other, RULES.collision, "collision");
  } else if (hit === "brazier") {
    damage(s, u, RULES.collision, "collision");
    const i = brazierAt(s, nxt);
    if (i >= 0) topple(s, i, dir);
  } else damage(s, u, RULES.collision, "collision");
}

// ---------------- player actions --------------------------------------------------

export type Action =
  | { type: "move"; unit: number; to: Pos }
  | { type: "card"; index: number; at: Pos }
  | { type: "ability"; unit: number; ability: AbilityId; at: Pos }
  | { type: "end" };
export type Result = { ok: true } | { ok: false; reason: string };

/** Tiles a card or ability can be aimed at by unit u. For line effects the target is
 * the first tile in that direction (any tile in the line works when playing). */
export function targets(s: State, u: Unit, t: Target | "self", range: number): Pos[] {
  const out: Pos[] = [];
  if (t === "self") return [{ x: u.x, y: u.y }];
  if (t === "adjacent") {
    for (const d of DIRS) {
      const p = add(u, d);
      if (unitAt(s, p) || brazierAt(s, p) >= 0) out.push(p);
    }
    return out;
  }
  if (t === "line") {
    for (let d = 0; d < 4; d++) {
      const p = add(u, DIRS[d]);
      if (walkable(s, p)) out.push(p);
    }
    return out;
  }
  for (const k of s.board.cells) {
    const [x, y] = k.split(",").map(Number);
    const p = { x, y };
    if (manhattan(p, u) > range || (t === "empty" && !free(s, p))) continue;
    if (t === "tile" && !walkable(s, p)) continue;
    out.push(p);
  }
  return out;
}

function lineDir(u: Unit, at: Pos, range: number): Dir | null {
  const d = dirTo(u, at);
  return d !== null && manhattan(u, at) <= range ? d : null;
}

function area(s: State, c: Pos, shape: "plus" | "square"): Pos[] {
  const out: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (shape === "plus" && dx && dy) continue;
      const p = { x: c.x + dx, y: c.y + dy };
      if (walkable(s, p)) out.push(p);
    }
  return out;
}

/** Hero card effects and unit abilities share one implementation. */
function effect(s: State, u: Unit, id: CardId | AbilityId, at: Pos): Result {
  const hitAdj = (dmg: number, push: number) => {
    const t = unitAt(s, at);
    const bi = brazierAt(s, at);
    const d = dirTo(u, at)!;
    u.facing = d;
    s.events.push({ t: "act", id: u.id, name: nameOf(id), tiles: [at], dir: d });
    if (t) {
      if (dmg) damage(s, t, dmg, "direct", u);
      if (push && s.units.includes(t)) shove(s, t, d, push, "push");
    } else if (bi >= 0 && push) topple(s, bi, d);
  };
  switch (id) {
    case "strike":
      hitAdj(6, 0);
      return { ok: true };
    case "bite": {
      hitAdj(4, 0);
      return { ok: true };
    }
    case "shove":
      hitAdj(2, 2);
      return { ok: true };
    case "shoulder":
      hitAdj(0, 2);
      return { ok: true };
    case "slam":
      hitAdj(3, 1);
      return { ok: true };
    case "hook":
    case "lash":
    case "firebolt": {
      const range = id === "hook" ? 4 : id === "lash" ? 3 : 5;
      const d = lineDir(u, at, range);
      if (d === null) return { ok: false, reason: "aim in a straight line" };
      u.facing = d;
      const r = ray(s, u, d, range);
      s.events.push({ t: "act", id: u.id, name: nameOf(id), tiles: r.tiles, dir: d });
      const t = r.stop === "unit" ? unitAt(s, r.at) : undefined;
      if (id === "firebolt") {
        if (t) damage(s, t, 3, "direct", u);
        const land = r.stop === "wall" ? r.tiles[r.tiles.length - 1] : r.at;
        if (r.stop === "brazier") topple(s, brazierAt(s, r.at), d);
        else if (land) ignite(s, land);
      } else if (t) {
        if (id === "lash") damage(s, t, 2, "direct", u);
        const pullDir = ((d + 2) % 4) as Dir;
        const dist = manhattan(u, t) - 1;
        if (s.units.includes(t) && dist > 0)
          shove(s, t, pullDir, Math.min(id === "hook" ? 3 : 1, dist), "pull");
      }
      return { ok: true };
    }
    case "oil":
    case "poison":
    case "ward": {
      const tiles = area(s, at, id === "oil" ? "plus" : "square");
      s.events.push({ t: "act", id: u.id, name: nameOf(id), tiles, dir: null });
      for (const p of tiles) {
        const g = groundAt(s, p);
        if (id === "oil") {
          if (g.fire) ignite(s, p);
          else g.oil = true;
        } else if (id === "poison") {
          if (g.fire) {
            // thrown into flames: it burns away with a burst
            const t = unitAt(s, p);
            if (t) damage(s, t, RULES.burst, "hazard");
            s.stats.combos++;
          } else g.poison = RULES.poisonRounds;
        } else g.ward = RULES.wardRounds;
      }
      return { ok: true };
    }
    case "servant":
    case "totem": {
      const m = makeUnit(s, id, at, u.facing);
      m.moveLeft = 0;
      m.acted = true;
      s.stats.summons++;
      s.events.push({ t: "summon", id: m.id });
      return { ok: true };
    }
    case "howl": {
      const tiles: Pos[] = [];
      for (const a of party(s))
        if (manhattan(a, u) <= 2) {
          a.block += 4;
          tiles.push({ x: a.x, y: a.y });
          s.events.push({ t: "block", id: a.id, amount: 4 });
        }
      s.events.push({ t: "act", id: u.id, name: "Howl", tiles, dir: null });
      return { ok: true };
    }
  }
}

export function nameOf(id: CardId | AbilityId): string {
  return (CARDS as Record<string, CardDef>)[id]?.name ?? ABILITIES[id as AbilityId].name;
}

function validTarget(s: State, u: Unit, t: Target | "self", range: number, at: Pos): string | null {
  if (t === "self") return null;
  if (t === "adjacent")
    return manhattan(u, at) === 1 && (unitAt(s, at) || brazierAt(s, at) >= 0)
      ? null
      : "needs an adjacent unit or brazier";
  if (t === "line") return lineDir(u, at, range) !== null ? null : "aim in a straight line";
  if (manhattan(u, at) > range) return "out of range";
  if (t === "empty" && !free(s, at)) return "needs an empty tile";
  if (!walkable(s, at)) return "not a floor tile";
  return null;
}

export function act(s: State, a: Action): Result {
  if (s.over) return { ok: false, reason: "fight is over" };
  s.actor = "player";
  if (a.type === "end") {
    endTurn(s);
    return { ok: true };
  }
  if (a.type === "move") {
    const u = s.units.find((x) => x.id === a.unit);
    if (!u || u.side !== "player") return { ok: false, reason: "not your unit" };
    if (u.moveLeft <= 0) return { ok: false, reason: "already moved" };
    const path = reachable(s, u).get(key(a.to));
    if (!path) return { ok: false, reason: "can't reach" };
    u.moveLeft = 0;
    s.events.push({ t: "move", id: u.id, path });
    for (const p of path) {
      if (!s.units.includes(u)) break;
      u.facing = dirTo(u, p) ?? u.facing;
      u.x = p.x;
      u.y = p.y;
      enterTile(s, u);
    }
    return { ok: true };
  }
  if (a.type === "card") {
    const h = hero(s);
    const id = s.hand[a.index];
    if (!h || !id) return { ok: false, reason: "no such card" };
    const c = CARDS[id];
    if (c.cost > s.energy) return { ok: false, reason: "not enough energy" };
    if ((id === "servant" || id === "totem") && summons(s).length >= RULES.maxSummons)
      return { ok: false, reason: "two summons already" };
    const bad = validTarget(s, h, c.target, c.range, a.at);
    if (bad) return { ok: false, reason: bad };
    s.energy -= c.cost;
    s.hand.splice(a.index, 1);
    s.discard.push(id);
    h.moveLeft = 0;
    h.acted = true;
    s.stats.cards[id] = (s.stats.cards[id] ?? 0) + 1;
    s.events.push({ t: "card", card: id, at: a.at });
    return effect(s, h, id, a.at);
  }
  const u = s.units.find((x) => x.id === a.unit);
  if (!u || u.side !== "player") return { ok: false, reason: "not your unit" };
  if (u.acted) return { ok: false, reason: "already acted" };
  if (!UNITS[u.kind].abilities.includes(a.ability)) return { ok: false, reason: "no such ability" };
  if ((u.cooldowns[a.ability] ?? 0) > 0) return { ok: false, reason: "on cooldown" };
  const ab = ABILITIES[a.ability];
  const bad = validTarget(s, u, ab.target, ab.range, a.at);
  if (bad) return { ok: false, reason: bad };
  u.acted = true;
  u.moveLeft = 0;
  if (ab.cooldown) u.cooldowns[a.ability] = ab.cooldown + 1; // ticks at the start of each round
  s.stats.abilities[a.ability] = (s.stats.abilities[a.ability] ?? 0) + 1;
  return effect(s, u, a.ability, a.at);
}

/** All legal actions except "end", for bots and tests. One target per line direction. */
export function legalActions(s: State, opts: { moves?: boolean } = {}): Action[] {
  const out: Action[] = [];
  if (s.over) return out;
  for (const u of party(s)) {
    if (opts.moves !== false && u.moveLeft > 0)
      for (const k of reachable(s, u).keys()) {
        const [x, y] = k.split(",").map(Number);
        out.push({ type: "move", unit: u.id, to: { x, y } });
      }
    if (u.kind === "hero") continue;
    if (u.acted) continue;
    for (const ab of UNITS[u.kind].abilities as AbilityId[]) {
      if ((u.cooldowns[ab] ?? 0) > 0) continue;
      const d = ABILITIES[ab];
      for (const p of targets(s, u, d.target, d.range)) {
        if (d.target === "adjacent" && !worthHitting(s, u, p, ab)) continue;
        out.push({ type: "ability", unit: u.id, ability: ab, at: p });
      }
    }
  }
  const h = hero(s);
  if (h) {
    const seen = new Set<string>();
    s.hand.forEach((id, index) => {
      if (seen.has(id)) return; // duplicates in hand play the same
      seen.add(id);
      const c = CARDS[id];
      if (c.cost > s.energy) return;
      if ((id === "servant" || id === "totem") && summons(s).length >= RULES.maxSummons) return;
      for (const p of targets(s, h, c.target, c.range)) {
        if (c.target === "adjacent" && !worthHitting(s, h, p, id)) continue;
        out.push({ type: "card", index, at: p });
      }
    });
  }
  return out;
}

/** Damage-only attacks on allies are legal but never useful; skip them in enumeration. */
function worthHitting(s: State, u: Unit, p: Pos, id: string): boolean {
  const t = unitAt(s, p);
  if (!t) return id === "shove" || id === "shoulder" || id === "slam";
  if (t.side === u.side) return id === "shove" || id === "shoulder";
  return true;
}

// ---------------- cards -----------------------------------------------------------

function rand(s: State): number {
  const [v, next] = step(s.rand);
  s.rand = next;
  return v;
}
function shuffle<T>(s: State, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function draw(s: State, n: number) {
  for (let i = 0; i < n; i++) {
    if (!s.deck.length) {
      if (!s.discard.length) return;
      s.deck = shuffle(s, s.discard);
      s.discard = [];
    }
    s.hand.push(s.deck.pop()!);
  }
}

// ---------------- enemies ---------------------------------------------------------

/** Tiles an enemy's current intent will hit if it acts from where it stands now. */
export function intentTiles(s: State, e: Unit, it = e.intent): Pos[] {
  if (!it) return [];
  const d = DIRS[it.dir];
  const f = add(e, d);
  switch (it.attack) {
    case "cleave": {
      const side = DIRS[(it.dir + 1) % 4];
      return [f, add(f, side), add(f, side, -1)].filter((p) => walkable(s, p));
    }
    case "arrow":
      return ray(s, e, it.dir, 5).tiles;
    case "blight":
      return area(s, add(e, it.off ?? { x: 0, y: 0 }), "square");
    default:
      return walkable(s, f) ? [f] : [];
  }
}

/** Damage the intent deals on a tile right now (skitter bite checks for a lonely target). */
export function intentDamage(s: State, e: Unit, p: Pos, it = e.intent): number {
  if (!it) return 0;
  let dmg = ATTACKS[it.attack].damage;
  if (it.attack === "bite") {
    const t = unitAt(s, p);
    if (t && !s.units.some((o) => o !== t && o !== e && o.side === t.side && manhattan(o, t) === 1))
      dmg += RULES.skitterAlone;
  }
  return dmg;
}

function doIntent(s: State, e: Unit) {
  const it = e.intent;
  if (!it) return;
  e.facing = it.dir;
  const tiles = intentTiles(s, e);
  s.events.push({ t: "act", id: e.id, name: ATTACKS[it.attack].name, tiles, dir: it.dir });
  const hits = tiles
    .map((p) => ({ p, u: unitAt(s, p), dmg: intentDamage(s, e, p) }))
    .filter((h) => h.u);
  for (const h of hits) {
    if (!s.units.includes(h.u!)) continue;
    damage(s, h.u!, h.dmg, "direct", e);
    if (it.attack === "bash" && s.units.includes(h.u!)) shove(s, h.u!, it.dir, 1, "push");
  }
  if (it.attack === "blight")
    for (const p of tiles) {
      const g = groundAt(s, p);
      if (!g.fire) g.poison = Math.max(g.poison ?? 0, 2);
    }
}

const VALUE: Partial<Record<Kind, number>> = { hero: 1.6, wolf: 1, servant: 0.7, totem: 0.8 };

/** Score an intent from a tile: damage to the party, minus friendly fire. */
function scoreIntent(s: State, e: Unit, at: Pos, it: Intent): number {
  const ghost = { ...e, x: at.x, y: at.y };
  // the enemy has not moved in the state; ray/blight read units from the state, and the
  // enemy's own old tile still holds it. Temporarily move it.
  const ox = e.x,
    oy = e.y;
  e.x = at.x;
  e.y = at.y;
  let score = 0;
  for (const p of intentTiles(s, ghost, it)) {
    const u = unitAt(s, p);
    if (!u || u === e) continue;
    const dmg = intentDamage(s, e, p, it);
    score += u.side === "player" ? dmg * (VALUE[u.kind] ?? 1) + (dmg >= u.hp ? 4 : 0) : -dmg;
  }
  e.x = ox;
  e.y = oy;
  return score;
}

function intentOptions(s: State, e: Unit, at: Pos): Intent[] {
  const attack = ATTACK_OF[e.kind as EnemyKind];
  if (attack === "blight") {
    const out: Intent[] = [];
    for (const u of party(s))
      if (manhattan(u, at) <= 4 && manhattan(u, at) >= 2)
        out.push({ attack, dir: faceToward(at, u), off: { x: u.x - at.x, y: u.y - at.y } });
    return out;
  }
  return [0, 1, 2, 3].map((d) => ({ attack, dir: d as Dir }));
}

/** Choose where to walk (up to `speed`) and what to announce. Greedy on intent damage,
 * with role habits: archers and hexers keep distance, everyone avoids fire and poison. */
export function planIntent(s: State, e: Unit, speed = UNITS[e.kind].move) {
  const spots: { p: Pos; path: Pos[] }[] = [{ p: { x: e.x, y: e.y }, path: [] }];
  if (speed > 0)
    for (const [k, path] of reachable(s, e, speed)) {
      const [x, y] = k.split(",").map(Number);
      spots.push({ p: { x, y }, path });
    }
  const foes = party(s);
  if (!foes.length) return;
  const field = distanceField(s, foes);
  let best: { score: number; p: Pos; path: Pos[]; it: Intent } | null = null;
  for (const sp of spots) {
    const g = peekGround(s, sp.p);
    let base = -(g?.fire ? 8 : 0) - (g?.poison ? 3 : 0) - sp.path.length * 0.05;
    const near = Math.min(...foes.map((f) => manhattan(f, sp.p)));
    if (e.kind === "archer" || e.kind === "hexer") base += Math.min(near, 3) * 0.6;
    // approach: closer to the party is better when no attack lands
    const approach = -(field.get(key(sp.p)) ?? 20) * 0.3;
    for (const it of intentOptions(s, e, sp.p)) {
      const hit = scoreIntent(s, e, sp.p, it);
      const score = base + hit * 2 + approach;
      if (!best || score > best.score + 1e-9) best = { score, p: sp.p, path: sp.path, it };
    }
  }
  if (!best) return;
  if (best.path.length) {
    s.events.push({ t: "move", id: e.id, path: best.path });
    for (const p of best.path) {
      if (!s.units.includes(e)) return;
      e.x = p.x;
      e.y = p.y;
      enterTile(s, e);
    }
  }
  if (!s.units.includes(e)) return;
  e.intent = best.it;
  e.facing = best.it.dir;
}

// ---------------- turn flow -------------------------------------------------------

function endTurn(s: State) {
  s.discard.push(...s.hand);
  s.hand = [];
  s.actor = "enemy";
  s.events.push({ t: "phase", phase: "enemy" });
  for (const e of enemies(s)) e.block = 0;
  const order = enemies(s).map((e) => e.id);
  for (const id of order) {
    if (s.over) break;
    const e = s.units.find((u) => u.id === id);
    if (!e) continue;
    doIntent(s, e);
    if (s.over) break;
    if (s.units.includes(e)) planIntent(s, e);
  }
  s.actor = "player";
  if (s.over) return;
  roundEnd(s);
}

function roundEnd(s: State) {
  s.events.push({ t: "phase", phase: "round" });
  // reinforcements arrive at a corridor end, if it is free
  for (const r of s.reinforcements) {
    if (r.round > s.round) continue;
    const at = s.board.spawns[r.spawn % s.board.spawns.length];
    if (!at || !free(s, at)) {
      r.round = s.round + 1; // blocked: try again next round
      continue;
    }
    const h = hero(s)!;
    const u = makeUnit(s, r.kind, at, faceToward(at, h));
    s.events.push({ t: "spawn", id: u.id });
    planIntent(s, u, 0);
    r.round = -1;
  }
  s.reinforcements = s.reinforcements.filter((r) => r.round >= 0);
  // hazards tick on whoever stands in them
  for (const u of s.units) {
    const g = peekGround(s, u);
    if (!g) continue;
    if (g.poison) damage(s, u, RULES.poisonDamage, "poison");
    if (g.fire && s.units.includes(u)) damage(s, u, fireDamage(g), "hazard");
    if (s.over) return;
  }
  // poison spreads from thick tiles, then everything counts down
  const spread: [Pos, number][] = [];
  for (const k in s.ground) {
    const g = s.ground[k];
    if ((g.poison ?? 0) < 2) continue;
    const [x, y] = k.split(",").map(Number);
    for (const d of DIRS) {
      const n = add({ x, y }, d);
      const gn = peekGround(s, n);
      if (walkable(s, n) && !gn?.poison && !gn?.fire) spread.push([n, (g.poison ?? 0) - 1]);
    }
  }
  for (const k in s.ground) {
    const g = s.ground[k];
    if (g.fire) {
      g.fire--;
      if (!g.fire) g.blaze = false;
    }
    if (g.poison) g.poison--;
    if (g.ward) g.ward--;
  }
  for (const [p, v] of spread) {
    const g = groundAt(s, p);
    g.poison = Math.max(g.poison ?? 0, v);
  }
  for (const k in s.ground) {
    const g = s.ground[k];
    if (!g.fire && !g.poison && !g.ward && !g.oil) delete s.ground[k];
  }
  s.round++;
  if (s.round > RULES.maxRounds) {
    s.over = "loss";
    return;
  }
  // new player turn
  s.events.push({ t: "phase", phase: "player" });
  s.energy = RULES.energy;
  for (const u of party(s)) {
    u.block = 0;
    u.moveLeft = UNITS[u.kind].move;
    u.acted = false;
    for (const k in u.cooldowns) {
      const id = k as AbilityId;
      u.cooldowns[id] = Math.max(0, (u.cooldowns[id] ?? 0) - 1);
    }
  }
  draw(s, RULES.hand);
}

// ---------------- preview ---------------------------------------------------------

export interface Preview {
  ok: boolean;
  reason?: string;
  /** Per-unit HP change and where it ends up. */
  units: { id: number; name: string; dhp: number; dead: boolean; from: Pos; to: Pos }[];
  /** Tiles whose ground changes, with the new ground. */
  ground: { at: Pos; g: Ground }[];
  topples: number;
  combos: string[];
  text: string;
}

/** Exactly what an action does, by running it on a copy. The card preview in the view and
 * the bots use the same function, so the preview can't drift from the rules. */
export function preview(s: State, a: Action): Preview {
  const c = clone(s);
  const r = act(c, a);
  if (!r.ok)
    return {
      ok: false,
      reason: r.reason,
      units: [],
      ground: [],
      topples: 0,
      combos: [],
      text: r.reason,
    };
  const units: Preview["units"] = [];
  for (const u of s.units) {
    const v = c.units.find((x) => x.id === u.id);
    const dhp = (v?.hp ?? 0) - u.hp;
    const moved = v && (v.x !== u.x || v.y !== u.y);
    if (dhp || moved || !v)
      units.push({
        id: u.id,
        name: UNITS[u.kind].name,
        dhp: v ? dhp : -u.hp,
        dead: !v,
        from: { x: u.x, y: u.y },
        to: v ? { x: v.x, y: v.y } : { x: u.x, y: u.y },
      });
  }
  for (const v of c.units)
    if (!s.units.some((u) => u.id === v.id))
      units.push({ id: v.id, name: UNITS[v.kind].name, dhp: 0, dead: false, from: v, to: v });
  const ground: Preview["ground"] = [];
  for (const k of new Set([...Object.keys(s.ground), ...Object.keys(c.ground)])) {
    const before = JSON.stringify(s.ground[k] ?? {});
    const after = JSON.stringify(c.ground[k] ?? {});
    if (before === after) continue;
    const [x, y] = k.split(",").map(Number);
    ground.push({ at: { x, y }, g: c.ground[k] ?? {} });
  }
  const combos = c.events.flatMap((e) => (e.t === "combo" ? [e.text] : []));
  const topples = c.events.filter((e) => e.t === "topple").length;
  const parts: string[] = [];
  for (const u of units) {
    if (u.dhp < 0) parts.push(`${u.name} ${u.dhp}${u.dead ? " (dies)" : ""}`);
    else if (!same(u.from, u.to) && u.dhp === 0) parts.push(`${u.name} moves`);
    if (!s.units.some((x) => x.id === u.id)) parts.push(`${u.name} appears`);
  }
  if (topples) parts.push("brazier topples");
  const fires = ground.filter((g) => g.g.fire).length;
  if (fires) parts.push(`${fires} tile${fires > 1 ? "s" : ""} on fire`);
  const oils = ground.filter((g) => g.g.oil).length;
  if (oils) parts.push(`${oils} oil`);
  const pois = ground.filter((g) => g.g.poison).length;
  if (pois) parts.push(`${pois} poison`);
  const wards = ground.filter((g) => g.g.ward).length;
  if (wards) parts.push(`${wards} ward`);
  parts.push(...combos);
  return { ok: true, units, ground, topples, combos, text: parts.join(", ") || "no effect" };
}
