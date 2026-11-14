import { describe, expect, it } from "vite-plus/test";
import {
  type Action,
  type Encounter,
  type RuleOpts,
  type State,
  apply,
  clone,
  endTurn,
  hero,
  landingSlot,
  abilityOf,
  legalActions,
  newFight,
  preview,
  threats,
  unitAt,
  BLAZE_BURST,
  BLAZE_DMG,
  COLLIDE_DMG,
  E14_OPTS,
  FIRE_DMG,
  WALL_DMG,
} from "../src/rules.ts";
import { ENCOUNTERS, generate } from "../src/content.ts";
import { BOTS, playFight } from "../src/bots.ts";

// The e14 tests run on e14's rules (hero deck, no fixes); e17's switches have their own
// tests in models.test.ts.
const fight = (
  enemies: Encounter["enemies"],
  extra: Partial<Encounter> = {},
  opts: Partial<RuleOpts> = E14_OPTS,
): State => newFight({ name: "test", enemies, ...extra }, 1, opts);

// Put a given card in hand slot 0 and play it with the hero.
function play(s: State, card: string, target: number): boolean {
  s.piles.main.hand[0] = card;
  s.energy = Math.max(s.energy, 3);
  return apply(s, { kind: "card", pile: "main", card: 0, unit: hero(s)!.id, target });
}
const hand = (s: State) => s.piles.main.hand;

describe("setup", () => {
  it("starts with the companion in front, the hero behind, 5 cards and 3 energy", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    expect(unitAt(s, "P", 0)?.kind).toBe("beetle");
    expect(unitAt(s, "P", 1)?.kind).toBe("hero");
    expect(hand(s)).toHaveLength(5);
    expect(s.energy).toBe(3);
    expect(s.piles.main.deck.length + hand(s).length).toBe(12);
    expect(unitAt(s, "E", 0)?.intent).not.toBeNull();
  });
  it("closes gaps: units fill a row from the front", () => {
    const s = fight([{ kind: "archer", slot: 3 }]);
    expect(unitAt(s, "E", 0)?.kind).toBe("archer");
  });
});

describe("slots decide what you can play", () => {
  it("Strike only from slots 1-2, Firebolt only from slots 2-4", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    s.piles.main.hand = ["strike", "firebolt", "ward", "brace", "hook"];
    const cards = (st: State) =>
      new Set(legalActions(st).flatMap((a) => (a.kind === "card" ? [hand(st)[a.card]] : [])));
    expect(cards(s).has("strike")).toBe(true);
    expect(cards(s).has("firebolt")).toBe(true);
    // swap hero to the front: firebolt is no longer usable
    apply(s, { kind: "move", unit: hero(s)!.id, to: 0 });
    expect(cards(s).has("firebolt")).toBe(false);
    expect(cards(s).has("strike")).toBe(true);
  });
  it("moving costs the hero 1 energy and a companion its action", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    const beetle = unitAt(s, "P", 0)!;
    apply(s, { kind: "move", unit: beetle.id, to: 1 });
    expect(beetle.ap).toBe(0);
    expect(unitAt(s, "P", 0)?.kind).toBe("hero");
    expect(s.energy).toBe(3); // the hero was swapped for free
    apply(s, { kind: "move", unit: hero(s)!.id, to: 1 });
    expect(s.energy).toBe(2);
  });
  it("companion abilities go on cooldown", () => {
    const s = fight([
      { kind: "brute", slot: 0 },
      { kind: "archer", slot: 1 },
    ]);
    const beetle = unitAt(s, "P", 0)!;
    expect(apply(s, { kind: "ability", unit: beetle.id, ability: "drag", target: 1 })).toBe(true);
    endTurn(s);
    const again = legalActions(s).some((a) => a.kind === "ability" && a.ability === "drag");
    expect(again).toBe(false);
  });
});

describe("push and pull", () => {
  it("pushing into a unit swaps them and both take collision damage", () => {
    const s = fight([
      { kind: "brute", slot: 0 },
      { kind: "archer", slot: 1 },
    ]);
    const brute = unitAt(s, "E", 0)!,
      archer = unitAt(s, "E", 1)!;
    play(s, "shove", 0);
    expect(unitAt(s, "E", 1)).toBe(brute);
    expect(unitAt(s, "E", 0)).toBe(archer);
    expect(brute.hp).toBe(brute.maxHp - 2 - COLLIDE_DMG);
    expect(archer.hp).toBe(archer.maxHp - COLLIDE_DMG);
  });
  it("pushing the last unit in a row slams it into the back wall", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    const brute = unitAt(s, "E", 0)!;
    play(s, "shove", 0);
    expect(unitAt(s, "E", 0)).toBe(brute);
    expect(brute.hp).toBe(brute.maxHp - 2 - WALL_DMG);
  });
  it("pushing into a burning slot burns at once", () => {
    const s = fight([
      { kind: "brute", slot: 0 },
      { kind: "archer", slot: 1 },
    ]);
    s.ground.E[1].fire = 2;
    const brute = unitAt(s, "E", 0)!;
    play(s, "shove", 0);
    expect(brute.hp).toBe(brute.maxHp - 2 - COLLIDE_DMG - FIRE_DMG);
  });
  it("oil makes a unit slide one slot further", () => {
    const s = fight([
      { kind: "brute", slot: 0 },
      { kind: "archer", slot: 1 },
      { kind: "spider", slot: 2 },
    ]);
    s.ground.E[0].oil = true;
    const brute = unitAt(s, "E", 0)!;
    play(s, "shove", 0);
    expect(unitAt(s, "E", 2)).toBe(brute);
  });
  it("the heavy Grave Warden ignores a 1-slot push", () => {
    const s = fight([
      { kind: "warden", slot: 0 },
      { kind: "archer", slot: 1 },
    ]);
    const w = unitAt(s, "E", 0)!;
    play(s, "shove", 0);
    expect(unitAt(s, "E", 0)).toBe(w);
    expect(w.hp).toBe(w.maxHp); // 2 damage minus 2 armour
  });
});

describe("ground effects and combos", () => {
  it("fire on oil becomes a blaze that bursts and spreads to oiled neighbours", () => {
    const s = fight([
      { kind: "brute", slot: 0 },
      { kind: "archer", slot: 1 },
    ]);
    s.ground.E[0].oil = true;
    s.ground.E[1].oil = true;
    const brute = unitAt(s, "E", 0)!,
      archer = unitAt(s, "E", 1)!;
    play(s, "firebolt", 0);
    expect(s.ground.E[0].blaze && s.ground.E[1].blaze).toBe(true);
    expect(brute.hp).toBe(brute.maxHp - 3 - BLAZE_BURST);
    expect(archer.hp).toBe(archer.maxHp - BLAZE_BURST);
    expect(s.events.filter((e) => e.t === "combo" && e.kind === "blaze")).toHaveLength(2);
  });
  it("a blaze burns harder at the end of the round", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    s.ground.E[0].fire = 2;
    s.ground.E[0].blaze = true;
    const brute = unitAt(s, "E", 0)!;
    const hp = brute.hp;
    apply(s, { kind: "end" });
    expect(hp - brute.hp).toBe(BLAZE_DMG);
  });
  it("fire on a poison cloud flashes it away for double damage", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    s.ground.E[0].poison = 3;
    const brute = unitAt(s, "E", 0)!;
    play(s, "firebolt", 0);
    expect(s.ground.E[0].poison).toBe(0);
    expect(brute.hp).toBe(brute.maxHp - 3 - 6);
  });
  it("poison hurts, drifts to neighbours and thins out", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    s.ground.E[1].poison = 3;
    apply(s, { kind: "end" });
    expect(s.ground.E[1].poison).toBe(2);
    expect(s.ground.E[0].poison).toBe(1); // seeded 2, then thinned
    expect(s.ground.E[2].poison).toBe(1);
  });
  it("a ward circle takes 2 off each hit", () => {
    const a = fight([{ kind: "brute", slot: 0 }]);
    unitAt(a, "E", 0)!.intent = { ability: "smash", target: 1, side: "P" }; // at the hero
    const b = clone(a);
    b.ground.P[1].ward = 2;
    apply(a, { kind: "end" });
    apply(b, { kind: "end" });
    expect(hero(b)!.hp - hero(a)!.hp).toBe(2);
  });
});

describe("enemy intents", () => {
  it("show the slots they will hit", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    const t = threats(s);
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((x) => x.side === "P")).toBe(true);
  });
  it("an enemy pulled out of its slots loses the action", () => {
    const s = fight([
      { kind: "brute", slot: 0 },
      { kind: "archer", slot: 1 },
      { kind: "priest", slot: 2 },
    ]);
    const priest = unitAt(s, "E", 2)!;
    priest.intent = { ability: "firerain", target: 0, side: "P" };
    play(s, "hook", 2); // priest to slot 2
    play(s, "hook", 1); // priest to slot 1: Fire Rain needs 2-4
    expect(unitAt(s, "E", 0)).toBe(priest);
    apply(s, { kind: "end" });
    expect(s.events.some((e) => e.t === "fizzle" && e.unit === priest.id)).toBe(true);
  });
  it("a strike aimed at a slot that is now empty lands on the nearest unit in reach", () => {
    const s = fight([{ kind: "archer", slot: 2 }]);
    const archer = unitAt(s, "E", 0)!;
    const ab = abilityOf(archer, "volley")!;
    expect(landingSlot(s, archer, ab, { ability: "volley", target: 3, side: "P" })).toBe(1);
  });
});

describe("summons", () => {
  it("rise in the first empty slot, at most two", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    expect(play(s, "totem", 3)).toBe(false); // must be the first empty slot
    expect(play(s, "totem", 2)).toBe(true);
    expect(play(s, "servant", 3)).toBe(true);
    hand(s)[0] = "totem";
    expect(legalActions(s).some((a) => a.kind === "card" && hand(s)[a.card] === "totem")).toBe(
      false,
    );
  });
  it("can't act on the turn they appear", () => {
    const s = fight([{ kind: "brute", slot: 0 }]);
    play(s, "totem", 2);
    const t = unitAt(s, "P", 2)!;
    expect(legalActions(s).some((a) => a.kind === "ability" && a.unit === t.id)).toBe(false);
  });
});

describe("preview", () => {
  it("shows the exact events and changes nothing", () => {
    const s = fight([
      { kind: "brute", slot: 0 },
      { kind: "archer", slot: 1 },
    ]);
    hand(s)[0] = "shove";
    const before = JSON.stringify(s);
    const a: Action = { kind: "card", pile: "main", card: 0, unit: hero(s)!.id, target: 0 };
    const p = preview(s, a);
    expect(JSON.stringify(s)).toBe(before);
    apply(s, a);
    expect(p.map((e) => e.text)).toEqual(s.events.map((e) => e.text));
  });
});

describe("fights and bots", () => {
  it("six hand-made fights and a deterministic generator", () => {
    expect(ENCOUNTERS.length).toBeGreaterThanOrEqual(6);
    expect(generate(7)).toEqual(generate(7));
    for (let i = 1; i < 50; i++) {
      const e = generate(i);
      expect(e.enemies.length).toBeGreaterThan(0);
      expect(e.enemies.length).toBeLessThanOrEqual(4);
    }
  });
  it("every bot only plays legal actions and fights end", () => {
    for (const [name, bot] of Object.entries(BOTS)) {
      const s = playFight(newFight(generate(3), 3, E14_OPTS), bot);
      expect(s.over, name).not.toBeNull();
    }
  });
  it("the strong bot beats the random bot", () => {
    let strong = 0,
      random = 0;
    for (let i = 1; i <= 6; i++) {
      if (playFight(newFight(generate(i), i, E14_OPTS), BOTS.strong).over === "win") strong++;
      if (playFight(newFight(generate(i), i, E14_OPTS), BOTS.random).over === "win") random++;
    }
    expect(strong).toBeGreaterThan(random);
  });
});
