// Room layout part of the e11 level generator (prototypes/e11-combat/src/levelgen.js),
// ported to TypeScript. Same steps and the same seeded numbers: place rooms -> connect
// (spanning tree + a few loops) -> carve corridors with single-tile doors -> pick start
// and depth -> theme and pillar per room -> validate.
// Left out: e11's enemy budget, rest shrine and lock and key. Fights here are set up by
// encounters.ts, which picks one generated room and turns it into a board.

import { rng } from "./rng.ts";

export interface Door {
  x: number;
  y: number;
}
export interface Room {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  doors: Door[];
  depth: number;
  role: "start" | "combat";
  theme: Theme | null;
  pillar?: { x: number; y: number };
}
export type Theme = "crypt" | "forge" | "moss" | "bone";
export interface Level {
  seed: number;
  attempt: number;
  grid: string[][];
  rooms: Room[];
  start: { x: number; y: number };
  checks: Checks;
}
export interface Checks {
  ok: boolean;
  problems: string[];
  floor: number;
}

export const DEFAULTS = {
  width: 35,
  height: 25,
  rooms: 7,
  minSize: 3,
  maxSize: 6,
  extraLoops: 1,
  pillarChance: 0.5,
};
export type GenOptions = Partial<typeof DEFAULTS>;

export function generate(seed: number, opts: GenOptions = {}): Level {
  const o = { ...DEFAULTS, ...opts };
  for (let attempt = 0; attempt < 200; attempt++) {
    const lvl = tryGenerate(seed * 101 + attempt, o);
    if (!lvl) continue;
    const full: Level = { ...lvl, seed, attempt, checks: { ok: true, problems: [], floor: 0 } };
    full.checks = validate(full);
    if (full.checks.ok) return full;
  }
  throw new Error(`levelgen: no valid level for seed ${seed}`);
}

type Opts = typeof DEFAULTS;
const THEMES: (Theme | null)[] = ["crypt", "forge", "moss", "bone", null];

function tryGenerate(s: number, o: Opts): Omit<Level, "seed" | "attempt" | "checks"> | null {
  const r = rng(s);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const W = o.width,
    H = o.height;
  const g: string[][] = Array.from({ length: H }, () => Array<string>(W).fill("#"));
  // rooms (interior rects), 2-tile gap so walls between rooms stay solid
  const rooms: Room[] = [];
  for (let tries = 0; tries < 400 && rooms.length < o.rooms; tries++) {
    const w = ri(o.minSize, o.maxSize),
      h = ri(o.minSize, o.maxSize);
    const x0 = ri(1, W - w - 2),
      y0 = ri(1, H - h - 2);
    const rect = { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
    if (
      rooms.some(
        (q) =>
          rect.x0 - 2 <= q.x1 && rect.x1 + 2 >= q.x0 && rect.y0 - 2 <= q.y1 && rect.y1 + 2 >= q.y0,
      )
    )
      continue;
    rooms.push({ ...rect, id: rooms.length + 1, doors: [], depth: 0, role: "combat", theme: null });
  }
  if (rooms.length < Math.min(4, o.rooms)) return null;
  for (const q of rooms)
    for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) g[y][x] = ".";
  const cx = (q: Room) => Math.floor((q.x0 + q.x1) / 2),
    cy = (q: Room) => Math.floor((q.y0 + q.y1) / 2);
  // connections: Prim's MST on centre distance, plus a few extra loops
  const dist = (a: Room, b: Room) => Math.abs(cx(a) - cx(b)) + Math.abs(cy(a) - cy(b));
  const edges: [number, number][] = [];
  const inTree = new Set([0]);
  while (inTree.size < rooms.length) {
    let best: { i: number; j: number; d: number } | null = null;
    for (const i of inTree)
      for (let j = 0; j < rooms.length; j++)
        if (!inTree.has(j)) {
          const d = dist(rooms[i], rooms[j]);
          if (!best || d < best.d) best = { i, j, d };
        }
    if (!best) return null;
    edges.push([best.i, best.j]);
    inTree.add(best.j);
  }
  for (let k = 0; k < o.extraLoops; k++) {
    const i = ri(0, rooms.length - 1),
      j = ri(0, rooms.length - 1);
    if (i !== j && !edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i)))
      edges.push([i, j]);
  }
  // corridors: L-shaped between door points on facing walls
  const inAnyRoom = (x: number, y: number) =>
    rooms.some((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  for (const [i, j] of edges) {
    const a = rooms[i],
      b = rooms[j];
    const door = (q: Room, toward: Room) => {
      const dx = cx(toward) - cx(q),
        dy = cy(toward) - cy(q);
      if (Math.abs(dx) >= Math.abs(dy)) {
        const x = dx > 0 ? q.x1 + 1 : q.x0 - 1;
        const y = ri(q.y0 + (q.y1 - q.y0 >= 2 ? 1 : 0), q.y1 - (q.y1 - q.y0 >= 2 ? 1 : 0));
        return { x, y, out: { x: x + Math.sign(dx), y } };
      }
      const y = dy > 0 ? q.y1 + 1 : q.y0 - 1;
      const x = ri(q.x0 + (q.x1 - q.x0 >= 2 ? 1 : 0), q.x1 - (q.x1 - q.x0 >= 2 ? 1 : 0));
      return { x, y, out: { x, y: y + Math.sign(dy) } };
    };
    const da = door(a, b),
      db = door(b, a);
    if (!inBounds(da.out, W, H) || !inBounds(db.out, W, H)) return null;
    g[da.y][da.x] = ".";
    g[db.y][db.x] = ".";
    a.doors.push({ x: da.x, y: da.y });
    b.doors.push({ x: db.x, y: db.y });
    let x = da.out.x,
      y = da.out.y;
    const tx = db.out.x,
      ty = db.out.y;
    const horizFirst = r() < 0.5;
    const path: { x: number; y: number }[] = [];
    const stepTo = (axis: "x" | "y") => {
      if (axis === "x")
        while (x !== tx) {
          path.push({ x, y });
          x += Math.sign(tx - x);
        }
      else
        while (y !== ty) {
          path.push({ x, y });
          y += Math.sign(ty - y);
        }
    };
    if (horizFirst) {
      stepTo("x");
      stepTo("y");
    } else {
      stepTo("y");
      stepTo("x");
    }
    path.push({ x, y });
    for (const p of path) {
      if (p.x <= 0 || p.y <= 0 || p.x >= W - 1 || p.y >= H - 1) return null;
      if (inAnyRoom(p.x, p.y)) return null; // corridors must not cut through rooms
      g[p.y][p.x] = ".";
    }
  }
  // corridors that touch a room wall create accidental doors: reject such layouts
  for (const q of rooms) {
    const doorSet = new Set(q.doors.map((d) => `${d.x},${d.y}`));
    for (let x = q.x0 - 1; x <= q.x1 + 1; x++)
      for (const y of [q.y0 - 1, q.y1 + 1])
        if (g[y]?.[x] === "." && !doorSet.has(`${x},${y}`)) return null;
    for (let y = q.y0 - 1; y <= q.y1 + 1; y++)
      for (const x of [q.x0 - 1, q.x1 + 1])
        if (g[y]?.[x] === "." && !doorSet.has(`${x},${y}`)) return null;
  }
  // start = a leaf of the tree
  const deg = rooms.map((_, i) => edges.filter(([a, b]) => a === i || b === i).length);
  const startIdx = deg.indexOf(Math.min(...deg));
  const depth = roomDepths(rooms, edges, startIdx);
  const start = rooms[startIdx];
  g[cy(start)][cx(start)] = "S";
  for (let i = 0; i < rooms.length; i++) {
    const q = rooms[i];
    q.depth = depth[i];
    q.role = i === startIdx ? "start" : "combat";
    q.theme = q.role === "start" ? null : THEMES[Math.floor(r() * 5)];
    if (q.role === "start") continue;
    const w = q.x1 - q.x0 + 1,
      h = q.y1 - q.y0 + 1;
    // pillar for cover in bigger rooms (never next to a door)
    if (w >= 5 && h >= 4 && r() < o.pillarChance) {
      const px = ri(q.x0 + 1, q.x1 - 1),
        py = ri(q.y0 + 1, q.y1 - 1);
      if (!q.doors.some((d) => Math.abs(d.x - px) + Math.abs(d.y - py) <= 2)) {
        g[py][px] = "P";
        q.pillar = { x: px, y: py };
      }
    }
  }
  rooms
    .sort((a, b) => a.depth - b.depth || a.id - b.id)
    .forEach((q, i) => {
      q.id = i + 1;
    });
  return { grid: g, rooms, start: { x: cx(start), y: cy(start) } };
}

function inBounds(p: { x: number; y: number }, W: number, H: number) {
  return p.x >= 0 && p.y >= 0 && p.x < W && p.y < H;
}

function roomDepths(rooms: Room[], edges: [number, number][], from: number): number[] {
  const d = rooms.map(() => Infinity);
  d[from] = 0;
  const q = [from];
  while (q.length) {
    const i = q.shift()!;
    for (const [a, b] of edges) {
      const j = a === i ? b : b === i ? a : -1;
      if (j >= 0 && d[j] === Infinity) {
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
  }
  return d;
}

export const isFloor = (c: string | undefined) => c === "." || c === "S";

// Structural checks: every floor tile reachable from the start, closed borders, doors.
export function validate(lvl: Pick<Level, "grid" | "rooms" | "start">): Checks {
  const g = lvl.grid,
    H = g.length,
    W = g[0].length;
  const problems: string[] = [];
  const seen = new Set<string>([`${lvl.start.x},${lvl.start.y}`]);
  const q = [lvl.start];
  while (q.length) {
    const c = q.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = c.x + dx,
        y = c.y + dy,
        k = `${x},${y}`;
      if (seen.has(k) || !isFloor(g[y]?.[x])) continue;
      seen.add(k);
      q.push({ x, y });
    }
  }
  let floor = 0;
  g.forEach((row, y) =>
    row.forEach((c, x) => {
      if (!isFloor(c)) return;
      floor++;
      if (!seen.has(`${x},${y}`)) problems.push(`unreachable ${x},${y}`);
    }),
  );
  for (let x = 0; x < W; x++)
    if (g[0][x] !== "#" || g[H - 1][x] !== "#") problems.push("open border");
  for (let y = 0; y < H; y++)
    if (g[y][0] !== "#" || g[y][W - 1] !== "#") problems.push("open border");
  for (const r of lvl.rooms) if (!r.doors.length) problems.push(`room ${r.id} has no door`);
  return { ok: problems.length === 0, problems: [...new Set(problems)].slice(0, 10), floor };
}
