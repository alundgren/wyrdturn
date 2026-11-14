// Metrics over many generated fights (and the hand-made ones), as the brief asks:
//   win rate and average fight length per bot,
//   decision variety: distinct meaningful outcomes per turn, and how often the best play is
//     the same kind of move as last turn,
//   dominant patterns: simple policies against the strong bot,
//   how often the strong bot uses ground effects, push and pull, the companion and summons.
// Usage: node scripts/metrics.ts [fights=60] [bots=random,greedy,strong,nearest,retreat,stack]
// Writes shots/metrics.json too.
import { mkdirSync, writeFileSync } from "node:fs";
import { BOTS, playFight, type FightResult } from "../src/rules/bots.ts";
import { FIGHTS, generatedFight, handmade } from "../src/rules/encounters.ts";

const N = Number(process.argv[2] ?? 60);
const names = (process.argv[3] ?? "random,greedy,strong,nearest,retreat,stack").split(",");

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length ? b[Math.floor(b.length / 2)] : 0;
};

type Row = { bot: string; gen: FightResult[]; hand: FightResult[]; ms: number };
const rows: Row[] = [];
for (const bot of names) {
  const t = performance.now();
  const gen = Array.from({ length: N }, (_, i) =>
    playFight(generatedFight(i + 1), BOTS[bot], i + 1),
  );
  const hand = FIGHTS.map((_, i) => playFight(handmade(i), BOTS[bot], i + 1));
  rows.push({ bot, gen, hand, ms: (performance.now() - t) / (N + FIGHTS.length) });
}

const out: Record<string, unknown> = { fights: N };
console.log(`\n${N} generated fights (difficulty 1-5 by seed) + ${FIGHTS.length} hand-made\n`);
console.log("bot      gen win  rounds(won)  hand-made win  per fight");
for (const r of rows) {
  const won = r.gen.filter((f) => f.win);
  console.log(
    `${r.bot.padEnd(8)} ${String(pct(won.length, N)).padStart(5)}%  ${mean(
      won.map((f) => f.rounds - 1),
    )
      .toFixed(1)
      .padStart(10)}  ${r.hand
      .map((f) => (f.win ? "W" : "."))
      .join("")
      .padStart(13)}  ${r.ms.toFixed(0).padStart(6)} ms`,
  );
}
out.bots = Object.fromEntries(
  rows.map((r) => [
    r.bot,
    {
      winRate: pct(r.gen.filter((f) => f.win).length, N),
      avgRounds: +mean(r.gen.map((f) => f.rounds - 1)).toFixed(2),
      avgRoundsWon: +mean(r.gen.filter((f) => f.win).map((f) => f.rounds - 1)).toFixed(2),
      handmade: r.hand.map((f) => f.win),
    },
  ]),
);
// win rate by difficulty
const byDiff = (r: Row) =>
  [1, 2, 3, 4, 5].map((d) => {
    const fs = r.gen.filter((_, i) => 1 + ((i + 1) % 5) === d); // generated(seed) uses 1 + seed % 5
    return pct(fs.filter((f) => f.win).length, fs.length);
  });
console.log("\nwin % by difficulty 1..5");
for (const r of rows)
  console.log(
    `${r.bot.padEnd(8)} ${byDiff(r)
      .map((v) => String(v).padStart(4))
      .join("")}`,
  );

const strong = rows.find((r) => r.bot === "strong");
if (strong) {
  const all = [...strong.gen, ...strong.hand];
  const turns = all.flatMap((f) => f.turns);
  const distinct = turns.map((t) => t.distinct ?? 0);
  const viable = turns.map((t) => t.viable ?? 0);
  let same = 0,
    samePrimary = 0,
    pairs = 0;
  for (const f of all)
    for (let i = 1; i < f.turns.length; i++) {
      pairs++;
      if (f.turns[i].cats.join("+") === f.turns[i - 1].cats.join("+")) same++;
      if (f.turns[i].primary === f.turns[i - 1].primary) samePrimary++;
    }
  console.log("\ndecision variety (strong bot, per turn)");
  console.log(
    `  distinct outcomes among searched turns: mean ${mean(distinct).toFixed(1)}, median ${median(distinct)}`,
  );
  console.log(
    `  distinct outcomes within 8% of the best: mean ${mean(viable).toFixed(1)}, median ${median(viable)}, 1-only ${pct(viable.filter((v) => v <= 1).length, viable.length)}%`,
  );
  console.log(
    `  best play same kind as last turn: ${pct(same, pairs)}% (same set of action kinds), ${pct(samePrimary, pairs)}% (same main kind)`,
  );
  const kinds = new Map<string, number>();
  for (const t of turns) kinds.set(t.primary, (kinds.get(t.primary) ?? 0) + 1);
  console.log(
    `  main kind of turn: ${[...kinds.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${pct(v, turns.length)}%`)
      .join(", ")}`,
  );

  const sw = pct(strong.gen.filter((f) => f.win).length, N);
  console.log("\ndominant patterns (generated win rate vs strong)");
  const dom: Record<string, unknown> = {};
  for (const r of rows.filter((x) => ["nearest", "retreat", "stack"].includes(x.bot))) {
    const w = pct(r.gen.filter((f) => f.win).length, N);
    const close = sw - w <= 10;
    dom[r.bot] = { winRate: w, gap: sw - w, close };
    console.log(
      `  ${r.bot.padEnd(8)} ${w}% vs ${sw}%  gap ${sw - w}  ${close ? "CLOSE: lacks depth" : "ok"}`,
    );
  }

  const used = (f: FightResult, pred: (f: FightResult) => boolean) => (pred(f) ? 1 : 0);
  const cards = (f: FightResult, ids: string[]) =>
    ids.reduce((a, id) => a + ((f.stats.cards as Record<string, number>)[id] ?? 0), 0);
  const abil = (f: FightResult, ids: string[]) =>
    ids.reduce((a, id) => a + ((f.stats.abilities as Record<string, number>)[id] ?? 0), 0);
  const groundFx = (f: FightResult) =>
    cards(f, ["firebolt", "oil", "poison", "ward"]) + f.stats.topples;
  const pushPull = (f: FightResult) => f.stats.pushes + f.stats.pulls;
  const comp = (f: FightResult) => abil(f, ["bite", "shoulder", "howl"]);
  const summ = (f: FightResult) => f.stats.summons;
  const nT = turns.length;
  console.log("\nstrong bot usage (share of fights that used it / uses per turn)");
  const usage = {
    groundEffects: [
      pct(
        all.reduce((a, f) => a + used(f, (x) => groundFx(x) > 0), 0),
        all.length,
      ),
      +(all.reduce((a, f) => a + groundFx(f), 0) / nT).toFixed(2),
    ],
    pushPull: [
      pct(
        all.reduce((a, f) => a + used(f, (x) => pushPull(x) > 0), 0),
        all.length,
      ),
      +(all.reduce((a, f) => a + pushPull(f), 0) / nT).toFixed(2),
    ],
    companion: [
      pct(
        all.reduce((a, f) => a + used(f, (x) => comp(x) > 0), 0),
        all.length,
      ),
      +(all.reduce((a, f) => a + comp(f), 0) / nT).toFixed(2),
    ],
    summons: [
      pct(
        all.reduce((a, f) => a + used(f, (x) => summ(x) > 0), 0),
        all.length,
      ),
      +(all.reduce((a, f) => a + summ(f), 0) / nT).toFixed(2),
    ],
  };
  for (const [k, [a, b]] of Object.entries(usage))
    console.log(`  ${k.padEnd(14)} ${String(a).padStart(3)}% of fights, ${b} per turn`);
  const tot = (k: keyof FightResult["stats"]) =>
    all.reduce((a, f) => a + (f.stats[k] as number), 0);
  const dmg = {
    direct: tot("dmgDirect"),
    hazard: tot("dmgHazard"),
    collision: tot("dmgCollision"),
    friendlyFire: tot("dmgFriendly"),
  };
  const dsum = Object.values(dmg).reduce((a, b) => a + b, 0);
  console.log(
    `  damage to enemies: ${Object.entries(dmg)
      .map(([k, v]) => `${k} ${pct(v, dsum)}%`)
      .join(", ")}`,
  );
  console.log(
    `  collisions ${tot("collisions")}, brazier topples ${tot("topples")}, combos (oil blaze, poison burst) ${tot("combos")}`,
  );
  const cardUse: Record<string, number> = {};
  for (const f of all)
    for (const [k, v] of Object.entries(f.stats.cards)) cardUse[k] = (cardUse[k] ?? 0) + (v ?? 0);
  const abUse: Record<string, number> = {};
  for (const f of all)
    for (const [k, v] of Object.entries(f.stats.abilities)) abUse[k] = (abUse[k] ?? 0) + (v ?? 0);
  console.log(
    `  cards played: ${Object.entries(cardUse)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  console.log(
    `  abilities: ${Object.entries(abUse)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  out.variety = {
    distinctMean: +mean(distinct).toFixed(2),
    distinctMedian: median(distinct),
    viableMean: +mean(viable).toFixed(2),
    viableMedian: median(viable),
    sameKindPct: pct(same, pairs),
    samePrimaryPct: pct(samePrimary, pairs),
    kinds: Object.fromEntries(kinds),
  };
  out.dominant = dom;
  out.usage = usage;
  out.damage = dmg;
  out.cards = cardUse;
  out.abilities = abUse;
}
mkdirSync(new URL("../shots/", import.meta.url), { recursive: true });
writeFileSync(new URL("../shots/metrics.json", import.meta.url), JSON.stringify(out, null, 2));
