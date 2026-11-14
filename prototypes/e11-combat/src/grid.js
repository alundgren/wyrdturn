// Pure grid logic. No three.js here, so it can be unit tested.
export const DIRS = [
  { name: "N", dx: 0, dy: -1 },
  { name: "E", dx: 1, dy: 0 },
  { name: "S", dx: 0, dy: 1 },
  { name: "W", dx: -1, dy: 0 },
];

const WALKABLE = new Set([".", "D", "S", ",", "K", "L", "H"]);

export function parseMap(text) {
  // Comment lines start with "# " (hash + space). Map rows are made of map chars only.
  const mapRows = text.split("\n").filter((l) => l.length > 0 && !l.startsWith("# "));
  const height = mapRows.length;
  const width = Math.max(...mapRows.map((r) => r.length));
  let start = null;
  const tiles = mapRows.map((r, y) =>
    Array.from({ length: width }, (_, x) => {
      const c = r[x] ?? " ";
      if (c === "S") start = { x, y };
      return c;
    }),
  );
  if (!start) throw new Error("map has no S start tile");
  return { width, height, tiles, start };
}

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return " ";
  return map.tiles[y][x];
}

export function isWalkable(map, x, y) {
  return WALKABLE.has(tileAt(map, x, y));
}

export function createState(map) {
  return { x: map.start.x, y: map.start.y, facing: 0 };
}

// Returns { state, kind } where kind is 'move', 'turn' or 'bump'.
export function applyAction(map, s, action) {
  const turn = { turnLeft: -1, turnRight: 1 }[action];
  if (turn) return { state: { ...s, facing: (s.facing + turn + 4) % 4 }, kind: "turn" };
  const rel = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[action];
  if (rel === undefined) throw new Error(`unknown action ${action}`);
  const d = DIRS[(s.facing + rel) % 4];
  const nx = s.x + d.dx;
  const ny = s.y + d.dy;
  if (!isWalkable(map, nx, ny)) return { state: s, kind: "bump", dir: d };
  return { state: { ...s, x: nx, y: ny }, kind: "move" };
}

// Wraps state with a one-slot input buffer. The renderer calls
// press() on input and next() when the current animation ends.
export class Controller {
  constructor(map) {
    this.map = map;
    this.state = createState(map);
    this.busy = false;
    this.queued = null;
  }
  // Returns the step to animate now, or null if it was buffered.
  press(action) {
    if (this.busy) {
      this.queued = action; // newest input wins, only one slot
      return null;
    }
    return this.#run(action);
  }
  // Call when an animation finishes. Returns the next step or null.
  done() {
    this.busy = false;
    if (!this.queued) return null;
    const a = this.queued;
    this.queued = null;
    return this.#run(a);
  }
  #run(action) {
    const from = this.state;
    const r = applyAction(this.map, from, action);
    this.state = r.state;
    this.busy = true;
    return { from, ...r, action };
  }
}
