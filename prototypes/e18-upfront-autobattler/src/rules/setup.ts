// Setups: the four up-front choices (3 skills, formation, focus, charm), and helpers to
// list them all, build the default one, and find setups one change away.
import { CHARMS, FOCI, SKILL, SKILLS, type Focus } from "./content.ts";
import type { Setup } from "./sim.ts";

export const SKILL_PLACES = 3;
export const ALL_SKILLS = SKILLS.map((s) => s.id);
export const ALL_CHARMS = CHARMS.map((c) => c.id);

export const summonsOf = (skills: string[]) => skills.filter((id) => !!SKILL[id].summon);

export function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs.slice()];
  const out: T[][] = [];
  xs.forEach((x, i) => {
    for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)]))
      out.push([x, ...rest]);
  });
  return out;
}

export function combinations<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [h, ...t] = xs;
  return [...combinations(t, k - 1).map((c) => [h, ...c]), ...combinations(t, k)];
}

export interface Pool {
  skills: string[];
  charms: string[];
}
export const FULL_POOL: Pool = { skills: ALL_SKILLS, charms: ALL_CHARMS };

// Every setup for a pool. Optional fixed parts (for feature-off tests and partial bots).
export function allSetups(
  pool: Pool,
  fix: { focus?: Focus; charm?: string; order?: "default" } = {},
): Setup[] {
  const out: Setup[] = [];
  const places = Math.min(SKILL_PLACES, pool.skills.length);
  for (const skills of combinations(pool.skills, places)) {
    const units = ["hero", "pet", ...summonsOf(skills)];
    const orders = fix.order ? [defaultOrder(skills)] : permutations(units);
    for (const order of orders)
      for (const focus of fix.focus ? [fix.focus] : FOCI)
        for (const charm of fix.charm ? [fix.charm] : pool.charms)
          out.push({ skills, order, focus, charm });
  }
  return out;
}

// A sensible order without thinking: summons in front, then hero, then pet.
export function defaultOrder(skills: string[]): string[] {
  return [...summonsOf(skills), "hero", "pet"];
}

export const DEFAULT_SETUP: Setup = {
  skills: ["strike", "firebolt", "servant"],
  order: ["servant", "hero", "pet"],
  focus: "front",
  charm: "salts",
};

// The default setup restricted to a pool (run start): keep what is owned, fill from the pool.
export function defaultFor(pool: Pool): Setup {
  const skills = DEFAULT_SETUP.skills.filter((s) => pool.skills.includes(s));
  for (const s of pool.skills)
    if (skills.length < SKILL_PLACES && !skills.includes(s)) skills.push(s);
  const charm = pool.charms.includes(DEFAULT_SETUP.charm) ? DEFAULT_SETUP.charm : pool.charms[0];
  return { skills, order: defaultOrder(skills), focus: "front", charm };
}

// Keep the order when skills change: drop removed summons, add new ones at the front.
export function fixOrder(order: string[], skills: string[]): string[] {
  const want = new Set(["hero", "pet", ...summonsOf(skills)]);
  const kept = order.filter((k) => want.has(k));
  const added = [...want].filter((k) => !kept.includes(k));
  return [...added, ...kept];
}

export interface Change {
  setup: Setup;
  text: string;
}

// Every setup one change away: one skill swapped, two units swapped, the focus or the charm.
export function neighbours(s: Setup, pool: Pool): Change[] {
  const out: Change[] = [];
  s.skills.forEach((old, i) => {
    for (const nu of pool.skills) {
      if (s.skills.includes(nu)) continue;
      const skills = s.skills.map((x, j) => (j === i ? nu : x));
      out.push({
        setup: { ...s, skills, order: fixOrder(s.order, skills) },
        text: `bring ${SKILL[nu].name} instead of ${SKILL[old].name}`,
      });
    }
  });
  for (let i = 0; i < s.order.length; i++)
    for (let j = i + 1; j < s.order.length; j++) {
      const order = s.order.slice();
      [order[i], order[j]] = [order[j], order[i]];
      out.push({
        setup: { ...s, order },
        text: `swap ${unitName(s.order[i])} (slot ${i + 1}) and ${unitName(s.order[j])} (slot ${j + 1})`,
      });
    }
  for (const focus of FOCI)
    if (focus !== s.focus) out.push({ setup: { ...s, focus }, text: `focus ${focus}` });
  for (const charm of pool.charms)
    if (charm !== s.charm) out.push({ setup: { ...s, charm }, text: `take ${charmName(charm)}` });
  return out;
}

export function unitName(key: string): string {
  if (key === "hero") return "Hero";
  if (key === "pet") return "Rustback";
  return SKILL[key]?.summon?.name ?? key;
}
export function charmName(id: string): string {
  return CHARMS.find((c) => c.id === id)?.name ?? id;
}

export const setupKey = (s: Setup) =>
  `${[...s.skills].sort().join("+")}|${s.order.join(">")}|${s.focus}|${s.charm}`;
export const skillsKey = (s: Setup) => [...s.skills].sort().join("+");
