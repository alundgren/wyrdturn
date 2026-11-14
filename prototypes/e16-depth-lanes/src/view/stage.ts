// The first-person view: a crypt corridor 3 lanes wide and 6 rows deep (row 0 is the
// party line, under the camera). Floor markings per cell, red threat cells, ground
// effects, units. Knows nothing about the rules beyond what main.ts tells it.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { makeComposer } from "./post.ts";
import { loadModels, type Models } from "./models.ts";
import { animate, type AnimState, type Rig } from "./rig.ts";
import type { Ground, Kind } from "../rules/combat.ts";

export const LANES = 3;
export const ROWS = 5;
const CELL = 2;
export const cellPos = (lane: number, row: number) =>
  new THREE.Vector3((lane - 1) * CELL, 0, -row * CELL);

export type Mark = "target" | "hover" | "step" | null;

interface CellFx {
  lane: number;
  row: number;
  pad: THREE.Mesh;
  red: THREE.Mesh;
  redMat: THREE.MeshBasicMaterial;
  edge: THREE.Mesh;
  edgeMat: THREE.MeshBasicMaterial;
  mark: Mark;
  fire: THREE.Group;
  flames: THREE.Mesh[];
  oil: THREE.Mesh;
  ice: THREE.Mesh;
  poison: THREE.Group;
  ward: THREE.Group;
  ground: Ground;
  hit: THREE.Mesh;
  redOn: boolean;
}

interface Visual {
  id: number;
  kind: Kind;
  root: THREE.Group;
  rig: Rig;
  from: THREE.Vector3;
  to: THREE.Vector3;
  moveT0: number;
  moveDur: number;
  anim: AnimState;
  animT0: number;
  dying: boolean;
  rise: number;
  top: number; // height of the model's top, measured when added
}

export const HEIGHT: Partial<Record<Kind, number>> = {
  wolf: 1.2,
  servant: 1.9,
  totem: 2.0,
  ghoul: 2.3,
  spear: 2.1,
  archer: 2.1,
  priest: 2.0,
  spider: 1.1,
  warden: 2.4,
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
  mats: Record<string, THREE.MeshStandardMaterial> = {};
  raycaster = new THREE.Raycaster();
  camX = 0;
  camTarget = 0;
  heroMarker: THREE.Mesh;
  // a few fire lights shared by the burning cells (one light per cell is too slow)
  fireLights: THREE.PointLight[] = [];

  constructor(parent: HTMLElement, opts: { shot: boolean }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: opts.shot });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 40);
    this.scene.background = new THREE.Color("#1a1612");
    this.scene.fog = new THREE.FogExp2(new THREE.Color("#4a4438"), 0.022);
    // bright base light: readable everywhere, torches are warm accents (design/direction.md)
    this.scene.add(new THREE.HemisphereLight("#e0d4c0", "#8a7860", 2.4));
    const key = new THREE.DirectionalLight("#fff0dc", 1.3);
    key.position.set(-3, 9, 4);
    key.target.position.set(0, 0, -6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -8,
      right: 8,
      top: 10,
      bottom: -10,
      near: 1,
      far: 30,
    });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    this.scene.add(key, key.target);
    const fill = new THREE.DirectionalLight("#fff4e0", 0.7);
    fill.position.set(0, 3, 6);
    this.scene.add(fill);
    this.composer = makeComposer(this.renderer, this.scene, this.camera, "moody");
    this.composer.grade.uniforms.vignette.value = 0.28;
    this.composer.grade.uniforms.grain.value = 0.012;
    this.composer.gtao.blendIntensity = 0.6;
    this.heroMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.78, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ffd65a").multiplyScalar(1.6),
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.heroMarker.position.y = 0.06;
    this.scene.add(this.heroMarker);
    for (let k = 0; k < 4; k++) {
      const l = new THREE.PointLight("#ff7a30", 0, 6, 1);
      this.fireLights.push(l);
      this.scene.add(l);
    }
    this.frame();
    addEventListener("resize", () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
      this.frame();
    });
  }

  // The party's eyes: a step behind the line and a little above head height, sliding
  // sideways with the hero (half a lane per lane, so all three line cells stay in view).
  frame(): void {
    const aspect = innerWidth / innerHeight;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1.5 ? 66 : 58;
    const x = this.camX;
    // tilted down so the party line shows above the hand of cards
    this.camera.position.set(x, 2.35, 3.1);
    this.camera.lookAt(x * 0.55, 0, -2.0);
    this.camera.updateProjectionMatrix();
  }

  setHeroLane(lane: number, instant = false): void {
    this.camTarget = (lane - 1) * CELL * 0.45;
    if (instant) this.camX = this.camTarget;
    const p = cellPos(lane, 0);
    this.heroMarker.position.set(p.x, 0.06, p.z);
  }

  async load(): Promise<void> {
    const tl = new THREE.TextureLoader();
    const pbr = (dir: string) => {
      const map = tl.load(`${dir}/basecolor.webp`);
      map.colorSpace = THREE.SRGBColorSpace;
      const normalMap = tl.load(`${dir}/normal.webp`);
      const roughnessMap = tl.load(`${dir}/roughness.webp`);
      for (const t of [map, normalMap, roughnessMap]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
      }
      return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1 });
    };
    this.mats.wall = pbr("tex/biomes/crypt/wall");
    this.mats.floor = pbr("tex/biomes/crypt/floor");
    const [kit, models] = await Promise.all([new GLTFLoader().loadAsync("kit.glb"), loadModels()]);
    this.kit = kit.scene;
    this.models = models;
    this.buildHall();
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
    this.scene.add(o);
    return o;
  }

  private buildHall(): void {
    const X = 3; // side walls at the outer lane edges
    for (let lane = 0; lane < LANES; lane++)
      for (let row = -2; row <= ROWS; row++) {
        const p = cellPos(lane, row);
        this.piece("kit_floor", p.x, p.z);
        this.piece("kit_ceiling", p.x, p.z);
      }
    for (let row = -2; row <= ROWS; row++) {
      const z = -row * CELL;
      this.piece("kit_wall", -X, z, Math.PI / 2);
      this.piece("kit_wall", X, z, -Math.PI / 2);
      if (row % 2 === 0) this.piece("kit_beam", 0, z, Math.PI / 2);
    }
    // far wall with the doorway the waves come through
    const backZ = -ROWS * CELL - 1;
    for (let lane = 0; lane < LANES; lane++)
      this.piece(lane === 1 ? "kit_doorway" : "kit_wall", (lane - 1) * CELL, backZ);
    this.piece("kit_doorframe", 0, backZ + 0.1);
    // a dark void beyond the door
    const voidMat = new THREE.MeshBasicMaterial({ color: "#0a0806" });
    const v = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), voidMat);
    v.position.set(0, 1.5, backZ - 0.6);
    this.scene.add(v);
    // torches: warm accents on the side walls
    const flameMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffc070").multiplyScalar(4),
    });
    [
      [-X + 0.12, -3, Math.PI / 2],
      [X - 0.12, -3, -Math.PI / 2],
      [-X + 0.12, -9, Math.PI / 2],
      [X - 0.12, -9, -Math.PI / 2],
    ].forEach(([x, z, r], i) => {
      const g = this.piece("kit_sconce", x, z, r, 2.0);
      g.traverse((m) => (m.castShadow = false));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 8), flameMat);
      flame.position.set(0, 0.22, 0.3);
      g.add(flame);
      const light = new THREE.PointLight("#ffb070", 5, 10, 1);
      light.position.set(0, 0.45, 1.0);
      g.add(light);
      this.torches.push({ light, flame, phase: i * 1.7 });
    });
    // bone piles in the corners by the door
    for (const [x, z, r] of [
      [-2.3, -10.3, 0.4],
      [2.4, -10.2, 2.0],
    ]) {
      const b = this.models.prop("bones");
      if (!b) continue;
      b.position.set(x, 0, z);
      b.rotation.y = r;
      this.scene.add(b);
    }
  }

  private buildCells(): void {
    const S = CELL * 0.92;
    const padGeo = new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2);
    // a square frame 7 cm wide: thick enough to read from the far end of the corridor
    const frame = new THREE.Shape();
    frame
      .moveTo(-S / 2, -S / 2)
      .lineTo(S / 2, -S / 2)
      .lineTo(S / 2, S / 2)
      .lineTo(-S / 2, S / 2);
    const hole = new THREE.Path();
    const H = S / 2 - 0.07;
    hole.moveTo(-H, -H).lineTo(-H, H).lineTo(H, H).lineTo(H, -H);
    frame.holes.push(hole);
    const edgeGeo = new THREE.ShapeGeometry(frame).rotateX(-Math.PI / 2);
    const flameGeo = new THREE.ConeGeometry(0.14, 0.6, 7);
    flameGeo.translate(0, 0.3, 0);
    const puffGeo = new THREE.SphereGeometry(0.28, 12, 8);
    for (let row = 0; row <= ROWS; row++)
      for (let lane = 0; lane < LANES; lane++) {
        const p = cellPos(lane, row);
        const line = row === 0;
        const pad = new THREE.Mesh(
          padGeo,
          new THREE.MeshBasicMaterial({
            color: line ? "#5a7aa8" : "#c8b898",
            transparent: true,
            opacity: line ? 0.22 : 0.1,
            depthWrite: false,
          }),
        );
        pad.position.set(p.x, 0.03, p.z);
        this.scene.add(pad);
        const edgeMat = new THREE.MeshBasicMaterial({
          color: line ? "#9ac0ff" : "#f0e0c0",
          transparent: true,
          opacity: line ? 0.75 : 0.42,
          depthWrite: false,
        });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.set(p.x, 0.045, p.z);
        this.scene.add(edge);
        const redMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color("#ff2a1a").multiplyScalar(1.4),
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const red = new THREE.Mesh(padGeo, redMat);
        red.position.set(p.x, 0.05, p.z);
        this.scene.add(red);
        // fire: lights exist from the start so shaders never recompile
        const fire = new THREE.Group();
        const flames: THREE.Mesh[] = [];
        for (let k = 0; k < 8; k++) {
          const fm = new THREE.MeshBasicMaterial({
            color: new THREE.Color(k % 2 ? "#ffb040" : "#ff6a20").multiplyScalar(1.3),
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const f = new THREE.Mesh(flameGeo, fm);
          const a = (k / 8) * Math.PI * 2;
          f.position.set(Math.cos(a) * 0.55, 0.03, Math.sin(a) * 0.55);
          f.userData.phase = k * 1.3;
          fire.add(f);
          flames.push(f);
        }
        fire.position.copy(p);
        fire.visible = false;
        this.scene.add(fire);
        const oil = new THREE.Mesh(
          new THREE.CircleGeometry(0.85, 28).rotateX(-Math.PI / 2),
          new THREE.MeshStandardMaterial({
            color: "#1c140c",
            roughness: 0.08,
            metalness: 0.5,
            transparent: true,
            opacity: 0.9,
          }),
        );
        oil.position.set(p.x, 0.055, p.z);
        oil.visible = false;
        this.scene.add(oil);
        const ice = new THREE.Mesh(
          new THREE.PlaneGeometry(S * 0.94, S * 0.94).rotateX(-Math.PI / 2),
          new THREE.MeshStandardMaterial({
            color: "#bfe8ff",
            emissive: "#5aa8e0",
            emissiveIntensity: 0.5,
            roughness: 0.1,
            transparent: true,
            opacity: 0.7,
          }),
        );
        ice.position.set(p.x, 0.06, p.z);
        ice.visible = false;
        this.scene.add(ice);
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
          pm.userData.phase = k * 1.1;
          pm.userData.base = new THREE.Vector3(
            Math.cos(k * 1.05) * 0.55,
            0.15 + (k % 3) * 0.18,
            Math.sin(k * 1.05) * 0.5,
          );
          poison.add(pm);
        }
        poison.position.copy(p);
        poison.visible = false;
        this.scene.add(poison);
        const ward = new THREE.Group();
        const wr = new THREE.Mesh(
          new THREE.RingGeometry(0.66, 0.78, 40).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#7ac8ff").multiplyScalar(2),
            transparent: true,
            opacity: 0.9,
          }),
        );
        wr.position.y = 0.07;
        const wc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.72, 0.72, 2.2, 32, 1, true),
          new THREE.MeshBasicMaterial({
            color: "#7ac8ff",
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        wc.position.y = 1.1;
        ward.add(wr, wc);
        ward.position.copy(p);
        ward.visible = false;
        this.scene.add(ward);
        // body-sized card standing on the cell: a click on a unit picks its cell
        const hit = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 2.0),
          new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
        );
        hit.position.set(p.x, 1.0, p.z);
        hit.userData = { lane, row };
        hit.layers.set(1); // never drawn, only picked
        this.scene.add(hit);
        this.cells.push({
          lane,
          row,
          pad,
          red,
          redMat,
          edge,
          edgeMat,
          mark: null,
          fire,
          flames,
          oil,
          ice,
          poison,
          ward,
          ground: { fire: 0, blaze: false, oil: false, ice: 0, poison: 0, ward: false },
          hit,
          redOn: false,
        });
      }
  }

  cell(lane: number, row: number): CellFx {
    return this.cells[lane + row * LANES];
  }

  // ---------------- units ----------------------------------------------------------

  addUnit(id: number, kind: Kind, lane: number, row: number, rise = false): void {
    if (this.visuals.has(id) || kind === "hero") return; // first person: the hero is the camera
    const { rig, scale } = this.models.make(kind);
    const root = new THREE.Group();
    rig.group.scale.multiplyScalar(scale);
    root.add(rig.group);
    rig.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    const enemy = !["wolf", "servant", "totem"].includes(kind);
    root.rotation.y = enemy ? 0 : Math.PI; // enemies face the party (+z)
    const p = cellPos(lane, row);
    root.position.copy(p);
    this.scene.add(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.group);
    const top = Number.isFinite(box.max.y) ? box.max.y - p.y : (HEIGHT[kind] ?? 2);
    this.visuals.set(id, {
      id,
      kind,
      root,
      rig,
      from: p.clone(),
      to: p.clone(),
      moveT0: 0,
      moveDur: 0,
      anim: "idle",
      animT0: 0,
      dying: false,
      rise: rise ? 0 : 1,
      top,
    });
  }

  moveUnit(id: number, lane: number, row: number, now: number, dur = 0.32): void {
    const v = this.visuals.get(id);
    if (!v) return;
    v.from.copy(v.root.position);
    v.to.copy(cellPos(lane, row));
    v.moveT0 = now;
    v.moveDur = dur;
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

  // ---------------- cells -------------------------------------------------------

  setGround(lane: number, row: number, g: Ground): void {
    const fx = this.cell(lane, row);
    fx.ground = { ...g };
    fx.fire.visible = g.fire > 0;
    fx.fire.scale.setScalar(g.blaze ? 1.35 : 1);
    fx.oil.visible = g.oil;
    fx.ice.visible = g.ice > 0;
    fx.poison.visible = g.poison > 0;
    fx.ward.visible = g.ward;
  }

  setRed(lane: number, row: number, on: boolean): void {
    this.cell(lane, row).redOn = on;
  }

  setMark(lane: number, row: number, m: Mark): void {
    this.cell(lane, row).mark = m;
  }

  // The cell under the mouse: the nearest unit body hit (cells where `occupied` is true),
  // otherwise the floor cell under the mouse.
  pick(
    clientX: number,
    clientY: number,
    occupied: (lane: number, row: number) => boolean = () => false,
  ): { lane: number; row: number } | null {
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.layers.set(1);
    const bodies = this.cells.filter((c) => occupied(c.lane, c.row)).map((c) => c.hit);
    const hit = this.raycaster.intersectObjects(bodies, false)[0];
    if (hit) return hit.object.userData as { lane: number; row: number };
    const floor = this.raycaster.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      new THREE.Vector3(),
    );
    if (!floor) return null;
    const lane = Math.round(floor.x / CELL) + 1;
    const row = Math.round(-floor.z / CELL);
    return lane >= 0 && lane < LANES && row >= 0 && row <= ROWS ? { lane, row } : null;
  }

  screen(pos: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const v = pos.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * innerWidth,
      y: (-v.y * 0.5 + 0.5) * innerHeight,
      behind: v.z > 1,
    };
  }
  // Height of a unit's model top (falls back to HEIGHT before it exists).
  unitTop(id: number, kind: Kind): number {
    return this.visuals.get(id)?.top ?? HEIGHT[kind] ?? 2;
  }
  unitScreen(id: number, up: number) {
    const v = this.visuals.get(id);
    if (!v) return null;
    return this.screen(v.root.position.clone().add(new THREE.Vector3(0, up, 0)));
  }
  cellScreen(lane: number, row: number, up = 0.1) {
    return this.screen(cellPos(lane, row).add(new THREE.Vector3(0, up, 0)));
  }

  // ---------------- frame --------------------------------------------------------

  update(now: number): void {
    if (Math.abs(this.camX - this.camTarget) > 0.001) {
      this.camX += (this.camTarget - this.camX) * 0.18;
      this.frame();
    }
    for (const v of this.visuals.values()) {
      if (v.moveDur > 0) {
        const k = Math.min(1, (now - v.moveT0) / v.moveDur);
        const e = k * k * (3 - 2 * k);
        v.root.position.lerpVectors(v.from, v.to, e);
        v.root.position.y = Math.sin(k * Math.PI) * 0.12;
        if (k >= 1) v.moveDur = 0;
      }
      let t = now - v.animT0;
      const len =
        v.anim === "attack" ? 0.9 : v.anim === "hit" ? 0.45 : v.anim === "death" ? 1.2 : 0;
      if (len && t > len && v.anim !== "death") {
        v.anim = "idle";
        t = 0;
      }
      animate(v.rig, v.moveDur > 0 ? "walk" : v.anim, Math.min(t, len || t), now + v.id * 0.37);
      if (v.rise < 1) {
        v.rise = Math.min(1, v.rise + 0.05);
        v.rig.group.position.y = (v.rise - 1) * 1.6;
      }
      if (v.dying && t > 1.4) {
        const k = Math.min(1, (t - 1.4) / 0.5);
        v.root.position.y = -k * 0.9;
        if (k >= 1) this.removeUnit(v.id);
      }
    }
    const pulse = 0.5 + 0.5 * Math.sin(now * 5);
    for (const fx of this.cells) {
      fx.redMat.opacity = fx.redOn ? 0.34 + 0.16 * pulse : 0;
      const line = fx.row === 0;
      if (fx.mark === "target") {
        fx.edgeMat.color.set("#7dff9a");
        fx.edgeMat.opacity = 0.65 + 0.35 * pulse;
      } else if (fx.mark === "hover") {
        fx.edgeMat.color.set("#ffffff");
        fx.edgeMat.opacity = 1;
      } else if (fx.mark === "step") {
        fx.edgeMat.color.set("#ffd65a");
        fx.edgeMat.opacity = 1;
      } else {
        fx.edgeMat.color.set(line ? "#9ac0ff" : "#f0e0c0");
        fx.edgeMat.opacity = line ? 0.75 : 0.42;
      }
      const padMat = fx.pad.material as THREE.MeshBasicMaterial;
      padMat.color.set(
        fx.mark === "target"
          ? "#5aff80"
          : fx.mark === "hover"
            ? "#ffffff"
            : line
              ? "#5a7aa8"
              : "#c8b898",
      );
      padMat.opacity =
        fx.mark === "target" ? 0.16 + 0.1 * pulse : fx.mark === "hover" ? 0.3 : line ? 0.22 : 0.1;
      if (fx.fire.visible) {
        fx.flames.forEach((f) => {
          const ph = f.userData.phase;
          f.scale.set(
            1,
            0.7 + 0.45 * Math.abs(Math.sin(now * 7 + ph)) + (fx.ground.blaze ? 0.6 : 0),
            1,
          );
          f.rotation.y = now * 2 + ph;
        });
      }
      if (fx.poison.visible)
        fx.poison.children.forEach((p) => {
          const b = p.userData.base as THREE.Vector3;
          const ph = p.userData.phase;
          p.position.set(
            b.x + Math.sin(now * 0.8 + ph) * 0.12,
            b.y + Math.sin(now * 1.1 + ph) * 0.1,
            b.z,
          );
        });
      if (fx.ward.visible) fx.ward.children[1].rotation.y = now * 0.5;
    }
    const burning = this.cells.filter((c) => c.ground.fire > 0).sort((a, b) => a.row - b.row);
    this.fireLights.forEach((l, k) => {
      const c = burning[k];
      if (!c) {
        l.intensity = 0;
        return;
      }
      const p = cellPos(c.lane, c.row);
      l.position.set(p.x, 0.9, p.z + 0.4);
      l.intensity = (c.ground.blaze ? 8 : 4.5) * (0.85 + 0.15 * Math.sin(now * 13 + c.lane));
    });
    for (const tc of this.torches) {
      tc.light.intensity =
        5 * (0.9 + 0.1 * Math.sin(now * 9 + tc.phase) * Math.sin(now * 5.3 + tc.phase));
      tc.flame.scale.y = 0.9 + 0.2 * Math.sin(now * 11 + tc.phase);
    }
    const hm = this.heroMarker.material as THREE.MeshBasicMaterial;
    hm.opacity = 0.7 + 0.3 * pulse;
  }

  render(now: number): void {
    this.composer.render(now * 1000);
  }
}
