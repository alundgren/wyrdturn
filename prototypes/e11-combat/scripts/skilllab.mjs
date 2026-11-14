// Skill lab: generate N skills, give each to the smart bot in slot 4 (instead of
// Frost Dart) and play the same generated levels. Compares win rate and HP left
// with the baseline kit and flags skills that are too strong or useless.
// Usage: node scripts/skilllab.mjs [skills=12] [levels=16]
import { writeFileSync } from 'node:fs';
import { play, cfg } from './bot.mjs';
import { generate } from '../src/levelgen.js';
import { generateSkill, validateSkill, registerSkill } from '../src/skillgen.js';
import { SKILLS } from '../src/combat.js';

const N = Number(process.argv[2] ?? 12), LEVELS = Number(process.argv[3] ?? 16);
cfg.policy = 'smart';
const levels = Array.from({ length: LEVELS }, (_, i) => generate(1000 + i));
function measure(kit) {
  const res = levels.map((lvl, i) => play(i + 1, 'ember', lvl, { skills: kit, noRewards: true }));
  const wins = res.filter((r) => r.result === 'won');
  return {
    win: wins.length / res.length,
    hp: wins.length ? wins.reduce((a, r) => a + r.hp, 0) / wins.length : 0,
    rooms: res.reduce((a, r) => a + r.rooms, 0) / res.length,
    stuck: res.filter((r) => r.result === 'stuck').length,
  };
}
const t0 = Date.now();
const base = measure(['strike', 'guard', 'ember', 'frost']);
const weak = measure(['strike', 'guard', 'ember', 'guard']);
console.log(`baseline (Ember, Frost Dart): win ${(base.win * 100).toFixed(0)}% hp ${base.hp.toFixed(1)} rooms ${base.rooms.toFixed(2)}`);
console.log(`no 4th skill:                 win ${(weak.win * 100).toFixed(0)}% hp ${weak.hp.toFixed(1)} rooms ${weak.rooms.toFixed(2)}`);
const rows = [];
for (let i = 1; i <= N; i++) {
  const def = generateSkill(i);
  const v = validateSkill(def);
  if (!v.ok) { rows.push({ id: def.id, name: def.name, invalid: v.problems }); continue; }
  registerSkill(def);
  const m = measure(['strike', 'guard', 'ember', def.id]);
  // score relative to baseline: rooms cleared is the most stable signal on few levels
  const delta = m.rooms - base.rooms;
  const verdict = delta > 0.6 ? 'TOO STRONG' : m.rooms <= weak.rooms + 0.1 ? 'USELESS' : delta < -0.6 ? 'weak' : 'ok';
  rows.push({ id: def.id, name: def.name, text: def.text, cooldown: def.cooldown, power: def.power, win: m.win, hp: m.hp, rooms: m.rooms, delta, verdict });
  console.log(`${def.name.padEnd(18)} cd${def.cooldown} p${String(def.power).padEnd(4)} ${def.text.padEnd(46)} win ${(m.win * 100).toFixed(0).padStart(3)}% rooms ${m.rooms.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}) ${verdict}`);
}
writeFileSync(new URL('../shots/skilllab.json', import.meta.url), JSON.stringify({ base, weak, rows, levels: LEVELS, seconds: (Date.now() - t0) / 1000 }, null, 2));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s; ${Object.keys(SKILLS).length} skills registered`);
