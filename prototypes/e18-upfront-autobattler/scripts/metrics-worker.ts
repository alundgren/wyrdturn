// Worker for scripts/metrics.ts: plays every setup on one fight and sends back a summary.
import { parentPort } from "node:worker_threads";
import {
  scoreAll,
  best,
  won,
  playBoss,
  bossAdaptive,
  outcome,
  strong as strongBot,
  play,
} from "../src/rules/bots.ts";
import { BOSS } from "../src/rules/encounters.ts";
import { applyReward, doors, newRun, rewards, RUN_FIGHTS } from "../src/rules/run.ts";
import {
  allSetups,
  defaultFor,
  DEFAULT_SETUP,
  FULL_POOL,
  neighbours,
  setupKey,
  skillsKey,
} from "../src/rules/setup.ts";
import {
  DEFAULT_OPTS,
  runToEnd,
  startFight,
  type Encounter,
  type RuleOpts,
  type Setup,
} from "../src/rules/sim.ts";

const SETUPS = allSetups(FULL_POOL);
const KEYS = SETUPS.map(setupKey);
const INDEX = new Map(KEYS.map((k, i) => [k, i]));

export interface FightJob {
  kind: "fight";
  enc: Encounter;
  opts: RuleOpts;
  vectors: boolean;
}
export interface BossJob {
  kind: "boss";
  opts: RuleOpts;
}
// For phase-1 setups (by index): does keeping them win, and does re-choosing win?
export interface BossSampleJob {
  kind: "bossSample";
  opts: RuleOpts;
  idx: number[];
}

// A whole run. strong: tries every setup, takes the hard door when it can win it, prefers
// new skills, then charms, then upgrades. default: easy door, default setup, first rewards.
export interface RunJob {
  kind: "run";
  seed: number;
  policy: "strong" | "default";
}
function runJob(job: RunJob) {
  let r = newRun(job.seed);
  let hard = 0;
  const order = { skill: 0, charm: 1, up: 2 };
  for (let step = 0; step < RUN_FIGHTS; step++) {
    const ds = doors(r);
    let pick = ds[0];
    let ok: boolean;
    if (job.policy === "strong") {
      const tries = ds.map((d) => won(strongBot(d.enc, r.pool, DEFAULT_OPTS, r.mods).o));
      pick = tries[1] ? ds[1] : ds[0];
      ok = tries[1] || tries[0];
    } else ok = won(play(pick.enc, defaultFor(r.pool), DEFAULT_OPTS, r.mods));
    if (!ok) return { result: "loss", reached: step + 1, hard };
    if (pick.hard) hard++;
    const offer = rewards(r);
    const take =
      job.policy === "strong"
        ? [...offer].sort((a, b) => order[a.kind] - order[b.kind]).slice(0, pick.picks)
        : offer.slice(0, pick.picks);
    for (const rw of take) r = applyReward(r, rw);
    r = { ...r, step: r.step + 1 };
  }
  const boss = playBoss(
    BOSS,
    job.policy === "strong" ? bossAdaptive(r.pool) : () => defaultFor(r.pool),
    DEFAULT_OPTS,
    r.mods,
  );
  return {
    result: boss.result,
    reached: RUN_FIGHTS + 1,
    hard,
    bossPhases: boss.phases.length,
    skills: r.pool.skills.length,
  };
}

function bossSample(job: BossSampleJob) {
  return job.idx.map((i) => {
    const first = SETUPS[i];
    const keep = playBoss(BOSS, () => first, job.opts).result === "win";
    const adaptive = bossAdaptive(FULL_POOL);
    const adapt = playBoss(BOSS, (n, start) => (n === 0 ? first : adaptive(n, start)), job.opts);
    return { i, keep, adapt: adapt.result === "win" };
  });
}

function fight(job: FightJob) {
  const sc = scoreAll(job.enc, SETUPS, job.opts);
  const b = best(sc);
  const wins = sc.map((x) => won(x.o));
  const winCount = wins.filter(Boolean).length;
  const def = sc[INDEX.get(setupKey(DEFAULT_SETUP))!];
  // one change away from the default: does any single change flip the result?
  const flips = neighbours(DEFAULT_SETUP, FULL_POOL).filter(
    (c) => won(sc[INDEX.get(setupKey(c.setup))!].o) !== won(def.o),
  );
  // within two changes?
  let two = flips.length > 0;
  if (!two && !won(def.o))
    for (const c of neighbours(DEFAULT_SETUP, FULL_POOL)) {
      if (neighbours(c.setup, FULL_POOL).some((d) => won(sc[INDEX.get(setupKey(d.setup))!].o))) {
        two = true;
        break;
      }
    }
  // for each value of each choice: can some setup with that value win?
  const anyWin = (f: (s: Setup) => string) => {
    const m: Record<string, boolean> = {};
    sc.forEach((x) => {
      const k = f(x.setup);
      m[k] = m[k] || won(x.o);
    });
    return m;
  };
  const lens = sc.map((x) => x.o.t).sort((a, c) => a - c);
  return {
    id: job.enc.id,
    best: { key: setupKey(b.setup), setup: b.setup, o: b.o },
    def: def.o,
    defFlips: flips.length,
    defTwo: two,
    winFrac: winCount / sc.length,
    medianT: lens[lens.length >> 1],
    wins: job.vectors ? Buffer.from(packBits(wins)).toString("base64") : "",
    byDim: {
      skills: anyWin(skillsKey),
      focus: anyWin((s) => s.focus),
      charm: anyWin((s) => s.charm),
      order: anyWin((s) => s.order.join(">")),
      heroSlot: anyWin((s) => String(s.order.indexOf("hero"))),
    },
  };
}

function packBits(bs: boolean[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(bs.length / 8));
  bs.forEach((b, i) => {
    if (b) out[i >> 3] |= 1 << (i & 7);
  });
  return out;
}

function boss(job: BossJob) {
  const adaptive = playBoss(BOSS, bossAdaptive(FULL_POOL), job.opts);
  const p1 = adaptive.phases[0].setup;
  const keep = playBoss(BOSS, () => p1, job.opts);
  const def = playBoss(BOSS, () => DEFAULT_SETUP, job.opts);
  // the best setup kept for all three phases (is there one that wins without adapting?)
  let constWins = 0;
  const phase1: number[] = [];
  SETUPS.forEach((s, i) => {
    if (outcome(runToEnd(startFight(BOSS, s, job.opts))).result !== "loss") phase1.push(i);
  });
  let bestConst: { key: string; heroHp: number } | null = null;
  for (const s of SETUPS) {
    const r = playBoss(BOSS, () => s, job.opts);
    if (r.result === "win") {
      constWins++;
      if (!bestConst || r.heroHp > bestConst.heroHp)
        bestConst = { key: setupKey(s), heroHp: r.heroHp };
    }
  }
  // per phase: share of setups that clear the phase from the adaptive bot's start state
  const phaseWinFrac: number[] = [];
  playBoss(
    BOSS,
    (_n, start) => {
      let w = 0;
      for (const s of SETUPS) if (outcome(runToEnd(start(s))).result !== "loss") w++;
      phaseWinFrac.push(w / SETUPS.length);
      return adaptive.phases[phaseWinFrac.length - 1]?.setup ?? DEFAULT_SETUP;
    },
    job.opts,
  );
  return {
    adaptive: { ...adaptive, keys: adaptive.phases.map((p) => setupKey(p.setup)) },
    keep: { result: keep.result, t: keep.t, phases: keep.phases.length },
    def: { result: def.result, t: def.t, phases: def.phases.length },
    constWins,
    constFrac: constWins / SETUPS.length,
    bestConst,
    phaseWinFrac,
    phase1,
  };
}

parentPort!.on("message", (job: FightJob | BossJob | BossSampleJob | RunJob) => {
  parentPort!.postMessage(
    job.kind === "fight"
      ? fight(job)
      : job.kind === "boss"
        ? boss(job)
        : job.kind === "run"
          ? runJob(job)
          : bossSample(job),
  );
});
