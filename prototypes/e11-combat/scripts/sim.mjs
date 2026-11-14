// Balance self-check: bots play many seeded runs. Prints win rate, rooms reached,
// HP left and where runs end.
// Usage: node scripts/sim.mjs [runs] [smart|naive] [hpWeight] [enemyWeight]   (GEN=1 for generated levels)
import { play, cfg } from "./bot.mjs";
import { generate } from "../src/levelgen.js";

const RUNS = Number(process.argv[2] ?? 2000);
cfg.policy = process.argv[3] ?? "smart";
cfg.hpw = Number(process.argv[4] ?? 2);
cfg.enw = Number(process.argv[5] ?? 4);
const POLICY = cfg.policy;
const GEN = process.env.GEN; // GEN=1: play generated levels, one per seed
for (const preset of ["ember", "frost"]) {
  const res = Array.from({ length: RUNS }, (_, i) => {
    if (!GEN) return play(i + 1, preset);
    const lvl = generate(i + 1);
    return { ...play(i + 1, preset, lvl), total: lvl.rooms.length };
  });
  const wins = res.filter((r) => r.result === "won");
  const avg = (a, f) => (a.length ? a.reduce((x, r) => x + f(r), 0) / a.length : 0);
  const endRoom = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (n) => res.filter((r) => r.rooms === n && r.result !== "won").length,
  );
  console.log(
    `${GEN ? "GEN " : ""}${preset.padEnd(6)} policy=${POLICY} runs=${RUNS} win=${((100 * wins.length) / RUNS).toFixed(1)}% ` +
      `avgRooms=${avg(res, (r) => r.rooms).toFixed(2)} hpLeftOnWin=${avg(wins, (r) => r.hp).toFixed(1)} ` +
      `avgTurns=${avg(res, (r) => r.turns).toFixed(0)} diedAfterRooms=${JSON.stringify(endRoom)} stuck=${res.filter((r) => r.result === "stuck").length}`,
  );
  if (GEN && process.env.PER_SEED)
    for (const [i, r] of res.entries())
      console.log(
        `  seed ${i + 1}: ${r.result} rooms ${r.rooms}/${r.total} hp ${r.hp} turns ${r.turns}`,
      );
}
