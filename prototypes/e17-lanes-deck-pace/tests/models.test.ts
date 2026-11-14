// e17's switches: the three deck models, the rule fixes (each also tested off), and the
// pacing model shared by the view and the metrics.
import { describe, expect, it } from "vite-plus/test";
import {
  type Action,
  type Encounter,
  type RuleOpts,
  type State,
  DECK_MODELS,
  DEFAULT_OPTS,
  E14_OPTS,
  REVIVE_ROUNDS,
  apply,
  allies,
  endTurn,
  enemies,
  hero,
  legalActions,
  newFight,
  threats,
  unitAt,
} from "../src/rules.ts";
import { ENEMY_KINDS, generate } from "../src/content.ts";
import { BOTS, playFight } from "../src/bots.ts";
import {
  PACES,
  TIMING,
  clicksFor,
  onlyMovesLeft,
  paceFrom,
  rulesFrom,
  stepDelays,
} from "../src/pace.ts";

const fight = (enemies: Encounter["enemies"], opts: Partial<RuleOpts> = {}): State =>
  newFight({ name: "test", enemies }, 1, opts);
const pet = (s: State) => allies(s).find((u) => u.kind === "beetle")!;

describe("deck=party: one deck, every card names its owner", () => {
  it("deals 6 from a 14-card deck with hero and pet cards", () => {
    const s = fight([{ kind: "brute", slot: 0 }], { deck: "party" });
    expect(Object.keys(s.piles)).toEqual(["main"]);
    expect(s.piles.main.hand).toHaveLength(6);
    expect(s.piles.main.deck.length + 6).toBe(14);
  });
  it("the owner plays the card from its own slot", () => {
    const s = fight([{ kind: "brute", slot: 0 }], { deck: "party" });
    s.piles.main.hand = ["bite", "strike"];
    const bite = legalActions(s).filter((a) => a.kind === "card" && a.card === 0);
    expect(bite.length).toBeGreaterThan(0);
    expect(bite.every((a) => a.kind === "card" && a.unit === pet(s).id)).toBe(true);
    const before = unitAt(s, "E", 0)!.hp;
    apply(s, bite[0]);
    expect(unitAt(s, "E", 0)!.hp).toBe(before - 4);
    expect(s.energy).toBe(3); // Bite costs 0
  });
  it("summons shuffle their cards in, and take them out when they fall", () => {
    const s = fight([{ kind: "brute", slot: 0 }], { deck: "party" });
    s.piles.main.hand = ["servant"];
    apply(s, { kind: "card", pile: "main", card: 0, unit: hero(s)!.id, target: 2 });
    const count = (st: State) =>
      [...st.piles.main.deck, ...st.piles.main.discard, ...st.piles.main.hand].filter(
        (c) => c === "bash",
      ).length;
    expect(count(s)).toBe(2);
    const servant = unitAt(s, "P", 2)!;
    servant.hp = 1;
    servant.block = 0;
    s.ground.P[2].fire = 2;
    endTurn(s);
    expect(allies(s).some((u) => u.kind === "servant")).toBe(false);
    expect(count(s)).toBe(0);
  });
  it("cards of an absent owner are never dealt", () => {
    const s = fight([{ kind: "brute", slot: 0 }], { deck: "party", revive: true });
    const p = pet(s);
    p.hp = 1;
    p.block = 0;
    s.ground.P[0].fire = 2; // knocked out at the end of the round
    endTurn(s);
    expect(allies(s).some((u) => u.kind === "beetle")).toBe(false);
    expect(s.piles.main.hand.some((c) => ["bite", "drag", "shell"].includes(c))).toBe(false);
  });
});

describe("deck=squad: every unit has its own deck, hand and actions", () => {
  it("gives the hero and the pet their own hands", () => {
    const s = fight([{ kind: "brute", slot: 0 }], { deck: "squad" });
    expect(s.piles[String(hero(s)!.id)].hand).toHaveLength(4);
    expect(s.piles[String(pet(s).id)].hand).toHaveLength(2);
    expect(hero(s)!.ap).toBe(3);
    expect(pet(s).ap).toBe(1);
  });
  it("a card or a move uses one of the unit's actions", () => {
    const s = fight([{ kind: "brute", slot: 0 }], { deck: "squad" });
    const p = pet(s);
    s.piles[String(p.id)].hand = ["bite", "bite"];
    apply(s, { kind: "card", pile: String(p.id), card: 0, unit: p.id, target: 0 });
    expect(p.ap).toBe(0);
    expect(legalActions(s).some((a) => a.kind !== "end" && "unit" in a && a.unit === p.id)).toBe(
      false,
    );
  });
  it("a summon gets its own pile and acts from the next turn", () => {
    const s = fight([{ kind: "brute", slot: 0 }], { deck: "squad" });
    const h = hero(s)!;
    s.piles[String(h.id)].hand = ["totem"];
    apply(s, { kind: "card", pile: String(h.id), card: 0, unit: h.id, target: 2 });
    const t = unitAt(s, "P", 2)!;
    expect(s.piles[String(t.id)]).toBeDefined();
    expect(t.ap).toBe(0);
    endTurn(s);
    if (!s.over) expect(s.piles[String(t.id)].hand).toHaveLength(2);
  });
});

describe("rule fixes, each on and off", () => {
  it("spread: in round 1 at most one strike aims at each of your slots", () => {
    const enc: Encounter["enemies"] = [
      { kind: "spider", slot: 0 },
      { kind: "spider", slot: 1 },
      { kind: "archer", slot: 2 },
    ];
    const per = (s: State) => {
      const m = new Map<number, number>();
      for (const t of threats(s)) if (t.damage) m.set(t.slot, (m.get(t.slot) ?? 0) + 1);
      return Math.max(...m.values());
    };
    expect(per(fight(enc, { spread: true }))).toBe(1);
    expect(per(fight(enc, { spread: false }))).toBeGreaterThan(1);
  });
  it("fallback: a priest pulled out of position casts its other spell instead of nothing", () => {
    for (const fallback of [true, false]) {
      const s = fight(
        [
          { kind: "priest", slot: 0 },
          { kind: "priest", slot: 1 },
        ],
        { fallback, deck: "hero" },
      );
      const p = unitAt(s, "E", 1)!;
      p.intent = { ability: "firerain", target: 0, side: "P" };
      s.piles.main.hand[0] = "hook";
      apply(s, { kind: "card", pile: "main", card: 0, unit: hero(s)!.id, target: 1 });
      expect(unitAt(s, "E", 0)).toBe(p); // Fire Rain needs slots 2-4
      endTurn(s);
      const fiz = s.events.find((e) => e.t === "fizzle" && e.unit === p.id);
      expect(fiz?.kind === "fallback").toBe(fallback);
    }
  });
  it("fire: a blaze burns 3 for 2 rounds (e14: 4 for 3), a flash deals 1.5x (e14: 2x)", () => {
    for (const fire of [true, false]) {
      const s = fight([{ kind: "brute", slot: 0 }], { fire, short: false, deck: "hero" });
      s.ground.E[0].oil = true;
      s.piles.main.hand[0] = "firebolt";
      apply(s, { kind: "card", pile: "main", card: 0, unit: hero(s)!.id, target: 0 });
      expect(s.ground.E[0].fire).toBe(fire ? 2 : 3);
      const b = fight([{ kind: "brute", slot: 0 }], { fire, short: false, deck: "hero" });
      b.ground.E[0].poison = 4;
      const brute = unitAt(b, "E", 0)!;
      b.piles.main.hand[0] = "firebolt";
      apply(b, { kind: "card", pile: "main", card: 0, unit: hero(b)!.id, target: 0 });
      expect(brute.maxHp - brute.hp).toBe(3 + (fire ? 6 : 8));
    }
  });
  it("short: enemies have 75% HP and hit 25% harder", () => {
    const on = fight([{ kind: "brute", slot: 0 }], { short: true });
    const off = fight([{ kind: "brute", slot: 0 }], { short: false });
    expect(enemies(on)[0].maxHp).toBe(Math.round(ENEMY_KINDS.brute.hp * 0.75));
    expect(enemies(off)[0].maxHp).toBe(ENEMY_KINDS.brute.hp);
    const dmg = (s: State) => threats(s).find((t) => t.damage)!.damage;
    expect(dmg(on)).toBe(Math.round(dmg(off) * 1.25));
  });
  it("revive: a knocked-out pet comes back at half HP; off, it stays dead", () => {
    for (const revive of [true, false]) {
      const s = fight([{ kind: "archer", slot: 0 }], { revive });
      const p = pet(s);
      p.hp = 1;
      s.ground.P[0].fire = 1;
      endTurn(s);
      expect(allies(s).includes(p)).toBe(false);
      for (let i = 0; i < REVIVE_ROUNDS && !s.over; i++) endTurn(s);
      if (s.over) continue;
      expect(allies(s).includes(p)).toBe(revive);
      if (revive) expect(p.hp).toBe(Math.round(p.maxHp / 2));
    }
  });
  it("e14 rules switch everything off", () => {
    expect(E14_OPTS).toEqual({
      deck: "hero",
      short: false,
      spread: false,
      fallback: false,
      fire: false,
      revive: false,
    });
    expect(DEFAULT_OPTS.deck).toBe("squad");
  });
});

describe("pace", () => {
  it("presets and URL flags", () => {
    expect(paceFrom(new URLSearchParams("")).buffer).toBe(true);
    expect(paceFrom(new URLSearchParams("pace=classic"))).toEqual(PACES.classic);
    const p = paceFrom(new URLSearchParams("pace=classic&group=1&anim=0.5"));
    expect(p.group && p.anim === 0.5 && !p.buffer).toBe(true);
    const r = rulesFrom(new URLSearchParams("deck=squad&fire=0"), DEFAULT_OPTS);
    expect(r.deck === "squad" && !r.fire && r.spread).toBe(true);
    expect(rulesFrom(new URLSearchParams("rules=e14&deck=hero"), DEFAULT_OPTS)).toEqual(E14_OPTS);
  });
  it("grouped enemies wait the stagger between actions, not the full beat", () => {
    const s = fight([
      { kind: "brute", slot: 0 },
      { kind: "archer", slot: 1 },
      { kind: "archer", slot: 2 },
    ]);
    const sideOf = new Map(s.units.map((u) => [u.id, u.side]));
    apply(s, { kind: "end" });
    const classic = stepDelays(s.events, sideOf, PACES.classic);
    const grouped = stepDelays(s.events, sideOf, { ...PACES.classic, group: true });
    const sum = (d: { ms: number }[]) => d.reduce((a, x) => a + x.ms, 0);
    expect(
      classic.filter((d) => d.kind === "enemyAct").every((d) => d.ms === TIMING.enemyAct),
    ).toBe(true);
    expect(sum(grouped)).toBeLessThan(sum(classic));
  });
  it("one click plays a card with a single target; e14 needs two", () => {
    const s = fight([{ kind: "brute", slot: 0 }], E14_OPTS);
    s.piles.main.hand[0] = "strike";
    const a = legalActions(s).find((x) => x.kind === "card" && x.card === 0) as Action;
    expect(clicksFor(s, a, PACES.classic)).toBe(2);
    expect(clicksFor(s, a, PACES.fast)).toBe(1);
    const ab = legalActions(s).find((x) => x.kind === "ability")!;
    expect(clicksFor(s, ab, PACES.classic)).toBe(3);
  });
  it("auto end turn counts no click when only moves are left", () => {
    const s = fight([{ kind: "brute", slot: 0 }], E14_OPTS);
    s.piles.main.hand = [];
    pet(s).ap = 0;
    expect(onlyMovesLeft(s)).toBe(true);
    expect(clicksFor(s, { kind: "end" }, PACES.fast)).toBe(0);
    expect(clicksFor(s, { kind: "end" }, PACES.classic)).toBe(1);
  });
});

describe("bots on every deck model", () => {
  it("only play legal actions and finish fights", () => {
    for (const deck of DECK_MODELS)
      for (const [name, bot] of Object.entries(BOTS)) {
        const s = playFight(newFight(generate(5), 5, { deck }), bot);
        expect(s.over, `${deck} ${name}`).not.toBeNull();
      }
  });
  it("the strong bot beats the random bot on each model", () => {
    for (const deck of DECK_MODELS) {
      let strong = 0,
        random = 0;
      for (let i = 1; i <= 5; i++) {
        if (playFight(newFight(generate(i), i, { deck }), BOTS.strong).over === "win") strong++;
        if (playFight(newFight(generate(i), i, { deck }), BOTS.random).over === "win") random++;
      }
      expect(strong, deck).toBeGreaterThan(random);
    }
  });
});
