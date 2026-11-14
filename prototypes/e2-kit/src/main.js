import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import mapText from './test01.txt?raw';
import { parseMap, Controller, DIRS, tileAt, isWalkable } from './grid.js';
import { brickWall, flagstones } from './textures.js';
import { makeComposer } from './post.js';

const TILE = 2;
const WALL_H = 3;
const EYE = 1.6;
const MOVE_MS = 180;
const TURN_MS = 150;
const BUMP_MS = 160;

const params = new URLSearchParams(location.search);
// Looks: base (E1 as is), lit (tone mapping, fog, wall torches),
// moody (lit + shadows, AO, bloom, grade, grain), painted (moody + Kuwahara).
const LOOK = params.get('look') ?? 'moody';
const fancy = LOOK !== 'base';
// tex=a uses E4 method A3 textures (Codex image_gen), tex=canvas the code-drawn placeholders.
const TEX = params.get('tex') ?? 'a';
const post = LOOK === 'moody' || LOOK === 'painted';
const map = parseMap(mapText);
const ctrl = new Controller(map);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, Number(params.get('dpr') ?? 1.5)));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
if (fancy) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
}
if (post) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Torches and walls never move, so draw shadow maps once, not every frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050403);
scene.fog = fancy ? new THREE.FogExp2(0x0c0a08, 0.07) : new THREE.Fog(0x050403, 2, 14);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 50);
scene.add(camera);
// Base light where no torch reaches. Tune live with ?amb= (was 0.5 in E3).
if (fancy) scene.add(new THREE.HemisphereLight(0x5a6680, 0x241a10, Number(params.get('amb') ?? 2.5)));
else scene.add(new THREE.AmbientLight(0x404050, 0.6));
// Fancy looks: a weak warm 'lantern' on the player, the wall torches do the work.
const TORCH_BASE = fancy ? 20 : 25;
const torch = fancy ? new THREE.PointLight(0xffb070, TORCH_BASE, 12, 2) : new THREE.PointLight(0xffa860, 25, 12, 1.6);
torch.position.set(0.3, -0.1, 0);
camera.add(torch);

// Checker texture so movement is readable on grey boxes.
function checker(a, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 64, 64);
  g.fillStyle = b; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
function tiled(t, rx, ry) { for (const k of Object.values(t)) { k.wrapS = k.wrapT = THREE.RepeatWrapping; k.repeat.set(rx, ry); } return t; }
const loader = new THREE.TextureLoader();
function pbr(name, rx, ry, extra = {}) {
  const map = loader.load(`tex/${name}/basecolor.webp`); map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = loader.load(`tex/${name}/normal.webp`);
  const roughnessMap = loader.load(`tex/${name}/roughness.webp`);
  for (const t of [map, normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; }
  return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1, ...extra });
}
const useA = fancy && TEX === 'a';
const wallMat = useA ? pbr('wall', 1, 1)
  : fancy
  ? new THREE.MeshStandardMaterial({ ...tiled(brickWall(), 2, 3), bumpScale: 3, roughness: 0.9 })
  : new THREE.MeshStandardMaterial({ map: checker('#8a8a8a', '#7a7a7a'), roughness: 0.9 });
const floorMat = useA ? pbr('floor', 1, 1)
  : fancy
  ? new THREE.MeshStandardMaterial({ ...flagstones(), bumpScale: 3, roughness: 0.85 })
  : new THREE.MeshStandardMaterial({ map: checker('#5a5a5a', '#4a4a4a'), roughness: 1 });
const ceilMat = useA ? pbr('wall', 1, 1, { color: 0x666666 }) : new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
const propMat = useA ? pbr('wood', 1, 1) : new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.8 });
const pillarMat = useA ? pbr('wall', 1, 2) : propMat;

// --- E2: build the level from the Blender kit (public/kit.glb) ---
// Kit pieces are found by name; materials are swapped by material name so
// the same kit can be re-skinned (wall/floor/wood/iron) for variants.
const kit = (await new GLTFLoader().loadAsync('kit.glb')).scene;
const ironMat = useA ? pbr('iron', 1, 1, { metalness: 0.6 }) : new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.8 });
const KIT_MATS = { wall: wallMat, floor: floorMat, wood: propMat, iron: ironMat };
// Columns: smaller, lighter dressed stone so they read as separate pieces, not wall.
const trimMat = useA ? pbr('wall', 2.5, 2.5, { color: 0xb0a698 }) : wallMat;
function piece(name, x, z, rotY = 0, y = 0, mats = KIT_MATS) {
  const src = kit.getObjectByName(name);
  if (!src) throw new Error(`kit piece ${name} missing`);
  const o = src.clone();
  o.traverse((m) => {
    if (!m.isMesh) return;
    m.material = mats[m.material.name] ?? m.material;
    m.castShadow = m.receiveShadow = true;
  });
  o.position.set(x, y, z);
  o.rotation.set(0, rotY, 0);
  scene.add(o);
  return o;
}
const solid = (x, y) => { const c = tileAt(map, x, y); return c === '#' || c === ' '; };
// Rotation that makes a kit wall (face +Z) face back into the tile from direction d.
const faceInto = (d) => Math.atan2(-d.dx, -d.dy);

const vertexEdges = new Map(); // "i,j" -> ['h'|'v', ...]
const addEdge = (i, j, o) => { const k = `${i},${j}`; (vertexEdges.get(k) ?? vertexEdges.set(k, []).get(k)).push(o); };
const wallSpots = []; // for torches
for (let y = 0; y < map.height; y++)
  for (let x = 0; x < map.width; x++) {
    if (solid(x, y)) continue;
    const cx = x * TILE, cz = y * TILE;
    piece('kit_floor', cx, cz);
    piece('kit_ceiling', cx, cz, 0, 0, { ...KIT_MATS, wall: ceilMat });
    const ew = !solid(x - 1, y) || !solid(x + 1, y);
    const ns = !solid(x, y - 1) || !solid(x, y + 1);
    if ((x + y) % 2 === 0) piece('kit_beam', cx, cz, ew && !ns ? Math.PI / 2 : 0);
    DIRS.forEach((d, di) => {
      if (!solid(x + d.dx, y + d.dy)) return;
      piece('kit_wall', cx + d.dx * TILE / 2, cz + d.dy * TILE / 2, faceInto(d));
      wallSpots.push({ x, y, d, di });
      // grid vertices at the two ends of this edge (vertex i,j sits at ((i-0.5)*TILE, (j-0.5)*TILE))
      if (d.dx === 0) { const j = y + (d.dy > 0 ? 1 : 0); addEdge(x, j, 'h'); addEdge(x + 1, j, 'h'); }
      else { const i = x + (d.dx > 0 ? 1 : 0); addEdge(i, y, 'v'); addEdge(i, y + 1, 'v'); }
    });
    if (tileAt(map, x, y) === 'P') {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, WALL_H, 16), pillarMat);
      p.position.set(cx, WALL_H / 2, cz);
      p.castShadow = p.receiveShadow = true;
      scene.add(p);
    }
    if (tileAt(map, x, y) === 'D') {
      const rot = ew ? Math.PI / 2 : 0;
      piece('kit_doorway', cx, cz, rot);
      piece('kit_doorframe', cx, cz, rot);
    }
  }
// Corner columns wherever wall edges meet, except straight runs.
for (const [k, es] of vertexEdges) {
  const straight = es.length === 2 && es[0] === es[1];
  if (straight) continue;
  const [i, j] = k.split(',').map(Number);
  piece('kit_corner', (i - 0.5) * TILE, (j - 0.5) * TILE, 0, 0, { ...KIT_MATS, wall: trimMat });
}

// Wall torches on kit sconces: deterministic picks of wall faces.
const wallTorches = [];
if (fancy) {
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  flameMat.color.multiplyScalar(4); // bright enough to bloom
  for (const { x, y, d, di } of wallSpots) {
    if ((x * 7 + y * 13 + di * 5) % 9 !== 0 || wallTorches.length >= 6) continue;
    const g = piece('kit_sconce', x * TILE + d.dx * TILE / 2, y * TILE + d.dy * TILE / 2, faceInto(d), 1.9);
    g.traverse((m) => { m.castShadow = false; });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), flameMat);
    flame.position.set(0, 0.2, 0.3);
    g.add(flame);
    const light = new THREE.PointLight(0xff8a3a, 26, 11, 2);
    light.position.set(0, 0.45, 0.5);
    g.add(light);
    if (post) { light.castShadow = true; light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.002; light.shadow.camera.near = 0.1; }
    wallTorches.push({ light, flame, phase: wallTorches.length * 1.7, base: 26 });
  }
}

// --- camera pose and tweens ---
const yawOf = (facing) => -facing * (Math.PI / 2);
const pose = { x: ctrl.state.x * TILE, z: ctrl.state.y * TILE, yaw: yawOf(ctrl.state.facing) };
let anim = null; // { t0, ms, fn(k) }

function applyPose() {
  camera.position.set(pose.x, EYE, pose.z);
  camera.rotation.set(0, pose.yaw, 0);
}
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

function start(step) {
  if (!step) return;
  const fx = pose.x, fz = pose.z, fyaw = pose.yaw;
  if (step.kind === 'move') {
    const tx = step.state.x * TILE, tz = step.state.y * TILE;
    anim = { t0: performance.now(), ms: MOVE_MS, fn: (k) => { pose.x = fx + (tx - fx) * k; pose.z = fz + (tz - fz) * k; } };
  } else if (step.kind === 'turn') {
    const d = step.action === 'turnLeft' ? Math.PI / 2 : -Math.PI / 2;
    anim = { t0: performance.now(), ms: TURN_MS, fn: (k) => { pose.yaw = fyaw + d * k; } };
  } else {
    const bx = step.dir.dx * 0.25, bz = step.dir.dy * 0.25;
    anim = { t0: performance.now(), ms: BUMP_MS, fn: (k) => { const s = Math.sin(k * Math.PI); pose.x = fx + bx * s; pose.z = fz + bz * s; } };
  }
}

const KEYS = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'strafeLeft', KeyD: 'strafeRight', KeyQ: 'turnLeft', KeyE: 'turnRight',
  ArrowLeft: 'turnLeft', ArrowRight: 'turnRight',
};
const LOOK_KEYS = { Digit1: 'base', Digit2: 'lit', Digit3: 'moody', Digit4: 'painted' };
addEventListener('keydown', (e) => {
  if (LOOK_KEYS[e.code]) {
    const p = new URLSearchParams(location.search);
    p.set('look', LOOK_KEYS[e.code]);
    p.set('at', `${ctrl.state.x},${ctrl.state.y},${ctrl.state.facing}`);
    location.search = p.toString();
    return;
  }
  const a = KEYS[e.code];
  if (!a || e.repeat) return;
  e.preventDefault();
  start(ctrl.press(a));
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});
const composer = post ? makeComposer(renderer, scene, camera, LOOK) : null;

const hud = document.getElementById('hud');
const gl = renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
const GPU = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
let ms = 0;
let frames = 0, lastFps = performance.now(), fps = 0;
const flicker = (t, base, ph = 0) => base * (1 + Math.sin(t * 0.011 + ph) * 0.06 + Math.sin(t * 0.037 + ph * 2.3) * 0.05 + Math.sin(t * 0.093 + ph) * 0.03);

function frame(now) {
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.ms);
    anim.fn(ease(k));
    if (k >= 1) {
      if (anim.ms !== BUMP_MS) {
        // snap to exact target to avoid drift
        pose.x = ctrl.state.x * TILE; pose.z = ctrl.state.y * TILE;
        pose.yaw = yawOf(ctrl.state.facing) + Math.round((pose.yaw - yawOf(ctrl.state.facing)) / (2 * Math.PI)) * 2 * Math.PI;
      }
      anim = null;
      start(ctrl.done());
    }
  }
  torch.intensity = flicker(now, TORCH_BASE);
  for (const w of wallTorches) {
    w.light.intensity = flicker(now, w.base, w.phase);
    w.flame.scale.y = 0.9 + Math.sin(now * 0.02 + w.phase) * 0.1;
  }
  applyPose();
  if (composer) composer.render(now); else renderer.render(scene, camera);
  frames++;
  if (now - lastFps > 500) { fps = (frames * 1000) / (now - lastFps); ms = 1000 / fps; frames = 0; lastFps = now; }
  const s = ctrl.state;
  hud.innerHTML = `<b style="font-size:28px;color:#fc8">${LOOK}</b> &nbsp; keys 1 base · 2 lit · 3 moody · 4 painted<br>${fps.toFixed(0)} fps (${ms.toFixed(1)} ms) · ${renderer.getPixelRatio()}x · ${innerWidth}x${innerHeight}<br>GPU: ${GPU}<br>pos ${s.x},${s.y} facing ${DIRS[s.facing].name}`;
  requestAnimationFrame(frame);
}
const at = params.get('at');
if (at) {
  const [x, y, f] = at.split(',').map(Number);
  ctrl.state = { x, y, facing: f };
  pose.x = x * TILE; pose.z = y * TILE; pose.yaw = yawOf(f);
}
applyPose();
requestAnimationFrame(frame);

// Test hook for headless screenshots.
window.__game = {
  setState(x, y, facing) { ctrl.state = { x, y, facing }; pose.x = x * TILE; pose.z = y * TILE; pose.yaw = yawOf(facing); },
  torches: () => wallTorches.length,
  ctrl, press: (a) => start(ctrl.press(a)), isIdle: () => !anim && !ctrl.busy };
