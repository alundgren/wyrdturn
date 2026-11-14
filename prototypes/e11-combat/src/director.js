// Deterministic director: the first, safe version of an "AI game master".
// Flow (research/generation-and-self-check.md, section 5):
//   engine state -> observation -> proposer (deterministic here; an LLM later) ->
//   validator -> apply, or fall back to the level's authored encounter.
// The proposer only returns a data command with catalog IDs and bounded numbers.

import { ENEMIES, rng, floorAt } from './combat.js';
import { ENEMY_COST } from './levelgen.js';

export const DIRECTOR_DEFAULTS = { target: 0.55, maxShift: 2, maxEnemies: 3 };

// What the director is allowed to see: compact, no hidden map secrets.
export function observe(run, history) {
  const last = history.at(-1);
  return {
    hpRatio: run.hero.hp / run.hero.maxHp,
    roomsCleared: run.cleared.length,
    roomsTotal: run.rooms.length,
    lastRoom: last ? { damageTaken: last.damageTaken, turns: last.turns } : null,
    skills: [...run.hero.skills],
    relic: run.hero.relic,
  };
}

// Pressure: 0 = cruising, 1 = about to die. Smoothed over rooms.
export function pressure(obs, prev = 0.5) {
  const hp = 1 - obs.hpRatio;
  const dmg = obs.lastRoom ? Math.min(1, obs.lastRoom.damageTaken / 12) : 0.5;
  const raw = 0.65 * hp + 0.35 * dmg;
  return prev * 0.4 + raw * 0.6;
}

// Deterministic proposer. An LLM adapter would return the same command shape.
export function propose(obs, room, p, opts = DIRECTOR_DEFAULTS) {
  const base = room.budget ?? room.enemies.reduce((a, e) => a + ENEMY_COST[e.type], 0);
  // high pressure -> easier room; cruising -> harder room
  const shift = Math.max(-opts.maxShift, Math.min(opts.maxShift, Math.round((opts.target - p) * 6)));
  const budget = Math.max(2, base + shift);
  const r = rng(room.id * 97 + Math.round(p * 100));
  const enemies = [];
  let left = budget;
  // vary roles rather than stacking one type: prefer a type not yet chosen
  while (left >= 2 && enemies.length < opts.maxEnemies) {
    const types = Object.keys(ENEMY_COST).filter((t) => ENEMY_COST[t] <= left && !((t === 'warden' || t === 'lurker') && obs.roomsCleared < 1));
    if (!types.length) break;
    const fresh = types.filter((t) => !enemies.includes(t));
    const pool = fresh.length ? fresh : types;
    const t = pool[Math.floor(r() * pool.length)];
    enemies.push(t);
    left -= ENEMY_COST[t];
  }
  return { type: 'chooseEncounter', roomId: room.id, enemies, budget: budget - left, reason: `pressure ${p.toFixed(2)} -> shift ${shift >= 0 ? '+' : ''}${shift}` };
}

// Validator: every command is checked against the CURRENT state before it is applied.
export function validate(cmd, run, room, opts = DIRECTOR_DEFAULTS) {
  const problems = [];
  if (cmd?.type !== 'chooseEncounter') problems.push('unknown command');
  if (cmd.roomId !== room.id) problems.push('stale room id');
  if (run.cleared.includes(room.id)) problems.push('room already cleared');
  if (!Array.isArray(cmd.enemies) || !cmd.enemies.length) problems.push('no enemies');
  if (cmd.enemies?.length > opts.maxEnemies) problems.push('too many enemies');
  for (const t of cmd.enemies ?? []) if (!ENEMIES[t]) problems.push(`unknown enemy ${t}`);
  const base = room.budget ?? 0;
  const cost = (cmd.enemies ?? []).reduce((a, t) => a + (ENEMY_COST[t] ?? 99), 0);
  if (Math.abs(cost - base) > opts.maxShift + 1) problems.push(`budget ${cost} too far from ${base}`);
  return { ok: problems.length === 0, problems };
}

// Place enemies with the generator's rules: floor, >= 3 steps from doors, not adjacent to each other.
export function place(run, room, types) {
  const doors = room.doors ?? [];
  const out = [];
  for (const t of types) {
    let best = null;
    for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) {
      if (!floorAt(run.map, x, y)) continue;
      if (doors.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) < 3)) continue;
      if (Math.abs(run.hero.x - x) + Math.abs(run.hero.y - y) < 3) continue;
      if (out.some((e) => Math.abs(e.x - x) + Math.abs(e.y - y) < 2)) continue;
      // archers prefer far cells, melee near the middle
      const cx = (room.x0 + room.x1) / 2, cy = (room.y0 + room.y1) / 2;
      const score = t === 'archer' ? -(Math.abs(x - run.hero.x) + Math.abs(y - run.hero.y)) : Math.abs(x - cx) + Math.abs(y - cy);
      if (!best || score < best.score) best = { x, y, score };
    }
    if (!best) return null;
    out.push({ type: t, x: best.x, y: best.y });
  }
  return out;
}

// Hook for combat.checkRoomEntry: returns the enemy list for this room (or null = authored).
export function makeDirector(opts = {}) {
  const o = { ...DIRECTOR_DEFAULTS, ...opts };
  const state = { p: 0.5, history: [], log: [] };
  let roomStart = null;
  const fn = (run, room) => {
    // close the books on the previous room
    if (roomStart) state.history.push({ damageTaken: roomStart.hp - run.hero.hp, turns: run.turn - roomStart.turn });
    roomStart = { hp: run.hero.hp, turn: run.turn };
    const obs = observe(run, state.history);
    state.p = pressure(obs, state.p);
    const cmd = (o.proposer ?? propose)(obs, room, state.p, o);
    const v = validate(cmd, run, room, o);
    const placed = v.ok ? place(run, room, cmd.enemies) : null;
    const entry = { room: room.id, pressure: +state.p.toFixed(2), cmd, ok: v.ok && !!placed, problems: v.problems };
    state.log.push(entry);
    if (!entry.ok) return null; // fallback: the level's authored encounter
    return placed;
  };
  fn.state = state;
  return fn;
}
