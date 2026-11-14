// Do up-front choices matter? Plays every setup (9,800) on every fight, on worker threads.
//   node scripts/metrics.ts [N=120] [--off M=40] [--quick] [--write]
// N generated fights (seeds 1..N, difficulty 1-5 in turn) plus the 6 hand-made fights and
// the boss. --off: fights used for the feature-off tests. --quick skips feature-off and
// the boss. --write replaces the numbers block in RESULT.md.
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { FIGHTS, generate } from "../src/rules/encounters.ts";
import { CHARMS, FOCI, SKILLS } from "../src/rules/content.ts";
import { allSetups, DEFAULT_SETUP, FULL_POOL, setupKey } from "../src/rules/setup.ts";
import { DEFAULT_OPTS, type Encounter, type RuleOpts } from "../src/rules/sim.ts";

const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 120);
const offIdx = args.indexOf("--off");
const OFF_N = offIdx >= 0 ? Number(args[offIdx + 1]) : 40;
const QUICK = args.includes("--quick");
const WRITE = args.includes("--write");
const SETUPS = allSetups(FULL_POOL);
const KEYS = SETUPS.map(setupKey);

// ---------------- worker pool ----------------------------------------------------------------
const workers = Array.from(
  { length: Math.max(1, availableParallelism() - 0) },
  () => new Worker(new URL("./metrics-worker.ts", import.meta.url)),
);
const queue: { job: unknown; res: (v: any) => void }[] = [];
const idle = [...workers];
function run<T = any>(job: unknown): Promise<T> {
  return new Promise((res) => {
    queue.push({ job, res });
    pump();
  });
}
function pump() {
  while (idle.length && queue.length) {
    const w = idle.pop()!;
    const { job, res } = queue.shift()!;
    w.once("message", (m) => {
      idle.push(w);
      res(m);
      pump();
    });
    w.postMessage(job);
  }
}

const t0 = Date.now();
const gens: Encounter[] = Array.from({ length: N }, (_, i) => generate(i + 1, 1 + (i % 5)));
const fightJob = (enc: Encounter, opts: RuleOpts = DEFAULT_OPTS, vectors = true) =>
  run({ kind: "fight", enc, opts, vectors });

const [genRes, handRes] = await Promise.all([
  Promise.all(gens.map((e) => fightJob(e))),
  Promise.all(FIGHTS.map((e) => fightJob(e, DEFAULT_OPTS, false))),
]);

const OFFS: [string, Partial<RuleOpts>][] = [
  ["ground effects", { ground: false }],
  ["push and pull", { move: false }],
  ["focus rule (always front)", { focus: false }],
  ["charms", { charm: false }],
  ["the dark", { dark: false }],
];
const offRes = QUICK
  ? []
  : await Promise.all(
      OFFS.map(([, o]) =>
        Promise.all(gens.slice(0, OFF_N).map((e) => fightJob(e, { ...DEFAULT_OPTS, ...o }))),
      ),
    );
const bossRes = QUICK ? null : await run({ kind: "boss", opts: DEFAULT_OPTS });
// sample of setups that clear phase 1: keep them for the whole boss, or re-choose per phase
const BOSS_K = 32;
const bossSample: { i: number; keep: boolean; adapt: boolean }[] = [];
if (bossRes) {
  const p1: number[] = bossRes.phase1;
  const pick = Array.from(
    { length: Math.min(BOSS_K, p1.length) },
    (_, k) => p1[Math.floor((k * p1.length) / Math.min(BOSS_K, p1.length))],
  );
  const chunks = workers.map((_, w) => pick.filter((_, k) => k % workers.length === w));
  for (const part of await Promise.all(
    chunks.map((idx) => run({ kind: "bossSample", opts: DEFAULT_OPTS, idx })),
  ))
    bossSample.push(...part);
}
const RUNS = QUICK ? 0 : 24;
const runRes: Record<string, any[]> = { strong: [], default: [] };
if (RUNS)
  for (const policy of ["strong", "default"] as const)
    runRes[policy] = await Promise.all(
      Array.from({ length: RUNS }, (_, i) => run({ kind: "run", seed: i + 1, policy })),
    );
for (const w of workers) await w.terminate();

// ---------------- numbers ----------------------------------------------------------------
const pct = (x: number) => `${Math.round(100 * x)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};
const quant = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};
const isWin = (o: { result: string }) => o.result !== "loss";
const bits = (b64: string) => Buffer.from(b64, "base64");
const bit = (buf: Buffer, i: number) => (buf[i >> 3] >> (i & 7)) & 1;

function summary(res: any[]) {
  const strong = mean(res.map((r) => (isWin(r.best.o) ? 1 : 0)));
  const def = mean(res.map((r) => (isWin(r.def) ? 1 : 0)));
  const random = mean(res.map((r) => r.winFrac));
  // blind: one setup for every fight, chosen on the other half of the fights (2-fold)
  const vec = res.map((r) => bits(r.wins));
  const pickBlind = (train: number[]) => {
    let bi = 0;
    let bw = -1;
    for (let i = 0; i < SETUPS.length; i++) {
      let w = 0;
      for (const f of train) w += bit(vec[f], i);
      if (w > bw) {
        bw = w;
        bi = i;
      }
    }
    return bi;
  };
  const idx = res.map((_, i) => i);
  const odd = idx.filter((i) => i % 2);
  const even = idx.filter((i) => !(i % 2));
  const bOdd = pickBlind(odd);
  const bEven = pickBlind(even);
  const blind =
    (even.reduce((a, f) => a + bit(vec[f], bOdd), 0) +
      odd.reduce((a, f) => a + bit(vec[f], bEven), 0)) /
    res.length;
  const bAll = pickBlind(idx);
  const blindIn = idx.reduce((a, f) => a + bit(vec[f], bAll), 0) / res.length;
  return {
    strong,
    def,
    random,
    blind,
    blindIn,
    blindKey: KEYS[bAll],
    blindKeys: [KEYS[bOdd], KEYS[bEven]],
  };
}

const S = summary(genRes);
const n = genRes.length;
const strongWins = genRes.filter((r) => isWin(r.best.o));
const lines: string[] = [];
const out = (s = "") => lines.push(s);

out(
  `Sample: ${n} generated fights (seeds 1-${n}, difficulty 1-5 in turn), the 6 hand-made fights and the boss. ` +
    `Every one of the ${SETUPS.length} setups is played on every fight (fights are deterministic, so one play is the result). ` +
    `Run: \`node scripts/metrics.ts ${N}${QUICK ? " --quick" : ` --off ${OFF_N}`}\`, ${((Date.now() - t0) / 1000).toFixed(0)} s on ${workers.length} threads.`,
);
out();
out("### Win rate by policy (generated fights)");
out();
out("| Policy | Win | What it is |");
out("| --- | ---: | --- |");
out(`| strong | ${pct(S.strong)} | best of all setups for this fight |`);
out(
  `| blind | ${pct(S.blind)} | one setup for every fight, picked on the other half of the fights (in-sample: ${pct(S.blindIn)}, \`${S.blindKey}\`) |`,
);
out(`| default | ${pct(S.def)} | \`${setupKey(DEFAULT_SETUP)}\` |`);
out(
  `| random | ${pct(S.random)} | a random setup (exact: the share of setups that win, averaged) |`,
);
out();

// variety and pick rates
const bestSkill = new Map<string, number>();
for (const r of genRes) {
  const k = [...r.best.setup.skills].sort((a: string, b: string) => a.localeCompare(b)).join("+");
  bestSkill.set(k, (bestSkill.get(k) ?? 0) + 1);
}
const topSkill = [...bestSkill.entries()].sort((a, b) => b[1] - a[1]);
const distinctBest = new Set(genRes.map((r) => r.best.key)).size;
const share = (f: (r: any) => boolean) => mean(genRes.map((r) => (f(r) ? 1 : 0)));
const skillPick = SKILLS.map(
  (s) => [s.name, share((r) => r.best.setup.skills.includes(s.id))] as const,
);
const focusPick = FOCI.map((f) => [f, share((r) => r.best.setup.focus === f)] as const);
const charmPick = CHARMS.map((c) => [c.name, share((r) => r.best.setup.charm === c.id)] as const);
const heroSlot = [0, 1, 2, 3].map(
  (i) => [`slot ${i + 1}`, share((r) => r.best.setup.order.indexOf("hero") === i)] as const,
);
out("### Does the best setup change from fight to fight?");
out();
out(
  `- ${distinctBest} different best setups in ${n} fights; ${bestSkill.size} different skill sets.`,
);
out(
  `- Most common best skill set: ${topSkill
    .slice(0, 3)
    .map(([k, c]) => `\`${k}\` ${pct(c / n)}`)
    .join(", ")}.`,
);
out();
out("Strong bot's picks (share of fights):");
out();
out("| Choice | Options |");
out("| --- | --- |");
out(`| Skills | ${skillPick.map(([k, v]) => `${k} ${pct(v)}`).join(", ")} |`);
out(`| Focus | ${focusPick.map(([k, v]) => `${k} ${pct(v)}`).join(", ")} |`);
out(`| Charm | ${charmPick.map(([k, v]) => `${k} ${pct(v)}`).join(", ")} |`);
out(`| Hero slot | ${heroSlot.map(([k, v]) => `${k} ${pct(v)}`).join(", ")} |`);
out();

// value of adapting each choice: fix it to its best single value, keep choosing the rest
const dims: [string, string][] = [
  ["skills", "skills"],
  ["formation", "order"],
  ["hero slot", "heroSlot"],
  ["focus", "focus"],
  ["charm", "charm"],
];
out("### What each choice is worth");
out();
out("Fix one choice to its single best value for all fights and still choose the rest per fight:");
out();
out("| Choice fixed | Best fixed value | Win | Lost vs strong |");
out("| --- | --- | ---: | ---: |");
const dimLoss: Record<string, number> = {};
for (const [name, dim] of dims) {
  const counts = new Map<string, number>();
  for (const r of genRes)
    for (const [v, w] of Object.entries(r.byDim[dim] as Record<string, boolean>))
      if (w) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [bv, bc] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
  dimLoss[name] = S.strong - bc / n;
  out(
    `| ${name} | \`${dim === "heroSlot" ? `slot ${Number(bv) + 1}` : bv}\` | ${pct(bc / n)} | ${Math.round(100 * dimLoss[name])} pts |`,
  );
}
out();

// closeness and length
const wf = genRes.map((r) => r.winFrac);
const inBand = mean(wf.map((x) => (x >= 0.05 && x <= 0.5 ? 1 : 0)));
const heroLeft = strongWins.map((r) => r.best.o.heroHp);
const ts = genRes.map((r) => r.best.o.t);
const defLoss = genRes.filter((r) => !isWin(r.def));
const flipShare = mean(defLoss.map((r) => (r.defFlips > 0 ? 1 : 0)));
const twoShare = mean(defLoss.map((r) => (r.defTwo ? 1 : 0)));
out("### How close, how long");
out();
out("| Measure | Value |");
out("| --- | ---: |");
out(
  `| Share of setups that win, median fight (p10-p90) | ${pct(median(wf))} (${pct(quant(wf, 0.1))}-${pct(quant(wf, 0.9))}) |`,
);
out(`| Fights where 5-50% of setups win | ${pct(inBand)} |`);
out(
  `| Fights nobody can win / everything wins | ${pct(mean(wf.map((x) => (x === 0 ? 1 : 0))))} / ${pct(mean(wf.map((x) => (x > 0.95 ? 1 : 0))))} |`,
);
out(
  `| Hero HP left in strong's wins, median (p10-p90) | ${pct(median(heroLeft))} (${pct(quant(heroLeft, 0.1))}-${pct(quant(heroLeft, 0.9))}) |`,
);
out(
  `| Strong's fight length at 1x, median (p10-p90) | ${median(ts).toFixed(1)} s (${quant(ts, 0.1).toFixed(1)}-${quant(ts, 0.9).toFixed(1)}) |`,
);
out(`| Strong's fights over 45 s | ${pct(mean(ts.map((t) => (t > 45 ? 1 : 0))))} |`);
out(`| Default's fight length, median | ${median(genRes.map((r) => r.def.t)).toFixed(1)} s |`);
out(
  `| Median fight length over all setups (median of fights) | ${median(genRes.map((r) => r.medianT)).toFixed(1)} s |`,
);
out(
  `| Default losses where one change wins / two changes win | ${pct(flipShare)} / ${pct(twoShare)} of ${defLoss.length} |`,
);
out();

// feature-off
const offSum = offRes.map((res) => summary(res));
const baseOff = QUICK ? null : summary(genRes.slice(0, OFF_N));
const changed = offRes.map((res) =>
  mean(res.map((r: any, i: number) => (r.best.key !== genRes[i].best.key ? 1 : 0))),
);
const skillChanged = offRes.map((res) =>
  mean(
    res.map((r: any, i: number) =>
      [...r.best.setup.skills].sort((a: string, b: string) => a.localeCompare(b)).join() !==
      [...genRes[i].best.setup.skills].sort((a: string, b: string) => a.localeCompare(b)).join()
        ? 1
        : 0,
    ),
  ),
);
if (!QUICK) {
  out(`### Feature-off tests (first ${OFF_N} generated fights)`);
  out();
  out(
    "| Turned off | Strong | Default | Random | Blind | Strong - default | Best setup changes | Best skills change |",
  );
  out("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  out(
    `| nothing | ${pct(baseOff!.strong)} | ${pct(baseOff!.def)} | ${pct(baseOff!.random)} | ${pct(baseOff!.blind)} | ${Math.round(100 * (baseOff!.strong - baseOff!.def))} pts | - | - |`,
  );
  OFFS.forEach(([name], i) => {
    const x = offSum[i];
    out(
      `| ${name} | ${pct(x.strong)} | ${pct(x.def)} | ${pct(x.random)} | ${pct(x.blind)} | ${Math.round(100 * (x.strong - x.def))} pts | ${pct(changed[i])} | ${pct(skillChanged[i])} |`,
    );
  });
  out();
}

// hand-made
out("### Hand-made fights");
out();
out("| Fight | Enemies | Setups that win | Default | Strong: setup | Strong: length, hero HP |");
out("| --- | --- | ---: | --- | --- | --- |");
FIGHTS.forEach((f, i) => {
  const r = handRes[i];
  out(
    `| ${i + 1} ${f.name} | ${f.enemies.join(", ")} | ${pct(r.winFrac)} | ${r.def.result}, ${r.def.t.toFixed(1)} s | \`${r.best.key}\` | ${r.best.o.result}, ${r.best.o.t.toFixed(1)} s, ${pct(r.best.o.heroHp)} |`,
  );
});
out();

// boss
let bossGap = 0;
if (bossRes) {
  const b = bossRes;
  out("### Boss (three phases)");
  out();
  out("| Policy | Result | Phases reached | Length |");
  out("| --- | --- | ---: | ---: |");
  out(
    `| adaptive: best setup per phase | ${b.adaptive.result} | ${b.adaptive.phases.length} | ${b.adaptive.t.toFixed(1)} s |`,
  );
  out(
    `| keep: phase-1 best kept | ${b.keep.result} | ${b.keep.phases} | ${b.keep.t.toFixed(1)} s |`,
  );
  out(`| default | ${b.def.result} | ${b.def.phases} | ${b.def.t.toFixed(1)} s |`);
  out();
  out(
    `- Setups that win all three phases without changing: ${b.constWins} of ${SETUPS.length} (${pct(b.constFrac)})${b.bestConst ? `; best \`${b.bestConst.key}\`` : ""}.`,
  );
  out(
    `- Share of setups that clear each phase from the adaptive bot's position: ${b.phaseWinFrac.map((x: number) => pct(x)).join(", ")}.`,
  );
  const keepW = mean(bossSample.map((x) => (x.keep ? 1 : 0)));
  const adaptW = mean(bossSample.map((x) => (x.adapt ? 1 : 0)));
  bossGap = adaptW - keepW;
  out(
    `- Setups that clear phase 1: ${b.phase1.length} (${pct(b.phase1.length / SETUPS.length)}). Of ${bossSample.length} of them (evenly spaced), kept for the whole fight: ${pct(keepW)} win; re-chosen for phases 2 and 3 (best setup per phase): ${pct(adaptW)} win.`,
  );
  out(
    `- Adaptive picks: ${b.adaptive.keys.map((k: string, i: number) => `phase ${i + 1} \`${k}\``).join("; ")}.`,
  );
  out();
}

// runs
if (RUNS) {
  out(`### Runs (${RUNS} seeds: 4 fights, then the boss)`);
  out();
  out(
    "| Policy | Run won | Lost before the boss | Lost to the boss | Hard doors taken (per run) |",
  );
  out("| --- | ---: | ---: | ---: | ---: |");
  for (const p of ["strong", "default"]) {
    const rs = runRes[p];
    const wonR = mean(rs.map((r) => (r.result === "win" ? 1 : 0)));
    const early = mean(rs.map((r) => (r.result === "loss" && r.reached <= 4 ? 1 : 0)));
    const bossL = mean(rs.map((r) => (r.result === "loss" && r.reached === 5 ? 1 : 0)));
    out(
      `| ${p} | ${pct(wonR)} | ${pct(early)} | ${pct(bossL)} | ${mean(rs.map((r) => r.hard)).toFixed(1)} |`,
    );
  }
  out();
}

// gates
const gate = (name: string, ok: boolean, val: string) => ({ name, ok, val });
const pickMax = Math.max(
  ...skillPick.map((x) => x[1]),
  ...focusPick.map((x) => x[1]),
  ...charmPick.map((x) => x[1]),
);
const pickMin = Math.min(
  ...skillPick.map((x) => x[1]),
  ...focusPick.map((x) => x[1]),
  ...charmPick.map((x) => x[1]),
);
const gates = [
  gate(
    "Choices matter: strong - default >= 25 pts and strong - random >= 40 pts",
    S.strong - S.def >= 0.25 && S.strong - S.random >= 0.4,
    `${Math.round(100 * (S.strong - S.def))} / ${Math.round(100 * (S.strong - S.random))} pts`,
  ),
  gate(
    "Adapting pays: strong - blind >= 15 pts",
    S.strong - S.blind >= 0.15,
    `${Math.round(100 * (S.strong - S.blind))} pts`,
  ),
  gate(
    "No dominant skill set: top best skill set in <= 30% of fights",
    topSkill[0][1] / n <= 0.3,
    pct(topSkill[0][1] / n),
  ),
  gate(
    "No dead or forced option: every skill, focus and charm picked in 5-70% of fights",
    pickMin >= 0.05 && pickMax <= 0.7,
    `${pct(pickMin)}-${pct(pickMax)}`,
  ),
  gate(
    "Fights are close: 5-50% of setups win in half the fights or more",
    inBand >= 0.5,
    pct(inBand),
  ),
  gate(
    "Wins are not walkovers: median hero HP left 30-80%",
    median(heroLeft) >= 0.3 && median(heroLeft) <= 0.8,
    pct(median(heroLeft)),
  ),
  gate(
    "Length: strong's median 15-40 s, 90% under 45 s",
    median(ts) >= 15 && median(ts) <= 40 && quant(ts, 0.9) <= 45,
    `${median(ts).toFixed(1)} s, p90 ${quant(ts, 0.9).toFixed(1)} s`,
  ),
  gate(
    "Losses are explainable: two changes or fewer win after 50%+ of default losses",
    twoShare >= 0.5,
    `${pct(flipShare)} one, ${pct(twoShare)} two`,
  ),
];
if (!QUICK) {
  const featOk = OFFS.slice(0, 4).map((_, i) => changed[i] >= 0.25);
  gates.push(
    gate(
      "Features count: turning off ground, push/pull, focus or charms changes the best setup in 25%+ of fights",
      featOk.every(Boolean),
      OFFS.slice(0, 4)
        .map(([nm], i) => `${nm.split(" ")[0]} ${pct(changed[i])}`)
        .join(", "),
    ),
  );
}
if (bossRes)
  gates.push(
    gate(
      "Boss phases: re-choosing beats keeping the phase-1 setup by 20+ pts",
      bossGap >= 0.2,
      `${Math.round(100 * bossGap)} pts`,
    ),
  );
out("### Gates");
out();
out("| Gate | Value | Pass |");
out("| --- | --- | --- |");
for (const g of gates) out(`| ${g.name} | ${g.val} | ${g.ok ? "pass" : "**fail**"} |`);

const text = lines.join("\n");
console.log(text);
if (WRITE) {
  const file = new URL("../RESULT.md", import.meta.url);
  const md = readFileSync(file, "utf8");
  const a = "<!-- metrics:start (written by scripts/metrics.ts --write) -->";
  const z = "<!-- metrics:end -->";
  const i = md.indexOf(a);
  const j = md.indexOf(z);
  if (i < 0 || j < 0) throw new Error("RESULT.md has no metrics markers");
  writeFileSync(file, `${md.slice(0, i + a.length)}\n\n${text}\n\n${md.slice(j)}`);
  console.log("\nwrote RESULT.md");
}
