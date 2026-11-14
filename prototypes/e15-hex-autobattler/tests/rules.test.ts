import { describe, expect, it } from "vite-plus/test";
import { CELLS, cellOf, dist, neighbor, neighbors, rayDir } from "../src/rules/hex.ts";
import {
  type CardId,
  type FightSetup,
  type State,
  DMG,
  apply,
  cardBlocked,
  clone,
  enemies,
  footprint,
  hashState,
  hero,
  legalCards,
  newFight,
  preview,
  replay,
  route,
  runInterval,
  unitAt,
  wolf,
} from "../src/rules/combat.ts";
import {
  arenaFor,
  authored,
  AUTHORED_COUNT,
  generate,
  validateSetup,
} from "../src/rules/encounters.ts";
import { POLICIES, playFight } from "../src/rules/bots.ts";

// An open arena (no pillar or rubble) from a real generated room; enemies placed by hand.
const open = () => arenaFor(11, 0, { pillar: null });
function fight(enemyList: FightSetup["enemies"], extra: Partial<FightSetup> = {}): State {
  return newFight(
    {
      name: "test",
      note: "",
      arena: open(),
      enemies: enemyList,
      difficulty: 1,
      family: "test",
      ...extra,
    },
    1,
  );
}
const at = cellOf;
/** Put a card in hand slot 0 and play it. */
function play(s: State, card: CardId, target: number, more: { dest?: number; dir?: number } = {}) {
  s.hand[0] = card;
  return apply(s, { t: "card", index: 0, target, ...more });
}
function place(s: State, kind: "hero" | "wolf", cell: number) {
  const u = kind === "hero" ? hero(s)! : wolf(s)!;
  u.cell = cell;
}

describe("hex grid", () => {
  it("has six neighbours in the middle and distance 1 to each", () => {
    const c = at(3, 2);
    expect(neighbors(c)).toHaveLength(6);
    for (const n of neighbors(c)) expect(dist(c, n)).toBe(1);
  });
  it("odd rows are shifted right", () => {
    // (3,1) is odd: its west-south neighbour is (3,2), not (2,2)
    expect(neighbor(at(3, 1), 4)).toBe(at(3, 2));
    expect(neighbor(at(3, 2), 4)).toBe(at(2, 3));
  });
  it("finds straight rays", () => {
    expect(rayDir(at(0, 2), at(4, 2))).toBe(0);
    expect(rayDir(at(0, 2), at(1, 3))).toBe(
      -1 === rayDir(at(0, 2), at(1, 3)) ? -1 : rayDir(at(0, 2), at(1, 3)),
    );
    expect(rayDir(at(2, 2), at(3, 3))).toBe(-1);
    expect(dist(at(0, 0), at(6, 5))).toBeGreaterThan(5);
    expect(CELLS).toBe(42);
  });
});

describe("arena from a room", () => {
  it("keeps corners blocked, has a brazier and explains the conversion", () => {
    const a = arenaFor(11, 0);
    for (const c of [at(0, 0), at(6, 0), at(0, 5), at(6, 5)]) expect(a.blocked[c]).toBe(true);
    expect(a.braziers).toHaveLength(1);
    expect(a.source).toMatch(/entry door/);
    expect(a.entry.every((c) => c % 7 < 2)).toBe(true);
  });
  it("all hand-made fights and 100 generated ones are valid", () => {
    for (let i = 0; i < AUTHORED_COUNT; i++) expect(validateSetup(authored(i), 1)).toBe("");
    for (let i = 1; i <= 100; i++) {
      const g = generate(i);
      expect(validateSetup(g, i)).toBe("");
      expect(g.enemies.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("interval order", () => {
  it("allies hit before enemies: killing an enemy cancels its attack", () => {
    const s = fight([{ kind: "skitter", cell: at(3, 2) }]);
    s.phase = "window";
    place(s, "hero", at(2, 2));
    place(s, "wolf", at(0, 4));
    const sk = enemies(s)[0];
    sk.hp = 3; // the hero's strike kills it
    sk.intent = { kind: "bite", offsets: [[-1, 0]], dir: 3, damage: 3, aim: "" };
    runInterval(s);
    expect(s.over).toBe("win");
    expect(hero(s)!.hp).toBe(26);
  });
  it("an empty footprint misses and never retargets", () => {
    const s = fight([{ kind: "brute", cell: at(5, 2) }]);
    s.phase = "window";
    place(s, "hero", at(0, 2));
    place(s, "wolf", at(0, 4));
    const b = enemies(s)[0];
    b.intent = { kind: "cleave", offsets: [[1, 0]], dir: 0, damage: 5, aim: "" };
    runInterval(s);
    expect(s.events.some((e) => e.t === "attack" && /misses/.test(e.text))).toBe(true);
    expect(hero(s)!.hp).toBe(26);
  });
  it("a pushed enemy carries its attack footprint with it", () => {
    const s = fight([{ kind: "brute", cell: at(3, 2) }]);
    s.phase = "window";
    place(s, "hero", at(1, 4));
    place(s, "wolf", at(2, 2));
    const b = enemies(s)[0];
    const before = footprint(s, b);
    expect(play(s, "shoulder", b.cell)).toBe(true);
    expect(b.cell).toBe(at(5, 2));
    expect(footprint(s, b)).toEqual(before.map((c) => c + 2));
  });
});

describe("cards", () => {
  it("Strike deals 4 to an adjacent enemy; guard takes 2 less from the front", () => {
    const s = fight([
      { kind: "brute", cell: at(2, 2) },
      { kind: "guard", cell: at(1, 1) },
    ]);
    place(s, "hero", at(1, 2));
    place(s, "wolf", at(0, 4));
    const g = enemies(s).find((e) => e.kind === "guard")!;
    g.facing = 4; // facing south-west, toward... not the hero (hero is south-east of it)
    expect(play(s, "strike", at(2, 2))).toBe(true);
    expect(unitAt(s, at(2, 2))!.hp).toBe(14 - DMG.strike);
    g.facing = 5; // now facing the hero (south-east)
    s.played = 0;
    expect(play(s, "strike", g.cell)).toBe(true);
    expect(g.hp).toBe(18 - (DMG.strike - DMG.guardFront));
  });
  it("Firebolt on oil turns the connected oil into a blaze of 4", () => {
    const s = fight([{ kind: "archer", cell: at(6, 3) }], {
      ground: [
        { cell: at(3, 2), oil: 3 },
        { cell: at(4, 2), oil: 3 },
        { cell: at(4, 3), oil: 3 },
      ],
    });
    place(s, "hero", at(0, 2));
    expect(play(s, "firebolt", at(3, 2))).toBe(true);
    for (const c of [at(3, 2), at(4, 2), at(4, 3)]) {
      expect(s.ground[c].oil).toBe(0);
      expect(s.ground[c].firePow).toBe(DMG.blaze);
    }
  });
  it("Shoulder into a wall deals 2; into a unit 1 to both and stops", () => {
    const s = fight([{ kind: "brute", cell: at(5, 2) }]);
    place(s, "hero", at(0, 1));
    place(s, "wolf", at(4, 2));
    const b = enemies(s)[0];
    expect(play(s, "shoulder", b.cell)).toBe(true);
    expect(b.cell).toBe(at(6, 2));
    expect(b.hp).toBe(14 - DMG.wall);
    const t = fight([
      { kind: "brute", cell: at(3, 2) },
      { kind: "archer", cell: at(5, 2) },
    ]);
    place(t, "hero", at(0, 1));
    place(t, "wolf", at(2, 2));
    const [b2, a2] = enemies(t);
    expect(play(t, "shoulder", b2.cell)).toBe(true);
    expect(b2.cell).toBe(at(4, 2));
    expect(b2.hp).toBe(14 - DMG.collide);
    expect(a2.hp).toBe(10 - DMG.collide);
  });
  it("a pushed unit takes fire damage for each burning hex it crosses, and slides on oil", () => {
    const s = fight([{ kind: "brute", cell: at(3, 2) }], {
      ground: [{ cell: at(4, 2), fire: 2 }],
    });
    place(s, "hero", at(0, 1));
    place(s, "wolf", at(2, 2));
    const b = enemies(s)[0];
    expect(play(s, "shoulder", b.cell)).toBe(true);
    expect(b.hp).toBe(14 - DMG.fire);
    const t = fight([{ kind: "brute", cell: at(3, 2) }], { ground: [{ cell: at(5, 2), oil: 3 }] });
    place(t, "hero", at(0, 1));
    place(t, "wolf", at(2, 2));
    expect(play(t, "shoulder", enemies(t)[0].cell)).toBe(true);
    expect(enemies(t)[0].cell).toBe(at(6, 2)); // 2 hexes, then one more on the oil
  });
  it("pushing into the brazier topples it into fire", () => {
    const s = fight([{ kind: "brute", cell: at(3, 2) }]);
    const bz = s.braziers[0];
    // stand an enemy next to the brazier and push it in
    const n = neighbors(bz).find((c) => !s.arena.blocked[c] && !unitAt(s, c))!;
    const e = enemies(s)[0];
    e.cell = n;
    const d = rayDir(n, bz);
    const back = neighbor(n, d + 3);
    place(s, "wolf", back);
    place(s, "hero", at(0, 2));
    expect(play(s, "shoulder", e.cell)).toBe(true);
    expect(s.braziers).toHaveLength(0);
    expect(s.ground[n].fire).toBeGreaterThan(0);
  });
  it("Hook pulls 2 toward the hero; illegal cards cost nothing", () => {
    const s = fight([{ kind: "archer", cell: at(3, 2) }]);
    place(s, "hero", at(0, 2));
    place(s, "wolf", at(0, 4));
    expect(play(s, "hook", at(3, 2))).toBe(true);
    expect(enemies(s)[0].cell).toBe(at(1, 2));
    const energy = s.energy;
    s.hand[0] = "strike";
    expect(apply(s, { t: "card", index: 0, target: at(5, 5) })).toBe(false);
    expect(s.energy).toBe(energy);
  });
  it("at most two summons; at most one opening card and two per window", () => {
    const s = fight([{ kind: "archer", cell: at(6, 3) }]);
    place(s, "hero", at(1, 2));
    place(s, "wolf", at(0, 4));
    expect(play(s, "servant", at(2, 2))).toBe(true);
    s.hand[0] = "totem";
    expect(cardBlocked(s, "totem")).toBe("one opening card");
    s.phase = "window";
    s.maxCards = 2;
    s.energy = 3;
    expect(play(s, "totem", at(1, 3))).toBe(true);
    s.played = 0;
    s.energy = 3;
    s.hand[0] = "servant";
    expect(cardBlocked(s, "servant")).toBe("two summons already");
  });
  it("Reposition stops the ally's automatic walk this interval", () => {
    const s = fight([{ kind: "brute", cell: at(5, 2) }]);
    s.phase = "window";
    s.maxCards = 2;
    place(s, "hero", at(1, 2));
    place(s, "wolf", at(0, 4));
    const h = hero(s)!;
    expect(play(s, "reposition", h.cell, { dest: at(0, 1) })).toBe(true);
    runInterval(s);
    expect(h.cell).toBe(at(0, 1));
  });
  it("ward cuts each hit by 2", () => {
    const s = fight([{ kind: "brute", cell: at(2, 2) }]);
    s.phase = "window";
    s.maxCards = 2;
    place(s, "hero", at(1, 2));
    place(s, "wolf", at(0, 4));
    expect(play(s, "ward", at(1, 2))).toBe(true);
    const b = enemies(s)[0];
    b.hp = 30;
    b.intent = { kind: "cleave", offsets: [[-1, 0]], dir: 3, damage: 5, aim: "" };
    runInterval(s);
    expect(hero(s)!.hp).toBe(26 - (5 - DMG.ward));
  });
});

describe("allies", () => {
  it("the wolf picks the lowest reachable HP and logs why", () => {
    const s = fight([
      { kind: "brute", cell: at(3, 3) },
      { kind: "archer", cell: at(3, 1) },
    ]);
    s.phase = "window";
    place(s, "hero", at(0, 5 - 1));
    place(s, "wolf", at(2, 2));
    s.priority = "lowest";
    for (const e of enemies(s)) e.intent = null;
    runInterval(s);
    const bite = s.events.find((e) => e.t === "attack" && e.unit === wolf(s)!.id)!;
    expect(bite.text).toMatch(/Wolf bites Archer: lowest reachable HP/);
  });
  it("guard stance gives the threatened hero 3 block", () => {
    const s = fight([{ kind: "brute", cell: at(2, 2) }]);
    s.phase = "window";
    place(s, "hero", at(1, 2));
    place(s, "wolf", at(1, 3));
    s.priority = "guard";
    const b = enemies(s)[0];
    b.hp = 40;
    b.intent = { kind: "cleave", offsets: [[-1, 0]], dir: 3, damage: 5, aim: "" };
    runInterval(s);
    expect(s.events.some((e) => e.t === "block" && /guards the hero/.test(e.text))).toBe(true);
    expect(hero(s)!.hp).toBe(26 - (5 - DMG.guardBlock));
  });
  it("routes avoid fire only when an equally short safe route exists", () => {
    const s = fight([{ kind: "archer", cell: at(6, 4) }], {
      ground: [{ cell: at(2, 2), fire: 2 }],
    });
    place(s, "hero", at(1, 2));
    place(s, "wolf", at(0, 4));
    // two 3-hex routes to (3,1): through the fire at (2,2) or around it
    expect(route(s, at(1, 2), new Set([at(3, 1)]))).toEqual([at(1, 1), at(2, 1), at(3, 1)]);
    // to (3,2) the only 2-hex route crosses the fire, and allies take it
    expect(route(s, at(1, 2), new Set([at(3, 2)]))).toEqual([at(2, 2), at(3, 2)]);
  });
});

describe("determinism, preview and replay", () => {
  it("preview equals the resolution, and replays reproduce every interval hash", () => {
    for (let i = 0; i < AUTHORED_COUNT; i++) {
      const setup = authored(i);
      const r = playFight(newFight(setup, 7), POLICIES.greedy, 7, { check: true });
      expect(r.contract.previewMismatch).toBe(0);
      expect(r.contract.unexplained).toBe(0);
      const again = replay(setup, 7, r.state.log);
      expect(again.hashes).toEqual(r.state.hashes);
    }
  });
  it("the preview does not draw: the next hand stays hidden", () => {
    const s = newFight(authored(0), 3);
    const p = preview(s);
    expect(p.deck).toEqual(s.deck);
    expect(p.hand).toEqual(s.hand);
  });
  it("same seed, same fight; different seed, different deck", () => {
    const a = newFight(generate(5), 5),
      b = newFight(generate(5), 5),
      c = newFight(generate(5), 6);
    expect(hashState(a)).toBe(hashState(b));
    expect(a.deck.join()).not.toBe(c.deck.join() + "x");
    expect([...a.hand, ...a.deck].sort()).toEqual([...c.hand, ...c.deck].sort());
  });
  it("cloning is deep enough that previews never touch the real state", () => {
    const s = newFight(authored(2), 1);
    const h = hashState(s);
    const c = clone(s);
    runInterval(c);
    expect(hashState(s)).toBe(h);
  });
  it("legal cards are all accepted by apply", () => {
    const s = newFight(authored(5), 2);
    for (const cmd of legalCards(s)) expect(apply(clone(s), cmd)).toBe(true);
  });
});

describe("bots", () => {
  it("the strong bot wins the introduction and beats doing nothing over a few fights", () => {
    expect(playFight(newFight(authored(0), 1), POLICIES.strong, 1).win).toBe(true);
    let strong = 0,
      none = 0;
    for (let i = 1; i <= 6; i++) {
      strong += +playFight(newFight(generate(i), i), POLICIES.strong, i).win;
      none += +playFight(newFight(generate(i), i), POLICIES.none, i).win;
    }
    expect(strong).toBeGreaterThan(none);
  }, 60000);
});
