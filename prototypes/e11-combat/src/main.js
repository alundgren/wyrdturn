import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import sliceText from './slice.txt?raw';
import sliceRooms from './rooms.json';
import { generate } from './levelgen.js';
// ?gen=<seed> plays a generated level; default is the hand-made 4-room slice.
const GEN_SEED = new URLSearchParams(location.search).get('gen');
// Descent: floor N (1-3) of a run; deeper floors buy more enemies per room.
export const FLOOR = Number(new URLSearchParams(location.search).get('floor') ?? 0);
const LEVEL = GEN_SEED ? generate(Number(GEN_SEED), FLOOR > 1 ? { budgetStart: 2 + 1.5 * (FLOOR - 1), rooms: 7 + (FLOOR - 1) } : {}) : null;
const mapText = LEVEL ? LEVEL.mapText : sliceText;
const levelRooms = LEVEL ? LEVEL.rooms : sliceRooms;
import { initGame } from './game.js';
import { makeSky, PRESETS } from './sky.js';
import { makeGrass } from './grass.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';

// Live tuning. Saved in this browser (localStorage); "copy" puts JSON on the clipboard.
// Bright-by-default: strong base light, coloured haze instead of black fog,
// torches as warm accents. Mood comes from tint and shadow, not darkness.
const TUNE_DEFAULTS = {
  exposure: 1.0, ambient: 3.0, outdoor: 1.0, lantern: 4, lanternRange: 10, lanternFalloff: 1, torchLight: 5,
  fog: 0.03, vignette: 0.3, grain: 0.015, ao: 0.7, albedo: 1.6,
  indoorSky: '#d8c8b0', indoorGround: '#a08a72', indoorFog: '#6b5a48',
};
let saved = {};
// v2 = bright defaults; ignore values saved under the old dark setup.
const TUNE_KEY = 'tune-v2';
try { saved = JSON.parse(localStorage.getItem(TUNE_KEY) ?? '{}'); } catch { saved = {}; }
const TUNE = { ...TUNE_DEFAULTS, ...saved };
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
renderer.info.autoReset = false;
if (fancy) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TUNE.exposure;
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

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 30); // far 30 m: fog hides it anyway, lets chunks cull
scene.add(camera);
// Base light where no torch reaches. Tune live with ?amb= (was 0.5 in E3).
// Base light. Indoors: dungeon values. Outdoors: time-of-day preset. Blended by where the player stands.
const AMB = Number(params.get('amb') ?? TUNE.ambient);
TUNE.ambient = AMB;
const hemi = new THREE.HemisphereLight(0x5a6680, 0x241a10, AMB);
if (fancy) scene.add(hemi);
const INDOOR = { hemiSky: new THREE.Color(TUNE.indoorSky), hemiGround: new THREE.Color(TUNE.indoorGround), hemi: AMB, fog: new THREE.Color(TUNE.indoorFog), fogDensity: TUNE.fog };
const TIMES = ['day', 'dusk', 'night'];
let timeName = params.get('time') ?? 'dusk';
const sky = makeSky();
scene.add(sky.mesh);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 80 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
let outdoorK = 0; // 0 indoors, 1 outdoors (smoothed)
function applyTime() {
  const p = PRESETS[timeName];
  sky.apply(p);
  sun.color.set(p.sun);
  sun.intensity = p.sunIntensity;
  const mid = new THREE.Vector3(map.width - 1, 0, map.height - 1); // map centre in metres (TILE = 2)
  sun.target.position.copy(mid);
  sun.position.copy(p.sunDir).multiplyScalar(40).add(mid);
  renderer.shadowMap.needsUpdate = true;
}
if (!fancy) scene.add(new THREE.AmbientLight(0x404050, 0.6));
// Fancy looks: a weak warm 'lantern' on the player, the wall torches do the work.
const TORCH_BASE = fancy ? TUNE.lantern : 25;
const torch = fancy ? new THREE.PointLight(0xffb070, TORCH_BASE, TUNE.lanternRange, 2) : new THREE.PointLight(0xffa860, 25, 12, 1.6);
// Behind and above the head: the wall in front is ~1.6 m from the light, not 1 m,
// so stepping up to a wall does not blow it out.
torch.position.set(0.25, 0.15, 0.6);
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
const ceilMat = useA ? pbr('wall', 1, 1, { color: 0xb0a090 }) : new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
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
  o.userData.kitPiece = true;
  scene.add(o);
  return o;
}
const solid = (x, y) => { const c = tileAt(map, x, y); return c === '#' || c === ' '; };
const isOutdoor = (c) => c === ',' || c === 'T' || c === 'F';

// --- Room themes: tint stone, light, haze and torch colour per room (data, so a GM can pick them).
const THEMES = {
  crypt: { stone: '#9fb0c8', sky: '#a8c0e8', ground: '#4a5468', fog: '#3a4658', torch: '#7fe0d0', flame: '#a0fff0' },
  forge: { stone: '#d0a088', sky: '#e8d0c0', ground: '#6a4a3c', fog: '#5a3a30', torch: '#ff8a40', flame: '#ffb060' }, // softer light: the brick texture is orange already
  moss: { stone: '#a0b890', sky: '#c8e0a8', ground: '#4a5a34', fog: '#46583a', torch: '#ffb860', flame: '#ffd090' },
  bone: { stone: '#d8ccaa', sky: '#f0e0b0', ground: '#6a5a3a', fog: '#6a6040', torch: '#e8e070', flame: '#fff0a0' },
};
const SLICE_THEMES = { 1: 'moss', 2: 'crypt', 3: 'forge', 4: 'bone' };
const themedRooms = (LEVEL ? LEVEL.allRooms : levelRooms).map((r) => ({ ...r, theme: r.theme ?? SLICE_THEMES[r.id] ?? null }));
const themeAt = (x, y) => { const r = themedRooms.find((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1); return r?.theme ? THEMES[r.theme] : null; };
const themeMatCache = new Map();
function themed(base, theme, key) {
  if (!theme) return base;
  const k = key + theme.stone;
  if (!themeMatCache.has(k)) { const m = base.clone(); m.color.multiply(new THREE.Color(theme.stone)); m.userData.themeTint = theme.stone; themeMatCache.set(k, m); }
  return themeMatCache.get(k);
}
// Each theme has its own painted wall + floor set (e4-textures/biomes). ?biomes=tint falls back to
// tinting the default stone. The theme's light/haze/torch colours still apply on top.
const USE_BIOME_TEX = params.get('biomes') !== 'tint';
const biomeCache = new Map();
function biomeMat(theme, part) {
  const name = Object.keys(THEMES).find((k) => THEMES[k] === theme);
  const k = `${name}/${part}`;
  if (!biomeCache.has(k)) biomeCache.set(k, pbr(`biomes/${name}/${part}`, 1, 1));
  return biomeCache.get(k);
}
const themeMats = (t) => (!t ? KIT_MATS : USE_BIOME_TEX && useA
  ? { ...KIT_MATS, wall: biomeMat(t, 'wall'), floor: biomeMat(t, 'floor') }
  : { ...KIT_MATS, wall: themed(wallMat, t, 'w'), floor: themed(floorMat, t, 'f') });

// --- E8 outdoor pieces ---
const outdoor = (await new GLTFLoader().loadAsync('outdoor.glb')).scene;
function groundTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#3a3a22'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? `rgba(30,36,18,${0.3 + v})` : `rgba(90,80,50,${v - 0.4})`;
    const r = 2 + Math.random() * 10;
    g.beginPath(); g.arc(Math.random() * S, Math.random() * S, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const groundGeo = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a5a2c, roughness: 0.85, flatShading: false });
const barkMat = useA ? pbr('wood', 1, 1, { color: 0x8a7a6a }) : new THREE.MeshStandardMaterial({ color: 0x4a3a2a });
const stoneMat = useA ? pbr('wall', 1, 1, { color: 0xc0b8a8 }) : wallMat;
const waterUniforms = { time: { value: 0 } };
const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a3038, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 });
waterMat.onBeforeCompile = (sh) => {
  // Cheap animated ripples: perturb the normal in the fragment shader.
  sh.uniforms.time = waterUniforms.time;
  sh.vertexShader = 'varying vec3 vWorld;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = 'uniform float time;\nvarying vec3 vWorld;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    float r1 = sin(length(vWorld.xz - floor(vWorld.xz / 2.0) * 2.0 - 1.0) * 30.0 - time * 4.0);
    float r2 = sin(vWorld.x * 17.0 + time * 1.3) * sin(vWorld.z * 13.0 - time * 1.1);
    normal = normalize(normal + vec3(r1 * 0.06 + r2 * 0.05, 0.0, r2 * 0.06));`);
};
const OUT_MATS = { bark: barkMat, leaves: leafMat, stone: stoneMat, water: waterMat };
function outdoorPiece(name, x, z, rotY = 0) {
  const o = outdoor.getObjectByName(name).clone();
  o.traverse((m) => {
    if (!m.isMesh) return;
    m.material = OUT_MATS[m.material.name] ?? m.material;
    m.castShadow = m.material !== waterMat;
    m.receiveShadow = true;
  });
  o.position.set(x, 0, z);
  o.rotation.y = rotY;
  scene.add(o);
  return o;
}
const grassTiles = [], avoid = [];
let fountainAt = null;
// Rotation that makes a kit wall (face +Z) face back into the tile from direction d.
const faceInto = (d) => Math.atan2(-d.dx, -d.dy);

const vertexEdges = new Map(); // "i,j" -> ['h'|'v', ...]
const addEdge = (i, j, o) => { const k = `${i},${j}`; (vertexEdges.get(k) ?? vertexEdges.set(k, []).get(k)).push(o); };
const wallSpots = []; // for torches
for (let y = 0; y < map.height; y++)
  for (let x = 0; x < map.width; x++) {
    if (solid(x, y)) continue;
    const cx = x * TILE, cz = y * TILE;
    const ew = !solid(x - 1, y) || !solid(x + 1, y);
    const ns = !solid(x, y - 1) || !solid(x, y + 1);
    const c = tileAt(map, x, y);
    if (isOutdoor(c)) {
      grassTiles.push({ x: cx, z: cz });
      const g = new THREE.Mesh(groundGeo, groundMat);
      g.position.set(cx, 0, cz);
      g.receiveShadow = true;
      scene.add(g);
      if (c === 'T') {
        const t = outdoorPiece((x + y) % 2 ? 'tree_a' : 'tree_b', cx, cz, (x * 3 + y * 5) % 6);
        avoid.push({ x: cx, z: cz, r: 0.45 });
        void t;
      }
      if (c === 'F') {
        outdoorPiece('fountain', cx, cz);
        for (const n of ['fountain_water', 'fountain_water_top']) outdoorPiece(n, cx, cz);
        avoid.push({ x: cx, z: cz, r: 1.0 });
        fountainAt = { x: cx, z: cz };
      }
    } else {
      const T = themeAt(x, y);
      piece('kit_floor', cx, cz, 0, 0, themeMats(T));
      piece('kit_ceiling', cx, cz, 0, 0, { ...KIT_MATS, wall: themed(ceilMat, T, 'c') });
      if ((x + y) % 2 === 0) piece('kit_beam', cx, cz, ew && !ns ? Math.PI / 2 : 0);
    }
    DIRS.forEach((d, di) => {
      if (!solid(x + d.dx, y + d.dy)) return;
      piece('kit_wall', cx + d.dx * TILE / 2, cz + d.dy * TILE / 2, faceInto(d), 0, themeMats(themeAt(x, y)));
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
const grass = makeGrass(grassTiles, TILE, avoid, Number(params.get('grass') ?? 260));
scene.add(grass.mesh);
// Falling water: points on a parabola from the spout, animated in the shader.
let spray = null;
if (fountainAt) {
  const N = 400, a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { a[i * 3] = Math.random() * Math.PI * 2; a[i * 3 + 1] = Math.random(); a[i * 3 + 2] = 0.5 + Math.random() * 0.5; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(a, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { time: waterUniforms.time, origin: { value: new THREE.Vector3(fountainAt.x, 1.42, fountainAt.z) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 seed; uniform float time; uniform vec3 origin; varying float vA;
      void main() {
        float t = fract(seed.y + time * 0.6 * seed.z);
        vec2 dir = vec2(cos(seed.x), sin(seed.x));
        float sp = 0.55 * seed.z;
        vec3 p = origin + vec3(dir.x * sp * t, 0.35 * t - 1.6 * t * t, dir.y * sp * t);
        p.y = max(p.y, 1.13);
        vA = 1.0 - t;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 22.0 / -mv.z;
      }`,
    fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.55, 0.65, 0.7) * 0.07 * vA, 1.0) * smoothstep(0.5, 0.1, d); }`,
  });
  spray = new THREE.Points(g, m);
  spray.frustumCulled = false;
  scene.add(spray);
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
  // Every combat room gets one torch (first wall spot inside it), then hashed extras.
  // Only the first 6 cast shadows: each shadowed point light is 6 extra renders + texture units.
  const maxTorches = Math.max(6, Math.round(wallSpots.length / 14));
  const picked = new Set();
  for (const r of levelRooms) {
    const i = wallSpots.findIndex((w) => w.x >= r.x0 && w.x <= r.x1 && w.y >= r.y0 && w.y <= r.y1 && (w.x + w.y) % 2 === 0);
    if (i >= 0) picked.add(i);
  }
  wallSpots.forEach((w, i) => { if ((w.x * 7 + w.y * 13 + w.di * 5) % 9 === 0) picked.add(i); });
  for (const i of [...picked].slice(0, maxTorches)) {
    const { x, y, d } = wallSpots[i];
    const g = piece('kit_sconce', x * TILE + d.dx * TILE / 2, y * TILE + d.dy * TILE / 2, faceInto(d), 1.9);
    g.traverse((m) => { m.castShadow = false; });
    const TT = themeAt(x, y);
    const fm = TT ? new THREE.MeshBasicMaterial({ color: new THREE.Color(TT.flame).multiplyScalar(4) }) : flameMat;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), fm);
    flame.position.set(0, 0.2, 0.3);
    g.add(flame);
    // decay 1 + 1 m off the wall: same reach as before, no white hot spot on the wall behind it
    const light = new THREE.PointLight(TT ? TT.torch : 0xff8a3a, TUNE.torchLight, 11, 1);
    light.position.set(0, 0.45, 1.0);
    g.add(light);
    if (post && wallTorches.length < 6) { light.castShadow = true; light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.002; light.shadow.camera.near = 0.1; }
    wallTorches.push({ light, flame, phase: wallTorches.length * 1.7, base: 26 });
  }
}

// --- camera pose and tweens ---
const yawOf = (facing) => -facing * (Math.PI / 2);
const pose = { x: ctrl.state.x * TILE, z: ctrl.state.y * TILE, yaw: yawOf(ctrl.state.facing) };
let anim = null; // { t0, ms, fn(k) }

let shakeAmt = 0;
function applyPose() {
  shakeAmt *= 0.88;
  if (window.__freeze !== undefined) shakeAmt = 0; // random shake breaks repeatable screenshots
  camera.position.set(pose.x + (Math.random() - 0.5) * shakeAmt, EYE + (Math.random() - 0.5) * shakeAmt, pose.z);
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
// Input goes to the combat game layer (E11); it decides what a key means.
let game = null;
addEventListener('keydown', (e) => { if (game?.onKey(e)) e.preventDefault(); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});
const composer = post ? makeComposer(renderer, scene, camera, LOOK) : null;
const mixers = [];
let lastNow = performance.now();

const ALBEDO_MATS = [wallMat, floorMat, ceilMat, propMat, trimMat, stoneMat, barkMat, groundMat, leafMat, ...themeMatCache.values()]; // biome textures are painted mid-tone already: no extra brightness boost (it blew them out)
for (const m of ALBEDO_MATS) m.userData.baseColor = m.color.clone();
function applyPost() {
  for (const m of ALBEDO_MATS) m.color.copy(m.userData.baseColor).multiplyScalar(TUNE.albedo);
  INDOOR.hemiSky.set(TUNE.indoorSky); INDOOR.hemiGround.set(TUNE.indoorGround); INDOOR.fog.set(TUNE.indoorFog);
  if (!composer) return;
  composer.grade.uniforms.vignette.value = TUNE.vignette;
  composer.grade.uniforms.grain.value = TUNE.grain;
  composer.gtao.blendIntensity = TUNE.ao;
}
applyPost();
if (!params.has('shot')) {
  const gui = new GUI({ title: 'Tune (G hides)' });
  const save = () => { try { localStorage.setItem(TUNE_KEY, JSON.stringify(TUNE)); } catch {} applyPost(); };
  gui.add(TUNE, 'exposure', 0.3, 3, 0.05).onChange(save);
  gui.add(TUNE, 'ambient', 0, 10, 0.1).name('base light indoor').onChange(save);
  gui.add(TUNE, 'outdoor', 0.2, 3, 0.05).name('base light outdoor x').onChange(save);
  gui.add(TUNE, 'lantern', 0, 80, 1).name('player lantern').onChange(save);
  gui.add(TUNE, 'lanternRange', 4, 30, 1).name('lantern range').onChange(save);
  gui.add(TUNE, 'lanternFalloff', 0, 2, 0.05).name('lantern falloff (2 = real)').onChange(save);
  gui.add(TUNE, 'torchLight', 0, 40, 0.5).name('wall torches').onChange(save);
  gui.add(TUNE, 'fog', 0, 0.2, 0.005).name('fog indoor').onChange(save);
  gui.add(TUNE, 'albedo', 0.5, 3, 0.05).name('texture brightness').onChange(save);
  gui.addColor(TUNE, 'indoorSky').name('indoor light tint').onChange(save);
  gui.addColor(TUNE, 'indoorGround').name('indoor bounce tint').onChange(save);
  gui.addColor(TUNE, 'indoorFog').name('indoor haze colour').onChange(save);
  gui.add(TUNE, 'vignette', 0, 1, 0.05).onChange(save);
  gui.add(TUNE, 'grain', 0, 0.1, 0.005).onChange(save);
  gui.add(TUNE, 'ao', 0, 1, 0.05).name('corner shading').onChange(save);
  gui.add({ copy: () => { const j = JSON.stringify(TUNE); navigator.clipboard?.writeText(j); console.log('TUNE', j); alert('Copied:\n' + j); } }, 'copy').name('copy values');
  gui.add({ reset: () => { try { localStorage.removeItem(TUNE_KEY); } catch {} location.reload(); } }, 'reset').name('reset to defaults');
  addEventListener('keydown', (e) => { if (e.code === 'KeyG') gui.show(gui._hidden); });
}

const hud = document.getElementById('hud');
const themeSky = new THREE.Color(TUNE.indoorSky), themeGround = new THREE.Color(TUNE.indoorGround), themeFog = new THREE.Color(TUNE.indoorFog);
const tmpC = new THREE.Color();
applyTime();
const gl = renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
const GPU = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
let ms = 0;
let frames = 0, lastFps = performance.now(), fps = 0;
const flicker = (t, base, ph = 0) => base * (1 + Math.sin(t * 0.011 + ph) * 0.06 + Math.sin(t * 0.037 + ph * 2.3) * 0.05 + Math.sin(t * 0.093 + ph) * 0.03);

function frame(now) {
  // Screenshot checks set window.__freeze to a fixed time so animation, flicker and grain are identical run to run.
  if (window.__freeze !== undefined && !anim) now = window.__freeze;
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
  torch.intensity = flicker(now, fancy ? TUNE.lantern : TORCH_BASE);
  torch.distance = TUNE.lanternRange;
  if (fancy) torch.decay = TUNE.lanternFalloff;
  renderer.toneMappingExposure = TUNE.exposure;
  INDOOR.hemi = TUNE.ambient;
  INDOOR.fogDensity = TUNE.fog;
  // Indoor/outdoor blend of fog and base light.
  const here = tileAt(map, ctrl.state.x, ctrl.state.y);
  outdoorK += ((isOutdoor(here) ? 1 : 0) - outdoorK) * 0.06;
  const P = PRESETS[timeName];
  // room theme tint, smoothed so walking through a door fades the mood
  const TH = themeAt(ctrl.state.x, ctrl.state.y);
  themeSky.lerp(tmpC.set(TH ? TH.sky : TUNE.indoorSky), 0.05);
  themeGround.lerp(tmpC.set(TH ? TH.ground : TUNE.indoorGround), 0.05);
  themeFog.lerp(tmpC.set(TH ? TH.fog : TUNE.indoorFog), 0.05);
  INDOOR.hemiSky.copy(themeSky); INDOOR.hemiGround.copy(themeGround); INDOOR.fog.copy(themeFog);
  hemi.color.copy(INDOOR.hemiSky).lerp(tmpC.set(P.hemiSky), outdoorK);
  hemi.groundColor.copy(INDOOR.hemiGround).lerp(tmpC.set(P.hemiGround), outdoorK);
  hemi.intensity = INDOOR.hemi + (P.hemi * TUNE.outdoor - INDOOR.hemi) * outdoorK;
  if (scene.fog.isFogExp2) {
    scene.fog.color.copy(INDOOR.fog).lerp(tmpC.set(P.fog), outdoorK);
    scene.fog.density = INDOOR.fogDensity + (P.fogDensity - INDOOR.fogDensity) * outdoorK;
  }
  const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  for (const mx of mixers) mx.update(dt);
  sky.update(now);
  grass.update(now);
  waterUniforms.time.value = now / 1000;
  for (const w of wallTorches) {
    w.light.intensity = flicker(now, TUNE.torchLight, w.phase);
    w.flame.scale.y = 0.9 + Math.sin(now * 0.02 + w.phase) * 0.1;
  }
  game?.update(now);
  renderer.info.reset(); // count the whole frame (all post passes), not just the last pass
  applyPose();
  if (composer) composer.render(now); else renderer.render(scene, camera);
  frames++;
  if (now - lastFps > 500) { fps = (frames * 1000) / (now - lastFps); ms = 1000 / fps; frames = 0; lastFps = now; }
  const s = ctrl.state;
  hud.textContent = `${fps.toFixed(0)} fps · G tune`;
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

game = await initGame({
  scene, camera, TILE, mapText, rooms: levelRooms, floor: FLOOR, genSeed: GEN_SEED, ctrl, pose, yawOf, start,
  isAnimating: () => !!anim,
  shake: (amount) => { shakeAmt = Math.min(0.25, 0.04 + amount * 0.02); },
});

// --- Static batching: the bench route found ~1000 draw calls in generated levels because every
// kit piece was its own mesh. Merge all static kit meshes that share a material into one mesh.
// (?nobatch keeps them separate for comparison.)
if (!params.has('nobatch')) {
  scene.updateMatrixWorld(true);
  const byMat = new Map();
  const roots = scene.children.filter((o) => o.userData.kitPiece);
  const CHUNK = 6 * TILE; // merge per 12 m chunk so off-screen chunks are still culled
  for (const r of roots) r.traverse((m) => {
    if (!m.isMesh) return;
    const ck = `${Math.floor(r.position.x / CHUNK)},${Math.floor(r.position.z / CHUNK)}`;
    const g = m.geometry.index ? m.geometry.clone() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(m.matrixWorld);
    const key = m.material.uuid + '|' + ck;
    (byMat.get(key) ?? byMat.set(key, { mat: m.material, list: [] }).get(key)).list.push({ g, mesh: m });
  });
  let before = 0;
  for (const { mat, list } of byMat.values()) {
    before += list.length;
    const merged = mergeGeometries(list.map((e) => e.g));
    if (!merged) { console.warn('merge failed for', mat.name); continue; }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = list.some((e) => e.mesh.castShadow);
    mesh.receiveShadow = true;
    scene.add(mesh);
    for (const e of list) {
      // a sconce is itself a mesh carrying the flame + torch light: move children to the scene first,
      // otherwise removing the merged mesh silently deletes the light (bench found dark rooms)
      for (const c of [...e.mesh.children]) if (!c.isMesh) scene.attach(c);
      e.mesh.parent?.remove(e.mesh);
    }
  }
  for (const r of roots) if (!r.children.length && !r.isMesh) scene.remove(r);
  console.log(`static batching: ${before} meshes -> ${byMat.size}`);
  renderer.shadowMap.needsUpdate = true;
}

// --- Performance route (?bench=1): visit fixed spots, record frame time and render stats.
// Real fps only means something on real hardware (open it in your browser); headless runs
// still give draw calls / triangles per spot, which agents can hold to a budget.
if (params.has('bench')) {
  const spots = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isWalkable(map, x, y) && (x * 7 + y * 3) % 11 === 0) spots.push([x, y]);
  const route = spots.slice(0, 12).flatMap(([x, y]) => [[x, y, 0], [x, y, 1], [x, y, 2], [x, y, 3]]).filter((_, i) => i % 2 === 0);
  const result = { gpu: GPU, dpr: renderer.getPixelRatio(), size: [innerWidth, innerHeight], spots: [] };
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:12px;top:120px;z-index:9;background:rgba(0,0,0,.75);color:#cfe;padding:8px;font:12px monospace;max-height:70vh;overflow:auto';
  document.body.appendChild(box);
  (async () => {
    await new Promise((r) => setTimeout(r, 1500)); // let textures and shaders settle
    for (const [x, y, f] of route) {
      ctrl.state = { x, y, facing: f }; pose.x = x * TILE; pose.z = y * TILE; pose.yaw = yawOf(f);
      await new Promise((r) => setTimeout(r, 250));
      const times = [];
      let last = performance.now();
      await new Promise((done) => { let n = 0; const tick = () => { const t = performance.now(); times.push(t - last); last = t; if (++n < Number(params.get('benchFrames') ?? 45)) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });
      times.sort((a, b) => a - b);
      const info = renderer.info;
      result.spots.push({ x, y, f, avgMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2), calls: info.render.calls, tris: info.render.triangles, programs: info.programs?.length ?? 0, textures: info.memory.textures, geometries: info.memory.geometries });
      box.textContent = 'BENCH ' + JSON.stringify(result.spots.at(-1));
    }
    const worst = [...result.spots].sort((a, b) => b.p95Ms - a.p95Ms)[0];
    result.summary = { avgMs: +(result.spots.reduce((a, s) => a + s.avgMs, 0) / result.spots.length).toFixed(2), worstP95Ms: worst.p95Ms, worstSpot: [worst.x, worst.y, worst.f], maxCalls: Math.max(...result.spots.map((s) => s.calls)), maxTris: Math.max(...result.spots.map((s) => s.tris)) };
    box.textContent = 'BENCH DONE (copy this)\n' + JSON.stringify(result.summary, null, 1) + '\n\n' + result.spots.map((s) => `${s.x},${s.y} f${s.f}: ${s.avgMs} ms avg, ${s.p95Ms} p95, ${s.calls} calls, ${s.tris} tris`).join('\n');
    window.__bench = result;
    console.log('BENCH', JSON.stringify(result.summary));
  })();
}

// Test hook for headless screenshots.
window.__game = {
  setState(x, y, facing) { ctrl.state = { x, y, facing }; pose.x = x * TILE; pose.z = y * TILE; pose.yaw = yawOf(facing); },
  torches: () => wallTorches.length,
  setTime(n) { timeName = n; applyTime(); },
  game,
  ctrl, press: (a) => start(ctrl.press(a)), isIdle: () => !anim && !ctrl.busy };
