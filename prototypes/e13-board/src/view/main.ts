import * as THREE from "three";
import * as C from "../rules/combat.ts";
import { strongBot } from "../rules/bots.ts";
import { FIGHTS, generatedFight, handmade } from "../rules/encounters.ts";
import { loadModels } from "./models.ts";
import { animate, type AnimState, type Rig } from "./rig.ts";
import { TILE, buildRoom, smooth } from "./room.ts";

// e13 board view. The fight starts in first person inside a generated room; the camera then
// rises to an angled top view of the same scene. Walls on the camera side shrink and the
// ceiling fades, so the room's floor becomes the board. All rules come from rules/combat.ts.
//
// URL: ?fight=1..7 hand-made fights, ?gen=<seed> a generated one, ?top skips the intro,
// ?hold keeps first person until debug.intro(k), ?shot for headless screenshots.

const params = new URLSearchParams(location.search);
const SHOT = params.has("shot");
const genSeed = params.has("gen") ? Number(params.get("gen")) : null;
const fightNo = Math.max(1, Math.min(FIGHTS.length, Number(params.get("fight") ?? 1)));
let state: C.State = genSeed !== null ? generatedFight(genSeed) : handmade(fightNo - 1);
const TITLE =
  genSeed !== null ? `Generated fight ${genSeed}` : `${fightNo}. ${FIGHTS[fightNo - 1].name}`;
const NOTE = genSeed !== null ? "" : FIGHTS[fightNo - 1].note;

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, cls = "", html = "") => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

// ---------------- three.js setup -----------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: SHOT });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0907);
const fog = new THREE.FogExp2(0x0c0a08, 0.06);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 80);
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const board = state.board;
const W = (p: C.Pos, y = 0) => new THREE.Vector3(p.x * TILE, y, p.y * TILE);
const R = board.room;
const center = new THREE.Vector3(((R.x0 + R.x1) / 2) * TILE, 0, ((R.y0 + R.y1) / 2) * TILE);

// bright base light (direction.md: readable everywhere, mood from tint and shadows)
scene.add(new THREE.HemisphereLight(0xb8c4e0, 0x3a2c1c, 1.25));
const key = new THREE.DirectionalLight(0xfff0dc, 1.7);
key.position.copy(center).add(new THREE.Vector3(-6, 18, 10));
key.target.position.copy(center);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.03;
scene.add(key, key.target);
const lantern = new THREE.PointLight(0xffb070, 8, 9, 1.4);
camera.add(lantern);
scene.add(camera);

const room = await buildRoom(board);
scene.add(room.group);
const models = await loadModels();

// ---------------- camera: first person -> top view ---------------------------------------

const heroStart = C.hero(state)!;
const inward = C.dirTo(board.entryOutside, board.entry) ?? 2;
const fpPos = W(heroStart, 1.6).add(W(C.DIRS[inward]).multiplyScalar(-0.35));
const fpLook = center.clone().setY(1.2);
// fit all board cells, with the hand cards covering the bottom of the screen
let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
for (const k of board.cells) {
  const [x, y] = k.split(",").map(Number);
  minX = Math.min(minX, x);
  maxX = Math.max(maxX, x);
  minY = Math.min(minY, y);
  maxY = Math.max(maxY, y);
}
const spanX = (maxX - minX + 1) * TILE,
  spanZ = (maxY - minY + 1) * TILE;
const boardMid = new THREE.Vector3(((minX + maxX) / 2) * TILE, 0, ((minY + maxY) / 2) * TILE);
const PITCH = (58 * Math.PI) / 180;
const TOP_FOV = 45;
const fitDist =
  Math.max(spanZ * 1.15, (spanX / camera.aspect) * 1.25) /
    (2 * Math.tan(((TOP_FOV / 2) * Math.PI) / 180)) +
  2;
const topLook = boardMid.clone().add(new THREE.Vector3(0, 0, spanZ * 0.07));
const topPos = topLook
  .clone()
  .add(new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)).multiplyScalar(fitDist));
let intro = params.has("top") ? 1 : 0;
const holdIntro = params.has("hold");
let introT0 = performance.now();
function placeCamera(k: number) {
  const e = smooth(k);
  const pos = fpPos.clone().lerp(topPos, e);
  pos.y += Math.sin(e * Math.PI) * 1.5;
  const look = fpLook.clone().lerp(topLook, smooth(Math.min(1, k * 1.25)));
  camera.position.copy(pos);
  camera.lookAt(look);
  camera.fov = 70 + (TOP_FOV - 70) * e;
  camera.updateProjectionMatrix();
  room.setTop(k);
  fog.density = 0.06 + (0.008 - 0.06) * e;
  lantern.intensity = 8 * (1 - e);
}

// ---------------- board overlay ------------------------------------------------------------

const overlay = new THREE.Group();
scene.add(overlay);
const tileGeo = new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92).rotateX(-Math.PI / 2);
const fills = new Map<string, THREE.Mesh>();
for (const k of board.cells) {
  const [x, y] = k.split(",").map(Number);
  const m = new THREE.Mesh(
    tileGeo,
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0xffffff,
    }),
  );
  m.position.copy(W({ x, y }, 0.05));
  m.renderOrder = 2;
  overlay.add(m);
  fills.set(k, m);
}
// faint grid lines on every board tile so the floor reads as a board
{
  const pts: number[] = [];
  const h = TILE / 2 - 0.04;
  for (const k of board.cells) {
    const [x, y] = k.split(",").map(Number);
    if (board.pillars.some((p) => p.x === x && p.y === y)) continue;
    const c = W({ x, y }, 0.03);
    const cs = [
      [c.x - h, c.z - h],
      [c.x + h, c.z - h],
      [c.x + h, c.z + h],
      [c.x - h, c.z + h],
    ];
    for (let i = 0; i < 4; i++)
      pts.push(cs[i][0], 0.035, cs[i][1], cs[(i + 1) % 4][0], 0.035, cs[(i + 1) % 4][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color: 0xf0e0c0, transparent: true, opacity: 0 }),
  );
  lines.userData.grid = true;
  overlay.add(lines);
}
const gridLines = overlay.children.find((c) => c.userData.grid) as THREE.LineSegments;
const hoverRing = new THREE.Mesh(
  new THREE.RingGeometry(TILE * 0.4, TILE * 0.47, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }),
);
hoverRing.scale.set(1.41, 1, 1.41);
hoverRing.renderOrder = 3;
scene.add(hoverRing);

// ground effects
const hazardGroup = new THREE.Group();
scene.add(hazardGroup);
const fireMat = new THREE.MeshBasicMaterial({
  color: 0xff7a1a,
  transparent: true,
  opacity: 0.75,
  depthWrite: false,
});
const blazeMat = new THREE.MeshBasicMaterial({
  color: 0xff3a0a,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});
const flameMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xffb040).multiplyScalar(2.2),
});
// oil: amber and glossy, so it reads as a slick, not as a hole in the floor
const oilMat = new THREE.MeshStandardMaterial({
  color: 0x8a5a1c,
  emissive: 0x2a1804,
  roughness: 0.05,
  metalness: 0.2,
  transparent: true,
  opacity: 0.85,
});
const poisonMat = new THREE.MeshBasicMaterial({
  color: 0x5ad040,
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
});
const poisonFloor = new THREE.MeshBasicMaterial({
  color: 0x5ad040,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});
const wardMat = new THREE.MeshBasicMaterial({
  color: 0xffd166,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
});
const flameGeo = new THREE.ConeGeometry(0.22, 0.7, 7);
const poisonGeo = new THREE.BoxGeometry(TILE * 0.9, 0.9, TILE * 0.9);
const wardGeo = new THREE.RingGeometry(0.62, 0.8, 32).rotateX(-Math.PI / 2);
const flames: THREE.Mesh[] = [];
function syncHazards() {
  hazardGroup.clear();
  flames.length = 0;
  for (const [k, g] of Object.entries(state.ground)) {
    const [x, y] = k.split(",").map(Number);
    const at = W({ x, y });
    if (g.oil) {
      const m = new THREE.Mesh(tileGeo, oilMat);
      m.position.copy(at).setY(0.02);
      hazardGroup.add(m);
    }
    if (g.fire) {
      const m = new THREE.Mesh(tileGeo, g.blaze ? blazeMat : fireMat);
      m.position.copy(at).setY(0.025);
      hazardGroup.add(m);
      const n = g.blaze ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const f = new THREE.Mesh(flameGeo, flameMat);
        const a = (i / n) * Math.PI * 2 + x;
        f.position.copy(at).add(new THREE.Vector3(Math.cos(a) * 0.45, 0.35, Math.sin(a) * 0.45));
        f.userData.phase = i * 1.7 + x * 0.3 + y;
        f.userData.big = g.blaze ? 1.4 : 1;
        hazardGroup.add(f);
        flames.push(f);
      }
    }
    if (g.poison) {
      const m = new THREE.Mesh(poisonGeo, poisonMat);
      m.position.copy(at).setY(0.45);
      m.scale.y = Math.min(1, 0.5 + g.poison * 0.25);
      hazardGroup.add(m);
      const f = new THREE.Mesh(tileGeo, poisonFloor);
      f.position.copy(at).setY(0.03);
      hazardGroup.add(f);
    }
    if (g.ward) {
      const m = new THREE.Mesh(wardGeo, wardMat);
      m.position.copy(at).setY(0.06);
      hazardGroup.add(m);
    }
  }
}

// braziers
const brazierViews = new Map<string, THREE.Group>();
let brazierLights = 0;
function syncBraziers() {
  const want = new Set(state.braziers.map(C.key));
  for (const [k, g] of brazierViews)
    if (!want.has(k)) {
      scene.remove(g);
      brazierViews.delete(k);
    }
  for (const b of state.braziers) {
    const k = C.key(b);
    if (brazierViews.has(k)) continue;
    const g = new THREE.Group();
    const prop = models.prop("brazier");
    if (prop) g.add(prop);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), flameMat);
    flame.position.y = 1.3;
    flame.userData.phase = b.x;
    flame.userData.big = 1;
    g.add(flame);
    flames.push(flame);
    g.userData.flame = flame;
    if (brazierLights++ < 3) {
      const l = new THREE.PointLight(0xff9a40, 7, 9, 1);
      l.position.y = 1.5;
      g.add(l);
    }
    g.position.copy(W(b));
    scene.add(g);
    brazierViews.set(k, g);
  }
}

// ---------------- unit visuals -------------------------------------------------------------

interface View {
  id: number;
  kind: C.Kind;
  rig: Rig;
  pos: THREE.Vector3;
  yaw: number;
  anim: AnimState;
  t0: number;
  ring: THREE.Mesh;
  label: HTMLElement;
  dying: number;
  spawnT: number;
  scale: number;
}
const views = new Map<number, View>();
const ringGeo = new THREE.RingGeometry(0.62, 0.8, 32).rotateX(-Math.PI / 2);
const labels = $("labels");
const yawOf = (d: C.Dir) => Math.atan2(C.DIRS[d].x, C.DIRS[d].y);

function makeView(u: C.Unit): View {
  const { rig, scale } = models.make(u.kind);
  rig.group.scale.setScalar(scale);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: u.side === "player" ? 0x5ab0ff : 0xff5a48,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  ring.renderOrder = 4;
  scene.add(rig.group, ring);
  const label = el("div", "ul");
  labels.append(label);
  const v: View = {
    id: u.id,
    kind: u.kind,
    rig,
    pos: W(u),
    yaw: yawOf(u.facing),
    anim: "idle",
    t0: performance.now(),
    ring,
    label,
    dying: 0,
    spawnT: 0,
    scale,
  };
  views.set(u.id, v);
  return v;
}
function removeView(v: View) {
  scene.remove(v.rig.group, v.ring);
  v.label.remove();
  views.delete(v.id);
}
function setAnim(v: View, a: AnimState) {
  v.anim = a;
  v.t0 = performance.now();
}
function syncUnits() {
  for (const u of state.units) {
    const v = views.get(u.id) ?? makeView(u);
    v.pos.copy(W(u));
    v.yaw = yawOf(u.facing);
  }
  for (const v of views.values())
    if (!state.units.some((u) => u.id === v.id) && !v.dying) removeView(v);
}

// ---------------- UI state -----------------------------------------------------------------

type Pending = { kind: "card"; index: number } | { kind: "ability"; id: C.AbilityId } | null;
let selected: number | null = heroStart.id;
let pending: Pending = null;
let hover: C.Pos | null = null;
let busyUntil = 0;
let needRefresh = false;
const queue: Step[] = [];
interface Step {
  dur: number;
  start?: () => void;
  update?: (k: number) => void;
  end?: () => void;
}
let current: { step: Step; t0: number } | null = null;
const animating = () => !!current || queue.length > 0 || performance.now() < busyUntil || intro < 1;
const busy = () => animating() || botQueue.length > 0;
const botQueue: C.Action[] = [];

const selUnit = () => state.units.find((u) => u.id === selected);

function actionFor(p: NonNullable<Pending>, at: C.Pos): C.Action | null {
  const u = p.kind === "card" ? C.hero(state) : selUnit();
  if (!u) return null;
  const def = p.kind === "card" ? C.CARDS[state.hand[p.index]] : C.ABILITIES[p.id];
  if (!def) return null;
  let target = at;
  if (def.target === "self") target = { x: u.x, y: u.y };
  if (def.target === "line") {
    const d = C.dirTo(u, at);
    if (d === null) return null;
    target = C.add(u, C.DIRS[d]);
  }
  return p.kind === "card"
    ? { type: "card", index: p.index, at: target }
    : { type: "ability", unit: u.id, ability: p.id, at: target };
}

function run(a: C.Action): C.Result {
  const r = C.act(state, a);
  if (!r.ok) {
    flash(r.reason);
    return r;
  }
  const evs = state.events;
  state.events = [];
  pending = null;
  for (const e of evs) enqueue(e);
  queue.push({ dur: 0, end: afterQueue });
  if (a.type === "end") selected = C.hero(state)?.id ?? null;
  refresh();
  return r;
}

function afterQueue() {
  syncUnits();
  syncHazards();
  syncBraziers();
  if (selected !== null && !state.units.some((u) => u.id === selected))
    selected = C.hero(state)?.id ?? null;
  needRefresh = true; // refresh once the queue step that called this has finished
  if (state.over) {
    botQueue.length = 0;
    showOver();
  }
}

// ---------------- event animation --------------------------------------------------------

const banner = $("banner");
function showBanner(text: string, color = "#fff") {
  banner.textContent = text;
  banner.style.color = color;
  banner.style.opacity = "1";
  setTimeout(() => (banner.style.opacity = "0"), 700);
}
interface Float {
  el: HTMLElement;
  pos: THREE.Vector3;
  t0: number;
}
const floats: Float[] = [];
function floatText(pos: THREE.Vector3, text: string, color: string) {
  const e = el("div", "float", text);
  e.style.color = color;
  labels.append(e);
  floats.push({ el: e, pos: pos.clone().setY(2.2), t0: performance.now() });
}
const tileFlash = new Map<string, number>();

function enqueue(e: C.Ev) {
  switch (e.t) {
    case "move":
    case "push": {
      const per = e.t === "move" ? 190 : 120;
      const pts = e.path.map((p) => W(p));
      if (!pts.length && !(e.t === "push" && e.hit)) return;
      let v: View | undefined;
      let from = new THREE.Vector3();
      queue.push({
        dur: Math.max(1, pts.length) * per + (e.t === "push" && e.hit ? 140 : 0),
        start: () => {
          v = views.get(e.id);
          if (!v) return;
          from = v.pos.clone();
          if (e.t === "move") setAnim(v, "walk");
          else setAnim(v, "hit");
        },
        update: (k) => {
          if (!v) return;
          const n = pts.length;
          const total = n + (e.t === "push" && e.hit ? 0.6 : 0);
          const f = k * total;
          if (f <= n && n) {
            const i = Math.min(n - 1, Math.floor(f));
            const a = i === 0 ? from : pts[i - 1];
            v.pos.lerpVectors(a, pts[i], f - i);
            if (e.t === "move") {
              const d = pts[i].clone().sub(a);
              if (d.lengthSq() > 0.01) v.yaw = Math.atan2(d.x, d.z);
            }
          } else if (e.t === "push" && e.hit) {
            // bump into the obstacle and back
            const base = n ? pts[n - 1] : from;
            const dir = n
              ? pts[n - 1]
                  .clone()
                  .sub(n > 1 ? pts[n - 2] : from)
                  .normalize()
              : new THREE.Vector3();
            const b = Math.sin(((f - n) / 0.6) * Math.PI) * 0.35;
            v.pos.copy(base).addScaledVector(dir, b);
          }
        },
        end: () => {
          if (v && e.t === "move") setAnim(v, "idle");
        },
      });
      return;
    }
    case "damage":
      queue.push({
        dur: 260,
        start: () => {
          const v = views.get(e.id);
          if (!v) return;
          setAnim(v, "hit");
          const col =
            e.source === "poison"
              ? "#8af06a"
              : e.source === "hazard"
                ? "#ffa040"
                : e.source === "collision"
                  ? "#ffe070"
                  : "#ff6a5a";
          floatText(v.pos, `-${e.amount}`, col);
        },
      });
      return;
    case "block":
      queue.push({
        dur: 120,
        start: () => {
          const v = views.get(e.id);
          if (v) floatText(v.pos, `+${e.amount} block`, "#8ac8ff");
        },
      });
      return;
    case "death":
      queue.push({
        dur: 450,
        start: () => {
          const v = views.get(e.id);
          if (!v) return;
          setAnim(v, "death");
          v.dying = performance.now();
          v.label.remove();
        },
      });
      return;
    case "act": {
      queue.push({
        dur: 520,
        start: () => {
          const v = views.get(e.id);
          if (v) {
            setAnim(v, "attack");
            if (e.dir !== null) v.yaw = yawOf(e.dir);
            const u = state.units.find((x) => x.id === e.id);
            floatText(v.pos.clone().setY(0.6), e.name, u?.side === "enemy" ? "#ffb0a0" : "#ffe7a0");
          }
          const now = performance.now();
          for (const p of e.tiles) tileFlash.set(C.key(p), now);
        },
        end: () => {
          const v = views.get(e.id);
          if (v && v.anim === "attack") setAnim(v, "idle");
        },
      });
      return;
    }
    case "summon":
    case "spawn":
      queue.push({
        dur: 380,
        start: () => {
          const u = state.units.find((x) => x.id === e.id);
          if (!u || views.has(u.id)) return;
          const v = makeView(u);
          v.spawnT = performance.now();
          floatText(
            v.pos,
            e.t === "spawn" ? "Reinforcement!" : "Summoned",
            e.t === "spawn" ? "#ff8a7a" : "#a8f0e0",
          );
        },
      });
      return;
    case "topple":
      queue.push({
        dur: 420,
        start: () => {
          const g = brazierViews.get(C.key(e.at));
          if (g) g.userData.fall = { t0: performance.now(), dir: e.dir };
          floatText(W(e.at), "Brazier topples!", "#ffb050");
        },
        end: () => {
          syncHazards();
        },
      });
      return;
    case "combo":
      queue.push({ dur: 300, start: () => floatText(W(e.at), e.text + "!", "#ffd060") });
      return;
    case "phase":
      if (e.phase === "enemy")
        queue.push({ dur: 650, start: () => showBanner("Enemy turn", "#ff7a6a") });
      if (e.phase === "round") queue.push({ dur: 300, start: syncHazards });
      if (e.phase === "player")
        queue.push({
          dur: 600,
          start: () => showBanner(`Round ${state.round}: your turn`, "#8ac8ff"),
        });
      return;
    case "card":
    case "heal":
      return;
  }
}

// ---------------- overlay + HUD refresh ----------------------------------------------------

interface TileNum {
  el: HTMLElement;
  pos: THREE.Vector3;
}
const tileNums: TileNum[] = [];
function tileNum(p: C.Pos, text: string, color: string) {
  const e = el("div", "tn", text);
  e.style.color = color;
  labels.append(e);
  tileNums.push({ el: e, pos: W(p, 0.1) });
}

const COL = { red: 0xff4a38, blue: 0x4aa0ff, gold: 0xffd166, orange: 0xff9a30, white: 0xffffff };
function fill(p: C.Pos, color: number, opacity: number) {
  const m = fills.get(C.key(p));
  if (!m) return;
  const mat = m.material as THREE.MeshBasicMaterial;
  if (mat.opacity > 0 && color === COL.blue && mat.color.getHex() === COL.red) {
    // movement on a threatened tile: keep the red visible, tint toward purple
    mat.color.setHex(0xc060d0);
    return;
  }
  mat.color.setHex(color);
  mat.opacity = opacity;
}

function refresh() {
  for (const m of fills.values()) (m.material as THREE.MeshBasicMaterial).opacity = 0;
  for (const t of tileNums) t.el.remove();
  tileNums.length = 0;
  const prev = $("preview");
  prev.style.display = "none";
  const showBoard = intro >= 1 && !current && !queue.length;
  if (showBoard && !state.over) {
    // enemy intents: red tiles, summed damage per tile
    const dmg = new Map<string, number>();
    for (const e of C.enemies(state))
      for (const p of C.intentTiles(state, e)) {
        const k = C.key(p);
        dmg.set(k, (dmg.get(k) ?? 0) + C.intentDamage(state, e, p));
      }
    for (const [k, d] of dmg) {
      const [x, y] = k.split(",").map(Number);
      fill({ x, y }, COL.red, 0.5);
      tileNum({ x, y }, String(d), "#ffd0c8");
    }
    // reinforcements
    for (const r of state.reinforcements) {
      const at = board.spawns[r.spawn % board.spawns.length];
      if (!at) continue;
      const n = r.round - state.round;
      fill(at, COL.orange, 0.45);
      tileNum(at, `+${C.UNITS[r.kind].name}${n <= 0 ? " next" : ` in ${n + 1}`}`, "#ffc080");
    }
    const u = selUnit();
    if (pending) {
      const pu = pending.kind === "card" ? C.hero(state) : u;
      const def =
        pending.kind === "card" ? C.CARDS[state.hand[pending.index]] : C.ABILITIES[pending.id];
      if (pu && def) {
        if (def.target === "line") {
          for (let d = 0; d < 4; d++)
            for (const p of C.ray(state, pu, d as C.Dir, def.range).tiles) fill(p, COL.gold, 0.28);
        } else for (const p of C.targets(state, pu, def.target, def.range)) fill(p, COL.gold, 0.3);
        const a =
          def.target === "self" ? actionFor(pending, pu) : hover ? actionFor(pending, hover) : null;
        if (a) {
          const pv = C.preview(state, a);
          if (pv.ok) {
            prev.style.display = "block";
            prev.textContent = `${C.nameOf(pending.kind === "card" ? state.hand[pending.index] : pending.id)}: ${pv.text}`;
            for (const g of pv.ground) fill(g.at, g.g.fire ? COL.orange : COL.gold, 0.55);
            for (const pu2 of pv.units) {
              if (pu2.dhp) tileNum(pu2.to, `${pu2.dhp}${pu2.dead ? " ✝" : ""}`, "#ffe060");
              if (!C.same(pu2.from, pu2.to)) {
                fill(pu2.to, COL.white, 0.35);
                if (!pu2.dhp) tileNum(pu2.to, "→", "#ffffff");
              }
            }
          } else if (hover) {
            prev.style.display = "block";
            prev.textContent = pv.reason ?? "";
          }
        }
      }
    } else if (u && u.moveLeft > 0) {
      for (const k of C.reachable(state, u).keys()) {
        const [x, y] = k.split(",").map(Number);
        fill({ x, y }, COL.blue, 0.32);
      }
      if (hover) {
        const path = C.reachable(state, u).get(C.key(hover));
        if (path) for (const p of path) fill(p, COL.blue, 0.6);
      }
    }
  }
  (gridLines.material as THREE.LineBasicMaterial).opacity = 0.22 * smooth(intro);
  renderHud();
}

function renderHud() {
  $("title").textContent = TITLE;
  const ph = $("phase");
  const enemyTurn = !!current || queue.length > 0;
  ph.textContent = state.over
    ? state.over === "win"
      ? "Victory"
      : "Defeat"
    : enemyTurn
      ? "Resolving…"
      : "Your turn";
  ph.className = enemyTurn ? "enemy" : "player";
  $("round").textContent =
    `round ${Math.min(state.round, C.RULES.maxRounds)} / ${C.RULES.maxRounds}`;
  $("energy").innerHTML =
    Array.from(
      { length: C.RULES.energy },
      (_, i) => `<span class="${i < state.energy ? "on" : ""}"></span>`,
    ).join("") +
    ` <span style="background:none;border:none;width:auto">energy · deck ${state.deck.length} · discard ${state.discard.length}</span>`;
  $("hint").textContent = pending
    ? "Hover a gold tile to preview, click to use. Right click or Esc cancels."
    : NOTE + " Click a unit, click a blue tile to move, then use a card or ability.";
  // hand
  const hand = $("hand");
  hand.innerHTML = "";
  const h = C.hero(state);
  state.hand.forEach((id, i) => {
    const c = C.CARDS[id];
    const summonCap =
      (id === "servant" || id === "totem") && C.summons(state).length >= C.RULES.maxSummons;
    const off = !h || c.cost > state.energy || summonCap;
    const d = el(
      "div",
      `card${pending?.kind === "card" && pending.index === i ? " sel" : ""}${off ? " off" : ""}`,
      `<b>${c.name}</b><span class="cost">${c.cost}</span><div class="txt">${c.text}</div><span class="cat">${c.cat}</span><span class="key">${i + 1}</span>`,
    );
    d.onclick = () => pickCard(i);
    hand.append(d);
  });
  // selected unit
  const u = selUnit();
  const panel = $("unit");
  if (!u) {
    panel.innerHTML = "<i>No unit selected</i>";
  } else {
    const def = C.UNITS[u.kind];
    const html = `<b>${def.name}</b> <span style="color:var(--dim)">${def.role}</span><br>HP ${u.hp}/${u.maxHp}${u.block ? ` · block ${u.block}` : ""} · move ${u.moveLeft}/${def.move}${u.acted ? " · acted" : ""}<div>`;
    panel.innerHTML = html;
    const box = el("div");
    if (u.kind === "hero")
      box.innerHTML = `<small style="color:var(--dim)">Plays cards from the hand below. Moving is not possible after the first card.</small>`;
    for (const ab of def.abilities as C.AbilityId[]) {
      const a = C.ABILITIES[ab];
      const cd = u.cooldowns[ab] ?? 0;
      const b = el(
        "button",
        `ab${pending?.kind === "ability" && pending.id === ab ? " sel" : ""}`,
        `${a.name}${cd ? ` (${cd})` : ""}<small>${a.text}</small>`,
      ) as HTMLButtonElement;
      b.disabled = u.acted || cd > 0 || busy();
      b.onclick = () => pickAbility(ab);
      box.append(b);
    }
    panel.append(box);
  }
  ($("end") as HTMLButtonElement).disabled = busy() || !!state.over;
}

function pickCard(i: number) {
  if (busy() || state.over) return;
  if (pending?.kind === "card" && pending.index === i) pending = null;
  else {
    pending = { kind: "card", index: i };
    selected = C.hero(state)?.id ?? selected;
  }
  refresh();
}
function pickAbility(id: C.AbilityId) {
  if (busy() || state.over) return;
  if (pending?.kind === "ability" && pending.id === id) {
    const u = selUnit();
    if (u && C.ABILITIES[id].target === "self")
      run({ type: "ability", unit: u.id, ability: id, at: { x: u.x, y: u.y } });
    else pending = null;
  } else pending = { kind: "ability", id };
  refresh();
}

let flashT = 0;
function flash(msg: string) {
  const p = $("preview");
  p.style.display = "block";
  p.textContent = msg;
  flashT = performance.now();
}

function showOver() {
  const o = $("over");
  o.style.display = "flex";
  const next =
    genSeed !== null
      ? `?gen=${genSeed + 1}`
      : `?fight=${Math.min(FIGHTS.length, fightNo + (state.over === "win" ? 1 : 0))}`;
  o.innerHTML = `${state.over === "win" ? "Victory" : "Defeat"}<a href="${next}">${state.over === "win" ? "Next fight" : "Try again"}</a><a href="?gen=${Math.floor(Math.random() * 10000)}">Random generated fight</a>`;
}

// ---------------- input ------------------------------------------------------------------

const ray = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function tileAt(cx: number, cy: number): C.Pos | null {
  const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(groundPlane, hit)) return null;
  const p = { x: Math.round(hit.x / TILE), y: Math.round(hit.z / TILE) };
  return board.cells.includes(C.key(p)) ? p : null;
}
renderer.domElement.addEventListener("pointermove", (ev) => {
  const t = tileAt(ev.clientX, ev.clientY);
  if ((t && hover && C.same(t, hover)) || (!t && !hover)) return;
  hover = t;
  refresh();
});
renderer.domElement.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  pending = null;
  refresh();
});
renderer.domElement.addEventListener("click", (ev) => {
  const t = tileAt(ev.clientX, ev.clientY);
  if (t) clickTile(t);
});
function clickTile(t: C.Pos) {
  if (busy() || state.over) return;
  const u = C.unitAt(state, t);
  if (pending) {
    const a = actionFor(pending, t);
    if (a && C.preview(state, a).ok) {
      run(a);
      return;
    }
    if (u && u.side === "player") {
      selected = u.id;
      pending = null;
      refresh();
      return;
    }
    if (a) run(a); // shows the reason
    return;
  }
  if (u && u.side === "player") {
    selected = u.id;
    refresh();
    return;
  }
  const s = selUnit();
  if (s && s.moveLeft > 0 && C.reachable(state, s).has(C.key(t)))
    run({ type: "move", unit: s.id, to: t });
}
addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    pending = null;
    refresh();
  } else if (ev.key === "e" || ev.key === "E") endTurn();
  else if (/^[1-5]$/.test(ev.key)) pickCard(Number(ev.key) - 1);
  else if (ev.key === "Tab") {
    ev.preventDefault();
    const p = C.party(state);
    const i = p.findIndex((x) => x.id === selected);
    selected = p[(i + 1) % p.length]?.id ?? null;
    pending = null;
    refresh();
  }
});
$("end").onclick = endTurn;
function endTurn() {
  if (busy() || state.over) return;
  run({ type: "end" });
}

// ---------------- frame loop -------------------------------------------------------------

const tmp = new THREE.Vector3();
function project(p: THREE.Vector3): { x: number; y: number; vis: boolean } {
  tmp.copy(p).project(camera);
  return {
    x: (tmp.x * 0.5 + 0.5) * innerWidth,
    y: (-tmp.y * 0.5 + 0.5) * innerHeight,
    vis: tmp.z < 1,
  };
}

function frame(nowReal: number) {
  const frozen = (window as unknown as { __freeze?: number }).__freeze;
  const now = frozen ?? nowReal;
  const time = now / 1000;
  // intro
  if (intro < 1 && !holdIntro) {
    const t = (nowReal - introT0) / 1000;
    intro = Math.min(1, Math.max(0, (t - 1.2) / 2.6));
    if (intro >= 1) refresh();
  }
  placeCamera(intro);
  document.body.classList.toggle("intro", intro < 0.75);
  // animation queue
  if (!current && queue.length) {
    const step = queue.shift()!;
    step.start?.();
    current = { step, t0: nowReal };
  }
  while (current) {
    const k = current.step.dur ? Math.min(1, (nowReal - current.t0) / current.step.dur) : 1;
    current.step.update?.(k);
    if (k < 1) break;
    current.step.end?.();
    current = null;
    if (queue.length) {
      const step = queue.shift()!;
      step.start?.();
      current = { step, t0: nowReal };
    }
  }
  if (needRefresh && !current && !queue.length) {
    needRefresh = false;
    refresh();
  }
  // bot turn: feed actions one at a time
  if (!animating() && botQueue.length && !state.over) run(botQueue.shift()!);
  // units
  const showHero = intro > 0.25;
  for (const v of views.values()) {
    const u = state.units.find((x) => x.id === v.id);
    const g = v.rig.group;
    g.position.copy(v.pos);
    let d = v.yaw - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * 0.25;
    const t = (now - v.t0) / 1000;
    if ((v.anim === "hit" && t > 0.4) || (v.anim === "attack" && t > 1)) setAnim(v, "idle");
    animate(v.rig, v.anim, (now - v.t0) / 1000, time);
    if (v.spawnT) {
      const s = Math.min(1, (now - v.spawnT) / 350);
      g.scale.setScalar(Math.max(0.01, s) * v.scale);
      if (s >= 1) v.spawnT = 0;
    }
    if (v.kind === "hero") g.visible = showHero;
    v.ring.position.copy(v.pos).setY(0.07);
    const mat = v.ring.material as THREE.MeshBasicMaterial;
    const isSel = v.id === selected && !busy();
    const spent = u && u.side === "player" && u.acted && u.moveLeft === 0;
    mat.color.setHex(
      isSel
        ? 0xffd166
        : v.kind === "hero" || u?.side === "player"
          ? spent
            ? 0x6a7a8a
            : 0x5ab0ff
          : 0xff5a48,
    );
    v.ring.scale.setScalar(isSel ? 1.12 + Math.sin(time * 6) * 0.05 : 1);
    v.ring.visible = intro > 0.6 && !v.dying;
    if (v.dying && now - v.dying > 2200) removeView(v);
    // label
    if (u && !v.dying) {
      const head = v.pos.clone().setY(u.kind === "wolf" || u.kind === "skitter" ? 1.5 : 2.3);
      const s = project(head);
      v.label.style.display = s.vis && intro > 0.7 ? "block" : "none";
      v.label.style.left = `${s.x}px`;
      v.label.style.top = `${s.y}px`;
      const hpCol = u.side === "player" ? "#5ab0ff" : "#ff5a48";
      const it =
        u.intent && !busy()
          ? `<div class="intent">${C.ATTACKS[u.intent.attack].name} ${dirArrow(u.intent.dir)}</div><br>`
          : "";
      // compact by default; the name shows for the selected or hovered unit
      const named = u.id === selected || (hover && C.same(hover, u));
      const name = named
        ? `<div class="nm">${C.UNITS[u.kind].name}${u.kind === "guard" ? " (shield front)" : ""}</div>`
        : "";
      const blk = u.block ? ` <b style="color:#8ac8ff">+${u.block}</b>` : "";
      const html = `${it}${name}<div class="hp"><div class="bar"><i style="width:${(100 * u.hp) / u.maxHp}%;background:${hpCol}"></i></div>${u.hp}${blk}</div>`;
      if (v.label.innerHTML !== html) v.label.innerHTML = html;
    }
  }
  // flames, falling braziers, flashes
  for (const f of flames) {
    const b = f.userData.big ?? 1;
    f.scale.set(b, b * (0.8 + Math.sin(time * 9 + f.userData.phase) * 0.2), b);
  }
  for (const g of brazierViews.values()) {
    const fall = g.userData.fall as { t0: number; dir: C.Dir } | undefined;
    if (!fall) continue;
    const k = Math.min(1, (nowReal - fall.t0) / 380);
    const d = C.DIRS[fall.dir];
    g.rotation.set(d.y * k * 1.4, 0, -d.x * k * 1.4);
  }
  for (const [k, t0] of tileFlash) {
    const m = fills.get(k);
    const a = 1 - (nowReal - t0) / 600;
    if (!m || a <= 0) {
      tileFlash.delete(k);
      if (m && !busy()) refresh();
      continue;
    }
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(0xffe0a0);
    mat.opacity = 0.7 * a;
  }
  // hover ring
  hoverRing.visible = !!hover && intro >= 1 && !busy();
  if (hover) hoverRing.position.copy(W(hover, 0.08));
  // floating numbers and tile numbers
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    const k = (nowReal - f.t0) / 1100;
    if (k >= 1) {
      f.el.remove();
      floats.splice(i, 1);
      continue;
    }
    const s = project(f.pos.clone().setY(f.pos.y + k * 0.8));
    f.el.style.left = `${s.x}px`;
    f.el.style.top = `${s.y}px`;
    f.el.style.opacity = String(1 - k * k);
  }
  for (const t of tileNums) {
    const s = project(t.pos);
    t.el.style.left = `${s.x}px`;
    t.el.style.top = `${s.y}px`;
  }
  if (flashT && nowReal - flashT > 1600) {
    flashT = 0;
    refresh();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
const dirArrow = (d: C.Dir) => ["↑", "→", "↓", "←"][d];

syncUnits();
syncHazards();
syncBraziers();
refresh();
introT0 = performance.now();
requestAnimationFrame(frame);

// ---------------- debug hooks (headless screenshots and checks) -----------------------------

const debug = {
  state: () => state,
  busy,
  intro: (k: number) => {
    intro = k;
    refresh();
  },
  act: (a: C.Action) => run(a),
  select: (id: number) => {
    selected = id;
    pending = null;
    refresh();
  },
  card: (i: number) => pickCard(i),
  ability: (id: C.AbilityId) => pickAbility(id),
  hover: (p: C.Pos | null) => {
    hover = p;
    refresh();
  },
  /** Select the hand card and target with the most damage to enemies (for screenshots). */
  bestCard: () => {
    const h = C.hero(state);
    if (!h) return null;
    let best: { i: number; at: C.Pos; v: number; text: string } | null = null;
    for (const a of C.legalActions(state, { moves: false })) {
      if (a.type !== "card") continue;
      const pv = C.preview(state, a);
      let v = 0;
      for (const u of pv.units) {
        const side = state.units.find((x) => x.id === u.id)?.side;
        v += side === "enemy" ? -u.dhp + (C.same(u.from, u.to) ? 0 : 2) : u.dhp * 2;
      }
      v += pv.ground.filter((g) => g.g.fire).length + pv.topples * 3 + pv.combos.length * 4;
      if (!best || v > best.v) best = { i: a.index, at: a.at, v, text: pv.text };
    }
    if (best) {
      pending = { kind: "card", index: best.i };
      hover = best.at;
      refresh();
    }
    return best;
  },
  /** Plan the strong bot's turn and play it with animations. */
  botTurn: () => {
    const plan = strongBot()(C.clone(state), Math.random);
    botQueue.push(...plan.actions);
    return plan.actions;
  },
  reset: (s: C.State) => {
    state = s;
    afterQueue();
  },
};
(window as unknown as { __board: typeof debug }).__board = debug;
