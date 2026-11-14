import * as THREE from "three";

// Runtime rig for static TRELLIS humanoids and the matching procedural animation.
// Ported from prototypes/e11-combat/src/autorig.js and the biped/rigid parts of
// animate() in prototypes/e11-combat/src/monster.js.
// Assumes: standing on y=0, facing +Z, arms away from the body, real-world scale.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export type AnimState = "idle" | "walk" | "attack" | "hit" | "death";
export interface Rig {
  group: THREE.Group;
  bones: Record<string, THREE.Bone>;
  skeleton: { bones: THREE.Bone[] };
  kind: "biped" | "rigid";
  meshes: THREE.Mesh[];
  inner?: THREE.Group;
}

function guessJoints(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const n = positions.count,
    p = new THREE.Vector3();
  const box = new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
  const H = box.max.y,
    W = box.max.x - box.min.x;
  const zc = (box.min.z + box.max.z) / 2;
  let cx = 0,
    cz = 0,
    c = 0;
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(positions, i);
    if (p.y > 0.55 * H && p.y < 0.75 * H && Math.abs(p.x) < 0.15 * W) {
      cx += p.x;
      cz += p.z;
      c++;
    }
  }
  cx = c ? cx / c : 0;
  cz = c ? cz / c : zc;
  const hand: Record<string, { d: number; v: THREE.Vector3 } | null> = { L: null, R: null };
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(positions, i);
    if (p.y < 0.25 * H || p.y > 0.8 * H) continue;
    const side = p.x < cx ? "L" : "R",
      d = Math.abs(p.x - cx);
    const cur = hand[side];
    if (!cur || d > cur.d) hand[side] = { d, v: p.clone() };
  }
  const foot: Record<string, [THREE.Vector3, number]> = { L: [V(0, 0, 0), 0], R: [V(0, 0, 0), 0] };
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(positions, i);
    if (p.y > 0.06 * H) continue;
    const s = p.x < cx ? "L" : "R";
    foot[s][0].add(p);
    foot[s][1]++;
  }
  const ft = (s: string) =>
    foot[s][1]
      ? foot[s][0].clone().divideScalar(foot[s][1])
      : V(cx + (s === "L" ? -0.1 : 0.1) * H, 0, cz);
  let head = V(0, 0, 0),
    hc = 0;
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(positions, i);
    if (p.y > 0.92 * H) {
      head.add(p);
      hc++;
    }
  }
  head = hc ? head.divideScalar(hc) : V(cx, H, cz);
  const J: Record<string, THREE.Vector3> = {
    hips: V(cx, 0.5 * H, cz),
    spine: V(cx, 0.6 * H, cz),
    chest: V(cx, 0.72 * H, cz),
    neck: V(head.x * 0.5 + cx * 0.5, 0.84 * H, head.z * 0.6 + cz * 0.4),
    head: V(head.x, 0.9 * H, head.z),
    headTop: V(head.x, 0.97 * H, head.z + 0.02 * H),
    snoutTip: V(head.x, 0.93 * H, head.z + 0.08 * H),
  };
  for (const s of ["L", "R"]) {
    const sd = s === "L" ? -1 : 1;
    const sh = V(cx + sd * 0.11 * H, 0.75 * H, cz);
    const hv = hand[s]?.v ?? V(cx + sd * 0.3 * H, 0.45 * H, cz);
    const wr = sh.clone().lerp(hv, 0.85);
    J[`sh${s}`] = sh;
    J[`el${s}`] = sh
      .clone()
      .lerp(wr, 0.5)
      .add(V(0, 0, 0.02 * H));
    J[`wr${s}`] = wr;
    J[`tip${s}`] = hv;
    const hip = V(cx + sd * 0.07 * H, 0.48 * H, cz),
      an = ft(s).setY(0.05 * H);
    J[`hip${s}`] = hip;
    J[`kn${s}`] = hip
      .clone()
      .lerp(an, 0.5)
      .add(V(0, 0, 0.03 * H));
    J[`an${s}`] = an;
    J[`toe${s}`] = an.clone().add(V(0, -0.04 * H, 0.08 * H));
  }
  return J;
}

export function autorigBiped(mesh: THREE.Mesh, material: THREE.Material): Rig {
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  const pos = geo.attributes.position;
  const J = guessJoints(pos);
  const DEF: [string, string, string, string, string][] = [
    ["hips", "root", "hips", "spine", "C"],
    ["spine", "hips", "spine", "chest", "C"],
    ["chest", "spine", "chest", "neck", "C"],
    ["neck", "chest", "neck", "head", "C"],
    ["head", "neck", "head", "headTop", "C"],
    ["snout", "head", "headTop", "snoutTip", "X"],
    ["jaw", "head", "head", "snoutTip", "X"],
  ];
  for (const s of ["L", "R"])
    DEF.push(
      [`upperArm${s}`, "chest", `sh${s}`, `el${s}`, s],
      [`foreArm${s}`, `upperArm${s}`, `el${s}`, `wr${s}`, s],
      [`hand${s}`, `foreArm${s}`, `wr${s}`, `tip${s}`, s],
      [`thigh${s}`, "hips", `hip${s}`, `kn${s}`, s],
      [`shin${s}`, `thigh${s}`, `kn${s}`, `an${s}`, s],
      [`foot${s}`, `shin${s}`, `an${s}`, `toe${s}`, s],
    );
  const root = new THREE.Bone();
  root.name = "root";
  const bones: Record<string, THREE.Bone> = { root };
  const list = [root];
  const world = new Map<THREE.Bone, THREE.Vector3>([[root, V(0, 0, 0)]]);
  for (const [name, parent, a] of DEF) {
    const b = new THREE.Bone();
    b.name = name;
    const pb = bones[parent];
    b.position.copy(J[a]).sub(world.get(pb)!);
    pb.add(b);
    bones[name] = b;
    list.push(b);
    world.set(b, J[a].clone());
  }
  const cx = J.hips.x;
  const segs = DEF.map(([, , a, b, side], i) => ({ i: i + 1, a: J[a], b: J[b], side }));
  const si = new Uint16Array(pos.count * 4),
    sw = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3(),
    ab = new THREE.Vector3(),
    ap = new THREE.Vector3(),
    q = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    const side = p.x < cx ? "L" : "R";
    const cand: [number, number][] = [];
    for (const s of segs) {
      if (s.side === "X") continue;
      if ((s.side === "L" || s.side === "R") && s.side !== side) continue;
      ab.subVectors(s.b, s.a);
      ap.subVectors(p, s.a);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-9, ab.lengthSq())));
      const d = q.copy(s.a).addScaledVector(ab, t).distanceTo(p) + 1e-4;
      cand.push([s.i, 1 / d ** 4]);
    }
    cand.sort((x, y) => y[1] - x[1]);
    const top = cand.slice(0, 3),
      sum = top.reduce((acc, c) => acc + c[1], 0);
    top.forEach(([bi, w], k) => {
      si[v * 4 + k] = bi;
      sw[v * 4 + k] = w / sum;
    });
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  const skinned = new THREE.SkinnedMesh(geo, material);
  skinned.castShadow = skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  skinned.add(root);
  const skeleton = new THREE.Skeleton(list);
  const group = new THREE.Group();
  group.add(skinned);
  group.updateMatrixWorld(true);
  skinned.bind(skeleton);
  return { group, bones, skeleton, kind: "biped", meshes: [skinned] };
}

/** Non-humanoids and code-built figures: whole-body motion only. */
export function rigidMonster(obj: THREE.Object3D): Rig {
  const root = new THREE.Bone();
  root.name = "root";
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(obj);
  group.add(inner);
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return { group, inner, kind: "rigid", bones: { root }, skeleton: { bones: [root] }, meshes };
}

const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

/** t: seconds since the state started; time: global seconds. */
export function animate(m: Rig, state: AnimState, t: number, time: number) {
  for (const b of m.skeleton.bones) if (b.name !== "root") b.rotation.set(0, 0, 0);
  const root = m.skeleton.bones[0];
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  if (m.kind === "biped") animBiped(m.bones, root, state, t, time);
  else animRigid(m, state, t, time);
}

function animBiped(
  B: Record<string, THREE.Bone>,
  root: THREE.Bone,
  state: AnimState,
  t: number,
  time: number,
) {
  const br = Math.sin(time * 2.2);
  B.chest.rotation.x = br * 0.03;
  B.head.rotation.y = Math.sin(time * 0.7) * 0.15;
  B.jaw.rotation.x = 0.1 + Math.max(0, Math.sin(time * 1.3)) * 0.15;
  for (const L of ["L", "R"]) {
    const sd = L === "L" ? -1 : 1;
    B[`upperArm${L}`].rotation.z = sd * -0.05;
    B[`foreArm${L}`].rotation.x = -0.3 + br * 0.04;
    B[`hand${L}`].rotation.x = 0.2;
  }
  if (state === "walk") {
    const ph = time * 5;
    root.position.y = Math.abs(Math.sin(ph)) * 0.04;
    for (const L of ["L", "R"]) {
      const s = Math.sin(ph + (L === "L" ? 0 : Math.PI));
      B[`thigh${L}`].rotation.x = -s * 0.5;
      B[`shin${L}`].rotation.x = Math.max(0, s) * 0.8;
      B[`foot${L}`].rotation.x = -Math.max(0, s) * 0.3;
      B[`upperArm${L}`].rotation.x = s * 0.4;
    }
    B.spine.rotation.y = Math.sin(ph) * 0.1;
  }
  if (state === "attack") {
    const wind = ease(t / 0.35),
      slash = ease((t - 0.35) / 0.2),
      rec = ease((t - 0.6) / 0.4);
    B.upperArmR.rotation.x = -2.2 * wind + slash * 1.7 + rec * 0.5;
    B.foreArmR.rotation.x = -0.8 * wind + slash * 0.6;
    B.upperArmL.rotation.x = -1.2 * wind + slash * 0.9 + rec * 0.3;
    B.chest.rotation.x += -0.25 * wind + 0.5 * slash - 0.25 * rec;
    B.chest.rotation.y = 0.3 * wind - 0.6 * slash + 0.3 * rec;
    B.jaw.rotation.x = 0.5 * Math.min(1, wind + slash) * (1 - rec);
    root.position.z = 0.25 * slash * (1 - rec);
  }
  if (state === "hit") {
    const k = Math.sin(Math.min(1, t / 0.35) * Math.PI);
    B.chest.rotation.x = -0.45 * k;
    B.head.rotation.x = -0.4 * k;
    root.position.z = -0.15 * k;
    B.upperArmL.rotation.x = 0.6 * k;
    B.upperArmR.rotation.x = 0.5 * k;
  }
  if (state === "death") {
    const k = ease(t / 1.1);
    B.thighL.rotation.x = -1.2 * ease(t / 0.5);
    B.thighR.rotation.x = -1.0 * ease(t / 0.5);
    B.shinL.rotation.x = 1.8 * ease(t / 0.5);
    B.shinR.rotation.x = 1.6 * ease(t / 0.5);
    root.rotation.x = -1.45 * ease((t - 0.4) / 0.7);
    const fall = ease((t - 0.4) / 0.7);
    root.position.y = -0.3 * ease(t / 0.5) * (1 - fall) + 0.17 * fall;
    root.position.z = -0.4 * k;
    B.head.rotation.x = 0.5 * k;
    B.jaw.rotation.x = 0.6 * k;
    B.upperArmL.rotation.z = -0.8 * k;
    B.upperArmR.rotation.z = 0.8 * k;
  }
}

function animRigid(m: Rig, state: AnimState, t: number, time: number) {
  const g = m.inner!;
  g.position.set(0, Math.abs(Math.sin(time * 2.2)) * 0.015, 0);
  g.rotation.set(0, 0, 0);
  g.scale.set(1, 1 + Math.sin(time * 2.2) * 0.015, 1);
  if (state === "walk") {
    g.position.y = Math.abs(Math.sin(time * 8)) * 0.05;
    g.rotation.z = Math.sin(time * 8) * 0.04;
  }
  if (state === "attack") {
    const up = ease(t / 0.3),
      hit = ease((t - 0.3) / 0.15),
      rec = ease((t - 0.5) / 0.5);
    g.rotation.x = -0.35 * up + 0.5 * hit - 0.15 * rec;
    g.position.z = 0.35 * hit * (1 - rec);
    g.position.y += 0.15 * up * (1 - rec);
  }
  if (state === "hit") {
    const k = Math.sin(Math.min(1, t / 0.3) * Math.PI);
    g.position.z = -0.2 * k;
    g.rotation.x = -0.2 * k;
  }
  if (state === "death") {
    const k = ease(t / 0.9);
    g.rotation.z = Math.PI * 0.95 * k;
    g.position.y = 0.35 * Math.sin(k * Math.PI) + 0.5 * k;
  }
}
