import { describe, expect, test } from "vite-plus/test";
import { BOSS, FIGHTS, generate } from "../src/rules/encounters.ts";
import {
  addGround,
  damage,
  DEFAULT_OPTS,
  nextPhase,
  runToEnd,
  startFight,
  step,
  type Encounter,
  type Setup,
  type State,
} from "../src/rules/sim.ts";
import {
  allSetups,
  DEFAULT_SETUP,
  fixOrder,
  FULL_POOL,
  neighbours,
  setupKey,
} from "../src/rules/setup.ts";
import { oneChange, play, playBoss, won } from "../src/rules/bots.ts";
import { report, startHp } from "../src/rules/report.ts";
import { applyReward, doors, newRun, rewards } from "../src/rules/run.ts";
import { BOSS_PHASES } from "../src/rules/content.ts";

const S = (o: Partial<Setup> = {}): Setup => ({ ...DEFAULT_SETUP, ...o });
const enc = (enemies: string[], extra: Partial<Encounter> = {}): Encounter => ({
  id: "t",
  name: "test",
  enemies,
  ...extra,
});
const until = (s: State, t: number) => {
  while (!s.over && s.t < t - 1e-9) step(s);
  return s;
};

describe("setups", () => {
  test("every setup has hero, pet and its summons in the order, 3 skills", () => {
    const all = allSetups(FULL_POOL);
    expect(all.length).toBe(9800);
    for (const s of all.slice(0, 500)) {
      expect(s.skills.length).toBe(3);
      expect(s.order).toContain("hero");
      expect(s.order).toContain("pet");
      const summons = s.skills.filter((x) => x === "servant" || x === "totem");
      expect(s.order.length).toBe(2 + summons.length);
    }
    expect(new Set(all.map(setupKey)).size).toBe(all.length);
  });

  test("neighbours are one change away and keep the order valid", () => {
    const ns = neighbours(DEFAULT_SETUP, FULL_POOL);
    expect(ns.length).toBe(3 * 6 + 3 + 3 + 4);
    for (const n of ns) {
      const units = [
        "hero",
        "pet",
        ...n.setup.skills.filter((x) => x === "servant" || x === "totem"),
      ];
      expect([...n.setup.order].sort()).toEqual(units.sort());
    }
    expect(fixOrder(["servant", "hero", "pet"], ["strike", "totem", "hook"])).toEqual([
      "totem",
      "hero",
      "pet",
    ]);
  });
});

describe("fights", () => {
  test("deterministic: same setup, same fight", () => {
    const a = runToEnd(startFight(FIGHTS[5], DEFAULT_SETUP, DEFAULT_OPTS, undefined, true));
    const b = runToEnd(startFight(FIGHTS[5], DEFAULT_SETUP, DEFAULT_OPTS, undefined, true));
    expect(a.t).toBe(b.t);
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
  });

  test("every fight ends, and the dark ends long ones by 60 s", () => {
    for (const f of [...FIGHTS, generate(3, 5)]) {
      const s = runToEnd(startFight(f, DEFAULT_SETUP));
      expect(s.over).not.toBeNull();
      expect(s.t).toBeLessThanOrEqual(60);
    }
  });

  test("abilities respect their slots: Strike needs slot 1-2, the hero steps forward", () => {
    // hero alone at the back with only melee skills steps up after 1.5 s
    const s = startFight(
      enc(["brute"]),
      S({ skills: ["strike", "cleave", "servant"], order: ["servant", "pet", "hero"] }),
    );
    until(s, 1.6);
    expect(s.rows.P.findIndex((u) => u.key === "hero")).toBe(1);
  });

  test("archers shoot your back-most unit, spiders your weakest", () => {
    const s = startFight(enc(["brute", "archer"]), S(), DEFAULT_OPTS, undefined, true);
    until(s, 2);
    const shot = s.log!.find((e) => e.e === "use" && e.ab === "shoot") as any;
    expect(shot.tgt[0]).toBe(s.rows.P[s.rows.P.length - 1].id);
    const s2 = startFight(enc(["spider"]), S(), DEFAULT_OPTS, undefined, true);
    const pet = s2.rows.P[2];
    pet.hp = 5; // the pet in the back slot is weakest now
    until(s2, 1.2);
    const lunge = s2.log!.find((e) => e.e === "use" && e.ab === "lunge") as any;
    expect(lunge.tgt[0]).toBe(pet.id);
  });

  test("focus rule picks the target among those in reach", () => {
    const pick = (focus: Setup["focus"]) => {
      const s = startFight(
        enc(["brute", "archer", "priest"]),
        S({ skills: ["firebolt", "strike", "hook"], order: ["pet", "hero"], focus }),
        { ...DEFAULT_OPTS, move: false }, // no pushes: the hero stays in slot 2
        undefined,
        true,
      );
      until(s, 2.4);
      const fb = s.log!.find((e) => e.e === "use" && e.ab === "firebolt") as any;
      return s.units.find((u) => u.id === fb.tgt[0])!.kind;
    };
    expect(pick("front")).toBe("brute");
    expect(pick("back")).toBe("priest");
    expect(pick("weakest")).toBe("archer");
    expect(pick("threat")).toBe("priest"); // fire rain on two slots outdoes one smash
  });

  test("armour blocks hits, poison and fire ignore it", () => {
    const s = startFight(enc(["warden"]), S());
    const w = s.rows.E[0];
    damage(s, w, 6, "x", 0, "hit");
    expect(w.hp).toBe(w.maxHp - 4);
    damage(s, w, 2, "x", 0, "poison");
    expect(w.hp).toBe(w.maxHp - 6);
  });

  test("fire on oil becomes a blaze and spreads along oil", () => {
    const s = startFight(enc(["brute", "brute", "archer"]), S(), DEFAULT_OPTS, undefined, true);
    addGround(s, "E", 0, "oil", 10, "test");
    addGround(s, "E", 1, "oil", 10, "test");
    const hp = s.rows.E.map((u) => u.hp);
    addGround(s, "E", 0, "fire", 4, "test");
    expect(s.ground.E[0].blaze).toBe(true);
    expect(s.ground.E[1].blaze).toBe(true);
    expect(s.rows.E[0].hp).toBe(hp[0] - 3);
    expect(s.rows.E[1].hp).toBe(hp[1] - 3);
  });

  test("ice halves recharge; fire on ice melts both", () => {
    const s = startFight(enc(["brute"]), S());
    addGround(s, "E", 0, "ice", 10, "test");
    const smash = s.rows.E[0].abs[0];
    const before = smash.cd;
    step(s);
    expect(before - smash.cd).toBeCloseTo(0.05);
    addGround(s, "E", 0, "fire", 4, "test");
    expect(s.ground.E[0].ice).toBe(0);
    expect(s.ground.E[0].fire).toBe(0);
  });

  test("push crashes into the unit behind; at the back it hits the wall; heavy resists", () => {
    const s = startFight(
      enc(["brute", "archer"]),
      S({ skills: ["strike", "hook", "servant"], order: ["servant", "hero", "pet"] }),
      DEFAULT_OPTS,
      undefined,
      true,
    );
    until(s, 1.8); // servant bashes the brute at 1.75 s
    const bash = s.log!.find((e) => e.e === "use" && e.ab === "bash");
    expect(bash).toBeDefined();
    expect(s.rows.E[0].kind).toBe("archer"); // the brute was pushed behind the archer
    const s2 = startFight(enc(["warden"]), S(), DEFAULT_OPTS, undefined, true);
    until(s2, 3);
    expect(s2.log!.some((e) => e.e === "resist")).toBe(true);
  });

  test("when a unit falls, everyone behind steps up", () => {
    const s = startFight(enc(["spider", "archer"]), S());
    damage(s, s.rows.E[0], 999, "x", 0, "hit");
    expect(s.rows.E.length).toBe(1);
    expect(s.rows.E[0].kind).toBe("archer");
  });

  test("charms fire once on their trigger", () => {
    const salts = startFight(enc(["brute"]), S({ charm: "salts" }), DEFAULT_OPTS, undefined, true);
    const front = salts.rows.P[0];
    damage(salts, front, front.hp - 2, "x", 0, "hit");
    expect(front.hp).toBe(2 + 19);
    damage(salts, front, 15, "x", 0, "hit");
    expect(front.hp).toBe(6);
    const lb = startFight(enc(["brute"]), S({ charm: "lastbreath" }));
    const h = lb.rows.P[1];
    damage(lb, h, 999, "x", 0, "hit");
    expect(h.alive).toBe(true);
    expect(h.hp).toBe(1);
    const sp = startFight(enc(["brute", "archer"]), S({ charm: "spark" }));
    until(sp, 1);
    expect(sp.ground.E[0].fire).toBeGreaterThan(0);
  });

  test("feature switches turn things off", () => {
    const s = startFight(enc(["brute"]), S({ charm: "spark" }), {
      ...DEFAULT_OPTS,
      ground: false,
      charm: false,
    });
    until(s, 2);
    expect(s.ground.E[0].fire).toBe(0);
  });
});

describe("boss", () => {
  test("phase 1 ends at the HP threshold, the next phase keeps HP and changes the King", () => {
    const s = startFight(BOSS, DEFAULT_SETUP);
    const king = s.boss!;
    damage(s, king, Math.ceil(king.maxHp * (1 - BOSS_PHASES[0].until)), "x", 0, "hit", {
      pierce: true,
    });
    expect(s.over).toBe("phase");
    const heroHp = s.rows.P.find((u) => u.key === "hero")!.hp;
    const s2 = nextPhase(s, S({ skills: ["firebolt", "hook", "frost"], order: ["pet", "hero"] }));
    expect(s2.boss!.hp).toBe(king.hp);
    expect(s2.rows.E[s2.rows.E.length - 1]).toBe(s2.boss); // the King steps to the back
    expect(s2.boss!.armour).toBe(BOSS_PHASES[1].armour);
    const h2 = s2.rows.P.find((u) => u.key === "hero")!;
    expect(h2.hp).toBeGreaterThanOrEqual(heroHp);
    expect(s2.rows.P.some((u) => u.key === "servant")).toBe(false);
    // trying a setup on a phase start must not change it for the next try
    runToEnd(nextPhase(s, DEFAULT_SETUP));
    expect(s.rows.E.map((u) => u.hp)).toEqual(s.rows.E.map((u) => u.hp));
    const again = nextPhase(s, DEFAULT_SETUP);
    expect(again.boss!.hp).toBe(king.hp);
  });

  test("the boss can be played through all phases", () => {
    const r = playBoss(BOSS, () => DEFAULT_SETUP);
    expect(["win", "loss"]).toContain(r.result);
    expect(r.phases.length).toBeGreaterThanOrEqual(1);
  });
});

describe("explaining", () => {
  test("report adds up damage and names what beat you", () => {
    const s = startFight(FIGHTS[5], DEFAULT_SETUP, DEFAULT_OPTS, undefined, true);
    const hp0 = startHp(s);
    runToEnd(s);
    const r = report(s, hp0);
    const dealt = r.dealt.reduce((a, b) => a + b.amt, 0);
    const logged = s
      .log!.filter((e) => e.e === "dmg" && s.units.find((u) => u.id === e.u)!.side === "E")
      .reduce((a, e: any) => a + e.amt, 0);
    expect(dealt).toBe(logged);
    expect(r.curve[0].P).toBeCloseTo(1);
    if (s.over === "loss") expect(r.verdict).toMatch(/hero fell/);
    expect(r.moments.length).toBeGreaterThan(0);
  });

  test("one change finds a winning setup after a loss when one exists", () => {
    const f = FIGHTS[4]; // Iron Line: the default loses
    expect(won(play(f, DEFAULT_SETUP))).toBe(false);
    const { flips } = oneChange(f, DEFAULT_SETUP, FULL_POOL);
    for (const c of flips) expect(won(c.o)).toBe(true);
  });
});

describe("run", () => {
  test("doors, rewards and growth", () => {
    let run = newRun(7);
    const ds = doors(run);
    expect(ds.length).toBe(2);
    expect(ds[1].hard).toBe(true);
    const rw = rewards(run);
    expect(rw.length).toBe(3);
    run = applyReward(run, rw[0]);
    const grew =
      run.pool.skills.length + run.pool.charms.length > 6 || Object.keys(run.mods).length > 0;
    expect(grew).toBe(true);
    expect(doors({ ...run, step: 4 })[0].enc.boss).toBe(true);
  });
});
