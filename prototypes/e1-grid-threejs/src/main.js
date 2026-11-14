import * as THREE from "three";
import mapText from "./test01.txt?raw";
import { parseMap, Controller, DIRS, tileAt, isWalkable } from "./grid.js";

const TILE = 2;
const WALL_H = 3;
const EYE = 1.6;
const MOVE_MS = 180;
const TURN_MS = 150;
const BUMP_MS = 160;

const params = new URLSearchParams(location.search);
const map = parseMap(mapText);
const ctrl = new Controller(map);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: params.has("shot"),
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050403);
scene.fog = new THREE.Fog(0x050403, 2, 14);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 50);
scene.add(camera);
scene.add(new THREE.AmbientLight(0x404050, 0.6));
const torch = new THREE.PointLight(0xffa860, 25, 12, 1.6);
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
const wallMat = new THREE.MeshStandardMaterial({
  map: checker("#8a8a8a", "#7a7a7a"),
  roughness: 0.9,
});
const floorMat = new THREE.MeshStandardMaterial({
  map: checker("#5a5a5a", "#4a4a4a"),
  roughness: 1,
});
const ceilMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
const propMat = new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.8 });

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
scene.add(walls);

const planeGeo = new THREE.PlaneGeometry(TILE, TILE);
for (let y = 0; y < map.height; y++)
  for (let x = 0; x < map.width; x++) {
    const c = tileAt(map, x, y);
    if (c === "#" || c === " ") continue;
    const f = new THREE.Mesh(planeGeo, floorMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x * TILE, 0, y * TILE);
    scene.add(f);
    const ce = new THREE.Mesh(planeGeo, ceilMat);
    ce.rotation.x = Math.PI / 2;
    ce.position.set(x * TILE, WALL_H, y * TILE);
    scene.add(ce);
    if (c === "P") {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, WALL_H, 16), propMat);
      p.position.set(x * TILE, WALL_H / 2, y * TILE);
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
addEventListener("keydown", (e) => {
  const a = KEYS[e.code];
  if (!a || e.repeat) return;
  e.preventDefault();
  start(ctrl.press(a));
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const hud = document.getElementById("hud");
let frames = 0,
  lastFps = performance.now(),
  fps = 0;
const flicker = (t) => 25 + Math.sin(t * 0.011) * 1.5 + Math.sin(t * 0.037) * 1.0;

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
  torch.intensity = flicker(now);
  applyPose();
  renderer.render(scene, camera);
  frames++;
  if (now - lastFps > 500) {
    fps = (frames * 1000) / (now - lastFps);
    frames = 0;
    lastFps = now;
  }
  const s = ctrl.state;
  hud.textContent = `${fps.toFixed(0)} fps  pos ${s.x},${s.y}  facing ${DIRS[s.facing].name}`;
  requestAnimationFrame(frame);
}
applyPose();
requestAnimationFrame(frame);

// Test hook for headless screenshots.
window.__game = { ctrl, press: (a) => start(ctrl.press(a)), isIdle: () => !anim && !ctrl.busy };
