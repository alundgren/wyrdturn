// Combat rules for the "Ember Scout" slice. Pure logic: no three.js, no DOM.
// Same code drives the game, the unit tests and the balance simulator.
//
// Turn contract (see research/combat-progression.md, Recommendation):
//   validate -> clear hero Block -> pay (cooldown) -> direct effects -> defeat
//   cleanup -> enemy phase (announced intents, in id order) -> status ticks ->
//   defeat cleanup -> cooldowns tick -> enemies publish next intents.
// Turning the camera, inspecting and invalid actions are free (no turn).

export const DIRS = [
  { dx: 0, dy: -1 }, // N
  { dx: 1, dy: 0 }, // E
  { dx: 0, dy: 1 }, // S
  { dx: -1, dy: 0 }, // W
];

// ---------------- data ----------------------------------------------------------

export const SKILLS = {
  strike: {
    name: "Strike",
    element: "physical",
    cooldown: 0,
    target: "adjacent",
    effects: [{ op: "damage", amount: 5 }],
    text: "5 Physical to the enemy in front",
  },
  guard: {
    name: "Guard",
    element: "none",
    cooldown: 0,
    target: "self",
    effects: [{ op: "block", amount: 5 }],
    text: "Gain 5 Block",
  },
  ember: {
    name: "Ember Bolt",
    element: "fire",
    cooldown: 2,
    target: "ray",
    range: 3,
    effects: [
      { op: "damage", amount: 3 },
      { op: "status", status: "burn" },
    ],
    text: "3 Fire + Burn, first enemy in a line (3)",
  },
  frost: {
    name: "Frost Dart",
    element: "frost",
    cooldown: 2,
    target: "ray",
    range: 3,
    effects: [
      { op: "damage", amount: 3 },
      { op: "status", status: "chill" },
    ],
    text: "3 Frost + Chill, first enemy in a line (3)",
  },
  bash: {
    name: "Shield Bash",
    element: "physical",
    cooldown: 2,
    target: "adjacent",
    effects: [
      { op: "damage", amount: 2 },
      { op: "push", cells: 1 },
    ],
    text: "2 Physical, push 1 cell",
  },
  cleave: {
    name: "Cleave",
    element: "physical",
    cooldown: 2,
    target: "arc",
    effects: [{ op: "damage", amount: 3 }],
    text: "3 Physical to front cell and its sides",
  },
  frostward: {
    name: "Frost Ward",
    element: "frost",
    cooldown: 3,
    target: "self",
    effects: [{ op: "block", amount: 7 }, { op: "chillAdjacent" }],
    text: "7 Block, Chill all adjacent enemies",
  },
  kindle: {
    name: "Kindle",
    element: "fire",
    cooldown: 3,
    target: "burning",
    range: 3,
    effects: [
      { op: "damage", amount: 6 },
      { op: "removeStatus", status: "burn" },
    ],
    text: "6 Fire to a burning enemy within 3, ends its Burn",
  },
};
export const DAMAGING = ["strike", "ember", "frost", "bash", "cleave", "kindle"];

export const ENEMIES = {
  chaser: { name: "Ghoul", role: "Chaser", hp: 12, damage: 4, monster: "ghoul" },
  archer: { name: "Cultist", role: "Archer", hp: 9, damage: 5, range: 4, monster: "cultist" },
  warden: { name: "Warden", role: "Warden", hp: 18, damage: 6, monster: "brute" },
  // Lurker: fast flanker. Moves 2 tiles per turn, so you cannot simply outpace it; low HP.
  lurker: { name: "Lurker", role: "Lurker", hp: 8, damage: 5, speed: 2, monster: "spider" },
};

export const RELICS = {
  ash: { name: "Ash Charm", text: "+1 Burn damage per tick" },
  ice: { name: "Ice Lens", text: "+2 Chill bonus" },
};

export const PRESETS = {
  ember: { name: "Ember Scout", skills: ["strike", "guard", "ember", "frost"] },
  frost: {
    name: "Frost Scout",
    skills: ["strike", "guard", "frost", "frostward"],
    unlock: "Clear room 2",
  }, // was bash: bot win rate 38% -> 70% with Frost Ward
};

// enrageAfter/enrageEvery: anti-stall (the sim bots found you could dodge a lone melee enemy forever)
export const RULES = {
  heroHp: 30,
  burnDamage: 2,
  burnPhases: 2,
  chillBonus: 3,
  chillPhases: 2,
  healFallback: 6,
  enrageAfter: 12,
  enrageEvery: 4,
  dreadFrom: 2,
  shrineHeal: 12,
};
export const enrage = (s) =>
  s.roomTurns > RULES.enrageAfter
    ? Math.floor((s.roomTurns - RULES.enrageAfter - 1) / RULES.enrageEvery) + 1
    : 0;

// ---------------- helpers --------------------------------------------------------

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseMap(text) {
  const rows = text.split("\n").filter((l) => l.length && !l.startsWith("# "));
  const tiles = rows.map((r) => r.split(""));
  let start = null;
  tiles.forEach((r, y) =>
    r.forEach((c, x) => {
      if (c === "S") start = { x, y };
    }),
  );
  return { width: Math.max(...rows.map((r) => r.length)), height: rows.length, tiles, start };
}
const tile = (map, x, y) => map.tiles[y]?.[x] ?? "#";
// 'K' key (floor), 'L' locked gate (floor once the hero has the key)
export const floorAt = (map, x, y) => [".", "S", "K", "L", "H"].includes(tile(map, x, y));
export const tileAt = tile;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const key = (x, y) => `${x},${y}`;

export function inRoom(room, x, y) {
  return x >= room.x0 && x <= room.x1 && y >= room.y0 && y <= room.y1;
}

// ---------------- state ------------------------------------------------------------

export function newRun({ map, rooms, preset = "ember", seed = 1 }) {
  return {
    map,
    rooms,
    seed,
    rand: rng(seed),
    hero: {
      x: map.start.x,
      y: map.start.y,
      facing: 1,
      hp: RULES.heroHp,
      maxHp: RULES.heroHp,
      block: 0,
      skills: [...PRESETS[preset].skills],
      cooldowns: {},
      upgrades: {},
      relic: null,
    },
    enemies: [],
    nextId: 1,
    room: null,
    cleared: [],
    combat: false,
    over: null,
    log: [],
    turn: 0,
    preset,
    doorsLocked: false,
  };
}

const living = (s) => s.enemies.filter((e) => e.hp > 0);
export const enemyAt = (s, x, y) => living(s).find((e) => e.x === x && e.y === y);
export function blocked(s, x, y, { ignoreHero = false } = {}) {
  if (!floorAt(s.map, x, y)) return true;
  if (tile(s.map, x, y) === "L" && !s.hero.key) return true;
  if (enemyAt(s, x, y)) return true;
  if (!ignoreHero && s.hero.x === x && s.hero.y === y) return true;
  if (s.doorsLocked && s.room && !inRoom(s.room, x, y)) return true; // locked in during combat
  return false;
}

// ---------------- room entry -------------------------------------------------------

// Call after every hero move. Starts combat when the hero steps into an uncleared room.
export function checkRoomEntry(s) {
  if (s.combat) return [];
  const room = s.rooms.find((r) => inRoom(r, s.hero.x, s.hero.y) && !s.cleared.includes(r.id));
  if (!room) return [];
  s.room = room;
  s.combat = true;
  s.roomTurns = 0;
  s.doorsLocked = true;
  for (const h of Object.keys(s.hero.cooldowns)) s.hero.cooldowns[h] = 0; // readiness resets per encounter
  // A director (game master) may replace the authored encounter; null keeps the authored one.
  const spec = s.director?.(s, room) ?? room.enemies;
  s.enemies = spec.map((e) => {
    const t = ENEMIES[e.type];
    return {
      id: s.nextId++,
      type: e.type,
      name: t.name,
      x: e.x,
      y: e.y,
      hp: t.hp,
      maxHp: t.hp,
      facing: 3,
      burn: 0,
      chill: 0,
      intent: null,
      phase: "ready",
    };
  });
  const ev = [{ type: "combatStart", room: room.id }];
  for (const e of s.enemies) publishIntent(s, e);
  log(s, `Room ${room.id}: ${s.enemies.map((e) => e.name).join(", ")}`);
  return ev;
}

// ---------------- targeting ----------------------------------------------------------

function ray(s, from, dir, range, { stopAtHero = false } = {}) {
  // cells along a straight line until a wall; returns cells and the first occupant
  const cells = [];
  let x = from.x,
    y = from.y;
  for (let i = 0; i < range; i++) {
    x += dir.dx;
    y += dir.dy;
    if (!floorAt(s.map, x, y)) break;
    cells.push({ x, y });
    const e = enemyAt(s, x, y);
    if (e) return { cells, hit: e };
    if (stopAtHero && s.hero.x === x && s.hero.y === y) return { cells, hit: "hero" };
  }
  return { cells, hit: null };
}

// Which enemies (and cells) a skill would affect right now. Same function for preview and resolve.
export function skillTargets(s, id) {
  const sk = SKILLS[id],
    h = s.hero,
    d = DIRS[h.facing];
  if (sk.target === "self") return { ok: true, enemies: [], cells: [] };
  if (sk.target === "adjacent") {
    const e = enemyAt(s, h.x + d.dx, h.y + d.dy);
    return e
      ? { ok: true, enemies: [e], cells: [{ x: e.x, y: e.y }] }
      : { ok: false, reason: "No enemy in front" };
  }
  if (sk.target === "ray") {
    const r = ray(s, h, d, sk.range);
    return r.hit
      ? { ok: true, enemies: [r.hit], cells: r.cells }
      : { ok: false, reason: "No enemy in line" };
  }
  if (sk.target === "arc") {
    const f = { x: h.x + d.dx, y: h.y + d.dy };
    if (!floorAt(s.map, f.x, f.y)) return { ok: false, reason: "Wall in front" };
    const side = DIRS[(h.facing + 1) % 4];
    const cells = [
      f,
      { x: f.x + side.dx, y: f.y + side.dy },
      { x: f.x - side.dx, y: f.y - side.dy },
    ].filter((c) => floorAt(s.map, c.x, c.y));
    const enemies = cells.map((c) => enemyAt(s, c.x, c.y)).filter(Boolean);
    return enemies.length
      ? { ok: true, enemies, cells }
      : { ok: false, reason: "No enemy in reach" };
  }
  if (sk.target === "burning") {
    // nearest burning enemy within range: facing one first, else nearest
    const cands = living(s).filter((e) => e.burn > 0 && manhattan(e, h) <= sk.range);
    if (!cands.length) return { ok: false, reason: "No burning enemy within 3" };
    const front = ray(s, h, d, sk.range).hit;
    const e = cands.includes(front)
      ? front
      : cands.sort((a, b) => manhattan(a, h) - manhattan(b, h) || a.id - b.id)[0];
    return { ok: true, enemies: [e], cells: [{ x: e.x, y: e.y }] };
  }
  return { ok: false, reason: "Unknown target" };
}

export function skillDamage(s, id, enemy) {
  // direct damage the skill would deal to this enemy (before HP cap)
  const sk = SKILLS[id];
  const dmg = sk.effects.find((f) => f.op === "damage");
  if (!dmg) return 0;
  let n = dmg.amount + (s.hero.upgrades[id] ?? 0);
  if (enemy.chill > 0) n += RULES.chillBonus + (s.hero.relic === "ice" ? 2 : 0);
  return n;
}

export function canUse(s, id) {
  if (!s.hero.skills.includes(id)) return { ok: false, reason: "Not equipped" };
  if ((s.hero.cooldowns[id] ?? 0) > 0)
    return { ok: false, reason: `Ready in ${s.hero.cooldowns[id]}` };
  if (!s.combat && SKILLS[id].target !== "self") return { ok: false, reason: "No enemies" };
  return skillTargets(s, id);
}

// Preview text for the HUD, computed by the same rules that resolve the action.
export function preview(s, id) {
  const t = canUse(s, id);
  if (!t.ok) return { ok: false, text: t.reason };
  const sk = SKILLS[id];
  const parts = t.enemies.map((e) => {
    const d = skillDamage(s, id, e);
    const kill = d >= e.hp;
    return `${e.name} -${d}${kill ? " (kills)" : ""}`;
  });
  if (sk.effects.some((f) => f.op === "block"))
    parts.push(`+${sk.effects.find((f) => f.op === "block").amount} Block`);
  return { ok: true, text: parts.join(", ") || sk.text, targets: t.enemies.map((e) => e.id) };
}

// ---------------- enemy intents --------------------------------------------------------

function bfsStep(s, from, goalFn) {
  // shortest path (4-neighbour) avoiding walls/enemies; returns first step or null
  const start = key(from.x, from.y),
    prev = new Map([[start, null]]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    if (goalFn(c) && !(c.x === from.x && c.y === from.y)) {
      let k = key(c.x, c.y),
        step = c;
      while (prev.get(k) && prev.get(k) !== start) {
        const [x, y] = prev.get(k).split(",").map(Number);
        step = { x, y };
        k = prev.get(k);
      }
      return step;
    }
    for (const d of DIRS) {
      const n = { x: c.x + d.dx, y: c.y + d.dy };
      const k = key(n.x, n.y);
      if (prev.has(k)) continue;
      const isGoal = goalFn(n);
      if (
        blocked(s, n.x, n.y, { ignoreHero: true }) ||
        (n.x === s.hero.x && n.y === s.hero.y && !isGoal)
      )
        continue;
      prev.set(k, key(c.x, c.y));
      q.push(n);
    }
  }
  return null;
}

const dirTo = (a, b) =>
  DIRS.findIndex(
    (d) =>
      d.dx === Math.sign(b.x - a.x) &&
      d.dy === Math.sign(b.y - a.y) &&
      (a.x === b.x || a.y === b.y),
  );

function clearLine(s, a, b) {
  if (a.x !== b.x && a.y !== b.y) return false;
  const di = dirTo(a, b);
  if (di < 0) return false;
  const r = ray(s, a, DIRS[di], manhattan(a, b), { stopAtHero: true });
  return r.hit === "hero";
}

// Where each role wants to stand, relative to the hero's CURRENT cell.
function moveGoal(s, e) {
  const h = s.hero,
    t = ENEMIES[e.type];
  // archer: aligned, in range, not adjacent, and a clear shot (pillars/enemies block; found by the sim bot)
  if (e.type === "archer")
    return (c) =>
      manhattan(c, h) <= t.range &&
      manhattan(c, h) > 1 &&
      (c.x === h.x || c.y === h.y) &&
      (c.x === e.x && c.y === e.y ? true : !blocked(s, c.x, c.y, { ignoreHero: true })) &&
      clearLine(s, c, h);
  return (c) => manhattan(c, h) === 1 && !(c.x === h.x && c.y === h.y);
}

export function publishIntent(s, e) {
  const t = ENEMIES[e.type],
    h = s.hero;
  const adj = manhattan(e, h) === 1;
  if (e.type === "chaser") {
    if (adj)
      e.intent = { kind: "attack", cells: [{ x: h.x, y: h.y }], damage: t.damage + enrage(s) };
    else e.intent = moveIntent(s, e, moveGoal(s, e));
  } else if (e.type === "archer") {
    if (manhattan(e, h) <= t.range && clearLine(s, e, h)) {
      const di = dirTo(e, h);
      e.facing = di;
      const cells = ray(s, e, DIRS[di], t.range).cells;
      e.intent = { kind: "shoot", dir: di, cells, damage: t.damage + enrage(s) };
    } else {
      e.intent = moveIntent(s, e, moveGoal(s, e));
    }
  } else if (e.type === "lurker") {
    if (adj)
      e.intent = { kind: "attack", cells: [{ x: h.x, y: h.y }], damage: t.damage + enrage(s) };
    else e.intent = moveIntent(s, e, moveGoal(s, e));
  } else if (e.type === "warden") {
    if (e.phase === "windup") {
      const d = DIRS[e.facing],
        side = DIRS[(e.facing + 1) % 4];
      const f = { x: e.x + d.dx, y: e.y + d.dy };
      const cells = [
        f,
        { x: f.x + side.dx, y: f.y + side.dy },
        { x: f.x - side.dx, y: f.y - side.dy },
      ].filter((c) => floorAt(s.map, c.x, c.y));
      e.intent = { kind: "cleave", cells, damage: t.damage + enrage(s) };
    } else if (adj) {
      e.facing = dirTo(e, h); // facing locks when the wind-up starts
      e.intent = { kind: "windup" };
    } else e.intent = moveIntent(s, e, moveGoal(s, e));
  }
  if (e.intent?.kind === "move" && e.intent.to) e.facing = dirTo(e, e.intent.to);
}

function moveIntent(s, e, goal) {
  const step = bfsStep(s, e, goal);
  return step ? { kind: "move", to: step } : { kind: "wait" };
}

// ---------------- resolution --------------------------------------------------------------

function log(s, msg) {
  s.log.push(msg);
  if (s.log.length > 60) s.log.shift();
}

function damageEnemy(s, e, amount, element, ev) {
  e.hp = Math.max(0, e.hp - amount);
  ev.push({ type: "enemyHit", id: e.id, amount, element });
  log(s, `${e.name} takes ${amount} ${element}${e.hp <= 0 ? " and dies" : ""}`);
}

function applyStatus(s, e, status, ev) {
  if (status === "burn") e.burn = RULES.burnPhases;
  if (status === "chill") e.chill = RULES.chillPhases;
  ev.push({ type: "status", id: e.id, status });
}

function cleanupDead(s, ev) {
  for (const e of s.enemies)
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      e.intent = null;
      ev.push({ type: "enemyDeath", id: e.id });
    }
}

function heroHit(s, amount, source, ev) {
  const soaked = Math.min(s.hero.block, amount);
  s.hero.block -= soaked;
  const dmg = amount - soaked;
  s.hero.hp = Math.max(0, s.hero.hp - dmg);
  ev.push({ type: "heroHit", amount: dmg, blocked: soaked, source: source.id });
  log(s, `${source.name} hits you for ${dmg}${soaked ? ` (${soaked} blocked)` : ""}`);
}

// action: { type: 'move', dir: 0..3 (absolute) } | { type: 'wait' } | { type: 'skill', id }
// Returns { ok, events, reason }. When ok is false nothing changed and no turn passed.
export function act(s, action) {
  if (s.over) return { ok: false, reason: "Run over", events: [] };
  const h = s.hero,
    ev = [];
  // ---- validate (free if invalid)
  let targets = null;
  if (action.type === "move") {
    const d = DIRS[action.dir];
    if (blocked(s, h.x + d.dx, h.y + d.dy))
      return { ok: false, reason: "Blocked", events: [{ type: "bump", dir: action.dir }] };
  } else if (action.type === "skill") {
    targets = canUse(s, action.id);
    if (!targets.ok) return { ok: false, reason: targets.reason, events: [] };
  } else if (action.type !== "wait") return { ok: false, reason: "Unknown action", events: [] };

  // ---- outside combat: moves are free and nothing else happens
  if (!s.combat) {
    if (action.type === "move") {
      const d = DIRS[action.dir];
      h.x += d.dx;
      h.y += d.dy;
      ev.push({ type: "heroMove", x: h.x, y: h.y });
      ev.push(...pickupKey(s), ...useShrine(s));
      ev.push(...checkRoomEntry(s));
    }
    return { ok: true, events: ev };
  }

  s.turn++;
  s.roomTurns = (s.roomTurns ?? 0) + 1;
  h.block = 0; // Block lasts until the start of the hero's next action
  // ---- hero action
  if (action.type === "move") {
    const d = DIRS[action.dir];
    h.x += d.dx;
    h.y += d.dy;
    ev.push({ type: "heroMove", x: h.x, y: h.y });
    ev.push(...pickupKey(s));
  } else if (action.type === "wait") {
    ev.push({ type: "heroWait" });
    log(s, "You wait");
  } else {
    const sk = SKILLS[action.id];
    ev.push({
      type: "heroSkill",
      id: action.id,
      targets: targets.enemies.map((e) => e.id),
      cells: targets.cells,
    });
    log(s, `You use ${sk.name}`);
    for (const f of sk.effects) {
      if (f.op === "damage")
        for (const e of targets.enemies) {
          const n = skillDamage(s, action.id, e);
          if (e.chill > 0) {
            e.chill = 0;
            ev.push({ type: "chillConsumed", id: e.id });
          }
          damageEnemy(s, e, n, sk.element, ev);
        }
      if (f.op === "block") {
        h.block += f.amount;
        ev.push({ type: "heroBlock", amount: f.amount });
      }
      if (f.op === "status")
        for (const e of targets.enemies) if (e.hp > 0) applyStatus(s, e, f.status, ev);
      if (f.op === "removeStatus") for (const e of targets.enemies) e[f.status] = 0;
      if (f.op === "push")
        for (const e of targets.enemies) {
          if (e.hp <= 0) continue;
          const d = DIRS[h.facing];
          const nx = e.x + d.dx,
            ny = e.y + d.dy;
          if (!blocked(s, nx, ny)) {
            e.x = nx;
            e.y = ny;
            ev.push({ type: "enemyPushed", id: e.id, x: nx, y: ny });
          }
        }
      if (f.op === "chillAdjacent")
        for (const d of DIRS) {
          const e = enemyAt(s, h.x + d.dx, h.y + d.dy);
          if (e) applyStatus(s, e, "chill", ev);
        }
    }
    h.cooldowns[action.id] = sk.cooldown + 1; // +1 because the tick below runs this same turn
  }
  cleanupDead(s, ev);

  // ---- enemy phase: each surviving enemy executes its announced intent, in id order
  for (const e of living(s).sort((a, b) => a.id - b.id)) {
    const it = e.intent;
    if (!it) continue;
    if (it.kind === "move") {
      // Announced as "Moves"; the step is re-planned toward the hero's current cell,
      // otherwise a hero walking along a wall is trailed diagonally forever (found by the sim bot).
      const goal = moveGoal(s, e);
      let moved = false;
      for (let k = 0; k < (ENEMIES[e.type].speed ?? 1); k++) {
        const step = goal(e) ? null : bfsStep(s, e, goal);
        if (!step || blocked(s, step.x, step.y)) break;
        e.facing = dirTo(e, step);
        e.x = step.x;
        e.y = step.y;
        moved = true;
        ev.push({ type: "enemyMove", id: e.id, x: e.x, y: e.y, step: k });
      }
      if (!moved) ev.push({ type: "enemyWait", id: e.id });
    } else if (it.kind === "attack" || it.kind === "cleave") {
      ev.push({ type: "enemyAttack", id: e.id, cells: it.cells });
      if (it.cells.some((c) => c.x === h.x && c.y === h.y)) heroHit(s, it.damage, e, ev);
      else {
        ev.push({ type: "enemyMiss", id: e.id });
        log(s, `${e.name} misses`);
      }
      e.phase = "ready";
    } else if (it.kind === "shoot") {
      const r = ray(s, e, DIRS[it.dir], ENEMIES.archer.range, { stopAtHero: true });
      ev.push({ type: "enemyAttack", id: e.id, cells: r.cells, projectile: true });
      if (r.hit === "hero") heroHit(s, it.damage, e, ev);
      else {
        ev.push({ type: "enemyMiss", id: e.id });
        log(s, `${e.name}'s shot ${r.hit ? "hits " + r.hit.name + "'s back" : "misses"}`);
      }
    } else if (it.kind === "windup") {
      e.phase = "windup";
      ev.push({ type: "enemyWindup", id: e.id });
    }
    if (h.hp <= 0) break;
  }

  // ---- status ticks (end of enemy phase)
  for (const e of living(s)) {
    if (e.burn > 0) {
      damageEnemy(s, e, RULES.burnDamage + (h.relic === "ash" ? 1 : 0), "burn", ev);
      e.burn--;
    }
    if (e.chill > 0) e.chill--;
  }
  cleanupDead(s, ev);

  // ---- Dread: from enrage level 2 the room drains 1 HP per turn (an undodgeable clock)
  if (enrage(s) >= RULES.dreadFrom && living(s).length) {
    h.hp = Math.max(0, h.hp - 1);
    ev.push({ type: "heroHit", amount: 1, blocked: 0, source: "dread" });
    if (s.roomTurns === RULES.enrageAfter + 1 + RULES.enrageEvery * (RULES.dreadFrom - 1))
      log(s, "Dread seeps in: you lose 1 HP each turn until the room is clear");
  }

  // ---- cooldowns tick
  for (const id of Object.keys(h.cooldowns)) if (h.cooldowns[id] > 0) h.cooldowns[id]--;

  // ---- outcomes
  if (h.hp <= 0) {
    s.over = "dead";
    s.combat = false;
    ev.push({ type: "heroDeath" });
    log(s, "You die");
    return { ok: true, events: ev };
  }
  if (!living(s).length) {
    s.combat = false;
    s.doorsLocked = false;
    s.cleared.push(s.room.id);
    ev.push({ type: "roomClear", room: s.room.id });
    log(s, `Room ${s.room.id} cleared`);
    if (s.cleared.length === s.rooms.length) {
      s.over = "won";
      ev.push({ type: "victory" });
    }
    s.enemies = [];
    return { ok: true, events: ev };
  }
  // ---- next intents
  if (enrage(s) > 0 && (s.roomTurns - RULES.enrageAfter - 1) % RULES.enrageEvery === 0) {
    log(s, `The enemies grow restless: +${enrage(s)} damage`);
    ev.push({ type: "enrage", level: enrage(s) });
  }
  for (const e of living(s).sort((a, b) => a.id - b.id)) {
    if (e.phase === "windup" && e.intent?.kind !== "windup") e.phase = "ready";
    publishIntent(s, e);
  }
  return { ok: true, events: ev };
}

function useShrine(s) {
  const h = s.hero,
    k = `${h.x},${h.y}`;
  if (tile(s.map, h.x, h.y) !== "H") return [];
  s.usedShrines ??= [];
  if (s.usedShrines.includes(k)) return [];
  s.usedShrines.push(k);
  const before = h.hp;
  h.hp = Math.min(h.maxHp, h.hp + RULES.shrineHeal);
  log(s, `The shrine's cold light mends you: +${h.hp - before} HP`);
  return [{ type: "shrine", amount: h.hp - before }];
}

function pickupKey(s) {
  if (s.hero.key || tile(s.map, s.hero.x, s.hero.y) !== "K") return [];
  s.hero.key = true;
  log(s, "You take the Iron Key. Somewhere a gate can now be opened.");
  return [{ type: "keyPickup", x: s.hero.x, y: s.hero.y }];
}

// Turning is free and never touches the rules state except facing.
export function turn(s, delta) {
  s.hero.facing = (s.hero.facing + delta + 4) % 4;
}

// Cells the hero should worry about now (for floor markers and the minimap).
export function threatCells(s) {
  const out = [];
  for (const e of living(s)) {
    const it = e.intent;
    if (!it) continue;
    if (it.kind === "attack" || it.kind === "cleave" || it.kind === "shoot")
      for (const c of it.cells) out.push({ ...c, id: e.id, damage: it.damage, kind: it.kind });
    if (it.kind === "windup")
      out.push({
        x: e.x + DIRS[e.facing].dx,
        y: e.y + DIRS[e.facing].dy,
        id: e.id,
        kind: "windup",
      });
  }
  return out;
}

export function intentText(e) {
  const it = e.intent;
  if (!it) return "";
  return (
    {
      move: "Moves",
      wait: "Waits",
      attack: `Attacks ${it.damage}`,
      shoot: `Shoots ${it.damage}`,
      windup: "Winds up!",
      cleave: `Cleaves ${it.damage}`,
    }[it.kind] ?? it.kind
  );
}

// ---------------- rewards and meta ---------------------------------------------------------

// Three offers after rooms 1-3: one skill, one upgrade, one relic (heal as fallback).
export function rewardOffers(s) {
  const r = rng(s.seed * 31 + s.cleared.length);
  const offers = [];
  const learnable = Object.keys(SKILLS).filter(
    (id) => !s.hero.skills.includes(id) && id !== "strike" && id !== "guard",
  );
  if (learnable.length) {
    const id = learnable[Math.floor(r() * learnable.length)];
    offers.push({ kind: "skill", id, text: `Learn ${SKILLS[id].name}: ${SKILLS[id].text}` });
  } else offers.push({ kind: "heal", text: `Heal ${RULES.healFallback}` });
  const upgradable = s.hero.skills.filter((id) => DAMAGING.includes(id));
  const up = upgradable[Math.floor(r() * upgradable.length)];
  offers.push(
    up
      ? { kind: "upgrade", id: up, text: `${SKILLS[up].name} +2 damage` }
      : { kind: "heal", text: `Heal ${RULES.healFallback}` },
  );
  const relics = Object.keys(RELICS).filter((k) => k !== s.hero.relic);
  const rel = relics[Math.floor(r() * relics.length)];
  offers.push({
    kind: "relic",
    id: rel,
    text: `${RELICS[rel].name}: ${RELICS[rel].text}${s.hero.relic ? ` (replaces ${RELICS[s.hero.relic].name})` : ""}`,
  });
  return offers;
}

// slot: for a new skill, which of the two spell slots (2 or 3) to replace.
export function takeReward(s, offer, slot = 3) {
  const h = s.hero;
  if (offer.kind === "skill") {
    const old = h.skills[slot];
    h.skills[slot] = offer.id;
    log(s, `Learned ${SKILLS[offer.id].name} (replaced ${SKILLS[old].name})`);
  }
  if (offer.kind === "upgrade") {
    h.upgrades[offer.id] = (h.upgrades[offer.id] ?? 0) + 2;
    log(s, `${SKILLS[offer.id].name} upgraded`);
  }
  if (offer.kind === "relic") {
    h.relic = offer.id;
    log(s, `Took ${RELICS[offer.id].name}`);
  }
  if (offer.kind === "heal") {
    h.hp = Math.min(h.maxHp, h.hp + RULES.healFallback);
  }
}

// Meta progression: tiny, explicit, saved by the caller.
export function updateMeta(meta, s) {
  const m = { bestRoom: 0, discovered: [], unlocked: ["ember"], runs: 0, wins: 0, ...meta };
  m.runs += s.over ? 1 : 0;
  if (s.over === "won") m.wins++;
  m.bestRoom = Math.max(m.bestRoom, s.cleared.length);
  for (const id of s.hero.skills) if (!m.discovered.includes(id)) m.discovered.push(id);
  if (s.cleared.length >= 2 && !m.unlocked.includes("frost")) m.unlocked.push("frost");
  return m;
}
