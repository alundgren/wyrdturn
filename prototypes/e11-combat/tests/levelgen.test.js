import { describe, expect, it } from "vite-plus/test";
import { generate, validate } from "../src/levelgen.js";
import { parseMap, newRun, act, blocked } from "../src/combat.js";

describe("level generator: lock and key", () => {
  it("every generated level passes validation with a reachable key", () => {
    for (let s = 1; s <= 50; s++) {
      const l = generate(s);
      expect(l.checks.ok).toBe(true);
      expect(l.checks.lockAndKey).toBe(true);
    }
  });
  it("validator rejects a key hidden behind its own gate", () => {
    const l = generate(3);
    const g = l.grid.map((r) => [...r]);
    // move the key into the locked end room
    let kx, ky;
    g.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === "K") {
          kx = x;
          ky = y;
        }
      }),
    );
    g[ky][kx] = ".";
    const end = l.allRooms.find((q) => q.locked);
    g[end.y0][end.x0] = "K";
    const v = validate({ ...l, grid: g });
    expect(v.ok).toBe(false);
    expect(v.problems).toContain("key not reachable before the gate");
  });
  it("gates block until the key is taken; walking onto the key takes it", () => {
    const l = generate(3);
    const s = newRun({ map: parseMap(l.mapText), rooms: l.rooms, seed: 1 });
    let gate = null;
    s.map.tiles.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === "L") gate = { x, y };
      }),
    );
    expect(blocked(s, gate.x, gate.y)).toBe(true);
    let key = null;
    s.map.tiles.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === "K") key = { x, y };
      }),
    );
    // put the hero next to the key (outside combat) and step on it
    s.hero.x = key.x;
    s.hero.y = key.y + 1;
    const r = act(s, { type: "move", dir: 0 });
    expect(r.events.some((e) => e.type === "keyPickup")).toBe(true);
    expect(s.hero.key).toBe(true);
    // stepping onto the key also entered that room's fight (doors lock); end it to test the gate alone
    s.combat = false;
    s.doorsLocked = false;
    expect(blocked(s, gate.x, gate.y)).toBe(false);
  });
});

describe("rest shrine", () => {
  it("generated levels have one shrine; it heals once", () => {
    const l = generate(3);
    expect(l.grid.flat().filter((c) => c === "H").length).toBe(1);
    const s = newRun({ map: parseMap(l.mapText), rooms: l.rooms, seed: 1 });
    let h = null;
    s.map.tiles.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === "H") h = { x, y };
      }),
    );
    s.hero.hp = 10;
    s.hero.x = h.x;
    s.hero.y = h.y + 1;
    const r = act(s, { type: "move", dir: 0 });
    expect(r.events.some((e) => e.type === "shrine")).toBe(true);
    expect(s.hero.hp).toBe(22);
    act(s, { type: "move", dir: 2 });
    act(s, { type: "move", dir: 0 });
    expect(s.hero.hp).toBe(22);
  });
});
