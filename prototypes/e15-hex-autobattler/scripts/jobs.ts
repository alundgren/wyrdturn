// One metrics job: a config name and a fight seed -> a compact result. Used by the worker
// threads of scripts/metrics.ts (and directly when running single-threaded).
import {
  type Build,
  type Command,
  type Flags,
  type FightSetup,
  BASE_BUILD,
  enemies,
  hero,
  newFight,
  replay,
  wolf,
} from "../src/rules/combat.ts";
import { authored, generate } from "../src/rules/encounters.ts";
import {
  type Policy,
  POLICIES,
  STRONG,
  damagePolicy,
  deployOnlyPolicy,
  playFight,
  randomCardsPolicy,
  randomDeploy,
  strongFrom,
  strongPolicy,
  withDeploy,
} from "../src/rules/bots.ts";
import { rng } from "../src/rules/rng.ts";

export interface Job {
  cfg: string;
  i: number;
  deploy?: Command[];
  k?: number;
  e?: number;
}

export interface JobResult {
  cfg: string;
  i: number;
  win: boolean;
  intervals: number;
  heroHp: number;
  wolfHp: number;
  wolfAlive: boolean;
  squadHp: number;
  enemyHpLeft: number;
  cards: number;
  energy: number;
  commands: number;
  nodes: number;
  ms: number;
  difficulty: number;
  family: string;
  stats: Record<string, number>;
  deploy: Command[];
  windows?: {
    distinct: number;
    distinctNoPos: number;
    near: number;
    nearNoPos: number;
    cats: string;
    legal: number;
    gain: number;
    nodes: number;
    ms: number;
  }[];
  previewMismatch: number;
  unexplained: number;
  replayMismatch: number;
  contractWindows: number;
}

export const FIGHTS = 300;
export const NEAR = 10; // score margin for "near-best" lines (about 3 enemy HP or 2 hero HP)

const strong = strongPolicy();
const BUILDS: Record<string, Build> = {
  "build:dmg": { ...BASE_BUILD, heroDmg: 1 },
  "build:wolf": { ...BASE_BUILD, wolfHp: 2, guardBonus: 1 },
  "build:ward": { ...BASE_BUILD, swap: "ward" },
  "build:oil": { ...BASE_BUILD, swap: "oil" },
};
const ABLATE: Record<string, Flags> = {
  "no:ground": { noGround: true },
  "no:pushpull": { noPushPull: true },
  "no:summons": { noSummons: true },
  "no:petskills": { noPetSkills: true },
  "no:pet": { noPet: true },
};

export function setupFor(cfg: string, i: number): FightSetup {
  if (cfg.startsWith("auth")) return authored(Number(cfg.split(":")[1]));
  const d = 1 + (i % 5);
  if (cfg.endsWith("@mirror")) return generate(i, d, { mirror: true });
  if (cfg.endsWith("@shift")) return generate(i, d, { shift: i % 2 ? 1 : -1 });
  return generate(i, d);
}

export function runJob(j: Job): JobResult {
  const { cfg, i } = j;
  const setup = setupFor(cfg, i);
  let build: Build = BASE_BUILD;
  let flags: Flags = {};
  let policy: Policy;
  const base = cfg.split("@")[0];
  if (cfg.startsWith("auth")) policy = POLICIES[cfg.split(":")[2]];
  else if (BUILDS[base]) {
    build = BUILDS[base];
    policy = strong;
  } else if (ABLATE[base]) {
    flags = ABLATE[base];
    policy = strong;
  } else if (base === "prio:nearest")
    policy = strongPolicy({ ...STRONG, priorities: ["nearest"] }, "prio:nearest");
  else if (base === "same:pass") policy = withDeploy(deployOnlyPolicy, j.deploy!, base);
  else if (base === "same:damage") policy = withDeploy(damagePolicy, j.deploy!, base);
  else if (base === "same:random") policy = withDeploy(randomCardsPolicy, j.deploy!, base);
  else if (base === "frontload") {
    flags = { frontLoad: j.k, frontEnergy: j.e };
    policy = strong;
  } else if (base.startsWith("place:")) {
    const k = Number(base.split(":")[2]);
    const probe = newFight(setup, i);
    const cmds = randomDeploy(probe, rng(i * 977 + k * 13));
    policy = base.startsWith("place:strong")
      ? strongFrom(cmds)
      : withDeploy(deployOnlyPolicy, cmds, "placePass");
  } else policy = POLICIES[base];
  if (!policy) throw new Error(`unknown config ${cfg}`);
  const seed = cfg.startsWith("auth") ? 100 + i : i;
  const start = newFight(setup, seed, build, flags);
  const check =
    base === "strong" || cfg.startsWith("auth") || base === "greedy" || base === "random";
  const r = playFight(start, policy, seed, { record: base === "strong", check });
  const s = r.state;
  let replayMismatch = 0;
  if (check) {
    const again = replay(setup, seed, s.log, build, flags);
    if (again.hashes.join() !== s.hashes.join()) replayMismatch = 1;
  }
  const h = hero(s),
    w = wolf(s);
  const energy = Object.entries(s.stats)
    .filter(([k]) => k.startsWith("card:"))
    .reduce((a, [k, v]) => a + v * ENERGY_OF[k.slice(5)], 0);
  return {
    cfg,
    i,
    win: r.win,
    intervals: r.intervals,
    heroHp: h?.hp ?? 0,
    wolfHp: w?.hp ?? 0,
    wolfAlive: !!w,
    squadHp: (h?.hp ?? 0) + (w?.hp ?? 0),
    enemyHpLeft: enemies(s).reduce((a, e) => a + e.hp, 0),
    cards: r.cards,
    energy,
    commands: r.commands,
    nodes: r.nodes,
    ms: r.ms,
    difficulty: setup.difficulty,
    family: setup.family,
    stats: s.stats,
    deploy: r.deploy,
    windows: r.windows.length
      ? r.windows.map((wi) => {
          const top = Math.max(...wi.outcomes.map((o) => o.score));
          const near = wi.outcomes.filter((o) => o.score >= top - NEAR);
          return {
            distinct: new Set(wi.outcomes.map((o) => o.key)).size,
            distinctNoPos: new Set(wi.outcomes.map((o) => o.keyNoPos)).size,
            near: new Set(near.map((o) => o.key)).size,
            nearNoPos: new Set(near.map((o) => o.keyNoPos)).size,
            cats: wi.cats,
            legal: wi.legal,
            gain: wi.best - wi.pass,
            nodes: wi.nodes,
            ms: wi.ms,
          };
        })
      : undefined,
    previewMismatch: r.contract.previewMismatch,
    unexplained: r.contract.unexplained,
    replayMismatch,
    contractWindows: r.contract.windows,
  };
}

const ENERGY_OF: Record<string, number> = {
  strike: 1,
  firebolt: 1,
  reposition: 1,
  shoulder: 1,
  hook: 1,
  oil: 1,
  miasma: 2,
  ward: 1,
  servant: 2,
  totem: 2,
};
