// Metrics and failure gates from research/depth-lanes.md, over many generated fights.
// Usage: node scripts/metrics.ts [fights=300] [--write]   (--write updates RESULT.md)
import { readFileSync, writeFileSync } from "node:fs";
import {
  type Options,
  type State,
  ALL_ON,
  CARDS,
  apply,
  clone,
  hero,
  newFight,
  wolf,
} from "../src/rules/combat.ts";
import { FIGHTS, type GenInfo, generate } from "../src/rules/encounters.ts";
import {
  BOTS,
  type Bot,
  type TurnInfo,
  categories,
  playFight,
  search,
  seedRandomBot,
} from "../src/rules/bots.ts";
import { rng } from "../src/rules/rng.ts";

const N = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 300);
const WRITE = process.argv.includes("--write");
const t0 = performance.now();
const genInfo: GenInfo = { rejected: 0 };
const fights = Array.from({ length: N }, (_, i) => ({
  seed: i + 1,
  d: 1 + (i % 5),
  enc: generate(i + 1, 1 + (i % 5), genInfo),
  deck: 7919 * (i + 1),
}));

const out: string[] = [];
const say = (x = "") => {
  out.push(x);
  console.log(x);
};
const pct = (x: number) => `${Math.round(100 * x)}%`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const f1 = (x: number) => x.toFixed(1);
function wilson(k: number, n: number): string {
  if (!n) return "-";
  const z = 1.96,
    p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return `${pct(p)} (${pct(Math.max(0, c - h))}-${pct(Math.min(1, c + h))})`;
}
// paired bootstrap of mean(a - b) over fights, in points
function bootstrap(a: number[], b: number[]): [number, number, number] {
  const r = rng(12345);
  const n = a.length;
  const diffs = a.map((x, i) => x - b[i]);
  const means: number[] = [];
  for (let k = 0; k < 1000; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += diffs[Math.floor(r() * n)];
    means.push(s / n);
  }
  means.sort((x, y) => x - y);
  return [avg(diffs) * 100, means[25] * 100, means[974] * 100];
}
const pts = ([m, lo, hi]: [number, number, number]) =>
  `${m >= 0 ? "" : "-"}${Math.abs(Math.round(m))} pts (${Math.round(lo)} to ${Math.round(hi)})`;

interface Run {
  win: number[];
  heroHp: number[];
  rounds: number[];
  winRounds: number[];
  wolfAlive: number[];
  states: State[];
  ms: number;
}

function run(bot: Bot, opts: Options = ALL_ON, onTurn?: (t: TurnInfo, f: number) => void): Run {
  const r: Run = {
    win: [],
    heroHp: [],
    rounds: [],
    winRounds: [],
    wolfAlive: [],
    states: [],
    ms: 0,
  };
  const t = performance.now();
  fights.forEach((f, i) => {
    seedRandomBot(f.deck);
    const s = playFight(
      newFight(f.enc, f.deck, opts),
      bot,
      onTurn ? (x) => onTurn(x, i) : undefined,
    );
    r.win.push(s.over === "win" ? 1 : 0);
    r.heroHp.push(hero(s)?.hp ?? 0);
    r.rounds.push(s.round);
    if (s.over === "win") r.winRounds.push(s.round);
    r.wolfAlive.push(wolf(s) ? 1 : 0);
    r.states.push(s);
  });
  r.ms = (performance.now() - t) / fights.length;
  return r;
}

// ---------------- strong bot with turn-level tracking ------------------------------
interface TurnRec {
  distinct: number;
  distinctNoPos: number;
  nearBest: number;
  cats: string;
  laneEnd: number;
  pass: boolean;
  passGap: number;
}
const turns: TurnRec[] = [];
const summonCells: Record<string, number> = {};
const summonRel: Record<string, number> = {};
let mismatches = 0;
let committed = 0;
let lastSearch: ReturnType<typeof search> | null = null;
const trackedStrong: Bot = (s) => {
  lastSearch = search(s);
  return lastSearch.line;
};
const strongTurn = (t: TurnInfo) => {
  committed++;
  if (t.predicted !== t.actual) mismatches++;
  const res = lastSearch!;
  const best = res.score;
  const noPos = new Set<string>();
  let near = 0;
  for (const [k, v] of res.outcomes) {
    noPos.add(k.replace(/@\d\d/g, "").split("|").slice(0, 2).join("|"));
    if (v >= best - 5) near++;
  }
  const s = clone(t.before);
  for (const a of t.line) {
    if (a.t === "card") {
      const c = s.hand[a.idx];
      if ((c === "servant" || c === "totem") && a.cell) {
        const h = hero(s)!;
        summonCells[`${c} lane ${a.cell.lane} row ${a.cell.row}`] =
          (summonCells[`${c} lane ${a.cell.lane} row ${a.cell.row}`] ?? 0) + 1;
        const rel = `${a.cell.lane === h.lane ? "own lane" : "other lane"} row ${a.cell.row}`;
        summonRel[rel] = (summonRel[rel] ?? 0) + 1;
      }
    }
    apply(s, a, false);
  }
  turns.push({
    distinct: res.outcomes.size,
    distinctNoPos: noPos.size,
    nearBest: near,
    cats: categories(t.before, t.line).join("+") || "pass",
    laneEnd: hero(s)?.lane ?? 1,
    pass: t.line.length === 0,
    passGap: best - res.passScore,
  });
};

// also check the contract on greedy and random
const contract = (t: TurnInfo) => {
  committed++;
  if (t.predicted !== t.actual) mismatches++;
};

const strong = run(trackedStrong, ALL_ON, strongTurn);
const policies: Record<string, Run> = { strong };
for (const name of Object.keys(BOTS)) {
  if (name === "strong") continue;
  policies[name] = run(
    BOTS[name],
    ALL_ON,
    name === "greedy" || name === "random" ? contract : undefined,
  );
}

// ---------------- hand-made fights ------------------------------------------------
const handRuns: Record<string, string[]> = {};
const HAND_BOTS = ["strong", "greedy", "random", "hitDodge", "nearest"];
for (const name of HAND_BOTS) {
  handRuns[name] = FIGHTS.map((f) => {
    let w = 0,
      rounds = 0;
    for (let j = 1; j <= 30; j++) {
      seedRandomBot(j);
      const s = playFight(newFight(f, j * 97), BOTS[name], contract);
      if (s.over === "win") w++;
      rounds += s.round;
    }
    return `${pct(w / 30)} / ${f1(rounds / 30)}`;
  });
}

// ---------------- feature-off tests -----------------------------------------------
const ABLATIONS: [string, Partial<Options>][] = [
  [
    "ground cards off (Oil, Frost, Miasma become Strike; Firebolt does not ignite)",
    { ground: false },
  ],
  [
    "push and pull off (Shove, Hook become Strike; no wolf Shove; Bash does not push)",
    { push: false },
  ],
  ["sideways steps off (hero and wolf never step)", { sideways: false }],
  ["summons off (Bone Servant, Spirit Totem become Strike)", { summons: false }],
  ["all blockers off (summons and Frost become Strike)", { summons: false, ice: false }],
  ["no wolf", { wolf: false }],
  ["wolf skills off (body stays)", { wolfSkills: false }],
  ["depth off (front and pierce attacks reach any row)", { depth: false }],
  ["lane reach off (lane cards aim at any lane)", { lanes: false }],
];
const ablation: Record<string, Run> = {};
for (const [name, o] of ABLATIONS) ablation[name] = run(BOTS.strong, { ...ALL_ON, ...o });

// ---------------- report ----------------------------------------------------------
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const W = (r: Run) => sum(r.win);
say(
  `Sample: ${N} generated fights (seeds 1-${N}, difficulty 1-5 in turn), the same seeds and deck order for every policy and config; 6 hand-made fights x 30 deck seeds. Strong search: beam 6, up to 8 actions per turn, each line scored after the enemy phase and the new intents. 95% intervals: Wilson for win rates, paired bootstrap (1000 resamples) for differences.`,
);
say();
say("### Success and pacing");
say();
say(
  "| Policy | Win (95% CI) | Lost to time | Rounds (all) | Rounds (wins) | Hero HP left (wins) | Wolf alive | ms/fight |",
);
say("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const [name, r] of Object.entries(policies))
  say(
    `| ${name} | ${wilson(W(r), N)} | ${pct(r.states.filter((s) => s.over === "loss" && hero(s)).length / N)} | ${f1(avg(r.rounds))} | ${f1(avg(r.winRounds))} | ${f1(avg(r.heroHp.filter((_, i) => r.win[i])))} | ${pct(avg(r.wolfAlive))} | ${r.ms.toFixed(0)} |`,
  );
say();
say("Win rate by difficulty:");
say();
say("| Policy | d1 | d2 | d3 | d4 | d5 |");
say("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const [name, r] of Object.entries(policies)) {
  const cells = [1, 2, 3, 4, 5].map((d) => {
    const idx = fights.map((f, i) => (f.d === d ? i : -1)).filter((i) => i >= 0);
    return pct(avg(idx.map((i) => r.win[i])));
  });
  say(`| ${name} | ${cells.join(" | ")} |`);
}
say();
say("Hand-made fights (30 deck seeds each), win rate / average rounds:");
say();
say(`| Fight | ${HAND_BOTS.join(" | ")} |`);
say(`| --- | ${HAND_BOTS.map(() => "---:").join(" | ")} |`);
FIGHTS.forEach((f, i) =>
  say(`| ${i + 1}. ${f.name} | ${HAND_BOTS.map((b) => handRuns[b][i]).join(" | ")} |`),
);

say();
say("### Decision variety (strong bot)");
say();
const catCount: Record<string, number> = {};
let repeats = 0;
turns.forEach((t, i) => {
  catCount[t.cats] = (catCount[t.cats] ?? 0) + 1;
  if (i > 0 && t.cats === turns[i - 1].cats) repeats++;
});
const top = Object.entries(catCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([k, v]) => `${k} ${pct(v / turns.length)}`)
  .join(", ");
const noUseful = turns.filter((t) => t.passGap < 5).length;
say(`- Turns: ${turns.length} (${f1(turns.length / N)} per fight).`);
say(
  `- Distinct outcomes after the enemy phase (alive units, HP in 2-point steps, positions, ground): median ${median(turns.map((t) => t.distinct))}, mean ${f1(avg(turns.map((t) => t.distinct)))}. Without positions and ground: median ${median(turns.map((t) => t.distinctNoPos))}.`,
);
say(
  `- Near-best outcomes (within 5 score points, about 2 hero HP, of the best): median ${median(turns.map((t) => t.nearBest))}, mean ${f1(avg(turns.map((t) => t.nearBest)))}.`,
);
say(
  `- Best turn uses the same set of action kinds as the turn before: ${pct(repeats / Math.max(1, turns.length - 1))}.`,
);
say(`- Turns where nothing beats passing by 5+ points: ${pct(noUseful / turns.length)}.`);
say(`- Most common turns (kinds of action used): ${top}.`);

say();
say("### Dominant patterns");
say();
say("| Policy | What it does | Strong minus policy, win |");
say("| --- | --- | ---: |");
const POLICY_TEXT: Record<string, string> = {
  greedy: "best single action at a time, reads intents",
  random: "random legal actions",
  middle: "strong, but the hero never leaves the middle lane",
  edge: "strong, but the hero goes to the left lane and stays",
  blockFront: "always a Bone Servant in front of the hero, then hit the nearest",
  hitDodge: "hit the nearest from your lane, then step out of the red cell",
  damage: "strong, but only damage cards",
  nearest: "always hit the nearest enemy as hard as possible",
};
for (const [name, r] of Object.entries(policies))
  if (name !== "strong")
    say(`| ${name} | ${POLICY_TEXT[name] ?? ""} | ${pts(bootstrap(strong.win, r.win))} |`);

say();
say("### Lanes, reach and blockers (strong bot)");
say();
const st = strong.states.map((s) => s.stats);
const laneShare = [0, 1, 2].map((l) => turns.filter((t) => t.laneEnd === l).length / turns.length);
const hd = sum(st.map((x) => x.hitAndDodge)) / turns.length;
say(
  `- Hero ends the turn in lane left / middle / right: ${laneShare.map(pct).join(" / ")}. Hero steps ${f1(avg(st.map((x) => x.heroSteps)))} per fight, of which dodges (out of a red cell into a safe one) ${f1(avg(st.map((x) => x.dodgeSteps)))}; wolf steps ${f1(avg(st.map((x) => x.wolfSteps)))}.`,
);
say(`- Hit-and-dodge turns (card damage, then a step out of a red cell): ${pct(hd)} of turns.`);
const reach = {
  front: 0,
  pierce: 0,
  lane: 0,
  lob: 0,
  wolf: 0,
  summon: 0,
  ground: 0,
  collide: 0,
} as Record<string, number>;
for (const x of st)
  for (const [k, v] of Object.entries(x.dmgByReach)) reach[k] = (reach[k] ?? 0) + v;
const rt = sum(Object.values(reach));
say(
  `- Damage to enemies by source: ${Object.entries(reach)
    .map(([k, v]) => `${k} ${pct(v / rt)}`)
    .join(", ")}.`,
);
const kills = [0, 0, 0, 0, 0, 0];
for (const x of st) x.killRows.forEach((v, i) => (kills[i] += v));
const kt = sum(kills);
say(
  `- Kills by row (1 = next to the line): ${kills
    .slice(1)
    .map((v, i) => `row ${i + 1} ${pct(v / kt)}`)
    .join(", ")}.`,
);
say(
  `- Blockers per fight: ${f1(avg(st.map((x) => x.summons)))} summons, ${f1(avg(st.map((x) => x.summonAbsorbed)))} damage absorbed by them, ${f1(avg(st.map((x) => x.arrowsCaught)))} arrows caught, ${f1(avg(st.map((x) => x.blockedMoves)))} walker moves stopped, ${f1(avg(st.map((x) => x.iceStops)))} walkers stuck in ice.`,
);
const sc = Object.entries(summonCells).sort((a, b) => b[1] - a[1]);
const scTotal = sum(sc.map((x) => x[1]));
say(
  `- Summon placement, top cells: ${sc
    .slice(0, 4)
    .map(([k, v]) => `${k} ${pct(v / scTotal)}`)
    .join(", ")}. Relative to the hero: ${Object.entries(summonRel)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${pct(v / scTotal)}`)
    .join(", ")}.`,
);
say(
  `- Ground and push per fight: ${f1(avg(st.map((x) => x.ignites)))} ignites, ${f1(avg(st.map((x) => x.blazes)))} blazes, ${f1(avg(st.map((x) => x.forcedHazard)))} enemies forced into a hazard, ${f1(avg(st.map((x) => x.collisions)))} collisions, ${f1(avg(st.map((x) => x.slams)))} wall slams.`,
);
const cards: Record<string, number> = {};
for (const x of st) for (const [k, v] of Object.entries(x.cards)) cards[k] = (cards[k] ?? 0) + v;
say(
  `- Cards played per fight: ${Object.entries(cards)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${CARDS[k as keyof typeof CARDS].name} ${f1(v / N)}`)
    .join(", ")}.`,
);
say(
  `- Wolf: dies in ${pct(1 - avg(strong.wolfAlive))} of fights; ${f1(avg(st.map((x) => x.bites)))} bites, ${f1(avg(st.map((x) => x.wolfShoves)))} shoves, ${f1(avg(st.map((x) => x.guards)))} guards (${f1(avg(st.map((x) => x.guardPrevented)))} damage prevented) per fight. Ward prevented ${f1(avg(st.map((x) => x.wardPrevented)))} per fight.`,
);
const clutter = sum(st.map((x) => x.clutterRounds)) / sum(strong.rounds);
say(
  `- Clutter: at most ${Math.max(...st.map((x) => x.maxField))} enemies on the field; rounds with more than 6 enemies or 8 ground cells: ${pct(clutter)}.`,
);

say();
say("### Feature-off tests (strong bot)");
say();
say("| Turned off | Win | Win change (95% CI) | Median hero HP change |");
say("| --- | ---: | ---: | ---: |");
const ablDelta: Record<string, number> = {};
for (const [name] of ABLATIONS) {
  const r = ablation[name];
  const b = bootstrap(r.win, strong.win);
  ablDelta[name] = b[0];
  const hp = median(r.heroHp.map((h, i) => h - strong.heroHp[i]));
  say(`| ${name} | ${pct(avg(r.win))} | ${pts(b)} | ${hp} |`);
}

say();
say("### Control contract");
say();
say(
  `Checked ${committed} committed turns (strong, greedy, random and every hand-made run): ${mismatches} differences between the end-of-turn preview and what happened. Generator rejections: ${genInfo.rejected} of ${N + genInfo.rejected} drafts.`,
);

// ---------------- gates -----------------------------------------------------------
say();
say("### Failure gates (provisional, from the research)");
say();
const gap = (p: string) => bootstrap(strong.win, policies[p].win)[0];
const abl = (k: string) => -ablDelta[ABLATIONS.find((a) => a[0].startsWith(k))![0]];
const maxLane = Math.max(...laneShare);
const maxCell = scTotal ? sc[0][1] / scTotal : 0;
const simpleGap = Math.min(gap("nearest"), gap("damage"), gap("greedy"));
const gates: [string, boolean, string][] = [
  [
    "Dominant lane: middle and edge policies 5+ points behind strong, hero in one lane under 70% of turns",
    gap("middle") >= 5 && gap("edge") >= 5 && maxLane < 0.7,
    `middle ${Math.round(gap("middle"))} pts, edge ${Math.round(gap("edge"))} pts, top lane ${pct(maxLane)}`,
  ],
  [
    "Dominant block: block-front 5+ points behind strong, no summon cell above 70%",
    gap("blockFront") >= 5 && maxCell < 0.7,
    `${Math.round(gap("blockFront"))} pts, top cell ${pct(maxCell)}`,
  ],
  [
    "Sideways matters: turning off steps costs 10+ points",
    abl("sideways") >= 10,
    `${Math.round(abl("sideways"))} pts`,
  ],
  [
    "Depth and reach matter: depth off or lane reach off moves win rate by 5+ points",
    Math.abs(abl("depth")) >= 5 && Math.abs(abl("lane reach")) >= 5,
    `depth ${Math.round(-abl("depth"))} pts, lanes ${Math.round(-abl("lane reach"))} pts`,
  ],
  [
    "Blockers matter: all blockers off costs 5+ points",
    abl("all blockers") >= 5,
    `${Math.round(abl("all blockers"))} pts`,
  ],
  [
    "Step-back trap: hit-and-dodge 10+ points behind strong, under 40% of strong turns",
    gap("hitDodge") >= 10 && hd < 0.4,
    `${Math.round(gap("hitDodge"))} pts, ${pct(hd)} of turns`,
  ],
  [
    "Wolf: dies in at most 50% of fights, skills worth 5+ points",
    1 - avg(strong.wolfAlive) <= 0.5 && abl("wolf skills") >= 5,
    `${pct(1 - avg(strong.wolfAlive))} deaths, skills ${Math.round(abl("wolf skills"))} pts`,
  ],
  [
    "Decisions: simple policies 5+ points behind, best turn repeats its kinds under 40%",
    simpleGap >= 5 && repeats / turns.length < 0.4,
    `closest simple policy ${Math.round(simpleGap)} pts, repeats ${pct(repeats / Math.max(1, turns.length - 1))}`,
  ],
  ["Clutter: over 6 enemies or 8 ground cells in under 10% of rounds", clutter < 0.1, pct(clutter)],
  ["Control contract: no preview mismatch", mismatches === 0, `${mismatches} of ${committed}`],
  [
    "Not too easy: strong 80-95%, random under 20%",
    avg(strong.win) >= 0.8 && avg(strong.win) <= 0.95 && avg(policies.random.win) < 0.2,
    `strong ${pct(avg(strong.win))}, random ${pct(avg(policies.random.win))}`,
  ],
];
say("| Gate | Result | Value |");
say("| --- | ---: | ---: |");
for (const [g, ok, v] of gates) say(`| ${g} | ${ok ? "pass" : "**fail**"} | ${v} |`);
say();
say(`Whole run: ${((performance.now() - t0) / 1000).toFixed(0)} s.`);

if (WRITE) {
  const file = new URL("../RESULT.md", import.meta.url);
  const md = readFileSync(file, "utf8");
  const a = md.indexOf("<!-- metrics:start");
  const b = md.indexOf("<!-- metrics:end -->");
  if (a < 0 || b < 0) throw new Error("RESULT.md has no metrics markers");
  const head = md.slice(0, md.indexOf("\n", a) + 1);
  writeFileSync(file, `${head}\n${out.join("\n")}\n\n${md.slice(b)}`);
  console.log("RESULT.md updated");
}
