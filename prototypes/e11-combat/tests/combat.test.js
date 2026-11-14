import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMap, newRun, act, turn, checkRoomEntry, preview, threatCells, rewardOffers, takeReward, updateMeta, SKILLS } from '../src/combat.js';

const map = parseMap(readFileSync(new URL('../src/slice.txt', import.meta.url), 'utf8'));
const rooms = JSON.parse(readFileSync(new URL('../src/rooms.json', import.meta.url), 'utf8'));
const E = 1, W = 3;

function inRoom1() {
  const s = newRun({ map, rooms, seed: 1 });
  for (let i = 0; i < 4; i++) act(s, { type: 'move', dir: E }); // corridor x1 -> x5 enters room 1
  return s;
}

describe('combat rules', () => {
  it('outside combat moves are free; entering a room starts combat with visible intents', () => {
    const s = newRun({ map, rooms, seed: 1 });
    expect(s.combat).toBe(false);
    act(s, { type: 'move', dir: E });
    expect(s.turn).toBe(0);
    const t = inRoom1();
    expect(t.combat).toBe(true);
    expect(t.enemies[0].intent.kind).toBe('move'); // chaser not adjacent: approaches, no entry damage
    expect(t.hero.hp).toBe(30);
  });
  it('waiting triggers exactly one enemy phase', () => {
    const s = inRoom1();
    const e = s.enemies[0]; const before = { x: e.x, y: e.y };
    const r = act(s, { type: 'wait' });
    expect(r.ok).toBe(true);
    expect(s.turn).toBe(1);
    expect(r.events.filter((x) => x.type === 'enemyMove').length).toBe(1);
    expect(Math.abs(e.x - before.x) + Math.abs(e.y - before.y)).toBe(1);
  });
  it('turning is free and does not change cooldowns', () => {
    const s = inRoom1();
    s.hero.cooldowns.ember = 2;
    turn(s, 1); turn(s, -1);
    expect(s.turn).toBe(0);
    expect(s.hero.cooldowns.ember).toBe(2);
  });
  it('invalid actions cost no turn', () => {
    const s = inRoom1();
    const r = act(s, { type: 'skill', id: 'strike' }); // nothing in front
    expect(r.ok).toBe(false);
    expect(s.turn).toBe(0);
  });
  it('a sidestep dodges a locked attack', () => {
    const s = inRoom1();
    while (s.enemies[0].intent.kind !== 'attack') act(s, { type: 'wait' });
    const hpBefore = s.hero.hp;
    const target = s.enemies[0].intent.cells[0];
    expect(target).toEqual({ x: s.hero.x, y: s.hero.y });
    // step to any free neighbour
    const r = [0, 1, 2, 3].map((d) => act(s, { type: 'move', dir: d })).find((x) => x.ok);
    expect(r.events.some((x) => x.type === 'enemyMiss')).toBe(true);
    expect(s.hero.hp).toBe(hpBefore);
  });
  it('cooldown-2 skill is unavailable for the next two actions', () => {
    const s = inRoom1();
    s.hero.facing = E;
    // put the chaser in line
    s.enemies[0].x = 7; s.enemies[0].y = 3; s.enemies[0].intent = { kind: 'wait' };
    expect(act(s, { type: 'skill', id: 'ember' }).ok).toBe(true);
    expect(preview(s, 'ember').ok).toBe(false);
    act(s, { type: 'wait' });
    expect(preview(s, 'ember').ok).toBe(false);
    act(s, { type: 'wait' });
    expect(s.hero.cooldowns.ember).toBe(0);
  });
  it('burn ticks twice, chill is consumed by the next direct hit (+3)', () => {
    const s = inRoom1();
    s.hero.facing = E;
    const e = s.enemies[0]; e.x = 7; e.y = 3;
    const freeze = () => { e.intent = { kind: 'wait' }; };
    freeze();
    act(s, { type: 'skill', id: 'ember' }); // 3 + burn tick 2
    expect(e.hp).toBe(12 - 3 - 2);
    freeze(); act(s, { type: 'wait' }); // second burn tick
    expect(e.hp).toBe(5);
    expect(e.burn).toBe(0);
    freeze(); act(s, { type: 'skill', id: 'frost' }); // 3 frost + chill
    expect(e.hp).toBe(2);
    expect(e.chill).toBe(1);
    e.hp = 12; freeze();
    // chill +3 on the next direct hit (move adjacent first, keep chill alive)
    e.x = 6; e.chill = 1;
    expect(preview(s, 'strike').text).toContain('-8');
    act(s, { type: 'skill', id: 'strike' });
    expect(e.hp).toBe(4);
    expect(e.chill).toBe(0);
  });
  it('dead enemies do not act and two enemies never share a cell', () => {
    const s = newRun({ map, rooms, seed: 2 });
    for (let i = 0; i < 10; i++) act(s, { type: 'move', dir: E }); // into room 2 (room 1 skipped? no: blocked by combat)
    // fight room 1 by waiting/striking; just make sure occupancy is unique throughout
    for (let i = 0; i < 40 && !s.over; i++) {
      const r = act(s, { type: 'skill', id: 'strike' });
      if (!r.ok) act(s, { type: 'wait' });
      const cells = s.enemies.filter((e) => e.hp > 0).map((e) => `${e.x},${e.y}`);
      expect(new Set(cells).size).toBe(cells.length);
    }
  });
  it('threat cells match attack intents', () => {
    const s = inRoom1();
    while (s.enemies[0].intent.kind !== 'attack') act(s, { type: 'wait' });
    expect(threatCells(s)).toEqual([expect.objectContaining({ x: s.hero.x, y: s.hero.y, damage: 4 })]);
  });
  it('rewards and meta: frost scout unlocks after room 2, the run itself is not kept', () => {
    const s = inRoom1();
    const offers = rewardOffers(s);
    expect(offers.map((o) => o.kind)).toEqual(['skill', 'upgrade', 'relic']);
    takeReward(s, offers[1]);
    expect(Object.values(s.hero.upgrades)[0]).toBe(2);
    s.cleared = [1, 2]; s.over = 'dead';
    const m = updateMeta({}, s);
    expect(m.unlocked).toContain('frost');
    expect(m.runs).toBe(1);
    expect(Object.keys(SKILLS).length).toBe(8);
  });
  it('entering a cleared room does not restart combat', () => {
    const s = inRoom1();
    s.cleared.push(1); s.combat = false; s.enemies = []; s.doorsLocked = false;
    expect(checkRoomEntry(s)).toEqual([]);
  });
});
