import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Board } from "../rules/combat.ts";

// Builds the generated level around the fight room from the e2 wall kit (public/kit.glb),
// with the room's biome textures. Same piece placement as e11's main.js.
// Walls on the camera side (south faces) and the ceiling are tagged so the camera rise can
// cut them down and fade them out: that is what turns the room into a readable board.

export const TILE = 2;
export const WALL_H = 3;
const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

const loader = new THREE.TextureLoader();
function pbr(name: string, extra: THREE.MeshStandardMaterialParameters = {}) {
  const map = loader.load(`tex/${name}/basecolor.webp`);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = loader.load(`tex/${name}/normal.webp`);
  const roughnessMap = loader.load(`tex/${name}/roughness.webp`);
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1, ...extra });
}

export interface RoomView {
  group: THREE.Group;
  /** Walls between the camera and the board: scaled down in the top view. */
  cutWalls: THREE.Object3D[];
  ceiling: THREE.Object3D[];
  ceilingMat: THREE.MeshStandardMaterial;
  setTop(k: number): void;
}

export async function buildRoom(board: Board): Promise<RoomView> {
  const kit = (await new GLTFLoader().loadAsync("kit.glb")).scene;
  const theme = board.theme ?? "crypt";
  const wall = pbr(`biomes/${theme}/wall`);
  const floor = pbr(`biomes/${theme}/floor`);
  const mats: Record<string, THREE.Material> = {
    wall,
    floor,
    wood: pbr("wood"),
    iron: pbr("iron", { metalness: 0.6 }),
  };
  const corridorMats = { ...mats, wall: pbr("wall"), floor: pbr("floor") };
  const ceilingMat = pbr("wall", { color: 0xb0a090, transparent: true });
  const group = new THREE.Group();
  const cutWalls: THREE.Object3D[] = [];
  const ceiling: THREE.Object3D[] = [];
  const g = board.grid;
  const solid = (x: number, y: number) => {
    const c = g[y]?.[x];
    return c === undefined || c === "#";
  };
  const r = board.room;
  const inRoom = (x: number, y: number) =>
    x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1;
  function piece(
    name: string,
    x: number,
    z: number,
    rotY: number,
    m: Record<string, THREE.Material>,
  ) {
    const src = kit.getObjectByName(name);
    if (!src) throw new Error(`kit piece ${name} missing`);
    const o = src.clone();
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mn = (mesh.material as THREE.Material).name;
      mesh.material = m[mn] ?? mesh.material;
      mesh.castShadow = mesh.receiveShadow = true;
    });
    o.position.set(x, 0, z);
    o.rotation.set(0, rotY, 0);
    group.add(o);
    return o;
  }
  // only the room and a few tiles of corridor around it
  const pad = 5;
  const vertexEdges = new Map<string, string[]>();
  const addEdge = (i: number, j: number, o: string) => {
    const k = `${i},${j}`;
    vertexEdges.set(k, [...(vertexEdges.get(k) ?? []), o]);
  };
  const cutVertex = new Set<string>();
  for (let y = r.y0 - pad; y <= r.y1 + pad; y++)
    for (let x = r.x0 - pad; x <= r.x1 + pad; x++) {
      const c = g[y]?.[x];
      if (c === undefined || c === "#") continue;
      const m = inRoom(x, y) ? mats : corridorMats;
      const cx = x * TILE,
        cz = y * TILE;
      piece("kit_floor", cx, cz, 0, m);
      const ce = piece("kit_ceiling", cx, cz, 0, { ...m, wall: ceilingMat });
      ceiling.push(ce);
      DIRS.forEach((d) => {
        if (!solid(x + d.dx, y + d.dy)) return;
        const w = piece(
          "kit_wall",
          cx + (d.dx * TILE) / 2,
          cz + (d.dy * TILE) / 2,
          Math.atan2(-d.dx, -d.dy),
          m,
        );
        // south-side walls stand between the top-view camera and the floor
        if (d.dy === 1) {
          cutWalls.push(w);
          cutVertex.add(`${x},${y + 1}`);
          cutVertex.add(`${x + 1},${y + 1}`);
        }
        if (d.dx === 0) {
          const j = y + (d.dy > 0 ? 1 : 0);
          addEdge(x, j, "h");
          addEdge(x + 1, j, "h");
        } else {
          const i = x + (d.dx > 0 ? 1 : 0);
          addEdge(i, y, "v");
          addEdge(i, y + 1, "v");
        }
      });
    }
  const trim = pbr("wall", { color: 0xb0a698 });
  for (const [k, es] of vertexEdges) {
    if (es.length === 2 && es[0] === es[1]) continue;
    const [i, j] = k.split(",").map(Number);
    const c = piece("kit_corner", (i - 0.5) * TILE, (j - 0.5) * TILE, 0, { ...mats, wall: trim });
    if (cutVertex.has(k)) cutWalls.push(c);
  }
  // pillars (from the generator and the fight's rubble)
  const pillarMat = pbr("wall", { color: 0xc8beb0 });
  for (const p of board.pillars) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, WALL_H, 16), pillarMat);
    m.position.set(p.x * TILE, WALL_H / 2, p.y * TILE);
    m.castShadow = m.receiveShadow = true;
    m.userData.pillar = true;
    group.add(m);
  }
  return {
    group,
    cutWalls,
    ceiling,
    ceilingMat,
    setTop(k: number) {
      // k: 0 first person, 1 top view
      const h = 1 - 0.78 * smooth(k);
      for (const w of cutWalls) w.scale.y = h;
      ceilingMat.opacity = 1 - smooth(Math.min(1, k * 3));
      for (const c of ceiling) c.visible = ceilingMat.opacity > 0.02;
    },
  };
}

export const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
