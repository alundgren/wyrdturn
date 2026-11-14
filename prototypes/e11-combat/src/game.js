import * as THREE from 'three';
import * as C from './combat.js';
import { makeArchetype, animate } from './monster.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { autorigBiped, rigidMonster } from './autorig.js';

// ?monsters=code uses only code-generated monsters; default mixes in auto-rigged TRELLIS meshes.
const MON_MODE = new URLSearchParams(location.search).get('monsters') ?? 'trellis';
const TRELLIS_FOR = { ghoul: 'ghoul-px', brute: 'skeleton', spider: 'spider' };
const RIGID = new Set(['spider']); // no humanoid rig: whole-body motion
async function loadGlbMesh(name, lift = 1.8) {
  const g = await new GLTFLoader().loadAsync(`trellis/${name}.glb`);
  g.scene.updateMatrixWorld(true);
  let mesh = null; g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  mesh.material.color.multiplyScalar(lift); // TRELLIS albedo bakes dark
  return mesh;
}
import sliceRooms from './rooms.json';

// Game layer for the Ember Scout slice: input, enemy visuals (E10 code monsters),
// intents/threat markers, HUD, rewards and meta screens. Rules live in combat.js.
//
// w = world handles from main.js: { scene, camera, TILE, mapText, ctrl, pose, yawOf, start, isAnimating }

const META_KEY = 'ember-scout-meta-v1';
const DESCENT_KEY = 'ember-scout-descent';
const FLOORS = 3;
const ssGet = () => { try { return JSON.parse(sessionStorage.getItem(DESCENT_KEY) ?? 'null'); } catch { return null; } };
const ssSet = (v) => { try { v ? sessionStorage.setItem(DESCENT_KEY, JSON.stringify(v)) : sessionStorage.removeItem(DESCENT_KEY); } catch { /* private mode */ } };
// Moving to another floor reloads the page with a new ?gen seed; the run state rides along in sessionStorage.
function goToFloor(floor, carry) {
  ssSet(carry);
  const p = new URLSearchParams(location.search);
  p.set('gen', String(((carry?.seed ?? Date.now()) * 7919 + floor * 104729) % 1000003)); p.set('floor', String(floor)); p.delete('at');
  location.search = p.toString();
}
const loadMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) ?? '{}'); } catch { return {}; } };
const saveMeta = (m) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* private mode */ } };

const ELEMENT_COLOR = { fire: '#ff8a3a', frost: '#7ec8ff', physical: '#e8e0d0', burn: '#ff6a2a', none: '#d8d0b0' };

export async function initGame(w) {
  const { scene, camera, TILE } = w;
  const map = C.parseMap(w.mapText);
  const rooms = w.rooms ?? sliceRooms;
  const ui = buildUi();
  const mats = await monsterMaterials();
  const trellis = {};
  if (MON_MODE === 'trellis') for (const f of new Set(Object.values(TRELLIS_FOR))) { try { trellis[f] = await loadGlbMesh(f); } catch (e) { console.warn('trellis load failed', f, e); } }
  const makeMonster = (arch, seed) => {
    const src = trellis[TRELLIS_FOR[arch]];
    if (!src) return makeArchetype(arch, seed, mats);
    if (RIGID.has(arch)) { const c = src.clone(); c.applyMatrix4(src.matrixWorld); c.castShadow = true; return rigidMonster(c); }
    return autorigBiped(src);
  };
  let run = null, meta = { bestRoom: 0, discovered: [], unlocked: ['ember'], runs: 0, wins: 0, ...loadMeta() };
  let busyUntil = 0, mode = 'start', pendingReward = null;
  const visuals = new Map(); // enemy id -> { m, anim, t0, pos, target, dying }
  const fx = []; // short-lived effects { obj, until, update(k) }
  const timeline = []; // { at, fn }

  // ---------- first-person sword and casting hand ----------
  // Built in code (iron blade, wood grip) and parented to the camera, so it moves with the view.
  const viewModel = new THREE.Group();
  // cool grey with a little self-light so it reads as steel, not wood, under the warm lantern
const steel = new THREE.MeshStandardMaterial({ color: '#7d848c', roughness: 0.4, metalness: 0.35, emissive: '#1a2028' });
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.8 });
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.012), steel); blade.position.y = 0.42;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), steel); tip.position.y = 0.78; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.35;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.04), steel); guard.position.y = 0.1;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.16, 8), wood);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), steel); pommel.position.y = -0.09;
  sword.add(blade, tip, guard, grip, pommel);
  sword.traverse((o) => { if (o.isMesh) o.renderOrder = 10; });
  sword.scale.setScalar(0.62);
  const swordRest = { pos: new THREE.Vector3(0.3, -0.38, -0.55), rot: new THREE.Euler(-0.55, -0.3, -0.6) };
  sword.position.copy(swordRest.pos); sword.rotation.copy(swordRest.rot);
  const castLight = new THREE.PointLight('#ffffff', 0, 3, 2); castLight.position.set(-0.26, -0.16, -0.6);
  const castOrb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  castOrb.position.copy(castLight.position);
  viewModel.add(sword, castLight, castOrb);
  camera.add(viewModel);
  let swing = null; // { kind: 'slash'|'cast'|'block', t0, color }
  function animateViewModel(now) {
    const clock = window.__freeze ?? now; // screenshot checks freeze the clock
    const t = swing ? (clock - swing.t0) / 1000 : 9;
    const bob = Math.sin(now * 0.002) * 0.006;
    sword.position.copy(swordRest.pos).add(new THREE.Vector3(0, bob, 0));
    sword.rotation.copy(swordRest.rot);
    castLight.intensity = 0; castOrb.material.opacity = 0;
    if (!swing || t > 0.6) { swing = null; return; }
    if (swing.kind === 'slash') { // wind back, then sweep across to the lower left
      const a = Math.min(1, t / 0.12), b = Math.max(0, Math.min(1, (t - 0.12) / 0.16)), c = Math.max(0, (t - 0.35) / 0.25);
      sword.rotation.z = swordRest.rot.z - 0.6 * a + 1.9 * b - 1.3 * c;
      sword.rotation.x = swordRest.rot.x - 0.5 * a + 0.9 * b - 0.4 * c;
      sword.position.x = swordRest.pos.x + 0.05 * a - 0.35 * b + 0.3 * c;
      sword.position.z = swordRest.pos.z - 0.15 * b + 0.15 * c;
    } else if (swing.kind === 'block') { // raise the blade across the view
      const k = Math.sin(Math.min(1, t / 0.5) * Math.PI);
      sword.rotation.z = swordRest.rot.z + 1.2 * k; sword.position.x = swordRest.pos.x - 0.22 * k; sword.position.y = swordRest.pos.y + 0.12 * k;
    } else { // cast: glowing orb in the off hand
      const k = Math.sin(Math.min(1, t / 0.45) * Math.PI);
      castLight.color.set(swing.color); castLight.intensity = 25 * k;
      castOrb.material.color.set(swing.color); castOrb.material.opacity = 0.9 * k;
      castOrb.scale.setScalar(0.5 + 0.7 * k);
      sword.position.y = swordRest.pos.y - 0.05 * k;
    }
  }

  // ---------- threat markers and door bars ----------
  const markGeo = new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92).rotateX(-Math.PI / 2);
  const markMats = {
    attack: new THREE.MeshBasicMaterial({ color: '#ff3020', transparent: true, opacity: 0.38, depthWrite: false }),
    windup: new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.32, depthWrite: false }),
  };
  const marks = new THREE.Group();
  scene.add(marks);
  const barMat = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.5, metalness: 0.7 });
  const bars = new THREE.Group();
  scene.add(bars);
  // lock and key visuals: gilded gates on 'L' tiles, a glowing key on the 'K' tile
  const gates = new THREE.Group(), keyObj = new THREE.Group();
  scene.add(gates, keyObj);
  const gateMat = new THREE.MeshStandardMaterial({ color: '#b08a3a', roughness: 0.35, metalness: 0.9 });
  const keyMat = new THREE.MeshStandardMaterial({ color: '#e0b850', emissive: '#6a4a10', roughness: 0.3, metalness: 1 });
  // Room dressing with TRELLIS props: a lit brazier in a corner of each combat room, bone piles,
  // a chest next to the key. Corners only, so props never block the fighting tiles' sightlines much.
  const dressing = new THREE.Group(); scene.add(dressing);
  const props = {};
  for (const f of ['brazier', 'bones', 'chest']) { try { props[f] = await loadGlbMesh(f, 1.6); } catch { /* optional */ } }
  const propSolid = new Set();
  function place(name, x, z, rot = 0) {
    if (!props[name]) return null;
    const o = props[name].clone(); o.applyMatrix4(props[name].matrixWorld);
    const g = new THREE.Group(); g.add(o); g.position.set(x, 0, z); g.rotation.y = rot;
    o.castShadow = true; o.receiveShadow = true;
    dressing.add(g); return g;
  }
  function buildDressing() {
    dressing.clear(); propSolid.clear(); dressing.userData.lights = 0;
    rooms.forEach((r, i) => {
      // brazier in a corner tile that is not next to a door
      const corners = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]];
      const doors = r.doors ?? [];
      const free = corners.filter(([x, y]) => C.floorAt(map, x, y) && map.tiles[y][x] === '.' && !doors.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) < 2) && !r.enemies.some((e) => e.x === x && e.y === y));
      const [bx, by] = free[i % Math.max(1, free.length)] ?? [];
      if (bx !== undefined) {
        const b = place('brazier', bx * TILE + (bx === r.x0 ? -0.45 : 0.45), by * TILE + (by === r.y0 ? -0.45 : 0.45));
        if (b) { const l = (dressing.userData.lights = (dressing.userData.lights ?? 0) + 1) <= 4 ? new THREE.PointLight('#ff9a40', 6, 9, 1) : new THREE.Object3D(); /* every point light costs every pixel: cap at 4 */ l.position.y = 1.4; b.add(l); const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb050').multiplyScalar(3) })); f.position.y = 1.3; b.add(f); b.userData.flame = f; }
      }
      const other = free.filter(([x, y]) => x !== bx || y !== by);
      if (other.length && (i % 2 === 0)) { const [x, y] = other[0]; place('bones', x * TILE + (x === r.x0 ? -0.4 : 0.4), y * TILE + (y === r.y0 ? -0.4 : 0.4), i); }
    });
    map.tiles.forEach((row, y) => row.forEach((c, x) => {
      if (c === 'K') place('chest', x * TILE + 0.55, y * TILE - 0.55, -0.6);
      if (c === 'H') { // rest shrine: brazier with a cold healing flame on the tile itself
        const b = place('brazier', x * TILE, y * TILE);
        if (b) {
          const l = new THREE.PointLight('#60ffd0', 7, 10, 1); l.position.y = 1.5; b.add(l);
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#80ffe0').multiplyScalar(3) }));
          f.position.y = 1.35; b.add(f); b.userData.flame = f; b.userData.shrine = `${x},${y}`;
        }
      }
    }));
  }
  function buildLockAndKey() {
    gates.clear(); keyObj.clear();
    map.tiles.forEach((row, y) => row.forEach((c, x) => {
      if (c === 'L') {
        const ew = C.floorAt(map, x - 1, y) || C.floorAt(map, x + 1, y); // corridor runs east-west: bars across x
        const g = new THREE.Group();
        for (let i = -3; i <= 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), gateMat); b.position.set(ew ? 0 : i * 0.26, 1.5, ew ? i * 0.26 : 0); g.add(b); }
        const cross = new THREE.Mesh(new THREE.BoxGeometry(ew ? 0.08 : 1.9, 0.12, ew ? 1.9 : 0.08), gateMat); cross.position.y = 1.2; g.add(cross);
        g.position.set(x * TILE, 0, y * TILE);
        gates.add(g);
      }
      if (c === 'K') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 16), keyMat);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.32, 0.035), keyMat); shaft.position.y = -0.24;
        const bit = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.035), keyMat); bit.position.set(0.05, -0.36, 0);
        const k = new THREE.Group(); k.add(ring, shaft, bit);
        const glow = new THREE.PointLight('#ffd060', 6, 4, 2); glow.position.y = 0.2; k.add(glow);
        k.position.set(x * TILE, 1.1, y * TILE);
        k.scale.setScalar(2); // readable from a tile away (at 1x it read as a torch flame)
        keyObj.add(k);
      }
    }));
  }

  function syncMarks() {
    marks.clear();
    if (!run?.combat) return;
    for (const c of C.threatCells(run)) {
      const m = new THREE.Mesh(markGeo, c.kind === 'windup' ? markMats.windup : markMats.attack);
      m.position.set(c.x * TILE, 0.04, c.y * TILE);
      m.renderOrder = 2;
      marks.add(m);
    }
  }
  function syncBars() {
    bars.clear();
    if (!run?.doorsLocked) return;
    const r = run.room;
    // doors = floor cells on the ring just outside the room (generated rooms also list them)
    const doors = r.doors ?? [];
    if (!doors.length) {
      for (let x = r.x0 - 1; x <= r.x1 + 1; x++) for (let y = r.y0 - 1; y <= r.y1 + 1; y++) {
        const ring = x === r.x0 - 1 || x === r.x1 + 1 || y === r.y0 - 1 || y === r.y1 + 1;
        const corner = (x === r.x0 - 1 || x === r.x1 + 1) && (y === r.y0 - 1 || y === r.y1 + 1);
        if (ring && !corner && C.floorAt(map, x, y)) doors.push({ x, y });
      }
    }
    for (const d of doors) {
      const alongX = d.y === r.y0 - 1 || d.y === r.y1 + 1; // door in a north/south wall: bars run along x
      for (let i = -3; i <= 3; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 6), barMat);
        b.position.set(d.x * TILE + (alongX ? i * 0.26 : 0), 1.5, d.y * TILE + (alongX ? 0 : i * 0.26));
        bars.add(b);
      }
    }
  }

  // ---------- enemies ----------
  function spawnVisuals() {
    for (const v of visuals.values()) scene.remove(v.m.group);
    visuals.clear();
    for (const e of run.enemies) {
      const m = makeMonster(C.ENEMIES[e.type].monster, e.id * 13 + run.seed);
      const pos = new THREE.Vector3(e.x * TILE, 0, e.y * TILE);
      m.group.position.copy(pos);
      scene.add(m.group);
      visuals.set(e.id, { m, anim: 'idle', t0: 0, pos: pos.clone(), target: pos.clone(), moveT0: 0, yaw: facingYaw(e.facing), dying: false });
      ui.addLabel(e.id);
    }
  }
  const facingYaw = (f) => Math.atan2(C.DIRS[f].dx, C.DIRS[f].dy);
  function setAnim(id, anim, now) { const v = visuals.get(id); if (v) { v.anim = anim; v.t0 = now; } }

  // ---------- effects ----------
  function flash(pos, color, now, ms = 260, intensity = 30) {
    const l = new THREE.PointLight(color, intensity, 6, 2);
    l.position.copy(pos).setY(1.2);
    scene.add(l);
    fx.push({ obj: l, t0: now, until: now + ms, update: (k) => { l.intensity = intensity * (1 - k); } });
  }
  function projectile(from, to, color, now, ms = 260) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }));
    const l = new THREE.PointLight(color, 12, 5, 2);
    s.add(l);
    scene.add(s);
    fx.push({ obj: s, t0: now, until: now + ms, update: (k) => s.position.lerpVectors(from, to, k) });
  }
  function floatText(x, y, z, text, color, now) {
    ui.floatText(new THREE.Vector3(x, y, z), text, color, now);
  }
  function at(delay, fn) { timeline.push({ at: performance.now() + delay, fn }); }

  // ---------- play back the events of one action ----------
  function play(events) {
    let t = 0;
    const heroPos = () => new THREE.Vector3(run.hero.x * TILE, 1.4, run.hero.y * TILE);
    const enemyPos = (id) => { const v = visuals.get(id); return v ? v.target.clone().setY(1.2) : heroPos(); };
    let enemyPhaseStarted = false;
    for (const ev of events) {
      switch (ev.type) {
        case 'heroMove': {
          w.ctrl.state = { ...w.ctrl.state, x: ev.x, y: ev.y };
          w.start({ kind: 'move', state: w.ctrl.state });
          t = Math.max(t, 200);
          break;
        }
        case 'heroSkill': {
          const sk = C.SKILLS[ev.id];
          swing = { kind: sk.target === 'self' ? (sk.element === 'frost' ? 'cast' : 'block') : sk.target === 'adjacent' || sk.target === 'arc' ? 'slash' : 'cast', t0: performance.now(), color: ELEMENT_COLOR[sk.element] };
          const col = ELEMENT_COLOR[sk.element];
          at(t, () => {
            const now = performance.now();
            const from = new THREE.Vector3().copy(camera.position).add(new THREE.Vector3(0, -0.3, 0).applyQuaternion(camera.quaternion)).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.5));
            if (sk.target === 'ray' || sk.target === 'burning') for (const id of ev.targets) projectile(from, enemyPos(id), col, now);
            else if (sk.target === 'self') flash(heroPos(), col, now, 400, 25);
            else for (const id of ev.targets) flash(enemyPos(id), col, now);
          });
          t += sk.target === 'ray' || sk.target === 'burning' ? 260 : 120;
          break;
        }
        case 'enemyHit': {
          const id = ev.id, col = ELEMENT_COLOR[ev.element] ?? '#fff';
          at(t, () => { const now = performance.now(); setAnim(id, 'hit', now); const p = enemyPos(id); floatText(p.x, 2.0, p.z, `-${ev.amount}`, col, now); flash(p, col, now, 200, 15); });
          break;
        }
        case 'chillConsumed': at(t, () => { const p = enemyPos(ev.id); floatText(p.x, 2.4, p.z, 'Shatter +3', '#bfe6ff', performance.now()); }); break;
        case 'status': at(t, () => { const p = enemyPos(ev.id); floatText(p.x, 2.6, p.z, ev.status === 'burn' ? 'Burn' : 'Chill', ev.status === 'burn' ? '#ffa060' : '#a8dcff', performance.now()); }); break;
        case 'heroBlock': at(t, () => ui.toast(`+${ev.amount} Block`)); break;
        case 'enemyPushed': at(t, () => { const v = visuals.get(ev.id); if (v) { v.pos.copy(v.target); v.target.set(ev.x * TILE, 0, ev.y * TILE); v.moveT0 = performance.now(); } }); break;
        case 'enemyDeath': at(t + 120, () => { const v = visuals.get(ev.id); if (v) { v.dying = true; setAnim(ev.id, 'death', performance.now()); } ui.removeLabel(ev.id); }); break;
        case 'heroWait': t = Math.max(t, 80); break;
        case 'enemyMove': case 'enemyAttack': case 'enemyWindup': case 'enemyWait':
          if (!enemyPhaseStarted) { enemyPhaseStarted = true; t += 250; }
          if (ev.type === 'enemyMove') {
            const id = ev.id;
            const stepDelay = (ev.step ?? 0) * 300;
            at(t + stepDelay, () => { const v = visuals.get(id); if (v) { v.pos.copy(v.target); v.target.set(ev.x * TILE, 0, ev.y * TILE); v.moveT0 = performance.now(); setAnim(id, 'walk', performance.now()); } });
            at(t + stepDelay + 330, () => setAnim(id, 'idle', performance.now()));
          }
          if (ev.type === 'enemyAttack') {
            const id = ev.id, e = run.enemies.find((x) => x.id === id);
            at(t, () => {
              const now = performance.now();
              setAnim(id, 'attack', now);
              if (ev.projectile) { const p = enemyPos(id); const end = ev.cells.length ? ev.cells[ev.cells.length - 1] : { x: e.x, y: e.y }; projectile(p, new THREE.Vector3(end.x * TILE, 1.3, end.y * TILE), '#d0ffa0', now + 300, 300); }
            });
            t += 520;
          }
          if (ev.type === 'enemyWindup') at(t, () => { const p = enemyPos(ev.id); floatText(p.x, 2.6, p.z, 'Winding up!', '#ffc040', performance.now()); });
          break;
        case 'heroHit': at(t, () => { ui.hurt(ev.amount, ev.blocked); w.shake(ev.amount); }); break;
        case 'enemyMiss': at(t, () => { const p = enemyPos(ev.id); floatText(p.x, 2.2, p.z, 'Miss', '#cccccc', performance.now()); }); break;
        case 'shrine': at(0, () => { ui.toast(`The shrine mends you: +${ev.amount} HP`); for (const b of dressing.children) if (b.userData.shrine) { b.userData.flame.visible = false; b.children.find((c) => c.isPointLight).intensity = 3; } }); break;
        case 'keyPickup': at(0, () => { keyObj.clear(); ui.toast('You take the Iron Key. The gilded gate can open now.'); gates.children.forEach((g) => { g.userData.rise = performance.now(); }); }); break;
        case 'enrage': at(t, () => ui.toast(`The enemies grow restless: +${ev.level} damage`)); break;
        case 'combatStart': at(0, () => { spawnVisuals(); ui.toast(`Room ${ev.room}: the doors slam shut`); }); break;
        case 'roomClear': at(t + 500, () => { ui.toast(`Room ${ev.room} cleared`); }); break;
        default: break;
      }
    }
    busyUntil = performance.now() + t + 200;
    at(t + 150, () => { syncMarks(); syncBars(); ui.refresh(); afterTurn(events); });
  }

  function afterTurn(events) {
    if (events.some((e) => e.type === 'heroDeath')) return endRun();
    if (events.some((e) => e.type === 'victory')) {
      if (w.floor >= 1 && w.floor < FLOORS) {
        mode = 'descend';
        ui.showDescend(w.floor, run);
        return;
      }
      return endRun();
    }
    if (events.some((e) => e.type === 'roomClear')) {
      meta = C.updateMeta({ ...meta, runs: meta.runs - 0 }, { ...run, over: null });
      saveMeta(meta);
      if (run.cleared.length < run.rooms.length) {
        pendingReward = C.rewardOffers(run);
        mode = 'reward';
        ui.showReward(pendingReward, run);
      }
    }
  }

  function endRun() {
    ssSet(null);
    if (w.floor >= 1) { run.floor = w.floor; if (run.over === 'won' && w.floor === FLOORS) run.descentWon = true; }
    meta = C.updateMeta(meta, run);
    meta.bestFloor = Math.max(meta.bestFloor ?? 0, w.floor >= 1 ? w.floor - (run.over === 'won' ? 0 : 1) : 0);
    saveMeta(meta);
    mode = 'over';
    ui.showEnd(run, meta);
  }

  function newGame(preset, seed = (Date.now() % 100000) | 0) {
    run = C.newRun({ map, rooms, preset, seed });
    mode = 'play';
    for (const v of visuals.values()) scene.remove(v.m.group);
    visuals.clear();
    ui.clearLabels();
    w.ctrl.state = { x: run.hero.x, y: run.hero.y, facing: run.hero.facing };
    w.pose.x = run.hero.x * TILE; w.pose.z = run.hero.y * TILE; w.pose.yaw = w.yawOf(run.hero.facing);
    syncMarks(); syncBars(); buildLockAndKey(); buildDressing();
    ui.hideModals();
    ui.refresh();
    ui.toast(`${C.PRESETS[preset].name}: walk east. Q/E turn, W/A/S/D move, 1-4 skills, Space wait`);
  }

  // ---------- input ----------
  const REL = { KeyW: 0, ArrowUp: 0, KeyD: 1, KeyS: 2, ArrowDown: 2, KeyA: 3 };
  const TURN = { KeyQ: -1, ArrowLeft: -1, KeyE: 1, ArrowRight: 1 };
  let queuedKey = null, queueTimer = 0;
  function flushQueued() {
    queueTimer = 0;
    if (!queuedKey || mode !== 'play') { queuedKey = null; return; }
    if (performance.now() < busyUntil || w.isAnimating()) { queueTimer = requestAnimationFrame(flushQueued); return; }
    const code = queuedKey; queuedKey = null;
    onKey({ code });
  }
  function onKey(e) {
    if (e.repeat) return true;
    if (mode === 'start') {
      if (e.code === 'Digit1') ui.onStart('ember');
      if (e.code === 'Digit2' && meta.unlocked?.includes('frost')) ui.onStart('frost');
      if (e.code === 'KeyD') { descentChoice = !descentChoice; ui.showStart(meta, descentChoice); }
      return true;
    }
    if (mode === 'descend') { if (e.code === 'Enter' || e.code === 'Space') descend(); return true; }
    if (mode === 'over') { if (e.code === 'KeyR' || e.code === 'Enter') { mode = 'start'; ui.showStart(meta); } return true; }
    if (mode === 'reward') {
      const i = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
      if (i !== undefined) pickReward(i);
      return true;
    }
    if (performance.now() < busyUntil || w.isAnimating()) {
      // Remember the newest key and run it when the current step ends,
      // instead of dropping it (a quick Q/E after a move used to get lost).
      const isPlayKey = TURN[e.code] !== undefined || REL[e.code] !== undefined || e.code === 'Space' || /^Digit[1-4]$/.test(e.code);
      if (isPlayKey) { queuedKey = e.code; if (!queueTimer) queueTimer = requestAnimationFrame(flushQueued); }
      return isPlayKey;
    }
    if (TURN[e.code] !== undefined) {
      C.turn(run, TURN[e.code]);
      w.ctrl.state = { ...w.ctrl.state, facing: run.hero.facing };
      w.start({ kind: 'turn', action: TURN[e.code] < 0 ? 'turnLeft' : 'turnRight' });
      setTimeout(() => ui.refresh(), 160);
      return true;
    }
    let action = null;
    if (REL[e.code] !== undefined) action = { type: 'move', dir: (run.hero.facing + REL[e.code]) % 4 };
    const slot = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
    if (slot !== undefined) action = { type: 'skill', id: run.hero.skills[slot] };
    if (e.code === 'Space') action = run.combat ? { type: 'wait' } : null;
    if (!action) return false;
    e.preventDefault?.();
    doAction(action);
    return true;
  }
  function doAction(action) {
    const r = C.act(run, action);
    if (!r.ok) {
      if (r.events[0]?.type === 'bump') w.start({ kind: 'bump', dir: C.DIRS[r.events[0].dir] });
      ui.toast(r.reason);
      return r;
    }
    play(r.events);
    ui.refresh();
    return r;
  }
  function pickReward(i, slot) {
    const offer = pendingReward?.[i];
    if (!offer) return;
    if (offer.kind === 'skill' && slot === undefined) { ui.askSlot(offer, run, (s) => pickReward(i, s)); return; }
    C.takeReward(run, offer, slot ?? 3);
    pendingReward = null;
    mode = 'play';
    ui.hideModals();
    ui.refresh();
  }
  ui.onReward = pickReward;
  let descentChoice = !!w.genSeed || true;
  function descend() {
    const h = run.hero;
    goToFloor(w.floor + 1, { preset: run.preset, seed: run.seed, hero: { hp: h.hp, maxHp: h.maxHp, skills: h.skills, upgrades: h.upgrades, relic: h.relic }, cleared: (ssGet()?.cleared ?? 0) + run.cleared.length, turns: (ssGet()?.turns ?? 0) + run.turn });
  }
  ui.onDescend = descend;
  ui.onStart = (p) => {
    if (descentChoice && w.floor !== 1) { goToFloor(1, { preset: p, seed: (Date.now() % 100000) | 0, fresh: true }); return; }
    newGame(p);
  };
  ui.onRestart = () => { mode = 'start'; ui.showStart(meta); };

  // ---------- per frame ----------
  function update(now) {
    animateViewModel(now);
    while (timeline.length && timeline[0].at <= now) timeline.shift().fn();
    timeline.sort((a, b) => a.at - b.at);
    const time = now / 1000;
    for (const [id, v] of visuals) {
      const k = Math.min(1, (now - v.moveT0) / 320);
      v.m.group.position.lerpVectors(v.pos, v.target, k);
      const e = run?.enemies.find((x) => x.id === id);
      if (e) {
        // face the hero when idle, else the move/attack direction
        const tgt = Math.atan2(run.hero.x * TILE - v.m.group.position.x, run.hero.y * TILE - v.m.group.position.z);
        const want = v.anim === 'walk' ? facingYaw(e.facing) : tgt;
        let d = want - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        v.yaw += d * 0.15;
        v.m.group.rotation.y = v.yaw;
      }
      const t = (now - v.t0) / 1000;
      if ((v.anim === 'attack' && t > 1.0) || (v.anim === 'hit' && t > 0.4)) { v.anim = 'idle'; v.t0 = now; }
      animate(v.m, v.anim, (now - v.t0) / 1000, time);
      if (v.dying && t > 2.5) { scene.remove(v.m.group); visuals.delete(id); }
    }
    for (const b of dressing.children) if (b.userData.flame) b.userData.flame.scale.y = 0.85 + Math.sin(time * 9 + b.position.x) * 0.15;
    for (const k of keyObj.children) { k.rotation.y = time * 1.5; k.position.y = 1.1 + Math.sin(time * 2) * 0.06; }
    for (const g of gates.children) if (g.userData.rise) g.position.y = Math.min(2.9, (now - g.userData.rise) / 600 * 2.9);
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      const k = (now - f.t0) / (f.until - f.t0);
      if (k < 0) continue;
      if (k >= 1) { scene.remove(f.obj); fx.splice(i, 1); continue; }
      f.update(k);
    }
    if (run) ui.update(now, run, visuals, camera, TILE);
  }

  // arriving on a descent floor: resume the carried run instead of showing the start screen
  const carry = w.floor >= 1 ? ssGet() : null;
  if (carry) {
    newGame(carry.preset, carry.seed + w.floor);
    if (carry.hero) Object.assign(run.hero, { hp: carry.hero.hp, maxHp: carry.hero.maxHp, skills: carry.hero.skills, upgrades: carry.hero.upgrades, relic: carry.hero.relic });
    ui.refresh();
    ui.toast(carry.fresh ? `Descent, floor 1 of ${FLOORS}: find the key, open the gilded gate` : `Floor ${w.floor} of ${FLOORS}. The air grows colder.`);
  } else ui.showStart(meta, descentChoice);
  return {
    onKey, update,
    // self-check hooks
    debug: {
      newGame, doAction, descend: () => descend(), run: () => run, swing: (kind, t) => { swing = { kind, t0: (window.__freeze ?? performance.now()) - t * 1000, color: '#ff8a3a' }; }, mode: () => mode, pickReward, busy: () => performance.now() < busyUntil || w.isAnimating(),
      turn: (d) => onKey({ code: d < 0 ? 'KeyQ' : 'KeyE' }),
      meta: () => meta,
    },
  };
}

async function monsterMaterials() {
  const loader = new THREE.TextureLoader();
  const mats = {};
  for (const name of ['ghoul-skin', 'bone', 'chitin', 'rusty-armour', 'leather-cloth', 'scales']) {
    try {
      const base = `textures/${name}/`;
      const map = await loader.loadAsync(base + 'basecolor.webp');
      map.colorSpace = THREE.SRGBColorSpace;
      const normalMap = await loader.loadAsync(base + 'normal.webp').catch(() => null);
      for (const t of [map, normalMap]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
      mats[name] = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.85 });
    } catch { mats[name] = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.9 }); }
  }
  mats.default = mats['ghoul-skin'];
  return mats;
}

// ---------------- HUD (plain DOM) ----------------------------------------------------

function buildUi() {
  const css = `
  #ui { position: fixed; inset: 0; pointer-events: none; font: 14px/1.35 Georgia, 'Times New Roman', serif; color: #f2e8d4; }
  #ui .panel { background: rgba(24,18,14,.78); border: 1px solid rgba(220,190,140,.35); border-radius: 6px; padding: 8px 10px; box-shadow: 0 2px 10px rgba(0,0,0,.4); }
  #hero { position: absolute; left: 12px; top: 12px; width: 230px; }
  .bar { height: 10px; background: #3a2a22; border-radius: 3px; overflow: hidden; margin: 3px 0; }
  .bar > i { display: block; height: 100%; background: linear-gradient(#e05a40,#a8301e); }
  .bar.block > i { background: linear-gradient(#a8c8e8,#5a82a8); }
  #skills { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 8px; }
  .skill { width: 150px; min-height: 74px; position: relative; }
  .skill b { color: #ffd890; }
  .skill .k { position: absolute; right: 8px; top: 6px; opacity: .7; font-family: monospace; }
  .skill.cd { opacity: .45; }
  .skill.ok { border-color: rgba(255,210,120,.8); }
  .skill .pv { font-size: 12px; color: #d8cbb0; margin-top: 3px; }
  #wait { align-self: center; font-size: 12px; opacity: .8; }
  #log { position: absolute; left: 12px; bottom: 110px; width: 300px; font-size: 12px; max-height: 140px; overflow: hidden; }
  #mini { position: absolute; right: 12px; top: 12px; }
  #toast { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); font-size: 20px; text-shadow: 0 2px 6px #000; transition: opacity .4s; opacity: 0; text-align: center; }
  #warn { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); padding: 6px 14px; font-size: 18px; color: #fff; background: rgba(170,30,20,.85); border-radius: 6px; display: none; text-shadow: 0 1px 2px #000; }
  #danger { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 90px rgba(220,40,20,.55); display: none; animation: pulse 1.1s ease-in-out infinite; }
  @keyframes pulse { 50% { box-shadow: inset 0 0 50px rgba(220,40,20,.25); } }
  #hurt { position: absolute; inset: 0; box-shadow: inset 0 0 160px rgba(200,20,10,.0); transition: box-shadow .35s; }
  .lbl { position: absolute; transform: translate(-50%, -100%); text-align: center; white-space: nowrap; font-size: 13px; text-shadow: 0 1px 3px #000; }
  .lbl .hp { width: 90px; height: 6px; background: #3a2a22; margin: 2px auto; border-radius: 2px; overflow: hidden; }
  .lbl .hp > i { display: block; height: 100%; background: #d84a30; }
  .lbl .it { font-weight: bold; color: #ffcf70; }
  .lbl .it.atk { color: #ff6a50; }
  .lbl.tgt .nm { color: #fff; text-decoration: underline; }
  .ft { position: absolute; transform: translate(-50%, -50%); font: bold 22px Georgia, serif; text-shadow: 0 2px 4px #000; }
  .modal { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(760px, 92vw); pointer-events: auto; text-align: center; padding: 22px; }
  .modal h1 { margin: 0 0 6px; font-size: 30px; color: #ffd890; font-weight: normal; }
  .cards { display: flex; gap: 12px; justify-content: center; margin-top: 14px; flex-wrap: wrap; }
  .card { width: 210px; padding: 12px; cursor: pointer; text-align: left; }
  .card:hover { border-color: #ffd890; }
  .card.locked { opacity: .45; cursor: default; }
  .card small { display: block; opacity: .7; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'ui';
  root.innerHTML = `
    <div id="danger"></div>
    <div id="warn"></div>
    <div id="hurt"></div>
    <div id="hero" class="panel"></div>
    <canvas id="mini" class="panel" width="244" height="76"></canvas>
    <div id="skills"></div>
    <div id="log" class="panel"></div>
    <div id="toast"></div>
    <div id="labels"></div>
    <div id="modal"></div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);
  const labels = new Map(), floats = [];
  let toastTimer = null;
  const api = {
    onReward: null, onStart: null, onRestart: null, onDescend: null,
    toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = 0; }, 1800); },
    hurt(amount, blocked) {
      const h = $('hurt'); h.style.boxShadow = `inset 0 0 ${120 + amount * 20}px rgba(200,20,10,${Math.min(0.85, 0.25 + amount * 0.08)})`;
      setTimeout(() => { h.style.boxShadow = 'inset 0 0 160px rgba(200,20,10,0)'; }, 260);
      api.toast(amount ? `-${amount} HP${blocked ? ` (${blocked} blocked)` : ''}` : `Blocked ${blocked}`);
    },
    addLabel(id) { const d = document.createElement('div'); d.className = 'lbl'; $('labels').appendChild(d); labels.set(id, d); },
    removeLabel(id) { labels.get(id)?.remove(); labels.delete(id); },
    clearLabels() { for (const d of labels.values()) d.remove(); labels.clear(); },
    floatText(pos, text, color, now) {
      const d = document.createElement('div'); d.className = 'ft'; d.textContent = text; d.style.color = color;
      $('labels').appendChild(d); floats.push({ d, pos, t0: now });
    },
    refresh() { api._dirty = true; },
    hideModals() { $('modal').innerHTML = ''; },
    showStart(meta, descent = true) {
      const frostOk = meta.unlocked?.includes('frost');
      $('modal').innerHTML = `<div class="panel modal"><h1>Ember Scout</h1>
        <div>Turn-based dungeon run. Enemies show what they will do next. Turning is free.</div>
        <div style="opacity:.75;font-size:12px;margin-top:4px">Runs ${meta.runs ?? 0} · wins ${meta.wins ?? 0} · best room ${meta.bestRoom ?? 0} · best floor ${meta.bestFloor ?? 0}/3 · skills seen ${(meta.discovered ?? []).length}/8</div>
        <div style="margin-top:8px"><b id="mode-toggle" style="cursor:pointer;color:#ffd890">D · Mode: ${descent ? 'Descent (3 generated floors, keep your build)' : 'Training slice (4 hand-made rooms)'}</b></div>
        <div class="cards">
          <div class="card panel" data-p="ember"><small>1 · Start as</small><b>Ember Scout</b><br>Strike, Guard, Ember Bolt, Frost Dart</div>
          <div class="card panel ${frostOk ? '' : 'locked'}" data-p="frost"><small>2 · ${frostOk ? 'Start as' : 'Locked: clear room 2'}</small><b>Frost Scout</b><br>Strike, Guard, Frost Dart, Frost Ward</div>
        </div></div>`;
      for (const c of $('modal').querySelectorAll('.card')) c.onclick = () => { if (c.dataset.p === 'ember' || frostOk) api.onStart(c.dataset.p); };
      $('mode-toggle').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    },
    showDescend(floor, run) {
      $('modal').innerHTML = `<div class="panel modal"><h1>Floor ${floor} cleared</h1><div>A stair spirals down into the dark. HP ${run.hero.hp}/${run.hero.maxHp}; your skills, upgrades and relic come with you.</div>
        <div class="cards"><div class="card panel" id="go-down"><small>Enter</small>Descend to floor ${floor + 1} of 3</div></div></div>`;
      $('go-down').onclick = () => api.onDescend();
    },
    showReward(offers, run) {
      $('modal').innerHTML = `<div class="panel modal"><h1>Room ${run.cleared.length} cleared</h1><div>Choose one. HP does not come back between rooms.</div>
        <div class="cards">${offers.map((o, i) => `<div class="card panel" data-i="${i}"><small>${i + 1} · ${o.kind}</small>${o.text}</div>`).join('')}</div></div>`;
      for (const c of $('modal').querySelectorAll('.card')) c.onclick = () => api.onReward(Number(c.dataset.i));
    },
    askSlot(offer, run, cb) {
      const opts = [2, 3].map((s) => ({ s, name: C.SKILLS[run.hero.skills[s]].name }));
      $('modal').innerHTML = `<div class="panel modal"><h1>Learn ${C.SKILLS[offer.id].name}</h1><div>${C.SKILLS[offer.id].text}</div><div>Which skill does it replace?</div>
        <div class="cards">${opts.map((o) => `<div class="card panel" data-s="${o.s}"><small>slot ${o.s + 1}</small>Replace <b>${o.name}</b></div>`).join('')}</div></div>`;
      for (const c of $('modal').querySelectorAll('.card')) c.onclick = () => cb(Number(c.dataset.s));
    },
    showEnd(run, meta) {
      const won = run.over === 'won';
      $('modal').innerHTML = `<div class="panel modal"><h1>${run.descentWon ? 'The depths are yours' : won ? 'Victory' : 'You fell'}</h1>${run.floor ? `<div>Floor ${run.floor} of 3</div>` : ''}
        <div>Rooms cleared ${run.cleared.length}/${run.rooms.length} · turns ${run.turn} · HP ${run.hero.hp}</div>
        <div style="margin-top:6px">${meta.unlocked.includes('frost') ? 'Frost Scout is unlocked.' : 'Clear room 2 to unlock the Frost Scout.'}</div>
        <div class="cards"><div class="card panel" id="again"><small>R</small>Back to start</div></div></div>`;
      $('again').onclick = () => api.onRestart();
    },
    update(now, run, visuals, camera, TILE) {
      // floating texts and enemy labels follow 3D positions
      const v3 = new THREE.Vector3();
      const W = innerWidth, H = innerHeight;
      const cl = new THREE.Vector3();
      const project = (p) => {
        cl.copy(p); camera.worldToLocal(cl); // camera looks down -z: anything with z >= 0 is behind
        v3.copy(p).project(camera);
        return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H, ok: cl.z < -0.1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 };
      };
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i], k = (now - f.t0) / 1100;
        if (k >= 1) { f.d.remove(); floats.splice(i, 1); continue; }
        const s = project(f.pos.clone().setY(f.pos.y + k * 0.6));
        f.d.style.left = s.x + 'px'; f.d.style.top = s.y + 'px'; f.d.style.opacity = s.ok ? 1 - k * k : 0;
      }
      const facingTarget = (() => { for (const id of run.hero.skills) { const p = C.preview(run, id); if (p.ok && p.targets?.length) return p.targets[0]; } return null; })();
      for (const [id, d] of labels) {
        const e = run.enemies.find((x) => x.id === id), v = visuals.get(id);
        if (!e || !v || e.hp <= 0) { d.style.display = 'none'; continue; }
        const s = project(v.m.group.position.clone().setY(2.3 * (C.ENEMIES[e.type].monster === 'brute' ? 1.25 : 1)));
        d.style.display = s.ok ? '' : 'none';
        d.style.left = s.x + 'px'; d.style.top = s.y + 'px';
        d.classList.toggle('tgt', facingTarget === id);
        if (api._dirty || !d.innerHTML) {
          const it = C.intentText(e), atk = ['attack', 'shoot', 'cleave'].includes(e.intent?.kind);
          const rage = C.enrage(run);
          d.innerHTML = `${rage ? `<div style="color:#ff5040;font-size:11px">Enraged +${rage}</div>` : ''}<div class="it ${atk ? 'atk' : ''}">${it}</div><div class="nm">${e.name} ${e.hp}/${e.maxHp}</div><div class="hp"><i style="width:${(100 * e.hp) / e.maxHp}%"></i></div>` +
            `<div>${e.burn ? `<span style="color:#ff9050">Burn ${e.burn}</span> ` : ''}${e.chill ? `<span style="color:#9ad4ff">Chill ${e.chill}</span>` : ''}</div>`;
        }
      }
      if (!api._dirty) return;
      api._dirty = false;
      const h = run.hero;
      $('hero').innerHTML = `<b>${C.PRESETS[run.preset].name}</b> · Rooms ${run.cleared.length} / ${run.rooms.length} cleared<br>
        HP ${h.hp}/${h.maxHp}<div class="bar"><i style="width:${(100 * h.hp) / h.maxHp}%"></i></div>
        ${h.block ? `Block ${h.block}<div class="bar block"><i style="width:${Math.min(100, h.block * 10)}%"></i></div>` : ''}
        ${h.relic ? `Relic: ${C.RELICS[h.relic].name}<br>` : ''}${h.key ? '<span style="color:#ffd870">Iron Key</span><br>' : ''}${run.combat ? `<span style="color:#ff9a70">In combat · turn ${run.turn}</span>` : '<span style="opacity:.7">Exploring</span>'}`;
      $('skills').innerHTML = h.skills.map((id, i) => {
        const sk = C.SKILLS[id], cd = h.cooldowns[id] ?? 0, p = C.preview(run, id);
        const up = h.upgrades[id] ? ` +${h.upgrades[id]}` : '';
        return `<div class="skill panel ${cd ? 'cd' : p.ok ? 'ok' : ''}"><span class="k">${i + 1}</span><b style="color:${ELEMENT_COLOR[sk.element]}">${sk.name}${up}</b><div style="font-size:12px">${sk.text}</div>
          <div class="pv">${cd ? `Ready in ${cd}` : p.ok ? '→ ' + p.text : p.text}</div></div>`;
      }).join('') + `<div id="wait" class="panel">Space<br>wait</div>`;
      // Your own tile is under the camera, so its floor marker is invisible: say it in words.
      const onMe = C.threatCells(run).filter((t) => t.x === h.x && t.y === h.y && t.damage);
      const dirName = (e) => { const dx = e.x - h.x, dy = e.y - h.y; const rel = (C.DIRS.findIndex((d) => Math.sign(dx) === d.dx && Math.sign(dy) === d.dy) - h.facing + 4) % 4; return dx && dy ? '' : ['ahead', 'to your right', 'behind you', 'to your left'][rel] ?? ''; };
      if (onMe.length) {
        const total = onMe.reduce((a, t) => a + t.damage, 0);
        const who = onMe.map((t) => { const e = run.enemies.find((x) => x.id === t.id); return `${e.name} ${dirName(e)}`.trim(); }).join(' + ');
        $('warn').textContent = `${who} will hit your tile for ${total}${h.block ? ` (Block ${h.block})` : ''}: step aside or Guard`;
        $('warn').style.display = 'block'; $('danger').style.display = 'block';
      } else { $('warn').style.display = 'none'; $('danger').style.display = 'none'; }
      $('log').innerHTML = run.log.slice(-7).map((l) => `<div>${l}</div>`).join('');
      // minimap: north up
      const c = $('mini'), cs = run.map.width > 30 ? 6 : 8;
      if (c.width !== run.map.width * cs + 8) { c.width = run.map.width * cs + 8; c.height = run.map.height * cs + 8; }
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      for (let y = 0; y < run.map.height; y++) for (let x = 0; x < run.map.width; x++) {
        const fl = C.floorAt(run.map, x, y);
        const room = run.rooms.find((r) => C.inRoom(r, x, y));
        g.fillStyle = !fl ? (run.map.tiles[y][x] === 'P' ? '#6a5a48' : '#1a1410') : room && run.cleared.includes(room.id) ? '#4a5a40' : '#5a4c3c';
        if (run.map.tiles[y][x] === 'L' && !run.hero.key) g.fillStyle = '#c09030';
        if (run.map.tiles[y][x] === 'K' && !run.hero.key) g.fillStyle = '#ffe070';
        if (run.map.tiles[y][x] === 'H' && !(run.usedShrines ?? []).includes(`${x},${y}`)) g.fillStyle = '#60ffd0';
        g.fillRect(4 + x * cs, 4 + y * cs, cs - 1, cs - 1);
      }
      for (const t of C.threatCells(run)) { g.fillStyle = t.kind === 'windup' ? '#e0a020' : '#e03020'; g.fillRect(4 + t.x * cs, 4 + t.y * cs, cs - 1, cs - 1); }
      for (const e of run.enemies.filter((x) => x.hp > 0)) { g.fillStyle = '#ffd0a0'; g.beginPath(); g.arc(4 + e.x * cs + cs / 2 - 0.5, 4 + e.y * cs + cs / 2 - 0.5, 2.6, 0, 7); g.fill(); }
      const d = C.DIRS[h.facing], cx = 4 + h.x * cs + cs / 2 - 0.5, cy = 4 + h.y * cs + cs / 2 - 0.5;
      g.fillStyle = '#7fe0ff'; g.beginPath(); g.moveTo(cx + d.dx * 4, cy + d.dy * 4); g.lineTo(cx - d.dy * 3 - d.dx * 2, cy + d.dx * 3 - d.dy * 2); g.lineTo(cx + d.dy * 3 - d.dx * 2, cy - d.dx * 3 - d.dy * 2); g.fill();
    },
  };
  return api;
}
