// Six hand-made fights and a seeded generator with a validator.
import {
  type Encounter,
  type Kind,
  LANES,
  newFight,
  endTurn,
  clone,
  hero,
  ROWS,
} from "./combat.ts";
import { rng } from "./rng.ts";

export const FIGHTS: Encounter[] = [
  {
    name: "Bone Gate",
    enemies: [
      { kind: "ghoul", lane: 1, row: 3 },
      { kind: "ghoul", lane: 0, row: 4 },
      { kind: "archer", lane: 2, row: 5 },
    ],
  },
  {
    name: "Arrow Lanes",
    enemies: [
      { kind: "archer", lane: 0, row: 5 },
      { kind: "archer", lane: 2, row: 5 },
      { kind: "ghoul", lane: 1, row: 3 },
    ],
    waves: [{ round: 4, spawns: [{ kind: "ghoul", lane: 1 }] }],
  },
  {
    name: "Spear Wall",
    enemies: [
      { kind: "spear", lane: 0, row: 3 },
      { kind: "spear", lane: 2, row: 3 },
      { kind: "ghoul", lane: 1, row: 4 },
    ],
    waves: [{ round: 4, spawns: [{ kind: "spear", lane: 1 }] }],
  },
  {
    name: "Oil Cellar",
    enemies: [
      { kind: "ghoul", lane: 1, row: 4 },
      { kind: "ghoul", lane: 0, row: 5 },
      { kind: "spider", lane: 2, row: 5 },
      { kind: "spider", lane: 1, row: 5 },
    ],
    ground: [
      { lane: 1, row: 2, oil: true },
      { lane: 1, row: 3, oil: true },
      { lane: 0, row: 3, oil: true },
    ],
    waves: [{ round: 3, spawns: [{ kind: "ghoul", lane: 2 }] }],
  },
  {
    name: "Bile Choir",
    enemies: [
      { kind: "warden", lane: 1, row: 3 },
      { kind: "priest", lane: 1, row: 5 },
      { kind: "priest", lane: 0, row: 5 },
      { kind: "ghoul", lane: 2, row: 4 },
    ],
    waves: [
      {
        round: 4,
        spawns: [
          { kind: "spider", lane: 0 },
          { kind: "spider", lane: 2 },
        ],
      },
    ],
  },
  {
    name: "Warden's Wall",
    enemies: [
      { kind: "warden", lane: 1, row: 3 },
      { kind: "archer", lane: 1, row: 5 },
      { kind: "priest", lane: 2, row: 5 },
      { kind: "spider", lane: 0, row: 4 },
    ],
    waves: [
      {
        round: 3,
        spawns: [
          { kind: "ghoul", lane: 0 },
          { kind: "spear", lane: 2 },
        ],
      },
      {
        round: 6,
        spawns: [
          { kind: "spider", lane: 1 },
          { kind: "ghoul", lane: 2 },
        ],
      },
    ],
    hpBonus: 1,
  },
];

const COST: Record<string, number> = {
  ghoul: 3,
  spear: 3,
  archer: 3,
  priest: 4,
  spider: 2,
  warden: 5,
};
const FRONT: Kind[] = ["ghoul", "ghoul", "spear", "spider", "warden"];
const BACK: Kind[] = ["archer", "priest"];

export interface GenInfo {
  rejected: number;
}

// difficulty 1..5
export function generate(
  seed: number,
  difficulty = 1 + ((seed - 1) % 5),
  info?: GenInfo,
): Encounter {
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = rng(seed * 7717 + attempt * 131 + difficulty);
    const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const budget = 10 + 4 * difficulty;
    const all: Kind[] = [];
    let left = budget;
    let back = 0;
    while (left >= 2) {
      const wantBack = back < 1 + Math.floor(difficulty / 3) && r() < 0.35;
      let k = wantBack ? pick(BACK) : pick(FRONT);
      if (k === "warden" && difficulty < 3) k = "ghoul";
      if (COST[k] > left) k = left >= 3 ? "ghoul" : "spider";
      if (COST[k] > left) break;
      all.push(k);
      if (BACK.includes(k)) back++;
      left -= COST[k];
    }
    // first group and waves
    const waves = difficulty >= 5 ? 3 : difficulty >= 3 ? 2 : difficulty >= 2 ? 1 : 0;
    const firstN = Math.max(2, Math.min(5, Math.ceil(all.length * (waves ? 0.55 : 1))));
    const first = all.slice(0, firstN);
    const rest = all.slice(firstN);
    const enc: Encounter = {
      name: `Generated ${seed} (d${difficulty})`,
      enemies: [],
      waves: [],
      ground: [],
    };
    const used = new Set<string>();
    for (const k of first) {
      const rows = BACK.includes(k) ? [4, 5] : k === "spear" ? [3, 4] : [2, 3, 4];
      for (let t = 0; t < 20; t++) {
        const lane = Math.floor(r() * LANES);
        const row = pick(rows);
        if (used.has(`${lane},${row}`)) continue;
        used.add(`${lane},${row}`);
        enc.enemies.push({ kind: k, lane, row });
        break;
      }
    }
    for (let w = 0; w < waves && rest.length; w++) {
      const n = Math.ceil(rest.length / (waves - w));
      const spawns = rest.splice(0, n).map((kind) => ({ kind, lane: Math.floor(r() * LANES) }));
      enc.waves!.push({ round: 3 + w * 2, spawns });
    }
    if (r() < 0.3) {
      const lane = Math.floor(r() * LANES);
      const row = 2 + Math.floor(r() * 2);
      enc.ground!.push({ lane, row, oil: true }, { lane, row: row + 1, oil: true });
    }
    if (r() < 0.15) enc.ground!.push({ lane: Math.floor(r() * LANES), row: 2, ice: 3 });
    enc.hpBonus = difficulty - 1;
    const why = validate(enc);
    if (!why) return enc;
    if (info) info.rejected++;
  }
  return FIGHTS[0];
}

// Reject fields that are unfair or broken. Returns a reason, or null if fine.
export function validate(enc: Encounter): string | null {
  const seen = new Set<string>();
  for (const e of enc.enemies) {
    const k = `${e.lane},${e.row}`;
    if (seen.has(k)) return "two enemies on one cell";
    if (e.row < 1 || e.row > ROWS) return "enemy off the field";
    seen.add(k);
  }
  if (enc.enemies.length < 2) return "too few enemies";
  // opening: if the player does nothing, the first enemy phase may not take more than 60% of the hero
  const s = newFight(enc, 1);
  const h0 = hero(s)!.hp;
  const t = clone(s);
  endTurn(t);
  const h1 = hero(t)?.hp ?? 0;
  if (h0 - h1 > 0.6 * h0) return "opening damage";
  return null;
}
