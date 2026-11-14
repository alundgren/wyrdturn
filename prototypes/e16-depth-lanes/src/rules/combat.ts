// Depth-lane combat rules for e16. Pure logic: no three.js, no DOM.
// The browser view, the tests, the bots and the metrics all run this code.
//
// Field: 3 lanes (0 left, 1 middle, 2 right) x rows 0..5. Row 0 is the party line: the
// hero, the wolf and at most a totem stand there and only step sideways. Rows 1..5 are
// the field in front of the party; enemies walk down it toward the line.
//
// Round: player turn (cards, hero steps, wolf, summons, any order) -> enemy phase (each
// enemy does its shown intent, front row first) -> ground ticks -> waves arrive ->
// enemies show new intents -> next player turn.
//
// Intents are committed: attacks hit cells measured from the attacker, so pushing an
// enemy moves its attack with it, and an attack on an empty cell misses. Lobs aim at a
// fixed cell. Enemy attacks never hurt enemies.

import { step as rngStep } from "./rng.ts";

export const LANES = 3;
export const ROWS = 5; // field rows 1..5; row 0 is the party line
export const HAND = 5;
export const ENERGY = 3;
export const MAX_SUMMONS = 2;
export const MAX_ROUNDS = 20;
export const MAX_FIELD = 6; // enemies on the field at once
export const FIRE = 2;
export const BLAZE = 3;
export const POISON = 1;
export const COLLIDE = 2;
export const WALL = 3;
export const WARD = 2;
export const GUARD = 4;
export const ARMOUR = 2;

export type Side = "P" | "E";
export type Kind =
  | "hero"
  | "wolf"
  | "servant"
  | "totem"
  | "ghoul"
  | "spear"
  | "archer"
  | "priest"
  | "spider"
  | "warden";
export type CardId =
  | "strike"
  | "thrust"
  | "firebolt"
  | "shove"
  | "hook"
  | "oil"
  | "frost"
  | "miasma"
  | "servant"
  | "totem";

export interface Cell {
  lane: number;
  row: number;
}

export interface Ground {
  fire: number; // rounds left
  blaze: boolean;
  oil: boolean;
  ice: number; // rounds left
  poison: number; // rounds left
  ward: boolean; // until the end of the next enemy phase
}

// What an enemy will do next. Attack cells are offsets from the enemy (dl lanes, dr rows),
// lob cells are absolute. Moves are a list of single steps.
export type Intent =
  | { t: "move"; steps: { dl: number; dr: number }[]; why?: string }
  | { t: "attack"; cells: { dl: number; dr: number }[]; dmg: number; name: string }
  | { t: "shoot"; dmg: number; name: string } // first P body down the archer's lane
  | { t: "lob"; cell: Cell; dmg: number; effect: "poison" | "fire"; name: string }
  | { t: "wait"; why: string };

export interface Unit {
  id: number;
  kind: Kind;
  side: Side;
  hp: number;
  maxHp: number;
  lane: number;
  row: number;
  intent: Intent | null;
  frozen: boolean; // skips its next move
  guard: number; // hero: damage cut from the next hit this enemy phase
  ticks: number; // enemy: own counter (priest alternates, warden walks every other turn)
}

export interface Wave {
  round: number; // arrives at the end of the enemy phase of round-1, before round `round`
  spawns: { kind: Kind; lane: number }[];
}

export interface Options {
  ground: boolean; // player ground cards (Oil, Frost, Miasma) and Firebolt's fire
  push: boolean; // Shove, Hook, wolf Shove, servant knockback
  sideways: boolean; // hero and wolf steps
  summons: boolean; // Bone Servant, Spirit Totem
  ice: boolean; // Frost
  wolf: boolean; // the wolf exists
  wolfSkills: boolean; // the wolf acts
  depth: boolean; // reach in rows (off: front and pierce attacks reach any row)
  lanes: boolean; // lane reach (off: lane cards may aim at any lane)
}
export const ALL_ON: Options = {
  ground: true,
  push: true,
  sideways: true,
  summons: true,
  ice: true,
  wolf: true,
  wolfSkills: true,
  depth: true,
  lanes: true,
};

export interface Encounter {
  name: string;
  enemies: { kind: Kind; lane: number; row: number }[];
  waves?: Wave[];
  ground?: { lane: number; row: number; oil?: boolean; ice?: number; fire?: number }[];
  hero?: number; // hero lane, default 1
  wolf?: number; // wolf lane, default 0
  hpBonus?: number; // added to every enemy's HP
}

export type GameEvent =
  | { t: "dmg"; id: number; amount: number; src: string; blocked?: number }
  | { t: "heal"; id: number; amount: number }
  | { t: "move"; id: number; lane: number; row: number; forced?: boolean; swap?: boolean }
  | { t: "die"; id: number }
  | { t: "summon"; id: number }
  | { t: "spawn"; id: number }
  | { t: "attack"; id: number; cells: Cell[]; name: string }
  | { t: "miss"; id: number; name: string }
  | { t: "ground"; lane: number; row: number }
  | { t: "combo"; lane: number; row: number; text: string }
  | { t: "collide"; a: number; b: number }
  | { t: "slam"; id: number }
  | { t: "card"; card: CardId }
  | { t: "ability"; id: number; name: string }
  | { t: "info"; text: string };

export interface Stats {
  heroSteps: number;
  dodgeSteps: number;
  hitAndDodge: number; // turns where the hero dealt card damage and then stepped out of a red cell
  wolfSteps: number;
  bites: number;
  wolfShoves: number;
  guards: number;
  guardPrevented: number;
  summons: number;
  summonAbsorbed: number; // damage taken by summons
  arrowsCaught: number; // archer shots that hit a summon
  blockedMoves: number; // walker moves stopped by a summon
  iceStops: number;
  ignites: number;
  blazes: number;
  forcedHazard: number;
  collisions: number;
  slams: number;
  wardPrevented: number;
  dmgByReach: Record<string, number>; // front, pierce, lane, lob, wolf, summon, ground, collide
  killRows: number[]; // row of each enemy kill (index = row)
  cards: Record<string, number>;
  maxField: number;
  clutterRounds: number; // rounds with > 6 enemies or > 8 ground cells on the field
}

export interface State {
  units: Unit[];
  ground: Ground[]; // index lane + row * LANES, rows 0..5
  round: number;
  energy: number;
  hand: CardId[];
  draw: CardId[];
  discard: CardId[];
  rng: number;
  nextId: number;
  waves: Wave[];
  over: "win" | "loss" | null;
  wolfStepped: boolean;
  wolfActed: boolean;
  summonActed: number[];
  cooldowns: Record<string, number>; // wolf shove / guard
  opts: Options;
  stats: Stats;
  turnDealt: boolean; // hero dealt card damage this turn (for hit-and-dodge)
  turnDodged: boolean;
  name: string;
  hpBonus: number;
}

export type Action =
  | { t: "card"; idx: number; cell?: Cell }
  | { t: "step"; id: number; dir: number }
  | {
      t: "ability";
      id: number;
      ab: "bite" | "shove" | "guard" | "bash" | "ward";
      dir?: number;
      cell?: Cell;
    }
  | { t: "end" };

// ---------------- content ---------------------------------------------------------

export const UNIT_HP: Record<Kind, number> = {
  hero: 30,
  wolf: 16,
  servant: 12,
  totem: 6,
  ghoul: 12,
  spear: 10,
  archer: 8,
  priest: 9,
  spider: 6,
  warden: 16,
};

export const NAMES: Record<Kind, string> = {
  hero: "Hero",
  wolf: "Wolf",
  servant: "Bone Servant",
  totem: "Spirit Totem",
  ghoul: "Ghoul",
  spear: "Spearman",
  archer: "Bone Archer",
  priest: "Bile Priest",
  spider: "Cave Spider",
  warden: "Grave Warden",
};

export interface CardDef {
  name: string;
  cost: number;
  reach: "front" | "pierce" | "near" | "lane" | "lob" | "place" | "line";
  text: string;
  kind: "damage" | "push" | "ground" | "summon";
}
export const CARDS: Record<CardId, CardDef> = {
  strike: {
    name: "Strike",
    cost: 1,
    reach: "front",
    text: "6 damage to the enemy in row 1 of your lane.",
    kind: "damage",
  },
  thrust: {
    name: "Spear Thrust",
    cost: 1,
    reach: "pierce",
    text: "3 damage to each enemy in rows 1 and 2 of your lane.",
    kind: "damage",
  },
  firebolt: {
    name: "Firebolt",
    cost: 1,
    reach: "near",
    text: "3 damage to the first enemy in rows 1-4 of your lane. Sets its cell on fire.",
    kind: "damage",
  },
  shove: {
    name: "Shove",
    cost: 1,
    reach: "front",
    text: "Push the enemy in row 1 of your lane 2 rows back.",
    kind: "push",
  },
  hook: {
    name: "Hook",
    cost: 1,
    reach: "lane",
    text: "Pull the first enemy in your lane to row 1.",
    kind: "push",
  },
  oil: {
    name: "Oil Flask",
    cost: 1,
    reach: "lob",
    text: "Oil on any field cell and the cell behind it. Fire on oil blazes.",
    kind: "ground",
  },
  frost: {
    name: "Frost",
    cost: 1,
    reach: "lob",
    text: "Ice on a cell in rows 1-3. 2 damage. A walker on ice skips its next move.",
    kind: "ground",
  },
  miasma: {
    name: "Miasma",
    cost: 2,
    reach: "lob",
    text: "Poison on a cell in rows 2-5 and both cells beside it.",
    kind: "ground",
  },
  servant: {
    name: "Bone Servant",
    cost: 1,
    reach: "place",
    text: "Summon a blocker on an empty cell in rows 1-2. Stops walkers and arrows.",
    kind: "summon",
  },
  totem: {
    name: "Spirit Totem",
    cost: 1,
    reach: "line",
    text: "Summon on an empty line cell or row 1. Wards a line cell each turn.",
    kind: "summon",
  },
};

export const STARTING_DECK: CardId[] = [
  "strike",
  "strike",
  "thrust",
  "firebolt",
  "firebolt",
  "shove",
  "hook",
  "oil",
  "frost",
  "miasma",
  "servant",
  "totem",
];

export const WOLF_COOLDOWN = { shove: 2, guard: 3 };

// ---------------- helpers ---------------------------------------------------------

export const gi = (lane: number, row: number) => lane + row * LANES;
export const inField = (lane: number, row: number) =>
  lane >= 0 && lane < LANES && row >= 0 && row <= ROWS;
const emptyGround = (): Ground => ({
  fire: 0,
  blaze: false,
  oil: false,
  ice: 0,
  poison: 0,
  ward: false,
});

export function unitAt(s: State, lane: number, row: number): Unit | undefined {
  for (const u of s.units) if (u.lane === lane && u.row === row && u.hp > 0) return u;
  return undefined;
}
export function unitById(s: State, id: number): Unit | undefined {
  for (const u of s.units) if (u.id === id) return u;
  return undefined;
}
export const hero = (s: State) => s.units.find((u) => u.kind === "hero");
export const wolf = (s: State) => s.units.find((u) => u.kind === "wolf");
export const enemies = (s: State) => s.units.filter((u) => u.side === "E");
export const summonCount = (s: State) =>
  s.units.filter((u) => u.kind === "servant" || u.kind === "totem").length;
export const isSummon = (u: Unit) => u.kind === "servant" || u.kind === "totem";
export const isWalker = (k: Kind) => k === "ghoul" || k === "spider" || k === "warden";

function rand(s: State): number {
  const [v, n] = rngStep(s.rng);
  s.rng = n;
  return v;
}

function newStats(): Stats {
  return {
    heroSteps: 0,
    dodgeSteps: 0,
    hitAndDodge: 0,
    wolfSteps: 0,
    bites: 0,
    wolfShoves: 0,
    guards: 0,
    guardPrevented: 0,
    summons: 0,
    summonAbsorbed: 0,
    arrowsCaught: 0,
    blockedMoves: 0,
    iceStops: 0,
    ignites: 0,
    blazes: 0,
    forcedHazard: 0,
    collisions: 0,
    slams: 0,
    wardPrevented: 0,
    dmgByReach: {},
    killRows: [0, 0, 0, 0, 0, 0],
    cards: {},
    maxField: 0,
    clutterRounds: 0,
  };
}

export function clone(s: State): State {
  return {
    ...s,
    units: s.units.map((u) => ({ ...u })),
    ground: s.ground.map((g) => ({ ...g })),
    hand: s.hand.slice(),
    draw: s.draw.slice(),
    discard: s.discard.slice(),
    summonActed: s.summonActed.slice(),
    waves: s.waves.map((w) => ({ round: w.round, spawns: w.spawns.slice() })),
    cooldowns: { ...s.cooldowns },
    stats: {
      ...s.stats,
      dmgByReach: { ...s.stats.dmgByReach },
      killRows: s.stats.killRows.slice(),
      cards: { ...s.stats.cards },
    },
  };
}

// A deck with the cards that a disabled feature would bring swapped for Strike.
export function deckFor(opts: Options): CardId[] {
  return STARTING_DECK.map((c) => {
    if (!opts.ground && (c === "oil" || c === "miasma")) return "strike";
    if ((!opts.ground || !opts.ice) && c === "frost") return "strike";
    if (!opts.push && (c === "shove" || c === "hook")) return "strike";
    if (!opts.summons && (c === "servant" || c === "totem")) return "strike";
    return c;
  });
}

export function newFight(enc: Encounter, seed: number, opts: Options = ALL_ON): State {
  const s: State = {
    units: [],
    ground: Array.from({ length: LANES * (ROWS + 1) }, emptyGround),
    round: 1,
    energy: ENERGY,
    hand: [],
    draw: [],
    discard: [],
    rng: seed >>> 0 || 1,
    nextId: 1,
    waves: (enc.waves ?? []).map((w) => ({
      round: w.round,
      spawns: w.spawns.map((x) => ({ ...x })),
    })),
    over: null,
    wolfStepped: false,
    wolfActed: false,
    summonActed: [],
    cooldowns: { shove: 0, guard: 0 },
    opts,
    stats: newStats(),
    turnDealt: false,
    turnDodged: false,
    name: enc.name,
    hpBonus: enc.hpBonus ?? 0,
  };
  addUnit(s, "hero", enc.hero ?? 1, 0);
  if (opts.wolf) addUnit(s, "wolf", enc.wolf ?? 0, 0);
  for (const e of enc.enemies) addUnit(s, e.kind, e.lane, e.row, enc.hpBonus ?? 0);
  for (const g of enc.ground ?? []) {
    const c = s.ground[gi(g.lane, g.row)];
    if (g.oil) c.oil = true;
    if (g.ice) c.ice = g.ice;
    if (g.fire) c.fire = g.fire;
  }
  const deck = deckFor(opts);
  // seeded shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  s.draw = deck;
  drawHand(s);
  planAll(s);
  return s;
}

function addUnit(s: State, kind: Kind, lane: number, row: number, hpBonus = 0): Unit {
  const side: Side =
    kind === "hero" || kind === "wolf" || kind === "servant" || kind === "totem" ? "P" : "E";
  const hp = UNIT_HP[kind] + (side === "E" ? hpBonus : 0);
  const u: Unit = {
    id: s.nextId++,
    kind,
    side,
    hp,
    maxHp: hp,
    lane,
    row,
    intent: null,
    frozen: false,
    guard: 0,
    ticks: 0,
  };
  s.units.push(u);
  return u;
}

function drawHand(s: State): void {
  s.discard.push(...s.hand);
  s.hand = [];
  while (s.hand.length < HAND) {
    if (!s.draw.length) {
      if (!s.discard.length) break;
      s.draw = s.discard;
      s.discard = [];
      for (let i = s.draw.length - 1; i > 0; i--) {
        const j = Math.floor(rand(s) * (i + 1));
        [s.draw[i], s.draw[j]] = [s.draw[j], s.draw[i]];
      }
    }
    s.hand.push(s.draw.pop()!);
  }
}

// ---------------- damage, death, movement ------------------------------------------

function addReach(s: State, key: string, n: number) {
  s.stats.dmgByReach[key] = (s.stats.dmgByReach[key] ?? 0) + n;
}

// Deal damage. `armoured` hits are cut by the warden's armour; ward and guard cut enemy
// attacks on the line.
function damage(
  s: State,
  u: Unit,
  amount: number,
  src: string,
  ev: GameEvent[],
  o: { armoured?: boolean; enemyAttack?: boolean; reach?: string } = {},
): number {
  if (u.hp <= 0 || amount <= 0) return 0;
  let n = amount;
  let blocked = 0;
  if (o.armoured && u.kind === "warden") {
    blocked += Math.min(n, ARMOUR);
    n -= Math.min(n, ARMOUR);
  }
  if (o.enemyAttack) {
    if (u.row === 0 && s.ground[gi(u.lane, 0)].ward) {
      const w = Math.min(n, WARD);
      n -= w;
      blocked += w;
      s.stats.wardPrevented += w;
    }
    if (u.guard > 0) {
      const g = Math.min(n, u.guard);
      n -= g;
      blocked += g;
      u.guard = 0;
      s.stats.guardPrevented += g;
    }
  }
  n = Math.min(n, u.hp);
  u.hp -= n;
  ev.push({ t: "dmg", id: u.id, amount: n, src, blocked: blocked || undefined });
  if (u.side === "E" && o.reach) addReach(s, o.reach, n);
  if (isSummon(u)) s.stats.summonAbsorbed += n;
  if (u.hp <= 0) kill(s, u, ev);
  return n;
}

function kill(s: State, u: Unit, ev: GameEvent[]): void {
  ev.push({ t: "die", id: u.id });
  if (u.side === "E") s.stats.killRows[u.row]++;
  s.units = s.units.filter((x) => x !== u);
  if (u.kind === "hero") s.over = "loss";
  else checkWin(s);
}

function checkWin(s: State): void {
  if (s.over) return;
  if (!s.units.some((u) => u.side === "E") && !s.waves.length) s.over = "win";
}

// Hazards on entering a cell by force (push or pull).
function enterHazard(s: State, u: Unit, ev: GameEvent[]): void {
  const g = s.ground[gi(u.lane, u.row)];
  let hit = false;
  if (g.fire > 0) {
    damage(s, u, g.blaze ? BLAZE : FIRE, "fire", ev, { reach: "ground" });
    hit = true;
  }
  if (u.hp > 0 && g.poison > 0) {
    damage(s, u, POISON, "poison", ev, { reach: "ground" });
    hit = true;
  }
  if (u.hp > 0 && g.ice > 0 && u.side === "E") {
    u.frozen = true;
    s.stats.iceStops++;
  }
  if (hit) s.stats.forcedHazard++;
}

// Move an enemy (or summon) by force, cell by cell. Blocked by a unit: stop, both take
// COLLIDE. Off the back of the field or the side: stay, take WALL.
function forceMove(s: State, u: Unit, dl: number, dr: number, n: number, ev: GameEvent[]): void {
  for (let i = 0; i < n && u.hp > 0; i++) {
    const nl = u.lane + dl,
      nr = u.row + dr;
    if (nl < 0 || nl >= LANES || nr > ROWS) {
      ev.push({ t: "slam", id: u.id });
      s.stats.slams++;
      damage(s, u, WALL, "wall", ev, { reach: "collide" });
      return;
    }
    if (nr < 1) return; // enemies never enter the line
    const other = unitAt(s, nl, nr);
    if (other) {
      ev.push({ t: "collide", a: u.id, b: other.id });
      s.stats.collisions++;
      damage(s, u, COLLIDE, "collision", ev, { reach: "collide" });
      if (other.side === "E") damage(s, other, COLLIDE, "collision", ev, { reach: "collide" });
      else damage(s, other, COLLIDE, "collision", ev);
      return;
    }
    u.lane = nl;
    u.row = nr;
    ev.push({ t: "move", id: u.id, lane: nl, row: nr, forced: true });
    enterHazard(s, u, ev);
  }
}

// Fire on a cell; on oil it becomes a blaze that spreads through touching oil.
function ignite(s: State, lane: number, row: number, rounds: number, ev: GameEvent[]): void {
  const g = s.ground[gi(lane, row)];
  if (g.ice > 0) {
    g.ice = 0;
    ev.push({ t: "combo", lane, row, text: "ice melts" });
  }
  if (!g.oil) {
    g.fire = Math.max(g.fire, rounds);
    ev.push({ t: "ground", lane, row });
    s.stats.ignites++;
    return;
  }
  // blaze through connected oil
  const todo = [[lane, row]];
  const seen = new Set<number>();
  let cells = 0;
  while (todo.length) {
    const [l, r] = todo.pop()!;
    const k = gi(l, r);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = s.ground[k];
    if (!c.oil) continue;
    c.oil = false;
    c.fire = 2;
    c.blaze = true;
    c.ice = 0;
    cells++;
    ev.push({ t: "combo", lane: l, row: r, text: "blaze" });
    const u = unitAt(s, l, r);
    if (u) damage(s, u, BLAZE, "blaze", ev, { reach: "ground" });
    for (const [a, b] of [
      [l + 1, r],
      [l - 1, r],
      [l, r + 1],
      [l, r - 1],
    ])
      if (inField(a, b) && b >= 1) todo.push([a, b]);
  }
  s.stats.blazes += cells ? 1 : 0;
  s.stats.ignites++;
}

// ---------------- targeting --------------------------------------------------------

// First enemy in a lane, nearest the line.
export function firstEnemy(s: State, lane: number): Unit | undefined {
  let best: Unit | undefined;
  for (const u of s.units)
    if (u.side === "E" && u.lane === lane && (!best || u.row < best.row)) best = u;
  return best;
}

// Cells a card may target. Returns [] when it can't be played.
export function cardTargets(s: State, card: CardId): Cell[] {
  const h = hero(s);
  if (!h) return [];
  const o = s.opts;
  const lanes = o.lanes ? [h.lane] : [0, 1, 2];
  const out: Cell[] = [];
  switch (card) {
    case "strike":
    case "shove":
      for (const l of lanes) {
        const f = o.depth ? unitAt(s, l, 1) : firstEnemy(s, l);
        if (f && f.side === "E") out.push({ lane: l, row: f.row });
      }
      break;
    case "thrust":
      for (const l of lanes) {
        const f = firstEnemy(s, l);
        if (f && (!o.depth || f.row <= 2)) out.push({ lane: l, row: f.row });
      }
      break;
    case "firebolt":
      for (const l of lanes) {
        const f = firstEnemy(s, l);
        if (f && (!o.depth || f.row <= 4)) out.push({ lane: l, row: f.row });
      }
      break;
    case "hook":
      for (const l of lanes) {
        const f = firstEnemy(s, l);
        if (f && f.row > 1 && !unitAt(s, l, f.row - 1)) out.push({ lane: l, row: f.row });
      }
      break;
    case "oil":
      for (let r = 1; r <= ROWS; r++)
        for (let l = 0; l < LANES; l++) if (!s.ground[gi(l, r)].oil) out.push({ lane: l, row: r });
      break;
    case "frost":
      for (let r = 1; r <= 3; r++) for (let l = 0; l < LANES; l++) out.push({ lane: l, row: r });
      break;
    case "miasma":
      for (let r = 2; r <= ROWS; r++) for (let l = 0; l < LANES; l++) out.push({ lane: l, row: r });
      break;
    case "servant":
      if (summonCount(s) >= MAX_SUMMONS) break;
      for (let r = 1; r <= 2; r++)
        for (let l = 0; l < LANES; l++) if (!unitAt(s, l, r)) out.push({ lane: l, row: r });
      break;
    case "totem":
      if (summonCount(s) >= MAX_SUMMONS) break;
      for (let r = 0; r <= 1; r++)
        for (let l = 0; l < LANES; l++) if (!unitAt(s, l, r)) out.push({ lane: l, row: r });
      break;
  }
  return out;
}

export function canPlay(s: State, idx: number): boolean {
  const c = s.hand[idx];
  return !!c && CARDS[c].cost <= s.energy && cardTargets(s, c).length > 0;
}

// The cells currently marked red: every cell an enemy attack will land on, with the damage.
export interface Threat {
  cell: Cell;
  dmg: number;
  from: number;
  name: string;
  lob?: boolean;
}
export function threats(s: State): Threat[] {
  const out: Threat[] = [];
  for (const e of s.units) {
    if (e.side !== "E" || !e.intent) continue;
    const it = e.intent;
    if (it.t === "attack")
      for (const c of it.cells) {
        const cell = { lane: e.lane + c.dl, row: e.row + c.dr };
        if (inField(cell.lane, cell.row))
          out.push({ cell, dmg: it.dmg, from: e.id, name: it.name });
      }
    else if (it.t === "shoot") {
      const v = shotVictim(s, e);
      out.push({
        cell: v ? { lane: v.lane, row: v.row } : { lane: e.lane, row: 0 },
        dmg: it.dmg,
        from: e.id,
        name: it.name,
      });
    } else if (it.t === "lob")
      out.push({ cell: it.cell, dmg: it.dmg, from: e.id, name: it.name, lob: true });
  }
  return out;
}

// Archers aim at the hero: the arrow hits the first player body in the hero's lane,
// coming from the far end, so a summon in front of the hero catches it.
export function shotVictim(s: State, _e: Unit): Unit | undefined {
  const h = hero(s);
  if (!h) return undefined;
  for (let r = ROWS; r >= 0; r--) {
    const u = unitAt(s, h.lane, r);
    if (u && u.side === "P") return u;
  }
  return undefined;
}

export const isRed = (s: State, lane: number, row: number) =>
  threats(s).some((t) => t.cell.lane === lane && t.cell.row === row);

// ---------------- legal actions and apply ------------------------------------------

export function legalActions(s: State): Action[] {
  if (s.over) return [];
  const out: Action[] = [];
  s.hand.forEach((c, idx) => {
    if (CARDS[c].cost > s.energy) return;
    if (s.hand.indexOf(c) !== idx) return; // same card twice: one choice
    for (const cell of cardTargets(s, c)) out.push({ t: "card", idx, cell });
  });
  const h = hero(s);
  if (h && s.opts.sideways && s.energy >= 1)
    for (const dir of [-1, 1]) {
      const l = h.lane + dir;
      if (l < 0 || l >= LANES) continue;
      const o = unitAt(s, l, 0);
      if (!o || o.kind === "wolf") out.push({ t: "step", id: h.id, dir });
    }
  const w = wolf(s);
  if (w) {
    if (s.opts.sideways && !s.wolfStepped)
      for (const dir of [-1, 1]) {
        const l = w.lane + dir;
        if (l >= 0 && l < LANES && !unitAt(s, l, 0)) out.push({ t: "step", id: w.id, dir });
      }
    if (s.opts.wolfSkills && !s.wolfActed) {
      const f = firstEnemy(s, w.lane);
      if (f && (!s.opts.depth || f.row <= 2)) {
        out.push({ t: "ability", id: w.id, ab: "bite" });
        if (
          s.opts.push &&
          s.cooldowns.shove === 0 &&
          f.kind !== "warden" &&
          (!s.opts.depth || f.row === 1)
        )
          for (const dir of [-1, 1]) out.push({ t: "ability", id: w.id, ab: "shove", dir });
      }
      if (s.cooldowns.guard === 0) out.push({ t: "ability", id: w.id, ab: "guard" });
    }
  }
  for (const u of s.units) {
    if (u.side !== "P" || s.summonActed.includes(u.id)) continue;
    if (u.kind === "servant") {
      const f = unitAt(s, u.lane, u.row + 1);
      if (f && f.side === "E") out.push({ t: "ability", id: u.id, ab: "bash" });
    } else if (u.kind === "totem") {
      for (let l = 0; l < LANES; l++)
        if (!s.ground[gi(l, 0)].ward)
          out.push({ t: "ability", id: u.id, ab: "ward", cell: { lane: l, row: 0 } });
    }
  }
  out.push({ t: "end" });
  return out;
}

export function isLegal(s: State, a: Action): boolean {
  const key = JSON.stringify(a);
  return legalActions(s).some((b) => JSON.stringify(b) === key);
}

// Apply a player action in place. Returns the events, or null if illegal. Bots pass
// check=false for actions that came straight from legalActions().
export function apply(s: State, a: Action, check = true): GameEvent[] | null {
  if (s.over) return null;
  if (a.t === "end") return endTurn(s);
  if (check && !isLegal(s, a)) return null;
  const ev: GameEvent[] = [];
  if (a.t === "card") playCard(s, a.idx, a.cell!, ev);
  else if (a.t === "step") doStep(s, a.id, a.dir, ev);
  else doAbility(s, a, ev);
  checkWin(s);
  return ev;
}

function doStep(s: State, id: number, dir: number, ev: GameEvent[]): void {
  const u = unitById(s, id)!;
  const l = u.lane + dir;
  if (u.kind === "hero") {
    s.energy -= 1;
    s.stats.heroSteps++;
    const wasRed = isRed(s, u.lane, 0);
    const o = unitAt(s, l, 0);
    if (o) {
      o.lane = u.lane;
      ev.push({ t: "move", id: o.id, lane: o.lane, row: 0, swap: true });
    }
    u.lane = l;
    ev.push({ t: "move", id: u.id, lane: l, row: 0 });
    if (wasRed && !isRed(s, l, 0)) {
      s.stats.dodgeSteps++;
      if (s.turnDealt && !s.turnDodged) {
        s.stats.hitAndDodge++;
        s.turnDodged = true;
      }
    }
  } else {
    s.wolfStepped = true;
    s.stats.wolfSteps++;
    u.lane = l;
    ev.push({ t: "move", id: u.id, lane: l, row: 0 });
  }
  // stepping into a burning or poisoned line cell
  const g = s.ground[gi(u.lane, 0)];
  if (g.fire > 0) damage(s, u, g.blaze ? BLAZE : FIRE, "fire", ev);
  if (u.hp > 0 && g.poison > 0) damage(s, u, POISON, "poison", ev);
}

function playCard(s: State, idx: number, cell: Cell, ev: GameEvent[]): void {
  const card = s.hand[idx];
  const def = CARDS[card];
  s.energy -= def.cost;
  s.hand.splice(idx, 1);
  s.discard.push(card);
  s.stats.cards[card] = (s.stats.cards[card] ?? 0) + 1;
  ev.push({ t: "card", card });
  const target = unitAt(s, cell.lane, cell.row);
  const dealt = (n: number) => {
    if (n > 0) s.turnDealt = true;
  };
  switch (card) {
    case "strike":
      dealt(damage(s, target!, 6, "Strike", ev, { armoured: true, reach: "front" }));
      break;
    case "thrust": {
      // first two enemies in the lane (rows 1 and 2 when depth is on)
      const hit = s.units
        .filter((u) => u.side === "E" && u.lane === cell.lane && (s.opts.depth ? u.row <= 2 : true))
        .sort((a, b) => a.row - b.row)
        .slice(0, 2);
      for (const u of hit)
        dealt(damage(s, u, 3, "Spear Thrust", ev, { armoured: true, reach: "pierce" }));
      break;
    }
    case "firebolt": {
      const { lane, row } = target!;
      dealt(damage(s, target!, 3, "Firebolt", ev, { armoured: true, reach: "lane" }));
      if (s.opts.ground) ignite(s, lane, row, 2, ev);
      break;
    }
    case "shove":
      forceMove(s, target!, 0, 1, target!.kind === "warden" ? 1 : 2, ev);
      break;
    case "hook": {
      const n = target!.kind === "warden" ? 1 : target!.row - 1;
      forceMove(s, target!, 0, -1, n, ev);
      break;
    }
    case "oil":
      for (const r of [cell.row, cell.row + 1]) {
        if (r > ROWS) continue;
        const g = s.ground[gi(cell.lane, r)];
        g.oil = true;
        ev.push({ t: "ground", lane: cell.lane, row: r });
        if (g.fire > 0) ignite(s, cell.lane, r, 3, ev);
      }
      break;
    case "frost": {
      const g = s.ground[gi(cell.lane, cell.row)];
      if (g.fire > 0) {
        g.fire = 0;
        g.blaze = false;
        ev.push({ t: "combo", lane: cell.lane, row: cell.row, text: "fire out" });
      } else g.ice = 3;
      ev.push({ t: "ground", lane: cell.lane, row: cell.row });
      if (target && target.side === "E") {
        if (g.ice > 0) {
          target.frozen = true;
          s.stats.iceStops++;
        }
        dealt(damage(s, target, 2, "Frost", ev, { armoured: true, reach: "lob" }));
      }
      break;
    }
    case "miasma":
      for (const l of [cell.lane - 1, cell.lane, cell.lane + 1]) {
        if (l < 0 || l >= LANES) continue;
        s.ground[gi(l, cell.row)].poison = 3;
        ev.push({ t: "ground", lane: l, row: cell.row });
      }
      break;
    case "servant":
    case "totem": {
      const u = addUnit(s, card, cell.lane, cell.row);
      s.stats.summons++;
      ev.push({ t: "summon", id: u.id });
      break;
    }
  }
}

function doAbility(s: State, a: Extract<Action, { t: "ability" }>, ev: GameEvent[]): void {
  const u = unitById(s, a.id)!;
  if (u.kind === "wolf") {
    s.wolfActed = true;
    const f = firstEnemy(s, u.lane)!;
    if (a.ab === "bite") {
      ev.push({ t: "ability", id: u.id, name: "Bite" });
      s.stats.bites++;
      damage(s, f, 4, "Bite", ev, { armoured: true, reach: "wolf" });
    } else if (a.ab === "shove") {
      ev.push({ t: "ability", id: u.id, name: "Shove" });
      s.stats.wolfShoves++;
      s.cooldowns.shove = WOLF_COOLDOWN.shove + 1;
      forceMove(s, f, a.dir!, 0, 1, ev);
    } else if (a.ab === "guard") {
      ev.push({ t: "ability", id: u.id, name: "Guard" });
      s.stats.guards++;
      s.cooldowns.guard = WOLF_COOLDOWN.guard + 1;
      const h = hero(s);
      if (h) h.guard = GUARD;
    }
    return;
  }
  s.summonActed.push(u.id);
  if (a.ab === "bash") {
    const f = unitAt(s, u.lane, u.row + 1)!;
    ev.push({ t: "ability", id: u.id, name: "Bash" });
    damage(s, f, 3, "Bash", ev, { armoured: true, reach: "summon" });
    if (f.hp > 0 && s.opts.push && f.kind !== "warden") forceMove(s, f, 0, 1, 1, ev);
  } else if (a.ab === "ward") {
    ev.push({ t: "ability", id: u.id, name: "Ward" });
    s.ground[gi(a.cell!.lane, 0)].ward = true;
    ev.push({ t: "ground", lane: a.cell!.lane, row: 0 });
  }
}

// ---------------- enemy phase ------------------------------------------------------

export function endTurn(s: State): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.over) return ev;
  // enemies act, front row first, then left to right
  const order = s.units
    .filter((u) => u.side === "E")
    .sort((a, b) => a.row - b.row || a.lane - b.lane)
    .map((u) => u.id);
  for (const id of order) {
    const e = unitById(s, id);
    if (!e || e.hp <= 0 || s.over) continue;
    act(s, e, ev);
  }
  if (s.over) return ev;
  // ground ticks: fire and poison hurt whoever stands there
  for (const u of s.units.slice()) {
    if (u.hp <= 0) continue;
    const g = s.ground[gi(u.lane, u.row)];
    if (g.fire > 0)
      damage(s, u, g.blaze ? BLAZE : FIRE, g.blaze ? "blaze" : "fire", ev, { reach: "ground" });
    if (u.hp > 0 && g.poison > 0) damage(s, u, POISON, "poison", ev, { reach: "ground" });
    if (s.over === "loss") return ev;
  }
  for (const g of s.ground) {
    if (g.fire > 0 && --g.fire === 0) g.blaze = false;
    if (g.poison > 0) g.poison--;
    if (g.ice > 0) g.ice--;
    g.ward = false;
  }
  for (const u of s.units) u.guard = 0;
  // waves for the next round
  const waves: Wave[] = [];
  for (const w of s.waves) {
    if (w.round > s.round + 1) {
      waves.push(w);
      continue;
    }
    const left: Wave["spawns"] = [];
    for (const sp of w.spawns) {
      if (enemies(s).length >= MAX_FIELD) {
        left.push(sp);
        continue;
      }
      const lanes = [sp.lane, ...[0, 1, 2].filter((l) => l !== sp.lane)];
      let placed = false;
      for (const r of [ROWS, ROWS - 1])
        for (const l of lanes)
          if (!placed && !unitAt(s, l, r)) {
            const u = addUnit(s, sp.kind, l, r, s.hpBonus);
            ev.push({ t: "spawn", id: u.id });
            placed = true;
          }
      if (!placed) left.push(sp);
    }
    if (left.length) waves.push({ round: s.round + 2, spawns: left });
  }
  s.waves = waves;
  checkWin(s);
  if (s.over) return ev;
  s.round++;
  if (s.round > MAX_ROUNDS) {
    s.over = "loss";
    return ev;
  }
  // clutter bookkeeping
  const field = enemies(s).length;
  const groundCells = s.ground.filter(
    (g, i) => i >= LANES && (g.fire || g.oil || g.poison || g.ice),
  ).length;
  s.stats.maxField = Math.max(s.stats.maxField, field);
  if (field > MAX_FIELD || groundCells > 8) s.stats.clutterRounds++;
  // new player turn
  s.energy = ENERGY;
  s.wolfStepped = false;
  s.wolfActed = false;
  s.summonActed = [];
  s.turnDealt = false;
  s.turnDodged = false;
  for (const k of Object.keys(s.cooldowns)) if (s.cooldowns[k] > 0) s.cooldowns[k]--;
  drawHand(s);
  planAll(s);
  return ev;
}

function act(s: State, e: Unit, ev: GameEvent[]): void {
  const it = e.intent;
  e.ticks++;
  if (!it) return;
  if (it.t === "wait") {
    if (e.frozen && it.why === "frozen") e.frozen = false;
    return;
  }
  if (it.t === "move") {
    if (e.frozen) {
      e.frozen = false;
      ev.push({ t: "info", text: `${NAMES[e.kind]} is stuck in ice` });
      return;
    }
    for (const st of it.steps) {
      const nl = e.lane + st.dl,
        nr = e.row + st.dr;
      if (!inField(nl, nr) || nr < 1) break;
      const o = unitAt(s, nl, nr);
      if (o) {
        if (isSummon(o)) s.stats.blockedMoves++;
        break;
      }
      e.lane = nl;
      e.row = nr;
      ev.push({ t: "move", id: e.id, lane: nl, row: nr });
      const g = s.ground[gi(nl, nr)];
      if (g.ice > 0) {
        e.frozen = true;
        s.stats.iceStops++;
        break;
      }
    }
    return;
  }
  if (it.t === "attack") {
    const cells: Cell[] = it.cells
      .map((c) => ({ lane: e.lane + c.dl, row: e.row + c.dr }))
      .filter((c) => inField(c.lane, c.row));
    ev.push({ t: "attack", id: e.id, cells, name: it.name });
    let any = false;
    for (const c of cells) {
      const v = unitAt(s, c.lane, c.row);
      if (v && v.side === "P") {
        damage(s, v, it.dmg, it.name, ev, { enemyAttack: true });
        any = true;
        if (s.over) return;
      }
    }
    if (!any) ev.push({ t: "miss", id: e.id, name: it.name });
    return;
  }
  if (it.t === "shoot") {
    const v = shotVictim(s, e);
    ev.push({
      t: "attack",
      id: e.id,
      cells: [v ? { lane: v.lane, row: v.row } : { lane: e.lane, row: 0 }],
      name: it.name,
    });
    if (!v) {
      ev.push({ t: "miss", id: e.id, name: it.name });
      return;
    }
    if (isSummon(v)) s.stats.arrowsCaught++;
    damage(s, v, it.dmg, it.name, ev, { enemyAttack: true });
    return;
  }
  if (it.t === "lob") {
    ev.push({ t: "attack", id: e.id, cells: [it.cell], name: it.name });
    const v = unitAt(s, it.cell.lane, it.cell.row);
    if (v && v.side === "P") damage(s, v, it.dmg, it.name, ev, { enemyAttack: true });
    else ev.push({ t: "miss", id: e.id, name: it.name });
    const g = s.ground[gi(it.cell.lane, it.cell.row)];
    if (it.effect === "poison") g.poison = Math.max(g.poison, 2);
    else if (g.oil) ignite(s, it.cell.lane, it.cell.row, 2, ev);
    else g.fire = Math.max(g.fire, 2);
    ev.push({ t: "ground", lane: it.cell.lane, row: it.cell.row });
  }
}

// ---------------- enemy intents ----------------------------------------------------

export function planAll(s: State): void {
  for (const e of s.units) if (e.side === "E") e.intent = plan(s, e);
}

const DMG: Partial<Record<Kind, number>> = {
  ghoul: 6,
  spider: 4,
  warden: 5,
  spear: 5,
  archer: 4,
  priest: 3,
};

// Lane of the nearest line ally, preferring the hero on ties.
function nearestAllyLane(s: State, lane: number): number | null {
  let best: number | null = null;
  let bd = 99;
  for (const u of s.units) {
    if (u.side !== "P" || u.row !== 0) continue;
    const d = Math.abs(u.lane - lane) + (u.kind === "hero" ? 0 : 0.1);
    if (d < bd) {
      bd = d;
      best = u.lane;
    }
  }
  return best;
}

function shiftToward(s: State, e: Unit, target: number | null, why: string): Intent {
  if (target === null || target === e.lane) return { t: "wait", why };
  const dl = target > e.lane ? 1 : -1;
  if (unitAt(s, e.lane + dl, e.row)) return { t: "wait", why: "blocked" };
  return { t: "move", steps: [{ dl, dr: 0 }], why };
}

function plan(s: State, e: Unit): Intent {
  const ahead = (n: number) => unitAt(s, e.lane, e.row - n);
  const pAhead = (n: number) => {
    const u = ahead(n);
    return u && u.side === "P" ? u : undefined;
  };
  const name = (k: Kind) =>
    ({
      ghoul: "Claw",
      spider: "Bite",
      warden: "Shield Bash",
      spear: "Thrust",
      archer: "Arrow",
      priest: "Bile",
    })[k as "ghoul"] ?? "Hit";
  const dmg = DMG[e.kind] ?? 3;
  const frozenMove = (it: Intent): Intent =>
    it.t === "move" && e.frozen ? { t: "wait", why: "frozen" } : it;

  switch (e.kind) {
    case "ghoul":
    case "spider":
    case "warden": {
      const front = ahead(1);
      if (e.kind === "ghoul" && e.row === 1) {
        // a ghoul at the line cleaves its line cell and both cells beside it
        const cells = [-1, 0, 1]
          .filter((dl) => inField(e.lane + dl, 0))
          .map((dl) => ({ dl, dr: -1 }));
        if (cells.some((c) => unitAt(s, e.lane + c.dl, 0)?.side === "P"))
          return { t: "attack", cells, dmg, name: "Cleave" };
      }
      if (front && front.side === "P")
        return { t: "attack", cells: [{ dl: 0, dr: -1 }], dmg, name: name(e.kind) };
      if (e.row === 1) {
        // nobody on the line in this lane: claw a line cell beside it (hero first)
        let diag: number | null = null;
        for (const dl of [-1, 1]) {
          const u = unitAt(s, e.lane + dl, 0);
          if (u && u.side === "P" && (diag === null || u.kind === "hero")) diag = dl;
        }
        if (diag !== null)
          return { t: "attack", cells: [{ dl: diag, dr: -1 }], dmg, name: name(e.kind) };
        return frozenMove(shiftToward(s, e, nearestAllyLane(s, e.lane), "looks for a target"));
      }
      if (e.kind === "warden" && e.ticks % 2 === 1) return { t: "wait", why: "slow" };
      if (front) {
        // blocked by another enemy; a spider skitters around it diagonally
        if (e.kind === "spider") {
          for (const dl of [-1, 1]) {
            const l = e.lane + dl;
            if (l >= 0 && l < LANES && !unitAt(s, l, e.row - 1))
              return frozenMove({ t: "move", steps: [{ dl, dr: -1 }], why: "skitters around" });
          }
        }
        return { t: "wait", why: "blocked" };
      }
      if (e.kind === "spider") {
        const two = ahead(2);
        // around a summon two rows ahead
        if (two && two.side === "P" && isSummon(two) && e.row - 2 >= 1) {
          for (const dl of [-1, 1]) {
            const l = e.lane + dl;
            if (l >= 0 && l < LANES && !unitAt(s, l, e.row - 1))
              return frozenMove({
                t: "move",
                steps: [
                  { dl: 0, dr: -1 },
                  { dl, dr: 0 },
                ],
                why: "skitters around",
              });
          }
        }
        const steps =
          e.row >= 3
            ? [
                { dl: 0, dr: -1 },
                { dl: 0, dr: -1 },
              ]
            : [{ dl: 0, dr: -1 }];
        return frozenMove({ t: "move", steps });
      }
      return frozenMove({ t: "move", steps: [{ dl: 0, dr: -1 }] });
    }
    case "spear": {
      if (e.row <= 2 && (pAhead(1) || pAhead(2)))
        return {
          t: "attack",
          cells: [
            { dl: 0, dr: -1 },
            { dl: 0, dr: -2 },
          ],
          dmg,
          name: "Thrust",
        };
      if (e.row > 2) {
        if (!ahead(1)) return frozenMove({ t: "move", steps: [{ dl: 0, dr: -1 }] });
        if (pAhead(1) || pAhead(2))
          return {
            t: "attack",
            cells: [
              { dl: 0, dr: -1 },
              { dl: 0, dr: -2 },
            ],
            dmg,
            name: "Thrust",
          };
        return { t: "wait", why: "blocked" };
      }
      return frozenMove(shiftToward(s, e, nearestAllyLane(s, e.lane), "looks for a target"));
    }
    case "archer": {
      if (e.row === 1 && pAhead(1))
        return { t: "attack", cells: [{ dl: 0, dr: -1 }], dmg: 2, name: "Stab" };
      if (e.row <= 2 && !unitAt(s, e.lane, e.row + 1))
        return frozenMove({ t: "move", steps: [{ dl: 0, dr: 1 }], why: "backs off" });
      const v = shotVictim(s, e);
      // a blocked archer walks forward to row 3 looking for a gap
      if (v && isSummon(v) && e.row > 3 && !unitAt(s, e.lane, e.row - 1))
        return frozenMove({ t: "move", steps: [{ dl: 0, dr: -1 }], why: "closes in" });
      if (v) return { t: "shoot", dmg, name: "Aimed Shot" };
      return { t: "wait", why: "no target" };
    }
    case "priest": {
      if (e.row <= 3 && !unitAt(s, e.lane, e.row + 1) && e.row < ROWS)
        return frozenMove({ t: "move", steps: [{ dl: 0, dr: 1 }], why: "backs off" });
      const h = hero(s);
      if (!h) return { t: "wait", why: "no target" };
      const effect = e.ticks % 2 === 0 ? "poison" : "fire";
      return {
        t: "lob",
        cell: { lane: h.lane, row: 0 },
        dmg,
        effect,
        name: effect === "poison" ? "Bile" : "Fire Rain",
      };
    }
  }
  return { t: "wait", why: "" };
}

// ---------------- descriptions -----------------------------------------------------

export function describeIntent(s: State, e: Unit): string {
  const it = e.intent;
  if (!it) return "";
  switch (it.t) {
    case "move":
      if (e.frozen) return "stuck in ice";
      if (it.steps.some((x) => x.dr > 0)) return "backs off";
      if (it.steps.every((x) => x.dr === 0)) return "moves sideways";
      return it.why === "skitters around" ? "skitters around" : `advances ${it.steps.length}`;
    case "attack":
      return `${it.name} ${it.dmg}`;
    case "shoot": {
      const v = shotVictim(s, e);
      return `${it.name} ${it.dmg}${v && isSummon(v) ? " (blocked)" : ""}`;
    }
    case "lob":
      return `${it.name} ${it.dmg} + ${it.effect}`;
    case "wait":
      return it.why === "frozen" ? "stuck in ice" : it.why === "slow" ? "braces" : "waits";
  }
}

// A compact signature of a state for "distinct outcome" counting.
export function outcomeKey(s: State, positions = true): string {
  const u = s.units
    .map((x) => `${x.id}:${Math.ceil(x.hp / 2)}${positions ? `@${x.lane}${x.row}` : ""}`)
    .join(",");
  if (!positions) return `${s.over}|${u}`;
  const g = s.ground
    .map((c) => `${c.fire}${c.blaze ? "b" : ""}${c.oil ? "o" : ""}${c.ice}${c.poison}`)
    .join("");
  return `${s.over}|${u}|${g}`;
}

// Full state hash for preview/replay checks (excludes the hand and deck).
export function stateHash(s: State): string {
  return (
    outcomeKey(s) +
    "|" +
    s.units.map((u) => `${u.hp}${u.frozen ? "f" : ""}${JSON.stringify(u.intent)}`).join(";") +
    `|${s.round}|${s.waves.length}`
  );
}

// Ground at a cell (for the view).
export const groundAt = (s: State, lane: number, row: number) => s.ground[gi(lane, row)];
