import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMap, applyAction, createState, Controller, isWalkable } from '../src/grid.js';

const map = parseMap(readFileSync(new URL('../../maps/test01.txt', import.meta.url), 'utf8'));

describe('grid', () => {
  it('parses size and start', () => {
    expect(map.width).toBe(10);
    expect(map.height).toBe(10);
    expect(map.start).toEqual({ x: 2, y: 8 });
    expect(createState(map)).toEqual({ x: 2, y: 8, facing: 0 });
  });
  it('walls block, floor allows', () => {
    const s = createState(map); // (2,8) facing N, (2,7) is floor
    expect(applyAction(map, s, 'forward').kind).toBe('move');
    expect(applyAction(map, s, 'back').kind).toBe('bump'); // (2,9) wall
  });
  it('turns wrap', () => {
    let s = createState(map);
    s = applyAction(map, s, 'turnLeft').state;
    expect(s.facing).toBe(3);
    for (let i = 0; i < 5; i++) s = applyAction(map, s, 'turnRight').state;
    expect(s.facing).toBe(0);
  });
  it('strafe is relative to facing', () => {
    const s = { x: 2, y: 8, facing: 0 };
    expect(applyAction(map, s, 'strafeRight').state).toMatchObject({ x: 3, y: 8 });
    expect(applyAction(map, { ...s, facing: 1 }, 'strafeRight').kind).toBe('bump'); // (2,9) wall
  });
  it('door walkable, pillar blocks', () => {
    expect(isWalkable(map, 5, 3)).toBe(true); // D
    expect(isWalkable(map, 7, 5)).toBe(false); // P
  });
  it('buffers one input while busy', () => {
    const c = new Controller(map);
    expect(c.press('forward').kind).toBe('move');
    expect(c.press('turnLeft')).toBeNull();
    expect(c.press('turnRight')).toBeNull(); // replaces queued
    const next = c.done();
    expect(next.action).toBe('turnRight');
    expect(c.done()).toBeNull();
  });
});
