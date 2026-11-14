// Lane combat rules for e14. Pure logic: no three.js, no DOM.
// The same code drives the browser view, the unit tests, the bots and the metrics script.
//
// Board: two rows of 4 slots facing each other. Slot 0 is the front (next to the other
// side), slot 3 the back. Ground effects (fire, oil, poison, ward) live on slots.
//
// Round: player turn (all player units, any order) -> enemies act on their shown intents,
// front slot first -> ground ticks (fire and poison hurt whoever stands there) -> effects
// fade and poison spreads -> enemies pick and show new intents -> next player turn.
//
// Intents aim at slots, not units: step out of a marked slot and the blow lands on
// whoever is there instead (or on nothing). An enemy that was pushed or pulled out of the
// slots its ability needs loses that action ("out of position").

import { CARDS, ENEMY_KINDS, PLAYER_KINDS, STARTING_DECK } from "./content.ts";

export type Side = "P" | "E";
export const SLOTS = 4;
export const HAND_SIZE = 5;
export const ENERGY = 3;
export const MAX_SUMMONS = 2;
export const MAX_ROUNDS = 20;
export const FIRE_DMG = 2;
export const BLAZE_DMG = 4;
export const BLAZE_BURST = 3;
export const COLLIDE_DMG = 1;
export const WALL_DMG = 3;
export const WARD_REDUCE = 2;

export type Effect =
  | { op: "damage"; amount: number }
  | { op: "push"; n: number }
  | { op: "pull"; n: number }
  | { op: "fire"; rounds: number }
  | { op: "oil" }
  | { op: "poison"; amount: number }
  | { op: "ward"; rounds: number }
  | { op: "block"; amount: number; all?: boolean }
  | { op: "heal"; amount: number }
  | { op: "summon"; kind: string }
  | { op: "retreat" };

// What an ability may target. "foe" needs a living enemy in the slot, "foeSlot" any
// enemy-side slot; "ally" a living unit on the user's side, "allySlot" any own slot,
// "emptyAlly" an empty own slot, "self" the user.
export type TargetKind = "foe" | "foeSlot" | "ally" | "allySlot" | "emptyAlly" | "self";

export interface Ability {
  id: string;
  name: string;
  from: number[]; // user slots it can be used from
  target: TargetKind;
  reach: number[]; // target slots (on the target side)
  area?: number[]; // extra slots hit, as offsets from the target slot (0 is implied)
  near?: boolean; // ally targets only within one slot of the user
  effects: Effect[];
  cost?: number; // hero cards: energy
  cooldown?: number; // companion abilities
  text: string;
}

export interface Ground {
  fire: number; // rounds left
  blaze: boolean; // big fire from oil
  oil: boolean;
  poison: number; // strength = damage per tick
  ward: number; // rounds left
}

export interface Intent {
  ability: string; // ability id, or "move"
  target: number; // slot
  side: Side; // side of the target slot
  to?: number; // move intents: destination slot
}

export interface Unit {
  id: number;
  kind: string;
  side: Side;
  hp: number;
  maxHp: number;
  block: number;
  armour: number;
  heavy: boolean; // ignores a push or pull of one slot
  acted: boolean; // non-hero player units: action used this turn
  summon: boolean;
  cooldowns: Record<string, number>;
  intent: Intent | null;
  memo: number; // enemy AI: counts its own actions, for alternating
}

export interface GameEvent {
  t:
    | "damage"
    | "heal"
    | "block"
    | "move"
    | "collide"
    | "wall"
    | "hazard"
    | "combo"
    | "death"
    | "summon"
    | "fizzle"
    | "act"
    | "tick"
    | "info";
  step: number; // events with the same step play together in the view
  unit?: number;
  other?: number;
  side?: Side;
  slot?: number;
  from?: number;
  to?: number;
  amount?: number;
  hp?: number;
  kind?: string;
  text: string;
}

export interface State {
  units: Unit[]; // living units only
  slots: Record<Side, (number | null)[]>;
  ground: Record<Side, Ground[]>;
  deck: string[];
  hand: string[];
  discard: string[];
  energy: number;
  round: number;
  rng: number;
  nextId: number;
  step: number;
  over: null | "win" | "lose";
  phase: "player" | "enemy";
  events: GameEvent[]; // events of the last apply/endTurn call
  name: string;
}

export type Action =
  | { kind: "card"; card: number; target: number } // card = hand index
  | { kind: "ability"; unit: number; ability: string; target: number }
  | { kind: "move"; unit: number; to: number }
  | { kind: "end" };

export interface Encounter {
  name: string;
  enemies: { kind: string; slot: number; hp?: number }[];
  ground?: { side: Side; slot: number; effect: "fire" | "oil" | "poison" | "ward" }[];
  allies?: { kind: string; slot: number }[]; // defaults: companion in 0, hero in 1
}

// ---------------- helpers ----------------------------------------------------------------

export function nextRandom(s: State): number {
  let a = (s.rng + 0x6d2b79f5) | 0;
  s.rng = a;
  a = Math.imul(a ^ (a >>> 15), 1 | a);
  a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

const other = (side: Side): Side => (side === "P" ? "E" : "P");
const emptyGround = (): Ground => ({ fire: 0, blaze: false, oil: false, poison: 0, ward: 0 });

export function unitById(s: State, id: number | null | undefined): Unit | undefined {
  if (id == null) return undefined;
  return s.units.find((u) => u.id === id);
}
export function unitAt(s: State, side: Side, slot: number): Unit | undefined {
  if (slot < 0 || slot >= SLOTS) return undefined;
  return unitById(s, s.slots[side][slot]);
}
export function slotOf(s: State, u: Unit): number {
  return s.slots[u.side].indexOf(u.id);
}
export const hero = (s: State): Unit | undefined => s.units.find((u) => u.kind === "hero");
export const enemies = (s: State): Unit[] => s.units.filter((u) => u.side === "E");
export const allies = (s: State): Unit[] => s.units.filter((u) => u.side === "P");

export function unitName(kind: string): string {
  return PLAYER_KINDS[kind]?.name ?? ENEMY_KINDS[kind]?.name ?? kind;
}
const label = (u: Unit): string => unitName(u.kind);
const slotLabel = (side: Side, slot: number): string =>
  `${side === "P" ? "your" : "enemy"} slot ${slot + 1}`;

export function abilityOf(u: Unit, id: string): Ability | undefined {
  const k = PLAYER_KINDS[u.kind] ?? ENEMY_KINDS[u.kind];
  return k?.abilities.find((a) => a.id === id);
}

export function clone(s: State): State {
  return {
    ...s,
    units: s.units.map((u) => ({
      ...u,
      cooldowns: { ...u.cooldowns },
      intent: u.intent ? { ...u.intent } : null,
    })),
    slots: { P: [...s.slots.P], E: [...s.slots.E] },
    ground: { P: s.ground.P.map((g) => ({ ...g })), E: s.ground.E.map((g) => ({ ...g })) },
    deck: [...s.deck],
    hand: [...s.hand],
    discard: [...s.discard],
    events: [],
  };
}

function emit(s: State, e: Omit<GameEvent, "step">): void {
  s.events.push({ step: s.step, ...e });
}

function shuffle(s: State, list: string[]): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

function draw(s: State, n: number): void {
  for (let i = 0; i < n; i++) {
    if (!s.deck.length) {
      s.deck = s.discard;
      s.discard = [];
      shuffle(s, s.deck);
    }
    const c = s.deck.pop();
    if (c) s.hand.push(c);
  }
}

function makeUnit(s: State, kind: string, side: Side, hp?: number): Unit {
  const k = side === "P" ? PLAYER_KINDS[kind] : ENEMY_KINDS[kind];
  if (!k) throw new Error(`unknown unit kind ${kind}`);
  const maxHp = hp ?? k.hp;
  return {
    id: s.nextId++,
    kind,
    side,
    hp: maxHp,
    maxHp,
    block: 0,
    armour: k.armour ?? 0,
    heavy: k.heavy ?? false,
    acted: false,
    summon: k.summon ?? false,
    cooldowns: {},
    intent: null,
    memo: 0,
  };
}

// ---------------- setup ------------------------------------------------------------------

export function newFight(enc: Encounter, seed: number): State {
  const s: State = {
    units: [],
    slots: { P: [null, null, null, null], E: [null, null, null, null] },
    ground: {
      P: [0, 1, 2, 3].map(emptyGround),
      E: [0, 1, 2, 3].map(emptyGround),
    },
    deck: [...STARTING_DECK],
    hand: [],
    discard: [],
    energy: ENERGY,
    round: 0,
    rng: seed | 0,
    nextId: 1,
    step: 0,
    over: null,
    phase: "player",
    events: [],
    name: enc.name,
  };
  const team = enc.allies ?? [
    { kind: "beetle", slot: 0 },
    { kind: "hero", slot: 1 },
  ];
  for (const a of team) {
    const u = makeUnit(s, a.kind, "P");
    s.units.push(u);
    s.slots.P[a.slot] = u.id;
  }
  for (const e of enc.enemies) {
    const u = makeUnit(s, e.kind, "E", e.hp);
    s.units.push(u);
    s.slots.E[e.slot] = u.id;
  }
  for (const g of enc.ground ?? []) {
    const gr = s.ground[g.side][g.slot];
    if (g.effect === "fire") gr.fire = 2;
    if (g.effect === "oil") gr.oil = true;
    if (g.effect === "poison") gr.poison = 3;
    if (g.effect === "ward") gr.ward = 2;
  }
  compact(s, "P");
  compact(s, "E");
  shuffle(s, s.deck);
  for (const e of enemies(s)) e.intent = chooseIntent(s, e);
  startPlayerTurn(s);
  s.events = [];
  return s;
}

function startPlayerTurn(s: State): void {
  s.round++;
  s.phase = "player";
  s.energy = ENERGY;
  for (const u of allies(s)) {
    u.block = 0;
    u.acted = false;
    for (const k of Object.keys(u.cooldowns)) u.cooldowns[k] = Math.max(0, u.cooldowns[k] - 1);
  }
  s.discard.push(...s.hand);
  s.hand = [];
  draw(s, HAND_SIZE);
}

// ---------------- damage, movement, ground ---------------------------------------------

// true = hazard or crush damage: ignores ward and armour (block still absorbs it unless
// `raw`: fire and poison burn straight through block).
function hurt(
  s: State,
  u: Unit,
  amount: number,
  why: string,
  opts: { true?: boolean; raw?: boolean } = {},
): void {
  if (!s.units.includes(u)) return;
  let a = amount;
  if (!opts.true) {
    const slot = slotOf(s, u);
    if (s.ground[u.side][slot]?.ward > 0) a -= WARD_REDUCE;
    a -= u.armour;
  }
  a = Math.max(0, a);
  if (!opts.raw && u.block > 0) {
    const b = Math.min(u.block, a);
    u.block -= b;
    a -= b;
  }
  u.hp -= a;
  emit(s, {
    t: "damage",
    unit: u.id,
    amount: a,
    hp: Math.max(0, u.hp),
    kind: why,
    text: `${label(u)} takes ${a}${why ? ` (${why})` : ""}${u.hp <= 0 ? " and dies" : `, ${u.hp} HP left`}`,
  });
  if (u.hp <= 0) kill(s, u);
}

function kill(s: State, u: Unit): void {
  const slot = slotOf(s, u);
  s.units = s.units.filter((x) => x !== u);
  if (slot >= 0) s.slots[u.side][slot] = null;
  emit(s, { t: "death", unit: u.id, side: u.side, slot, text: `${label(u)} falls` });
  if (u.kind === "hero") s.over = "lose";
  else if (!enemies(s).length) s.over = "win";
  compact(s, u.side);
}

// No gaps: units always fill a row from the front (slot 0). When someone falls, everyone
// behind steps up. So moving means swapping with a neighbour, and nobody can hide in an
// empty back row.
export function compact(s: State, side: Side): void {
  const ids = s.slots[side].filter((x): x is number => x != null);
  const before = [...s.slots[side]];
  s.slots[side] = [0, 1, 2, 3].map((i) => ids[i] ?? null);
  for (const id of ids) {
    const from = before.indexOf(id),
      to = s.slots[side].indexOf(id);
    if (from !== to)
      emit(s, {
        t: "move",
        unit: id,
        side,
        from,
        to,
        text: `${label(unitById(s, id)!)} steps up to slot ${to + 1}`,
      });
  }
}

// Being forced (pushed, pulled, crashed into, or summoned) into a burning or poisoned slot
// hurts at once. Walking in on purpose only hurts at the end of the round.
function enterSlot(s: State, u: Unit, slot: number, how = "forced"): void {
  const g = s.ground[u.side][slot];
  if (g.fire > 0) hurt(s, u, g.blaze ? BLAZE_DMG : FIRE_DMG, `${how} into fire`, { true: true });
  if (g.poison > 0 && s.units.includes(u))
    hurt(s, u, g.poison, `${how} into poison`, { true: true, raw: true });
}

// dir +1 = push (toward the back), -1 = pull (toward the front).
function displace(s: State, u: Unit, dir: 1 | -1, n: number): void {
  let steps = n;
  const start = slotOf(s, u);
  if (start < 0) return;
  if (u.heavy) steps -= 1;
  if (s.ground[u.side][start].oil) steps += 1; // slick: slides one slot further
  if (steps <= 0) {
    emit(s, { t: "info", unit: u.id, text: `${label(u)} is too heavy to move` });
    return;
  }
  for (let i = 0; i < steps && s.units.includes(u); i++) {
    const from = slotOf(s, u),
      to = from + dir;
    if (to >= SLOTS || (dir > 0 && !unitAt(s, u.side, to))) {
      emit(s, { t: "wall", unit: u.id, text: `${label(u)} slams into the back wall` });
      hurt(s, u, WALL_DMG, "wall slam", { true: true });
      return;
    }
    if (to < 0) return;
    const o = unitAt(s, u.side, to);
    if (o) {
      emit(s, {
        t: "collide",
        unit: u.id,
        other: o.id,
        text: `${label(u)} crashes into ${label(o)}: they trade places`,
      });
      s.slots[u.side][to] = u.id;
      s.slots[u.side][from] = o.id;
      emit(s, { t: "move", unit: u.id, side: u.side, from, to, text: "" });
      emit(s, { t: "move", unit: o.id, side: u.side, from: to, to: from, text: "" });
      hurt(s, u, COLLIDE_DMG, "collision", { true: true });
      hurt(s, o, COLLIDE_DMG, "collision", { true: true });
      if (s.units.includes(o)) enterSlot(s, o, from);
    } else {
      s.slots[u.side][to] = u.id;
      s.slots[u.side][from] = null;
      emit(s, {
        t: "move",
        unit: u.id,
        side: u.side,
        from,
        to,
        text: `${label(u)} is ${dir > 0 ? "pushed" : "pulled"} to slot ${to + 1}`,
      });
    }
    if (s.units.includes(u)) enterSlot(s, u, to);
  }
}

function ignite(
  s: State,
  side: Side,
  slot: number,
  rounds: number,
  seen = new Set<number>(),
): void {
  if (slot < 0 || slot >= SLOTS || seen.has(slot)) return;
  seen.add(slot);
  const g = s.ground[side][slot];
  const occ = () => unitAt(s, side, slot);
  if (g.poison > 0) {
    const p = g.poison;
    g.poison = 0;
    emit(s, {
      t: "combo",
      side,
      slot,
      kind: "flash",
      text: `Flash! The poison cloud on ${slotLabel(side, slot)} burns off`,
    });
    const u = occ();
    if (u) hurt(s, u, 2 * p, "flash", { true: true });
  }
  if (g.oil) {
    g.oil = false;
    g.blaze = true;
    g.fire = Math.max(g.fire, 3);
    emit(s, {
      t: "combo",
      side,
      slot,
      kind: "blaze",
      text: `Blaze! Oil on ${slotLabel(side, slot)} goes up`,
    });
    const u = occ();
    if (u) hurt(s, u, BLAZE_BURST, "blaze", { true: true });
    for (const n of [slot - 1, slot + 1])
      if (n >= 0 && n < SLOTS && s.ground[side][n].oil) ignite(s, side, n, rounds, seen);
    return;
  }
  const was = g.fire;
  g.fire = Math.max(g.fire, rounds);
  if (g.fire !== was)
    emit(s, { t: "hazard", side, slot, kind: "fire", text: `Fire on ${slotLabel(side, slot)}` });
}

function applyGround(s: State, side: Side, slot: number, e: Effect): void {
  const g = s.ground[side][slot];
  if (e.op === "fire") ignite(s, side, slot, e.rounds);
  else if (e.op === "oil") {
    if (g.fire > 0) {
      g.oil = true;
      ignite(s, side, slot, 3);
    } else {
      g.oil = true;
      emit(s, { t: "hazard", side, slot, kind: "oil", text: `Oil on ${slotLabel(side, slot)}` });
    }
  } else if (e.op === "poison") {
    if (g.fire > 0) {
      g.poison = Math.max(g.poison, e.amount);
      ignite(s, side, slot, g.fire);
    } else {
      g.poison = Math.max(g.poison, e.amount);
      emit(s, {
        t: "hazard",
        side,
        slot,
        kind: "poison",
        text: `Poison cloud (${g.poison}) on ${slotLabel(side, slot)}`,
      });
    }
  } else if (e.op === "ward") {
    g.ward = Math.max(g.ward, e.rounds);
    emit(s, {
      t: "hazard",
      side,
      slot,
      kind: "ward",
      text: `Ward circle on ${slotLabel(side, slot)}`,
    });
  }
}

// ---------------- abilities ---------------------------------------------------------------

export function targetSide(user: Unit, ab: Ability): Side {
  return ab.target === "foe" || ab.target === "foeSlot" ? other(user.side) : user.side;
}

export function legalTargets(s: State, user: Unit, ab: Ability): number[] {
  const slot = slotOf(s, user);
  if (slot < 0 || !ab.from.includes(slot)) return [];
  const side = targetSide(user, ab);
  if (ab.target === "self") return [slot];
  const out: number[] = [];
  for (const t of ab.reach) {
    if (ab.near && Math.abs(t - slot) > 1) continue;
    const u = unitAt(s, side, t);
    if ((ab.target === "foe" || ab.target === "ally") && !u) continue;
    if (ab.target === "emptyAlly" && (u || s.slots[side].indexOf(null) !== t)) continue;
    out.push(t);
  }
  return out;
}

function resolve(s: State, user: Unit, ab: Ability, target: number): void {
  const side = targetSide(user, ab);
  const slots = [target, ...(ab.area ?? []).map((o) => target + o)].filter(
    (x, i, a) => x >= 0 && x < SLOTS && a.indexOf(x) === i,
  );
  const hit = slots.map((x) => unitAt(s, side, x));
  emit(s, {
    t: "act",
    unit: user.id,
    side,
    slot: target,
    kind: ab.id,
    text: `${label(user)} uses ${ab.name} on ${slotLabel(side, target)}`,
  });
  for (const e of ab.effects) {
    if (e.op === "damage") {
      for (const u of hit) if (u) hurt(s, u, e.amount, "");
    } else if (e.op === "push" || e.op === "pull") {
      for (const u of hit)
        if (u && s.units.includes(u)) displace(s, u, e.op === "push" ? 1 : -1, e.n);
    } else if (e.op === "fire" || e.op === "oil" || e.op === "poison" || e.op === "ward") {
      for (const x of slots) applyGround(s, side, x, e);
    } else if (e.op === "block") {
      const list = e.all ? s.units.filter((u) => u.side === user.side) : hit;
      for (const u of list)
        if (u) {
          u.block += e.amount;
          emit(s, {
            t: "block",
            unit: u.id,
            amount: e.amount,
            text: `${label(u)} gains ${e.amount} block`,
          });
        }
    } else if (e.op === "heal") {
      for (const u of hit)
        if (u) {
          const a = Math.min(e.amount, u.maxHp - u.hp);
          u.hp += a;
          emit(s, { t: "heal", unit: u.id, amount: a, hp: u.hp, text: `${label(u)} heals ${a}` });
        }
    } else if (e.op === "summon") {
      const u = makeUnit(s, e.kind, user.side);
      u.acted = true;
      s.units.push(u);
      s.slots[user.side][target] = u.id;
      emit(s, {
        t: "summon",
        unit: u.id,
        side: user.side,
        slot: target,
        kind: e.kind,
        text: `${label(u)} rises in slot ${target + 1}`,
      });
      enterSlot(s, u, target, "summoned");
    } else if (e.op === "retreat") {
      const from = slotOf(s, user);
      if (from >= 0 && from < SLOTS - 1) swap(s, user, from + 1, "skitters back");
    }
    if (s.over) return;
  }
}

function swap(s: State, u: Unit, to: number, verb = "moves"): void {
  const from = slotOf(s, u);
  const o = unitAt(s, u.side, to);
  s.slots[u.side][to] = u.id;
  s.slots[u.side][from] = o ? o.id : null;
  emit(s, {
    t: "move",
    unit: u.id,
    side: u.side,
    from,
    to,
    text: `${label(u)} ${verb} to slot ${to + 1}${o ? `, swapping with ${label(o)}` : ""}`,
  });
  if (o) emit(s, { t: "move", unit: o.id, side: u.side, from: to, to: from, text: "" });
}

// ---------------- player actions -------------------------------------------------------

export function summonCount(s: State): number {
  return allies(s).filter((u) => u.summon).length;
}

export function cardAbility(name: string): Ability {
  const c = CARDS[name];
  if (!c) throw new Error(`unknown card ${name}`);
  return c;
}

export function legalActions(s: State): Action[] {
  const out: Action[] = [];
  if (s.over || s.phase !== "player") return out;
  const h = hero(s);
  if (h) {
    const seen = new Set<string>();
    s.hand.forEach((name, i) => {
      if (seen.has(name)) return;
      seen.add(name);
      const c = cardAbility(name);
      if ((c.cost ?? 0) > s.energy) return;
      if (c.effects.some((e) => e.op === "summon") && summonCount(s) >= MAX_SUMMONS) return;
      for (const t of legalTargets(s, h, c)) out.push({ kind: "card", card: i, target: t });
    });
  }
  for (const u of allies(s)) {
    if (u.kind === "hero") continue;
    if (u.acted) continue;
    for (const ab of PLAYER_KINDS[u.kind].abilities) {
      if ((u.cooldowns[ab.id] ?? 0) > 0) continue;
      for (const t of legalTargets(s, u, ab))
        out.push({ kind: "ability", unit: u.id, ability: ab.id, target: t });
    }
  }
  for (const u of allies(s)) {
    const can = u.kind === "hero" ? s.energy >= 1 : !u.acted;
    if (!can) continue;
    const slot = slotOf(s, u);
    for (const to of [slot - 1, slot + 1])
      if (unitAt(s, "P", to)) out.push({ kind: "move", unit: u.id, to });
  }
  out.push({ kind: "end" });
  return out;
}

export function isLegal(s: State, a: Action): boolean {
  return legalActions(s).some((b) => sameAction(s, a, b));
}

function sameAction(s: State, a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "card" && b.kind === "card")
    return s.hand[a.card] === s.hand[b.card] && a.target === b.target;
  if (a.kind === "ability" && b.kind === "ability")
    return a.unit === b.unit && a.ability === b.ability && a.target === b.target;
  if (a.kind === "move" && b.kind === "move") return a.unit === b.unit && a.to === b.to;
  return true;
}

// Apply a player action in place. Returns false (and changes nothing) if it is illegal.
export function apply(s: State, a: Action): boolean {
  s.events = [];
  if (!isLegal(s, a)) return false;
  s.step++;
  if (a.kind === "end") {
    endTurn(s);
    return true;
  }
  if (a.kind === "card") {
    const h = hero(s)!;
    const name = s.hand[a.card];
    const c = cardAbility(name);
    s.energy -= c.cost ?? 0;
    s.hand.splice(a.card, 1);
    s.discard.push(name);
    resolve(s, h, c, a.target);
  } else if (a.kind === "ability") {
    const u = unitById(s, a.unit)!;
    const ab = abilityOf(u, a.ability)!;
    u.acted = true;
    if (ab.cooldown) u.cooldowns[ab.id] = ab.cooldown + 1; // ticks down at the start of each turn
    resolve(s, u, ab, a.target);
  } else if (a.kind === "move") {
    const u = unitById(s, a.unit)!;
    if (u.kind === "hero") s.energy -= 1;
    else u.acted = true;
    swap(s, u, a.to);
  }
  return true;
}

// The exact events an action would cause, without changing the state.
export function preview(s: State, a: Action): GameEvent[] {
  const c = clone(s);
  if (!apply(c, a)) return [];
  return c.events;
}

// ---------------- enemy phase ---------------------------------------------------------

export function endTurn(s: State): void {
  s.phase = "enemy";
  for (const e of enemies(s)) e.block = 0;
  const order = s.slots.E.filter((id): id is number => id != null);
  for (const id of order) {
    const e = unitById(s, id);
    if (!e || !e.intent) continue;
    s.step++;
    runIntent(s, e, e.intent);
    e.memo++;
    if (s.over) return;
  }
  s.step++;
  tickGround(s);
  if (s.over) return;
  if (s.round >= MAX_ROUNDS) {
    s.over = "lose";
    emit(s, { t: "info", text: "Out of time: the dungeon closes in" });
    return;
  }
  for (const e of enemies(s)) e.intent = chooseIntent(s, e);
  startPlayerTurn(s);
  s.step++;
}

// Where a shown intent will really land. Hazards land on their slot no matter what. A
// strike aimed at a slot that is now empty lands on the nearest unit it can reach (front
// first on ties), so stepping aside moves the blow onto someone else instead of erasing it.
export function landingSlot(s: State, e: Unit, ab: Ability, it: Intent): number | null {
  if (ab.target !== "foeSlot" || ab.area?.length) return it.target;
  if (!ab.effects.some((f) => f.op === "damage")) return it.target;
  if (unitAt(s, it.side, it.target)) return it.target;
  const options = ab.reach
    .filter((x) => unitAt(s, it.side, x))
    .sort((a, b) => Math.abs(a - it.target) - Math.abs(b - it.target) || a - b);
  return options.length ? options[0] : null;
}

function runIntent(s: State, e: Unit, it: Intent): void {
  const slot = slotOf(s, e);
  if (it.ability === "move") {
    if (it.to != null && it.to !== slot && unitAt(s, "E", it.to))
      swap(s, e, it.to, it.to < slot ? "advances" : "falls back");
    return;
  }
  const ab = abilityOf(e, it.ability);
  if (!ab) return;
  if (!ab.from.includes(slot)) {
    emit(s, { t: "fizzle", unit: e.id, text: `${label(e)} is out of position: ${ab.name} fails` });
    return;
  }
  // Foe-targeted strikes follow landingSlot. If an "ally" target moved, follow it.
  let target = landingSlot(s, e, ab, it);
  if (target == null) {
    emit(s, { t: "fizzle", unit: e.id, text: `${label(e)}'s ${ab.name} hits nothing` });
    return;
  }
  if (ab.target === "ally" || ab.target === "self") {
    const legal = legalTargets(s, e, ab);
    if (!legal.includes(target)) {
      if (!legal.length) {
        emit(s, { t: "fizzle", unit: e.id, text: `${label(e)} has no one to ${ab.name}` });
        return;
      }
      target = legal[0];
    }
  }
  resolve(s, e, ab, target);
}

function tickGround(s: State): void {
  for (const side of ["P", "E"] as Side[]) {
    for (let i = 0; i < SLOTS; i++) {
      const g = s.ground[side][i];
      const u = unitAt(s, side, i);
      if (u && g.fire > 0)
        hurt(s, u, g.blaze ? BLAZE_DMG : FIRE_DMG, "burning", { true: true, raw: true });
      if (s.over) return;
      const u2 = unitAt(s, side, i);
      if (u2 && g.poison > 0) hurt(s, u2, g.poison, "poison", { true: true, raw: true });
      if (s.over) return;
    }
    // poison drifts: a cloud of strength n seeds n-1 in thinner neighbours, then thins by 1
    const before = s.ground[side].map((g) => g.poison);
    for (let i = 0; i < SLOTS; i++) {
      if (before[i] < 2) continue;
      for (const n of [i - 1, i + 1])
        if (
          n >= 0 &&
          n < SLOTS &&
          s.ground[side][n].poison < before[i] - 1 &&
          s.ground[side][n].fire === 0
        )
          s.ground[side][n].poison = before[i] - 1;
    }
    for (const g of s.ground[side]) {
      if (g.fire > 0 && --g.fire === 0) g.blaze = false;
      if (g.poison > 0) g.poison--;
      if (g.ward > 0) g.ward--;
    }
  }
  emit(s, { t: "tick", text: "Fire and poison burn; clouds drift" });
}

// ---------------- enemy AI: pick and show the next intent -------------------------

export function expectedHit(s: State, side: Side, slot: number, ab: Ability): number {
  // rough value of an ability's effects on one target slot, for the enemy AI and the bots
  const u = unitAt(s, side, slot);
  let v = 0;
  for (const e of ab.effects) {
    if (e.op === "damage" && u)
      v += Math.max(0, e.amount - u.armour) * (u.kind === "hero" ? 1.6 : 1);
    if ((e.op === "push" || e.op === "pull") && u) v += 1.5;
    if (e.op === "fire") v += u ? (u.kind === "hero" ? 5 : 3) : 0.5;
    if (e.op === "poison") v += u ? e.amount + 2 : 1;
  }
  return v;
}

export function chooseIntent(s: State, e: Unit): Intent | null {
  const kind = ENEMY_KINDS[e.kind];
  const slot = slotOf(s, e);
  let best: Intent | null = null,
    bestV = 0;
  kind.abilities.forEach((ab, idx) => {
    const strikes = ab.effects.some((f) => f.op === "damage");
    for (const t of legalTargets(s, e, ab)) {
      const side = targetSide(e, ab);
      if (strikes && ab.target === "foeSlot" && !unitAt(s, side, t)) continue; // aim strikes at someone
      let v = 0;
      if (ab.target === "ally") {
        const a = unitAt(s, side, t)!;
        // shield whoever stands in front, more so when hurt
        v = (t === 0 ? 4 : 1.5) + (1 - a.hp / a.maxHp) * 6;
      } else {
        const slots = [t, ...(ab.area ?? []).map((o) => t + o)].filter((x) => x >= 0 && x < SLOTS);
        for (const x of slots) {
          const g = s.ground[side][x];
          const ab2 =
            g.fire && ab.effects.some((f) => f.op === "fire")
              ? { ...ab, effects: ab.effects.filter((f) => f.op !== "fire") }
              : ab;
          v += expectedHit(s, side, x, ab2);
        }
      }
      // alternate between abilities so casters and guards don't repeat forever
      if (kind.abilities.length > 1 && idx === e.memo % kind.abilities.length) v *= 1.25;
      v += nextRandom(s) * 0.3;
      if (v > bestV) {
        bestV = v;
        best = { ability: ab.id, target: t, side };
      }
    }
  });
  if (best) return best;
  // nothing to do from here: step toward a preferred slot
  const pref = kind.prefer;
  if (!pref.includes(slot)) {
    const goal = pref.reduce((a, b) => (Math.abs(b - slot) < Math.abs(a - slot) ? b : a));
    const to = slot + Math.sign(goal - slot);
    if (unitAt(s, "E", to)) return { ability: "move", target: to, side: "E", to };
  }
  return null;
}

// Slots each enemy intent will hit, with the damage it would deal there now.
export interface Threat {
  slot: number;
  side: Side;
  damage: number;
  hazard?: string;
  push?: boolean;
  from: number; // enemy id
}

export function threats(s: State): Threat[] {
  const out: Threat[] = [];
  for (const e of enemies(s)) {
    const it = e.intent;
    if (!it || it.ability === "move") continue;
    const ab = abilityOf(e, it.ability);
    if (!ab || ab.target === "ally" || ab.target === "self") continue;
    if (!ab.from.includes(slotOf(s, e))) continue; // will fizzle
    const land = landingSlot(s, e, ab, it);
    if (land == null) continue;
    const slots = [land, ...(ab.area ?? []).map((o) => land + o)].filter(
      (x) => x >= 0 && x < SLOTS,
    );
    for (const x of slots) {
      const dmg = ab.effects.reduce((a, f) => a + (f.op === "damage" ? f.amount : 0), 0);
      const hz = ab.effects.find((f) => f.op === "fire" || f.op === "poison" || f.op === "oil");
      out.push({
        slot: x,
        side: it.side,
        damage: dmg,
        hazard: hz?.op,
        push: ab.effects.some((f) => f.op === "push" || f.op === "pull"),
        from: e.id,
      });
    }
  }
  return out;
}

export function describeIntent(s: State, e: Unit): string {
  const it = e.intent;
  if (!it) return "Waits";
  if (it.ability === "move") return `Moves to slot ${(it.to ?? 0) + 1}`;
  const ab = abilityOf(e, it.ability);
  if (!ab) return "?";
  const slots = [it.target, ...(ab.area ?? []).map((o) => it.target + o)]
    .filter((x) => x >= 0 && x < SLOTS)
    .map((x) => x + 1)
    .join("+");
  const where = ab.target === "ally" ? `ally in slot ${slots}` : `slot ${slots}`;
  const out = !ab.from.includes(slotOf(s, e)) ? " (out of position!)" : "";
  return `${ab.name} → ${where}: ${ab.text}${out}`;
}
