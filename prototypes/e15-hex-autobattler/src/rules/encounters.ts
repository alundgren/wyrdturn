// Arenas and fights. A fight starts in a real room from the e11/e13 level generator
// (levelgen.ts). The room is not turned into hexes tile by tile: every arena is the same
// 7 x 6 hex template, and the room only supplies its identity: which wall you enter from
// and where the door sits, its pillar, and an exit door that becomes a brazier. The
// `source` text says how each feature was mapped, so the view can show the conversion.
//
// Six hand-made fights (research section 7) and a seeded generator with five difficulty
// budgets, role families, mirrored and shifted formations, rooms without hazards, and a
// validator that rejects unfair setups (rejection reasons are counted for the metrics).

import { generate as genLevel, type Level, type Room } from "./levelgen.ts";
import { rng } from "./rng.ts";
import { CELLS, COLS, ROWS, type Cell, cellName, cellOf, colOf, neighbors, rowOf } from "./hex.ts";
import {
  type Arena,
  type EnemyKind,
  type FightSetup,
  cardBlocked,
  newFight,
  threats,
} from "./combat.ts";

export const LEVEL_OPTS = { minSize: 5, maxSize: 7, rooms: 6, pillarChance: 0.6 };
export const CORNERS: Cell[] = [
  cellOf(0, 0),
  cellOf(COLS - 1, 0),
  cellOf(0, ROWS - 1),
  cellOf(COLS - 1, ROWS - 1),
];

export function fightRooms(lvl: Level): Room[] {
  return lvl.rooms
    .filter((r) => r.role === "combat" && r.x1 - r.x0 >= 3 && r.y1 - r.y0 >= 3)
    .sort(
      (a, b) =>
        (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1) ||
        a.id - b.id,
    );
}

type WallSide = "west" | "east" | "north" | "south";
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export interface ArenaOpts {
  /** Hand-made fights may move the pillar ([col, row]) or drop it (null). */
  pillar?: [number, number] | null;
  rubble?: [number, number][];
  mirror?: boolean;
}

/** Turn a generated room into the hex template. */
export function arenaFromRoom(lvl: Level, room: Room, o: ArenaOpts = {}): Arena {
  const w = room.x1 - room.x0 + 1,
    h = room.y1 - room.y0 + 1;
  const doors = room.doors.filter(
    (d, i) => room.doors.findIndex((e) => e.x === d.x && e.y === d.y) === i,
  );
  const sideOf = (d: { x: number; y: number }): WallSide =>
    d.x < room.x0 ? "west" : d.x > room.x1 ? "east" : d.y < room.y0 ? "north" : "south";
  const entry = [...doors].sort(
    (a, b) =>
      Math.abs(a.x - lvl.start.x) +
      Math.abs(a.y - lvl.start.y) -
      (Math.abs(b.x - lvl.start.x) + Math.abs(b.y - lvl.start.y)),
  )[0];
  const side = sideOf(entry);
  // (u, v): u = depth from the entry wall (0..1), v = across it (0 = left of the door as you enter... top of the board)
  const frame = (x: number, y: number): [number, number] => {
    const fx = (clamp(x, room.x0, room.x1) - room.x0) / Math.max(1, w - 1);
    const fy = (clamp(y, room.y0, room.y1) - room.y0) / Math.max(1, h - 1);
    switch (side) {
      case "west":
        return [fx, fy];
      case "east":
        return [1 - fx, 1 - fy];
      case "north":
        return [fy, 1 - fx];
      case "south":
        return [1 - fy, fx];
    }
  };
  const flip = (r: number) => (o.mirror ? ROWS - 1 - r : r);
  const [, dv] = frame(entry.x, entry.y);
  const doorRow = flip(clamp(Math.round(dv * (ROWS - 1)), 1, ROWS - 2));
  const blocked = Array<boolean>(CELLS).fill(false);
  for (const c of CORNERS) blocked[c] = true;
  const notes: string[] = [
    `level ${lvl.seed} room ${room.id}: ${w}x${h} tiles, entry door on the ${side} wall → door at row ${doorRow + 1} on the left edge`,
  ];
  const pillars: Cell[] = [];
  let pillar: [number, number] | null = null;
  if (o.pillar !== undefined) {
    pillar = o.pillar;
    if (pillar)
      notes.push(`pillar placed by the fight at ${cellName(cellOf(pillar[0], pillar[1]))}`);
  } else if (room.pillar) {
    const [pu, pv] = frame(room.pillar.x, room.pillar.y);
    pillar = [2 + Math.round(pu * 2), clamp(Math.round(pv * (ROWS - 1)), 1, ROWS - 2)];
    notes.push(
      `pillar at tile (${room.pillar.x - room.x0},${room.pillar.y - room.y0}) → hex ${cellName(cellOf(pillar[0], flip(pillar[1])))}`,
    );
  } else notes.push("no pillar in the room");
  if (pillar) {
    const c = cellOf(pillar[0], flip(pillar[1]));
    blocked[c] = true;
    pillars.push(c);
  }
  for (const [c, r] of o.rubble ?? []) {
    const x = cellOf(c, flip(r));
    blocked[x] = true;
    pillars.push(x);
  }
  if (o.rubble?.length) notes.push(`${o.rubble.length} rubble hexes added by the fight`);
  // the exit door farthest from the entry becomes the right-edge door; a brazier stands by it
  const exits = doors.filter((d) => d !== entry).map((d) => ({ d, f: frame(d.x, d.y) }));
  exits.sort((a, b) => b.f[0] - a.f[0] || a.f[1] - b.f[1]);
  let exitRow: number | null = null;
  const braziers: Cell[] = [];
  const top = exits.length ? exits[0].f[1] < 0.5 : room.id % 2 === 0;
  if (exits.length) exitRow = flip(clamp(Math.round(exits[0].f[1] * (ROWS - 1)), 1, ROWS - 2));
  let bz = cellOf(3 + (room.id % 2), flip(top ? 0 : ROWS - 1));
  if (blocked[bz]) bz = cellOf(2, flip(top ? 0 : ROWS - 1));
  blocked[bz] = true;
  braziers.push(bz);
  notes.push(
    exits.length
      ? `exit door (${sideOf(exits[0].d)} wall) → door at row ${exitRow! + 1} on the right edge; its brazier → hex ${cellName(bz)}`
      : `no exit door; brazier → hex ${cellName(bz)}`,
  );
  if (o.mirror) notes.push("formation mirrored top to bottom");
  const entryCells: Cell[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < 2; c++) entryCells.push(cellOf(c, r));
  return {
    blocked,
    braziers,
    pillars,
    entry: entryCells.filter((c) => !blocked[c]),
    doorRow,
    exitRow,
    source: notes.join("; "),
    theme: room.theme ?? "crypt",
  };
}

export function arenaFor(levelSeed: number, roomIndex: number, o: ArenaOpts = {}): Arena {
  const lvl = genLevel(levelSeed, LEVEL_OPTS);
  const rooms = fightRooms(lvl);
  return arenaFromRoom(lvl, rooms[roomIndex % rooms.length], o);
}

// ---------------- hand-made fights --------------------------------------------------

interface Authored {
  name: string;
  note: string;
  level: number;
  room: number;
  arena?: ArenaOpts;
  enemies: [EnemyKind, number, number][];
  oil?: [number, number][];
  poison?: [number, number, number][];
  fire?: [number, number][];
  tutorial?: boolean;
  difficulty: number;
  family: string;
}

/** Rising difficulty. Cells are [col, row], col 0-1 is your entry side. */
const AUTHORED: Authored[] = [
  {
    name: "Bone Gate",
    note: "Introduction: a brute walks in, an archer covers it. Watch the wolf pick a target.",
    level: 11,
    room: 0,
    arena: { pillar: null },
    enemies: [
      ["brute", 4, 2],
      ["archer", 6, 3],
    ],
    tutorial: true,
    difficulty: 1,
    family: "intro",
  },
  {
    name: "Arrow Slit",
    note: "Two archers shoot from behind a pillar. Their rays are straight: step off the line or pull them out.",
    level: 23,
    room: 0,
    arena: { pillar: [4, 2], rubble: [[4, 3]] },
    enemies: [
      ["archer", 5, 2],
      ["archer", 6, 4],
      ["brute", 3, 3],
    ],
    difficulty: 2,
    family: "ranged",
  },
  {
    name: "Oil Gate",
    note: "A chokepoint with oil on the floor. Brutes must come through it; one firebolt turns it into a blaze.",
    level: 37,
    room: 0,
    arena: {
      pillar: [3, 1],
      rubble: [
        [3, 0],
        [3, 4],
        [3, 5],
      ],
    },
    enemies: [
      ["brute", 5, 2],
      ["brute", 5, 3],
      ["guard", 6, 2],
    ],
    oil: [
      [3, 2],
      [3, 3],
      [4, 2],
    ],
    difficulty: 3,
    family: "rush",
  },
  {
    name: "Bile Pit",
    note: "Two hexers curse wherever you stand and leave poison behind. Keep moving or kill them fast.",
    level: 41,
    room: 0,
    enemies: [
      ["hexer", 6, 1],
      ["hexer", 6, 4],
      ["skitter", 4, 3],
    ],
    poison: [
      [2, 2, 3],
      [3, 3, 3],
    ],
    difficulty: 3,
    family: "casters",
  },
  {
    name: "Skitter Nest",
    note: "Skitters bite lone targets for 5. Keep the squad together, or give them a target you want them to hit.",
    level: 53,
    room: 0,
    enemies: [
      ["skitter", 4, 0],
      ["skitter", 5, 5],
      ["skitter", 6, 2],
      ["archer", 6, 3],
    ],
    difficulty: 4,
    family: "flank",
  },
  {
    name: "Warden's Rite",
    note: "A guard shields the line (2 less from the front), a hexer and an archer behind it. Flank the guard.",
    level: 67,
    room: 0,
    enemies: [
      ["guard", 4, 2],
      ["brute", 4, 4],
      ["hexer", 6, 2],
      ["archer", 6, 3],
    ],
    oil: [
      [3, 2],
      [3, 3],
    ],
    difficulty: 5,
    family: "mixed",
  },
];

export const FIGHT_NAMES = AUTHORED.map((a) => a.name);

function fromAuthored(a: Authored): FightSetup {
  const arena = arenaFor(a.level, a.room, a.arena);
  const at = (c: number, r: number) => cellOf(c, r);
  const ground: FightSetup["ground"] = [];
  for (const [c, r] of a.oil ?? []) ground.push({ cell: at(c, r), oil: 3 });
  for (const [c, r, t] of a.poison ?? []) ground.push({ cell: at(c, r), poison: t });
  for (const [c, r] of a.fire ?? []) ground.push({ cell: at(c, r), fire: 2 });
  for (const g of ground) if (arena.blocked[g.cell]) throw new Error(`${a.name}: ground on a wall`);
  const enemies = a.enemies.map(([kind, c, r]) => ({ kind, cell: at(c, r) }));
  for (const e of enemies) if (arena.blocked[e.cell]) throw new Error(`${a.name}: enemy on a wall`);
  return {
    name: a.name,
    note: a.note,
    arena,
    enemies,
    ground,
    tutorial: a.tutorial,
    difficulty: a.difficulty,
    family: a.family,
  };
}

export function authored(i: number): FightSetup {
  return fromAuthored(AUTHORED[i]);
}
export const AUTHORED_COUNT = AUTHORED.length;

// ---------------- generator ---------------------------------------------------------

export const COST: Record<EnemyKind, number> = {
  brute: 3,
  archer: 3,
  hexer: 3,
  skitter: 2,
  guard: 4,
};
export const FAMILIES: Record<string, EnemyKind[]> = {
  rush: ["brute", "skitter", "guard", "brute"],
  ranged: ["archer", "hexer", "brute", "archer"],
  casters: ["hexer", "guard", "archer", "hexer"],
  flank: ["skitter", "archer", "skitter", "brute"],
  mixed: ["brute", "archer", "hexer", "skitter", "guard"],
};
export const FAMILY_NAMES = Object.keys(FAMILIES);
export const HP_BONUS = 2;
export const budget = (d: number) => 8 + 5 * d;

export interface GenOpts {
  mirror?: boolean;
  /** Move the whole enemy formation this many rows (cells that would hit a wall stay). */
  shift?: number;
  noHazards?: boolean;
  family?: string;
}

/** Why generated setups were rejected (for the metrics). */
export const rejections: Record<string, number> = {};

export function generate(seed: number, difficulty = 1 + (seed % 5), o: GenOpts = {}): FightSetup {
  for (let attempt = 0; attempt < 60; attempt++) {
    const s = tryGenerate(seed, attempt, difficulty, o);
    const why = validateSetup(s, seed);
    if (!why) return s;
    rejections[why] = (rejections[why] ?? 0) + 1;
  }
  throw new Error(`generate: no valid fight for seed ${seed}`);
}

function tryGenerate(seed: number, attempt: number, d: number, o: GenOpts): FightSetup {
  const r = rng(seed * 7919 + attempt * 104729 + d);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const family = o.family ?? FAMILY_NAMES[(seed + Math.floor(seed / 5)) % FAMILY_NAMES.length];
  const arena = arenaFor(1000 + seed, ri(0, 3), { mirror: o.mirror });
  const kinds = FAMILIES[family];
  let money = budget(d);
  const picked: EnemyKind[] = [];
  while (picked.length < 6) {
    const options = kinds.filter((k) => COST[k] <= money);
    if (!options.length) break;
    const k = options[Math.floor(r() * options.length)];
    picked.push(k);
    money -= COST[k];
  }
  const taken = new Set<Cell>();
  const flip = (row: number) => (o.mirror ? ROWS - 1 - row : row);
  const enemies: FightSetup["enemies"] = [];
  for (const k of picked) {
    const melee = k === "brute" || k === "guard" || k === "skitter";
    for (let t = 0; t < 40; t++) {
      const c = melee ? ri(3, 5) : ri(5, 6);
      const row = flip(ri(0, ROWS - 1));
      let cell = cellOf(c, row);
      const sh = o.shift ?? 0;
      if (sh) {
        const moved = cellOf(c, row + sh);
        if (moved >= 0 && !arena.blocked[moved] && !taken.has(moved)) cell = moved;
      }
      if (arena.blocked[cell] || taken.has(cell)) continue;
      taken.add(cell);
      enemies.push({ kind: k, cell });
      break;
    }
  }
  const ground: NonNullable<FightSetup["ground"]> = [];
  const noHaz = o.noHazards ?? seed % 6 === 0;
  if (!noHaz) {
    const features = ri(0, 2);
    for (let f = 0; f < features; f++) {
      const kind = ri(0, 4);
      const c0 = cellOf(ri(2, 4), flip(ri(1, ROWS - 2)));
      if (arena.blocked[c0] || taken.has(c0)) continue;
      const cells = [
        c0,
        ...neighbors(c0)
          .filter((n) => !arena.blocked[n] && !taken.has(n))
          .slice(0, kind < 3 ? 2 : 1),
      ];
      for (const c of cells) {
        if (ground.some((g) => g.cell === c)) continue;
        if (kind < 3) ground.push({ cell: c, oil: 3 });
        else if (kind === 3) ground.push({ cell: c, poison: 2 });
        else ground.push({ cell: c, fire: 2 });
      }
    }
  }
  return {
    name: `Generated ${seed} (${family}, difficulty ${d}${o.mirror ? ", mirrored" : ""}${o.shift ? `, shifted ${o.shift}` : ""})`,
    note: `Budget ${budget(d)}: ${picked.join(", ")}`,
    arena,
    enemies,
    ground,
    difficulty: d,
    family,
    mirrored: o.mirror,
    hpBonus: HP_BONUS * (d - 1),
  };
}

/** Reachable from the entry columns without crossing walls (units ignored). */
export function reachable(a: Arena): Set<Cell> {
  const seen = new Set<Cell>(a.entry);
  const q = [...a.entry];
  while (q.length) {
    const c = q.shift()!;
    for (const n of neighbors(c))
      if (!a.blocked[n] && !seen.has(n)) {
        seen.add(n);
        q.push(n);
      }
  }
  return seen;
}

/** Empty string when the setup is fair, else the first reason it is not. */
export function validateSetup(s: FightSetup, seed: number): string {
  const a = s.arena;
  if (a.entry.length < 6) return "deployment space";
  if (s.enemies.length < 1) return "no enemies";
  if (s.enemies.some((e) => colOf(e.cell) < 2)) return "enemy in the entry zone";
  const reach = reachable(a);
  if (s.enemies.some((e) => !reach.has(e.cell))) return "disconnected";
  const hz = (s.ground ?? []).length;
  if (hz > 6) return "hazard budget";
  const st = newFight(s, seed);
  const opening = threats(st).filter((t) => t.cells.some((c) => a.entry.includes(c)));
  if (opening.reduce((x, t) => x + t.damage, 0) > 10) return "opening damage";
  if (!st.hand.some((c) => !cardBlocked(st, c))) return "no affordable response";
  void rowOf;
  return "";
}
