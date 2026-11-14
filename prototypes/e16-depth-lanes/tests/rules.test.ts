import { describe, expect, it } from "vite-plus/test";
import {
  type CardId,
  type Encounter,
  type State,
  ALL_ON,
  BLAZE,
  COLLIDE,
  FIRE,
  WALL,
  WARD,
  apply,
  cardTargets,
  clone,
  endTurn,
  groundAt,
  hero,
  legalActions,
  newFight,
  stateHash,
  threats,
  unitAt,
  wolf,
} from "../src/rules/combat.ts";
import { FIGHTS, generate, validate } from "../src/rules/encounters.ts";
import { BOTS, playFight } from "../src/rules/bots.ts";

const fight = (enemies: Encounter["enemies"], extra: Partial<Encounter> = {}): State =>
  newFight({ name: "test", enemies, ...extra }, 1);

// Put a card in hand slot 0 and play it on a cell.
function play(s: State, card: CardId, lane: number, row: number) {
  s.hand[0] = card;
  s.energy = 3;
  return apply(s, { t: "card", idx: 0, cell: { lane, row } });
}

describe("setup", () => {
  it("hero in the middle of the line, wolf on the left, 5 cards, 3 energy, intents shown", () => {
    const s = fight([{ kind: "ghoul", lane: 1, row: 3 }]);
    expect(hero(s)).toMatchObject({ lane: 1, row: 0 });
    expect(wolf(s)).toMatchObject({ lane: 0, row: 0 });
    expect(s.hand).toHaveLength(5);
    expect(s.energy).toBe(3);
    expect(s.draw.length + s.hand.length).toBe(12);
    expect(unitAt(s, 1, 3)?.intent?.t).toBe("move");
  });
});

describe("reach by row and lane", () => {
  it("Strike only hits row 1 of the hero's lane", () => {
    const s = fight([
      { kind: "ghoul", lane: 1, row: 2 },
      { kind: "ghoul", lane: 0, row: 1 },
    ]);
    expect(cardTargets(s, "strike")).toEqual([]);
    const t = fight([{ kind: "ghoul", lane: 1, row: 1 }]);
    expect(cardTargets(t, "strike")).toEqual([{ lane: 1, row: 1 }]);
  });
  it("Spear Thrust hits rows 1 and 2; Firebolt reaches row 4 but not row 5", () => {
    const s = fight([
      { kind: "ghoul", lane: 1, row: 1 },
      { kind: "spear", lane: 1, row: 2 },
    ]);
    play(s, "thrust", 1, 1);
    expect(unitAt(s, 1, 1)!.hp).toBe(12 - 3);
    expect(unitAt(s, 1, 2)!.hp).toBe(10 - 3);
    expect(cardTargets(fight([{ kind: "archer", lane: 1, row: 5 }]), "firebolt")).toEqual([]);
    expect(cardTargets(fight([{ kind: "archer", lane: 1, row: 4 }]), "firebolt")).toHaveLength(1);
  });
  it("with depth off, Strike reaches the first enemy at any row; with lanes off, any lane", () => {
    const s = newFight({ name: "t", enemies: [{ kind: "ghoul", lane: 1, row: 4 }] }, 1, {
      ...ALL_ON,
      depth: false,
    });
    expect(cardTargets(s, "strike")).toEqual([{ lane: 1, row: 4 }]);
    const t = newFight({ name: "t", enemies: [{ kind: "ghoul", lane: 2, row: 1 }] }, 1, {
      ...ALL_ON,
      lanes: false,
    });
    expect(cardTargets(t, "strike")).toEqual([{ lane: 2, row: 1 }]);
  });
});

describe("sideways steps", () => {
  it("a hero step costs 1 energy and swaps with the wolf", () => {
    const s = fight([{ kind: "ghoul", lane: 2, row: 4 }]);
    const h = hero(s)!;
    expect(apply(s, { t: "step", id: h.id, dir: -1 })).not.toBeNull();
    expect(s.energy).toBe(2);
    expect(hero(s)!.lane).toBe(0);
    expect(wolf(s)!.lane).toBe(1);
  });
  it("the wolf has one free step into an empty line cell", () => {
    const s = fight([{ kind: "ghoul", lane: 2, row: 4 }], { wolf: 2 });
    const w = wolf(s)!;
    expect(apply(s, { t: "step", id: w.id, dir: 1 })).toBeNull(); // off the field
    expect(apply(s, { t: "step", id: w.id, dir: -1 })).toBeNull(); // hero is there
    const t = fight([{ kind: "ghoul", lane: 2, row: 4 }], { wolf: 2, hero: 0 });
    const tw = wolf(t)!;
    expect(apply(t, { t: "step", id: tw.id, dir: -1 })).not.toBeNull();
    expect(t.energy).toBe(3);
    expect(apply(t, { t: "step", id: tw.id, dir: 1 })).toBeNull(); // once per turn
  });
  it("stepping out of a red cell dodges the claw; the ghoul then claws diagonally", () => {
    const s = fight([{ kind: "warden", lane: 1, row: 1 }], { wolf: 0 });
    expect(threats(s).map((t) => t.cell)).toEqual([{ lane: 1, row: 0 }]);
    apply(s, { t: "step", id: hero(s)!.id, dir: 1 });
    endTurn(s);
    expect(hero(s)!.hp).toBe(30);
    // now it reaches the hero diagonally
    expect(threats(s).map((t) => t.cell)).toEqual([{ lane: 2, row: 0 }]);
  });
  it("a ghoul at the line cleaves its cell and both cells beside it", () => {
    const s = fight([{ kind: "ghoul", lane: 1, row: 1 }]);
    expect(
      threats(s)
        .map((t) => t.cell.lane)
        .sort((a, b) => a - b),
    ).toEqual([0, 1, 2]);
  });
});

describe("intents are committed and move with the attacker", () => {
  it("shoving a ghoul back makes its claw hit an empty cell", () => {
    const s = fight([{ kind: "spider", lane: 1, row: 1 }]);
    play(s, "shove", 1, 1);
    expect(unitAt(s, 1, 3)?.kind).toBe("spider");
    expect(threats(s)[0].cell).toEqual({ lane: 1, row: 2 });
    endTurn(s);
    expect(hero(s)!.hp).toBe(30);
  });
  it("enemy attacks never hurt enemies", () => {
    const s = fight([
      { kind: "spear", lane: 1, row: 3 },
      { kind: "ghoul", lane: 1, row: 2 },
      { kind: "ghoul", lane: 0, row: 5 },
    ]);
    // spear behind a ghoul thrusts through it toward a summon at row 1
    play(s, "servant", 1, 1);
    endTurn(s);
    expect(unitAt(s, 1, 2)!.hp).toBe(12);
  });
});

describe("blockers", () => {
  it("a Bone Servant stops a walker, which then attacks it", () => {
    const s = fight([{ kind: "ghoul", lane: 1, row: 3 }]);
    play(s, "servant", 1, 2);
    endTurn(s);
    expect(unitAt(s, 1, 3)?.kind).toBe("ghoul");
    expect(s.stats.blockedMoves).toBe(1);
    const sv = unitAt(s, 1, 2)!;
    expect(threats(s).some((t) => t.cell.lane === sv.lane && t.cell.row === sv.row)).toBe(true);
  });
  it("arrows aim at the hero and the first body in the hero's lane catches them", () => {
    const s = fight([{ kind: "archer", lane: 0, row: 5 }]);
    endTurn(s); // no blocker: the hero takes it
    expect(hero(s)!.hp).toBe(26);
    const t = fight([{ kind: "archer", lane: 0, row: 3 }]);
    play(t, "servant", 1, 1);
    endTurn(t);
    expect(hero(t)!.hp).toBe(30);
    expect(t.stats.arrowsCaught).toBe(1);
  });
  it("a spear thrust reaches past a blocker to the line", () => {
    const s = fight([{ kind: "spear", lane: 1, row: 2 }]);
    play(s, "servant", 1, 1);
    // re-plan after the blocker appears: the spear thrusts both cells
    endTurn(s);
    expect(hero(s)!.hp).toBe(30 - 5);
  });
  it("summons are capped at two", () => {
    const s = fight([{ kind: "ghoul", lane: 1, row: 5 }]);
    play(s, "servant", 0, 1);
    play(s, "totem", 2, 0);
    expect(cardTargets(s, "servant")).toEqual([]);
  });
});

describe("ground effects", () => {
  it("Firebolt ignites; oil turns fire into a blaze that spreads", () => {
    const s = fight([{ kind: "ghoul", lane: 1, row: 3 }]);
    play(s, "oil", 1, 2); // oil on rows 2 and 3
    play(s, "firebolt", 1, 3);
    expect(groundAt(s, 1, 3).blaze).toBe(true);
    expect(groundAt(s, 1, 2).blaze).toBe(true);
    expect(unitAt(s, 1, 3)!.hp).toBe(12 - 3 - BLAZE);
  });
  it("fire hurts at the end of the round", () => {
    const s = fight([{ kind: "warden", lane: 2, row: 5 }]);
    groundAt(s, 2, 5).fire = 2;
    endTurn(s);
    expect(unitAt(s, 2, 4) ?? unitAt(s, 2, 5)).toBeDefined();
    const w = s.units.find((u) => u.kind === "warden")!;
    expect(w.hp).toBe(16 - (w.row === 5 ? FIRE : 0));
  });
  it("Frost freezes: the walker skips its next move", () => {
    const s = fight([{ kind: "ghoul", lane: 1, row: 3 }]);
    play(s, "frost", 1, 3);
    endTurn(s);
    expect(unitAt(s, 1, 3)?.kind).toBe("ghoul");
  });
  it("a ward on a line cell cuts enemy hits there", () => {
    const s = fight([{ kind: "spider", lane: 1, row: 1 }]);
    play(s, "totem", 2, 0);
    const totem = unitAt(s, 2, 0)!;
    apply(s, { t: "ability", id: totem.id, ab: "ward", cell: { lane: 1, row: 0 } });
    endTurn(s);
    expect(hero(s)!.hp).toBe(30 - (4 - WARD));
  });
});

describe("push and pull", () => {
  it("Shove into another enemy: both take collision damage", () => {
    const s = fight([
      { kind: "spider", lane: 1, row: 1 },
      { kind: "ghoul", lane: 1, row: 2 },
    ]);
    play(s, "shove", 1, 1);
    expect(unitAt(s, 1, 1)!.hp).toBe(6 - COLLIDE);
    expect(unitAt(s, 1, 2)!.hp).toBe(12 - COLLIDE);
  });
  it("the wolf shoves sideways into the wall", () => {
    const s = fight([{ kind: "ghoul", lane: 0, row: 1 }]);
    apply(s, { t: "ability", id: wolf(s)!.id, ab: "shove", dir: -1 });
    expect(unitAt(s, 0, 1)!.hp).toBe(12 - WALL);
  });
  it("Hook pulls the first enemy to row 1, through fire", () => {
    const s = fight([{ kind: "archer", lane: 1, row: 5 }]);
    groundAt(s, 1, 3).fire = 2;
    play(s, "hook", 1, 5);
    expect(unitAt(s, 1, 1)?.kind).toBe("archer");
    expect(unitAt(s, 1, 1)!.hp).toBe(8 - FIRE);
  });
});

describe("waves and the end of a fight", () => {
  it("waves arrive in row 5 before their round", () => {
    const s = fight([{ kind: "ghoul", lane: 0, row: 5 }], {
      waves: [{ round: 2, spawns: [{ kind: "spider", lane: 2 }] }],
    });
    endTurn(s);
    expect(unitAt(s, 2, 5)?.kind).toBe("spider");
    expect(s.waves).toHaveLength(0);
  });
  it("killing the last enemy wins only when no wave is left", () => {
    const s = fight([{ kind: "spider", lane: 1, row: 1 }], {
      waves: [{ round: 3, spawns: [{ kind: "spider", lane: 2 }] }],
    });
    s.units.find((u) => u.kind === "spider")!.hp = 1;
    play(s, "strike", 1, 1);
    expect(s.over).toBeNull();
    const t = fight([{ kind: "spider", lane: 1, row: 1 }]);
    t.units.find((u) => u.kind === "spider")!.hp = 1;
    play(t, "strike", 1, 1);
    expect(t.over).toBe("win");
  });
});

describe("control contract and content", () => {
  it("the end-of-turn preview equals what happens", () => {
    for (const f of FIGHTS) {
      const s = newFight(f, 5);
      playFight(s, BOTS.greedy, (t) => expect(t.predicted).toBe(t.actual));
    }
  });
  it("cloning does not share state (waves, ground, units)", () => {
    const s = newFight(FIGHTS[1], 3);
    const before = stateHash(s);
    for (let i = 0; i < 5; i++) endTurn(clone(s));
    expect(stateHash(s)).toBe(before);
    expect(s.waves[0].spawns).toHaveLength(1);
  });
  it("every legal action applies; end of turn is always legal", () => {
    const s = newFight(FIGHTS[5], 2);
    const acts = legalActions(s);
    expect(acts.at(-1)).toEqual({ t: "end" });
    for (const a of acts) expect(apply(clone(s), a)).not.toBeNull();
  });
  it("all hand-made fights and 50 generated ones pass the validator", () => {
    for (const f of FIGHTS) expect(validate(f)).toBeNull();
    for (let i = 1; i <= 50; i++) expect(validate(generate(i))).toBeNull();
  });
  it("the strong bot wins the first hand-made fight", () => {
    expect(playFight(newFight(FIGHTS[0], 1), BOTS.strong).over).toBe("win");
  });
});
