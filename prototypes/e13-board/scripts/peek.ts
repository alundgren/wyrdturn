// Prints the hand-made fights and a few generated ones as text maps (quick sanity check).
// Usage: node scripts/peek.ts [generated seeds...]
import { FIGHTS, handmade, generatedFight } from "../src/rules/encounters.ts";
import type { State } from "../src/rules/combat.ts";

const LETTER: Record<string, string> = {
  hero: "H",
  wolf: "W",
  brute: "b",
  archer: "a",
  hexer: "x",
  skitter: "s",
  guard: "g",
  servant: "S",
  totem: "T",
};
export function ascii(s: State): string {
  const b = s.board;
  const cells = new Set(b.cells);
  const rows: string[] = [];
  for (let y = b.room.y0 - 3; y <= b.room.y1 + 3; y++) {
    let row = "";
    for (let x = b.room.x0 - 3; x <= b.room.x1 + 3; x++) {
      const k = `${x},${y}`;
      const u = s.units.find((v) => v.x === x && v.y === y);
      let c = cells.has(k) ? "." : " ";
      if (b.spawns.some((p) => p.x === x && p.y === y)) c = "+";
      if (s.ground[k]?.oil) c = "o";
      if (s.ground[k]?.fire) c = "f";
      if (s.ground[k]?.poison) c = "p";
      if (b.pillars.some((p) => p.x === x && p.y === y)) c = "#";
      if (s.braziers.some((p) => p.x === x && p.y === y)) c = "B";
      if (u) c = LETTER[u.kind];
      row += c;
    }
    rows.push(row.trimEnd());
  }
  return rows.filter((r) => r.length).join("\n");
}

if (import.meta.main) {
  FIGHTS.forEach((f, i) => {
    const s = handmade(i);
    console.log(`\n${i + 1}. ${f.name}: ${s.units.map((u) => u.kind).join(", ")}`);
    console.log(ascii(s));
  });
  for (const seed of process.argv.slice(2).map(Number)) {
    const s = generatedFight(seed);
    console.log(`\ngenerated ${seed}: ${s.units.map((u) => u.kind).join(", ")}`);
    console.log(ascii(s));
  }
}
