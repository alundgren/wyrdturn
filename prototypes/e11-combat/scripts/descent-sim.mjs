// Bots play full Descent runs: 3 generated floors, HP/skills/upgrades/relic carried, deeper floors
// with bigger budgets (same formula as the game). Prints how far runs get and HP per floor.
// Usage: node scripts/descent-sim.mjs [runs=40] [smart|naive]
import { play, cfg } from "./bot.mjs";
import { generate } from "../src/levelgen.js";
const RUNS = Number(process.argv[2] ?? 40);
cfg.policy = process.argv[3] ?? "smart";
for (const preset of ["ember", "frost"]) {
  const reached = [0, 0, 0, 0],
    hpAt = [[], [], [], []];
  for (let r = 1; r <= RUNS; r++) {
    let hero = null,
      floor = 1;
    for (; floor <= 3; floor++) {
      const lvl = generate(
        r * 7919 + floor * 104729,
        floor > 1 ? { budgetStart: 2 + 1.5 * (floor - 1), rooms: 7 + (floor - 1) } : {},
      );
      const res = play(
        r * 10 + floor,
        preset,
        lvl,
        hero
          ? {
              hero: {
                hp: hero.hp,
                maxHp: hero.maxHp,
                skills: hero.skills,
                upgrades: hero.upgrades,
                relic: hero.relic,
              },
            }
          : {},
      );
      hpAt[floor].push(res.hp);
      if (res.result !== "won") break;
      hero = res.hero;
    }
    reached[Math.min(3, floor - 1)]++;
  }
  const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "-");
  console.log(
    `${preset.padEnd(6)} ${cfg.policy}: cleared 0 floors ${reached[0]}, 1 floor ${reached[1]}, 2 floors ${reached[2]}, all 3 ${reached[3]} (${((100 * reached[3]) / RUNS).toFixed(0)}%) | HP after floor 1/2/3: ${avg(hpAt[1])} / ${avg(hpAt[2])} / ${avg(hpAt[3])}`,
  );
}
