import * as THREE from "three";

// Auto-rig a static humanoid mesh (e.g. TRELLIS output) at runtime so the procedural
// animations from monster.js (animate(), kind 'biped') drive it.
// Assumes: standing on y=0, facing +Z, arms away from the body (A/T pose), real-world scale.
// 1. Guess joints from the mesh: height proportions for the spine, extreme vertices for hands
//    and feet. 2. Build bones with identity rest rotation (what animate() expects).
// 3. Skin weights by distance to bone segments (inverse 4th power, top 3, side masks).
// Crude compared to a real rig, but enough for idle/attack/hit/death at grid distance.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function guessJoints(positions) {
  const n = positions.count,
    p = new THREE.Vector3();
  const box = new THREE.Box3().setFromBufferAttribute(positions);
  const H = box.max.y,
    W = box.max.x - box.min.x;
  const zc = (box.min.z + box.max.z) / 2;
  // centre line of the torso: mean x/z of vertices in the 55-75% height band near the middle
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
  // hands: farthest-out vertices per side between 25% and 80% height
  const hand = { L: null, R: null };
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(positions, i);
    if (p.y < 0.25 * H || p.y > 0.8 * H) continue;
    const side = p.x < cx ? "L" : "R",
      d = Math.abs(p.x - cx);
    if (!hand[side] || d > hand[side].d) hand[side] = { d, v: p.clone() };
  }
  // feet: lowest 6% of vertices, mean per side
  const foot = { L: [V(0, 0, 0), 0], R: [V(0, 0, 0), 0] };
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(positions, i);
    if (p.y > 0.06 * H) continue;
    const s = p.x < cx ? "L" : "R";
    foot[s][0].add(p);
    foot[s][1]++;
  }
  const ft = (s) =>
    foot[s][1]
      ? foot[s][0].clone().divideScalar(foot[s][1])
      : V(cx + (s === "L" ? -0.1 : 0.1) * H, 0, cz);
  // head: top 8% centroid
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
  const J = {
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
  return { J, H };
}

export function autorigBiped(mesh) {
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  const pos = geo.attributes.position;
  const { J } = guessJoints(pos);
  // bones: [name, parent, startJoint, endJoint, side]
  const DEF = [
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
  const bones = { root },
    list = [root],
    world = new Map([[root, V(0, 0, 0)]]);
  for (const [name, parent, a] of DEF) {
    const b = new THREE.Bone();
    b.name = name;
    const pb = bones[parent];
    b.position.copy(J[a]).sub(world.get(pb));
    pb.add(b);
    bones[name] = b;
    list.push(b);
    world.set(b, J[a].clone());
  }
  // skin weights
  const cx = J.hips.x;
  const segs = DEF.map(([name, , a, b, side], i) => ({
    i: i + 1,
    a: J[a],
    b: J[b],
    side,
    upper: name.includes("Arm") || name.startsWith("hand"),
  }));
  const si = new Uint16Array(pos.count * 4),
    sw = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3(),
    ab = new THREE.Vector3(),
    ap = new THREE.Vector3(),
    q = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    const side = p.x < cx ? "L" : "R";
    const cand = [];
    for (const s of segs) {
      if (s.side === "X") continue; // jaw/snout stay rigid with the head
      if ((s.side === "L" || s.side === "R") && s.side !== side) continue;
      ab.subVectors(s.b, s.a);
      ap.subVectors(p, s.a);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-9, ab.lengthSq())));
      const d = q.copy(s.a).addScaledVector(ab, t).distanceTo(p) + 1e-4;
      cand.push([s.i, 1 / d ** 4]);
    }
    cand.sort((x, y) => y[1] - x[1]);
    const top = cand.slice(0, 3),
      sum = top.reduce((a, c) => a + c[1], 0);
    top.forEach(([bi, w], k) => {
      si[v * 4 + k] = bi;
      sw[v * 4 + k] = w / sum;
    });
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  const skinned = new THREE.SkinnedMesh(geo, mesh.material);
  skinned.castShadow = skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  skinned.add(root);
  const skeleton = new THREE.Skeleton(list);
  const group = new THREE.Group();
  group.add(skinned);
  group.updateMatrixWorld(true);
  skinned.bind(skeleton);
  return {
    group,
    bones,
    skeleton,
    kind: "biped",
    tris: geo.index ? geo.index.count / 3 : pos.count / 3,
    meshes: [skinned],
    joints: J,
  };
}

// Non-humanoids (spider): no rig; animate() gets a stand-in that bobs, lunges and topples.
export function rigidMonster(mesh) {
  const root = new THREE.Bone();
  root.name = "root";
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(mesh);
  group.add(inner);
  return {
    group,
    inner,
    kind: "rigid",
    bones: { root },
    skeleton: { bones: [root] },
    meshes: [mesh],
  };
}
