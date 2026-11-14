// Metrics over many generated fights (the list in design/combat-exploration.md):
//   1. win rate per bot and average fight length
//   2. decision variety: distinct outcomes per turn, and how often the best play is the
//      same kind of move as last turn
//   3. dominant patterns: does a simple fixed policy come close to the strong bot?
//   4. how often the strong bot uses ground effects, push and pull, the companion, summons
// Usage: node scripts/metrics.ts [fights=200] [--json]
import { type Action, apply, clone, newFight, unitById } from "../src/rules.ts";
import { generate } from "../src/content.ts";
import { BOTS, categories, playFight, search } from "../src/bots.ts";

const N = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 200);
const JSON_OUT = process.argv.includes("--json");
const fights = Array.from({ length: N }, (_, i) => ({
  enc: generate(i + 1),
  seed: 7919 * (i + 1),
}));

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// ---------------- 1 + 3: win rate and length per bot -------------------------------
const results: Record<string, { win: number; rounds: number; winRounds: number[]; ms: number }> =
  {};
for (const [name, bot] of Object.entries(BOTS)) {
  const t = performance.now();
  let win = 0;
  const rounds: number[] = [],
    winRounds: number[] = [];
  for (const f of fights) {
    const s = playFight(newFight(f.enc, f.seed), bot);
    rounds.push(s.round);
    if (s.over === "win") {
      win++;
      winRounds.push(s.round);
    }
  }
  results[name] = { win: win / N, rounds: avg(rounds), winRounds, ms: performance.now() - t };
}

// ---------------- 2 + 4: the strong bot, turn by turn ---------------------------------
const turnKinds: string[][] = []; // per fight, kind of each turn
let turns = 0;
const distinctAll: number[] = [],
  distinctGood: number[] = [];
const use = {
  hazardTurns: 0,
  pushPullTurns: 0,
  companionTurns: 0,
  summonActTurns: 0,
  moveTurns: 0,
  defendTurns: 0,
  summonsMade: 0,
  blaze: 0,
  flash: 0,
  collisions: 0,
  wallSlams: 0,
  forcedIntoHazard: 0,
  enemyFizzles: 0,
  hazardDamageToEnemies: 0,
  damageToEnemies: 0,
};
const GOOD = 5; // a line within 5 points of the best (about 5 damage) is a real option
for (const f of fights) {
  const s = newFight(f.enc, f.seed);
  const kinds: string[] = [];
  while (!s.over) {
    const r = search(s);
    turns++;
    const coarse = new Set(r.outcomes.map((o) => o.coarse));
    distinctAll.push(coarse.size);
    distinctGood.push(
      new Set(r.outcomes.filter((o) => o.score >= r.score - GOOD).map((o) => o.coarse)).size,
    );
    const cats = new Set<string>();
    let companion = false,
      summonAct = false;
    const c = clone(s);
    for (const a of r.seq) {
      for (const k of categories(c, a)) cats.add(k);
      if (a.kind === "ability") {
        const u = unitById(c, a.unit);
        if (u?.kind === "beetle") companion = true;
        if (u?.summon) summonAct = true;
      }
      if (a.kind === "end") break;
      apply(c, a);
    }
    if (cats.has("hazard")) use.hazardTurns++;
    if (cats.has("push/pull")) use.pushPullTurns++;
    if (cats.has("move")) use.moveTurns++;
    if (cats.has("defend")) use.defendTurns++;
    if (companion) use.companionTurns++;
    if (summonAct) use.summonActTurns++;
    kinds.push([...cats].sort().join("+") || "nothing");
    // play the line for real and read its events (including the enemy phase)
    const enemyIds = new Set(s.units.filter((u) => u.side === "E").map((u) => u.id));
    for (const a of r.seq as Action[]) {
      apply(s, a);
      for (const e of s.events) {
        if (e.t === "combo" && e.kind === "blaze") use.blaze++;
        if (e.t === "combo" && e.kind === "flash") use.flash++;
        if (e.t === "collide") use.collisions++;
        if (e.t === "wall") use.wallSlams++;
        if (e.t === "summon") use.summonsMade++;
        if (e.t === "fizzle" && enemyIds.has(e.unit ?? -1)) use.enemyFizzles++;
        if (e.t === "damage" && enemyIds.has(e.unit ?? -1)) {
          use.damageToEnemies += e.amount ?? 0;
          if (e.kind && /fire|poison|blaze|flash|burning/.test(e.kind))
            use.hazardDamageToEnemies += e.amount ?? 0;
          if (e.kind && /forced into/.test(e.kind)) use.forcedIntoHazard++;
        }
      }
      if (s.over || a.kind === "end") break;
    }
  }
  turnKinds.push(kinds);
}
let repeats = 0,
  pairs = 0;
const kindCount: Record<string, number> = {};
for (const ks of turnKinds) {
  ks.forEach((k, i) => {
    kindCount[k] = (kindCount[k] ?? 0) + 1;
    if (i > 0) {
      pairs++;
      if (k === ks[i - 1]) repeats++;
    }
  });
}
const topKinds = Object.entries(kindCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([k, n]) => `${k} ${pct(n / turns)}`);

// ---------------- report ----------------------------------------------------------
const strong = results.strong.win;
const report = {
  fights: N,
  winRate: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, +v.win.toFixed(3)])),
  avgRounds: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, +v.rounds.toFixed(2)])),
  decisionVariety: {
    distinctOutcomesPerTurn: { median: median(distinctAll), mean: +avg(distinctAll).toFixed(1) },
    goodDistinctOutcomesPerTurn: {
      median: median(distinctGood),
      mean: +avg(distinctGood).toFixed(1),
    },
    sameKindAsLastTurn: +(repeats / pairs).toFixed(3),
    topTurnKinds: topKinds,
  },
  dominantPatterns: Object.fromEntries(
    ["nearest", "retreat", "stack", "greedy"].map((k) => [
      k,
      { win: +results[k].win.toFixed(3), gapToStrong: +(strong - results[k].win).toFixed(3) },
    ]),
  ),
  strongBotUse: {
    turns,
    hazardTurns: +(use.hazardTurns / turns).toFixed(3),
    pushPullTurns: +(use.pushPullTurns / turns).toFixed(3),
    companionTurns: +(use.companionTurns / turns).toFixed(3),
    summonActTurns: +(use.summonActTurns / turns).toFixed(3),
    moveTurns: +(use.moveTurns / turns).toFixed(3),
    defendTurns: +(use.defendTurns / turns).toFixed(3),
    perFight: {
      summonsMade: +(use.summonsMade / N).toFixed(2),
      blaze: +(use.blaze / N).toFixed(2),
      flash: +(use.flash / N).toFixed(2),
      collisions: +(use.collisions / N).toFixed(2),
      wallSlams: +(use.wallSlams / N).toFixed(2),
      forcedIntoHazard: +(use.forcedIntoHazard / N).toFixed(2),
      enemyOutOfPosition: +(use.enemyFizzles / N).toFixed(2),
    },
    shareOfDamageFromGround: +(use.hazardDamageToEnemies / use.damageToEnemies).toFixed(3),
  },
};

if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`e14 lanes metrics over ${N} generated fights\n`);
  console.log("1. Win rate and fight length");
  for (const [k, v] of Object.entries(results))
    console.log(
      `   ${k.padEnd(8)} win ${pct(v.win).padStart(4)}   avg ${v.rounds.toFixed(1)} rounds   (${(v.ms / N).toFixed(0)} ms/fight)`,
    );
  const dv = report.decisionVariety;
  console.log("\n2. Decision variety (strong bot's turns)");
  console.log(
    `   distinct outcomes per turn: median ${dv.distinctOutcomesPerTurn.median}, mean ${dv.distinctOutcomesPerTurn.mean}`,
  );
  console.log(
    `   of those within ${GOOD} points of the best: median ${dv.goodDistinctOutcomesPerTurn.median}, mean ${dv.goodDistinctOutcomesPerTurn.mean}`,
  );
  console.log(`   best turn is the same kind as last turn: ${pct(dv.sameKindAsLastTurn)}`);
  console.log(`   most common turn kinds: ${dv.topTurnKinds.join(", ")}`);
  console.log("\n3. Dominant patterns (close to strong = fights lack depth)");
  for (const [k, v] of Object.entries(report.dominantPatterns))
    console.log(
      `   ${k.padEnd(8)} win ${pct(v.win).padStart(4)}   ${v.gapToStrong <= 0.1 ? "CLOSE to strong" : `${pct(v.gapToStrong)} behind strong`}`,
    );
  const u = report.strongBotUse;
  console.log("\n4. What the strong bot uses (share of its turns)");
  console.log(
    `   ground effects ${pct(u.hazardTurns)}, push/pull ${pct(u.pushPullTurns)}, companion ${pct(u.companionTurns)}, summon acts ${pct(u.summonActTurns)}, moves ${pct(u.moveTurns)}, defend ${pct(u.defendTurns)}`,
  );
  const pf = u.perFight;
  console.log(
    `   per fight: ${pf.summonsMade} summons, ${pf.blaze} blazes, ${pf.flash} flashes, ${pf.collisions} collisions, ${pf.wallSlams} wall slams, ${pf.forcedIntoHazard} forced into a hazard, ${pf.enemyOutOfPosition} enemy actions lost to position`,
  );
  console.log(`   share of damage to enemies from fire/poison: ${pct(u.shareOfDamageFromGround)}`);
}
