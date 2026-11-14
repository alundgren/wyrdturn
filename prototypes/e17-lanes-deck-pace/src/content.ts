// Units, cards, enemy kinds and fights for e17. Data only: rules.ts reads it.
import type { Ability, Encounter } from "./rules.ts";

export interface UnitKind {
  name: string;
  hp: number;
  armour?: number;
  heavy?: boolean;
  summon?: boolean;
  prefer: number[]; // enemy AI: slots it walks toward
  role: string;
  abilities: Ability[];
}

const ALL = [0, 1, 2, 3];

// ---------------- cards -----------------------------------------------------------------
// Every card names its owner: the unit kind that plays it, from that unit's slot. Hero cards
// are in every deck model; pet and summon cards are used by the party and squad models
// (in the hero model the pet and summons use the fixed abilities further down).

export const CARDS: Record<string, Ability> = {
  strike: {
    id: "strike",
    name: "Strike",
    cost: 1,
    from: [0, 1],
    target: "foe",
    reach: [0, 1],
    effects: [{ op: "damage", amount: 6 }],
    text: "6 damage",
  },
  shove: {
    id: "shove",
    name: "Shove",
    cost: 1,
    from: [0, 1],
    target: "foe",
    reach: [0, 1],
    effects: [
      { op: "damage", amount: 2 },
      { op: "push", n: 1 },
    ],
    text: "2 damage, push 1",
  },
  hook: {
    id: "hook",
    name: "Chain Hook",
    cost: 1,
    from: [0, 1, 2],
    target: "foe",
    reach: [1, 2, 3],
    effects: [
      { op: "damage", amount: 2 },
      { op: "pull", n: 1 },
    ],
    text: "2 damage, pull 1",
  },
  firebolt: {
    id: "firebolt",
    name: "Firebolt",
    cost: 1,
    from: [1, 2, 3],
    target: "foeSlot",
    reach: ALL,
    effects: [
      { op: "damage", amount: 3 },
      { op: "fire", rounds: 1 },
    ],
    text: "3 damage, sets the slot on fire (1 round)",
  },
  oil: {
    id: "oil",
    name: "Oil Flask",
    cost: 1,
    from: [1, 2, 3],
    target: "foeSlot",
    reach: [0, 1, 2],
    area: [1],
    effects: [{ op: "oil" }],
    text: "Oil on 2 slots: fire there turns into a Blaze; pushed units slide 1 further",
  },
  miasma: {
    id: "miasma",
    name: "Miasma",
    cost: 1,
    from: [1, 2, 3],
    target: "foeSlot",
    reach: [0, 1, 2],
    effects: [{ op: "poison", amount: 3 }],
    text: "Poison cloud (3): hurts each round, drifts, thins out",
  },
  ward: {
    id: "ward",
    name: "Ward Circle",
    cost: 1,
    from: ALL,
    target: "allySlot",
    reach: ALL,
    effects: [{ op: "ward", rounds: 2 }],
    text: "Ward on one of your slots (2 rounds): hits there deal 2 less",
  },
  brace: {
    id: "brace",
    name: "Brace",
    cost: 1,
    from: ALL,
    target: "ally",
    reach: ALL,
    effects: [{ op: "block", amount: 6 }],
    text: "6 block to an ally",
  },
  servant: {
    id: "servant",
    name: "Raise Servant",
    cost: 2,
    from: ALL,
    target: "emptyAlly",
    reach: ALL,
    effects: [{ op: "summon", kind: "servant" }],
    text: "Summon a Bone Servant: 10 HP, Bash 3 + push",
  },
  totem: {
    id: "totem",
    name: "Spirit Totem",
    cost: 1,
    from: ALL,
    target: "emptyAlly",
    reach: ALL,
    effects: [{ op: "summon", kind: "totem" }],
    text: "Summon a Spirit Totem: 7 HP, Mend heals 4",
  },
  // pet (Rustback) cards
  bite: {
    id: "bite",
    name: "Bite",
    owner: "beetle",
    cost: 0,
    from: [0, 1],
    target: "foe",
    reach: [0, 1],
    effects: [{ op: "damage", amount: 4 }],
    text: "4 damage",
  },
  drag: {
    id: "drag",
    name: "Drag",
    owner: "beetle",
    cost: 1,
    from: [0, 1, 2],
    target: "foe",
    reach: [1, 2, 3],
    effects: [
      { op: "damage", amount: 2 },
      { op: "pull", n: 1 },
    ],
    text: "2 damage, pull 1",
  },
  shell: {
    id: "shell",
    name: "Shell Wall",
    owner: "beetle",
    cost: 1,
    from: ALL,
    target: "self",
    reach: ALL,
    effects: [{ op: "block", amount: 4, all: true }],
    text: "4 block to every ally",
  },
  ram: {
    id: "ram",
    name: "Ram",
    owner: "beetle",
    cost: 1,
    from: [0],
    target: "foe",
    reach: [0],
    effects: [
      { op: "damage", amount: 3 },
      { op: "push", n: 1 },
    ],
    text: "3 damage, push 1",
  },
  // summon cards
  bash: {
    id: "bash",
    name: "Bash",
    owner: "servant",
    cost: 0,
    from: [0, 1, 2],
    target: "foe",
    reach: [0, 1],
    effects: [
      { op: "damage", amount: 3 },
      { op: "push", n: 1 },
    ],
    text: "3 damage, push 1",
  },
  guard: {
    id: "guard",
    name: "Guard",
    owner: "servant",
    cost: 0,
    from: ALL,
    target: "ally",
    reach: ALL,
    near: true,
    effects: [{ op: "block", amount: 5 }],
    text: "5 block to an ally next to it (or itself)",
  },
  mend: {
    id: "mend",
    name: "Mend",
    owner: "totem",
    cost: 0,
    from: ALL,
    target: "ally",
    reach: ALL,
    effects: [{ op: "heal", amount: 4 }],
    text: "Heal an ally 4",
  },
  hallow: {
    id: "hallow",
    name: "Hallow",
    owner: "totem",
    cost: 0,
    from: ALL,
    target: "allySlot",
    reach: ALL,
    effects: [{ op: "ward", rounds: 1 }],
    text: "Ward on one of your slots (1 round): hits there deal 2 less",
  },
};

// ---------------- decks per model ------------------------------------------------------

// deck=hero (e14): the hero's 12 cards; pet and summons use fixed abilities.
export const STARTING_DECK = [
  "strike",
  "strike",
  "shove",
  "hook",
  "firebolt",
  "firebolt",
  "oil",
  "miasma",
  "ward",
  "brace",
  "servant",
  "totem",
];

// The hero's 10 cards in the party and squad models (no second Strike, no Brace: the pet's
// Bite and Shell Wall take those jobs).
const HERO_10 = [
  "strike",
  "shove",
  "hook",
  "firebolt",
  "firebolt",
  "oil",
  "miasma",
  "ward",
  "servant",
  "totem",
];

// deck=party: one shared deck. Summons shuffle SUMMON_CARDS into it when they rise.
export const PARTY_DECK = [...HERO_10, "bite", "bite", "drag", "shell"];
export const SUMMON_CARDS: Record<string, string[]> = {
  servant: ["bash", "bash"],
  totem: ["mend", "mend"],
};

// deck=squad: every unit has its own deck, hand and actions.
export const SQUAD: Record<string, { deck: string[]; hand: number; actions: number }> = {
  hero: { deck: HERO_10, hand: 4, actions: 3 },
  beetle: { deck: ["bite", "bite", "drag", "shell", "ram"], hand: 2, actions: 1 },
  servant: { deck: ["bash", "bash", "guard"], hand: 2, actions: 1 },
  totem: { deck: ["mend", "mend", "hallow"], hand: 2, actions: 1 },
};

// ---------------- player units -------------------------------------------------------

export const PLAYER_KINDS: Record<string, UnitKind> = {
  hero: { name: "Hero", hp: 28, prefer: [1], role: "plays cards", abilities: [] },
  beetle: {
    name: "Rustback",
    hp: 22,
    prefer: [0],
    role: "companion",
    abilities: [
      {
        id: "bite",
        name: "Bite",
        from: [0, 1],
        target: "foe",
        reach: [0, 1],
        effects: [{ op: "damage", amount: 4 }],
        text: "4 damage",
      },
      {
        id: "drag",
        name: "Drag",
        cooldown: 2,
        from: [0, 1, 2],
        target: "foe",
        reach: [1, 2, 3],
        effects: [
          { op: "damage", amount: 2 },
          { op: "pull", n: 1 },
        ],
        text: "2 damage, pull 1 (cooldown 2)",
      },
      {
        id: "shell",
        name: "Shell Wall",
        cooldown: 3,
        from: ALL,
        target: "self",
        reach: ALL,
        effects: [{ op: "block", amount: 4, all: true }],
        text: "4 block to every ally (cooldown 3)",
      },
    ],
  },
  servant: {
    name: "Bone Servant",
    hp: 10,
    summon: true,
    prefer: [0],
    role: "summon",
    abilities: [
      {
        id: "bash",
        name: "Bash",
        from: [0, 1, 2],
        target: "foe",
        reach: [0, 1],
        effects: [
          { op: "damage", amount: 3 },
          { op: "push", n: 1 },
        ],
        text: "3 damage, push 1",
      },
    ],
  },
  totem: {
    name: "Spirit Totem",
    hp: 7,
    summon: true,
    prefer: [3],
    role: "summon",
    abilities: [
      {
        id: "mend",
        name: "Mend",
        from: ALL,
        target: "ally",
        reach: ALL,
        effects: [{ op: "heal", amount: 4 }],
        text: "Heal an ally 4",
      },
    ],
  },
};

// ---------------- enemies -------------------------------------------------------------

export const ENEMY_KINDS: Record<string, UnitKind> = {
  brute: {
    name: "Bone Brute",
    hp: 30,
    prefer: [0],
    role: "melee brute",
    abilities: [
      {
        id: "smash",
        name: "Smash",
        from: [0, 1],
        target: "foeSlot",
        reach: [0, 1],
        effects: [
          { op: "damage", amount: 9 },
          { op: "push", n: 1 },
        ],
        text: "9 damage, push 1",
      },
      {
        id: "cleave",
        name: "Cleave",
        from: [0],
        target: "foeSlot",
        reach: [0],
        area: [1],
        effects: [{ op: "damage", amount: 6 }],
        text: "6 damage to 2 slots",
      },
    ],
  },
  archer: {
    name: "Bone Archer",
    hp: 16,
    prefer: [2, 3],
    role: "ranged",
    abilities: [
      {
        id: "volley",
        name: "Arrow",
        from: [1, 2, 3],
        target: "foeSlot",
        reach: [1, 2, 3],
        effects: [{ op: "damage", amount: 7 }],
        text: "7 damage",
      },
      {
        id: "stab",
        name: "Stab",
        from: [0, 1],
        target: "foeSlot",
        reach: [0],
        effects: [{ op: "damage", amount: 3 }],
        text: "3 damage",
      },
    ],
  },
  priest: {
    name: "Bile Priest",
    hp: 18,
    prefer: [2, 3],
    role: "area caster",
    abilities: [
      {
        id: "firerain",
        name: "Fire Rain",
        from: [1, 2, 3],
        target: "foeSlot",
        reach: [0, 1, 2],
        area: [1],
        effects: [{ op: "fire", rounds: 2 }],
        text: "fire on 2 slots",
      },
      {
        id: "spew",
        name: "Bile Cloud",
        from: ALL,
        target: "foeSlot",
        reach: [1, 2, 3],
        effects: [{ op: "poison", amount: 3 }],
        text: "poison cloud (3)",
      },
    ],
  },
  spider: {
    name: "Cave Spider",
    hp: 14,
    prefer: [1],
    role: "fast flanker",
    abilities: [
      {
        id: "lunge",
        name: "Lunge",
        from: ALL,
        target: "foeSlot",
        reach: [1, 2, 3],
        effects: [{ op: "damage", amount: 7 }, { op: "retreat" }],
        text: "7 damage to the back row, then skitters back 1",
      },
      {
        id: "web",
        name: "Web Line",
        from: [0, 1],
        target: "foeSlot",
        reach: [1, 2, 3],
        effects: [
          { op: "damage", amount: 2 },
          { op: "pull", n: 2 },
        ],
        text: "2 damage, pull 2",
      },
    ],
  },
  warden: {
    name: "Grave Warden",
    hp: 26,
    armour: 2,
    heavy: true,
    prefer: [0],
    role: "armoured guard",
    abilities: [
      {
        id: "bash",
        name: "Shield Bash",
        from: [0],
        target: "foeSlot",
        reach: [0],
        effects: [{ op: "damage", amount: 7 }],
        text: "7 damage",
      },
      {
        id: "shield",
        name: "Shield Ally",
        from: ALL,
        target: "ally",
        reach: ALL,
        near: true,
        effects: [{ op: "block", amount: 6 }],
        text: "6 block to an ally next to it",
      },
    ],
  },
};

// ---------------- fights --------------------------------------------------------------

export const ENCOUNTERS: Encounter[] = [
  {
    name: "1. Bone Gate",
    enemies: [
      { kind: "brute", slot: 0 },
      { kind: "archer", slot: 2 },
    ],
  },
  {
    name: "2. Spider Cellar",
    enemies: [
      { kind: "spider", slot: 0 },
      { kind: "brute", slot: 1 },
      { kind: "spider", slot: 2 },
    ],
    ground: [{ side: "E", slot: 1, effect: "oil" }],
  },
  {
    name: "3. Crossfire",
    enemies: [
      { kind: "brute", slot: 0 },
      { kind: "spider", slot: 1 },
      { kind: "archer", slot: 2 },
      { kind: "archer", slot: 3 },
    ],
    ground: [
      { side: "E", slot: 0, effect: "oil" },
      { side: "E", slot: 1, effect: "oil" },
    ],
  },
  {
    name: "4. Bile Chapel",
    enemies: [
      { kind: "warden", slot: 0 },
      { kind: "brute", slot: 1 },
      { kind: "priest", slot: 3 },
    ],
  },
  {
    name: "5. Warden's Wall",
    enemies: [
      { kind: "warden", slot: 0 },
      { kind: "warden", slot: 1 },
      { kind: "archer", slot: 2 },
      { kind: "priest", slot: 3 },
    ],
  },
  {
    name: "6. The Deep Choir",
    enemies: [
      { kind: "brute", slot: 0, hp: 38 },
      { kind: "warden", slot: 1 },
      { kind: "priest", slot: 2 },
      { kind: "priest", slot: 3 },
    ],
    ground: [{ side: "P", slot: 1, effect: "poison" }],
  },
];

// ---------------- generator -----------------------------------------------------------

const COST: Record<string, number> = { brute: 3, archer: 2, priest: 3, spider: 2, warden: 3 };

function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A random fight. Budget grows with difficulty (1-6); melee kinds stand in front,
// casters and archers at the back; some fights start with oil or poison on the ground.
export function generate(seed: number, difficulty = 1 + (seed % 6)): Encounter {
  const r = rand(seed * 2654435761);
  const budget = 8 + difficulty * 1.5;
  const kinds = Object.keys(COST);
  const picked: string[] = [];
  let spent = 0;
  while (picked.length < 4) {
    const options = kinds.filter((k) => spent + COST[k] <= budget);
    if (!options.length) break;
    const k = options[Math.floor(r() * options.length)];
    picked.push(k);
    spent += COST[k];
  }
  if (!picked.length) picked.push("brute");
  const front = (k: string) => ENEMY_KINDS[k].prefer[0];
  picked.sort((a, b) => front(a) - front(b) || r() - 0.5);
  const enemies = picked.map((kind, slot) => ({
    kind,
    slot,
    hp: Math.round(ENEMY_KINDS[kind].hp * (0.95 + difficulty * 0.1)),
  }));
  const ground: Encounter["ground"] = [];
  if (r() < 0.35) ground.push({ side: "E", slot: Math.floor(r() * 3), effect: "oil" });
  if (r() < 0.2) ground.push({ side: "P", slot: 2 + Math.floor(r() * 2), effect: "poison" });
  return { name: `Generated #${seed} (difficulty ${difficulty})`, enemies, ground };
}
