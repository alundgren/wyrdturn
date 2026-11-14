// Generated skills from the rules vocabulary the engine already executes.
// A skill = element + target pattern + primary effect + optional rider.
// Its cooldown comes from a power budget, so generated skills stay comparable;
// the skill lab (scripts/skilllab.mjs) then measures them with the bot.
// No generated text introduces a mechanic the engine cannot run.

import { rng, SKILLS } from './combat.js';

// How much each target pattern multiplies the value of a hit.
const TARGETS = {
  adjacent: { mult: 1.0, label: 'the enemy in front' },
  ray: { mult: 1.2, label: 'the first enemy in a line', range: 3 },
  arc: { mult: 2.4, label: 'front cell and its sides' }, // 1.6 -> 2.0 -> 2.4: skill lab flagged arc skills as too strong twice
  burning: { mult: 1.3, label: 'a burning enemy within 3', range: 3, needs: 'fire' },
  self: { mult: 0, label: 'yourself' },
};
const RIDERS = {
  burn: { value: 3.5, op: { op: 'status', status: 'burn' }, text: '+ Burn', element: 'fire' },
  chill: { value: 3.5, // was 2.5; Chill adds +3 to the next hit, lab flagged chill skills
    op: { op: 'status', status: 'chill' }, text: '+ Chill', element: 'frost' },
  push: { value: 1.5, op: { op: 'push', cells: 1 }, text: ', push 1', element: 'physical', targets: ['adjacent'] },
  chillAdjacent: { value: 3, op: { op: 'chillAdjacent' }, text: ', Chill adjacent', element: 'frost', targets: ['self'] },
};
const NAMES = {
  fire: { pre: ['Ember', 'Cinder', 'Searing', 'Ash', 'Kindling', 'Pyre'], ray: ['Bolt', 'Lance', 'Dart'], adjacent: ['Brand', 'Touch', 'Fist'], arc: ['Sweep', 'Fan', 'Wave'], burning: ['Flare', 'Combust'], self: ['Mantle', 'Ward'] },
  frost: { pre: ['Rime', 'Frost', 'Hoar', 'Glacial', 'Winter', 'Sleet'], ray: ['Shard', 'Spike', 'Needle'], adjacent: ['Grasp', 'Bite', 'Kiss'], arc: ['Gust', 'Breath', 'Arc'], self: ['Shell', 'Ward', 'Veil'] },
  physical: { pre: ['Iron', 'Rust', 'Grave', 'Bone', 'Heavy', 'Wild'], ray: ['Throw', 'Javelin'], adjacent: ['Cut', 'Blow', 'Smash'], arc: ['Cleave', 'Swing', 'Reap'], self: ['Stance', 'Brace'] },
};

export function skillPower(def) {
  const t = TARGETS[def.target];
  let p = 0;
  for (const e of def.effects) {
    if (e.op === 'damage') p += e.amount * t.mult;
    if (e.op === 'block') p += e.amount * 0.8;
    if (e.op === 'status') p += e.status === 'burn' ? RIDERS.burn.value : RIDERS.chill.value;
    if (e.op === 'push') p += RIDERS.push.value;
    if (e.op === 'chillAdjacent') p += RIDERS.chillAdjacent.value;
  }
  return p;
}
// Budget: Strike (5 dmg adjacent = 5) is free; every 2.5 power above that costs one cooldown turn.
export const cooldownFor = (power) => Math.max(0, Math.min(4, Math.round((power - 5) / 2.5)));

export function generateSkill(seed) {
  const r = rng(seed * 7 + 3);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const element = pick(['fire', 'frost', 'physical']);
  // fire has no defensive rider, so no fire self-skills (they would be a renamed Guard)
  const targets = Object.keys(TARGETS).filter((t) => (!TARGETS[t].needs || TARGETS[t].needs === element) && !(t === 'self' && element === 'fire'));
  const target = pick(targets);
  const effects = [];
  if (target === 'self') effects.push({ op: 'block', amount: 3 + Math.floor(r() * 6) });
  else effects.push({ op: 'damage', amount: 3 + Math.floor(r() * 5) });
  const riders = Object.entries(RIDERS).filter(([, v]) => v.element === element && (!v.targets || v.targets.includes(target)) && !(target === 'self' && v.op.op === 'status'));
  let riderText = '';
  // Elemental skills always carry their element's rider, so the name and element mean something.
  // Plain adjacent hits must beat Strike (5) or bring a rider; otherwise they are a worse Strike.
  const needRider = element !== 'physical' || (target === 'adjacent' && effects[0].amount <= 5) || (target === 'self' && effects[0].amount <= 5);
  if (riders.length && (needRider || r() < 0.5)) { const [, rd] = pick(riders); effects.push({ ...rd.op }); riderText = rd.text.startsWith(',') ? rd.text : ' ' + rd.text; }
  else if (needRider && target === 'self') effects[0].amount += 3;
  const def = { element, target, effects, range: TARGETS[target].range };
  def.power = Math.round(skillPower(def) * 10) / 10;
  def.cooldown = cooldownFor(def.power);
  const N = NAMES[element];
  def.name = `${pick(N.pre)} ${pick(N[target] ?? N.adjacent)}`;
  const main = effects[0].op === 'damage' ? `${effects[0].amount} ${element === 'physical' ? 'Physical' : element[0].toUpperCase() + element.slice(1)}` : `Gain ${effects[0].amount} Block`;
  def.text = `${main}${target === 'self' ? '' : ` to ${TARGETS[target].label}`}${riderText}`.replace(' ,', ',');
  def.id = `gen${seed}`;
  def.generated = true;
  return def;
}

// Validate before registering: only ops/targets the engine knows, sane numbers.
export function validateSkill(def) {
  const problems = [];
  if (!TARGETS[def.target]) problems.push('unknown target');
  for (const e of def.effects) if (!['damage', 'block', 'status', 'push', 'chillAdjacent', 'removeStatus'].includes(e.op)) problems.push(`unknown op ${e.op}`);
  if (def.target !== 'self' && !def.effects.some((e) => e.op === 'damage')) problems.push('attack without damage');
  if (def.cooldown < 0 || def.cooldown > 4) problems.push('cooldown out of range');
  if (!def.name || def.name.length > 24) problems.push('bad name');
  // legibility: an elemental name needs an elemental effect
  if (def.element !== 'physical' && !def.effects.some((e) => e.op === 'status' || e.op === 'chillAdjacent')) problems.push('elemental name without elemental effect');
  // redundancy with the fixed kit
  if (def.target === 'adjacent' && def.effects.length === 1 && def.effects[0].amount <= 5) problems.push('worse than Strike');
  if (def.target === 'self' && def.effects.length === 1 && def.effects[0].amount <= 5) problems.push('worse than Guard');
  return { ok: problems.length === 0, problems };
}

export function registerSkill(def) { SKILLS[def.id] = def; return def.id; }
