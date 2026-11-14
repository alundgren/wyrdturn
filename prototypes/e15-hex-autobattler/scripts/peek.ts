// Print hand-made fights (or generated seeds) as text maps: node scripts/peek.ts [gen seeds...]
import { CELLS, COLS, colOf, rowOf } from "../src/rules/hex.ts";
import { type FightSetup, newFight, threats } from "../src/rules/combat.ts";
import { AUTHORED_COUNT, authored, generate } from "../src/rules/encounters.ts";

const CH: Record<string, string> = {
  brute: "B",
  archer: "A",
  hexer: "X",
  skitter: "S",
  guard: "G",
  hero: "H",
  wolf: "W",
};
function show(f: FightSetup): void {
  const s = newFight(f, 1);
  const hit = new Set(threats(s).flatMap((t) => t.cells));
  console.log(`\n${f.name} - ${f.note}\n  ${f.arena.source}`);
  for (let r = 0; r < CELLS / COLS; r++) {
    let line = r % 2 ? "  " : "";
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const u = s.units.find((x) => x.cell === i);
      const g = s.ground[i];
      let ch = f.arena.blocked[i]
        ? s.braziers.includes(i)
          ? "&"
          : "#"
        : u
          ? CH[u.kind]
          : g.oil
            ? "o"
            : g.poison
              ? "p"
              : g.fire
                ? "f"
                : ".";
      if (hit.has(i) && !u && !f.arena.blocked[i]) ch = "*";
      line += ` ${ch}  `;
    }
    console.log(line);
  }
  console.log(`  hand: ${s.hand.join(", ")}`);
  void colOf;
  void rowOf;
}
const seeds = process.argv.slice(2).map(Number);
if (seeds.length) for (const x of seeds) show(generate(x));
else for (let i = 0; i < AUTHORED_COUNT; i++) show(authored(i));
