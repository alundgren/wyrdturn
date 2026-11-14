// A short run: 4 fights, then the boss. Before each fight pick one of two doors (each shows
// its enemies and reward); after each win pick rewards. The build grows; HP refills
// between fights; a loss ends the run.
import { CHARM, SKILL } from "./content.ts";
import { BOSS, generate } from "./encounters.ts";
import { pickOne, rng } from "./rng.ts";
import { ALL_CHARMS, ALL_SKILLS, type Pool } from "./setup.ts";
import type { Encounter, Mods } from "./sim.ts";

export const RUN_FIGHTS = 4;
export const START_POOL: Pool = {
  skills: ["strike", "firebolt", "hook", "servant"],
  charms: ["salts", "spark"],
};

export type Reward =
  | { kind: "skill"; id: string; text: string }
  | { kind: "charm"; id: string; text: string }
  | { kind: "up"; id: string; text: string; mod: Mods };

export interface Door {
  enc: Encounter;
  hard: boolean;
  picks: number; // how many of the offered rewards you may take after winning
  text: string;
}

export interface RunState {
  seed: number;
  step: number; // fights won so far (0..RUN_FIGHTS); RUN_FIGHTS means the boss is next
  pool: Pool;
  mods: Mods;
  log: string[];
}

export function newRun(seed: number): RunState {
  return {
    seed,
    step: 0,
    pool: { skills: [...START_POOL.skills], charms: [...START_POOL.charms] },
    mods: {},
    log: [],
  };
}

export function doors(run: RunState): Door[] {
  if (run.step >= RUN_FIGHTS)
    return [{ enc: BOSS, hard: true, picks: 0, text: "The Ossuary King waits." }];
  const d = run.step + 1;
  const easy = generate(run.seed * 100 + run.step * 2 + 1, Math.min(5, d));
  const hard = generate(run.seed * 100 + run.step * 2 + 2, Math.min(5, d + 1));
  return [
    { enc: easy, hard: false, picks: 1, text: "Pick 1 of 3 rewards after the fight." },
    { enc: hard, hard: true, picks: 2, text: "Harder. Pick 2 of 3 rewards after the fight." },
  ];
}

const UP_SKILLS = ["strike", "cleave", "firebolt", "frost", "hook"];

export function rewards(run: RunState): Reward[] {
  const r = rng(run.seed * 977 + run.step * 13 + 5);
  const offer: Reward[] = [];
  const newSkills = ALL_SKILLS.filter((s) => !run.pool.skills.includes(s));
  const newCharms = ALL_CHARMS.filter((c) => !run.pool.charms.includes(c));
  if (newSkills.length) {
    const id = pickOne(r, newSkills);
    offer.push({ kind: "skill", id, text: `New skill: ${SKILL[id].name}. ${SKILL[id].text}` });
  }
  if (newCharms.length && r() < 0.6) {
    const id = pickOne(r, newCharms);
    offer.push({ kind: "charm", id, text: `New charm: ${CHARM[id].name}. ${CHARM[id].text}` });
  } else if (newSkills.length > 1) {
    const id = pickOne(
      r,
      newSkills.filter((s) => !offer.some((o) => o.id === s)),
    );
    offer.push({ kind: "skill", id, text: `New skill: ${SKILL[id].name}. ${SKILL[id].text}` });
  }
  const ups: Reward[] = [
    { kind: "up", id: "herohp", text: "Hero +10 max HP.", mod: { heroHp: 10 } },
    { kind: "up", id: "pethp", text: "Rustback +8 max HP.", mod: { petHp: 8 } },
  ];
  for (const s of UP_SKILLS.filter((x) => run.pool.skills.includes(x))) {
    const name = SKILL[s].name;
    ups.push({
      kind: "up",
      id: `dmg-${s}`,
      text: `${name} deals +2 damage.`,
      mod: { dmg: { [s]: 2 } },
    });
    ups.push({
      kind: "up",
      id: `cd-${s}`,
      text: `${name} recharges 20% faster.`,
      mod: { cd: { [s]: 0.8 } },
    });
  }
  offer.push(pickOne(r, ups));
  return offer;
}

export function applyReward(run: RunState, rw: Reward): RunState {
  const pool = { skills: [...run.pool.skills], charms: [...run.pool.charms] };
  const mods: Mods = {
    heroHp: run.mods.heroHp,
    petHp: run.mods.petHp,
    dmg: { ...run.mods.dmg },
    cd: { ...run.mods.cd },
  };
  if (rw.kind === "skill") pool.skills.push(rw.id);
  if (rw.kind === "charm") pool.charms.push(rw.id);
  if (rw.kind === "up") {
    const m = rw.mod;
    if (m.heroHp) mods.heroHp = (mods.heroHp ?? 0) + m.heroHp;
    if (m.petHp) mods.petHp = (mods.petHp ?? 0) + m.petHp;
    for (const [k, v] of Object.entries(m.dmg ?? {})) mods.dmg![k] = (mods.dmg![k] ?? 0) + v;
    for (const [k, v] of Object.entries(m.cd ?? {})) mods.cd![k] = (mods.cd![k] ?? 1) * v;
  }
  return { ...run, pool, mods, log: [...run.log, rw.text] };
}
