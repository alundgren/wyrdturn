import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeArchetype, animate, ARCHETYPES } from './monster.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { autorigBiped, rigidMonster } from './autorig.js';

// Viewer / lineup for code-generated monsters.
// ?arch=ghoul&count=4  one archetype, several seeds
// default: one of each archetype.
// Keys: 1 idle, 2 walk, 3 attack, 4 hit, 5 death, N new seeds.
const params = new URLSearchParams(location.search);
const shot = params.has('shot');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#6b7480');
scene.fog = new THREE.Fog('#6b7480', 12, 30);
scene.add(new THREE.HemisphereLight('#d8dce8', '#5a4a3a', 2.2));
const sun = new THREE.DirectionalLight('#fff0dc', 2.5);
sun.position.set(4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#5d564c', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- materials: painted textures if present, else a code-drawn fallback ---
const TEX = ['ghoul-skin', 'bone', 'chitin', 'rusty-armour', 'leather-cloth', 'scales'];
const FALLBACK = { 'ghoul-skin': '#8a9a80', bone: '#d8cca8', chitin: '#4a3440', 'rusty-armour': '#7a5a44', 'leather-cloth': '#4a3a30', scales: '#6a7a88' };
async function exists(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok && (r.headers.get('content-type') ?? '').startsWith('image'); } catch { return false; }
}
function noiseTex(hex) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = hex; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},0.08)`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 5, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const loader = new THREE.TextureLoader();
const mats = {};
const usedPainted = [];
for (const name of TEX) {
  const base = `textures/${name}/`;
  if (await exists(base + 'basecolor.webp')) {
    const map = await loader.loadAsync(base + 'basecolor.webp'); map.colorSpace = THREE.SRGBColorSpace;
    const extra = {};
    if (await exists(base + 'normal.webp')) extra.normalMap = await loader.loadAsync(base + 'normal.webp');
    if (await exists(base + 'roughness.webp')) extra.roughnessMap = await loader.loadAsync(base + 'roughness.webp');
    for (const t of [map, extra.normalMap, extra.roughnessMap]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
    mats[name] = new THREE.MeshStandardMaterial({ map, ...extra, roughness: 1 });
    usedPainted.push(name);
  } else mats[name] = new THREE.MeshStandardMaterial({ map: noiseTex(FALLBACK[name]), roughness: 0.85 });
}
mats.default = mats['ghoul-skin'];

// --- lineup ---
const arch = params.get('arch');
const count = Number(params.get('count') ?? 4);
let seed = Number(params.get('seed') ?? 1);
let monsters = [];
// ?trellis=1: TRELLIS meshes (prepped by e12) auto-rigged at runtime, side by side with code monsters
const TRELLIS = params.has('trellis') ? { ghoul: 'ghoul-px', skeleton: 'skeleton', spider: 'spider', ghoul2: 'ghoul' } : null;
const trellisMeshes = {};
if (TRELLIS) for (const [k, f] of Object.entries(TRELLIS)) {
  const g = await new GLTFLoader().loadAsync(`trellis/${f}.glb`);
  g.scene.updateMatrixWorld(true);
  let mesh = null; g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  // TRELLIS albedo is baked dark; lift it to sit with the painted textures
  mesh.material.color.multiplyScalar(Number(params.get('lift') ?? 1.8));
  trellisMeshes[k] = mesh;
}
function makeTrellis(k) {
  const mesh = trellisMeshes[k];
  if (k === 'spider') { const c = mesh.clone(); c.applyMatrix4(mesh.matrixWorld); c.castShadow = true; const m = rigidMonster(c); m.archetype = 'trellis-spider'; m.seed = 0; m.tris = c.geometry.index.count / 3; return m; }
  const m = autorigBiped(mesh); m.archetype = `trellis-${k}`; m.seed = 0; return m;
}
function spawn() {
  for (const m of monsters) scene.remove(m.group);
  const names = TRELLIS ? Object.keys(TRELLIS) : arch ? Array(count).fill(arch) : Object.keys(ARCHETYPES);
  monsters = names.map((n, i) => {
    const m = TRELLIS ? makeTrellis(n) : makeArchetype(n, seed + i, mats);
    m.group.position.set((i - (names.length - 1) / 2) * 2.2, 0, 0);
    scene.add(m.group);
    return m;
  });
}
spawn();

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 100);
camera.position.set(0, 2.2, 7.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.update();

let state = params.get('state') ?? 'idle';
let stateStart = performance.now() / 1000;
let fixedT = null; // screenshot hook: freeze animation at a given time
const STATES = { Digit1: 'idle', Digit2: 'walk', Digit3: 'attack', Digit4: 'hit', Digit5: 'death' };
addEventListener('keydown', (e) => {
  if (STATES[e.code]) { state = STATES[e.code]; stateStart = performance.now() / 1000; }
  if (e.code === 'KeyN') { seed += monsters.length; spawn(); }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const hud = document.getElementById('hud');
function frame() {
  const now = performance.now() / 1000;
  const t = fixedT ?? now - stateStart;
  const time = fixedT ?? now;
  for (const m of monsters) animate(m, state, (state === 'attack' || state === 'hit') && fixedT === null ? t % 1.4 : t, time);
  renderer.render(scene, camera);
  hud.textContent = `state ${state} (1 idle 2 walk 3 attack 4 hit 5 death, N new seeds) · seed ${seed} · ` +
    monsters.map((m) => `${m.archetype}:${m.tris}`).join(' ') + ` · painted: ${usedPainted.join(',') || 'none (fallback)'}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__mon = {
  ready: true,
  // solo(i): show only monster i at the origin (or -1 for the full lineup)
  // solo(i): show only monster i at the origin; returns its height so cameras can frame it
  solo(i) {
    monsters.forEach((m, j) => {
      m.group.visible = i < 0 || i === j;
      m.group.position.x = i < 0 ? (j - (monsters.length - 1) / 2) * 2.2 : 0;
    });
    if (i < 0) return 0;
    monsters[i].group.updateMatrixWorld(true); // it just moved; stale matrices gave wrong sizes
    const box = new THREE.Box3().setFromObject(monsters[i].group, true); // precise: follows skinned poses
    return Math.max(box.max.y, (box.max.x - box.min.x) * 0.6, 0.6);
  },
  set(st, t, cam) { state = st; fixedT = t; if (cam) { camera.position.set(...cam.pos); controls.target.set(...cam.target); controls.update(); } },
  info: () => monsters.map((m) => ({ archetype: m.archetype, seed: m.seed, tris: m.tris, bones: m.skeleton.bones.length })),
  painted: () => usedPainted,
};
