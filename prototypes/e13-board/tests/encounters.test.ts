import { describe, expect, it } from "vite-plus/test";
import { enemies, walkable } from "../src/rules/combat.ts";
import { BOTS, playFight } from "../src/rules/bots.ts";
import { FIGHTS, connected, generatedFight, handmade } from "../src/rules/encounters.ts";
import { generate } from "../src/rules/levelgen.ts";

describe("levels and boards", () => {
  it("generated levels pass validation", () => {
    for (let s = 1; s <= 30; s++) expect(generate(s).checks.ok).toBe(true);
  });
  it("every hand-made fight builds with all its enemies on a connected board", () => {
    FIGHTS.forEach((f, i) => {
      const s = handmade(i);
      expect(enemies(s).length).toBe(f.enemies.length);
      expect(connected(s.board, s.braziers)).toBe(true);
      for (const u of s.units) expect(walkable(s, u)).toBe(true);
    });
  });
  it("generated fights are varied and valid", () => {
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = generatedFight(seed);
      expect(enemies(s).length).toBeGreaterThanOrEqual(2);
      expect(connected(s.board, s.braziers)).toBe(true);
      sizes.add(s.board.cells.length);
    }
    expect(sizes.size).toBeGreaterThan(6);
  });
});

describe("bots (smoke)", () => {
  it("every bot finishes a fight", () => {
    for (const name of Object.keys(BOTS)) {
      const r = playFight(generatedFight(3), BOTS[name], 1);
      expect(r.rounds).toBeGreaterThan(1);
    }
  });
  it("the strong bot wins the first hand-made fight and beats random play", () => {
    expect(playFight(handmade(0), BOTS.strong, 1).win).toBe(true);
    let strong = 0,
      random = 0;
    for (let seed = 1; seed <= 6; seed++) {
      strong += +playFight(generatedFight(seed), BOTS.strong, seed).win;
      random += +playFight(generatedFight(seed), BOTS.random, seed).win;
    }
    expect(strong).toBeGreaterThan(random);
  });
});
