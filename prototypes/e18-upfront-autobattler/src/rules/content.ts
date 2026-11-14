// Units, skills, charms and enemies for e18. Pure data, no three.js or DOM.
// Slots are 0-based in code (0 = front, next to the other side) and 1-based on screen.

export type Side = "P" | "E";
export type Focus = "front" | "weakest" | "back" | "threat";
export const FOCI: Focus[] = ["front", "weakest", "back", "threat"];
export const FOCUS_TEXT: Record<Focus, string> = {
  front: "Front: hit the nearest enemy you can reach",
  weakest: "Weakest: hit the enemy with the least HP (shield counts)",
  back: "Back: hit the furthest enemy you can reach",
  threat: "Threat: hit the enemy that deals the most damage per second right now",
};

export type GroundKind = "fire" | "oil" | "ice" | "poison" | "ward";

// How an ability picks its target among the units in reach.
// "focus" = the player's focus rule; enemies use fixed aims.
export type Aim = "front" | "back" | "weakest" | "threat" | "focus" | "lowpct";

export interface AbilityDef {
  id: string;
  name: string;
  cd: number; // seconds between uses
  from: number[]; // own slots it can be used from
  reach?: number[]; // slots on the target side it can hit (default all)
  aim?: Aim;
  target: "enemy" | "ally" | "area" | "raise"; // area: fixed slots on the other side; raise: a new unit in your front slot
  raise?: string; // enemy kind for "raise"
  raiseHp?: number;
  raiseMax?: number; // only while the side has fewer units than this
  dmg?: number;
  all?: boolean; // hit every unit in reach, not one
  pierce?: boolean; // ignores armour
  push?: number;
  pull?: number;
  ground?: GroundKind;
  groundDur?: number;
  groundOn?: "target" | number[]; // where the ground goes: the target's slot or fixed slots
  groundSide?: "target" | "own"; // own: on the user's side (ward)
  heal?: number;
  shield?: number;
  text: string;
}

export interface UnitDef {
  kind: string;
  name: string;
  hp: number;
  armour?: number;
  heavy?: boolean; // ignores a 1-slot push or pull
  rage?: number; // + damage on all its abilities each time an ally falls
  abilities: AbilityDef[];
  tags?: string[];
  text: string;
}

const ALL = [0, 1, 2, 3];

// ---------------- your side ---------------------------------------------------------

export const HERO: UnitDef = {
  kind: "hero",
  name: "Hero",
  hp: 54,
  abilities: [], // filled from the 3 chosen skills
  text: "Uses the 3 skills you bring. If the hero falls, the fight is lost.",
};

export const PET: UnitDef = {
  kind: "beetle",
  name: "Rustback",
  hp: 38,
  abilities: [
    {
      id: "drag",
      name: "Drag",
      cd: 7,
      from: [0, 1, 2],
      reach: [1, 2, 3],
      aim: "focus",
      target: "enemy",
      dmg: 1,
      pull: 1,
      text: "Pulls an enemy in slot 2-4 one slot forward, 1 damage. Every 7 s.",
    },
    {
      id: "bite",
      name: "Bite",
      cd: 2.2,
      from: [0, 1],
      reach: [0, 1],
      aim: "focus",
      target: "enemy",
      dmg: 3,
      text: "3 damage to an enemy in slot 1-2. From slot 1-2. Every 2.2 s.",
    },
  ],
  text: "Your pet beetle. Always comes. Bites from the front, drags back-row enemies forward.",
};

export interface SkillDef {
  id: string;
  name: string;
  ability?: AbilityDef; // what the hero does
  summon?: UnitDef; // or: a unit that starts the fight in your row
  text: string;
  tags: string[];
}

export const SERVANT: UnitDef = {
  kind: "servant",
  name: "Bone Servant",
  hp: 26,
  abilities: [
    {
      id: "bash",
      name: "Bash",
      cd: 3.5,
      from: [0, 1],
      reach: [0],
      aim: "front",
      target: "enemy",
      dmg: 3,
      push: 1,
      text: "3 damage to the front enemy and pushes it back a slot. Every 3.5 s.",
    },
  ],
  text: "A summon. A sturdy body that bashes and pushes the front enemy.",
};

export const TOTEM: UnitDef = {
  kind: "totem",
  name: "Spirit Totem",
  hp: 16,
  abilities: [
    {
      id: "mend",
      name: "Mend",
      cd: 5,
      from: ALL,
      aim: "lowpct",
      target: "ally",
      heal: 6,
      text: "Heals the most hurt ally by 6. Every 5 s, from any slot.",
    },
  ],
  text: "A summon. Fragile; heals whoever is most hurt.",
};

export const SKILLS: SkillDef[] = [
  {
    id: "strike",
    name: "Strike",
    tags: ["melee", "damage"],
    ability: {
      id: "strike",
      name: "Strike",
      cd: 2.5,
      from: [0, 1],
      reach: [0, 1],
      aim: "focus",
      target: "enemy",
      dmg: 6,
      text: "6 damage to an enemy in slot 1-2. From slot 1-2. Every 2.5 s.",
    },
    text: "6 damage, slot 1-2 to slot 1-2. Fast and plain.",
  },
  {
    id: "cleave",
    name: "Cleave",
    tags: ["melee", "damage", "area"],
    ability: {
      id: "cleave",
      name: "Cleave",
      cd: 3.5,
      from: [0],
      reach: [0, 1],
      target: "enemy",
      all: true,
      dmg: 5,
      text: "5 damage to both enemies in slot 1-2. Only from slot 1. Every 3.5 s.",
    },
    text: "5 damage to both front enemies. Hero must stand in slot 1.",
  },
  {
    id: "firebolt",
    name: "Firebolt",
    tags: ["ranged", "fire"],
    ability: {
      id: "firebolt",
      name: "Firebolt",
      cd: 4.5,
      from: [1, 2, 3],
      aim: "focus",
      target: "enemy",
      dmg: 3,
      ground: "fire",
      groundDur: 4,
      groundOn: "target",
      text: "3 damage and sets the target's slot on fire (2 a second for 4 s). From slot 2-4. Every 4.5 s.",
    },
    text: "3 damage + fire on the slot. Fire ignores armour; on oil it becomes a blaze.",
  },
  {
    id: "oil",
    name: "Oil Flask",
    tags: ["ranged", "setup"],
    ability: {
      id: "oil",
      name: "Oil Flask",
      cd: 9,
      from: [1, 2, 3],
      target: "area",
      ground: "oil",
      groundDur: 14,
      groundOn: [0, 1],
      dmg: 0,
      text: "Oil on enemy slots 1-2 for 14 s. Fire on oil becomes a blaze; pushed units slide on oil. From slot 2-4. Every 9 s.",
    },
    text: "Oils enemy slots 1-2. No damage alone. Fire on oil: blaze (3 burst, 3 a second).",
  },
  {
    id: "frost",
    name: "Frost Shard",
    tags: ["ranged", "control"],
    ability: {
      id: "frost",
      name: "Frost Shard",
      cd: 5,
      from: [1, 2, 3],
      aim: "focus",
      target: "enemy",
      dmg: 3,
      ground: "ice",
      groundDur: 6,
      groundOn: "target",
      text: "3 damage and ice on the target's slot for 6 s: whoever stands there recharges at half speed. From slot 2-4. Every 5 s.",
    },
    text: "3 damage + ice: the target's abilities recharge at half speed for 6 s.",
  },
  {
    id: "miasma",
    name: "Miasma",
    tags: ["ranged", "poison"],
    ability: {
      id: "miasma",
      name: "Miasma",
      cd: 7,
      from: [1, 2, 3],
      target: "area",
      ground: "poison",
      groundDur: 6,
      groundOn: [0, 1],
      dmg: 0,
      text: "Poison cloud on enemy slots 1-2 for 6 s: 2 a second, ignores armour and shields. From slot 2-4. Every 7 s.",
    },
    text: "Poison on enemy slots 1-2. Ignores armour and shields. Fire on poison flashes.",
  },
  {
    id: "hook",
    name: "Hook",
    tags: ["melee", "control"],
    ability: {
      id: "hook",
      name: "Hook",
      cd: 4,
      from: [0, 1, 2],
      reach: [1, 2, 3],
      aim: "focus",
      target: "enemy",
      dmg: 4,
      pull: 1,
      text: "4 damage to an enemy in slot 2-4 and pulls it one slot forward. From slot 1-3. Every 4 s.",
    },
    text: "Pulls a back-row enemy forward, 4 damage. Enemies out of position lose time.",
  },
  {
    id: "servant",
    name: "Raise Servant",
    tags: ["summon"],
    summon: SERVANT,
    text: "Bring a Bone Servant (26 HP, bashes and pushes the front enemy).",
  },
  {
    id: "totem",
    name: "Spirit Totem",
    tags: ["summon", "heal"],
    summon: TOTEM,
    text: "Bring a Spirit Totem (16 HP, heals the most hurt ally 6 every 5 s).",
  },
];
export const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<string, SkillDef>;

// ---------------- charms: one per fight, fires once ------------------------------------

export interface CharmDef {
  id: string;
  name: string;
  trigger: string;
  text: string;
}
export const CHARMS: CharmDef[] = [
  {
    id: "salts",
    name: "Smelling Salts",
    trigger: "an ally drops below 40% HP",
    text: "The first time an ally drops below 40% HP, it heals 19.",
  },
  {
    id: "spark",
    name: "Spark Powder",
    trigger: "at 1 s",
    text: "At 1 s, fire on enemy slots 1-2 for 4 s.",
  },
  {
    id: "wardstone",
    name: "Ward Stone",
    trigger: "at 0.5 s",
    text: "At 0.5 s, a ward on your slots 1-2 for 10 s: hits there deal 2 less.",
  },
  {
    id: "lastbreath",
    name: "Last Breath",
    trigger: "an ally would fall",
    text: "The first ally that would fall stays at 1 HP and gains a 13 shield.",
  },
  {
    id: "quicken",
    name: "Quickening",
    trigger: "at 0 s",
    text: "The hero's skills start ready instead of half charged.",
  },
];
export const CHARM = Object.fromEntries(CHARMS.map((c) => [c.id, c])) as Record<string, CharmDef>;

// ---------------- enemies -----------------------------------------------------------------

export const ENEMIES: Record<string, UnitDef> = {
  brute: {
    kind: "brute",
    name: "Bone Brute",
    hp: 42,
    abilities: [
      {
        id: "smash",
        name: "Smash",
        cd: 4,
        from: [0, 1],
        reach: [0],
        aim: "front",
        target: "enemy",
        dmg: 6,
        push: 1,
        text: "6 damage to your front unit and pushes it back. From slot 1-2. Every 4 s.",
      },
    ],
    rage: 3,
    tags: ["melee"],
    text: "Hits your front slot hard and pushes it back. Rage: +3 damage each time one of its allies falls.",
  },
  archer: {
    kind: "archer",
    name: "Bone Archer",
    hp: 22,
    abilities: [
      {
        id: "shoot",
        name: "Shoot",
        cd: 3,
        from: [1, 2, 3],
        aim: "back",
        target: "enemy",
        dmg: 5,
        text: "5 damage to your back-most unit. From slot 2-4. Every 3 s.",
      },
    ],
    tags: ["ranged"],
    text: "Shoots your back-most unit. Useless in slot 1.",
  },
  priest: {
    kind: "priest",
    name: "Bile Priest",
    hp: 26,
    abilities: [
      {
        id: "firerain",
        name: "Fire Rain",
        cd: 6,
        from: [2, 3],
        target: "area",
        dmg: 1,
        ground: "fire",
        groundDur: 4,
        groundOn: [0, 1],
        text: "1 damage and fire on your slots 1-2 for 4 s. From slot 3-4. Every 6 s.",
      },
      {
        id: "mendbones",
        name: "Mend Bones",
        cd: 4,
        from: [2, 3],
        aim: "lowpct",
        target: "ally",
        heal: 8,
        text: "Heals its most hurt ally by 8. Every 4 s, from slot 3-4.",
      },
      {
        id: "bile",
        name: "Bile Cloud",
        cd: 7,
        from: [1, 2, 3],
        target: "area",
        dmg: 0,
        ground: "poison",
        groundDur: 6,
        groundOn: [1, 2],
        text: "Poison on your slots 2-3 for 6 s. From slot 2-4. Every 7 s.",
      },
    ],
    tags: ["caster"],
    text: "Rains fire on your slots 1-2 and poison on 2-3, and heals its allies. Needs slot 3-4 for the fire.",
  },
  spider: {
    kind: "spider",
    name: "Cave Spider",
    hp: 19,
    abilities: [
      {
        id: "lunge",
        name: "Lunge",
        cd: 2,
        from: [0, 1, 2],
        aim: "weakest",
        target: "enemy",
        dmg: 3,
        text: "3 damage to your unit with the least HP, any slot. From slot 1-3. Every 2 s.",
      },
    ],
    tags: ["flanker"],
    text: "Fast. Goes for your weakest unit wherever it stands.",
  },
  warden: {
    kind: "warden",
    name: "Grave Warden",
    hp: 42,
    armour: 2,
    heavy: true,
    abilities: [
      {
        id: "bulwark",
        name: "Bulwark",
        cd: 6,
        from: ALL,
        aim: "weakest",
        target: "ally",
        shield: 10,
        text: "Shields its weakest ally for 10. Every 6 s.",
      },
      {
        id: "wbash",
        name: "Bash",
        cd: 3,
        from: [0],
        reach: [0],
        aim: "front",
        target: "enemy",
        dmg: 4,
        text: "4 damage to your front unit. Only from slot 1. Every 3 s.",
      },
    ],
    tags: ["guard"],
    text: "Armour 2, heavy (can't be pushed or pulled). Shields its allies.",
  },
};

// The boss: one unit whose kit changes per phase.
export interface BossPhase {
  name: string;
  until: number; // the phase ends when the King drops to this share of max HP
  armour: number;
  slot: "front" | "back";
  adds: string[]; // enemy kinds raised at the start of the phase (up to 3 adds)
  addHp?: number; // HP factor for raised adds
  immune?: GroundKind[]; // ground the King ignores in this phase
  clearAdds?: boolean; // remove the remaining adds at the start
  abilities: AbilityDef[];
  text: string;
}
export const KING_HP = 180;
export const BOSS_PHASES: BossPhase[] = [
  {
    name: "Bone Wall",
    until: 0.65,
    armour: 3,
    slot: "front",
    adds: ["archer", "archer"],
    abilities: [
      {
        id: "ksmash",
        name: "Crushing Smash",
        cd: 4,
        from: [0, 1],
        reach: [0],
        aim: "front",
        target: "enemy",
        dmg: 7,
        push: 1,
        text: "7 damage to your front unit and pushes it back. Every 4 s.",
      },
    ],
    text: "The King stands in front with armour 3. Two archers shoot your back row.",
  },
  {
    name: "Rite of Embers",
    until: 0.4,
    armour: 1,
    slot: "back",
    adds: ["brute", "brute"],
    addHp: 0.6,
    abilities: [
      {
        id: "embers",
        name: "Ember Rain",
        cd: 6,
        from: [1, 2, 3],
        target: "area",
        dmg: 1,
        ground: "fire",
        groundDur: 4,
        groundOn: [0, 1, 2],
        text: "1 damage and fire on your slots 1-3 for 4 s. Every 6 s.",
      },
      {
        id: "raise",
        name: "Raise the Dead",
        cd: 7,
        from: [2, 3],
        target: "raise",
        raise: "brute",
        raiseHp: 0.6,
        raiseMax: 3,
        text: "From slot 3-4, raises a new brute (60% HP) in front while he has fewer than 2 guards. Every 7 s.",
      },
    ],
    text: "The King steps to the back behind two fresh brutes (60% HP), rains fire on your slots 1-3 and keeps raising brutes while he stands in slot 3-4. Armour 1.",
  },
  {
    name: "Last Stand",
    until: 0,
    armour: 0,
    slot: "front",
    adds: [],
    clearAdds: true,
    immune: ["poison"],
    abilities: [
      {
        id: "pulse",
        name: "Grave Pulse",
        cd: 4,
        from: ALL,
        target: "enemy",
        all: true,
        dmg: 3,
        pierce: true,
        text: "3 damage to every unit you have, ignoring wards. Every 4 s.",
      },
      {
        id: "ksmash3",
        name: "Frenzied Smash",
        cd: 2.5,
        from: [0, 1],
        reach: [0],
        aim: "front",
        target: "enemy",
        dmg: 7,
        text: "7 damage to your front unit. Every 2.5 s.",
      },
    ],
    text: "The adds crumble. The King charges to the front without armour but burns away poison (immune), smashes fast and pulses damage over your whole row.",
  },
];
export const KING: UnitDef = {
  kind: "king",
  name: "Ossuary King",
  hp: KING_HP,
  heavy: true,
  abilities: [],
  tags: ["boss"],
  text: "The boss. Three phases; the fight pauses between them so you can change your setup.",
};
