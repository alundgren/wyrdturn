// Pacing for e17: the view's timing table and a click model, as pure code. The view
// (main.ts) waits exactly stepDelays() between animation steps, and the metrics script
// uses the same functions to report seconds of animation and clicks per round.
import {
  type Action,
  type GameEvent,
  type Side,
  type State,
  legalActions,
  type RuleOpts,
} from "./rules.ts";

export interface Pace {
  anim: number; // multiplies every animation and pause (1 = e14)
  skip: boolean; // click or Space finishes the running animation
  buffer: boolean; // input works during your own animations
  group: boolean; // enemy actions start STAGGER apart instead of one after another
  oneClick: boolean; // single-target cards play on one click; abilities sit in the hand bar
  autoEnd: boolean; // the turn ends by itself when only moves are left
}

export const PACES: Record<"classic" | "fast", Pace> = {
  classic: {
    anim: 1,
    skip: false,
    buffer: false,
    group: false,
    oneClick: false,
    autoEnd: false,
  },
  fast: { anim: 0.6, skip: true, buffer: true, group: true, oneClick: true, autoEnd: true },
};

// e14's waits, in ms at anim 1.
export const TIMING = {
  player: 520, // after each step of your own action
  enemyAct: 900, // after each enemy action
  enemyOther: 600, // other enemy-phase steps (ground tick, steps up)
  stagger: 300, // group: between enemy actions that start together
  hitDelay: 280, // damage number and hit flinch, after the step starts
  deathDelay: 400,
  move: 350, // slot-to-slot tween
  autoEndDelay: 700, // banner before an automatic end of turn
};

// URL switches -> pace and rules options. `pace=classic|fast` picks a preset, then each
// flag can override it: anim=0.5 skip=0 buffer=1 group=0 oneclick=1 autoend=0.
export function paceFrom(q: URLSearchParams): Pace {
  const base = { ...PACES[q.get("pace") === "classic" ? "classic" : "fast"] };
  const flag = (k: string, cur: boolean) => (q.has(k) ? q.get(k) !== "0" : cur);
  if (q.has("anim")) base.anim = Math.max(0.05, Number(q.get("anim")) || 1);
  base.skip = flag("skip", base.skip);
  base.buffer = flag("buffer", base.buffer);
  base.group = flag("group", base.group);
  base.oneClick = flag("oneclick", base.oneClick);
  base.autoEnd = flag("autoend", base.autoEnd);
  return base;
}

// Rules switches from the URL: deck=hero|party|squad, short=0|1, and the e14 fixes
// spread, fallback, fire, revive (each 0|1). `rules=e14` turns all fixes and short fights off.
export function rulesFrom(q: URLSearchParams, defaults: RuleOpts): RuleOpts {
  const o = { ...defaults };
  if (q.get("rules") === "e14")
    Object.assign(o, { short: false, spread: false, fallback: false, fire: false, revive: false });
  const d = q.get("deck");
  if (d === "hero" || d === "party" || d === "squad") o.deck = d;
  for (const k of ["short", "spread", "fallback", "fire", "revive"] as const)
    if (q.has(k)) o[k] = q.get(k) !== "0";
  return o;
}

export type StepKind = "player" | "enemyAct" | "enemyOther";

// The wait after each animation step of one apply() call, in ms. `sideOf` maps unit ids
// to sides (units that died in this call are only known from the state before).
export function stepDelays(
  events: GameEvent[],
  sideOf: Map<number, Side>,
  pace: Pace,
): { step: number; kind: StepKind; ms: number }[] {
  const steps = [...new Set(events.map((e) => e.step))];
  const kinds = steps.map((st): StepKind => {
    const group = events.filter((e) => e.step === st);
    const enemyAct = group.some((e) => e.t === "act" && sideOf.get(e.unit ?? -1) === "E");
    if (enemyAct) return "enemyAct";
    return group.some((e) => sideOf.get(e.unit ?? -1) === "E") ? "enemyOther" : "player";
  });
  const lastAct = kinds.lastIndexOf("enemyAct");
  return steps.map((step, i) => {
    const k = kinds[i];
    let ms = TIMING[k];
    // acting together: every enemy action but the last only waits the stagger
    if (pace.group && k === "enemyAct" && i !== lastAct) ms = TIMING.stagger;
    if (pace.group && k === "enemyOther") ms = TIMING.stagger;
    return { step, kind: k, ms: ms * pace.anim };
  });
}

// Seconds of animation one apply() call shows, and how many of those the player must wait
// (with buffer on, your own animations never block input).
export function animSeconds(
  before: State,
  after: State,
  pace: Pace,
): { anim: number; wait: number } {
  const sideOf = new Map<number, Side>(before.units.map((u) => [u.id, u.side]));
  for (const e of after.events) if (e.t === "summon" && e.unit != null) sideOf.set(e.unit, "P");
  const d = stepDelays(after.events, sideOf, pace);
  const anim = d.reduce((a, x) => a + x.ms, 0) / 1000;
  const blocking = d.filter((x) => !pace.buffer || x.kind !== "player");
  return { anim, wait: blocking.reduce((a, x) => a + x.ms, 0) / 1000 };
}

// Clicks a person needs for an action, on the state before it.
//   card: click the card, click the target (oneClick: 1 when it has a single target).
//   ability (hero model): click the unit, the ability, the target (oneClick: abilities sit
//     in the hand bar, so 2, or 1 with a single target).
//   move: click the unit, click the neighbour slot.
//   end: 1 (autoEnd: 0 when nothing but moves is left).
export function clicksFor(s: State, a: Action, pace: Pace): number {
  if (a.kind === "move") return 2;
  if (a.kind === "end") return pace.autoEnd && onlyMovesLeft(s) ? 0 : 1;
  const acts = legalActions(s);
  if (a.kind === "card") {
    const name = s.piles[a.pile].hand[a.card];
    const targets = new Set(
      acts
        .filter(
          (b) => b.kind === "card" && b.pile === a.pile && s.piles[b.pile].hand[b.card] === name,
        )
        .map((b) => (b.kind === "card" ? `${b.unit}:${b.target}` : "")),
    );
    return pace.oneClick && targets.size === 1 ? 1 : 2;
  }
  const targets = acts.filter(
    (b) => b.kind === "ability" && b.unit === a.unit && b.ability === a.ability,
  ).length;
  if (!pace.oneClick) return 3;
  return targets === 1 ? 1 : 2;
}

// Nothing left to play but moves (the auto end turn condition).
export function onlyMovesLeft(s: State): boolean {
  return !legalActions(s).some((a) => a.kind === "card" || a.kind === "ability");
}
