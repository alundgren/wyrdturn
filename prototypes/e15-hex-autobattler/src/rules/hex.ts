// The 7 x 6 board: pointy-top hexes in "odd-r" offset layout (odd rows sit half a hex to
// the right). Cells are numbered row * COLS + col. Maths runs in axial coordinates
// (q, r), where the six neighbours are the six DIRS. Directions go round counter-clockwise
// starting east, so d - 1 and d + 1 are the two neighbours either side of direction d.

export const COLS = 7;
export const ROWS = 6;
export const CELLS = COLS * ROWS;

export type Cell = number;

export const DIR_NAMES = ["E", "NE", "NW", "W", "SW", "SE"] as const;
export const DIRS: readonly [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export const cellOf = (col: number, row: number): Cell =>
  col < 0 || col >= COLS || row < 0 || row >= ROWS ? -1 : row * COLS + col;
export const colOf = (c: Cell) => c % COLS;
export const rowOf = (c: Cell) => Math.floor(c / COLS);

export function axial(c: Cell): [number, number] {
  const col = colOf(c),
    row = rowOf(c);
  return [col - (row - (row & 1)) / 2, row];
}

export function fromAxial(q: number, r: number): Cell {
  const col = q + (r - (r & 1)) / 2;
  return cellOf(col, r);
}

export function neighbor(c: Cell, d: number): Cell {
  const [q, r] = axial(c);
  const [dq, dr] = DIRS[((d % 6) + 6) % 6];
  return fromAxial(q + dq, r + dr);
}

export function neighbors(c: Cell): Cell[] {
  const out: Cell[] = [];
  for (let d = 0; d < 6; d++) {
    const n = neighbor(c, d);
    if (n >= 0) out.push(n);
  }
  return out;
}

export function dist(a: Cell, b: Cell): number {
  const [q1, r1] = axial(a),
    [q2, r2] = axial(b);
  const dq = q1 - q2,
    dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Direction d if b lies on a straight ray from a, else -1. */
export function rayDir(a: Cell, b: Cell): number {
  if (a === b) return -1;
  const [q1, r1] = axial(a),
    [q2, r2] = axial(b);
  const dq = q2 - q1,
    dr = r2 - r1;
  const k = dist(a, b);
  for (let d = 0; d < 6; d++) if (DIRS[d][0] * k === dq && DIRS[d][1] * k === dr) return d;
  return -1;
}

/** The direction from a whose ray points closest to b (by angle on the screen layout). */
export function nearestDir(a: Cell, b: Cell): number {
  const [x1, y1] = screenXY(a),
    [x2, y2] = screenXY(b);
  // screen y grows downward (south); DIRS go counter-clockwise from east
  const ang = Math.atan2(-(y2 - y1), x2 - x1);
  const d = Math.round(ang / (Math.PI / 3));
  return ((d % 6) + 6) % 6;
}

/** Centre of a cell on the board plane, hex size 1 (centre to corner). x east, y south. */
export function screenXY(c: Cell): [number, number] {
  const [q, r] = axial(c);
  return [Math.sqrt(3) * (q + r / 2), 1.5 * r];
}

export const offsetOf = (from: Cell, to: Cell): [number, number] => {
  const [q1, r1] = axial(from),
    [q2, r2] = axial(to);
  return [q2 - q1, r2 - r1];
};

export const applyOffset = (from: Cell, o: readonly [number, number]): Cell => {
  const [q, r] = axial(from);
  return fromAxial(q + o[0], r + o[1]);
};

export const cellName = (c: Cell) => `${String.fromCharCode(65 + colOf(c))}${rowOf(c) + 1}`;
