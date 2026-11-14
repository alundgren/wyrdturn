// Six hand-made fights, the boss, and a generator. Each hand-made fight is built so a
// different counter wins.
import { ENEMIES } from "./content.ts";
import { pickOne, rng } from "./rng.ts";
import type { Encounter } from "./sim.ts";

export const FIGHTS: Encounter[] = [
  {
    id: "f1",
    name: "Bone Gate",
    enemies: ["brute", "brute", "archer"],
    text: "Two brutes hold the gate; an archer shoots over them.",
  },
  {
    id: "f2",
    name: "Arrow Slit",
    enemies: ["warden", "archer", "archer", "archer"],
    hpMul: 0.9,
    text: "A warden shields three archers who shoot your back row.",
  },
  {
    id: "f3",
    name: "Skitter Nest",
    enemies: ["spider", "spider", "spider", "spider"],
    hpMul: 1.25,
    dmgMul: 1.1,
    text: "Four spiders that all go for your weakest unit.",
  },
  {
    id: "f4",
    name: "Ember Choir",
    enemies: ["brute", "priest", "priest"],
    hpMul: 1.25,
    text: "A brute in front, two priests raining fire and bile on your slots.",
    ground: [
      { side: "E", slot: 1, kind: "oil", dur: 20 },
      { side: "E", slot: 2, kind: "oil", dur: 20 },
    ],
  },
  {
    id: "f5",
    name: "Iron Line",
    enemies: ["warden", "warden", "archer"],
    text: "Two armoured, unmovable wardens. Plain hits barely scratch them.",
  },
  {
    id: "f6",
    name: "Grave Court",
    enemies: ["brute", "spider", "priest", "warden"],
    hpMul: 0.9,
    text: "A bit of everything. Pick the threat you can't afford to ignore.",
  },
];

export const BOSS: Encounter = {
  id: "boss",
  name: "The Ossuary King",
  enemies: ["king"],
  boss: true,
  text: "Three phases. The fight pauses between them so you can change your setup.",
};

const COST: Record<string, number> = { brute: 3, archer: 2, priest: 3, spider: 2, warden: 4 };
const FRONT = ["warden", "brute", "spider"];
const ORDER = (k: string) => (FRONT.includes(k) ? FRONT.indexOf(k) : 3 + (k === "priest" ? 1 : 0));

// Generated fight: a budget by difficulty (1-5), one main threat, melee in front.
export function generate(seed: number, difficulty = 3): Encounter {
  const r = rng(seed * 7919 + difficulty);
  const kinds = Object.keys(ENEMIES);
  const main = pickOne(r, kinds);
  let budget = 6 + 2 * difficulty;
  const out: string[] = [main];
  budget -= COST[main];
  if (r() < 0.6 && budget >= COST[main]) {
    out.push(main);
    budget -= COST[main];
  }
  while (out.length < 4) {
    const fits = kinds.filter((k) => COST[k] <= budget);
    if (!fits.length) break;
    const k = pickOne(r, fits);
    out.push(k);
    budget -= COST[k];
  }
  // at least one unit that fights from the front
  if (!out.some((k) => FRONT.includes(k))) out[out.length - 1] = "brute";
  out.sort((a, b) => ORDER(a) - ORDER(b));
  const enc: Encounter = {
    id: `gen-${seed}-${difficulty}`,
    name: `Generated ${seed} (d${difficulty})`,
    enemies: out,
    // even out total enemy HP per difficulty (armour counts extra): wardens and brutes have
    // twice the HP of spiders and archers, which made some mixes far harder than others
    hpMul:
      (100 + 7 * difficulty) /
      out.reduce((a, k) => a + ENEMIES[k].hp * (1 + 0.15 * (ENEMIES[k].armour ?? 0)), 0),
    dmgMul: 0.95 + 0.02 * difficulty,
  };
  const g = r();
  if (g < 0.15)
    enc.ground = [
      { side: "E", slot: 0, kind: "oil", dur: 20 },
      { side: "E", slot: 1, kind: "oil", dur: 20 },
    ];
  else if (g < 0.25) enc.ground = [{ side: "P", slot: 1, kind: "poison", dur: 8 }];
  return enc;
}
