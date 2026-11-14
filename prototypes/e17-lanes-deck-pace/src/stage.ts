// The 3D side view: a dungeon hall from the e11 kit, two rows of 4 slots, animated units,
// ground effects on slots, threat and target rings. Knows nothing about the rules beyond
// what the game layer tells it.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { autorigBiped, rigidMonster } from "./autorig.ts";
import { animate, makeArchetype } from "./monster.ts";
import { makeComposer } from "./post.ts";
import type { Ground, Side } from "./rules.ts";

export type Anim = "idle" | "attack" | "hit" | "death" | "walk";
export type Ring = "target" | "hover" | "move" | "active" | "threat" | "ready";

const SLOT_GAP = 1.75;
const MID = 1.15; // half the gap between the two front slots
export const slotX = (side: Side, slot: number) =>
  side === "P" ? -(MID + slot * SLOT_GAP) : MID + slot * SLOT_GAP;
const SLOT_Z = 0.4;

const THEMES = {
  crypt: {
    hemiSky: "#c8d4e8",
    hemiGround: "#6a7488",
    fog: "#3e4a5c",
    torch: "#9fe8dc",
    key: "#dfe8ff",
  },
  moss: {
    hemiSky: "#dce8c0",
    hemiGround: "#7a8a5a",
    fog: "#4a5a3e",
    torch: "#ffbf70",
    key: "#fff0d8",
  },
};
export type Theme = keyof typeof THEMES;

// Look of each unit kind: model source, scale, colour lift/tint, label height.
const LOOK: Record<string, { src: string; scale: number; tint?: string; h: number }> = {
  hero: { src: "code:cultist", scale: 1.05, tint: "#ffe2b8", h: 2.0 },
  beetle: { src: "beetle", scale: 1.1, h: 1.25 }, // code-built: round shell, horn, short legs
  servant: { src: "code:skeleton", scale: 0.95, tint: "#e8f0ff", h: 1.95 },
  totem: { src: "totem", scale: 1, h: 1.7 },
  brute: { src: "skeleton", scale: 1.18, tint: "#ffd8b0", h: 2.35 },
  archer: { src: "skeleton", scale: 0.95, tint: "#b8c8e8", h: 1.95 },
  priest: { src: "ghoul-px", scale: 1.0, tint: "#d0a8e8", h: 1.9 },
  spider: { src: "spider", scale: 0.75, h: 1.05 },
  warden: { src: "ghoul-px", scale: 1.22, tint: "#a8c0a0", h: 2.25 },
};

interface Visual {
  id: number;
  kind: string;
  side: Side;
  root: THREE.Group;
  rig: any;
  from: THREE.Vector3;
  to: THREE.Vector3;
  moveT0: number;
  moveDur: number;
  anim: Anim;
  animT0: number;
  dying: boolean;
  rise: number; // summon rise-in, 0..1
  face: number;
}

interface SlotFx {
  pad: THREE.Mesh;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  ringKind: Ring | null;
  threat: THREE.Mesh;
  fire: THREE.Group;
  flames: THREE.Mesh[];
  light: THREE.PointLight;
  oil: THREE.Mesh;
  poison: THREE.Group;
  ward: THREE.Group;
  ground: Ground;
  burst: number; // combo flash timer
  burstColor: THREE.Color;
  hit: THREE.Mesh; // invisible click box
}

const RING_COLOR: Record<Ring, string> = {
  target: "#7dff9a",
  hover: "#ffffff",
  move: "#ffd65a",
  active: "#ffd65a",
  threat: "#ff4a3a",
  ready: "#8fd0ff",
};

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: ReturnType<typeof makeComposer>;
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  torches: { light: THREE.PointLight; flame: THREE.Mesh; phase: number }[] = [];
  visuals = new Map<number, Visual>();
  slots: Record<Side, SlotFx[]> = { P: [], E: [] };
  sources: Record<string, THREE.Mesh> = {};
  mats: Record<string, THREE.Material> = {};
  wallMats: Record<string, THREE.MeshStandardMaterial> = {};
  floorMats: Record<string, THREE.MeshStandardMaterial> = {};
  walls: THREE.Mesh[] = [];
  floors: THREE.Mesh[] = [];
  kit: THREE.Object3D | null = null;
  raycaster = new THREE.Raycaster();
  theme: Theme = "crypt";

  constructor(canvasParent: HTMLElement, opts: { shot: boolean }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: opts.shot });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasParent.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 60);
    this.frame();
    this.scene.background = new THREE.Color("#1a1612");
    this.scene.fog = new THREE.FogExp2(new THREE.Color("#3e4a5c"), 0.028);
    this.hemi = new THREE.HemisphereLight("#c8d4e8", "#6a7488", 2.6);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight("#ffffff", 1.6);
    this.key.position.set(-4, 9, 8);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, {
      left: -10,
      right: 10,
      top: 6,
      bottom: -4,
      near: 1,
      far: 30,
    });
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.03;
    this.scene.add(this.key);
    // soft fill from the camera side so the dark TRELLIS bodies still show their outline and detail
    const fill = new THREE.DirectionalLight("#fff4e0", 0.9);
    fill.position.set(0, 3, 12);
    this.scene.add(fill);
    this.composer = makeComposer(this.renderer, this.scene, this.camera, "moody");
    this.composer.grade.uniforms.vignette.value = 0.35;
    this.composer.grade.uniforms.grain.value = 0.012;
    this.composer.gtao.blendIntensity = 0.7;
    addEventListener("resize", () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
      this.frame();
    });
  }

  // Fit the 13 m wide lane into the view, leaving the bottom quarter for the cards.
  frame(): void {
    const aspect = innerWidth / innerHeight;
    this.camera.aspect = aspect;
    const halfW = 7.6;
    const dist = Math.max(11, halfW / Math.tan(THREE.MathUtils.degToRad(15)) / aspect);
    this.camera.position.set(0, 3.0, dist);
    this.camera.lookAt(0, 0.35, 0);
    this.camera.updateProjectionMatrix();
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
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
    for (const t of ["crypt", "moss"]) {
      this.wallMats[t] = pbr(`tex/biomes/${t}/wall`);
      this.floorMats[t] = pbr(`tex/biomes/${t}/floor`);
    }
    for (const name of ["bone", "leather-cloth", "rusty-armour", "chitin"]) {
      this.mats[name] = pbr(`textures/${name}`, { roughness: 0.85 });
      (this.mats[name] as THREE.MeshStandardMaterial).roughnessMap = null;
    }
    this.mats.default = this.mats["leather-cloth"];
    const glb = async (name: string, lift = 1.8) => {
      const g = await loader.loadAsync(`trellis/${name}.glb`);
      g.scene.updateMatrixWorld(true);
      let mesh: THREE.Mesh | null = null;
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
      });
      const m = mesh as unknown as THREE.Mesh;
      (m.material as THREE.MeshStandardMaterial).color.multiplyScalar(lift); // TRELLIS albedo bakes dark
      return m;
    };
    const [kit, ...meshes] = await Promise.all([
      loader.loadAsync("kit.glb"),
      glb("skeleton"),
      glb("ghoul-px"),
      glb("spider"),
      glb("brazier", 1.5),
      glb("bones", 1.5),
    ]);
    ["skeleton", "ghoul-px", "spider", "brazier", "bones"].forEach(
      (n, i) => (this.sources[n] = meshes[i]),
    );
    this.kit = kit.scene;
    this.buildHall();
    this.buildSlots();
  }

  private piece(
    name: string,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    mats: Record<string, THREE.Material> = {},
  ) {
    const src = this.kit!.getObjectByName(name);
    if (!src) throw new Error(`kit piece ${name} missing`);
    const o = src.clone();
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mn = (mesh.material as THREE.Material).name;
      if (mats[mn]) mesh.material = mats[mn];
      mesh.castShadow = mesh.receiveShadow = true;
      if (mn === "wall") this.walls.push(mesh);
      if (mn === "floor") this.floors.push(mesh);
    });
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    this.scene.add(o);
    return o;
  }

  private buildHall(): void {
    const t = this.theme;
    const wood = new THREE.MeshStandardMaterial({ color: "#5a4030", roughness: 0.8 });
    const mats = { wall: this.wallMats[t], floor: this.floorMats[t], wood };
    for (let x = -11; x <= 11; x += 2)
      for (let z = -3; z <= 5; z += 2) this.piece("kit_floor", x, 0, z, 0, mats);
    // back wall with a doorway behind the gap between the two sides, columns every 4 m
    for (let x = -11; x <= 11; x += 2)
      this.piece(x === 1 ? "kit_doorway" : "kit_wall", x, 0, -3.1, 0, mats);
    for (let x = -11; x <= 11; x += 2) this.piece("kit_wall", x, 3, -3.1, 0, mats); // a tall hall
    this.piece("kit_doorframe", 1, 0, -3.0, 0, mats);
    for (const x of [-8, -4, 4, 8]) {
      this.piece("kit_corner", x, 0, -2.85, 0, mats);
      this.piece("kit_corner", x, 3, -2.85, 0, mats);
    }

    const flameMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffc070").multiplyScalar(4),
    });
    [-6, 0, 6].forEach((x, i) => {
      const g = this.piece("kit_sconce", x, 2.0, -2.95, 0);
      g.traverse((m) => (m.castShadow = false));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 8), flameMat);
      flame.position.set(0, 0.22, 0.3);
      g.add(flame);
      const light = new THREE.PointLight(THEMES[t].torch, 6, 12, 1);
      light.position.set(0, 0.45, 1.0);
      g.add(light);
      this.torches.push({ light, flame, phase: i * 1.7 });
    });
    // props: braziers at both ends, bone piles along the wall
    for (const x of [-9.3, 9.3]) {
      const b = this.sources.brazier.clone();
      b.position.set(x, 0, -1.6);
      b.castShadow = true;
      this.scene.add(b);
      const l = new THREE.PointLight("#ff9a48", 5, 9, 1);
      l.position.set(x, 1.6, -1.2);
      this.scene.add(l);
      this.torches.push({ light: l, flame: new THREE.Mesh(), phase: x });
    }
    for (const [x, z, r] of [
      [-3.4, -2.2, 0.4],
      [2.6, -2.3, 2.0],
      [7.2, -2.1, 1.0],
    ]) {
      const b = this.sources.bones.clone();
      b.position.set(x, 0, z);
      b.rotation.y = r;
      b.castShadow = true;
      this.scene.add(b);
    }
  }

  setTheme(t: Theme): void {
    this.theme = t;
    const th = THEMES[t];
    this.hemi.color.set(th.hemiSky);
    this.hemi.groundColor.set(th.hemiGround);
    (this.scene.fog as THREE.FogExp2).color.set(th.fog);
    this.key.color.set(th.key);
    for (const w of this.walls) w.material = this.wallMats[t];
    for (const f of this.floors) f.material = this.floorMats[t];
    for (const tc of this.torches.slice(0, 3)) tc.light.color.set(th.torch);
  }

  private buildSlots(): void {
    const padGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.04, 40);
    const ringGeo = new THREE.RingGeometry(0.74, 0.86, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const threatGeo = new THREE.RingGeometry(0.5, 0.7, 48);
    threatGeo.rotateX(-Math.PI / 2);
    const oilGeo = new THREE.CircleGeometry(0.68, 32);
    oilGeo.rotateX(-Math.PI / 2);
    const flameGeo = new THREE.ConeGeometry(0.13, 0.55, 7);
    flameGeo.translate(0, 0.27, 0);
    const puffGeo = new THREE.SphereGeometry(0.24, 12, 8);
    for (const side of ["P", "E"] as Side[]) {
      for (let i = 0; i < 4; i++) {
        const x = slotX(side, i);
        const padMat = new THREE.MeshStandardMaterial({
          color: side === "P" ? "#4a5a70" : "#704a44",
          roughness: 0.9,
          transparent: true,
          opacity: 0.55,
        });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(x, 0.02, SLOT_Z);
        pad.receiveShadow = true;
        this.scene.add(pad);
        const ringMat = new THREE.MeshBasicMaterial({
          color: "#fff",
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(x, 0.06, SLOT_Z);
        this.scene.add(ring);
        const threat = new THREE.Mesh(
          threatGeo,
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#ff3a2a").multiplyScalar(2),
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
          }),
        );
        threat.position.set(x, 0.07, SLOT_Z);
        this.scene.add(threat);
        // fire: flame cones + light (lights exist from the start so shaders never recompile)
        const fire = new THREE.Group();
        const flames: THREE.Mesh[] = [];
        for (let k = 0; k < 7; k++) {
          const fm = new THREE.MeshBasicMaterial({
            color: new THREE.Color(k % 2 ? "#ffb040" : "#ff6a20").multiplyScalar(1.3),
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const f = new THREE.Mesh(flameGeo, fm);
          const a = (k / 7) * Math.PI * 2;
          f.position.set(Math.cos(a) * 0.45, 0.03, Math.sin(a) * 0.45);
          f.userData.phase = k * 1.3;
          fire.add(f);
          flames.push(f);
        }
        fire.position.set(x, 0, SLOT_Z);
        fire.visible = false;
        this.scene.add(fire);
        const light = new THREE.PointLight("#ff7a30", 0, 5, 1);
        light.position.set(x, 0.8, SLOT_Z + 0.6);
        this.scene.add(light);
        const oil = new THREE.Mesh(
          oilGeo,
          new THREE.MeshStandardMaterial({
            color: "#1c140c",
            roughness: 0.08,
            metalness: 0.5,
            transparent: true,
            opacity: 0.92,
          }),
        );
        oil.position.set(x, 0.05, SLOT_Z);
        oil.visible = false;
        this.scene.add(oil);
        const poison = new THREE.Group();
        for (let k = 0; k < 6; k++) {
          const p = new THREE.Mesh(
            puffGeo,
            new THREE.MeshStandardMaterial({
              color: "#7ae04a",
              emissive: "#3a8a1a",
              emissiveIntensity: 0.6,
              transparent: true,
              opacity: 0.3,
              depthWrite: false,
              roughness: 1,
            }),
          );
          p.userData.phase = k * 1.1;
          p.userData.base = new THREE.Vector3(
            Math.cos(k * 1.05) * 0.55,
            0.12 + (k % 3) * 0.16,
            Math.sin(k * 1.05) * 0.4,
          );
          poison.add(p);
        }
        poison.position.set(x, 0, SLOT_Z);
        poison.visible = false;
        this.scene.add(poison);
        const ward = new THREE.Group();
        const wr = new THREE.Mesh(
          new THREE.RingGeometry(0.62, 0.72, 48).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#7ac8ff").multiplyScalar(2),
            transparent: true,
            opacity: 0.9,
          }),
        );
        wr.position.y = 0.08;
        const wc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.68, 0.68, 2.2, 32, 1, true),
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
        ward.position.set(x, 0, SLOT_Z);
        ward.visible = false;
        this.scene.add(ward);
        const hit = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 2.4, 1.6),
          new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
        );
        hit.position.set(x, 1.2, SLOT_Z);
        hit.userData = { side, slot: i };
        hit.layers.set(1); // never drawn (also not into the AO pass), only picked
        this.scene.add(hit);
        this.slots[side].push({
          pad,
          ring,
          ringMat,
          ringKind: null,
          threat,
          fire,
          flames,
          light,
          oil,
          poison,
          ward,
          ground: { fire: 0, blaze: false, oil: false, poison: 0, ward: 0 },
          burst: 0,
          burstColor: new THREE.Color(),
          hit,
        });
      }
    }
  }

  slotPos(side: Side, slot: number): THREE.Vector3 {
    return new THREE.Vector3(slotX(side, slot), 0, SLOT_Z);
  }

  // ---------------- units ----------------------------------------------------------

  private makeRig(kind: string, id: number): any {
    const look = LOOK[kind];
    if (look.src.startsWith("code:")) {
      const m = makeArchetype(look.src.slice(5), 3 + id, this.mats);
      if (look.tint) for (const mesh of m.meshes) tintMesh(mesh, look.tint);
      return m;
    }
    if (look.src === "totem") return rigidMonster(makeTotem() as any);
    if (look.src === "beetle") return rigidMonster(makeBeetle() as any);
    const src = this.sources[look.src];
    if (look.src === "spider") {
      const c = src.clone();
      c.applyMatrix4(src.matrixWorld);
      c.castShadow = true;
      return rigidMonster(c);
    }
    const rig = autorigBiped(src);
    if (look.tint) for (const mesh of rig.meshes) tintMesh(mesh, look.tint);
    return rig;
  }

  addUnit(id: number, kind: string, side: Side, slot: number, rise = false): void {
    if (this.visuals.has(id)) return;
    const rig = this.makeRig(kind, id);
    const root = new THREE.Group();
    const look = LOOK[kind];
    rig.group.scale.setScalar(look.scale);
    root.add(rig.group);
    rig.group.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    const face = side === "P" ? Math.PI / 2 - 0.55 : -Math.PI / 2 + 0.55;
    root.rotation.y = face;
    const p = this.slotPos(side, slot);
    root.position.copy(p);
    this.scene.add(root);
    this.visuals.set(id, {
      id,
      kind,
      side,
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
      face,
    });
  }

  // Animation playback rate (1 = e14). The game sets it from the pace's anim factor.
  speed = 1;

  moveUnit(id: number, side: Side, slot: number, now: number, dur = 0.35): void {
    const v = this.visuals.get(id);
    if (!v) return;
    v.from.copy(v.root.position);
    v.to.copy(this.slotPos(side, slot));
    v.moveT0 = now;
    v.moveDur = dur / this.speed;
  }

  // Skip: finish every move, attack and fall at once.
  finish(): void {
    for (const v of this.visuals.values()) {
      if (v.moveDur > 0) {
        v.root.position.copy(v.to);
        v.moveDur = 0;
      }
      if (v.anim !== "death") v.anim = "idle";
      else v.animT0 = -1e6; // jump to the end of the fall
    }
  }

  play(id: number, anim: Anim, now: number): void {
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

  unitHeight(id: number): number {
    const v = this.visuals.get(id);
    return v ? LOOK[v.kind].h : 2;
  }

  // ---------------- ground, rings -------------------------------------------------

  setGround(side: Side, slot: number, g: Ground): void {
    const fx = this.slots[side][slot];
    fx.ground = { ...g };
    fx.fire.visible = g.fire > 0;
    fx.fire.scale.setScalar(g.blaze ? 1.5 : 1);
    fx.light.intensity = g.fire > 0 ? (g.blaze ? 9 : 5) : 0;
    fx.oil.visible = g.oil;
    fx.poison.visible = g.poison > 0;
    fx.poison.scale.setScalar(0.6 + Math.min(3, g.poison) * 0.22);
    fx.ward.visible = g.ward > 0;
  }

  burst(side: Side, slot: number, color: string): void {
    const fx = this.slots[side][slot];
    fx.burst = performance.now() / 1000;
    fx.burstColor.set(color);
  }

  setRing(side: Side, slot: number, kind: Ring | null): void {
    const fx = this.slots[side][slot];
    fx.ringKind = kind;
    if (kind) fx.ringMat.color.set(RING_COLOR[kind]).multiplyScalar(1.6);
  }

  setThreat(side: Side, slot: number, on: boolean): void {
    (this.slots[side][slot].threat.material as THREE.MeshBasicMaterial).opacity = on ? 0.85 : 0;
  }

  pick(clientX: number, clientY: number): { side: Side; slot: number } | null {
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.layers.set(1);
    const boxes = [...this.slots.P, ...this.slots.E].map((s) => s.hit);
    const hit = this.raycaster.intersectObjects(boxes, false)[0];
    return hit ? (hit.object.userData as { side: Side; slot: number }) : null;
  }

  // Screen position (CSS px) of a point above a slot or a unit.
  screen(pos: THREE.Vector3): { x: number; y: number } {
    const v = pos.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }
  unitScreen(id: number, up: number): { x: number; y: number } | null {
    const v = this.visuals.get(id);
    if (!v) return null;
    return this.screen(v.root.position.clone().add(new THREE.Vector3(0, up, 0)));
  }

  // ---------------- frame --------------------------------------------------------

  update(now: number): void {
    for (const v of this.visuals.values()) {
      if (v.moveDur > 0) {
        const k = Math.min(1, (now - v.moveT0) / v.moveDur);
        const e = k * k * (3 - 2 * k);
        v.root.position.lerpVectors(v.from, v.to, e);
        v.root.position.y = Math.sin(k * Math.PI) * 0.12;
        if (k >= 1) v.moveDur = 0;
      }
      let t = (now - v.animT0) * this.speed;
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
      if (v.dying && t > 1.6) {
        const k = Math.min(1, (t - 1.6) / 0.6);
        v.root.position.y = -k * 0.8;
        if (k >= 1) this.removeUnit(v.id);
      }
    }
    const pulse = 0.55 + 0.45 * Math.sin(now * 6);
    for (const side of ["P", "E"] as Side[])
      for (const fx of this.slots[side]) {
        fx.ringMat.opacity = fx.ringKind
          ? fx.ringKind === "target" || fx.ringKind === "move"
            ? 0.5 + 0.4 * pulse
            : 0.95
          : 0;
        fx.ring.scale.setScalar(fx.ringKind === "hover" ? 1.06 : 1);
        if (fx.fire.visible)
          fx.flames.forEach((f) => {
            const ph = f.userData.phase;
            f.scale.set(
              1,
              0.7 + 0.45 * Math.abs(Math.sin(now * 7 + ph)) + (fx.ground.blaze ? 0.6 : 0),
              1,
            );
            f.rotation.y = now * 2 + ph;
          });
        if (fx.ground.fire > 0)
          fx.light.intensity =
            (fx.ground.blaze ? 9 : 5) * (0.85 + 0.15 * Math.sin(now * 13 + fx.pad.position.x));
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
        const thr = fx.threat.material as THREE.MeshBasicMaterial;
        if (thr.opacity > 0) fx.threat.scale.setScalar(1 + 0.08 * Math.sin(now * 5));
        const bk = 1 - (performance.now() / 1000 - fx.burst) / 0.8; // real time, even when frozen
        if (fx.burst > 0 && bk > 0) {
          fx.light.color.copy(fx.burstColor);
          fx.light.intensity = Math.max(fx.light.intensity, bk * 30);
        } else fx.light.color.set("#ff7a30");
      }
    for (const tc of this.torches) {
      tc.light.intensity =
        (tc.flame.geometry.type === "ConeGeometry" ? 6 : 5) *
        (0.9 + 0.1 * Math.sin(now * 9 + tc.phase) * Math.sin(now * 5.3 + tc.phase));
      tc.flame.scale.y = 0.9 + 0.2 * Math.sin(now * 11 + tc.phase);
    }
  }

  render(now: number): void {
    this.composer.render(now * 1000);
  }
}

function tintMesh(mesh: THREE.Mesh, tint: string): void {
  const m = (mesh.material as THREE.MeshStandardMaterial).clone();
  m.color.multiply(new THREE.Color(tint)).multiplyScalar(1.35);
  mesh.material = m;
}

// The companion, Rustback: a horned beetle with a round teal-bronze shell and short legs.
// Built in code so it can't be mistaken for the long-legged Cave Spider.
function makeBeetle(): THREE.Group {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({
    color: "#3fae9c",
    metalness: 0.45,
    roughness: 0.38,
    flatShading: true,
  });
  const rust = new THREE.MeshStandardMaterial({
    color: "#c8743a",
    roughness: 0.7,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#2a2a30",
    roughness: 0.8,
    flatShading: true,
  });
  // two wing-case halves with a thin gap between them
  for (const side of [-1, 1]) {
    const half = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10, side > 0 ? 0 : Math.PI, Math.PI, 0, Math.PI / 2),
      shellMat,
    );
    half.scale.set(1, 0.75, 1.3);
    half.position.set(side * 0.025, 0.32, -0.05);
    g.add(half);
  }
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), rust); // the rusty patch
  back.scale.set(1.6, 0.35, 2.2);
  back.position.set(0, 0.69, -0.15);
  g.add(back);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 8), dark);
  belly.scale.set(1, 0.4, 1.25);
  belly.position.set(0, 0.3, -0.05);
  g.add(belly);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), dark);
  head.scale.set(1.1, 0.85, 1);
  head.position.set(0, 0.36, 0.66);
  g.add(head);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 8), shellMat);
  horn.position.set(0, 0.56, 0.82);
  horn.rotation.x = 0.75;
  g.add(horn);
  const eyeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#ffd060").multiplyScalar(2),
  });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
    eye.position.set(side * 0.12, 0.42, 0.84);
    g.add(eye);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.36, 6), dark);
      leg.position.set(side * 0.47, 0.14, 0.32 - i * 0.32);
      leg.rotation.z = side * 0.9;
      g.add(leg);
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

// The spirit totem: stacked stones around a floating blue wisp. Built in code.
function makeTotem(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({
    color: "#8a8478",
    roughness: 0.95,
    flatShading: true,
  });
  const sizes = [0.42, 0.34, 0.28, 0.2];
  let y = 0;
  sizes.forEach((r, i) => {
    const h = 0.3 - i * 0.03;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
    m.scale.set(1, h / r, 1);
    m.position.y = y + h / 2;
    m.rotation.y = i * 0.7;
    m.castShadow = true;
    g.add(m);
    y += h * 0.95;
  });
  const wisp = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#8ad8ff").multiplyScalar(3) }),
  );
  wisp.position.y = y + 0.35;
  g.add(wisp); // no light of its own: adding lights at runtime recompiles every shader
  return g;
}
