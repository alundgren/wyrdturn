import { newFight, type Board, type EnemyKind, type Pos, type State } from "../src/rules/combat.ts";

/** A test board from text rows. '.' floor, '#' wall, 'P' pillar, 'B' brazier, 'o' oil,
 * 'E' entry door (party enters from the tile left of it... it must have an open tile on
 * one side outside), enemy letters: b brute, a archer, x hexer, s skitter, g guard. */
export function board(rows: string[], extra: Partial<{ seed: number }> = {}): State {
  const grid = rows.map((r) => r.split(""));
  const cells: string[] = [];
  const pillars: Pos[] = [];
  const braziers: Pos[] = [];
  const oil: Pos[] = [];
  const foes: { kind: EnemyKind; x: number; y: number }[] = [];
  let entry: Pos = { x: 0, y: 0 };
  const L: Record<string, EnemyKind> = {
    b: "brute",
    a: "archer",
    x: "hexer",
    s: "skitter",
    g: "guard",
  };
  grid.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c === "#") return;
      cells.push(`${x},${y}`);
      if (c === "P") pillars.push({ x, y });
      if (c === "B") braziers.push({ x, y });
      if (c === "o") oil.push({ x, y });
      if (c === "E") entry = { x, y };
      if (L[c]) foes.push({ kind: L[c], x, y });
    }),
  );
  const b: Board = {
    grid: grid.map((r) => r.map((c) => (c === "#" ? "#" : "."))),
    room: { x0: 1, y0: 1, x1: grid[0].length - 2, y1: grid.length - 2 },
    theme: "crypt",
    cells,
    pillars,
    doors: [entry],
    entry,
    entryOutside: { x: entry.x - 1, y: entry.y },
    spawns: [{ x: entry.x - 1, y: entry.y }],
  };
  return newFight({ board: b, enemies: foes, braziers, oil, seed: extra.seed ?? 1 });
}
