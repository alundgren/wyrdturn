// Print a fight as text maps, turn by turn, as the strong bot plays it.
// Usage: node scripts/peek.ts [fight=1..6 | gen:<seed>] [bot=strong]
import {
  type State,
  CARDS,
  NAMES,
  ROWS,
  LANES,
  describeIntent,
  groundAt,
  hero,
  newFight,
  unitAt,
  unitById,
} from "../src/rules/combat.ts";
import { FIGHTS, generate } from "../src/rules/encounters.ts";
import { BOTS, playFight } from "../src/rules/bots.ts";

const arg = process.argv[2] ?? "1";
const enc = arg.startsWith("gen:") ? generate(Number(arg.slice(4))) : FIGHTS[Number(arg) - 1];
const bot = BOTS[process.argv[3] ?? "strong"];
const SHORT: Record<string, string> = {
  hero: "HERO",
  wolf: "WOLF",
  servant: "serv",
  totem: "totm",
  ghoul: "Ghul",
  spear: "Sper",
  archer: "Arch",
  priest: "Prst",
  spider: "Spid",
  warden: "Ward",
};

function map(s: State): string {
  const lines: string[] = [];
  for (let r = ROWS; r >= 0; r--) {
    let line = `${r} `;
    for (let l = 0; l < LANES; l++) {
      const u = unitAt(s, l, r);
      const g = groundAt(s, l, r);
      const gs = `${g.blaze ? "B" : g.fire ? "F" : ""}${g.oil ? "o" : ""}${g.ice ? "i" : ""}${g.poison ? "p" : ""}${g.ward ? "w" : ""}`;
      line += `| ${u ? `${SHORT[u.kind]}${String(u.hp).padStart(2)}` : "      "} ${gs.padEnd(3)}`;
    }
    lines.push(line + "|");
  }
  for (const e of s.units)
    if (e.side === "E")
      lines.push(`   ${NAMES[e.kind]} (${e.lane},${e.row}): ${describeIntent(s, e)}`);
  return lines.join("\n");
}

const s0 = newFight(enc, 97);
console.log(`${enc.name}`);
playFight(s0, bot, (t) => {
  console.log(
    `\n--- round ${t.before.round}, energy 3, hand ${t.before.hand.map((c) => CARDS[c].name).join(", ")}`,
  );
  console.log(map(t.before));
  console.log(
    "play: " +
      t.line
        .map((a) =>
          a.t === "card"
            ? `${CARDS[t.before.hand[a.idx]]?.name ?? "?"}@${a.cell?.lane},${a.cell?.row}`
            : a.t === "step"
              ? `${unitById(t.before, a.id)?.kind} step ${a.dir}`
              : a.t === "ability"
                ? `${a.ab}${a.dir ?? ""}`
                : "",
        )
        .join(", "),
  );
});
console.log(`\nresult: ${s0.over} in round ${s0.round}, hero ${hero(s0)?.hp ?? 0}`);
