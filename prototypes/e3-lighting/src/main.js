import * as THREE from "three";
import mapText from "./test01.txt?raw";
import { parseMap, Controller, DIRS, tileAt, isWalkable } from "./grid.js";
import { brickWall, flagstones } from "./textures.js";
import { makeComposer } from "./post.js";

const TILE = 2;
const WALL_H = 3;
const EYE = 1.6;
const MOVE_MS = 180;
const TURN_MS = 150;
const BUMP_MS = 160;

const params = new URLSearchParams(location.search);
// Looks: base (E1 as is), lit (tone mapping, fog, wall torches),
// moody (lit + shadows, AO, bloom, grade, grain), painted (moody + Kuwahara).
const LOOK = params.get("look") ?? "moody";
const fancy = LOOK !== "base";
// tex=a uses E4 method A3 textures (Codex image_gen), tex=canvas the code-drawn placeholders.
const TEX = params.get("tex") ?? "a";
const post = LOOK === "moody" || LOOK === "painted";
const map = parseMap(mapText);
const ctrl = new Controller(map);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: params.has("shot"),
});
renderer.setPixelRatio(Math.min(devicePixelRatio, Number(params.get("dpr") ?? 1.5)));
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
scene.fog = fancy ? new THREE.FogExp2(0x070605, 0.075) : new THREE.Fog(0x050403, 2, 14);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 50);
scene.add(camera);
if (fancy) scene.add(new THREE.HemisphereLight(0x405070, 0x15100a, 0.5));
else scene.add(new THREE.AmbientLight(0x404050, 0.6));
// Fancy looks: a weak warm 'lantern' on the player, the wall torches do the work.
const TORCH_BASE = fancy ? 20 : 25;
const torch = fancy
  ? new THREE.PointLight(0xffb070, TORCH_BASE, 8, 2)
  : new THREE.PointLight(0xffa860, 25, 12, 1.6);
torch.position.set(0.3, -0.1, 0);
camera.add(torch);

// Checker texture so movement is readable on grey boxes.
function checker(a, b) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = a;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = b;
  g.fillRect(0, 0, 32, 32);
  g.fillRect(32, 32, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
function tiled(t, rx, ry) {
  for (const k of Object.values(t)) {
    k.wrapS = k.wrapT = THREE.RepeatWrapping;
    k.repeat.set(rx, ry);
  }
  return t;
}
const loader = new THREE.TextureLoader();
function pbr(name, rx, ry, extra = {}) {
  const map = loader.load(`tex/${name}/basecolor.webp`);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = loader.load(`tex/${name}/normal.webp`);
  const roughnessMap = loader.load(`tex/${name}/roughness.webp`);
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
  }
  return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1, ...extra });
}
const useA = fancy && TEX === "a";
const wallMat = useA
  ? pbr("wall", 1, 1.5)
  : fancy
    ? new THREE.MeshStandardMaterial({ ...tiled(brickWall(), 2, 3), bumpScale: 3, roughness: 0.9 })
    : new THREE.MeshStandardMaterial({ map: checker("#8a8a8a", "#7a7a7a"), roughness: 0.9 });
const floorMat = useA
  ? pbr("floor", 1, 1)
  : fancy
    ? new THREE.MeshStandardMaterial({ ...flagstones(), bumpScale: 3, roughness: 0.85 })
    : new THREE.MeshStandardMaterial({ map: checker("#5a5a5a", "#4a4a4a"), roughness: 1 });
const ceilMat = useA
  ? pbr("wall", 1, 1, { color: 0x777777 })
  : new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
const propMat = useA
  ? pbr("wood", 1, 1)
  : new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.8 });
const pillarMat = useA ? pbr("wall", 1, 2) : propMat;

// Walls: one instanced box per wall tile that touches a walkable tile.
const wallTiles = [];
for (let y = 0; y < map.height; y++)
  for (let x = 0; x < map.width; x++) {
    const c = tileAt(map, x, y);
    if (c === "#" || c === " ") {
      const touches = DIRS.some((d) => isWalkable(map, x + d.dx, y + d.dy));
      if (touches) wallTiles.push({ x, y });
    }
  }
const walls = new THREE.InstancedMesh(
  new THREE.BoxGeometry(TILE, WALL_H, TILE),
  wallMat,
  wallTiles.length,
);
const m4 = new THREE.Matrix4();
wallTiles.forEach((t, i) =>
  walls.setMatrixAt(i, m4.makeTranslation(t.x * TILE, WALL_H / 2, t.y * TILE)),
);
walls.castShadow = walls.receiveShadow = true;
scene.add(walls);

// Wall torches: deterministic picks of wall faces next to floor tiles.
const wallTorches = [];
if (fancy) {
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  flameMat.color.multiplyScalar(4); // bright enough to bloom
  const ironMat = useA
    ? pbr("iron", 1, 1, { metalness: 0.6 })
    : new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.8 });
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!isWalkable(map, x, y)) continue;
      DIRS.forEach((d, di) => {
        if (isWalkable(map, x + d.dx, y + d.dy) || tileAt(map, x + d.dx, y + d.dy) === "P") return;
        if ((x * 7 + y * 13 + di * 5) % 9 !== 0 || wallTorches.length >= 6) return;
        const px = x * TILE + d.dx * (TILE / 2 - 0.12),
          pz = y * TILE + d.dy * (TILE / 2 - 0.12);
        const g = new THREE.Group();
        const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.35, 8), ironMat);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 8), flameMat);
        flame.position.y = 0.28;
        g.add(holder, flame);
        g.position.set(px, 1.9, pz);
        scene.add(g);
        const light = new THREE.PointLight(0xff8a3a, 26, 11, 2);
        light.position.set(px - d.dx * 0.25, 2.3, pz - d.dy * 0.25);
        if (post) {
          light.castShadow = true;
          light.shadow.mapSize.set(512, 512);
          light.shadow.bias = -0.002;
          light.shadow.camera.near = 0.1;
        }
        scene.add(light);
        wallTorches.push({ light, flame, phase: wallTorches.length * 1.7, base: 26 });
      });
    }
}

const planeGeo = new THREE.PlaneGeometry(TILE, TILE);
for (let y = 0; y < map.height; y++)
  for (let x = 0; x < map.width; x++) {
    const c = tileAt(map, x, y);
    if (c === "#" || c === " ") continue;
    const f = new THREE.Mesh(planeGeo, floorMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x * TILE, 0, y * TILE);
    f.receiveShadow = true;
    scene.add(f);
    const ce = new THREE.Mesh(planeGeo, ceilMat);
    ce.rotation.x = Math.PI / 2;
    ce.position.set(x * TILE, WALL_H, y * TILE);
    scene.add(ce);
    if (c === "P") {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, WALL_H, 16), pillarMat);
      p.position.set(x * TILE, WALL_H / 2, y * TILE);
      p.castShadow = p.receiveShadow = true;
      scene.add(p);
    }
    if (c === "D") {
      // Door frame: posts on the sides that are walls, lintel across.
      const eastWest = isWalkable(map, x - 1, y) || isWalkable(map, x + 1, y);
      const frame = new THREE.Group();
      const postGeo = new THREE.BoxGeometry(0.3, WALL_H, 0.3);
      const l = new THREE.Mesh(postGeo, propMat);
      l.position.set(0, WALL_H / 2, -0.85);
      const r = new THREE.Mesh(postGeo, propMat);
      r.position.set(0, WALL_H / 2, 0.85);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 2), propMat);
      top.position.set(0, WALL_H - 0.3, 0);
      frame.add(l, r, top);
      if (!eastWest) frame.rotation.y = Math.PI / 2;
      frame.position.set(x * TILE, 0, y * TILE);
      frame.traverse((o) => {
        o.castShadow = o.receiveShadow = true;
      });
      scene.add(frame);
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
  const fx = pose.x,
    fz = pose.z,
    fyaw = pose.yaw;
  if (step.kind === "move") {
    const tx = step.state.x * TILE,
      tz = step.state.y * TILE;
    anim = {
      t0: performance.now(),
      ms: MOVE_MS,
      fn: (k) => {
        pose.x = fx + (tx - fx) * k;
        pose.z = fz + (tz - fz) * k;
      },
    };
  } else if (step.kind === "turn") {
    const d = step.action === "turnLeft" ? Math.PI / 2 : -Math.PI / 2;
    anim = {
      t0: performance.now(),
      ms: TURN_MS,
      fn: (k) => {
        pose.yaw = fyaw + d * k;
      },
    };
  } else {
    const bx = step.dir.dx * 0.25,
      bz = step.dir.dy * 0.25;
    anim = {
      t0: performance.now(),
      ms: BUMP_MS,
      fn: (k) => {
        const s = Math.sin(k * Math.PI);
        pose.x = fx + bx * s;
        pose.z = fz + bz * s;
      },
    };
  }
}

const KEYS = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "strafeLeft",
  KeyD: "strafeRight",
  KeyQ: "turnLeft",
  KeyE: "turnRight",
  ArrowLeft: "turnLeft",
  ArrowRight: "turnRight",
};
const LOOK_KEYS = { Digit1: "base", Digit2: "lit", Digit3: "moody", Digit4: "painted" };
addEventListener("keydown", (e) => {
  if (LOOK_KEYS[e.code]) {
    const p = new URLSearchParams(location.search);
    p.set("look", LOOK_KEYS[e.code]);
    p.set("at", `${ctrl.state.x},${ctrl.state.y},${ctrl.state.facing}`);
    location.search = p.toString();
    return;
  }
  const a = KEYS[e.code];
  if (!a || e.repeat) return;
  e.preventDefault();
  start(ctrl.press(a));
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});
const composer = post ? makeComposer(renderer, scene, camera, LOOK) : null;

const hud = document.getElementById("hud");
const gl = renderer.getContext();
const dbg = gl.getExtension("WEBGL_debug_renderer_info");
const GPU = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
let ms = 0;
let frames = 0,
  lastFps = performance.now(),
  fps = 0;
const flicker = (t, base, ph = 0) =>
  base *
  (1 +
    Math.sin(t * 0.011 + ph) * 0.06 +
    Math.sin(t * 0.037 + ph * 2.3) * 0.05 +
    Math.sin(t * 0.093 + ph) * 0.03);

function frame(now) {
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.ms);
    anim.fn(ease(k));
    if (k >= 1) {
      if (anim.ms !== BUMP_MS) {
        // snap to exact target to avoid drift
        pose.x = ctrl.state.x * TILE;
        pose.z = ctrl.state.y * TILE;
        pose.yaw =
          yawOf(ctrl.state.facing) +
          Math.round((pose.yaw - yawOf(ctrl.state.facing)) / (2 * Math.PI)) * 2 * Math.PI;
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
  if (composer) composer.render(now);
  else renderer.render(scene, camera);
  frames++;
  if (now - lastFps > 500) {
    fps = (frames * 1000) / (now - lastFps);
    ms = 1000 / fps;
    frames = 0;
    lastFps = now;
  }
  const s = ctrl.state;
  hud.innerHTML = `<b style="font-size:28px;color:#fc8">${LOOK}</b> &nbsp; keys 1 base · 2 lit · 3 moody · 4 painted<br>${fps.toFixed(0)} fps (${ms.toFixed(1)} ms) · ${renderer.getPixelRatio()}x · ${innerWidth}x${innerHeight}<br>GPU: ${GPU}<br>pos ${s.x},${s.y} facing ${DIRS[s.facing].name}`;
  requestAnimationFrame(frame);
}
const at = params.get("at");
if (at) {
  const [x, y, f] = at.split(",").map(Number);
  ctrl.state = { x, y, facing: f };
  pose.x = x * TILE;
  pose.z = y * TILE;
  pose.yaw = yawOf(f);
}
applyPose();
requestAnimationFrame(frame);

// Test hook for headless screenshots.
window.__game = {
  setState(x, y, facing) {
    ctrl.state = { x, y, facing };
    pose.x = x * TILE;
    pose.z = y * TILE;
    pose.yaw = yawOf(facing);
  },
  torches: () => wallTorches.length,
  ctrl,
  press: (a) => start(ctrl.press(a)),
  isIdle: () => !anim && !ctrl.busy,
};
