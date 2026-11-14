// Explains a finished fight from its event log: damage by source both ways, key moments,
// HP over time, what beat you. Pure: the view only renders what this returns.
import { CHARM } from "./content.ts";
import type { Side } from "./content.ts";
import type { Ev, State, Unit } from "./sim.ts";

export interface Bar {
  src: string;
  amt: number;
}
export interface Moment {
  t: number;
  text: string;
  kind: "kill" | "fall" | "combo" | "charm" | "big" | "dark" | "end" | "turn";
}
export interface Report {
  result: State["over"];
  t: number;
  dealt: Bar[]; // your sources, damage to enemies
  taken: Bar[]; // enemy sources (and ground, the dark), damage to your side
  takenHero: Bar[];
  moments: Moment[];
  curve: { t: number; P: number; E: number }[]; // HP share left per side
  verdict: string; // one line: what decided it
  turn: number | null; // the last time the lead in HP share changed hands
}

const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const bars = (m: Map<string, number>) =>
  [...m.entries()]
    .map(([src, amt]) => ({ src, amt }))
    .filter((b) => b.amt > 0)
    .sort((a, b) => b.amt - a.amt);

const fmt = (t: number) => `${t.toFixed(1)} s`;

export function report(s: State, start: Record<number, number>): Report {
  const log = s.log ?? [];
  const byId = new Map<number, Unit>(s.units.map((u) => [u.id, u]));
  const hp = new Map<number, number>();
  for (const u of s.units) if (start[u.id] !== undefined) hp.set(u.id, start[u.id]);
  const max: Record<Side, number> = { P: 0, E: 0 };
  for (const u of s.units) if (start[u.id] !== undefined) max[u.side] += u.maxHp;
  const dealt = new Map<string, number>();
  const taken = new Map<string, number>();
  const takenHero = new Map<string, number>();
  const moments: Moment[] = [];
  const curve: Report["curve"] = [];
  const side = (id: number) => byId.get(id)?.side ?? "E";
  const name = (id: number) => byId.get(id)?.name ?? "?";
  const sum = (sd: Side) => {
    let a = 0;
    for (const [id, v] of hp) if (side(id) === sd) a += Math.max(0, v);
    return a;
  };
  let bigP: Ev | null = null;
  let bigE: Ev | null = null;
  let nextSample = 0;
  const sample = (t: number) => {
    while (nextSample <= t + 1e-9) {
      curve.push({ t: nextSample, P: sum("P") / (max.P || 1), E: sum("E") / (max.E || 1) });
      nextSample += 0.5;
    }
  };
  for (const ev of log) {
    sample(ev.t - 0.05);
    if (ev.e === "dmg") {
      hp.set(ev.u, (hp.get(ev.u) ?? 0) - ev.amt);
      const tgtSide = side(ev.u);
      if (tgtSide === "E") {
        add(dealt, ev.src, ev.amt);
        if (!bigP || ev.amt > (bigP as { amt: number }).amt) bigP = ev;
      } else {
        add(taken, ev.src, ev.amt);
        if (byId.get(ev.u)?.key === "hero") add(takenHero, ev.src, ev.amt);
        if (!bigE || ev.amt > (bigE as { amt: number }).amt) bigE = ev;
      }
    } else if (ev.e === "heal") {
      hp.set(ev.u, (hp.get(ev.u) ?? 0) + ev.amt);
    } else if (ev.e === "spawn") {
      const u = byId.get(ev.u);
      if (u && start[u.id] === undefined) {
        hp.set(u.id, u.maxHp);
        max[u.side] += u.maxHp;
      }
    } else if (ev.e === "die") {
      const p = side(ev.u) === "P";
      moments.push({
        t: ev.t,
        kind: p ? "fall" : "kill",
        text: `${name(ev.u)} fell (${ev.src})`,
      });
    } else if (ev.e === "combo") {
      const where = `${ev.side === "E" ? "enemy" : "your"} slot ${ev.slot + 1}`;
      const what = {
        blaze: "Blaze: fire on oil",
        flash: "Flash: fire on poison",
        melt: "Ice and fire cancel",
      }[ev.what];
      moments.push({ t: ev.t, kind: "combo", text: `${what} on ${where}` });
    } else if (ev.e === "charm") {
      const c = CHARM[ev.id];
      const who = ev.u ? ` (${name(ev.u)})` : "";
      moments.push({ t: ev.t, kind: "charm", text: `${c.name} fired${who}` });
    } else if (ev.e === "dark") {
      moments.push({
        t: ev.t,
        kind: "dark",
        text: "The dark closes in: everyone takes damage each second",
      });
    }
  }
  sample(s.t);
  if (bigP) {
    const b = bigP as Extract<Ev, { e: "dmg" }>;
    moments.push({
      t: b.t,
      kind: "big",
      text: `Your biggest hit: ${b.amt} on ${name(b.u)} (${b.src})`,
    });
  }
  if (bigE) {
    const b = bigE as Extract<Ev, { e: "dmg" }>;
    moments.push({
      t: b.t,
      kind: "big",
      text: `Their biggest hit: ${b.amt} on ${name(b.u)} (${b.src})`,
    });
  }
  // the turning point: the last time the side ahead (by HP share) changed
  let turn: number | null = null;
  for (let i = 1; i < curve.length; i++) {
    const a = Math.sign(curve[i - 1].P - curve[i - 1].E);
    const b = Math.sign(curve[i].P - curve[i].E);
    if (a !== b && b !== 0) turn = curve[i].t;
  }
  if (turn !== null)
    moments.push({
      t: turn,
      kind: "turn",
      text: `Turning point: ${s.over === "loss" ? "they pulled ahead" : "you pulled ahead"} for good`,
    });
  moments.sort((a, b) => a.t - b.t);

  const dealtB = bars(dealt);
  const takenB = bars(taken);
  const heroB = bars(takenHero);
  let verdict: string;
  if (s.over === "loss") {
    const h = s.units.find((u) => u.key === "hero" && u.side === "P");
    const killer = [...log].reverse().find((e) => e.e === "die" && e.u === h?.id) as
      | Extract<Ev, { e: "die" }>
      | undefined;
    const top = heroB[0];
    verdict = `The hero fell at ${fmt(s.t)}${killer ? ` to ${killer.src}` : ""}.${
      top ? ` Most of the hero's damage came from ${top.src} (${top.amt}).` : ""
    }`;
  } else if (s.over === "phase") {
    verdict = `Phase cleared at ${fmt(s.t)}. Best source: ${dealtB[0]?.src ?? "-"} (${dealtB[0]?.amt ?? 0}).`;
  } else {
    verdict = `Won at ${fmt(s.t)}. Best source: ${dealtB[0]?.src ?? "-"} (${dealtB[0]?.amt ?? 0}); biggest threat: ${
      takenB[0]?.src ?? "-"
    } (${takenB[0]?.amt ?? 0}).`;
  }
  return {
    result: s.over,
    t: s.t,
    dealt: dealtB,
    taken: takenB,
    takenHero: heroB,
    moments,
    curve,
    verdict,
    turn,
  };
}

// HP of every unit at the start of a fight (or phase), for report().
export function startHp(s: State): Record<number, number> {
  const out: Record<number, number> = {};
  for (const u of s.units) if (u.alive) out[u.id] = u.hp;
  return out;
}
