// The 3D scene: a crypt room from the e2 kit around the 7 x 6 hex board, hex overlays
// (entry zone, threat, targets, hazards), path and attack arrows, and animated units.
// Same look as e14 (painted crypt textures, e11 post stack). Knows nothing of the rules
// beyond what main.ts tells it.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CELLS, type Cell, screenXY } from "../rules/hex.ts";
import type { Ground, Kind } from "../rules/combat.ts";
import { loadModels, type Models } from "./models.ts";
import { animate, type AnimState, type Rig } from "./rig.ts";
import { makeComposer } from "./post.ts";

export const R = 1.15; // hex size in metres (centre to corner)
const CENTER = (() => {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (let c = 0; c < CELLS; c++) {
    const [x, y] = screenXY(c);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
})();
export function cellPos(c: Cell): THREE.Vector3 {
  const [x, y] = screenXY(c);
  return new THREE.Vector3((x - CENTER[0]) * R, 0, (y - CENTER[1]) * R);
}

export type Mark = "entry" | "target" | "hover" | "select" | "path" | "focus" | null;
const MARK_COLOR: Record<Exclude<Mark, null>, string> = {
  entry: "#6aa8ff",
  target: "#ffd65a",
  hover: "#ffffff",
  select: "#7dff9a",
  path: "#8fd0ff",
  focus: "#ff9aff",
};

interface CellFx {
  fill: THREE.Mesh;
  fillMat: THREE.MeshBasicMaterial;
  edgeMat: THREE.MeshBasicMaterial;
  threat: THREE.Mesh;
  threatMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  mark: Mark;
  fire: THREE.Group;
  oil: THREE.Mesh;
  poison: THREE.Group;
  ward: THREE.Group;
  ground: Ground;
  burst: number;
}

interface Visual {
  id: number;
  kind: Kind;
  root: THREE.Group;
  rig: Rig;
  path: THREE.Vector3[];
  moveT0: number;
  moveDur: number;
  anim: AnimState;
  animT0: number;
  dying: boolean;
  rise: number;
  face: number;
  height: number;
}

const HEIGHT: Partial<Record<Kind, number>> = {
  hero: 2.0,
  wolf: 1.25,
  totem: 1.9,
  servant: 1.8,
  brute: 2.3,
  archer: 2.0,
  hexer: 2.0,
  skitter: 1.0,
  guard: 2.2,
};

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: ReturnType<typeof makeComposer>;
  models!: Models;
  kit!: THREE.Object3D;
  cells: CellFx[] = [];
  visuals = new Map<number, Visual>();
  torches: { light: THREE.PointLight; flame: THREE.Mesh; phase: number }[] = [];
  arrows = new THREE.Group();
  room = new THREE.Group();
  brazierObjs = new Map<Cell, THREE.Object3D>();
  raycaster = new THREE.Raycaster();
  pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  mats: Record<string, THREE.MeshStandardMaterial> = {};

  constructor(parent: HTMLElement, opts: { shot: boolean }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: opts.shot });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 80);
    this.frame();
    this.scene.background = new THREE.Color("#1a1612");
    this.scene.fog = new THREE.FogExp2(new THREE.Color("#3e4a5c"), 0.012);
    this.scene.add(new THREE.HemisphereLight("#c8d4e8", "#6a7488", 2.6));
    const key = new THREE.DirectionalLight("#dfe8ff", 1.5);
    key.position.set(-5, 14, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -12,
      right: 12,
      top: 10,
      bottom: -10,
      near: 1,
      far: 40,
    });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#fff4e0", 0.8);
    fill.position.set(0, 6, 14);
    this.scene.add(fill);
    this.composer = makeComposer(this.renderer, this.scene, this.camera, "moody");
    this.composer.grade.uniforms.vignette.value = 0.3;
    this.composer.grade.uniforms.grain.value = 0.012;
    this.composer.gtao.blendIntensity = 0.7;
    this.scene.add(this.arrows, this.room);
    addEventListener("resize", () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
      this.frame();
    });
  }

  /** Angled top view; the board sits in the upper part, cards take the bottom. */
  frame(): void {
    const aspect = innerWidth / innerHeight;
    this.camera.aspect = aspect;
    const k = Math.max(1, 1.78 / aspect);
    this.camera.position.set(0, 18.5 * k, 14.5 * k);
    this.camera.lookAt(0, 0, 2.0);
    this.camera.updateProjectionMatrix();
  }

  async load(): Promise<void> {
    const tl = new THREE.TextureLoader();
    const pbr = (dir: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
      const map = tl.load(`${dir}/basecolor.webp`);
      map.colorSpace = THREE.SRGBColorSpace;
      const normalMap = tl.load(`${dir}/normal.webp`);
      const roughnessMap = tl.load(`${dir}/roughness.webp`);
      for (const t of [map, normalMap, roughnessMap]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
      }
      return new THREE.MeshStandardMaterial({
        map,
        normalMap,
        roughnessMap,
        roughness: 1,
        ...extra,
      });
    };
    this.mats.wall = pbr("tex/biomes/crypt/wall");
    this.mats.floor = pbr("tex/biomes/crypt/floor");
    const [kit, models] = await Promise.all([new GLTFLoader().loadAsync("kit.glb"), loadModels()]);
    this.kit = kit.scene;
    this.models = models;
    this.buildCells();
  }

  private piece(name: string, x: number, z: number, rotY = 0, y = 0): THREE.Object3D {
    const src = this.kit.getObjectByName(name);
    if (!src) throw new Error(`kit piece ${name} missing`);
    const o = src.clone();
    const wood = new THREE.MeshStandardMaterial({ color: "#5a4030", roughness: 0.8 });
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mn = (mesh.material as THREE.Material).name;
      if (mn === "wall") mesh.material = this.mats.wall;
      else if (mn === "floor") mesh.material = this.mats.floor;
      else if (mn === "wood") mesh.material = wood;
      mesh.castShadow = mesh.receiveShadow = true;
    });
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    this.room.add(o);
    return o;
  }

  /** Rebuild the room around the board for an arena: walls, doors, pillars, brazier. */
  buildRoom(a: {
    blocked: boolean[];
    braziers: Cell[];
    pillars: Cell[];
    doorRow: number;
    exitRow: number | null;
  }): void {
    this.room.clear();
    this.torches = [];
    this.brazierObjs.clear();
    const X = 10,
      Z0 = -7,
      Z1 = 7;
    for (let x = -X + 1; x < X; x += 2)
      for (let z = Z0 + 1; z < Z1 + 2; z += 2) this.piece("kit_floor", x, z);
    const doorZ = (row: number) => {
      const z = cellPos(row * 7).z;
      return Math.round((z - 1) / 2) * 2 + 1;
    };
    const dz = doorZ(a.doorRow);
    const ez = a.exitRow != null ? doorZ(a.exitRow) : null;
    for (let x = -X + 1; x < X; x += 2) this.piece("kit_wall", x, Z0);
    for (let z = Z0 + 1; z < Z1; z += 2) {
      this.piece(z === dz ? "kit_doorway" : "kit_wall", -X, z, Math.PI / 2);
      this.piece(z === ez ? "kit_doorway" : "kit_wall", X, z, -Math.PI / 2);
    }
    this.piece("kit_doorframe", -X + 0.1, dz, Math.PI / 2);
    if (ez != null) this.piece("kit_doorframe", X - 0.1, ez, -Math.PI / 2);
    for (const [x, z] of [
      [-X, Z0],
      [X, Z0],
    ])
      this.piece("kit_corner", x, z);
    const flameMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffc070").multiplyScalar(4),
    });
    [-6, 0, 6].forEach((x, i) => {
      const g = this.piece("kit_sconce", x, Z0 + 0.15, 0, 2.0);
      g.traverse((m) => (m.castShadow = false));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 8), flameMat);
      flame.position.set(0, 0.22, 0.3);
      g.add(flame);
      const light = new THREE.PointLight("#ffbf70", 6, 13, 1);
      light.position.set(0, 0.45, 1.0);
      g.add(light);
      this.torches.push({ light, flame, phase: i * 1.7 });
    });
    // pillars and rubble from the arena, the brazier from the TRELLIS model
    const stone = new THREE.MeshStandardMaterial({
      color: "#8a8478",
      roughness: 0.95,
      flatShading: true,
    });
    for (const c of a.pillars) {
      const p = cellPos(c);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 1.5, 6), this.mats.wall);
      col.position.set(p.x, 0.75, p.z);
      col.rotation.y = Math.PI / 6;
      col.castShadow = col.receiveShadow = true;
      this.room.add(col);
      for (let k = 0; k < 3; k++) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + k * 0.05, 0), stone);
        r.position.set(p.x + Math.cos(k * 2.1) * 0.8, 0.15, p.z + Math.sin(k * 2.1) * 0.7);
        r.castShadow = true;
        this.room.add(r);
      }
    }
    for (const c of a.braziers) {
      const p = cellPos(c);
      const b = this.models.prop("brazier");
      if (!b) continue;
      const g = new THREE.Group();
      g.add(b);
      g.position.copy(p);
      g.scale.setScalar(1.25);
      this.room.add(g);
      const l = new THREE.PointLight("#ff9a48", 5, 8, 1);
      l.position.set(p.x, 1.7, p.z + 0.4);
      this.room.add(l);
      this.torches.push({ light: l, flame: new THREE.Mesh(), phase: c });
      this.brazierObjs.set(c, g);
    }
    // corners and walls of the board read as dark stone hexes
    for (let c = 0; c < CELLS; c++) {
      const fx = this.cells[c];
      fx.fill.visible = !a.blocked[c];
      fx.edgeMat.opacity = a.blocked[c] ? 0 : 0.45;
    }
  }

  topple(c: Cell): void {
    const g = this.brazierObjs.get(c);
    if (g) {
      g.rotation.z = 1.35;
      g.position.y = 0.35;
    }
  }

  private buildCells(): void {
    const hex = (r: number) => new THREE.CircleGeometry(r, 6, Math.PI / 6).rotateX(-Math.PI / 2);
    const fillGeo = hex(R * 0.94);
    const edgeGeo = new THREE.RingGeometry(R * 0.9, R * 0.97, 6, 1, Math.PI / 6).rotateX(
      -Math.PI / 2,
    );
    const ringGeo = new THREE.RingGeometry(R * 0.72, R * 0.88, 6, 1, Math.PI / 6).rotateX(
      -Math.PI / 2,
    );
    const threatGeo = hex(R * 0.86);
    const flameGeo = new THREE.ConeGeometry(0.14, 0.6, 7).translate(0, 0.3, 0);
    const puffGeo = new THREE.SphereGeometry(0.26, 12, 8);
    for (let c = 0; c < CELLS; c++) {
      const p = cellPos(c);
      const fillMat = new THREE.MeshBasicMaterial({
        color: "#0c0a08",
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.position.set(p.x, 0.025, p.z);
      const edgeMat = new THREE.MeshBasicMaterial({
        color: "#e8dcc0",
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(p.x, 0.03, p.z);
      const threatMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ff3a2a").multiplyScalar(1.6),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const threat = new THREE.Mesh(threatGeo, threatMat);
      threat.position.set(p.x, 0.04, p.z);
      const ringMat = new THREE.MeshBasicMaterial({
        color: "#fff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(p.x, 0.06, p.z);
      const fire = new THREE.Group();
      for (let k = 0; k < 7; k++) {
        const fm = new THREE.MeshBasicMaterial({
          color: new THREE.Color(k % 2 ? "#ffb040" : "#ff6a20").multiplyScalar(1.4),
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const f = new THREE.Mesh(flameGeo, fm);
        const a = (k / 7) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.55, 0.03, Math.sin(a) * 0.5);
        f.userData.phase = k * 1.3 + c;
        fire.add(f);
      }
      fire.position.set(p.x, 0, p.z);
      fire.visible = false;
      const oil = new THREE.Mesh(
        hex(R * 0.8),
        new THREE.MeshStandardMaterial({
          color: "#1c140c",
          roughness: 0.08,
          metalness: 0.5,
          transparent: true,
          opacity: 0.9,
        }),
      );
      oil.position.set(p.x, 0.035, p.z);
      oil.visible = false;
      const poison = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const pm = new THREE.Mesh(
          puffGeo,
          new THREE.MeshStandardMaterial({
            color: "#7ae04a",
            emissive: "#3a8a1a",
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.32,
            depthWrite: false,
          }),
        );
        pm.userData.phase = k * 1.1 + c;
        pm.userData.base = new THREE.Vector3(
          Math.cos(k * 1.05) * 0.55,
          0.15 + (k % 3) * 0.18,
          Math.sin(k * 1.05) * 0.45,
        );
        poison.add(pm);
      }
      poison.position.set(p.x, 0, p.z);
      poison.visible = false;
      const ward = new THREE.Group();
      const wr = new THREE.Mesh(
        new THREE.RingGeometry(R * 0.6, R * 0.68, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color("#7ac8ff").multiplyScalar(2),
          transparent: true,
          opacity: 0.9,
        }),
      );
      wr.position.y = 0.07;
      const wc = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 0.62, R * 0.62, 1.6, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: "#7ac8ff",
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      wc.position.y = 0.8;
      wc.rotation.y = Math.PI / 6;
      ward.add(wr, wc);
      ward.position.set(p.x, 0, p.z);
      ward.visible = false;
      this.scene.add(fill, edge, threat, ring, fire, oil, poison, ward);
      this.cells.push({
        fill,
        fillMat,
        edgeMat,
        threat,
        threatMat,
        ring,
        ringMat,
        mark: null,
        fire,
        oil,
        poison,
        ward,
        ground: { fire: 0, firePow: 0, oil: 0, poison: 0, ward: 0 },
        burst: 0,
      });
    }
  }

  setGround(c: Cell, g: Ground): void {
    const fx = this.cells[c];
    fx.ground = { ...g };
    fx.fire.visible = g.fire > 0;
    fx.fire.scale.setScalar(g.firePow > 2 ? 1.45 : 1);
    fx.oil.visible = g.oil > 0;
    fx.poison.visible = g.poison > 0;
    fx.ward.visible = g.ward > 0;
  }
  setThreat(c: Cell, level: number): void {
    this.cells[c].threatMat.opacity = level > 0 ? Math.min(0.62, 0.3 + level * 0.05) : 0;
  }
  setMark(c: Cell, m: Mark): void {
    const fx = this.cells[c];
    fx.mark = m;
    if (m) fx.ringMat.color.set(MARK_COLOR[m]).multiplyScalar(m === "entry" ? 0.9 : 1.5);
  }
  burst(c: Cell): void {
    this.cells[c].burst = performance.now() / 1000;
  }

  // ---------------- arrows --------------------------------------------------------

  clearArrows(): void {
    for (const o of this.arrows.children) {
      (o as THREE.Mesh).geometry?.dispose();
    }
    this.arrows.clear();
  }

  /** A flat arrow along a path of cells. */
  arrow(
    cells: Cell[],
    color: string,
    opts: { y?: number; width?: number; dashed?: boolean; head?: boolean } = {},
  ): void {
    if (cells.length < 2) return;
    const y = opts.y ?? 0.09;
    const w = opts.width ?? 0.16;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.4),
      transparent: true,
      opacity: opts.dashed ? 0.65 : 0.92,
      depthWrite: false,
    });
    for (let i = 0; i < cells.length - 1; i++) {
      const a = cellPos(cells[i]),
        b = cellPos(cells[i + 1]);
      const last = i === cells.length - 2;
      const dir = b.clone().sub(a);
      const len = dir.length() - (last && opts.head !== false ? 0.55 : 0);
      const segs = opts.dashed ? 3 : 1;
      for (let k = 0; k < segs; k++) {
        const sl = len / segs;
        const piece = opts.dashed ? sl * 0.6 : sl;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(piece, w).rotateX(-Math.PI / 2), mat);
        const mid = a.clone().add(dir.clone().setLength(sl * k + piece / 2 + (i === 0 ? 0 : 0)));
        m.position.set(mid.x, y, mid.z);
        m.rotation.y = -Math.atan2(dir.z, dir.x);
        this.arrows.add(m);
      }
      if (last && opts.head !== false) {
        const head = new THREE.Mesh(
          new THREE.ConeGeometry(w * 2.2, 0.55, 3).rotateZ(-Math.PI / 2).rotateX(-Math.PI / 2),
          mat,
        );
        const tip = b.clone().sub(dir.clone().setLength(0.3));
        head.position.set(tip.x, y, tip.z);
        head.rotation.y = -Math.atan2(dir.z, dir.x);
        this.arrows.add(head);
      }
    }
  }

  // ---------------- units ---------------------------------------------------------

  addUnit(id: number, kind: Kind, cell: Cell, side: "A" | "E", rise = false): void {
    if (this.visuals.has(id)) return;
    const { rig, scale } = this.models.make(kind);
    rig.group.scale.setScalar(scale);
    rig.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    const root = new THREE.Group();
    root.add(rig.group);
    const face = side === "A" ? Math.PI / 2 : -Math.PI / 2;
    root.rotation.y = face;
    root.position.copy(cellPos(cell));
    this.scene.add(root);
    this.visuals.set(id, {
      id,
      kind,
      root,
      rig,
      path: [],
      moveT0: 0,
      moveDur: 0,
      anim: "idle",
      animT0: 0,
      dying: false,
      rise: rise ? 0 : 1,
      face,
      height: HEIGHT[kind] ?? 2,
    });
  }

  place(id: number, cell: Cell): void {
    const v = this.visuals.get(id);
    if (!v) return;
    v.root.position.copy(cellPos(cell));
    v.moveDur = 0;
  }

  move(id: number, cells: Cell[], now: number, dur: number): void {
    const v = this.visuals.get(id);
    if (!v || !cells.length) return;
    v.path = [v.root.position.clone(), ...cells.map(cellPos)];
    v.moveT0 = now;
    v.moveDur = dur;
    const a = v.path[v.path.length - 2],
      b = v.path[v.path.length - 1];
    if (a.distanceTo(b) > 0.01) v.face = Math.atan2(b.x - a.x, b.z - a.z);
  }

  faceTo(id: number, cell: Cell): void {
    const v = this.visuals.get(id);
    if (!v) return;
    const b = cellPos(cell);
    v.face = Math.atan2(b.x - v.root.position.x, b.z - v.root.position.z);
  }

  play(id: number, anim: AnimState, now: number): void {
    const v = this.visuals.get(id);
    if (!v || v.dying) return;
    v.anim = anim;
    v.animT0 = now;
    if (anim === "death") v.dying = true;
  }

  removeUnit(id: number): void {
    const v = this.visuals.get(id);
    if (!v) return;
    this.scene.remove(v.root);
    this.visuals.delete(id);
  }

  clearUnits(): void {
    for (const id of this.visuals.keys()) this.removeUnit(id);
  }

  // ---------------- picking, screen positions --------------------------------------

  pick(clientX: number, clientY: number): Cell | null {
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.pickPlane, hit)) return null;
    let best: Cell | null = null,
      bd = Infinity;
    for (let c = 0; c < CELLS; c++) {
      const d = cellPos(c).distanceTo(hit);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return bd < R * 0.95 ? best : null;
  }
  screen(p: THREE.Vector3): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }
  cellScreen(c: Cell, up = 0): { x: number; y: number } {
    return this.screen(cellPos(c).setY(up));
  }
  unitScreen(id: number, up?: number): { x: number; y: number } | null {
    const v = this.visuals.get(id);
    if (!v) return null;
    return this.screen(v.root.position.clone().add(new THREE.Vector3(0, up ?? v.height, 0)));
  }

  // ---------------- frame -----------------------------------------------------------

  update(now: number): void {
    for (const v of this.visuals.values()) {
      if (v.moveDur > 0) {
        const k = Math.max(0, Math.min(1, (now - v.moveT0) / v.moveDur));
        const n = v.path.length - 1;
        const f = k * n;
        const i = Math.max(0, Math.min(n - 1, Math.floor(f)));
        const e = f - i;
        v.root.position.lerpVectors(v.path[i], v.path[i + 1], e * e * (3 - 2 * e));
        v.root.position.y = Math.sin(e * Math.PI) * 0.1;
        if (k >= 1) v.moveDur = 0;
      }
      let d = v.face - v.root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.root.rotation.y += d * 0.18;
      let t = now - v.animT0;
      const len =
        v.anim === "attack" ? 1.0 : v.anim === "hit" ? 0.45 : v.anim === "death" ? 1.2 : 0;
      if (len && t > len && v.anim !== "death") {
        v.anim = "idle";
        t = 0;
      }
      animate(v.rig, v.moveDur > 0 ? "walk" : v.anim, Math.min(t, len || t), now + v.id * 0.37);
      if (v.rise < 1) {
        v.rise = Math.min(1, v.rise + 0.04);
        v.rig.group.position.y = (v.rise - 1) * 1.6;
      }
      if (v.dying && t > 1.4) {
        const k = Math.min(1, (t - 1.4) / 0.6);
        v.root.position.y = -k * 0.9;
        if (k >= 1) this.removeUnit(v.id);
      }
    }
    const pulse = 0.55 + 0.45 * Math.sin(now * 6);
    const real = performance.now() / 1000;
    for (const fx of this.cells) {
      fx.ringMat.opacity = fx.mark
        ? fx.mark === "target" || fx.mark === "entry"
          ? 0.45 + 0.4 * pulse
          : 0.95
        : 0;
      if (fx.threatMat.opacity > 0) fx.threat.scale.setScalar(1 + 0.03 * Math.sin(now * 5));
      if (fx.fire.visible)
        for (const f of fx.fire.children) {
          const ph = f.userData.phase;
          f.scale.set(
            1,
            0.7 + 0.45 * Math.abs(Math.sin(now * 7 + ph)) + (fx.ground.firePow > 2 ? 0.6 : 0),
            1,
          );
          f.rotation.y = now * 2 + ph;
        }
      if (fx.poison.visible)
        for (const p of fx.poison.children) {
          const b = p.userData.base as THREE.Vector3;
          const ph = p.userData.phase;
          p.position.set(
            b.x + Math.sin(now * 0.8 + ph) * 0.12,
            b.y + Math.sin(now * 1.1 + ph) * 0.1,
            b.z,
          );
        }
      if (fx.ward.visible) fx.ward.children[1].rotation.y = now * 0.5;
      const bk = 1 - (real - fx.burst) / 0.8;
      fx.fillMat.color.set(bk > 0 && fx.burst > 0 ? "#ff7a30" : "#0c0a08");
      fx.fillMat.opacity = bk > 0 && fx.burst > 0 ? 0.5 * bk + 0.22 : 0.22;
    }
    for (const tc of this.torches) {
      tc.light.intensity =
        5.5 * (0.9 + 0.1 * Math.sin(now * 9 + tc.phase) * Math.sin(now * 5.3 + tc.phase));
      tc.flame.scale.y = 0.9 + 0.2 * Math.sin(now * 11 + tc.phase);
    }
  }

  render(now: number): void {
    this.composer.render(now * 1000);
  }
}
