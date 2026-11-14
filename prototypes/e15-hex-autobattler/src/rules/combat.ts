// e15 rules: a hex autobattler with paused card windows. Pure TypeScript (no three.js, no
// DOM), deterministic: the only randomness is the deck shuffle, drawn from a seeded state.
//
// Flow (research/autobattler-combat.md section 6):
//   deploy window: place hero and wolf in the entry columns, pick the wolf priority,
//                  play at most one opening card from the first hand of five
//   interval:      each ally moves at most one hex, then does its basic action if in range
//                  (hero, wolf, summons in creation order); then each enemy does its
//                  announced attack and moves; ground ticks; enemies announce again
//   window:        discard the hand, draw five, 3 energy, play at most two cards or pass
// The fight ends when all enemies or the hero die, or as a loss after interval 15.

import {
  CELLS,
  type Cell,
  applyOffset,
  cellName,
  dist,
  nearestDir,
  neighbor,
  neighbors,
  offsetOf,
  rayDir,
} from "./hex.ts";
import { step } from "./rng.ts";

// ---------------- content -----------------------------------------------------------

export type AllyKind = "hero" | "wolf" | "servant" | "totem";
export type EnemyKind = "brute" | "archer" | "hexer" | "skitter" | "guard";
export type Kind = AllyKind | EnemyKind;
export type Side = "A" | "E";
export const ENEMY_KINDS: EnemyKind[] = ["brute", "archer", "hexer", "skitter", "guard"];

export interface KindDef {
  name: string;
  hp: number;
  /** Hexes moved per interval. */
  move: number;
  text: string;
}
export const KINDS: Record<Kind, KindDef> = {
  hero: {
    name: "Hero",
    hp: 26,
    move: 1,
    text: "Strikes an adjacent enemy for 3, else walks closer",
  },
  wolf: { name: "Wolf", hp: 16, move: 1, text: "Bites for 3; follows its priority" },
  servant: { name: "Bone Servant", hp: 8, move: 1, text: "Slams adjacent for 2 and pushes 1" },
  totem: {
    name: "Spirit Totem",
    hp: 6,
    move: 0,
    text: "Gives 2 block to the nearest ally within 2",
  },
  brute: { name: "Brute", hp: 14, move: 1, text: "Cleaves the three hexes in front for 5" },
  archer: { name: "Archer", hp: 10, move: 1, text: "Shoots a ray up to 4 hexes for 4" },
  hexer: {
    name: "Hexer",
    hp: 10,
    move: 1,
    text: "Hexes a cell and its neighbours for 2, leaves poison",
  },
  skitter: { name: "Skitter", hp: 8, move: 2, text: "Bites for 3, +2 on a lone target; runs 2" },
  guard: {
    name: "Guard",
    hp: 18,
    move: 1,
    text: "Bashes for 3 and pushes 1; takes 2 less from the front",
  },
};

export const SUMMON_TTL = 3;
export const MAX_SUMMONS = 2;
export const MAX_INTERVALS = 15; // "round 16 is a loss"
export const HAND = 5;
export const ENERGY = 3;
export const WINDOW_CARDS = 2;
export const OPENING_CARDS = 1;
export const UTILITY_RANGE = 4;
export const DMG = {
  heroStrike: 3,
  bite: 3,
  slam: 2,
  guardBlock: 3,
  totemBlock: 2,
  cleave: 5,
  arrow: 4,
  hex: 2,
  bite2: 3,
  lonely: 2,
  bash: 3,
  guardFront: 2,
  wall: 2,
  collide: 1,
  fire: 2,
  blaze: 4,
  poison: 1,
  ward: 2,
  strike: 4,
  firebolt: 3,
};
export const FIRE_TURNS = 2;
export const OIL_TURNS = 3;
export const POISON_TURNS = 2;
export const WARD_TURNS = 2;

export type CardId =
  | "strike"
  | "firebolt"
  | "reposition"
  | "shoulder"
  | "hook"
  | "oil"
  | "miasma"
  | "ward"
  | "servant"
  | "totem";
export type CardCat = "damage" | "move" | "push" | "ground" | "defend" | "summon";
export interface CardDef {
  name: string;
  cost: number;
  cat: CardCat;
  text: string;
}
export const CARDS: Record<CardId, CardDef> = {
  strike: { name: "Strike", cost: 1, cat: "damage", text: "Deal 4 to an adjacent enemy." },
  firebolt: {
    name: "Firebolt",
    cost: 1,
    cat: "damage",
    text: "Deal 3 to the first unit along a ray of up to 4. Ignites that hex (oil: blaze).",
  },
  reposition: {
    name: "Reposition",
    cost: 1,
    cat: "move",
    text: "Move one ally up to 2 clear hexes. It does not walk this interval.",
  },
  shoulder: {
    name: "Shoulder",
    cost: 1,
    cat: "push",
    text: "Wolf pushes an adjacent enemy 2 hexes. Only collisions hurt.",
  },
  hook: {
    name: "Hook",
    cost: 1,
    cat: "push",
    text: "Pull an enemy 2-3 hexes away on a clear ray from the hero by 2.",
  },
  oil: {
    name: "Oil",
    cost: 1,
    cat: "ground",
    text: "Coat a hex and two neighbours for 3 intervals. Fire on oil blazes for 4.",
  },
  miasma: {
    name: "Miasma",
    cost: 2,
    cat: "ground",
    text: "Poison a hex and its neighbours for 2 intervals.",
  },
  ward: {
    name: "Ward",
    cost: 1,
    cat: "defend",
    text: "Ward a hex and its neighbours for 2 intervals: each hit there deals 2 less.",
  },
  servant: {
    name: "Bone Servant",
    cost: 2,
    cat: "summon",
    text: "Summon next to the hero (8 HP, 3 intervals). Slams for 2 and pushes 1.",
  },
  totem: {
    name: "Spirit Totem",
    cost: 2,
    cat: "summon",
    text: "Summon next to the hero (6 HP, 3 intervals). Gives 2 block to the nearest ally.",
  },
};
export const UTILITY: CardId[] = [
  "reposition",
  "shoulder",
  "hook",
  "oil",
  "miasma",
  "ward",
  "servant",
  "totem",
];
export const BASE_DECK: CardId[] = [
  "strike",
  "strike",
  "firebolt",
  "firebolt",
  "reposition",
  "shoulder",
  "hook",
  "oil",
  "miasma",
  "ward",
  "servant",
  "totem",
];

export type Priority = "nearest" | "lowest" | "guard";
export const PRIORITIES: Priority[] = ["nearest", "lowest", "guard"];
export const PRIORITY_TEXT: Record<Priority, string> = {
  nearest: "Nearest: bite the closest enemy",
  lowest: "Lowest HP: bite the weakest enemy it can reach this interval",
  guard: "Guard: stay by the hero; 3 block when the hero is threatened",
};

/** Upgrades between fights. */
export interface Build {
  heroDmg: number;
  wolfHp: number;
  guardBonus: number;
  /** A Strike replaced by this utility card. */
  swap: CardId | null;
}
export const BASE_BUILD: Build = { heroDmg: 0, wolfHp: 0, guardBonus: 0, swap: null };

/** Switches used by the metrics to remove one feature at a time. */
export interface Flags {
  noGround?: boolean; // Oil, Miasma, Ward illegal; Firebolt does not ignite
  noPushPull?: boolean; // Shoulder, Hook illegal; servant slam does not push
  noSummons?: boolean;
  noPetSkills?: boolean; // the wolf keeps its body but never bites or guards; no Shoulder
  noPet?: boolean; // no wolf at all
  /** Timing test: the opening window may play this many cards (drawn from the top of the
   * deck, in the same order) with frontEnergy energy; later windows play nothing. */
  frontLoad?: number;
  frontEnergy?: number;
}

// ---------------- arena -------------------------------------------------------------

export interface Arena {
  /** Walls, corners, pillar, brazier, rubble. */
  blocked: boolean[];
  /** Standing braziers (blocked cells that topple into fire once). */
  braziers: Cell[];
  pillars: Cell[];
  /** Cells you may deploy on (the two entry columns). */
  entry: Cell[];
  doorRow: number;
  exitRow: number | null;
  /** How the source room was turned into this hex template, for the view. */
  source: string;
  theme: string;
}

// ---------------- state -------------------------------------------------------------

export interface Intent {
  kind: "cleave" | "ray" | "hex" | "bite" | "bash";
  /** Axial offsets from the enemy, fixed at announcement. Displacement moves them. */
  offsets: [number, number][];
  dir: number;
  damage: number;
  /** Who it aimed at, and why (for the log). */
  aim: string;
}

export interface Unit {
  id: number;
  kind: Kind;
  side: Side;
  hp: number;
  maxHp: number;
  block: number;
  cell: Cell;
  /** Creation order: allies act in this order. */
  order: number;
  /** Summons: intervals left. -1 = permanent. */
  ttl: number;
  facing: number;
  intent: Intent | null;
  /** Reposition: no automatic walking this interval. */
  hold: boolean;
  /** Last unit this one attacked (for target-change counts). */
  lastTarget: number;
}

export interface Ground {
  fire: number;
  firePow: number;
  oil: number;
  poison: number;
  ward: number;
}

export type Command =
  | { t: "deploy"; unit: "hero" | "wolf"; cell: Cell }
  | { t: "priority"; mode: Priority }
  | { t: "card"; index: number; target: Cell; dest?: Cell; dir?: number }
  | { t: "commit" };

export interface GameEvent {
  t: string;
  unit?: number;
  target?: number;
  cell?: Cell;
  from?: Cell;
  path?: Cell[];
  cells?: Cell[];
  amount?: number;
  hp?: number;
  kind?: string;
  text: string;
}

export interface FightSetup {
  name: string;
  note: string;
  arena: Arena;
  enemies: { kind: EnemyKind; cell: Cell }[];
  /** Extra HP for every enemy (harder generated fights). */
  hpBonus?: number;
  ground?: { cell: Cell; oil?: number; fire?: number; poison?: number }[];
  /** Tutorial fights guarantee one utility card in the first hand. */
  tutorial?: boolean;
  difficulty: number;
  family: string;
  mirrored?: boolean;
}

export interface State {
  name: string;
  arena: Arena;
  braziers: Cell[];
  units: Unit[];
  nextId: number;
  ground: Ground[];
  phase: "deploy" | "window" | "over";
  over: null | "win" | "lose";
  /** Completed intervals. */
  interval: number;
  deck: CardId[];
  hand: CardId[];
  discard: CardId[];
  energy: number;
  played: number;
  maxCards: number;
  rng: number;
  priority: Priority;
  build: Build;
  flags: Flags;
  /** Skip event texts (bots' inner simulations). */
  quiet: boolean;
  events: GameEvent[];
  /** State hash after every interval. */
  hashes: string[];
  /** Every accepted command, for replays. */
  log: Command[];
  stats: Record<string, number>;
  seed: number;
}

// ---------------- helpers -----------------------------------------------------------

export const name = (k: Kind) => KINDS[k].name;
export const alive = (s: State) => s.units.filter((u) => u.hp > 0);
export const allies = (s: State) => s.units.filter((u) => u.side === "A" && u.hp > 0);
export const enemies = (s: State) => s.units.filter((u) => u.side === "E" && u.hp > 0);
export const hero = (s: State) => s.units.find((u) => u.kind === "hero" && u.hp > 0);
export const wolf = (s: State) => s.units.find((u) => u.kind === "wolf" && u.hp > 0);
export const unitAt = (s: State, c: Cell) => s.units.find((u) => u.hp > 0 && u.cell === c);
export const unitById = (s: State, id: number) => s.units.find((u) => u.id === id && u.hp > 0);
export const summons = (s: State) =>
  s.units.filter((u) => u.hp > 0 && (u.kind === "servant" || u.kind === "totem"));
export const isBlocked = (s: State, c: Cell) => c < 0 || s.arena.blocked[c];
export const isFree = (s: State, c: Cell) => !isBlocked(s, c) && !unitAt(s, c);
export const hazardous = (g: Ground) => g.fire > 0 || g.poison > 0;
const VALUE: Record<string, number> = { hero: 3, wolf: 2, servant: 1, totem: 1 };

function bump(s: State, k: string, n = 1): void {
  s.stats[k] = (s.stats[k] ?? 0) + n;
}

function ev(s: State, e: Omit<GameEvent, "text">, text: () => string): void {
  s.events.push({ ...e, text: s.quiet ? "" : text() });
}

export function clone(s: State): State {
  return {
    ...s,
    braziers: [...s.braziers],
    units: s.units.map((u) => ({ ...u })),
    ground: s.ground.map((g) => ({ ...g })),
    deck: [...s.deck],
    hand: [...s.hand],
    discard: [...s.discard],
    events: [],
    hashes: [...s.hashes],
    log: [...s.log],
    stats: { ...s.stats },
  };
}

function rand(s: State): number {
  const [v, next] = step(s.rng);
  s.rng = next;
  return v;
}

function shuffle(s: State, xs: CardId[]): CardId[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function draw(s: State, n: number): void {
  for (let i = 0; i < n; i++) {
    if (!s.deck.length) {
      if (!s.discard.length) return;
      s.deck = shuffle(s, s.discard);
      s.discard = [];
    }
    s.hand.push(s.deck.shift()!);
  }
}

/** FNV-1a over the parts of the state that decide the future. */
export function hashState(s: State): string {
  const key = JSON.stringify([
    s.units.map((u) => [
      u.id,
      u.kind,
      u.hp,
      u.block,
      u.cell,
      u.ttl,
      u.facing,
      u.intent?.offsets,
      u.intent?.damage,
    ]),
    s.ground.map((g) => [g.fire, g.firePow, g.oil, g.poison, g.ward]),
    s.braziers,
    s.deck,
    s.hand,
    s.discard,
    s.rng,
    s.interval,
    s.over,
    s.priority,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------- setup -------------------------------------------------------------

/** Default formation: hero on the door row in the first column, wolf beside it. */
export function defaultFormation(a: Arena, noPet = false): { hero: Cell; wolf: Cell } {
  const free = a.entry.filter((c) => !a.blocked[c]);
  const want = a.doorRow * 7;
  const heroCell = [...free].sort((x, y) => dist(x, want) - dist(y, want) || x - y)[0];
  const wolfCell = noPet
    ? -1
    : [...free]
        .filter((c) => c !== heroCell)
        .sort((x, y) => dist(x, heroCell + 1) - dist(y, heroCell + 1) || x - y)[0];
  return { hero: heroCell, wolf: wolfCell };
}

export function newFight(
  setup: FightSetup,
  seed: number,
  build: Build = BASE_BUILD,
  flags: Flags = {},
): State {
  const ground: Ground[] = Array.from({ length: CELLS }, () => ({
    fire: 0,
    firePow: 0,
    oil: 0,
    poison: 0,
    ward: 0,
  }));
  for (const g of setup.ground ?? []) {
    const cell = ground[g.cell];
    if (g.oil) cell.oil = g.oil;
    if (g.fire) {
      cell.fire = g.fire;
      cell.firePow = DMG.fire;
    }
    if (g.poison) cell.poison = g.poison;
  }
  const deck = BASE_DECK.slice();
  if (build.swap) deck.splice(deck.indexOf("strike"), 1, build.swap);
  const s: State = {
    name: setup.name,
    arena: setup.arena,
    braziers: [...setup.arena.braziers],
    units: [],
    nextId: 1,
    ground,
    phase: "deploy",
    over: null,
    interval: 0,
    deck: [],
    hand: [],
    discard: [],
    energy: ENERGY,
    played: 0,
    maxCards: OPENING_CARDS,
    rng: (seed * 2654435761) >>> 0,
    priority: "nearest",
    build,
    flags,
    quiet: false,
    events: [],
    hashes: [],
    log: [],
    stats: {},
    seed,
  };
  const f = defaultFormation(setup.arena, flags.noPet);
  addUnit(s, "hero", "A", f.hero);
  if (!flags.noPet) addUnit(s, "wolf", "A", f.wolf);
  for (const e of setup.enemies) {
    const u = addUnit(s, e.kind, "E", e.cell);
    u.hp = u.maxHp = u.hp + (setup.hpBonus ?? 0);
  }
  s.deck = shuffle(s, deck);
  if (setup.tutorial) {
    const i = s.deck.findIndex((c) => UTILITY.includes(c));
    if (i >= HAND && !s.deck.slice(0, HAND).some((c) => UTILITY.includes(c)))
      [s.deck[HAND - 1], s.deck[i]] = [s.deck[i], s.deck[HAND - 1]];
  }
  draw(s, flags.frontLoad ? Math.max(HAND, Math.min(deck.length, flags.frontLoad)) : HAND);
  if (flags.frontLoad) {
    s.maxCards = flags.frontLoad;
    s.energy = flags.frontEnergy ?? ENERGY;
  }
  // First intents aim at the entry columns: you deploy knowing where the first blows land.
  for (const e of enemies(s)) announce(s, e);
  s.events = [];
  return s;
}

function addUnit(s: State, kind: Kind, side: Side, cell: Cell): Unit {
  const k = KINDS[kind];
  const hp = kind === "wolf" ? k.hp + s.build.wolfHp : k.hp;
  const u: Unit = {
    id: s.nextId++,
    kind,
    side,
    hp,
    maxHp: hp,
    block: 0,
    cell,
    order: s.nextId,
    ttl: kind === "servant" || kind === "totem" ? SUMMON_TTL : -1,
    facing: side === "A" ? 0 : 3,
    intent: null,
    hold: false,
    lastTarget: 0,
  };
  s.units.push(u);
  return u;
}

// ---------------- damage, movement, ground ------------------------------------------

type DmgKind = "attack" | "card" | "collide" | "wall" | "fire" | "poison";

/** Deal damage. Ward (2) for hits, guard front (2) for attacks, then block. */
function damage(
  s: State,
  u: Unit,
  amount: number,
  kind: DmgKind,
  src: Unit | null,
  label: string,
): number {
  if (u.hp <= 0) return 0;
  let a = amount;
  const g = s.ground[u.cell];
  if (kind !== "fire" && kind !== "poison" && g.ward > 0 && a > 0) {
    const cut = Math.min(a, DMG.ward);
    a -= cut;
    bump(s, "preventedWard", cut);
  }
  if (u.kind === "guard" && src && (kind === "attack" || kind === "card")) {
    const d = nearestDir(u.cell, src.cell);
    const off = (((d - u.facing) % 6) + 6) % 6;
    if (off === 0 || off === 1 || off === 5) {
      const cut = Math.min(a, DMG.guardFront);
      a -= cut;
      bump(s, "guardFrontCut", cut);
    }
  }
  const blocked = Math.min(u.block, a);
  u.block -= blocked;
  a -= blocked;
  if (blocked) bump(s, u.side === "A" ? "preventedBlock" : "enemyBlocked", blocked);
  u.hp -= a;
  if (u.side === "E") {
    bump(s, "dmgToEnemies", a);
    if (kind === "fire" || kind === "poison") bump(s, "hazardDmgToEnemies", a);
    if (kind === "collide" || kind === "wall") bump(s, "collisionDmgToEnemies", a);
    if (src?.side === "E") {
      bump(s, "friendlyFire", a);
      bump(s, `ff:${src.kind}`, a);
    }
  } else {
    bump(s, "dmgToAllies", a);
    if (u.kind === "wolf") bump(s, "dmgToWolf", a);
    if (u.kind === "hero") bump(s, "dmgToHero", a);
  }
  ev(s, { t: "damage", unit: u.id, amount: a, hp: Math.max(0, u.hp), kind, cell: u.cell }, () => {
    const extra = blocked ? ` (${blocked} blocked)` : "";
    return `${label}: ${name(u.kind)} takes ${a}${extra}`;
  });
  if (u.hp <= 0) {
    u.hp = 0;
    u.intent = null;
    ev(s, { t: "death", unit: u.id, cell: u.cell }, () => `${name(u.kind)} dies`);
    if (u.side === "E") bump(s, "kills");
    if (u.kind === "wolf") bump(s, "wolfDeaths");
    checkOver(s);
  }
  return a;
}

function checkOver(s: State): void {
  if (s.over) return;
  if (!hero(s)) s.over = "lose";
  else if (!enemies(s).length) s.over = "win";
  if (s.over) s.phase = "over";
}

/** Entering fire or poison hurts once per hex entered. */
function enter(s: State, u: Unit, forced: boolean): void {
  const g = s.ground[u.cell];
  if (g.fire > 0) {
    if (forced) bump(s, "forcedIntoHazard");
    damage(s, u, g.firePow, "fire", null, g.firePow > DMG.fire ? "Blaze" : "Fire");
  }
  if (u.hp > 0 && g.poison > 0) {
    if (forced && g.fire <= 0) bump(s, "forcedIntoHazard");
    damage(s, u, DMG.poison, "poison", null, "Poison");
  }
}

function moveAlong(s: State, u: Unit, path: Cell[], why: string): void {
  if (!path.length) return;
  const from = u.cell;
  ev(s, { t: "move", unit: u.id, from, cell: path[path.length - 1], path }, () => why);
  for (const c of path) {
    u.cell = c;
    enter(s, u, false);
    if (u.hp <= 0) return;
  }
}

/** Push (or pull) u n hexes in direction d. Wall 2, unit 1 to both and stop. Oil slides
 * one hex further. A brazier hit by a pushed unit topples: fire on the unit's hex. */
function shove(s: State, u: Unit, d: number, n: number, label: string): void {
  let left = n;
  let slid = false;
  const path: Cell[] = [];
  const from = u.cell;
  while (left > 0 && u.hp > 0) {
    left--;
    const next = neighbor(u.cell, d);
    if (isBlocked(s, next)) {
      if (path.length)
        ev(s, { t: "push", unit: u.id, from, cell: u.cell, path: [...path] }, () => label);
      path.length = 0;
      bump(s, u.side === "E" ? "wallSlamsEnemy" : "wallSlamsAlly");
      ev(s, { t: "wall", unit: u.id, cell: u.cell }, () => `${name(u.kind)} slams into a wall`);
      damage(s, u, DMG.wall, "wall", null, "Wall slam");
      const bi = s.braziers.indexOf(next);
      if (bi >= 0) {
        s.braziers.splice(bi, 1);
        bump(s, "brazierTopples");
        ev(s, { t: "topple", cell: next }, () => "The brazier topples");
        ignite(s, u.cell);
      }
      return;
    }
    const other = unitAt(s, next);
    if (other) {
      if (path.length)
        ev(s, { t: "push", unit: u.id, from, cell: u.cell, path: [...path] }, () => label);
      path.length = 0;
      bump(s, "collisions");
      ev(
        s,
        { t: "collide", unit: u.id, target: other.id, cell: u.cell },
        () => `${name(u.kind)} crashes into ${name(other.kind)}`,
      );
      damage(s, u, DMG.collide, "collide", null, "Crash");
      damage(s, other, DMG.collide, "collide", null, "Crash");
      return;
    }
    u.cell = next;
    path.push(next);
    enter(s, u, true);
    if (!slid && left === 0 && s.ground[next].oil > 0 && u.hp > 0) {
      slid = true;
      left = 1;
      bump(s, "oilSlides");
    }
  }
  if (path.length) ev(s, { t: "push", unit: u.id, from, cell: u.cell, path }, () => label);
}

/** Fire on a hex. On oil, every connected oiled hex becomes a blaze (4). */
function ignite(s: State, c: Cell): void {
  const g = s.ground[c];
  if (g.oil > 0) {
    const seen = new Set([c]);
    const q = [c];
    while (q.length) {
      const x = q.shift()!;
      const gx = s.ground[x];
      gx.oil = 0;
      gx.fire = FIRE_TURNS;
      gx.firePow = DMG.blaze;
      for (const n of neighbors(x))
        if (!seen.has(n) && s.ground[n].oil > 0) {
          seen.add(n);
          q.push(n);
        }
    }
    bump(s, "blazes");
    bump(s, "blazeCells", seen.size);
    ev(s, { t: "blaze", cell: c, cells: [...seen] }, () => `Oil blazes on ${seen.size} hexes`);
  } else {
    g.fire = FIRE_TURNS;
    g.firePow = Math.max(g.firePow, DMG.fire);
    bump(s, "ignites");
    ev(s, { t: "ignite", cell: c }, () => `Fire on ${cellName(c)}`);
  }
}

// ---------------- pathing -----------------------------------------------------------

/** Shortest route from u to any goal cell through free hexes. Prefers routes with fewer
 * fire or poison hexes when they are equally long. Ties break on cell number. */
export function route(
  s: State,
  from: Cell,
  goals: Set<Cell>,
  maxLen = 99,
  avoid?: Set<Cell>,
  hazardCost = 1,
): Cell[] | null {
  if (goals.has(from)) return [];
  const cost = new Map<Cell, number>([[from, 0]]);
  const prev = new Map<Cell, Cell>();
  // Dijkstra with tiny integer costs: length * 100 + hazards
  const open: Cell[] = [from];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const a = cost.get(open[i])!,
        b = cost.get(open[bi])!;
      if (a < b || (a === b && open[i] < open[bi])) bi = i;
    }
    const c = open.splice(bi, 1)[0];
    const cc = cost.get(c)!;
    if (goals.has(c)) {
      const path: Cell[] = [];
      let x = c;
      while (x !== from) {
        path.unshift(x);
        x = prev.get(x)!;
      }
      return path;
    }
    if (Math.floor(cc / 100) >= maxLen) continue;
    for (const n of neighbors(c)) {
      if (!isFree(s, n)) continue;
      const nc = cc + 100 + (hazardous(s.ground[n]) ? hazardCost : 0) + (avoid?.has(n) ? 50 : 0);
      if (!cost.has(n) || nc < cost.get(n)!) {
        if (!cost.has(n)) open.push(n);
        cost.set(n, nc);
        prev.set(n, c);
      }
    }
  }
  return null;
}

const freeAround = (s: State, c: Cell) => new Set(neighbors(c).filter((n) => isFree(s, n)));

// ---------------- allies ------------------------------------------------------------

/** Who an ally will go for this interval, and why. Shared by resolution and preview. */
function chooseTarget(
  s: State,
  u: Unit,
  mode: Priority | "nearest",
): { target: Unit | null; step: Cell | null; reason: string } {
  const foes = enemies(s);
  if (!foes.length) return { target: null, step: null, reason: "no enemies" };
  const reach: { e: Unit; steps: number; via: Cell | null }[] = [];
  for (const e of foes) {
    if (dist(u.cell, e.cell) === 1) reach.push({ e, steps: 0, via: null });
    else if (!u.hold && KINDS[u.kind].move > 0) {
      const opts = neighbors(u.cell).filter((n) => isFree(s, n) && dist(n, e.cell) === 1);
      if (opts.length) {
        opts.sort((a, b) => +hazardous(s.ground[a]) - +hazardous(s.ground[b]) || a - b);
        reach.push({ e, steps: 1, via: opts[0] });
      }
    }
  }
  if (reach.length) {
    let pick: (typeof reach)[0];
    let reason: string;
    if (mode === "lowest") {
      pick = [...reach].sort(
        (a, b) =>
          a.e.hp - b.e.hp ||
          a.steps - b.steps ||
          dist(u.cell, a.e.cell) - dist(u.cell, b.e.cell) ||
          a.e.id - b.e.id,
      )[0];
      reason = reach.length > 1 ? `lowest reachable HP (${pick.e.hp})` : "only enemy in reach";
    } else {
      pick = [...reach].sort((a, b) => a.steps - b.steps || a.e.hp - b.e.hp || a.e.id - b.e.id)[0];
      reason = pick.steps === 0 ? "nearest (adjacent)" : "nearest (one step away)";
      if (reach.filter((r) => r.steps === pick.steps).length > 1)
        reason += `, lowest HP of ${reach.filter((r) => r.steps === pick.steps).length}`;
    }
    return { target: pick.e, step: pick.via, reason };
  }
  // nobody in reach: walk toward the nearest enemy
  if (u.hold) return { target: null, step: null, reason: "repositioned: holds this interval" };
  const sorted = [...foes].sort(
    (a, b) => dist(u.cell, a.cell) - dist(u.cell, b.cell) || a.id - b.id,
  );
  for (const e of sorted) {
    const path = route(s, u.cell, freeAround(s, e.cell));
    if (path && path.length) return { target: e, step: path[0], reason: "approach nearest" };
  }
  return { target: null, step: null, reason: "path blocked" };
}

/** Enemy footprints right now (cells each living enemy's intent covers). */
export function footprint(s: State, e: Unit): Cell[] {
  if (!e.intent) return [];
  return e.intent.offsets.map((o) => applyOffset(e.cell, o)).filter((c) => c >= 0);
}

function threatenedBy(s: State, c: Cell): Unit | null {
  for (const e of enemies(s)) {
    if (!e.intent) continue;
    const cells = footprint(s, e);
    if (e.intent.kind === "ray") {
      // a ray hits the first unit along it
      for (const x of cells) {
        if (s.arena.blocked[x]) break;
        const o = unitAt(s, x);
        if (o) {
          if (x === c) return e;
          break;
        }
      }
    } else if (cells.includes(c)) return e;
  }
  return null;
}

function allyAct(s: State, u: Unit): void {
  const label = name(u.kind);
  if (u.kind === "totem") {
    const near = allies(s)
      .filter((a) => a.id !== u.id && dist(a.cell, u.cell) <= 2)
      .sort((a, b) => dist(a.cell, u.cell) - dist(b.cell, u.cell) || a.order - b.order)[0];
    if (!near) {
      ev(s, { t: "hold", unit: u.id }, () => `${label}: no ally within 2`);
      return;
    }
    near.block += DMG.totemBlock;
    bump(s, "totemBlock", DMG.totemBlock);
    ev(
      s,
      { t: "block", unit: near.id, amount: DMG.totemBlock, from: u.cell, target: u.id },
      () => `${label} gives ${name(near.kind)} ${DMG.totemBlock} block: nearest ally within 2`,
    );
    return;
  }
  const isWolf = u.kind === "wolf";
  const mode: Priority = isWolf ? s.priority : "nearest";
  if (isWolf && mode === "guard") {
    const h = hero(s)!;
    if (dist(u.cell, h.cell) > 1 && !u.hold) {
      const path = route(s, u.cell, freeAround(s, h.cell));
      if (path && path.length) moveAlong(s, u, [path[0]], `${label} runs back to guard the hero`);
      else {
        bump(s, "pathStalls");
        ev(s, { t: "hold", unit: u.id }, () => `${label} holds: no path to the hero`);
      }
      if (u.hp <= 0) return;
    }
    if (s.flags.noPetSkills) return;
    const threat = threatenedBy(s, h.cell);
    if (dist(u.cell, h.cell) === 1 && threat) {
      const amt = DMG.guardBlock + s.build.guardBonus;
      h.block += amt;
      bump(s, "wolfGuards");
      bump(s, "wolfGuardBlock", amt);
      ev(
        s,
        { t: "block", unit: h.id, amount: amt, from: u.cell, target: u.id },
        () => `${label} guards the hero: ${amt} block (hero is in ${name(threat.kind)}'s attack)`,
      );
      return;
    }
    const adj = enemies(s)
      .filter((e) => dist(e.cell, u.cell) === 1)
      .sort((a, b) => a.hp - b.hp || a.id - b.id)[0];
    if (adj) basicAttack(s, u, adj, "guarding, bites what is next to it");
    return;
  }
  const { target, step: next, reason } = chooseTarget(s, u, mode);
  if (!target) {
    if (reason === "path blocked") bump(s, "pathStalls");
    ev(s, { t: "hold", unit: u.id }, () => `${label} holds: ${reason}`);
    return;
  }
  if (isWolf) {
    if (u.lastTarget && u.lastTarget !== target.id && unitById(s, u.lastTarget))
      bump(s, "wolfTargetChanges");
  }
  if (next != null) {
    const why =
      dist(u.cell, target.cell) <= 2 && dist(next, target.cell) === 1
        ? `${label} chose ${name(target.kind)}: ${reason}`
        : `${label} walks toward ${name(target.kind)}: ${reason}`;
    moveAlong(s, u, [next], why);
    if (u.hp <= 0 || target.hp <= 0) return;
  }
  if (dist(u.cell, target.cell) === 1) {
    if (isWolf && s.flags.noPetSkills) return;
    basicAttack(s, u, target, reason);
  }
}

function basicAttack(s: State, u: Unit, t: Unit, reason: string): void {
  const label = name(u.kind);
  u.lastTarget = t.id;
  u.facing = nearestDir(u.cell, t.cell);
  const amt =
    u.kind === "hero" ? DMG.heroStrike + s.build.heroDmg : u.kind === "wolf" ? DMG.bite : DMG.slam;
  const what = u.kind === "hero" ? "strikes" : u.kind === "wolf" ? "bites" : "slams";
  bump(s, `${u.kind}Attacks`);
  ev(
    s,
    { t: "attack", unit: u.id, target: t.id, cell: t.cell, from: u.cell },
    () => `${label} ${what} ${name(t.kind)}: ${reason}`,
  );
  const dealt = damage(s, t, amt, "attack", u, `${label}'s ${what.slice(0, -1)}`);
  if (u.kind === "wolf") bump(s, "wolfDmg", dealt);
  if (u.kind === "servant" && t.hp > 0 && !s.flags.noPushPull) {
    bump(s, "servantPushes");
    shove(s, t, rayDir(u.cell, t.cell), 1, `${label} knocks ${name(t.kind)} back`);
  }
}

// ---------------- enemies -----------------------------------------------------------

function attackIntent(s: State, e: Unit): void {
  const it = e.intent;
  if (!it) return;
  const cells = footprint(s, e);
  const label = name(e.kind);
  bump(s, "enemyAttacks");
  if (it.kind === "ray") {
    let hit: Unit | null = null;
    for (const c of cells) {
      if (s.arena.blocked[c]) break;
      const o = unitAt(s, c);
      if (o && o.id !== e.id) {
        hit = o;
        break;
      }
    }
    ev(s, { t: "attack", unit: e.id, target: hit?.id, cells, from: e.cell }, () =>
      hit ? `${label} shoots ${name(hit.kind)}` : `${label} shoots: misses (nobody on the line)`,
    );
    if (hit) damage(s, hit, it.damage, "attack", e, `${label}'s arrow`);
    else bump(s, "enemyMisses");
    return;
  }
  const victims = cells.map((c) => unitAt(s, c)).filter((v): v is Unit => !!v && v.id !== e.id);
  const verb = { cleave: "cleaves", hex: "hexes", bite: "bites", bash: "bashes", ray: "" }[it.kind];
  ev(s, { t: "attack", unit: e.id, cells, from: e.cell }, () =>
    victims.length
      ? `${label} ${verb} ${victims.map((v) => name(v.kind)).join(", ")}`
      : `${label} ${verb}: misses (nobody there)`,
  );
  if (!victims.length) bump(s, "enemyMisses");
  for (const v of victims) {
    let amt = it.damage;
    if (it.kind === "bite") {
      const lone = !alive(s).some(
        (o) => o.id !== v.id && o.side === v.side && dist(o.cell, v.cell) === 1,
      );
      if (lone) {
        amt += DMG.lonely;
        bump(s, "lonelyBites");
      }
    }
    damage(s, v, amt, "attack", e, `${label}'s ${it.kind}`);
    if (it.kind === "bash" && v.hp > 0)
      shove(s, v, it.dir, 1, `${label} bashes ${name(v.kind)} back`);
  }
  if (it.kind === "hex") {
    const center = cells[0];
    if (center >= 0 && !s.arena.blocked[center]) s.ground[center].poison = POISON_TURNS;
  }
}

const allyValue = (u: Unit) => VALUE[u.kind] ?? 1;

/** Targets an enemy plans against: living allies, or the entry columns before the fight. */
function marks(s: State): { cell: Cell; value: number; unit: Unit | null }[] {
  const xs = allies(s);
  if (s.phase === "deploy")
    return s.arena.entry
      .filter((c) => !s.arena.blocked[c])
      .map((c) => ({ cell: c, value: 1, unit: null }));
  return xs.map((u) => ({ cell: u.cell, value: allyValue(u), unit: u }));
}

function enemyMove(s: State, e: Unit): void {
  const ms = marks(s);
  if (!ms.length) return;
  const label = name(e.kind);
  // enemies that still attack this interval: do not walk into their blows
  const danger = new Set<Cell>();
  for (const o of enemies(s)) if (o.id > e.id) for (const c of footprint(s, o)) danger.add(c);
  const near = (c: Cell) => Math.min(...ms.map((m) => dist(m.cell, c)));
  const steps = KINDS[e.kind].move;
  if (e.kind === "archer" || e.kind === "hexer") {
    const good = (c: Cell) =>
      near(c) >= 2 && (e.kind === "hexer" ? near(c) <= UTILITY_RANGE : !!rayShot(s, e, c));
    if (good(e.cell)) return;
    const opts = neighbors(e.cell).filter(
      (n) => isFree(s, n) && good(n) && !danger.has(n) && !hazardous(s.ground[n]),
    );
    opts.sort(
      (a, b) => near(b) - near(a) || +hazardous(s.ground[a]) - +hazardous(s.ground[b]) || a - b,
    );
    if (opts.length) {
      moveAlong(s, e, [opts[0]], `${label} moves to get a clear shot`);
      return;
    }
    if (near(e.cell) <= 2) return;
  }
  let goalMark = ms[0];
  if (e.kind === "skitter") {
    const lone = (m: (typeof ms)[0]) =>
      m.unit && !allies(s).some((o) => o.id !== m.unit!.id && dist(o.cell, m.cell) === 1);
    goalMark = [...ms].sort(
      (a, b) =>
        +!!lone(b) - +!!lone(a) ||
        (a.unit?.hp ?? 0) - (b.unit?.hp ?? 0) ||
        dist(a.cell, e.cell) - dist(b.cell, e.cell) ||
        a.cell - b.cell,
    )[0];
  } else
    goalMark = [...ms].sort(
      (a, b) => dist(a.cell, e.cell) - dist(b.cell, e.cell) || b.value - a.value || a.cell - b.cell,
    )[0];
  if (dist(e.cell, goalMark.cell) === 1) return;
  if (e.kind !== "skitter" && ms.some((m) => dist(m.cell, e.cell) === 1)) return;
  // enemies go around fire and poison when the detour is at most two hexes longer
  const path = route(s, e.cell, freeAround(s, goalMark.cell), 99, danger, 250);
  if (!path || !path.length) return;
  let walk = path.slice(0, steps);
  while (
    walk.length &&
    (danger.has(walk[walk.length - 1]) || hazardous(s.ground[walk[walk.length - 1]]))
  )
    walk = walk.slice(0, -1);
  if (!walk.length) return;
  moveAlong(s, e, walk, `${label} advances`);
}

/** The first ally an archer at cell c could shoot along some ray (walls block). */
function rayShot(s: State, e: Unit, c: Cell): { dir: number; cells: Cell[]; hit: Cell } | null {
  const ms = marks(s);
  let best: { dir: number; cells: Cell[]; hit: Cell; v: number } | null = null;
  for (let d = 0; d < 6; d++) {
    const cells = rayCells(s, c, d, 4);
    let v = 0,
      hit = -1;
    let len = 0;
    for (const x of cells) {
      len++;
      const o = unitAt(s, x);
      if (o && o.id !== e.id) {
        if (o.side === "A") {
          v = allyValue(o);
          hit = x;
        }
        break;
      }
      const m = ms.find((mm) => mm.cell === x && !mm.unit);
      if (m) {
        v = m.value;
        hit = x;
        break;
      }
    }
    // the arrow flies to its mark and no further: step off the line and it misses
    if (v > 0 && (!best || v > best.v)) best = { dir: d, cells: cells.slice(0, len), hit, v };
  }
  return best;
}

/** Cells along a ray up to n hexes, stopping before walls. */
export function rayCells(s: State, from: Cell, d: number, n: number): Cell[] {
  const out: Cell[] = [];
  let c = from;
  for (let i = 0; i < n; i++) {
    c = neighbor(c, d);
    if (isBlocked(s, c)) break;
    out.push(c);
  }
  return out;
}

/** Announce the next attack from where the enemy stands. */
function announce(s: State, e: Unit): void {
  const ms = marks(s);
  const label = name(e.kind);
  const nearestMark = [...ms].sort(
    (a, b) => dist(a.cell, e.cell) - dist(b.cell, e.cell) || b.value - a.value || a.cell - b.cell,
  )[0];
  const who = (c: Cell) => {
    const u = unitAt(s, c);
    return u ? name(u.kind) : "the entry";
  };
  const set = (kind: Intent["kind"], cells: Cell[], dir: number, dmg: number, aim: string) => {
    e.intent = { kind, offsets: cells.map((c) => offsetOf(e.cell, c)), dir, damage: dmg, aim };
    e.facing = dir;
  };
  if (!nearestMark) {
    e.intent = null;
    return;
  }
  const valueAt = (c: Cell) => {
    const m = ms.find((mm) => mm.cell === c);
    if (m) return m.value;
    const u = unitAt(s, c);
    return u && u.side === "E" && u.id !== e.id ? -2 : 0;
  };
  if (e.kind === "brute") {
    let best = { d: nearestDir(e.cell, nearestMark.cell), v: 0 };
    for (let d = 0; d < 6; d++) {
      const v = [d - 1, d, d + 1].reduce((a, x) => a + valueAt(neighbor(e.cell, x)), 0);
      if (v > best.v) best = { d, v };
    }
    const cells = [best.d - 1, best.d, best.d + 1]
      .map((x) => neighbor(e.cell, x))
      .filter((c) => c >= 0);
    const hits = cells.filter((c) => valueAt(c) > 0).length;
    set(
      "cleave",
      cells,
      best.d,
      DMG.cleave,
      hits > 1
        ? `${hits} targets in the arc`
        : hits
          ? `${who(cells.find((c) => valueAt(c) > 0)!)} is next to it`
          : `toward ${who(nearestMark.cell)} (nearest)`,
    );
    return;
  }
  if (e.kind === "archer") {
    const shot = rayShot(s, e, e.cell);
    const d = shot ? shot.dir : nearestDir(e.cell, nearestMark.cell);
    const cells = shot ? shot.cells : rayCells(s, e.cell, d, 4);
    set(
      "ray",
      cells,
      d,
      DMG.arrow,
      shot ? `clear line to ${who(shot.hit)}` : `toward ${who(nearestMark.cell)} (no clear line)`,
    );
    return;
  }
  if (e.kind === "hexer") {
    let best: { c: Cell; v: number } | null = null;
    for (const m of ms) {
      if (dist(m.cell, e.cell) > UTILITY_RANGE) continue;
      const area = [m.cell, ...neighbors(m.cell)];
      const v = area.reduce((a, c) => a + valueAt(c), 0);
      if (!best || v > best.v || (v === best.v && m.cell < best.c)) best = { c: m.cell, v };
    }
    let center = best?.c;
    if (center == null) {
      // out of range: aim as far as it reaches toward the nearest target
      const pts = [...Array(CELLS).keys()].filter(
        (c) => !s.arena.blocked[c] && dist(c, e.cell) <= UTILITY_RANGE,
      );
      center = pts.sort(
        (a, b) => dist(a, nearestMark.cell) - dist(b, nearestMark.cell) || a - b,
      )[0];
    }
    const cells = [center, ...neighbors(center).filter((c) => !s.arena.blocked[c])];
    set(
      "hex",
      cells,
      nearestDir(e.cell, center),
      DMG.hex,
      best ? `most targets around ${who(center)}` : "out of range, creeps the curse closer",
    );
    return;
  }
  // skitter and guard: one adjacent cell
  const adj = ms.filter((m) => dist(m.cell, e.cell) === 1);
  let tgt: Cell;
  let aim: string;
  if (adj.length) {
    const lone = (m: (typeof ms)[0]) =>
      !!m.unit && !allies(s).some((o) => o.id !== m.unit!.id && dist(o.cell, m.cell) === 1);
    const pick = [...adj].sort((a, b) =>
      e.kind === "skitter"
        ? +lone(b) - +lone(a) || (a.unit?.hp ?? 0) - (b.unit?.hp ?? 0) || a.cell - b.cell
        : b.value - a.value || (a.unit?.hp ?? 0) - (b.unit?.hp ?? 0) || a.cell - b.cell,
    )[0];
    tgt = pick.cell;
    aim =
      e.kind === "skitter" && lone(pick) ? `${who(tgt)} stands alone` : `${who(tgt)} is next to it`;
  } else {
    tgt = neighbor(e.cell, nearestDir(e.cell, nearestMark.cell));
    aim = `toward ${who(nearestMark.cell)} (nearest)`;
  }
  const d = nearestDir(e.cell, tgt);
  if (e.kind === "skitter") set("bite", [tgt], d, DMG.bite2, aim);
  else set("bash", [tgt], d, DMG.bash, aim);
  void label;
}

// ---------------- the interval ------------------------------------------------------

/** Run one automatic interval in place. Does not draw: the next hand stays hidden. */
export function runInterval(s: State): void {
  s.events = [];
  if (s.phase === "deploy") s.phase = "window";
  ev(s, { t: "interval" }, () => `Interval ${s.interval + 1}`);
  for (const u of allies(s)) u.block = 0;
  const order = allies(s).sort((a, b) => a.order - b.order);
  for (const u of order) {
    if (u.hp <= 0) continue;
    allyAct(s, u);
    if (s.over) break;
  }
  if (!s.over) {
    for (const e of enemies(s).sort((a, b) => a.id - b.id)) {
      if (e.hp <= 0) continue;
      attackIntent(s, e);
      if (s.over) break;
      if (e.hp > 0) enemyMove(s, e);
      if (s.over) break;
    }
  }
  if (!s.over) groundTick(s);
  for (const u of s.units) u.hold = false;
  s.interval++;
  if (!s.over && s.interval >= MAX_INTERVALS) {
    s.over = "lose";
    s.phase = "over";
    ev(s, { t: "timeout" }, () => `Out of time after ${MAX_INTERVALS} intervals`);
  }
  if (!s.over) for (const e of enemies(s).sort((a, b) => a.id - b.id)) announce(s, e);
  s.hashes.push(hashState(s));
}

function groundTick(s: State): void {
  for (const u of alive(s).sort((a, b) => a.id - b.id)) {
    const g = s.ground[u.cell];
    if (g.fire > 0) damage(s, u, g.firePow, "fire", null, g.firePow > DMG.fire ? "Blaze" : "Fire");
    if (s.over) return;
    if (u.hp > 0 && g.poison > 0) damage(s, u, DMG.poison, "poison", null, "Poison");
    if (s.over) return;
  }
  for (const g of s.ground) {
    if (g.fire > 0 && --g.fire === 0) g.firePow = 0;
    if (g.oil > 0) g.oil--;
    if (g.poison > 0) g.poison--;
    if (g.ward > 0) g.ward--;
  }
  for (const u of summons(s)) {
    if (--u.ttl <= 0) {
      u.hp = 0;
      ev(s, { t: "expire", unit: u.id, cell: u.cell }, () => `${name(u.kind)} crumbles`);
    }
  }
}

function startWindow(s: State): void {
  s.discard.push(...s.hand);
  s.hand = [];
  draw(s, HAND);
  s.energy = ENERGY;
  s.played = 0;
  s.maxCards = s.flags.frontLoad ? 0 : WINDOW_CARDS;
  s.phase = "window";
}

// ---------------- cards -------------------------------------------------------------

export interface CardTarget {
  target: Cell;
  dest?: Cell;
  dir?: number;
}

export function cardBlocked(s: State, id: CardId): string {
  const c = CARDS[id];
  const h = hero(s);
  if (!h) return "the hero is down";
  if (s.phase === "over") return "fight over";
  if (s.played >= s.maxCards)
    return s.maxCards === OPENING_CARDS && s.phase === "deploy"
      ? "one opening card"
      : "two cards per window";
  if (c.cost > s.energy) return "not enough energy";
  const f = s.flags;
  if (f.noGround && (id === "oil" || id === "miasma" || id === "ward")) return "disabled";
  if (f.noPushPull && (id === "shoulder" || id === "hook")) return "disabled";
  if (f.noSummons && (id === "servant" || id === "totem")) return "disabled";
  if (id === "shoulder" && (f.noPetSkills || !wolf(s))) return "needs the wolf";
  if ((id === "servant" || id === "totem") && summons(s).length >= MAX_SUMMONS)
    return "two summons already";
  if (!cardTargets(s, id).length) return "no target";
  return "";
}

/** Every legal way to play a card. */
export function cardTargets(s: State, id: CardId): CardTarget[] {
  const h = hero(s);
  if (!h) return [];
  const out: CardTarget[] = [];
  const inRange = (c: Cell) => !s.arena.blocked[c] && dist(c, h.cell) <= UTILITY_RANGE;
  switch (id) {
    case "strike":
      for (const n of neighbors(h.cell)) if (unitAt(s, n)?.side === "E") out.push({ target: n });
      break;
    case "firebolt":
      for (let d = 0; d < 6; d++)
        for (const c of rayCells(s, h.cell, d, 4)) {
          out.push({ target: c });
          if (unitAt(s, c)) break;
        }
      break;
    case "reposition":
      for (const u of allies(s)) {
        if (u.kind === "totem" || dist(u.cell, h.cell) > UTILITY_RANGE) continue;
        const seen = new Set<Cell>();
        for (const a of neighbors(u.cell)) {
          if (!isFree(s, a)) continue;
          seen.add(a);
          for (const b of neighbors(a)) if (b !== u.cell && isFree(s, b)) seen.add(b);
        }
        for (const c of [...seen].sort((a, b) => a - b)) out.push({ target: u.cell, dest: c });
      }
      break;
    case "shoulder": {
      const w = wolf(s);
      if (w)
        for (const n of neighbors(w.cell)) if (unitAt(s, n)?.side === "E") out.push({ target: n });
      break;
    }
    case "hook":
      for (let d = 0; d < 6; d++) {
        const cells = rayCells(s, h.cell, d, 3);
        for (let i = 0; i < cells.length; i++) {
          const u = unitAt(s, cells[i]);
          if (!u) continue;
          if (u.side === "E" && i >= 1) out.push({ target: cells[i] });
          break;
        }
      }
      break;
    case "oil":
      for (let c = 0; c < CELLS; c++) {
        if (!inRange(c)) continue;
        for (let d = 0; d < 6; d++) {
          const a = neighbor(c, d),
            b = neighbor(c, d + 1);
          if (isBlocked(s, a) || isBlocked(s, b)) continue;
          out.push({ target: c, dir: d });
        }
      }
      break;
    case "miasma":
    case "ward":
      for (let c = 0; c < CELLS; c++) if (inRange(c)) out.push({ target: c });
      break;
    case "servant":
    case "totem":
      for (const n of neighbors(h.cell)) if (isFree(s, n)) out.push({ target: n });
      break;
  }
  return out;
}

export function oilCells(s: State, t: CardTarget): Cell[] {
  return [t.target, neighbor(t.target, t.dir ?? 0), neighbor(t.target, (t.dir ?? 0) + 1)].filter(
    (c) => !isBlocked(s, c),
  );
}

function playCard(s: State, id: CardId, t: CardTarget): void {
  const h = hero(s)!;
  const c = CARDS[id];
  s.energy -= c.cost;
  s.played++;
  bump(s, `card:${id}`);
  bump(s, `cat:${c.cat}`);
  ev(s, { t: "card", kind: id, cell: t.target, from: h.cell }, () => `Hero plays ${c.name}`);
  switch (id) {
    case "strike": {
      const e = unitAt(s, t.target)!;
      h.facing = nearestDir(h.cell, e.cell);
      damage(s, e, DMG.strike, "card", h, "Strike");
      break;
    }
    case "firebolt": {
      const u = unitAt(s, t.target);
      if (u) damage(s, u, DMG.firebolt, "card", h, "Firebolt");
      if (!s.flags.noGround) ignite(s, t.target);
      break;
    }
    case "reposition": {
      const u = unitAt(s, t.target)!;
      let path: Cell[] = [t.dest!];
      if (dist(u.cell, t.dest!) === 2) {
        const mids = neighbors(u.cell).filter((m) => isFree(s, m) && dist(m, t.dest!) === 1);
        mids.sort((a, b) => +hazardous(s.ground[a]) - +hazardous(s.ground[b]) || a - b);
        path = [mids[0], t.dest!];
      }
      moveAlong(s, u, path, `${name(u.kind)} repositions to ${cellName(t.dest!)}`);
      u.hold = true;
      break;
    }
    case "shoulder": {
      const w = wolf(s)!;
      const e = unitAt(s, t.target)!;
      bump(s, "pushes");
      shove(s, e, rayDir(w.cell, e.cell), 2, `Wolf shoulders ${name(e.kind)} back`);
      break;
    }
    case "hook": {
      const e = unitAt(s, t.target)!;
      bump(s, "pulls");
      shove(s, e, rayDir(e.cell, h.cell), 2, `Hook drags ${name(e.kind)} in`);
      break;
    }
    case "oil":
      for (const x of oilCells(s, t)) {
        const g = s.ground[x];
        if (g.fire > 0) {
          g.firePow = DMG.blaze;
          g.fire = FIRE_TURNS;
          bump(s, "blazes");
        } else g.oil = OIL_TURNS;
      }
      break;
    case "miasma":
      for (const x of [t.target, ...neighbors(t.target)])
        if (!s.arena.blocked[x]) s.ground[x].poison = POISON_TURNS;
      break;
    case "ward":
      for (const x of [t.target, ...neighbors(t.target)])
        if (!s.arena.blocked[x]) s.ground[x].ward = WARD_TURNS;
      break;
    case "servant":
    case "totem": {
      const u = addUnit(s, id, "A", t.target);
      bump(s, "summons");
      ev(s, { t: "summon", unit: u.id, cell: u.cell, kind: id }, () => `${c.name} rises`);
      enter(s, u, false);
      break;
    }
  }
  s.discard.push(s.hand.splice(s.hand.indexOf(id), 1)[0]);
  checkOver(s);
}

// ---------------- commands ----------------------------------------------------------

/** Apply a command. Returns false (and changes nothing) when it is illegal. */
export function apply(s: State, cmd: Command): boolean {
  if (s.phase === "over") return false;
  s.events = [];
  switch (cmd.t) {
    case "deploy": {
      if (s.phase !== "deploy" || s.played > 0) return false;
      if (!s.arena.entry.includes(cmd.cell) || s.arena.blocked[cmd.cell]) return false;
      const u = cmd.unit === "hero" ? hero(s) : wolf(s);
      if (!u) return false;
      const other = unitAt(s, cmd.cell);
      if (other && other.side !== "A") return false;
      if (other && other !== u) other.cell = u.cell;
      u.cell = cmd.cell;
      break;
    }
    case "priority":
      if (!PRIORITIES.includes(cmd.mode)) return false;
      s.priority = cmd.mode;
      break;
    case "card": {
      const id = s.hand[cmd.index];
      if (!id || cardBlocked(s, id)) return false;
      const legal = cardTargets(s, id).some(
        (t) =>
          t.target === cmd.target && t.dest === cmd.dest && (id !== "oil" || t.dir === cmd.dir),
      );
      if (!legal) return false;
      playCard(s, id, { target: cmd.target, dest: cmd.dest, dir: cmd.dir });
      break;
    }
    case "commit":
      runInterval(s);
      if (!s.over) startWindow(s);
      break;
  }
  s.log.push(cmd);
  return true;
}

/** Every legal card play right now (for bots and tests). */
export function legalCards(s: State): Command[] {
  const out: Command[] = [];
  const seen = new Set<CardId>();
  s.hand.forEach((id, index) => {
    if (seen.has(id) || cardBlocked(s, id)) return;
    seen.add(id);
    for (const t of cardTargets(s, id)) out.push({ t: "card", index, ...t });
  });
  return out;
}

/** The exact next interval, run on a copy with the real rules. */
export function preview(s: State): State {
  const c = clone(s);
  runInterval(c);
  return c;
}

/** Replay a command log from a fresh setup. Returns the end state. */
export function replay(
  setup: FightSetup,
  seed: number,
  log: Command[],
  build?: Build,
  flags?: Flags,
): State {
  const s = newFight(setup, seed, build, flags);
  for (const cmd of log)
    if (!apply(s, cmd)) throw new Error(`replay: illegal ${JSON.stringify(cmd)}`);
  return s;
}

/** What each enemy's attack will cover right now, for overlays and bots. */
export function threats(
  s: State,
): { enemy: Unit; cells: Cell[]; damage: number; firstHit: Cell | null }[] {
  return enemies(s)
    .filter((e) => e.intent)
    .map((e) => {
      const cells = footprint(s, e);
      let firstHit: Cell | null = null;
      if (e.intent!.kind === "ray")
        for (const c of cells) {
          if (s.arena.blocked[c]) break;
          if (unitAt(s, c)) {
            firstHit = c;
            break;
          }
        }
      return { enemy: e, cells, damage: e.intent!.damage, firstHit };
    });
}
