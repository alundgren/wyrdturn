// Metrics for e15 (research/autobattler-combat.md section 7) over paired seeded fights.
// Usage: node scripts/metrics.ts [fights=300] [--workers=4] [--no-write]
// Prints the tables and the failure gates, and writes them into RESULT.md between the
// metrics markers (the rest of RESULT.md is left alone).
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { type Job, type JobResult, NEAR } from "./jobs.ts";
import {
  AUTHORED_COUNT,
  FAMILY_NAMES,
  FIGHT_NAMES,
  generate,
  rejections,
} from "../src/rules/encounters.ts";
import { KINDS, MAX_INTERVALS } from "../src/rules/combat.ts";

const N = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 300);
const WORKERS = Number(
  process.argv.find((a) => a.startsWith("--workers="))?.split("=")[1] ??
    Math.max(1, availableParallelism()),
);
const WRITE = !process.argv.includes("--no-write");
const AUTH_SEEDS = 30;
const SECONDS_PER_INTERVAL = 2; // playback at 1x (research section 5 target)
const SQUAD_HP = KINDS.hero.hp + KINDS.wolf.hp;
const t0 = performance.now();

// ---------------- worker pool -------------------------------------------------------

async function runAll(jobs: Job[], label: string): Promise<JobResult[]> {
  const out: JobResult[] = [];
  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += 6) batches.push(jobs.slice(i, i + 6));
  // biggest work first so the pool finishes together
  let done = 0;
  const pool = Array.from(
    { length: Math.min(WORKERS, batches.length) },
    () => new Worker(new URL("./metrics-worker.ts", import.meta.url)),
  );
  await Promise.all(
    pool.map(
      (w) =>
        new Promise<void>((resolve, reject) => {
          const next = () => {
            const b = batches.shift();
            if (!b) {
              void w.terminate();
              resolve();
              return;
            }
            w.postMessage(b);
          };
          w.on("message", (rs: JobResult[]) => {
            out.push(...rs);
            done += rs.length;
            if (process.stderr.isTTY) process.stderr.write(`\r${label}: ${done}/${jobs.length}   `);
            next();
          });
          w.on("error", reject);
          next();
        }),
    ),
  );
  if (process.stderr.isTTY) process.stderr.write("\n");
  return out;
}

// ---------------- stats helpers -----------------------------------------------------

const seeds = Array.from({ length: N }, (_, k) => k + 1);
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const f1 = (x: number) => x.toFixed(1);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quant = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};
const median = (xs: number[]) => quant(xs, 0.5);
function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96,
    p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - r) / d, (c + r) / d];
}
let bootSeed = 12345;
const brand = () => {
  bootSeed = (bootSeed * 1103515245 + 12345) & 0x7fffffff;
  return bootSeed / 0x80000000;
};
/** Paired bootstrap over seeds: mean difference and 95% interval. */
function paired(a: number[], b: number[]): { d: number; lo: number; hi: number } {
  const diffs = a.map((x, i) => x - b[i]);
  const reps: number[] = [];
  for (let r = 0; r < 1000; r++) {
    let s = 0;
    for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(brand() * diffs.length)];
    reps.push(s / diffs.length);
  }
  return { d: mean(diffs), lo: quant(reps, 0.025), hi: quant(reps, 0.975) };
}
const winCI = (rs: JobResult[]) => {
  const k = rs.filter((r) => r.win).length;
  const [lo, hi] = wilson(k, rs.length);
  return `${pct(k / rs.length)} (${pct(lo)}-${pct(hi)})`;
};
const sum = (rs: JobResult[], k: string) => rs.reduce((a, r) => a + (r.stats[k] ?? 0), 0);
const perFight = (rs: JobResult[], k: string) => sum(rs, k) / Math.max(1, rs.length);

// ---------------- run ---------------------------------------------------------------

const phase1: Job[] = [];
const add = (cfg: string) => seeds.forEach((i) => phase1.push({ cfg, i }));
for (const p of ["strong", "fixed", "damage", "greedy", "random", "nearest", "none", "deployOnly"])
  add(p);
for (const a of [
  "no:ground",
  "no:pushpull",
  "no:summons",
  "no:petskills",
  "no:pet",
  "prio:nearest",
])
  add(a);
for (const b of ["build:dmg", "build:wolf", "build:ward", "build:oil"]) add(b);
for (const v of ["strong@mirror", "fixed@mirror", "strong@shift", "fixed@shift"]) add(v);
for (let k = 0; k < 4; k++) {
  add(`place:strong:${k}`);
  add(`place:pass:${k}`);
}
for (let f = 0; f < AUTHORED_COUNT; f++)
  for (const p of ["strong", "greedy", "random", "nearest", "fixed", "none"])
    for (let i = 0; i < AUTH_SEEDS; i++) phase1.push({ cfg: `auth:${f}:${p}`, i });
// heaviest jobs first
const weight = (j: Job) =>
  /strong|fixed|no:|prio|build|place:strong|auth:\d:(strong|fixed)/.test(j.cfg) ? 0 : 1;
phase1.sort((a, b) => weight(a) - weight(b));
const r1 = await runAll(phase1, "phase 1");
const by = (cfg: string) => r1.filter((r) => r.cfg === cfg).sort((a, b) => a.i - b.i);
const S = by("strong");
const phase2: Job[] = [];
for (const r of S) {
  for (const c of ["same:pass", "same:damage", "same:random"])
    phase2.push({ cfg: c, i: r.i, deploy: r.deploy });
  phase2.push({
    cfg: "frontload",
    i: r.i,
    k: Math.max(1, Math.min(12, r.cards)),
    e: Math.max(1, r.energy),
  });
}
phase2.sort((a, b) => (a.cfg === "frontload" ? -1 : 0) - (b.cfg === "frontload" ? -1 : 0));
const r2 = await runAll(phase2, "phase 2");
const all = [...r1, ...r2];
const get = (cfg: string) => all.filter((r) => r.cfg === cfg).sort((a, b) => a.i - b.i);

// generator rejections (same seeds as above, plus the mirrored and shifted variants)
for (const i of seeds) {
  generate(i, 1 + (i % 5));
  generate(i, 1 + (i % 5), { mirror: true });
  generate(i, 1 + (i % 5), { shift: i % 2 ? 1 : -1 });
}

// ---------------- report ------------------------------------------------------------

const L: string[] = [];
const say = (s = "") => L.push(s);
const table = (head: string[], rows: (string | number)[][]) => {
  say(`| ${head.join(" | ")} |`);
  say(`| ${head.map((h, i) => (i ? "---:" : "---")).join(" | ")} |`);
  for (const r of rows) say(`| ${r.join(" | ")} |`);
  say();
};

say(
  `Sample: ${N} generated fights (seeds 1-${N}, difficulty 1-5, ${N / 5} each), the same seeds for every`,
);
say(
  `policy and config; ${AUTHORED_COUNT} hand-made fights x ${AUTH_SEEDS} deck seeds. Rules version: e15 v1.`,
);
say(
  `Strong search: beam ${6} over this window's card lines (all legal plays, far-off ground plays pruned),`,
);
say(
  `each scored after the coming interval plus 1 interval of passing; deployment: every hero/wolf pair`,
);
say(
  `scored over 3 intervals, the best 3 searched fully. It never sees the deck order. 95% intervals:`,
);
say(`Wilson for win rates, paired bootstrap (1000 resamples over seeds) for differences.`);
say();

// Success and pacing
say("### Success and pacing");
say();
const POL = ["strong", "greedy", "random", "nearest", "fixed", "damage", "deployOnly", "none"];
table(
  [
    "Policy",
    "Win (95% CI)",
    "Intervals (all)",
    "Intervals (wins)",
    "Hero alive",
    "Wolf alive",
    "Cards/fight",
    "Commands/fight",
    "ms/fight",
  ],
  POL.map((p) => {
    const rs = get(p);
    const wins = rs.filter((r) => r.win);
    return [
      p,
      winCI(rs),
      f1(mean(rs.map((r) => r.intervals))),
      f1(mean(wins.map((r) => r.intervals))),
      pct(rs.filter((r) => r.heroHp > 0).length / rs.length),
      pct(rs.filter((r) => r.wolfAlive).length / rs.length),
      f1(mean(rs.map((r) => r.cards))),
      f1(mean(rs.map((r) => r.commands))),
      mean(rs.map((r) => r.ms)).toFixed(0),
    ];
  }),
);
say("Win rate by difficulty:");
say();
table(
  ["Policy", ...[1, 2, 3, 4, 5].map((d) => `d${d}`)],
  POL.map((p) => [
    p,
    ...[1, 2, 3, 4, 5].map((d) => winCI(get(p).filter((r) => r.difficulty === d))),
  ]),
);
const res = S.map((r) => r.intervals * SECONDS_PER_INTERVAL);
say(
  `Resolution time at 1x (${SECONDS_PER_INTERVAL} s per interval, strong bot): median ${median(res)} s, p90 ${quant(res, 0.9)} s. ` +
    `Timeouts (interval ${MAX_INTERVALS}): ${pct(S.filter((r) => !r.win && r.heroHp > 0).length / S.length)}. Human planning time is not measured by bots.`,
);
say();
say("Hand-made fights (30 deck seeds each), win rate / average intervals:");
say();
table(
  ["Fight", "strong", "greedy", "random", "nearest", "fixed", "none"],
  FIGHT_NAMES.map((n, f) => [
    `${f + 1}. ${n}`,
    ...["strong", "greedy", "random", "nearest", "fixed", "none"].map((p) => {
      const rs = get(`auth:${f}:${p}`);
      return `${pct(rs.filter((r) => r.win).length / rs.length)} / ${f1(mean(rs.map((r) => r.intervals)))}`;
    }),
  ]),
);

// Decision variety
const W = S.flatMap((r) => r.windows ?? []);
say("### Decision variety (strong bot, per window)");
say();
const repeat = S.reduce(
  (a, r) => {
    const ws = r.windows ?? [];
    for (let k = 1; k < ws.length; k++) if (ws[k].cats === ws[k - 1].cats) a.same++;
    a.n += Math.max(0, ws.length - 1);
    return a;
  },
  { same: 0, n: 0 },
);
const catCount = new Map<string, number>();
for (const w of W) catCount.set(w.cats, (catCount.get(w.cats) ?? 0) + 1);
say(`- Windows: ${W.length} (${f1(W.length / S.length)} per fight).`);
say(
  `- Distinct outcomes after the interval (alive IDs, HP in 2-point steps, occupied hexes, hazards, energy left): median ${median(W.map((w) => w.distinct))}, mean ${f1(mean(W.map((w) => w.distinct)))}. Without positions: median ${median(W.map((w) => w.distinctNoPos))}, mean ${f1(mean(W.map((w) => w.distinctNoPos)))}.`,
);
say(
  `- Near-best (within ${NEAR} score points of the best line): median ${median(W.map((w) => w.near))}, mean ${f1(mean(W.map((w) => w.near)))}; without positions median ${median(W.map((w) => w.nearNoPos))}, mean ${f1(mean(W.map((w) => w.nearNoPos)))}.`,
);
say(
  `- Best line is the same card categories as the window before: ${pct(repeat.same / Math.max(1, repeat.n))}.`,
);
say(
  `- Forced passes (no legal card): ${pct(W.filter((w) => w.legal === 0).length / W.length)}. Chosen pass while cards were legal: ${pct(W.filter((w) => w.legal > 0 && w.cats === "pass").length / W.length)}.`,
);
say(
  `- Most common best lines: ${[...catCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k} ${pct(v / W.length)}`)
    .join(", ")}.`,
);
say();

// Dominant patterns
say("### Dominant patterns");
say();
const winsOf = (cfg: string) => get(cfg).map((r) => (r.win ? 1 : 0));
const hpOf = (cfg: string) => get(cfg).map((r) => r.squadHp);
const gapRows = ["greedy", "fixed", "damage", "nearest", "deployOnly", "none", "random"].map(
  (p) => {
    const g = paired(winsOf("strong"), winsOf(p));
    return [
      p,
      `${(100 * g.d).toFixed(0)} pts (${(100 * g.lo).toFixed(0)} to ${(100 * g.hi).toFixed(0)})`,
    ];
  },
);
table(["Policy", "Strong minus policy, win"], gapRows);

// Feature relevance
say("### Feature relevance (strong bot)");
say();
say(
  `Per fight: cards ${f1(mean(S.map((r) => r.cards)))} (${["damage", "move", "push", "ground", "defend", "summon"].map((c) => `${c} ${f1(perFight(S, `cat:${c}`))}`).join(", ")}).`,
);
say(
  `Ground: ${f1(perFight(S, "ignites"))} ignites, ${f1(perFight(S, "blazes"))} blazes (${f1(perFight(S, "blazeCells"))} hexes), ${f1(perFight(S, "brazierTopples"))} brazier topples, ${f1(perFight(S, "forcedIntoHazard"))} units forced into a hazard, ${f1(perFight(S, "oilSlides"))} oil slides.`,
);
say(
  `Push/pull: ${f1(perFight(S, "pushes"))} Shoulders, ${f1(perFight(S, "pulls"))} Hooks, ${f1(perFight(S, "servantPushes"))} servant knockbacks, ${f1(perFight(S, "collisions"))} collisions, ${f1(perFight(S, "wallSlamsEnemy"))} enemy wall slams.`,
);
say(
  `Pet: ${f1(perFight(S, "wolfAttacks"))} bites (${f1(perFight(S, "wolfDmg"))} damage), ${f1(perFight(S, "wolfGuards"))} guards (${f1(perFight(S, "wolfGuardBlock"))} block). Summons: ${f1(perFight(S, "summons"))} made, ${f1(perFight(S, "servantAttacks"))} servant slams, ${f1(perFight(S, "totemBlock"))} totem block.`,
);
const dmgE = sum(S, "dmgToEnemies");
say(
  `Damage to enemies: ${pct(sum(S, "hazardDmgToEnemies") / dmgE)} from fire and poison, ${pct(sum(S, "collisionDmgToEnemies") / dmgE)} from collisions and walls, ${pct(sum(S, "friendlyFire") / dmgE)} from other enemies' attacks. Prevented for allies: ${f1(perFight(S, "preventedWard"))} by ward, ${f1(perFight(S, "preventedBlock"))} by block per fight.`,
);
say();
const abl = [
  ["no:ground", "ground cards off (Oil, Miasma, Ward; Firebolt does not ignite)"],
  ["no:pushpull", "push/pull off (Shoulder, Hook; servant does not knock back)"],
  ["no:summons", "summons off"],
  ["no:petskills", "pet skills off (wolf body stays, never bites or guards, no Shoulder)"],
  ["no:pet", "no wolf at all"],
  ["prio:nearest", "wolf priority locked to nearest"],
];
table(
  ["Feature removed", "Win", "Win change (95% CI)", "Median squad HP change"],
  abl.map(([cfg, what]) => {
    const g = paired(winsOf(cfg), winsOf("strong"));
    const hp = median(hpOf(cfg).map((x, k) => x - hpOf("strong")[k]));
    return [
      what,
      pct(mean(winsOf(cfg))),
      `${(100 * g.d).toFixed(0)} pts (${(100 * g.lo).toFixed(0)} to ${(100 * g.hi).toFixed(0)})`,
      hp,
    ];
  }),
);

// Placement
say("### Placement sensitivity and adaptive placement");
say();
const place = (kind: string) => [0, 1, 2, 3].map((k) => get(`place:${kind}:${k}`));
const placeStats = (kind: string) => {
  const ps = place(kind);
  const rows = seeds.map((_, idx) => ps.map((p) => p[idx]));
  const winners = rows.filter((row) => new Set(row.map((r) => r.win)).size > 1).length;
  const wr = ps.map((p) => mean(p.map((r) => (r.win ? 1 : 0)))).sort((a, b) => a - b);
  const best = mean(rows.map((row) => Math.max(...row.map((r) => r.squadHp))));
  const worst = mean(rows.map((row) => Math.min(...row.map((r) => r.squadHp))));
  const med = mean(rows.map((row) => median(row.map((r) => r.squadHp))));
  const bestW = mean(rows.map((row) => (row.some((r) => r.win) ? 1 : 0)));
  const worstW = mean(rows.map((row) => (row.every((r) => r.win) ? 1 : 0)));
  return { winners: winners / rows.length, wr, best, worst, med, bestW, worstW };
};
const pS = placeStats("strong"),
  pP = placeStats("pass");
table(
  [
    "4 random legal deployments, then",
    "Win per sample (low-high)",
    "Best / worst per fight",
    "Squad HP best / median / worst",
    "Fights whose winner changes",
  ],
  [
    [
      "strong cards",
      `${pct(pS.wr[0])}-${pct(pS.wr[3])}`,
      `${pct(pS.bestW)} / ${pct(pS.worstW)}`,
      `${f1(pS.best)} / ${f1(pS.med)} / ${f1(pS.worst)}`,
      pct(pS.winners),
    ],
    [
      "no cards (priority only)",
      `${pct(pP.wr[0])}-${pct(pP.wr[3])}`,
      `${pct(pP.bestW)} / ${pct(pP.worstW)}`,
      `${f1(pP.best)} / ${f1(pP.med)} / ${f1(pP.worst)}`,
      pct(pP.winners),
    ],
  ],
);
const adaptRows: (string | number)[][] = [];
let heldS: number[] = [],
  heldF: number[] = [];
for (const v of ["", "@mirror", "@shift"]) {
  const s = winsOf(`strong${v}`),
    f = winsOf(`fixed${v}`);
  if (v) {
    heldS = heldS.concat(s);
    heldF = heldF.concat(f);
  }
  const g = paired(s, f);
  adaptRows.push([
    v ? v.slice(1) : "base",
    pct(mean(s)),
    pct(mean(f)),
    `${(100 * g.d).toFixed(0)} pts (${(100 * g.lo).toFixed(0)} to ${(100 * g.hi).toFixed(0)})`,
  ]);
}
const heldGap = paired(heldS, heldF);
adaptRows.push([
  "held-out (mirror + shift)",
  pct(mean(heldS)),
  pct(mean(heldF)),
  `${(100 * heldGap.d).toFixed(0)} pts (${(100 * heldGap.lo).toFixed(0)} to ${(100 * heldGap.hi).toFixed(0)})`,
]);
table(["Formations", "Adaptive (strong)", "Fixed formation", "Adaptive minus fixed"], adaptRows);

// Intervention and timing
say("### Intervention value and timing value (same deployment as the strong bot)");
say();
const interv = ["same:pass", "same:damage", "same:random", "frontload"];
const ivRows = interv.map((cfg) => {
  const g = paired(winsOf("strong"), winsOf(cfg));
  const hd = paired(hpOf("strong"), hpOf(cfg));
  const medHp = median(hpOf("strong").map((x, k) => x - hpOf(cfg)[k]));
  return [
    cfg,
    pct(mean(winsOf(cfg))),
    `${(100 * g.d).toFixed(0)} pts (${(100 * g.lo).toFixed(0)} to ${(100 * g.hi).toFixed(0)})`,
    `${f1(hd.d)} (median ${medHp})`,
  ];
});
table(
  ["Instead of strong cards", "Win", "Strong minus this, win", "Strong minus this, squad HP"],
  ivRows,
);
say(
  `Front-loading: the opening window may play as many cards as the strong bot played in that fight (capped at the 12-card deck, mean ${f1(mean(get("frontload").map((r) => r.cards)))} played) with the same total energy, drawn from the top of the same shuffled deck; nothing after. Cards that strong drew only after a reshuffle are not available at setup.`,
);
say();

// Priority
const PN = get("prio:nearest");
say("### Priority value");
say();
say(
  `Strong with free wolf priority vs locked to nearest: ${pct(mean(winsOf("strong")))} vs ${pct(mean(winsOf("prio:nearest")))}. Wolf target changes per fight ${f1(perFight(S, "wolfTargetChanges"))} (locked: ${f1(perFight(PN, "wolfTargetChanges"))}). Invalid targets: 0 by rule (targets are chosen from legal reachable cells). Path stalls (an ally holds because no path exists): ${f1(perFight(S, "pathStalls"))} per fight.`,
);
say();

// Companion
const wolfDeaths = S.filter((r) => !r.wolfAlive);
say("### Companion value");
say();
say(
  `Strong bot: wolf dies in ${pct(wolfDeaths.length / S.length)} of fights (${pct(wolfDeaths.filter((r) => r.win).length / Math.max(1, wolfDeaths.length))} of those fights were still won). Bites ${f1(perFight(S, "wolfAttacks"))}, guards ${f1(perFight(S, "wolfGuards"))} per fight. Greedy: ${pct(get("greedy").filter((r) => !r.wolfAlive).length / N)} deaths; no-intervention: ${pct(get("none").filter((r) => !r.wolfAlive).length / N)}.`,
);
say(
  `Skills removed, body kept: win ${pct(mean(winsOf("no:petskills")))} vs ${pct(mean(winsOf("strong")))}; no wolf at all: ${pct(mean(winsOf("no:pet")))}.`,
);
say();

// Build concentration
say("### Build concentration (strong bot, one upgrade each)");
say();
const builds = ["strong", "build:dmg", "build:wolf", "build:ward", "build:oil"];
const famBest: Record<string, string> = {};
table(
  ["Build", ...FAMILY_NAMES, "all"],
  builds.map((b) => [
    b === "strong" ? "base" : b.slice(6),
    ...FAMILY_NAMES.map((fam) =>
      pct(
        mean(
          get(b)
            .filter((r) => r.family === fam)
            .map((r) => (r.win ? 1 : 0)),
        ),
      ),
    ),
    pct(mean(winsOf(b))),
  ]),
);
for (const fam of FAMILY_NAMES) {
  const scored = builds.map((b) => ({
    b,
    v: mean(
      get(b)
        .filter((r) => r.family === fam)
        .map((r) => (r.win ? 1 : 0)),
    ),
  }));
  scored.sort((x, y) => y.v - x.v);
  famBest[fam] = scored[0].v - scored[1].v >= 0.03 ? scored[0].b : "tie";
}
const cardUse = new Map<string, number>();
for (const r of S)
  for (const [k, v] of Object.entries(r.stats))
    if (k.startsWith("card:")) cardUse.set(k.slice(5), (cardUse.get(k.slice(5)) ?? 0) + v);
say(
  `Best build per family (3+ points clear, else tie): ${FAMILY_NAMES.map((f) => `${f} ${famBest[f] === "tie" ? "tie" : famBest[f].replace("build:", "").replace("strong", "base")}`).join(", ")}.`,
);
say(
  `Card plays per fight (strong): ${[...cardUse.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${f1(v / S.length)}`)
    .join(", ")}.`,
);
say();

// Watch burden
const noChoice = W.filter((w) => w.legal === 0 || w.gain < NEAR).length / W.length;
say("### Watch burden");
say();
say(
  `- Windows with no useful affordable choice (no legal card, or the best card line beats passing by less than ${NEAR} points): ${pct(noChoice)}. With margin 5: ${pct(W.filter((w) => w.legal === 0 || w.gain < 5).length / W.length)}; margin 20: ${pct(W.filter((w) => w.legal === 0 || w.gain < 20).length / W.length)}.`,
);
say(
  `- An auto-continue that stops only at a useful choice would stop at ${pct(1 - noChoice)} of windows.`,
);
say(
  `- Forced waits (no legal card at all): ${pct(W.filter((w) => w.legal === 0).length / W.length)}.`,
);
say(
  `- Playback: median ${median(res)} s per fight at 1x. Planning time is a human observation; with an assumed 10 s per window the playback share would be ${pct(mean(S.map((r) => r.intervals * 2)) / mean(S.map((r) => r.intervals * 2 + (r.windows?.length ?? 0) * 10)))}.`,
);
say();

// Predictability
const checked = all.filter((r) => r.contractWindows > 0);
const pm = checked.reduce((a, r) => a + r.previewMismatch, 0);
const un = checked.reduce((a, r) => a + r.unexplained, 0);
const rm = checked.reduce((a, r) => a + r.replayMismatch, 0);
const cw = checked.reduce((a, r) => a + r.contractWindows, 0);
say("### Predictability");
say();
say(
  `Checked ${checked.length} fights (strong, greedy, random and all hand-made runs), ${cw} committed windows: preview/resolution mismatches ${pm}, unexplained retargets (ally actions without a logged reason, enemy hits outside the shown footprint) ${un}, replay hash mismatches ${rm}. Path stalls ${f1(perFight(S, "pathStalls"))} per fight.`,
);
say(
  `Generator rejections over ${N * 3} setups (base, mirrored, shifted): ${
    Object.entries(rejections)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ") || "none"
  }.`,
);
say();

// Performance
say("### Performance");
say();
say(
  `Strong bot: ${mean(S.map((r) => r.ms)).toFixed(0)} ms per fight, ${f1(mean(W.map((w) => w.ms)))} ms and ${mean(W.map((w) => w.nodes)).toFixed(0)} simulated intervals per window (p90 ${quant(
    W.map((w) => w.nodes),
    0.9,
  )}). Whole run: ${((performance.now() - t0) / 1000).toFixed(0)} s on ${WORKERS} worker threads.`,
);
say();

// Gates
const cardsGain = paired(winsOf("strong"), winsOf("same:pass"));
const cardsHp = median(hpOf("strong").map((x, k) => x - hpOf("same:pass")[k]));
const dmgGap = paired(winsOf("strong"), winsOf("damage"));
const oneBuild = new Set(Object.values(famBest));
const buildDominates = oneBuild.size === 1 && !oneBuild.has("tie");
const petDeath = wolfDeaths.length / S.length;
const petSkill = paired(winsOf("strong"), winsOf("no:petskills"));
const medFight = median(res);
const gates: [string, boolean, string][] = [
  [
    "Placement: adaptive beats the fixed formation by 5+ points on held-out (mirrored, shifted) fights",
    heldGap.d >= 0.05,
    `${(100 * heldGap.d).toFixed(0)} pts`,
  ],
  [
    "Cards: strong cards beat passing by 10+ win points or 10%+ of squad HP (median)",
    cardsGain.d >= 0.1 || cardsHp >= 0.1 * SQUAD_HP,
    `${(100 * cardsGain.d).toFixed(0)} pts, median HP +${cardsHp}`,
  ],
  [
    "Combinations: damage-only is 5+ points behind strong, and no single build wins every family",
    dmgGap.d >= 0.05 && !buildDominates,
    `${(100 * dmgGap.d).toFixed(0)} pts; ${buildDominates ? "one build" : "no single build"} on top everywhere`,
  ],
  [
    "Watching: at most half the windows lack a useful choice, and median fights stay under 90 s",
    noChoice <= 0.5 && medFight <= 90,
    `${pct(noChoice)} without a useful choice, median resolution ${medFight} s`,
  ],
  [
    "Pet: dies in at most 50% of fights, and removing its skills costs 5+ points",
    petDeath <= 0.5 && petSkill.d >= 0.05,
    `${pct(petDeath)} deaths, skills worth ${(100 * petSkill.d).toFixed(0)} pts`,
  ],
  [
    "Control contract: no preview mismatch, unexplained retarget or replay divergence",
    pm + un + rm === 0,
    `${pm} / ${un} / ${rm}`,
  ],
  [
    "Opposite failure: placement still changes the winner under strong cards (10%+ of fights)",
    pS.winners >= 0.1,
    `${pct(pS.winners)} of fights`,
  ],
];
say("### Failure gates (provisional, from the research)");
say();
table(
  ["Gate", "Result", "Value"],
  gates.map(([g, ok, v]) => [g, ok ? "pass" : "**fail**", v]),
);

const text = L.join("\n");
console.log(text);
if (WRITE) {
  const file = new URL("../RESULT.md", import.meta.url).pathname;
  const begin = "<!-- metrics:start (written by scripts/metrics.ts) -->";
  const end = "<!-- metrics:end -->";
  const old = existsSync(file) ? readFileSync(file, "utf8") : `# e15\n\n${begin}\n${end}\n`;
  const a = old.indexOf(begin),
    b = old.indexOf(end);
  const next =
    a >= 0 && b > a
      ? old.slice(0, a + begin.length) + "\n\n" + text + "\n" + old.slice(b)
      : `${old}\n${begin}\n\n${text}\n${end}\n`;
  writeFileSync(file, next);
  console.error(`wrote ${file}`);
}
