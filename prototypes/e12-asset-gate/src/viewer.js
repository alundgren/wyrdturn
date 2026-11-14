import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Headless viewer for the asset gate. window.__view.load(url) then .shot(view).
// Views: front, side, back, threeq (3/4), top, grid (2 m away at eye height, dungeon light), silhouette.
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 200);
const studio = new THREE.Group();
studio.add(new THREE.HemisphereLight("#dfe6f0", "#4a4038", 2.2));
const key = new THREE.DirectionalLight("#fff4e0", 2.4);
key.position.set(3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
studio.add(key, key.target);
const dungeon = new THREE.Group();
dungeon.add(new THREE.HemisphereLight("#d8c8b0", "#6a5644", 3.0));
const torch = new THREE.PointLight("#ff8a3a", 26, 11, 2);
torch.position.set(1.2, 2.2, 0.8);
dungeon.add(torch);
const lantern = new THREE.PointLight("#ffb070", 4, 10, 1);
dungeon.add(lantern);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: "#5d564c", roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor, studio);
let current = null,
  info = null,
  silMat = new THREE.MeshBasicMaterial({ color: "#000" });
const originals = new Map();

async function load(url) {
  if (current) scene.remove(current);
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      originals.set(o, o.material);
    }
  });
  // Measure raw bounds, then put it on the floor, centred (scale untouched: scale is part of the check)
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()),
    centre = box.getCenter(new THREE.Vector3());
  root.position.set(-centre.x, -box.min.y, -centre.z);
  scene.add(root);
  current = root;
  info = {
    size: size.toArray().map((v) => +v.toFixed(3)),
    minY: +box.min.y.toFixed(3),
    animations: gltf.animations.map((a) => a.name),
  };
  return info;
}

function shot(view) {
  const s = info.size,
    h = Math.max(s[1], 0.05),
    r = Math.max(s[0], s[2], h);
  const d = r * 2.1 + 0.2,
    ty = h * 0.5;
  scene.background = new THREE.Color(
    view === "silhouette" ? "#ffffff" : view === "grid" ? "#0c0a08" : "#6b7480",
  );
  floor.visible = view !== "silhouette";
  studio.visible = view !== "grid";
  dungeon.visible = view === "grid";
  if (dungeon.visible && !dungeon.parent) scene.add(dungeon);
  current.traverse((o) => {
    if (o.isMesh) o.material = view === "silhouette" ? silMat : originals.get(o);
  });
  const P = {
    front: [0, ty, d],
    side: [d, ty, 0],
    back: [0, ty, -d],
    threeq: [d * 0.7, ty + r * 0.4, d * 0.7],
    top: [0.001, d * 1.2, 0.001],
    silhouette: [d * 0.7, ty, d * 0.7],
    grid: [0, 1.6, 2.0], // how the player sees it: one tile away, eye height 1.6 m
  }[view];
  camera.fov = view === "grid" ? 70 : 40;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  camera.position.set(...P);
  lantern.position.set(0.25, 1.75, 2.6);
  camera.lookAt(0, view === "grid" ? Math.min(1.2, ty) : ty, 0);
  renderer.render(scene, camera);
}
window.__view = { load, shot, ready: true };
