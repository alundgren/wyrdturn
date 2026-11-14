// Fights in real generated rooms. boardFromRoom() turns one room of an e11-style level into a
// board: the room's floor, its doors and two tiles of corridor behind each door. Hand-made
// fights place enemies and props at fractions of the room, so they survive any room size;
// generated fights spend a budget on enemies by difficulty.

import { generate, isFloor, type Level, type Room } from "./levelgen.ts";
import { rng } from "./rng.ts";
import {
  DIRS,
  add,
  key,
  manhattan,
  newFight,
  type Board,
  type EnemyKind,
  type Pos,
  type Reinforcement,
  type Setup,
  type State,
} from "./combat.ts";

export const LEVEL_OPTS = { minSize: 5, maxSize: 7, rooms: 6, pillarChance: 0.6 };

const inRect = (r: Board["room"], p: Pos) =>
  p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

/** Combat rooms of a level that are big enough for a fight, biggest first. */
export function fightRooms(lvl: Level): Room[] {
  return lvl.rooms
    .filter((r) => r.role === "combat" && r.x1 - r.x0 >= 3 && r.y1 - r.y0 >= 3)
    .sort(
      (a, b) =>
        (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1) ||
        a.id - b.id,
    );
}

export function boardFromRoom(lvl: Level, src: Room): Board {
  const g = lvl.grid;
  // two corridors can share a door tile: keep each door once
  const doors = src.doors.filter(
    (d, i) => src.doors.findIndex((e) => e.x === d.x && e.y === d.y) === i,
  );
  const room = { ...src, doors };
  const rect = { x0: room.x0, y0: room.y0, x1: room.x1, y1: room.y1 };
  const cells = new Set<string>();
  const pillars: Pos[] = [];
  for (let y = room.y0; y <= room.y1; y++)
    for (let x = room.x0; x <= room.x1; x++) {
      cells.add(key({ x, y }));
      if (g[y][x] === "P") pillars.push({ x, y });
    }
  // doors and up to two corridor tiles behind each
  const outside = (d: Pos): Pos => {
    for (const dd of DIRS) {
      const n = add(d, dd);
      if (isFloor(g[n.y]?.[n.x]) && !inRect(rect, n)) return n;
    }
    return d;
  };
  const ends: Pos[] = [];
  for (const d of room.doors) {
    cells.add(key(d));
    let prev = d,
      cur = outside(d),
      end = d;
    for (let i = 0; i < 2 && !(cur.x === prev.x && cur.y === prev.y); i++) {
      if (!isFloor(g[cur.y]?.[cur.x]) || inRect(rect, cur)) break;
      cells.add(key(cur));
      end = cur;
      const next = DIRS.map((dd) => add(cur, dd)).find(
        (n) =>
          isFloor(g[n.y]?.[n.x]) &&
          !(n.x === prev.x && n.y === prev.y) &&
          !cells.has(key(n)) &&
          !inRect(rect, n),
      );
      prev = cur;
      if (!next) break;
      cur = next;
    }
    ends.push(end);
  }
  // entry: the door closest to the level start (where the party walks in from)
  const order = room.doors
    .map((d, i) => ({ d, i, dist: manhattan(d, lvl.start) }))
    .sort((a, b) => a.dist - b.dist);
  const entryIdx = order[0].i;
  const entry = room.doors[entryIdx];
  const spawns = ends.filter((_, i) => i !== entryIdx);
  return {
    grid: g,
    room: rect,
    theme: room.theme ?? "crypt",
    cells: [...cells],
    pillars,
    doors: room.doors.map((d) => ({ ...d })),
    entry: { ...entry },
    entryOutside: outside(entry),
    spawns: spawns.length ? spawns : [ends[entryIdx]],
  };
}

// ---------------- hand-made fights -------------------------------------------------

export interface FightDef {
  name: string;
  note: string;
  seed: number;
  /** Index into fightRooms(level). */
  room: number;
  enemies: [EnemyKind, number, number][];
  braziers: [number, number][];
  oil?: [number, number][];
  rubble?: [number, number][];
  reinforcements?: Reinforcement[];
}

/** Rising difficulty. Positions are [depth, across] fractions of the room: depth 0 is the
 * entry wall, 1 the far wall. Each one snaps to the nearest free tile; enemies stay at
 * least 3 steps from the entry door. */
export const FIGHTS: FightDef[] = [
  {
    name: "Gnawed Hall",
    note: "Brute and a skitter. Learn intents and the brazier.",
    seed: 11,
    room: 0,
    enemies: [
      ["brute", 0.7, 0.4],
      ["skitter", 0.9, 0.9],
    ],
    braziers: [[0.75, 0.15]],
  },
  {
    name: "Arrow Gallery",
    note: "Two archers behind a brute. Close the gap or block the lines.",
    seed: 23,
    room: 0,
    enemies: [
      ["brute", 0.55, 0.5],
      ["archer", 0.95, 0.1],
      ["archer", 0.95, 0.9],
    ],
    braziers: [[0.6, 0.95]],
    rubble: [[0.4, 0.3]],
  },
  {
    name: "Rot Garden",
    note: "A hexer fills the room with poison; oil waits next to a brazier.",
    seed: 37,
    room: 0,
    enemies: [
      ["hexer", 0.9, 0.5],
      ["brute", 0.6, 0.2],
      ["skitter", 0.6, 0.9],
    ],
    braziers: [[0.4, 0.5]],
    oil: [
      [0.55, 0.5],
      [0.7, 0.5],
      [0.7, 0.35],
    ],
  },
  {
    name: "Shield Wall",
    note: "Two shieldbearers guard an archer. Armour faces you: flank, push or burn.",
    seed: 41,
    room: 0,
    enemies: [
      ["guard", 0.6, 0.35],
      ["guard", 0.6, 0.7],
      ["archer", 0.95, 0.5],
    ],
    braziers: [[0.85, 0.1]],
    oil: [
      [0.6, 0.5],
      [0.75, 0.5],
    ],
  },
  {
    name: "The Nest",
    note: "Skitters swarm, more come through the far door. Hold the doorway.",
    seed: 53,
    room: 0,
    enemies: [
      ["skitter", 0.8, 0.2],
      ["skitter", 0.9, 0.6],
      ["skitter", 0.7, 0.9],
      ["hexer", 1, 1],
    ],
    braziers: [[0.5, 0.5]],
    reinforcements: [
      { round: 3, kind: "skitter", spawn: 0 },
      { round: 5, kind: "skitter", spawn: 0 },
    ],
  },
  {
    name: "Crossroads",
    note: "Every role at once, a brute arrives on round 4.",
    seed: 67,
    room: 0,
    enemies: [
      ["guard", 0.55, 0.5],
      ["brute", 0.75, 0.15],
      ["archer", 1, 0.85],
      ["hexer", 0.95, 0.4],
    ],
    braziers: [
      [0.3, 0.05],
      [0.8, 0.95],
    ],
    oil: [[0.6, 0.2]],
    reinforcements: [{ round: 4, kind: "brute", spawn: 0 }],
  },
  {
    name: "Deep Crypt",
    note: "The hardest room: two brutes, a guard, ranged support and two waves.",
    seed: 79,
    room: 0,
    enemies: [
      ["guard", 0.55, 0.5],
      ["brute", 0.75, 0.15],
      ["brute", 0.75, 0.85],
      ["archer", 1, 0.3],
      ["hexer", 1, 0.75],
    ],
    braziers: [
      [0.35, 0.1],
      [0.35, 0.9],
    ],
    oil: [
      [0.55, 0.3],
      [0.55, 0.7],
    ],
    reinforcements: [
      { round: 3, kind: "skitter", spawn: 0 },
      { round: 5, kind: "archer", spawn: 1 },
    ],
  },
];

/** Where the party stands relative to the room: fractions run from the entry wall (0)
 * to the far wall (1) along the depth axis, and across it for the other axis. */
function placeFrac(board: Board, fd: number, fa: number): Pos {
  const r = board.room;
  const inward = DIRS.findIndex((d) => {
    const n = add(board.entry, d);
    return inRect(r, n);
  });
  const w = r.x1 - r.x0,
    h = r.y1 - r.y0;
  switch (inward) {
    case 0: // entry on the south wall, depth runs north
      return { x: r.x0 + Math.round(fa * w), y: r.y1 - Math.round(fd * h) };
    case 1: // entry west, depth runs east
      return { x: r.x0 + Math.round(fd * w), y: r.y0 + Math.round(fa * h) };
    case 2: // entry north, depth runs south
      return { x: r.x1 - Math.round(fa * w), y: r.y0 + Math.round(fd * h) };
    default: // entry east, depth runs west
      return { x: r.x1 - Math.round(fd * w), y: r.y1 - Math.round(fa * h) };
  }
}

function snap(board: Board, want: Pos, taken: Set<string>, minFromEntry: number): Pos | null {
  const pill = new Set(board.pillars.map(key));
  let best: Pos | null = null,
    bd = Infinity;
  for (const k of board.cells) {
    const [x, y] = k.split(",").map(Number);
    const p = { x, y };
    if (!inRect(board.room, p) || pill.has(k) || taken.has(k)) continue;
    if (manhattan(p, board.entry) < minFromEntry) continue;
    const d = manhattan(p, want) + (Math.abs(p.x - want.x) + Math.abs(p.y - want.y)) * 0.01;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Checks the board is one connected area after props and rubble are placed. */
export function connected(board: Board, blocked: Pos[]): boolean {
  const bad = new Set([...board.pillars, ...blocked].map(key));
  const open = board.cells.filter((k) => !bad.has(k));
  if (!open.length) return false;
  const all = new Set(open);
  const seen = new Set([open[0]]);
  const q = [open[0]];
  while (q.length) {
    const [x, y] = q.shift()!.split(",").map(Number);
    for (const d of DIRS) {
      const k = key({ x: x + d.x, y: y + d.y });
      if (all.has(k) && !seen.has(k)) {
        seen.add(k);
        q.push(k);
      }
    }
  }
  return seen.size === all.size;
}

export function setupFromDef(def: FightDef): Setup {
  const lvl = generate(def.seed, LEVEL_OPTS);
  const rooms = fightRooms(lvl);
  return place(def, boardFromRoom(lvl, rooms[def.room % rooms.length]));
}

export function handmade(i: number): State {
  return newFight(setupFromDef(FIGHTS[i]));
}

// ---------------- generator --------------------------------------------------------

export const COST: Record<EnemyKind, number> = {
  brute: 3,
  archer: 3,
  hexer: 4,
  skitter: 2,
  guard: 4,
};

/** A generated fight. Difficulty 1..5 sets the budget (6 + 2 per level), the enemy cap
 * and whether reinforcements come. */
export function generated(seed: number, difficulty = 1 + (seed % 5)): Setup {
  const r = rng(seed * 977 + 13);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const lvl = generate(seed, LEVEL_OPTS);
  const rooms = fightRooms(lvl);
  const room = rooms[Math.floor(r() * Math.min(2, rooms.length))];
  const board = boardFromRoom(lvl, room);
  const kinds: EnemyKind[] = ["brute", "archer", "hexer", "skitter", "guard"];
  let budget = 10 + 2 * difficulty;
  const maxEnemies = Math.min(6, 3 + Math.ceil(difficulty / 2));
  const list: EnemyKind[] = [];
  while (list.length < maxEnemies) {
    const ok = kinds.filter((k) => COST[k] <= budget);
    if (!ok.length) break;
    const k = pick(ok);
    list.push(k);
    budget -= COST[k];
  }
  const def: FightDef = {
    name: `Generated ${seed}`,
    note: `difficulty ${difficulty}`,
    seed,
    room: 0,
    enemies: list.map((k) => [k, 0.45 + r() * 0.55, r()]),
    braziers: Array.from(
      { length: 1 + Math.floor(r() * 2) },
      () => [0.2 + r() * 0.8, r()] as [number, number],
    ),
    rubble: r() < 0.5 ? [[0.3 + r() * 0.5, r()]] : [],
    oil:
      r() < 0.5
        ? (() => {
            const a = 0.3 + r() * 0.6,
              b = r();
            return [
              [a, b],
              [a + 0.15, b],
            ] as [number, number][];
          })()
        : [],
    reinforcements:
      difficulty >= 3
        ? [{ round: 2 + Math.floor(r() * 3), kind: pick(kinds), spawn: Math.floor(r() * 3) }]
        : [],
  };
  return place(def, board);
}

/** Put the fight's props and enemies on the board. */
function place(def: FightDef, board: Board): Setup {
  const taken = new Set<string>();
  const inward = DIRS.find((d) => inRect(board.room, add(board.entry, d)))!;
  const heroAt = add(board.entry, inward);
  taken.add(key(heroAt));
  for (const d of DIRS) taken.add(key(add(heroAt, d)));
  const at = (fd: number, fa: number, minEntry: number) => {
    const p = snap(board, placeFrac(board, fd, fa), taken, minEntry);
    if (p) taken.add(key(p));
    return p;
  };
  const rubble: Pos[] = [];
  for (const [a, b] of def.rubble ?? []) {
    const p = at(a, b, 2);
    if (p && connected(board, [...rubble, p])) rubble.push(p);
  }
  board.pillars.push(...rubble);
  const braziers: Pos[] = [];
  for (const [a, b] of def.braziers) {
    const p = at(a, b, 2);
    if (p && connected(board, [...braziers, p])) braziers.push(p);
  }
  const enemies = def.enemies.flatMap(([kind, a, b]) => {
    const p = at(a, b, 3);
    return p ? [{ kind, x: p.x, y: p.y }] : [];
  });
  const oil = (def.oil ?? []).flatMap(([a, b]) => {
    const p = snap(board, placeFrac(board, Math.min(1, a), b), new Set(), 1);
    return p ? [p] : [];
  });
  return {
    board,
    enemies,
    braziers,
    oil,
    reinforcements: def.reinforcements,
    seed: def.seed * 7 + 1,
  };
}

export function generatedFight(seed: number, difficulty?: number): State {
  return newFight(generated(seed, difficulty));
}
