import { describe, expect, it } from "vite-plus/test";
import {
  act,
  clone,
  enemies,
  hero,
  intentTiles,
  key,
  legalActions,
  peekGround,
  preview,
  unitAt,
  type CardId,
  type State,
  type Unit,
} from "../src/rules/combat.ts";
import { board } from "./helpers.ts";

const H = (s: State) => hero(s)!;
const byKind = (s: State, k: string) => s.units.find((u) => u.kind === k)!;
/** Put one card in hand and play it. */
function play(s: State, card: CardId, at: { x: number; y: number }) {
  s.hand = [card];
  s.energy = 3;
  return act(s, { type: "card", index: 0, at });
}
function place(u: Unit, x: number, y: number) {
  u.x = x;
  u.y = y;
}

// Row 1 is the fighting row: entry door at (1,1), the hero stands on (2,1).
const ROOM = ["##########", ".E.......#", "#........#", "#........#", "##########"];

describe("setup", () => {
  it("starts with 5 cards, 3 energy, hero inside the door and intents announced", () => {
    const s = board(["##########", ".E.....b.#", "#........#", "##########"]);
    expect(s.hand.length).toBe(5);
    expect(s.energy).toBe(3);
    expect(H(s)).toMatchObject({ x: 2, y: 1 });
    expect(byKind(s, "wolf")).toBeTruthy();
    expect(enemies(s)[0].intent).not.toBeNull();
  });
});

describe("cards and movement", () => {
  it("Strike deals 6 to an adjacent enemy and costs 1 energy", () => {
    const s = board(["##########", ".E.b.....#", "#........#", "##########"]);
    const b = byKind(s, "brute");
    expect(play(s, "strike", b).ok).toBe(true);
    expect(b.hp).toBe(18 - 6);
    expect(s.energy).toBe(2);
  });
  it("after acting the hero can't move any more (move, then act)", () => {
    const s = board(["##########", ".E.b.....#", "#........#", "##########"]);
    play(s, "strike", byKind(s, "brute"));
    expect(act(s, { type: "move", unit: H(s).id, to: { x: 2, y: 2 } }).ok).toBe(false);
  });
  it("moves at most Move tiles, around units", () => {
    const s = board(ROOM);
    expect(act(s, { type: "move", unit: H(s).id, to: { x: 6, y: 1 } }).ok).toBe(false); // 4 tiles
    expect(act(s, { type: "move", unit: H(s).id, to: { x: 5, y: 1 } }).ok).toBe(true);
  });
  it("walking into fire hurts on entry", () => {
    const s = board(ROOM);
    s.ground[key({ x: 3, y: 1 })] = { fire: 2 };
    s.ground[key({ x: 3, y: 2 })] = { fire: 2 };
    s.ground[key({ x: 3, y: 3 })] = { fire: 2 };
    const h = H(s);
    const hp = h.hp;
    act(s, { type: "move", unit: h.id, to: { x: 4, y: 1 } });
    expect(h.hp).toBe(hp - 3);
  });
  it("only two summons at a time", () => {
    const s = board(ROOM);
    expect(play(s, "totem", { x: 3, y: 1 }).ok).toBe(true);
    expect(play(s, "servant", { x: 2, y: 3 }).ok).toBe(true);
    expect(play(s, "totem", { x: 4, y: 1 }).ok).toBe(false);
  });
});

describe("push and pull", () => {
  it("pushing into a wall: 2 damage plus 2 for the wall", () => {
    const s = board(["######", ".E.b.#", "#....#", "######"]);
    const b = byKind(s, "brute");
    play(s, "shove", b);
    expect(b).toMatchObject({ x: 4, y: 1 });
    expect(b.hp).toBe(18 - 2 - 2);
  });
  it("pushing into another unit hurts both", () => {
    const s = board(["#########", ".E.bs...#", "#.......#", "#########"]);
    const b = byKind(s, "brute"),
      sk = byKind(s, "skitter");
    play(s, "shove", b);
    expect(b.hp).toBe(18 - 2 - 2);
    expect(sk.hp).toBe(8 - 2);
    expect(b.x).toBe(3);
  });
  it("pushing into a brazier topples it into a line of fire", () => {
    const s = board(["#########", ".E.b.B..#", "#.......#", "#########"]);
    const b = byKind(s, "brute");
    play(s, "shove", b);
    expect(s.braziers.length).toBe(0);
    expect(peekGround(s, { x: 5, y: 1 })?.fire).toBeTruthy();
    expect(peekGround(s, { x: 7, y: 1 })?.fire).toBeTruthy();
    expect(s.stats.topples).toBe(1);
  });
  it("Hook pulls the first unit in a line toward the hero", () => {
    const s = board(["#########", ".E....b.#", "#.......#", "#########"]);
    const b = byKind(s, "brute");
    play(s, "hook", { x: 3, y: 1 });
    expect(b.x).toBe(3);
    expect(s.stats.pulls).toBe(1);
  });
  it("a unit pushed onto oil slides on", () => {
    const s = board(["##########", ".E.boo...#", "#........#", "##########"]);
    const b = byKind(s, "brute");
    play(s, "shove", b);
    expect(b.x).toBe(6); // pushed 2 tiles, ends on oil at x 5, slides one more
  });
});

describe("ground effects", () => {
  it("fire on oil blazes through all connected oil", () => {
    const t = board(["##########", ".E.ooo...#", "#...o....#", "##########"]);
    play(t, "firebolt", { x: 3, y: 1 }); // nothing in the line: lands at range 5 (7,1)
    expect(peekGround(t, { x: 7, y: 1 })?.fire).toBeTruthy();
    const u = board(["#####", ".E.o#", "#..o#", "#####"]);
    play(u, "firebolt", { x: 3, y: 1 }); // stops at the wall: lands on (3,1), which is oil
    expect(peekGround(u, { x: 3, y: 1 })?.blaze).toBe(true);
    expect(peekGround(u, { x: 3, y: 2 })?.blaze).toBe(true);
    expect(u.stats.combos).toBe(1);
  });
  it("poison spreads from thick tiles and fades out", () => {
    const s = board(["###########", ".E........#", "#.........#", "#.........#", "###########"]);
    play(s, "poison", { x: 5, y: 2 });
    const count = () => Object.values(s.ground).filter((g) => g.poison).length;
    expect(count()).toBe(9);
    act(s, { type: "end" });
    expect(count()).toBeGreaterThan(9);
    for (let i = 0; i < 4; i++) act(s, { type: "end" });
    expect(count()).toBe(0);
  });
  it("ward takes 2 off each hit", () => {
    const s = board(["##########", ".E.b.....#", "#........#", "##########"]);
    const b = byKind(s, "brute");
    s.ground[key(b)] = { ward: 2 };
    play(s, "strike", b);
    expect(b.hp).toBe(18 - 4);
  });
  it("poison and fire tick on whoever stands in them at round end", () => {
    const s = board(ROOM);
    const h = H(s),
      w = byKind(s, "wolf");
    s.ground[key(h)] = { poison: 2 };
    s.ground[key(w)] = { fire: 2 };
    act(s, { type: "end" });
    expect(h.hp).toBe(26 - 2);
    expect(w.hp).toBe(16 - 3);
  });
  it("the guard's shield takes 3 off hits from the front only", () => {
    const s = board(["##########", ".E.g.....#", "#........#", "##########"]);
    const g = byKind(s, "guard");
    g.facing = 3; // facing the hero (west)
    play(s, "strike", g);
    expect(g.hp).toBe(16 - 3);
    g.facing = 1; // back turned
    play(s, "strike", g);
    expect(g.hp).toBe(16 - 3 - 6);
  });
});

describe("enemy intents", () => {
  it("pushing an enemy moves its attack with it", () => {
    const s = board(["##########", ".E.b.....#", "#........#", "#........#", "##########"]);
    const b = byKind(s, "brute");
    b.intent = { attack: "cleave", dir: 3 };
    const before = intentTiles(s, b).map(key).sort();
    expect(before).toContain("2,1");
    s.hand = ["shove"];
    act(s, { type: "card", index: 0, at: b });
    const after = intentTiles(s, b).map(key);
    expect(after).not.toContain("2,1");
    expect(after).toContain(key({ x: b.x - 1, y: b.y }));
  });
  it("an attack hits whoever stands on its tiles, enemies too", () => {
    // the brute (lower id) acts first and cleaves east into the skitter
    const s = board(["##########", ".E...bs..#", "#........#", "##########"]);
    const b = byKind(s, "brute"),
      sk = byKind(s, "skitter");
    b.intent = { attack: "cleave", dir: 1 };
    act(s, { type: "end" });
    expect(s.units.includes(sk) ? sk.hp : 0).toBeLessThan(8);
    expect(s.stats.dmgFriendly).toBeGreaterThan(0);
  });
  it("dodging out of the red tiles avoids the hit", () => {
    const s = board(["##########", ".E.b.....#", "#........#", "#........#", "##########"]);
    const b = byKind(s, "brute"),
      h = H(s);
    b.intent = { attack: "cleave", dir: 3 };
    place(byKind(s, "wolf"), 8, 3);
    act(s, { type: "move", unit: h.id, to: { x: 2, y: 3 } });
    const hp = h.hp;
    act(s, { type: "end" });
    expect(h.hp).toBe(hp);
  });
  it("blocked reinforcements wait for a free tile", () => {
    const s = board(ROOM);
    s.reinforcements = [{ round: 1, kind: "skitter", spawn: 0 }];
    s.board.spawns = [{ x: 2, y: 2 }];
    place(byKind(s, "wolf"), 2, 2);
    act(s, { type: "end" });
    expect(enemies(s).length).toBe(0);
    expect(s.reinforcements.length).toBe(1);
  });
});

describe("preview", () => {
  it("matches the real result for every legal action", () => {
    const s = board(["##########", ".E.b.o...#", "#..B.a...#", "#........#", "##########"]);
    s.hand = ["shove", "firebolt", "oil", "hook", "poison"];
    for (const a of legalActions(s)) {
      const p = preview(s, a);
      const c = clone(s);
      expect(act(c, a).ok).toBe(true);
      for (const u of p.units) {
        const v = c.units.find((x) => x.id === u.id);
        if (u.dead) expect(v).toBeUndefined();
        else expect(v).toMatchObject({ x: u.to.x, y: u.to.y });
      }
    }
  });
  it("describes damage, pushes and fire in words", () => {
    const s = board(["#########", ".E.b.B..#", "#.......#", "#########"]);
    s.hand = ["shove"];
    const p = preview(s, { type: "card", index: 0, at: unitAt(s, { x: 3, y: 1 })! });
    expect(p.text).toMatch(/Ghoul Brute -4/);
    expect(p.text).toMatch(/brazier topples/);
    expect(p.text).toMatch(/fire/);
  });
});
