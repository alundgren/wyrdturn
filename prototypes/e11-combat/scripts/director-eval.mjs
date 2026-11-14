// Does the director move outcomes toward a target? Same generated levels, director off vs on,
// smart and naive bots. Also feeds the director garbage proposals to prove the fallback.
// Usage: node scripts/director-eval.mjs [levels=30]
import { play, cfg } from "./bot.mjs";
import { generate } from "../src/levelgen.js";
import { makeDirector } from "../src/director.js";

const N = Number(process.argv[2] ?? 30);
const levels = Array.from({ length: N }, (_, i) => generate(500 + i));
function run(policy, director) {
  cfg.policy = policy;
  const res = levels.map((l, i) => play(i + 1, "ember", l, { director }));
  const wins = res.filter((r) => r.result === "won");
  const hp = wins.map((r) => r.hp);
  const pct = (x) => `${(100 * x).toFixed(0)}%`;
  return {
    win: pct(wins.length / N),
    hpOnWin: hp.length ? (hp.reduce((a, b) => a + b, 0) / hp.length).toFixed(1) : "-",
    bigWins: wins.filter((r) => r.hp >= 15).length,
    stuck: res.filter((r) => r.result === "stuck").length,
    res,
  };
}
for (const policy of ["smart", "naive"]) {
  const off = run(policy, null);
  const on = run(policy, () => makeDirector());
  console.log(
    `${policy.padEnd(5)} director OFF: win ${off.win}, HP left on win ${off.hpOnWin}, easy wins (>=15 HP) ${off.bigWins}, stuck ${off.stuck}`,
  );
  console.log(
    `${policy.padEnd(5)} director ON : win ${on.win}, HP left on win ${on.hpOnWin}, easy wins (>=15 HP) ${on.bigWins}, stuck ${on.stuck}`,
  );
  if (policy === "smart") {
    const ex = on.res.find((r) => r.directorLog?.length)?.directorLog ?? [];
    console.log(
      "  example decisions:",
      ex
        .map(
          (e) =>
            `room ${e.room} p=${e.pressure} ${e.cmd.enemies.join("+")} (${e.cmd.reason})${e.ok ? "" : " REJECTED"}`,
        )
        .join(" | "),
    );
  }
}
// garbage proposer: unknown enemy, too many, wrong room -> must fall back, never crash
cfg.policy = "smart";
const bad = [
  (o, room) => ({ type: "chooseEncounter", roomId: room.id, enemies: ["dragon"] }),
  (o, room) => ({
    type: "chooseEncounter",
    roomId: room.id,
    enemies: ["warden", "warden", "warden", "warden"],
  }),
  (o, room) => ({ type: "chooseEncounter", roomId: room.id + 99, enemies: ["chaser"] }),
  () => ({ type: "deleteHero" }),
];
let rejected = 0,
  total = 0;
for (const proposer of bad) {
  const r = play(1, "ember", levels[0], { director: () => makeDirector({ proposer }) });
  for (const e of r.directorLog ?? []) {
    total++;
    if (!e.ok) rejected++;
  }
}
console.log(`bad proposals: ${rejected}/${total} rejected and fell back to the authored encounter`);
