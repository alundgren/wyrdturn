// Reusable bots for balance self-checks (sim.mjs, skilllab.mjs).
// smart = 2-ply lookahead over every legal action using the real rules; naive = hit what is in front.
import { readFileSync } from 'node:fs';
import { rng, parseMap, newRun, act, turn, preview, threatCells, rewardOffers, takeReward, SKILLS, DIRS, floorAt, inRoom } from '../src/combat.js';

export const map = parseMap(readFileSync(new URL('../src/slice.txt', import.meta.url), 'utf8'));
export const rooms = JSON.parse(readFileSync(new URL('../src/rooms.json', import.meta.url), 'utf8'));
export const cfg = { policy: 'smart', hpw: 2, enw: 4 };
// seeded tie-break so the same seed always plays the same game (stable comparisons)
let tie = Math.random;
void turn;

function clone(s) {
  // copy the mutable parts; map/rooms are shared, rand is not used by act()
  return { ...s, hero: { ...s.hero, cooldowns: { ...s.hero.cooldowns }, upgrades: { ...s.hero.upgrades }, skills: [...s.hero.skills] },
    enemies: s.enemies.map((e) => ({ ...e, intent: e.intent && { ...e.intent } })), cleared: [...s.cleared], log: [] };
}
function score(s) {
  if (s.over === 'dead') return -1e6;
  const h = s.hero;
  const live = s.enemies.filter((e) => e.hp > 0);
  const incoming = threatCells(s).filter((c) => c.x === h.x && c.y === h.y && c.damage).reduce((a, c) => a + c.damage, 0);
  return h.hp * cfg.hpw - live.reduce((a, e) => a + e.hp + e.burn * 2, 0) * cfg.enw - live.length * 10 - Math.max(0, incoming - 0) * 2.5 + (s.combat ? 0 : 200);
}
function options(s) {
  const opts = [{ type: 'wait' }, ...[0, 1, 2, 3].map((d) => ({ type: 'move', dir: d }))];
  for (let f = 0; f < 4; f++) for (const id of s.hero.skills) opts.push({ type: 'skill', id, facing: f });
  return opts;
}
function step(s, o) {
  const c = clone(s);
  if (o.facing !== undefined) c.hero.facing = o.facing;
  return act(c, o).ok ? c : null;
}
// 2-ply lookahead: my action, enemy phase, my best follow-up, enemy phase. Dedupe identical skill uses.
function choose(s) {
  let best = null;
  const seen = new Set();
  for (const o of options(s)) {
    const c1 = step(s, o);
    if (!c1) continue;
    const sig = JSON.stringify([c1.hero, c1.enemies.map((e) => [e.x, e.y, e.hp, e.burn, e.chill])]);
    if (seen.has(sig)) continue;
    seen.add(sig);
    let v = score(c1);
    if (c1.combat && !c1.over) {
      let v2 = -Infinity;
      for (const o2 of options(c1)) { const c2 = step(c1, o2); if (c2) v2 = Math.max(v2, score(c2)); }
      v = Math.max(v, v2) * 0.98 + v * 0.02; // value of the best continuation
    }
    v += (o.type === 'wait' ? -0.5 : 0) + tie() * 0.01;
    if (!best || v > best.v) best = { o, v };
  }
  return best?.o ?? { type: 'wait' };
}

// Walk toward the nearest uncleared room (BFS over floor), one step.
function exploreStep(s) {
  const h = s.hero;
  const T = (x, y) => s.map.tiles[y]?.[x];
  const keyLeft = !s.hero.key && s.map.tiles.some((row) => row.includes('K'));
  const reachableRoom = (x, y) => s.rooms.some((r) => !s.cleared.includes(r.id) && inRoom(r, x, y));
  const wantShrine = s.hero.hp <= s.hero.maxHp - 8 && s.map.tiles.some((row, y) => row.some((c, x) => c === 'H' && !(s.usedShrines ?? []).includes(`${x},${y}`)));
  const goal = (x, y) => (wantShrine && T(x, y) === 'H' && !(s.usedShrines ?? []).includes(`${x},${y}`)) || (!wantShrine && ((keyLeft && T(x, y) === 'K') || reachableRoom(x, y)));
  const passable = (x, y) => floorAt(s.map, x, y) && !(T(x, y) === 'L' && !s.hero.key);
  const prev = new Map([[`${h.x},${h.y}`, null]]);
  const q = [{ x: h.x, y: h.y }];
  while (q.length) {
    const c = q.shift();
    if (goal(c.x, c.y)) {
      let k = `${c.x},${c.y}`, step = c;
      while (prev.get(k) && prev.get(k) !== `${h.x},${h.y}`) { const [x, y] = prev.get(k).split(',').map(Number); step = { x, y }; k = prev.get(k); }
      return DIRS.findIndex((d) => d.dx === step.x - h.x && d.dy === step.y - h.y);
    }
    for (const d of DIRS) { const n = { x: c.x + d.dx, y: c.y + d.dy }, k = `${n.x},${n.y}`; if (!prev.has(k) && passable(n.x, n.y)) { prev.set(k, `${c.x},${c.y}`); q.push(n); } }
  }
  return -1;
}

export function play(seed, preset, level, opts = {}) {
  tie = rng(seed * 977 + 13);
  const s = level ? newRun({ map: parseMap(level.mapText), rooms: level.rooms, preset, seed }) : newRun({ map, rooms, preset, seed });
  if (opts.skills) s.hero.skills = [...opts.skills];
  if (opts.director) s.director = opts.director();
  if (opts.hero) Object.assign(s.hero, structuredClone(opts.hero));
  if (opts.noRewards) s.noRewards = true;
  let steps = 0;
  while (!s.over && steps++ < 900) {
    const h = s.hero;
    if (!s.combat) {
      // walk east along the corridor row to the next room
      if (s.cleared.length && s.lastCleared !== s.cleared.length) {
        s.lastCleared = s.cleared.length;
        if (!s.noRewards && s.cleared.length < s.rooms.length) {
          const offers = rewardOffers(s);
          const pick = cfg.policy === 'naive' ? offers[0] : offers.find((o) => o.kind === 'upgrade') ?? offers[0];
          takeReward(s, pick, 3);
        }
      }
      const d = exploreStep(s);
      if (d < 0) break;
      act(s, { type: 'move', dir: d });
      continue;
    }
    if (cfg.policy === 'smart') {
      const o = choose(s);
      if (o.facing !== undefined) h.facing = o.facing;
      act(s, o);
      continue;
    }
    // naive: hit whatever is in front if possible, else approach
    let hit = false;
    for (let f = 0; f < 4 && !hit; f++) { h.facing = f; for (const id of h.skills) if (preview(s, id).ok && SKILLS[id].effects.some((e) => e.op === 'damage')) { act(s, { type: 'skill', id }); hit = true; break; } }
    if (hit) continue;
    const e = s.enemies.filter((x) => x.hp > 0)[0];
    const dirs = [0, 1, 2, 3].sort((a, c) => (Math.abs(h.x + DIRS[a].dx - e.x) + Math.abs(h.y + DIRS[a].dy - e.y)) - (Math.abs(h.x + DIRS[c].dx - e.x) + Math.abs(h.y + DIRS[c].dy - e.y)));
    let ok = false;
    for (const d of dirs) if (act(s, { type: 'move', dir: d }).ok) { ok = true; break; }
    if (!ok) act(s, { type: 'wait' });
  }
  if (!s.over && process.env.WHY) console.log('stuck seed', seed, preset, 'hero', s.hero.x, s.hero.y, s.hero.hp, s.hero.skills.join('/'), s.enemies.filter((e) => e.hp > 0).map((e) => `${e.name}@${e.x},${e.y} hp${e.hp} ${e.intent?.kind}`).join(' '), '| log:', s.log.slice(-6).join(' ; '));
  return { result: s.over ?? 'stuck', rooms: s.cleared.length, hp: s.hero.hp, turns: s.turn, directorLog: s.director?.state?.log, hero: s.hero };
}

