// The fight simulator for e18. Pure TypeScript, no three.js or DOM, no randomness:
// the same setup and encounter always give the same fight.
//
// Time runs in steps of 0.1 s. Each step, every unit (sides alternate who goes first)
// recharges its abilities and uses at most one ready ability that has a target. Every
// 1 s, fire and poison hurt whoever stands in them. From 30 s "the dark" hurts everyone,
// more every 5 s, so no fight runs long. The fight is won when every enemy falls and
// lost when the hero falls.
//
// Rows have no gaps: slot = index in the row. When a unit falls, everyone behind steps
// up. A unit that can't use any of its abilities from its slot for 1.5 s steps one slot
// towards a slot where it can.

import {
  BOSS_PHASES,
  CHARM,
  ENEMIES,
  HERO,
  KING,
  PET,
  SKILL,
  type AbilityDef,
  type Aim,
  type Focus,
  type GroundKind,
  type Side,
  type UnitDef,
} from "./content.ts";

export const DT = 0.1;
export const STEPS_PER_S = 10;
export const DARK_AT = 30;
export const MAX_T = 60;
export const FIRE_DPS = 2;
export const BLAZE_DPS = 3;
export const BLAZE_BURST = 3;
export const FLASH_BURST = 4;
export const POISON_DPS = 2;
export const ENTER_FIRE = 2;
export const CRASH = 1;
export const WALL = 3;
export const WARD = 2;
export const STUCK_S = 1.5;
export const BREATHER = 0.25; // share of max HP the hero and pet get back between boss phases
export const SALTS_AT = 0.4;
export const SALTS_HEAL = 19;
export const LAST_SHIELD = 13;

// Switches for feature-off tests. Everything on by default.
export interface RuleOpts {
  ground: boolean; // fire, oil, ice, poison, ward
  move: boolean; // push and pull
  focus: boolean; // off: every "focus" aim is "front"
  charm: boolean; // off: charms never fire
  dark: boolean;
}
export const DEFAULT_OPTS: RuleOpts = {
  ground: true,
  move: true,
  focus: true,
  charm: true,
  dark: true,
};

export interface Setup {
  skills: string[]; // 3 skill ids
  order: string[]; // "hero", "pet" and the summon skill ids, front to back
  focus: Focus;
  charm: string;
}

// Run upgrades (between-fight growth).
export interface Mods {
  heroHp?: number;
  petHp?: number;
  dmg?: Record<string, number>; // + damage per ability id
  cd?: Record<string, number>; // cooldown multiplier per ability id
}

export interface Encounter {
  id: string;
  name: string;
  enemies: string[]; // kinds, front to back
  hpMul?: number;
  dmgMul?: number;
  ground?: { side: Side; slot: number; kind: GroundKind; dur: number }[];
  boss?: boolean;
  text?: string;
}

export interface Ground {
  fire: number; // seconds left
  blaze: boolean;
  fireBy: string;
  oil: number;
  ice: number;
  poison: number;
  poisonBy: string;
  ward: number;
}
const noGround = (): Ground => ({
  fire: 0,
  blaze: false,
  fireBy: "",
  oil: 0,
  ice: 0,
  poison: 0,
  poisonBy: "",
  ward: 0,
});

export interface AbilityState {
  def: AbilityDef;
  cd: number;
  cdMul: number;
  bonus: number;
}

export interface Unit {
  id: number;
  kind: string;
  name: string;
  side: Side;
  hp: number;
  maxHp: number;
  armour: number;
  heavy: boolean;
  shield: number;
  immune: GroundKind[];
  rage: number;
  abs: AbilityState[];
  idle: number;
  alive: boolean;
  key: string; // setup key for your side ("hero", "pet", "servant", "totem"), kind for enemies
}

export type DmgKind = "hit" | "fire" | "poison" | "dark" | "crash" | "wall" | "blaze" | "flash";
export type Ev =
  | { t: number; e: "use"; u: number; ab: string; name: string; tgt: number[]; slots?: number[] }
  | {
      t: number;
      e: "dmg";
      u: number;
      amt: number;
      blocked: number;
      src: string;
      by: number;
      kind: DmgKind;
    }
  | { t: number; e: "heal"; u: number; amt: number; src: string; by: number }
  | { t: number; e: "shield"; u: number; amt: number; src: string; by: number }
  | { t: number; e: "move"; u: number; slot: number; why: "push" | "pull" | "step" | "up" }
  | { t: number; e: "resist"; u: number }
  | { t: number; e: "rage"; u: number; amt: number }
  | { t: number; e: "die"; u: number; src: string }
  | { t: number; e: "combo"; side: Side; slot: number; what: "blaze" | "flash" | "melt" }
  | { t: number; e: "charm"; id: string; u: number }
  | { t: number; e: "dark" }
  | { t: number; e: "spawn"; u: number; slot: number }
  | { t: number; e: "end"; result: Result };

export type Result = "win" | "loss" | "phase";

export interface State {
  step: number;
  t: number;
  units: Unit[];
  rows: Record<Side, Unit[]>;
  ground: Record<Side, Ground[]>;
  focus: Focus;
  charm: string;
  charmUsed: boolean;
  log: Ev[] | null;
  over: Result | null;
  opts: RuleOpts;
  dmgMul: number;
  phase: number; // boss phase index, -1 for normal fights
  boss: Unit | null;
  nextId: number;
  darkOn: boolean;
}

// ---------------- building a fight --------------------------------------------------

const P_IDS: Record<string, number> = { hero: 1, pet: 2, servant: 3, totem: 4 };

function makeUnit(s: State, def: UnitDef, side: Side, key: string, hpMul = 1, bonusHp = 0): Unit {
  const hp = Math.round(def.hp * hpMul) + bonusHp;
  return {
    // your units have fixed ids by role, enemies count from 100: the view keeps the same
    // models while you change your setup
    id: side === "P" ? (P_IDS[key] ?? 9) : s.nextId++,
    kind: def.kind,
    name: def.name,
    side,
    hp,
    maxHp: hp,
    armour: def.armour ?? 0,
    heavy: !!def.heavy,
    shield: 0,
    immune: [],
    rage: def.rage ?? 0,
    abs: def.abilities.map((a) => ({ def: a, cd: a.cd * 0.5, cdMul: 1, bonus: 0 })),
    idle: 0,
    alive: true,
    key,
  };
}

function setAbilities(u: Unit, abilities: AbilityDef[], mods: Mods | undefined, ready: boolean) {
  // longer cooldowns get first pick when several are ready
  const sorted = [...abilities].sort((a, b) => b.cd - a.cd);
  u.abs = sorted.map((a) => {
    const cdMul = mods?.cd?.[a.id] ?? 1;
    return { def: a, cd: ready ? 0 : a.cd * cdMul * 0.5, cdMul, bonus: mods?.dmg?.[a.id] ?? 0 };
  });
}

function emptyState(setup: Setup, opts: RuleOpts, log: boolean): State {
  return {
    step: 0,
    t: 0,
    units: [],
    rows: { P: [], E: [] },
    ground: { P: [0, 1, 2, 3].map(noGround), E: [0, 1, 2, 3].map(noGround) },
    focus: setup.focus,
    charm: setup.charm,
    charmUsed: false,
    log: log ? [] : null,
    over: null,
    opts,
    dmgMul: 1,
    phase: -1,
    boss: null,
    nextId: 100,
    darkOn: false,
  };
}

// Your row from a setup. Carry: HP left from the previous boss phase (by setup key).
function buildPlayer(
  s: State,
  setup: Setup,
  mods: Mods | undefined,
  carry?: Record<string, number>,
) {
  const quick = s.opts.charm && setup.charm === "quicken";
  for (const key of setup.order) {
    let u: Unit;
    if (key === "hero") {
      u = makeUnit(s, HERO, "P", "hero", 1, mods?.heroHp ?? 0);
      const abs = setup.skills.map((id) => SKILL[id].ability).filter((a): a is AbilityDef => !!a);
      setAbilities(u, abs, mods, quick);
    } else if (key === "pet") {
      u = makeUnit(s, PET, "P", "pet", 1, mods?.petHp ?? 0);
      setAbilities(u, PET.abilities, mods, false);
    } else {
      const def = SKILL[key].summon!;
      u = makeUnit(s, def, "P", key);
      setAbilities(u, def.abilities, mods, false);
    }
    if (carry && carry[key] !== undefined) {
      if (carry[key] <= 0) continue; // fell in an earlier phase
      u.hp = Math.min(u.maxHp, carry[key] + Math.round(BREATHER * u.maxHp));
    }
    s.units.push(u);
    s.rows.P.push(u);
  }
}

export function startFight(
  enc: Encounter,
  setup: Setup,
  opts: RuleOpts = DEFAULT_OPTS,
  mods?: Mods,
  log = false,
): State {
  const s = emptyState(setup, opts, log);
  s.dmgMul = enc.dmgMul ?? 1;
  buildPlayer(s, setup, mods);
  if (enc.boss) {
    s.phase = 0;
    const king = makeUnit(s, KING, "E", "king");
    s.boss = king;
    s.units.push(king);
    s.rows.E.push(king);
    applyPhase(s, 0);
  } else {
    for (const kind of enc.enemies) {
      const u = makeUnit(s, ENEMIES[kind], "E", kind, enc.hpMul ?? 1);
      s.units.push(u);
      s.rows.E.push(u);
    }
  }
  if (opts.ground)
    for (const g of enc.ground ?? []) {
      const gr = s.ground[g.side][g.slot];
      if (g.kind === "oil") gr.oil = g.dur;
      if (g.kind === "poison") {
        gr.poison = g.dur;
        gr.poisonBy = "Old bile on the floor";
      }
      if (g.kind === "fire") {
        gr.fire = g.dur;
        gr.fireBy = "Old embers";
      }
      if (g.kind === "ice") gr.ice = g.dur;
    }
  return s;
}

// Boss: set the King's kit for a phase, move him, raise adds.
function applyPhase(s: State, n: number) {
  const ph = BOSS_PHASES[n];
  const king = s.boss!;
  king.armour = ph.armour;
  king.immune = ph.immune ?? [];
  setAbilities(king, ph.abilities, undefined, false);
  for (const a of king.abs) a.cd = a.def.cd * 0.6;
  if (ph.clearAdds)
    for (const u of s.rows.E.slice()) if (u !== king) removeFromRow(s, u, "The King's will");
  const row = s.rows.E;
  row.splice(row.indexOf(king), 1);
  for (const kind of ph.adds) {
    if (row.length >= 3) break;
    const u = makeUnit(s, ENEMIES[kind], "E", kind, ph.addHp ?? 1);
    s.units.push(u);
    if (ph.slot === "back") row.unshift(u);
    else row.push(u);
    emit(s, { t: s.t, e: "spawn", u: u.id, slot: 0 });
  }
  if (ph.slot === "front") row.unshift(king);
  else row.push(king);
  row.forEach((u, i) => emit(s, { t: s.t, e: "move", u: u.id, slot: i, why: "step" }));
}

// Next boss phase: a fresh fight state that keeps HP (yours and the King's) and the
// surviving adds, with your new setup.
export function nextPhase(prev: State, setup: Setup, mods?: Mods): State {
  const s = emptyState(setup, prev.opts, !!prev.log);
  s.dmgMul = prev.dmgMul;
  s.nextId = prev.nextId;
  s.phase = prev.phase + 1;
  s.t = 0;
  const carry: Record<string, number> = {};
  for (const u of prev.units) if (u.side === "P") carry[u.key] = u.alive ? u.hp : 0;
  // summons are raised fresh by the new setup; hero and pet keep their HP
  for (const k of Object.keys(carry)) if (k !== "hero" && k !== "pet") delete carry[k];
  buildPlayer(s, setup, mods, carry);
  // copies: the same phase start is tried with many setups
  for (const old of prev.rows.E) {
    const u: Unit = { ...old, abs: old.abs.map((a) => ({ ...a })), idle: 0, shield: 0 };
    s.units.push(u);
    s.rows.E.push(u);
    if (old === prev.boss) s.boss = u;
  }
  applyPhase(s, s.phase);
  return s;
}

// ---------------- the step ------------------------------------------------------------

function emit(s: State, ev: Ev) {
  if (s.log) s.log.push(ev);
}

const slotOf = (s: State, u: Unit) => s.rows[u.side].indexOf(u);
const other = (side: Side): Side => (side === "P" ? "E" : "P");
const label = (u: Unit, ab: string) => `${u.name}: ${ab}`;

export function step(s: State): void {
  if (s.over) return;
  s.step++;
  s.t = s.step / STEPS_PER_S;
  timedCharms(s);
  const sides: Side[] = s.step % 2 ? ["P", "E"] : ["E", "P"];
  for (const side of sides)
    for (const u of s.rows[side].slice()) {
      if (s.over) return;
      if (u.alive) act(s, u);
    }
  decayGround(s);
  if (s.step % STEPS_PER_S === 0) {
    groundTick(s);
    if (s.over) return;
    if (s.opts.dark && s.t >= DARK_AT) {
      if (!s.darkOn) {
        s.darkOn = true;
        emit(s, { t: s.t, e: "dark" });
      }
      const amt = 1 + Math.floor((s.t - DARK_AT) / 5);
      for (const side of ["P", "E"] as Side[])
        for (const u of s.rows[side].slice()) {
          if (s.over) return;
          if (u.alive) damage(s, u, amt, "The dark", 0, "dark", { pierce: true });
        }
    }
  }
  if (!s.over && s.t >= MAX_T) end(s, "loss");
}

export function runToEnd(s: State): State {
  while (!s.over) step(s);
  return s;
}

function end(s: State, r: Result) {
  // the hero falling in the same blow that ends a boss phase still loses
  if (s.over && !(s.over === "phase" && r === "loss")) return;
  s.over = r;
  emit(s, { t: s.t, e: "end", result: r });
}

function rate(s: State, u: Unit): number {
  let r = s.opts.ground && s.ground[u.side][slotOf(s, u)].ice > 0 ? 0.5 : 1;
  return r;
}

function act(s: State, u: Unit) {
  const slot = slotOf(s, u);
  const r = rate(s, u);
  for (const a of u.abs) if (a.cd > 0) a.cd -= DT * r;
  const usableHere = u.abs.some((a) => a.def.from.includes(slot));
  if (!usableHere) {
    u.idle += DT;
    if (u.idle >= STUCK_S - 1e-9) {
      u.idle = 0;
      stepToward(s, u, slot);
    }
    return;
  }
  u.idle = 0;
  for (const a of u.abs) {
    if (a.cd > 1e-9 || !a.def.from.includes(slot)) continue;
    const tg = targets(s, u, a.def);
    if (!tg) continue;
    use(s, u, a, tg);
    a.cd = a.def.cd * a.cdMul;
    return;
  }
}

function stepToward(s: State, u: Unit, slot: number) {
  const row = s.rows[u.side];
  const want = new Set(u.abs.flatMap((a) => a.def.from));
  let best = -1;
  for (let j = 0; j < 4; j++)
    if (want.has(j) && (best < 0 || Math.abs(j - slot) < Math.abs(best - slot))) best = j;
  if (best < 0) return;
  const j = best < slot ? slot - 1 : slot + 1;
  if (j < 0 || j >= row.length) return;
  swap(s, u.side, slot, j, "step");
}

function swap(s: State, side: Side, i: number, j: number, why: "push" | "pull" | "step") {
  const row = s.rows[side];
  [row[i], row[j]] = [row[j], row[i]];
  emit(s, { t: s.t, e: "move", u: row[i].id, slot: i, why });
  emit(s, { t: s.t, e: "move", u: row[j].id, slot: j, why });
}

interface Targets {
  units: Unit[];
  side: Side;
  slots: number[];
}

// Damage per second a unit can deal (area abilities count once per slot they hit).
export function threat(u: Unit): number {
  let t = 0;
  for (const a of u.abs) {
    const d = a.def;
    const per =
      (d.dmg ? d.dmg + a.bonus : 0) + (d.ground === "fire" || d.ground === "poison" ? 4 : 0);
    const n = d.target === "area" ? (d.groundOn as number[]).length : d.all ? 3 : 1;
    t += (per * n) / (d.cd * a.cdMul);
  }
  return t;
}

function pick(cands: Unit[], aim: Aim, rows: Unit[]): Unit {
  let best = cands[0];
  for (const c of cands.slice(1)) {
    const bs = rows.indexOf(best);
    const cs = rows.indexOf(c);
    if (aim === "front" && cs < bs) best = c;
    else if (aim === "back" && cs > bs) best = c;
    else if (aim === "weakest" && c.hp + c.shield < best.hp + best.shield) best = c;
    else if (aim === "threat" && threat(c) > threat(best)) best = c;
    else if (aim === "lowpct" && c.hp / c.maxHp < best.hp / best.maxHp) best = c;
  }
  return best;
}

function targets(s: State, u: Unit, a: AbilityDef): Targets | null {
  if (a.target === "raise") {
    const row = s.rows[u.side];
    if (row.length >= (a.raiseMax ?? 4)) return null;
    return { units: [], side: u.side, slots: [0] };
  }
  if (a.target === "area") {
    const side = other(u.side);
    if (!s.rows[side].length) return null;
    const slots = a.groundOn as number[];
    // an area ability needs a reason: someone to hit, or ground to lay
    const units = slots.map((i) => s.rows[side][i]).filter((x): x is Unit => !!x);
    if (!units.length && !a.ground) return null;
    if (!s.opts.ground && !a.dmg) return null;
    return { units, side, slots };
  }
  if (a.target === "ally") {
    const row = s.rows[u.side];
    let cands = row;
    if (a.heal) cands = row.filter((x) => x.hp < x.maxHp);
    if (a.shield) cands = row.filter((x) => x.shield === 0);
    if (!cands.length) return null;
    const t = pick(cands, a.aim ?? "weakest", row);
    return { units: [t], side: u.side, slots: [row.indexOf(t)] };
  }
  const side = other(u.side);
  const row = s.rows[side];
  const reach = a.reach;
  const cands = reach ? row.filter((_, i) => reach.includes(i)) : row;
  if (!cands.length) return null;
  if (a.all) return { units: cands, side, slots: cands.map((c) => row.indexOf(c)) };
  let aim = a.aim ?? "front";
  if (aim === "focus") aim = s.opts.focus ? s.focus : "front";
  const t = pick(cands, aim, row);
  return { units: [t], side, slots: [row.indexOf(t)] };
}

function use(s: State, u: Unit, a: AbilityState, tg: Targets) {
  const d = a.def;
  const src = label(u, d.name);
  emit(s, {
    t: s.t,
    e: "use",
    u: u.id,
    ab: d.id,
    name: d.name,
    tgt: tg.units.map((x) => x.id),
    slots: tg.slots,
  });
  if (d.raise) {
    const n = makeUnit(s, ENEMIES[d.raise], u.side, d.raise, d.raiseHp ?? 1);
    s.units.push(n);
    s.rows[u.side].unshift(n);
    emit(s, { t: s.t, e: "spawn", u: n.id, slot: 0 });
    s.rows[u.side].forEach((x, i) => emit(s, { t: s.t, e: "move", u: x.id, slot: i, why: "up" }));
  }
  if (d.heal) for (const t of tg.units) heal(s, t, d.heal, src, u.id);
  if (d.shield)
    for (const t of tg.units) {
      const sh = d.shield;
      t.shield += sh;
      emit(s, { t: s.t, e: "shield", u: t.id, amt: sh, src, by: u.id });
    }
  if (d.dmg) {
    const base = d.dmg + a.bonus;
    const amt = u.side === "E" ? Math.round(base * s.dmgMul) : base;
    for (const t of tg.units)
      if (t.alive) damage(s, t, amt, src, u.id, "hit", { pierce: d.pierce, ward: !d.pierce });
  }
  if (d.ground && s.opts.ground) {
    const gside = d.groundSide === "own" ? u.side : tg.side;
    const slots = d.groundOn === "target" ? tg.slots : (d.groundOn as number[]);
    for (const i of slots) addGround(s, gside, i, d.ground, d.groundDur ?? 4, src);
  }
  if (s.opts.move && tg.units.length === 1) {
    const t = tg.units[0];
    if (t.alive && d.push) push(s, t, src, u.id);
    if (t.alive && d.pull) pull(s, t);
  }
}

function heal(s: State, t: Unit, amt: number, src: string, by: number) {
  const h = Math.min(amt, t.maxHp - t.hp);
  if (h <= 0) return;
  t.hp += h;
  emit(s, { t: s.t, e: "heal", u: t.id, amt: h, src, by });
}

export function damage(
  s: State,
  t: Unit,
  raw: number,
  src: string,
  by: number,
  kind: DmgKind,
  o: { pierce?: boolean; ward?: boolean; noShield?: boolean } = {},
) {
  if (!t.alive) return;
  let amt = kind === "poison" && t.immune.includes("poison") ? 0 : raw;
  let blocked = 0;
  if (kind === "hit") {
    if (!o.pierce && t.armour) {
      blocked += Math.min(amt, t.armour);
      amt -= t.armour;
    }
    if (o.ward && s.opts.ground && s.ground[t.side][slotOf(s, t)].ward > 0) {
      blocked += Math.min(Math.max(0, amt), WARD);
      amt -= WARD;
    }
  }
  amt = Math.max(0, amt);
  if (!o.noShield && t.shield > 0) {
    const a = Math.min(t.shield, amt);
    t.shield -= a;
    blocked += a;
    amt -= a;
  }
  t.hp -= amt;
  emit(s, { t: s.t, e: "dmg", u: t.id, amt, blocked, src, by, kind });
  if (t.hp <= 0) kill(s, t, src);
  else if (
    t.side === "P" &&
    s.opts.charm &&
    s.charm === "salts" &&
    !s.charmUsed &&
    t.hp < SALTS_AT * t.maxHp
  ) {
    s.charmUsed = true;
    emit(s, { t: s.t, e: "charm", id: "salts", u: t.id });
    heal(s, t, SALTS_HEAL, CHARM.salts.name, 0);
  }
  if (s.boss && t === s.boss && !s.over) {
    const until = BOSS_PHASES[s.phase].until;
    if (t.alive && until > 0 && t.hp <= until * t.maxHp) end(s, "phase");
  }
}

function kill(s: State, t: Unit, src: string) {
  if (t.side === "P" && s.opts.charm && s.charm === "lastbreath" && !s.charmUsed) {
    s.charmUsed = true;
    t.hp = 1;
    t.shield += LAST_SHIELD;
    emit(s, { t: s.t, e: "charm", id: "lastbreath", u: t.id });
    return;
  }
  removeFromRow(s, t, src);
  for (const u of s.rows[t.side])
    if (u.rage) {
      for (const a of u.abs) if (a.def.dmg) a.bonus += u.rage;
      emit(s, { t: s.t, e: "rage", u: u.id, amt: u.rage });
    }
  if (t.key === "hero" && t.side === "P") end(s, "loss");
  else if (s.rows.E.length === 0) end(s, "win");
}

function removeFromRow(s: State, t: Unit, src: string) {
  t.alive = false;
  t.hp = Math.min(t.hp, 0);
  const row = s.rows[t.side];
  const i = row.indexOf(t);
  if (i < 0) return;
  row.splice(i, 1);
  emit(s, { t: s.t, e: "die", u: t.id, src });
  for (let j = i; j < row.length; j++)
    emit(s, { t: s.t, e: "move", u: row[j].id, slot: j, why: "up" });
}

// Forced moves: being pushed or pulled into fire or poison hurts at once.
function enter(s: State, u: Unit) {
  if (!s.opts.ground || !u.alive) return;
  const g = s.ground[u.side][slotOf(s, u)];
  if (g.fire > 0) damage(s, u, ENTER_FIRE, g.fireBy, 0, "fire");
  if (u.alive && g.poison > 0) damage(s, u, 1, g.poisonBy, 0, "poison", { noShield: true });
}

function push(s: State, t: Unit, src: string, by: number, slide = true) {
  if (t.heavy) {
    emit(s, { t: s.t, e: "resist", u: t.id });
    return;
  }
  const row = s.rows[t.side];
  const i = row.indexOf(t);
  if (i === row.length - 1) {
    damage(s, t, WALL, `${src} (wall)`, by, "wall");
    return;
  }
  const behind = row[i + 1];
  swap(s, t.side, i, i + 1, "push");
  damage(s, t, CRASH, `${src} (crash)`, by, "crash");
  damage(s, behind, CRASH, `${src} (crash)`, by, "crash");
  if (!t.alive) return;
  enter(s, t);
  if (behind.alive) enter(s, behind);
  if (t.alive && slide && s.opts.ground && s.ground[t.side][slotOf(s, t)].oil > 0)
    push(s, t, src, by, false); // slides on oil, once
}

function pull(s: State, t: Unit) {
  if (t.heavy) {
    emit(s, { t: s.t, e: "resist", u: t.id });
    return;
  }
  const row = s.rows[t.side];
  const i = row.indexOf(t);
  if (i <= 0) return;
  const front = row[i - 1];
  swap(s, t.side, i, i - 1, "pull");
  t.idle = 0;
  enter(s, t);
  if (front.alive) enter(s, front);
}

// ---------------- ground ----------------------------------------------------------------

export function addGround(
  s: State,
  side: Side,
  slot: number,
  kind: GroundKind,
  dur: number,
  by: string,
) {
  const g = s.ground[side][slot];
  const occ = s.rows[side][slot];
  if (kind === "fire") {
    if (g.ice > 0) {
      g.ice = 0;
      emit(s, { t: s.t, e: "combo", side, slot, what: "melt" });
      return;
    }
    if (g.oil > 0) {
      g.oil = 0;
      g.fire = Math.max(g.fire, 4);
      g.blaze = true;
      g.fireBy = `${by} (blaze)`;
      emit(s, { t: s.t, e: "combo", side, slot, what: "blaze" });
      if (occ) damage(s, occ, BLAZE_BURST, g.fireBy, 0, "blaze");
      for (const j of [slot - 1, slot + 1])
        if (j >= 0 && j < 4 && s.ground[side][j].oil > 0) addGround(s, side, j, "fire", dur, by);
      return;
    }
    if (g.poison > 0) {
      g.poison = 0;
      emit(s, { t: s.t, e: "combo", side, slot, what: "flash" });
      if (occ) damage(s, occ, FLASH_BURST, `${by} (flash)`, 0, "flash");
    }
    if (g.fire <= 0) g.fireBy = by;
    g.fire = Math.max(g.fire, dur);
    return;
  }
  if (kind === "oil") {
    if (g.fire > 0) {
      g.oil = 1;
      addGround(s, side, slot, "fire", g.fire, g.fireBy);
      return;
    }
    g.oil = Math.max(g.oil, dur);
    return;
  }
  if (kind === "ice") {
    if (g.fire > 0) {
      g.fire = 0;
      g.blaze = false;
      emit(s, { t: s.t, e: "combo", side, slot, what: "melt" });
      return;
    }
    g.ice = Math.max(g.ice, dur);
    return;
  }
  if (kind === "poison") {
    if (g.fire > 0) {
      emit(s, { t: s.t, e: "combo", side, slot, what: "flash" });
      if (occ) damage(s, occ, FLASH_BURST, `${by} (flash)`, 0, "flash");
      return;
    }
    if (g.poison <= 0) g.poisonBy = by;
    g.poison = Math.max(g.poison, dur);
    return;
  }
  g.ward = Math.max(g.ward, dur);
}

function decayGround(s: State) {
  for (const side of ["P", "E"] as Side[])
    for (const g of s.ground[side]) {
      if (g.fire > 0 && (g.fire -= DT) <= 1e-9) {
        g.fire = 0;
        g.blaze = false;
      }
      if (g.oil > 0) g.oil = Math.max(0, g.oil - DT);
      if (g.ice > 0) g.ice = Math.max(0, g.ice - DT);
      if (g.poison > 0) g.poison = Math.max(0, g.poison - DT);
      if (g.ward > 0) g.ward = Math.max(0, g.ward - DT);
    }
}

function groundTick(s: State) {
  if (!s.opts.ground) return;
  for (const side of ["P", "E"] as Side[])
    for (let i = 0; i < 4; i++) {
      const g = s.ground[side][i];
      const u = s.rows[side][i];
      if (!u) continue;
      if (g.fire > 0) damage(s, u, g.blaze ? BLAZE_DPS : FIRE_DPS, g.fireBy, 0, "fire");
      if (s.over) return;
      if (u.alive && g.poison > 0)
        damage(s, u, POISON_DPS, g.poisonBy, 0, "poison", { noShield: true });
      if (s.over) return;
    }
}

function timedCharms(s: State) {
  if (!s.opts.charm || s.charmUsed) return;
  if (s.charm === "spark" && s.step === STEPS_PER_S) {
    s.charmUsed = true;
    emit(s, { t: s.t, e: "charm", id: "spark", u: 0 });
    for (const i of [0, 1]) addGround(s, "E", i, "fire", 4, CHARM.spark.name);
  }
  if (s.charm === "wardstone" && s.step === 5) {
    s.charmUsed = true;
    emit(s, { t: s.t, e: "charm", id: "wardstone", u: 0 });
    if (s.opts.ground)
      for (const i of [0, 1]) addGround(s, "P", i, "ward", 10, CHARM.wardstone.name);
  }
  if (s.charm === "quicken" && s.step === 1) {
    s.charmUsed = true;
    emit(s, { t: s.t, e: "charm", id: "quicken", u: 0 });
  }
}

// ---------------- summaries ----------------------------------------------------------------

export const hero = (s: State) => s.units.find((u) => u.key === "hero" && u.side === "P")!;
export const sideHp = (s: State, side: Side) =>
  s.units.filter((u) => u.side === side && u.alive).reduce((a, u) => a + u.hp, 0);
export const sideMax = (s: State, side: Side) =>
  s.units.filter((u) => u.side === side).reduce((a, u) => a + u.maxHp, 0);
