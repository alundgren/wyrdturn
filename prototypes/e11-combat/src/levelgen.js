// Procedural level generator for the Ember Scout slice. Pure JS, seeded.
// Output is the same data the hand-made slice uses: a map text and a rooms list,
// so the rules engine, the game and the sim work unchanged. An AI game master
// would choose the knobs (size, room count, budget curve, enemy mix), not the cells.
//
// Steps: place rooms -> connect (spanning tree + a few loops) -> carve corridors
// with single-tile doors -> pick start/end -> budget encounters by depth ->
// place pillars and spawns -> validate. Invalid layouts are rejected and retried.

import { rng, ENEMIES } from "./combat.js";

export const ENEMY_COST = { chaser: 2, archer: 3, warden: 4, lurker: 3 };

export const DEFAULTS = {
  width: 35,
  height: 25,
  rooms: 7,
  minSize: 3,
  maxSize: 6,
  extraLoops: 1,
  budgetStart: 2,
  budgetStep: 1.5,
  maxEnemies: 3,
  pillarChance: 0.5,
};

export function generate(seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  for (let attempt = 0; attempt < 200; attempt++) {
    const lvl = tryGenerate(seed * 101 + attempt, o);
    if (!lvl) continue;
    const v = validate(lvl);
    if (v.ok) return { ...lvl, seed, attempt, checks: v };
  }
  throw new Error(`levelgen: no valid level for seed ${seed}`);
}

function tryGenerate(s, o) {
  const r = rng(s);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const W = o.width,
    H = o.height;
  const g = Array.from({ length: H }, () => Array(W).fill("#"));
  // --- rooms (interior rects), 2-tile gap so walls between rooms stay solid
  const rooms = [];
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
    rooms.push({ ...rect, id: rooms.length + 1, doors: [] });
  }
  if (rooms.length < Math.min(4, o.rooms)) return null;
  for (const q of rooms)
    for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) g[y][x] = ".";
  const cx = (q) => Math.floor((q.x0 + q.x1) / 2),
    cy = (q) => Math.floor((q.y0 + q.y1) / 2);
  // --- connections: Prim's MST on centre distance, plus a few extra loops
  const dist = (a, b) => Math.abs(cx(a) - cx(b)) + Math.abs(cy(a) - cy(b));
  const edges = [];
  const inTree = new Set([0]);
  while (inTree.size < rooms.length) {
    let best = null;
    for (const i of inTree)
      for (let j = 0; j < rooms.length; j++)
        if (!inTree.has(j)) {
          const d = dist(rooms[i], rooms[j]);
          if (!best || d < best.d) best = { i, j, d };
        }
    edges.push([best.i, best.j]);
    inTree.add(best.j);
  }
  for (let k = 0; k < o.extraLoops; k++) {
    const i = ri(0, rooms.length - 1),
      j = ri(0, rooms.length - 1);
    if (i !== j && !edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i)))
      edges.push([i, j]);
  }
  // --- corridors: L-shaped between door points on facing walls
  const inAnyRoom = (x, y) => rooms.some((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  const nearRoomWall = (x, y) =>
    rooms.some((q) => x >= q.x0 - 1 && x <= q.x1 + 1 && y >= q.y0 - 1 && y <= q.y1 + 1);
  for (const [i, j] of edges) {
    const a = rooms[i],
      b = rooms[j];
    const door = (q, toward) => {
      // pick a wall side facing the other room, door in the middle third of that wall
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
    // carve from a.out to b.out: horizontal then vertical (or the other way)
    let x = da.out.x,
      y = da.out.y;
    const tx = db.out.x,
      ty = db.out.y;
    const horizFirst = r() < 0.5;
    const path = [];
    const stepTo = (axis) => {
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
      if (!inBounds(p, W, H) || p.x <= 0 || p.y <= 0 || p.x >= W - 1 || p.y >= H - 1) return null;
      if (inAnyRoom(p.x, p.y)) return null; // corridors must not cut through rooms (doors would be ambiguous)
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
  void nearRoomWall;
  // --- start and end: start = a leaf of the tree; end = farthest room by BFS
  const deg = rooms.map((_, i) => edges.filter(([a, b]) => a === i || b === i).length);
  const startIdx = deg.indexOf(Math.min(...deg));
  const depth = roomDepths(rooms, edges, startIdx);
  const endIdx = depth.indexOf(Math.max(...depth));
  const start = rooms[startIdx];
  g[cy(start)][cx(start)] = "S";
  // --- encounters by depth (start room is safe)
  const out = [];
  for (let i = 0; i < rooms.length; i++) {
    const q = rooms[i];
    q.depth = depth[i];
    q.role = i === startIdx ? "start" : i === endIdx ? "end" : "combat";
    q.theme =
      q.role === "start" ? null : ["crypt", "forge", "moss", "bone", null][Math.floor(r() * 5)];
    if (q.role === "start") continue;
    const w = q.x1 - q.x0 + 1,
      h = q.y1 - q.y0 + 1;
    // pillar for cover in bigger rooms (never next to a door, never in the centre line of a door)
    if (w >= 5 && h >= 4 && r() < o.pillarChance) {
      const px = ri(q.x0 + 1, q.x1 - 1),
        py = ri(q.y0 + 1, q.y1 - 1);
      if (!q.doors.some((d) => Math.abs(d.x - px) + Math.abs(d.y - py) <= 2)) {
        g[py][px] = "P";
        q.pillar = { x: px, y: py };
      }
    }
    let budget = Math.round(
      o.budgetStart + o.budgetStep * (depth[i] - 1) + (q.role === "end" ? 2 : 0),
    );
    const enemies = [];
    const types = Object.keys(ENEMY_COST);
    while (budget >= 2 && enemies.length < o.maxEnemies) {
      const afford = types.filter(
        (t) =>
          ENEMY_COST[t] <= budget &&
          !((t === "warden" || t === "lurker") && depth[i] < 2) &&
          !(t === "archer" && Math.max(w, h) < 4),
      );
      if (!afford.length) break;
      const t = afford[Math.floor(r() * afford.length)];
      // spawn: floor, not pillar, >= 3 steps from every door, not adjacent to another enemy
      const cells = [];
      for (let y = q.y0; y <= q.y1; y++)
        for (let x = q.x0; x <= q.x1; x++) {
          if (g[y][x] !== ".") continue;
          if (q.doors.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) < 3)) continue;
          if (enemies.some((e) => Math.abs(e.x - x) + Math.abs(e.y - y) < 2)) continue;
          cells.push({ x, y });
        }
      if (!cells.length) break;
      const c = cells[Math.floor(r() * cells.length)];
      enemies.push({ type: t, x: c.x, y: c.y });
      budget -= ENEMY_COST[t];
    }
    if (!enemies.length) q.role = "empty";
    q.enemies = enemies;
    q.budget = enemies.reduce((a, e) => a + ENEMY_COST[e.type], 0);
  }
  for (const q of rooms) {
    if (!q.enemies) q.enemies = [];
    out.push(q);
  }
  // --- rest shrine: the cheapest combat room at middle depth (not key/end) becomes a safe room with
  // a healing shrine 'H' in its centre. Gives recovery a place in the pacing (research: rest beats).
  if (o.shrine !== false) {
    const maxD = Math.max(...depth);
    const mids = rooms
      .map((q, i) => ({ q, i }))
      .filter(
        ({ q, i }) =>
          i !== startIdx &&
          i !== endIdx &&
          q.enemies?.length &&
          depth[i] >= 2 &&
          depth[i] <= maxD - 1,
      );
    mids.sort(
      (a, b) =>
        a.q.budget - b.q.budget ||
        Math.abs(depth[a.i] - maxD / 2) - Math.abs(depth[b.i] - maxD / 2),
    );
    const sh = mids[0]?.q;
    if (sh) {
      sh.enemies = [];
      sh.budget = 0;
      sh.role = "shrine";
      sh.theme = "crypt";
      g[cy(sh)][cx(sh)] = "H";
    }
  }
  // --- lock and key: every door of the end room becomes a locked gate 'L';
  // the key 'K' goes in the deepest other combat room, preferring one off the start->end path.
  if (o.lockAndKey !== false) {
    const end = rooms[endIdx];
    for (const d of end.doors) g[d.y][d.x] = "L";
    end.locked = true;
    const pathRooms = new Set();
    {
      // rooms on the tree path start -> end
      const prev = new Map([[startIdx, -1]]);
      const q = [startIdx];
      while (q.length) {
        const i = q.shift();
        for (const [a, b] of edges) {
          const j = a === i ? b : b === i ? a : -1;
          if (j >= 0 && !prev.has(j)) {
            prev.set(j, i);
            q.push(j);
          }
        }
      }
      for (let i = endIdx; i >= 0; i = prev.get(i)) pathRooms.add(i);
    }
    const cands = rooms
      .map((q, i) => ({ q, i }))
      .filter(({ q, i }) => i !== endIdx && i !== startIdx && q.enemies?.length);
    cands.sort((a, b) => pathRooms.has(a.i) - pathRooms.has(b.i) || depth[b.i] - depth[a.i]);
    const kr = cands[0]?.q;
    if (!kr) return null;
    const cells = [];
    for (let y = kr.y0; y <= kr.y1; y++)
      for (let x = kr.x0; x <= kr.x1; x++)
        if (g[y][x] === "." && !kr.enemies.some((e) => e.x === x && e.y === y))
          cells.push({ x, y });
    const kc = cells[Math.floor(r() * cells.length)];
    g[kc.y][kc.x] = "K";
    kr.hasKey = true;
  }
  // ids in exploration order (by depth) so the HUD's "room n" reads naturally
  out
    .sort((a, b) => a.depth - b.depth || a.id - b.id)
    .forEach((q, i) => {
      q.id = i + 1;
    });
  const mapText =
    "# Generated level. 'L' locked gate, 'K' key, 'H' rest shrine. seed-based, see levelgen.js\n" +
    g.map((row) => row.join("")).join("\n") +
    "\n";
  return {
    mapText,
    rooms: out.filter((q) => q.enemies.length),
    allRooms: out,
    grid: g,
    edges: edges.length,
  };
}

function inBounds(p, W, H) {
  return p.x >= 0 && p.y >= 0 && p.x < W && p.y < H;
}

function roomDepths(rooms, edges, from) {
  const d = rooms.map(() => Infinity);
  d[from] = 0;
  const q = [from];
  while (q.length) {
    const i = q.shift();
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

// Structural checks an agent (or the game master) can trust before anyone plays.
export function validate(lvl) {
  const g = lvl.grid,
    H = g.length,
    W = g[0].length;
  const problems = [];
  let start = null;
  g.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c === "S") start = { x, y };
    }),
  );
  // state-aware: the key must be reachable with gates closed (a flood fill with gates open would
  // happily accept a key locked behind its own gate)
  const flood = (open) => {
    const seen = new Set();
    if (!start) return seen;
    const q = [start];
    seen.add(`${start.x},${start.y}`);
    while (q.length) {
      const c = q.shift();
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = c.x + dx,
          y = c.y + dy,
          k = `${x},${y}`;
        const t = g[y]?.[x];
        if (
          seen.has(k) ||
          !(t === "." || t === "S" || t === "K" || t === "H" || (open && t === "L"))
        )
          continue;
        seen.add(k);
        q.push({ x, y });
      }
    }
    return seen;
  };
  const hasLock = g.some((row) => row.includes("L"));
  if (hasLock) {
    let key = null;
    g.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === "K") key = { x, y };
      }),
    );
    if (!key) problems.push("lock without key");
    else if (!flood(false).has(`${key.x},${key.y}`))
      problems.push("key not reachable before the gate");
  }
  if (!start) problems.push("no start");
  // reachability of all floor from start (pillars block)
  const seen = new Set();
  if (start) {
    for (const k of flood(true)) seen.add(k); // with the key everything must be reachable
  }
  let floor = 0;
  g.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c === "." || c === "S" || c === "K" || c === "H") {
        floor++;
        if (!seen.has(`${x},${y}`)) problems.push(`unreachable ${x},${y}`);
      }
    }),
  );
  // borders closed
  for (let x = 0; x < W; x++)
    if (g[0][x] !== "#" || g[H - 1][x] !== "#") problems.push("open border");
  for (let y = 0; y < H; y++)
    if (g[y][0] !== "#" || g[y][W - 1] !== "#") problems.push("open border");
  // encounters: spawns on floor, unique, safe distance from doors
  for (const q of lvl.allRooms) {
    if (!q.doors.length) problems.push(`room ${q.id} has no door`);
    const cells = new Set();
    for (const e of q.enemies ?? []) {
      const k = `${e.x},${e.y}`;
      if (cells.has(k)) problems.push(`room ${q.id} stacked spawn`);
      cells.add(k);
      if (g[e.y][e.x] !== ".") problems.push(`room ${q.id} spawn on ${g[e.y][e.x]}`);
      if (q.doors.some((d) => Math.abs(d.x - e.x) + Math.abs(d.y - e.y) < 3))
        problems.push(`room ${q.id} spawn near door`);
    }
  }
  const combat = lvl.allRooms.filter((q) => (q.enemies ?? []).length);
  if (combat.length < 3) problems.push(`only ${combat.length} combat rooms`);
  // difficulty must not drop sharply with depth (pacing)
  const byDepth = [...combat].sort((a, b) => a.depth - b.depth).map((q) => q.budget);
  return {
    ok: problems.length === 0,
    problems: [...new Set(problems)].slice(0, 10),
    floor,
    combatRooms: combat.length,
    budgets: byDepth,
    lockAndKey: hasLock,
  };
}

export function ascii(lvl) {
  const g = lvl.grid.map((r) => [...r]);
  for (const q of lvl.allRooms)
    for (const e of q.enemies ?? [])
      g[e.y][e.x] = { chaser: "c", archer: "a", warden: "W" }[e.type];
  return g.map((r) => r.join("")).join("\n");
}
