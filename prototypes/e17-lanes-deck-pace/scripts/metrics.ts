// e17 metrics over many generated fights, per deck model, side by side:
//   1. win rate per bot and rounds per fight
//   2. pace: clicks per round and per fight, seconds of animation and of waiting per round
//      and per fight, for the classic and fast pace (timings from src/pace.ts, the same
//      table the view waits on)
//   3. decision variety and dominant patterns (strong bot)
//   4. who acts: how often each unit's cards or abilities are played, and dead draws
//      (turns where a living unit has nothing it can play)
//   5. feature-off: the strong bot with each rules fix turned off, one at a time
// Usage: node scripts/metrics.ts [fights=200] [--json] [--quick]  (--quick skips 5)
import {
  type Action,
  type DeckModel,
  type RuleOpts,
  type State,
  DECK_MODELS,
  DEFAULT_OPTS,
  E14_OPTS,
  allies,
  apply,
  clone,
  hero,
  legalActions,
  newFight,
  threats,
} from "../src/rules.ts";
import { generate } from "../src/content.ts";
import { BOTS, actor, categories, playFight, search } from "../src/bots.ts";
import { PACES, TIMING, animSeconds, clicksFor } from "../src/pace.ts";

const N = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 200);
const JSON_OUT = process.argv.includes("--json");
const QUICK = process.argv.includes("--quick");
const ONLY = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",");
const fights = Array.from({ length: N }, (_, i) => ({
  enc: generate(i + 1),
  seed: 7919 * (i + 1),
}));

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const r1 = (x: number) => +x.toFixed(1);
const r2 = (x: number) => +x.toFixed(2);

function winRates(opts: RuleOpts, bots: string[]) {
  const out: Record<string, { win: number; rounds: number }> = {};
  for (const name of bots) {
    let win = 0;
    const rounds: number[] = [];
    for (const f of fights) {
      const s = playFight(newFight(f.enc, f.seed, opts), BOTS[name]);
      rounds.push(s.round);
      if (s.over === "win") win++;
    }
    out[name] = { win: r2(win / N), rounds: r1(avg(rounds)) };
  }
  return out;
}

// Does this living unit have any card or ability it can play right now?
function canAct(s: State, id: number): boolean {
  return legalActions(s).some((a) => (a.kind === "card" || a.kind === "ability") && a.unit === id);
}

// Play every fight with the strong bot and measure pace, variety and who acts.
function strongRun(opts: RuleOpts) {
  const pace = {
    classic: { clicks: 0, anim: 0, wait: 0 },
    fast: { clicks: 0, anim: 0, wait: 0 },
  };
  let rounds = 0,
    turns = 0,
    wins = 0;
  const distinctAll: number[] = [],
    distinctGood: number[] = [];
  const turnKinds: string[][] = [];
  const kindCount: Record<string, number> = {};
  const alive: Record<string, number> = {}; // unit-turns alive (and able to act at all)
  const acted: Record<string, number> = {}; // unit-turns where it played a card or ability
  const plays: Record<string, number> = {}; // cards or abilities played, per owner kind
  const dead: Record<string, number> = {}; // unit-turns with nothing playable at turn start
  let petDied = 0;
  const petDeathRound: number[] = [];
  const round1Hero: number[] = [];
  const groundBy: Record<string, number> = {};
  let ground = 0,
    dmg = 0,
    fizzles = 0,
    fallbacks = 0;
  for (const f of fights) {
    const s = newFight(f.enc, f.seed, opts);
    const h = hero(s)!;
    round1Hero.push(
      threats(s)
        .filter((t) => t.side === "P" && s.slots.P[t.slot] === h.id)
        .reduce((a, t) => a + t.damage, 0),
    );
    const kinds: string[] = [];
    while (!s.over) {
      turns++;
      // dead draws: living units that could act this turn but have nothing to play
      for (const u of allies(s)) {
        if (u.summon && u.ap === 0 && s.opts.deck !== "party") continue; // just rose
        alive[u.kind] = (alive[u.kind] ?? 0) + 1;
        if (!canAct(s, u.id)) dead[u.kind] = (dead[u.kind] ?? 0) + 1;
      }
      const r = search(s);
      const coarse = new Set(r.outcomes.map((o) => o.coarse));
      distinctAll.push(coarse.size);
      distinctGood.push(
        new Set(r.outcomes.filter((o) => o.score >= r.score - 5).map((o) => o.coarse)).size,
      );
      const cats = new Set<string>();
      const actors = new Map<number, string>(); // unit id -> kind, for units that acted
      const enemyIds = new Set(s.units.filter((u) => u.side === "E").map((u) => u.id));
      for (const a of r.seq as Action[]) {
        for (const k of categories(s, a)) cats.add(k);
        const who = actor(s, a);
        if (who && (a.kind === "card" || a.kind === "ability")) {
          plays[who] = (plays[who] ?? 0) + 1;
          actors.set(a.unit, who);
        }
        for (const p of ["classic", "fast"] as const) {
          const c = clicksFor(s, a, PACES[p]);
          pace[p].clicks += c;
          if (a.kind === "end" && c === 0 && PACES[p].autoEnd) {
            pace[p].anim += (TIMING.autoEndDelay * PACES[p].anim) / 1000;
            pace[p].wait += (TIMING.autoEndDelay * PACES[p].anim) / 1000;
          }
        }
        const before = clone(s);
        const petBefore = s.units.some((u) => u.kind === "beetle");
        apply(s, a);
        for (const p of ["classic", "fast"] as const) {
          const t = animSeconds(before, s, PACES[p]);
          pace[p].anim += t.anim;
          pace[p].wait += t.wait;
        }
        if (petBefore && !s.units.some((u) => u.kind === "beetle")) {
          petDied++;
          petDeathRound.push(s.round);
        }
        for (const e of s.events) {
          if (e.t === "fizzle" && enemyIds.has(e.unit ?? -1))
            if (e.kind === "fallback") fallbacks++;
            else fizzles++;
          if (e.t === "damage" && enemyIds.has(e.unit ?? -1)) {
            dmg += e.amount ?? 0;
            if (e.kind && /fire|poison|blaze|flash|burning/.test(e.kind)) {
              ground += e.amount ?? 0;
              const k = /flash/.test(e.kind)
                ? "flash"
                : /blaze/.test(e.kind)
                  ? "blaze"
                  : /poison/.test(e.kind)
                    ? "poison"
                    : "fire";
              groundBy[k] = (groundBy[k] ?? 0) + (e.amount ?? 0);
            }
          }
        }
        if (s.over || a.kind === "end") break;
      }
      for (const k of actors.values()) acted[k] = (acted[k] ?? 0) + 1;
      const kind = [...cats].sort((a, b) => a.localeCompare(b)).join("+") || "nothing";
      kinds.push(kind);
      kindCount[kind] = (kindCount[kind] ?? 0) + 1;
    }
    rounds += s.round;
    if (s.over === "win") wins++;
    turnKinds.push(kinds);
  }
  let repeats = 0,
    pairs = 0;
  for (const ks of turnKinds)
    ks.forEach((k, i) => {
      if (i > 0) {
        pairs++;
        if (k === ks[i - 1]) repeats++;
      }
    });
  const perUnit = Object.fromEntries(
    Object.keys(alive).map((k) => [
      k,
      {
        actsOfTurnsAlive: r2((acted[k] ?? 0) / alive[k]),
        playsPerFight: r2((plays[k] ?? 0) / N),
        deadDrawTurns: r2((dead[k] ?? 0) / alive[k]),
      },
    ]),
  );
  const paceOut = Object.fromEntries(
    (["classic", "fast"] as const).map((p) => [
      p,
      {
        clicksPerRound: r1(pace[p].clicks / rounds),
        clicksPerFight: r1(pace[p].clicks / N),
        animSecPerRound: r1(pace[p].anim / rounds),
        animSecPerFight: r1(pace[p].anim / N),
        waitSecPerRound: r1(pace[p].wait / rounds),
        waitSecPerFight: r1(pace[p].wait / N),
      },
    ]),
  );
  return {
    win: r2(wins / N),
    rounds: r1(rounds / N),
    pace: paceOut,
    variety: {
      distinctPerTurn: { median: median(distinctAll), mean: r1(avg(distinctAll)) },
      goodPerTurn: { median: median(distinctGood), mean: r1(avg(distinctGood)) },
      sameKindAsLastTurn: r2(repeats / pairs),
      topTurnKinds: Object.entries(kindCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, n]) => `${k} ${pct(n / turns)}`),
    },
    perUnit,
    pet: {
      diedIn: r2(petDied / N),
      avgDeathRound: r1(avg(petDeathRound)),
      aliveTurns: r2((alive.beetle ?? 0) / turns),
    },
    groundBy: Object.fromEntries(
      Object.entries(groundBy).map(([k, v]) => [k, r2(v / Math.max(1, dmg))]),
    ),
    round1HeroIncoming: r1(avg(round1Hero)),
    shareOfDamageFromGround: r2(ground / Math.max(1, dmg)),
    perFight: { enemyActionsLost: r2(fizzles / N), enemyFallbacks: r2(fallbacks / N) },
  };
}

// ---------------- run ----------------------------------------------------------------
const models: { name: string; opts: RuleOpts }[] = [
  { name: "e14", opts: E14_OPTS },
  ...DECK_MODELS.map((d: DeckModel) => ({ name: d, opts: { ...DEFAULT_OPTS, deck: d } })),
];
const report: Record<string, unknown> = { fights: N };
for (const m of models.filter((x) => !ONLY || ONLY.includes(x.name))) {
  const bots = winRates(m.opts, ["random", "greedy", "nearest", "retreat", "stack"]);
  const strong = strongRun(m.opts);
  report[m.name] = {
    opts: m.opts,
    bots: { ...bots, strong: { win: strong.win, rounds: strong.rounds } },
    strong,
  };
}
if (!QUICK) {
  const off: Record<string, Record<string, number>> = {};
  const base = { ...DEFAULT_OPTS };
  for (const k of ["short", "spread", "fallback", "fire", "revive"] as const) {
    const s = strongRun({ ...base, [k]: false });
    off[`${k} off`] = {
      win: s.win,
      rounds: s.rounds,
      ground: s.shareOfDamageFromGround,
      round1Hero: s.round1HeroIncoming,
      lost: s.perFight.enemyActionsLost,
    };
  }
  report.featureOff = { deck: base.deck, ...off };
}

if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
else {
  const M = models.map((m) => m.name).filter((n) => report[n]);
  const R = (name: string) =>
    report[name] as {
      bots: Record<string, { win: number; rounds: number }>;
      strong: ReturnType<typeof strongRun>;
    };
  const row = (label: string, f: (n: string) => string) =>
    console.log(`   ${label.padEnd(34)}${M.map((n) => f(n).padStart(12)).join("")}`);
  console.log(`e17 metrics over ${N} generated fights (e14 = hero deck with e14's rules)\n`);
  row("", (n) => n);
  console.log("1. Win rate / rounds per fight");
  for (const b of ["random", "greedy", "strong", "nearest", "retreat", "stack"])
    row(b, (n) => `${pct(R(n).bots[b].win)} / ${R(n).bots[b].rounds}`);
  console.log("\n2. Pace (strong bot's fights)");
  for (const p of ["classic", "fast"] as const) {
    row(
      `${p}: clicks per round / fight`,
      (n) => `${R(n).strong.pace[p].clicksPerRound} / ${R(n).strong.pace[p].clicksPerFight}`,
    );
    row(
      `${p}: anim s per round / fight`,
      (n) => `${R(n).strong.pace[p].animSecPerRound} / ${R(n).strong.pace[p].animSecPerFight}`,
    );
    row(
      `${p}: waiting s per round / fight`,
      (n) => `${R(n).strong.pace[p].waitSecPerRound} / ${R(n).strong.pace[p].waitSecPerFight}`,
    );
  }
  console.log("\n3. Decision variety (strong bot)");
  row(
    "distinct outcomes per turn (median)",
    (n) => `${R(n).strong.variety.distinctPerTurn.median}`,
  );
  row("within 5 points of best (median)", (n) => `${R(n).strong.variety.goodPerTurn.median}`);
  row("same kind of turn as last turn", (n) => pct(R(n).strong.variety.sameKindAsLastTurn));
  row("best fixed policy behind strong", (n) => {
    const b = R(n).bots;
    return pct(b.strong.win - Math.max(b.nearest.win, b.retreat.win, b.stack.win));
  });
  row("greedy behind strong", (n) => pct(R(n).bots.strong.win - R(n).bots.greedy.win));
  for (const n of M) console.log(`   ${n}: ${R(n).strong.variety.topTurnKinds.join(", ")}`);
  console.log(
    "\n4. Who acts (strong bot): acts in % of turns alive / plays per fight / dead-draw turns",
  );
  for (const k of ["hero", "beetle", "servant", "totem"])
    row(k, (n) => {
      const u = R(n).strong.perUnit[k];
      return u ? `${pct(u.actsOfTurnsAlive)}/${u.playsPerFight}/${pct(u.deadDrawTurns)}` : "-";
    });
  row(
    "pet falls in (avg round)",
    (n) => `${pct(R(n).strong.pet.diedIn)} (${R(n).strong.pet.avgDeathRound})`,
  );
  row("pet on the field, share of turns", (n) => pct(R(n).strong.pet.aliveTurns));
  row("round-1 damage aimed at the hero", (n) => `${R(n).strong.round1HeroIncoming}`);
  row("enemy damage from fire/poison", (n) => pct(R(n).strong.shareOfDamageFromGround));
  row("  fire / blaze / flash / poison", (n) =>
    ["fire", "blaze", "flash", "poison"].map((k) => pct(R(n).strong.groundBy[k] ?? 0)).join(" "),
  );
  row(
    "enemy actions lost / fallbacks",
    (n) => `${R(n).strong.perFight.enemyActionsLost} / ${R(n).strong.perFight.enemyFallbacks}`,
  );
  if (report.featureOff) {
    const fo = report.featureOff as Record<string, any>;
    console.log(`\n5. Feature off (strong bot, deck=${fo.deck}, everything else default)`);
    const d = R(fo.deck).strong;
    console.log(
      `   ${"all on".padEnd(16)} win ${pct(d.win)}  rounds ${d.rounds}  ground ${pct(d.shareOfDamageFromGround)}  round-1 hero ${d.round1HeroIncoming}  actions lost ${d.perFight.enemyActionsLost}`,
    );
    for (const [k, v] of Object.entries(fo))
      if (k !== "deck")
        console.log(
          `   ${k.padEnd(16)} win ${pct(v.win)}  rounds ${v.rounds}  ground ${pct(v.ground)}  round-1 hero ${v.round1Hero}  actions lost ${v.lost}`,
        );
  }
}
