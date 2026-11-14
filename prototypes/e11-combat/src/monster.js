import * as THREE from 'three';

// Procedural monsters in code, "polyfork-style" but with UVs for painted textures.
//
// A body plan is a list of chains. A chain is a list of points (rest pose, world
// space, metres, +Z forward, +Y up) with a radius each. Every segment between two
// points becomes a bone; rings of vertices are swept along the segment and skinned
// to it, blending with the neighbouring bones near the joints. UVs run around the
// ring (u) and along the chain (v), so a tiling painted texture wraps the body.
//
// Rest pose bones have identity rotation, so animation code can rotate bones
// directly around world-aligned axes.

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- body plans ---------------------------------------------------------

// Hunched humanoid: ghoul, brute, cultist ... depending on params.
export function biped(p) {
  const s = p.size, h = p.hunch, aL = p.armLength, th = p.thickness;
  const hipY = 0.9 * s * p.legLength;
  const chest = V(0, hipY + 0.45 * s, 0.1 * s + h * 0.25 * s);
  const neck = V(0, chest.y + 0.12 * s - h * 0.06 * s, chest.z + 0.08 * s + h * 0.12 * s);
  const head = V(0, neck.y + 0.1 * s - h * 0.05 * s, neck.z + 0.1 * s + h * 0.05 * s);
  const hs = p.headSize * s;
  const chains = [
    { name: 'spine', parent: null, tex: p.bodyTex, pts: [
      { p: V(0, hipY - 0.05 * s, -0.02 * s), r: 0.13 * s * th, sx: 1.25 },
      { p: V(0, hipY + 0.2 * s, 0.02 * s + h * 0.08 * s), r: 0.14 * s * th * p.belly, sx: 1.2 },
      { p: chest, r: 0.17 * s * th * p.chest, sx: 1.35 },
      { p: neck, r: 0.075 * s * th, sx: 1 },
    ], bones: ['hips', 'spine', 'chest'] },
    { name: 'head', parent: 'chest', tex: p.headTex, pts: [
      { p: neck, r: 0.07 * s * th },
      { p: head, r: 0.11 * hs, sx: 0.9 },
      { p: V(0, head.y + 0.02 * s, head.z + 0.12 * hs), r: 0.1 * hs, sx: 0.85 },
      { p: V(0, head.y - 0.01 * s, head.z + 0.24 * hs * p.snout), r: 0.05 * hs, sx: 0.8 },
    ], bones: ['neck', 'head', 'snout'], cap: true },
    { name: 'jaw', parent: 'head', tex: p.headTex, pts: [
      { p: V(0, head.y - 0.06 * hs, head.z + 0.02 * hs), r: 0.06 * hs, sx: 1.2 },
      { p: V(0, head.y - 0.09 * hs, head.z + 0.2 * hs * p.snout), r: 0.035 * hs, sx: 1.1 },
    ], bones: ['jaw'], cap: true },
  ];
  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R';
    const sh = V(side * 0.2 * s * p.shoulders, chest.y + 0.02 * s, chest.z);
    const el = V(side * 0.3 * s * p.shoulders, sh.y - 0.3 * s * aL, sh.z + 0.05 * s);
    const wr = V(side * 0.33 * s * p.shoulders, el.y - 0.3 * s * aL, el.z + 0.12 * s);
    chains.push({ name: `arm${L}`, parent: 'chest', tex: p.bodyTex, pts: [
      { p: sh, r: 0.065 * s * th * p.arms },
      { p: el, r: 0.045 * s * th * p.arms, bulge: 0.25 },
      { p: wr, r: 0.035 * s * th * p.arms, bulge: 0.2 },
      { p: V(wr.x, wr.y - 0.12 * s, wr.z + 0.06 * s), r: 0.035 * s * th, sx: 1.4 },
    ], bones: [`upperArm${L}`, `foreArm${L}`, `hand${L}`], cap: true });
    const hip = V(side * 0.11 * s, hipY, 0);
    const kn = V(side * 0.13 * s, hipY * 0.52, 0.09 * s);
    const an = V(side * 0.13 * s, 0.07 * s, -0.03 * s);
    chains.push({ name: `leg${L}`, parent: 'hips', tex: p.bodyTex, pts: [
      { p: hip, r: 0.08 * s * th * p.legs },
      { p: kn, r: 0.055 * s * th * p.legs, bulge: 0.3 },
      { p: an, r: 0.04 * s * th, bulge: 0.15 },
      { p: V(an.x, 0.03 * s, an.z + 0.16 * s), r: 0.04 * s * th, sx: 1.5 },
    ], bones: [`thigh${L}`, `shin${L}`, `foot${L}`], cap: true });
  }
  const spikes = [];
  // claws on hands, teeth on jaw and snout, optional back spines
  for (const L of ['L', 'R'])
    for (let i = 0; i < 3; i++) spikes.push({ bone: `hand${L}`, at: 1, offset: V((i - 1) * 0.025 * s, -0.01 * s, 0.02 * s), dir: V(0, -0.7, 0.7), len: 0.09 * s * p.claws, r: 0.012 * s, tex: 'bone' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 1.6;
    spikes.push({ bone: 'snout', at: 1, offset: V(Math.sin(a) * 0.05 * hs, -0.05 * hs, Math.cos(a) * 0.05 * hs - 0.03 * hs), dir: V(0, -1, 0.1), len: 0.04 * hs * p.teeth, r: 0.008 * s, tex: 'bone' });
    spikes.push({ bone: 'jaw', at: 1, offset: V(Math.sin(a) * 0.04 * hs, 0.02 * hs, Math.cos(a) * 0.03 * hs - 0.02 * hs), dir: V(0, 1, 0.1), len: 0.035 * hs * p.teeth, r: 0.007 * s, tex: 'bone' });
  }
  for (let i = 0; i < Math.round(p.spines * 5); i++) {
    spikes.push({ bone: i < 2 ? 'spine' : 'chest', at: 0.5, offset: V(0, 0.12 * s, -0.12 * s + i * 0.02 * s), dir: V(0, 0.7, -0.7), len: 0.1 * s * p.spines, r: 0.02 * s, tex: 'bone' });
  }
  const eyes = [-1, 1].map((sd) => ({ bone: 'head', offset: V(sd * 0.05 * hs, 0.035 * hs, 0.12 * hs), r: 0.018 * hs }));
  return { chains, spikes, eyes, kind: 'biped' };
}

// Spider / crawler: thorax + abdomen + N legs.
export function crawler(p) {
  const s = p.size;
  const bodyY = 0.45 * s * p.legLength;
  const chains = [
    { name: 'body', parent: null, tex: p.bodyTex, pts: [
      { p: V(0, bodyY + 0.1 * s, -0.55 * s * p.abdomen), r: 0.06 * s },
      { p: V(0, bodyY + 0.12 * s, -0.35 * s * p.abdomen), r: 0.28 * s * p.abdomen, sx: 1.1 },
      { p: V(0, bodyY, -0.05 * s), r: 0.12 * s, sx: 1.2 },
      { p: V(0, bodyY, 0.15 * s), r: 0.15 * s, sx: 1.3 },
      { p: V(0, bodyY - 0.02 * s, 0.3 * s), r: 0.1 * s, sx: 1.2 },
    ], bones: ['abdomen', 'waist', 'thorax', 'head'], cap: true },
  ];
  const n = p.legPairs;
  for (let i = 0; i < n; i++) {
    for (const side of [-1, 1]) {
      const L = `${side < 0 ? 'L' : 'R'}${i}`;
      const z = 0.2 * s - (i / Math.max(1, n - 1)) * 0.3 * s;
      const fan = (i / Math.max(1, n - 1) - 0.5) * 1.4;
      const out = V(side * Math.cos(fan), 0, -Math.sin(fan) * 0.8 + 0.3);
      const root = V(side * 0.12 * s, bodyY, z);
      const knee = root.clone().add(out.clone().multiplyScalar(0.35 * s * p.legLength)).setY(bodyY + 0.3 * s * p.legLength);
      const foot = root.clone().add(out.clone().multiplyScalar(0.75 * s * p.legLength)).setY(0.0);
      chains.push({ name: `leg${L}`, parent: 'thorax', tex: p.bodyTex, pts: [
        { p: root, r: 0.035 * s * p.legs },
        { p: knee, r: 0.03 * s * p.legs, bulge: 0.2 },
        { p: foot, r: 0.008 * s },
      ], bones: [`upLeg${L}`, `loLeg${L}`], cap: true });
    }
  }
  const spikes = [-1, 1].map((sd) => ({ bone: 'head', at: 1, offset: V(sd * 0.05 * s, -0.04 * s, 0.08 * s), dir: V(-sd * 0.3, -0.6, 0.7), len: 0.12 * s * p.claws, r: 0.02 * s, tex: 'bone' }));
  const eyes = [];
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) eyes.push({ bone: 'head', offset: V(sd * (0.03 + i * 0.02) * s, 0.06 * s - i * 0.008 * s, 0.09 * s - i * 0.015 * s), r: (0.016 - i * 0.002) * s });
  return { chains, spikes, eyes, kind: 'crawler' };
}

// ---------- mesh building --------------------------------------------------------

function frameFor(t, prevN) {
  // parallel-transport-ish frame: keep the previous normal as close as possible
  let n = prevN ? prevN.clone() : (Math.abs(t.y) > 0.9 ? V(0, 0, 1) : V(0, 1, 0));
  n.sub(t.clone().multiplyScalar(n.dot(t))).normalize();
  if (n.lengthSq() < 1e-6) n = Math.abs(t.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  const b = t.clone().cross(n).normalize();
  return { n, b };
}

export function buildMonster(plan, mats, opts = {}) {
  const sides = opts.sides ?? 10, ringsPerSeg = opts.rings ?? 5;
  const lump = opts.lump ?? 0; // 0 = smooth tubes; 0.1-0.2 = gnarled, uneven flesh
  const lumpAt = (ci, ri, j) => 1 + lump * (Math.sin(ci * 12.9 + ri * 1.7 + j * 2.3) * 0.6 + Math.sin(ci * 3.1 + ri * 0.9 - j * 4.1) * 0.4);
  const texScale = opts.texScale ?? 0.35; // metres per texture repeat
  const bones = {}, boneList = [];
  const root = new THREE.Bone(); root.name = 'root'; boneList.push(root);
  const worldPos = new Map([[root, V(0, 0, 0)]]);

  // bones first, so chains can reference parents from earlier chains
  for (const ch of plan.chains) {
    let parent = ch.parent ? bones[ch.parent] : root;
    ch._bones = [];
    ch.bones.forEach((name, i) => {
      const b = new THREE.Bone(); b.name = name;
      const wp = ch.pts[i].p.clone();
      b.position.copy(wp).sub(worldPos.get(parent));
      parent.add(b);
      worldPos.set(b, wp);
      bones[name] = b; boneList.push(b); ch._bones.push(b);
      parent = b;
    });
    ch._parentBone = ch.parent ? bones[ch.parent] : root;
  }
  const boneIndex = new Map(boneList.map((b, i) => [b, i]));

  // geometry per texture group (one material per tex)
  const groups = new Map();
  const g = (tex) => groups.get(tex) ?? groups.set(tex, { pos: [], nor: [], uv: [], si: [], sw: [], idx: [] }).get(tex);

  for (const [ci, ch] of plan.chains.entries()) {
    const G = g(ch.tex);
    const rings = [];
    let prevN = null, vAcc = 0, lastP = null;
    const segs = ch.pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const A = ch.pts[i], B = ch.pts[i + 1];
      const t = B.p.clone().sub(A.p).normalize();
      const last = i === segs - 1;
      for (let k = 0; k < (last ? ringsPerSeg + 1 : ringsPerSeg); k++) {
        const u = k / ringsPerSeg;
        const c = A.p.clone().lerp(B.p, u);
        const bulge = (B.bulge ?? 0) * Math.sin(Math.PI * u);
        const r = (A.r + (B.r - A.r) * u) * (1 + bulge);
        const sx = (A.sx ?? 1) + ((B.sx ?? 1) - (A.sx ?? 1)) * u;
        const { n, b } = frameFor(t, prevN); prevN = n;
        if (lastP) vAcc += c.distanceTo(lastP); lastP = c;
        // skin weights: this segment's bone, blended with neighbours near joints
        const me = ch._bones[i] ?? ch._bones[ch._bones.length - 1];
        const prev = i === 0 ? ch._parentBone : ch._bones[i - 1];
        const next = ch._bones[i + 1];
        const w = [[me, 1]];
        if (u < 0.3) { const x = 0.5 * (1 - u / 0.3); w[0][1] -= x; w.push([prev, x]); }
        if (u > 0.7 && next) { const x = 0.5 * ((u - 0.7) / 0.3); w[0][1] -= x; w.push([next, x]); }
        rings.push({ c, n, b, r, sx, v: vAcc, w });
      }
    }
    const base = G.pos.length / 3;
    for (const [ri, R] of rings.entries()) {
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        // x of the ring = binormal (sideways), scaled by sx for wider bodies
        const dir = R.b.clone().multiplyScalar(Math.cos(a) * R.sx).add(R.n.clone().multiplyScalar(Math.sin(a)));
        const p = R.c.clone().add(dir.clone().multiplyScalar(R.r * (j === sides ? lumpAt(ci, ri, 0) : lumpAt(ci, ri, j))));
        G.pos.push(p.x, p.y, p.z);
        const nn = dir.normalize();
        G.nor.push(nn.x, nn.y, nn.z);
        G.uv.push((j / sides) * (2 * Math.PI * R.r * R.sx) / texScale, R.v / texScale);
        const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
        R.w.slice(0, 4).forEach(([bone, wt], q) => { si[q] = boneIndex.get(bone); sw[q] = wt; });
        G.si.push(...si); G.sw.push(...sw);
      }
    }
    for (let r = 0; r < rings.length - 1; r++)
      for (let j = 0; j < sides; j++) {
        const a = base + r * (sides + 1) + j, b2 = a + sides + 1;
        G.idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    // caps (fan) on both ends
    const capEnd = (ri, flip) => {
      const R = rings[ri];
      const ci = G.pos.length / 3;
      const tip = ri === 0 ? -1 : 1;
      const t = (ri === 0 ? rings[1].c.clone().sub(R.c) : R.c.clone().sub(rings[ri - 1].c)).normalize();
      const p = R.c.clone().add(t.clone().multiplyScalar(tip * 0 + R.r * 0.6 * (ri === 0 ? -1 : 1)));
      G.pos.push(p.x, p.y, p.z);
      const nn = t.multiplyScalar(ri === 0 ? -1 : 1);
      G.nor.push(nn.x, nn.y, nn.z);
      G.uv.push(0.5, R.v / texScale);
      const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
      R.w.slice(0, 4).forEach(([bone, wt], q) => { si[q] = boneIndex.get(bone); sw[q] = wt; });
      G.si.push(...si); G.sw.push(...sw);
      const rb = base + ri * (sides + 1);
      for (let j = 0; j < sides; j++) flip ? G.idx.push(ci, rb + j, rb + j + 1) : G.idx.push(ci, rb + j + 1, rb + j);
    };
    capEnd(0, true);
    capEnd(rings.length - 1, false);
  }

  // spikes (claws, teeth, spines): cones skinned rigidly to one bone
  for (const sp of plan.spikes) {
    const G = g(sp.tex);
    const bone = bones[sp.bone];
    const bp = worldPos.get(bone);
    const ch = plan.chains.find((c) => c._bones.includes(bone));
    const bi = ch._bones.indexOf(bone);
    const along = ch.pts[bi].p.clone().lerp(ch.pts[bi + 1].p, sp.at ?? 1);
    const base0 = along.add(sp.offset);
    const d = sp.dir.clone().normalize();
    const { n, b } = frameFor(d, null);
    const tip = base0.clone().add(d.clone().multiplyScalar(sp.len));
    const start = G.pos.length / 3, segs = 5;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const dir = b.clone().multiplyScalar(Math.cos(a)).add(n.clone().multiplyScalar(Math.sin(a)));
      const p = base0.clone().add(dir.clone().multiplyScalar(sp.r));
      G.pos.push(p.x, p.y, p.z); G.nor.push(dir.x, dir.y, dir.z); G.uv.push(j / segs, 0);
      G.si.push(boneIndex.get(bone), 0, 0, 0); G.sw.push(1, 0, 0, 0);
    }
    G.pos.push(tip.x, tip.y, tip.z); G.nor.push(d.x, d.y, d.z); G.uv.push(0.5, 1);
    G.si.push(boneIndex.get(bone), 0, 0, 0); G.sw.push(1, 0, 0, 0);
    for (let j = 0; j < segs; j++) G.idx.push(start + j, start + ((j + 1) % segs), start + segs);
    void bp;
  }

  const group = new THREE.Group();
  const skeleton = new THREE.Skeleton(boneList);
  let tris = 0;
  const meshes = [];
  for (const [tex, G] of groups) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(G.si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(G.sw, 4));
    geo.setIndex(G.idx);
    geo.computeVertexNormals(); // smooth across ring seams too
    tris += G.idx.length / 3;
    const m = new THREE.SkinnedMesh(geo, mats[tex] ?? mats.default);
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    meshes.push(m);
    group.add(m);
  }
  meshes[0].add(root);
  group.updateMatrixWorld(true);
  for (const m of meshes) m.bind(skeleton);

  // attachments: rigid meshes (armour plates, helmets, horns, weapons, cloth) on bones
  for (const a of plan.attach ?? []) {
    const bone = bones[a.bone];
    if (!bone) continue;
    const geo = ATTACH_GEO[a.shape](a);
    let mat = mats[a.tex] ?? mats.default;
    if (a.shape === 'cloth' || a.shape === 'hood') { // thin surfaces must render both sides
      mats._double ??= {};
      mat = mats._double[a.tex] ??= Object.assign(mat.clone(), { side: THREE.DoubleSide });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.copy(a.offset);
    if (a.rot) mesh.rotation.set(...a.rot);
    if (a.scale) mesh.scale.set(...a.scale);
    bone.add(mesh);
    tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  }

  // eyes: small glowing spheres parented to bones (not skinned)
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(opts.eyeColor ?? '#ffd27a').multiplyScalar(2.5) });
  for (const e of plan.eyes) {
    const bone = bones[e.bone];
    const s = new THREE.Mesh(new THREE.SphereGeometry(e.r, 8, 6), eyeMat);
    s.position.copy(e.offset).add(worldPos.get(bone)).sub(worldPos.get(bone));
    // offset is relative to the bone's rest world position
    s.position.copy(worldPos.get(bone).clone().add(e.offset)).sub(worldPos.get(bone));
    bone.add(s);
    tris += 96;
  }
  return { group, bones, skeleton, tris, kind: plan.kind, meshes };
}

// ---------- procedural animation -----------------------------------------------

// state: idle | walk | attack | hit | death. t: seconds since state start.
export function animate(m, state, t, time) {
  const B = m.bones;
  for (const b of m.skeleton.bones) if (b.name !== 'root') b.rotation.set(0, 0, 0);
  const root = m.skeleton.bones[0];
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  if (m.kind === 'biped') animBiped(B, root, state, t, time);
  else if (m.kind === 'rigid') animRigid(m, state, t, time);
  else animCrawler(B, root, state, t, time);
}

const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

function animBiped(B, root, state, t, time) {
  const br = Math.sin(time * 2.2);
  B.chest.rotation.x = br * 0.03;
  B.head.rotation.y = Math.sin(time * 0.7) * 0.15;
  B.jaw.rotation.x = 0.1 + Math.max(0, Math.sin(time * 1.3)) * 0.15;
  for (const L of ['L', 'R']) {
    const sd = L === 'L' ? -1 : 1;
    B[`upperArm${L}`].rotation.z = sd * -0.05;
    B[`foreArm${L}`].rotation.x = -0.3 + br * 0.04;
    B[`hand${L}`].rotation.x = 0.2;
  }
  if (state === 'walk') {
    const ph = time * 5;
    root.position.y = Math.abs(Math.sin(ph)) * 0.04;
    for (const L of ['L', 'R']) {
      const s = Math.sin(ph + (L === 'L' ? 0 : Math.PI));
      B[`thigh${L}`].rotation.x = -s * 0.5;
      B[`shin${L}`].rotation.x = Math.max(0, s) * 0.8;
      B[`foot${L}`].rotation.x = -Math.max(0, s) * 0.3;
      B[`upperArm${L}`].rotation.x = s * 0.4;
    }
    B.spine.rotation.y = Math.sin(ph) * 0.1;
  }
  if (state === 'attack') {
    // wind up (0-0.35s), slash (0.35-0.55s), recover (to 1.0s)
    const wind = ease(t / 0.35), slash = ease((t - 0.35) / 0.2), rec = ease((t - 0.6) / 0.4);
    const k = wind - slash * 1.6 + rec * 0.6;
    B.upperArmR.rotation.x = -2.2 * wind + slash * 1.7 + rec * 0.5; // overhead, then down in front
    B.foreArmR.rotation.x = -0.8 * wind + slash * 0.6;
    B.upperArmL.rotation.x = -1.2 * wind + slash * 0.9 + rec * 0.3;
    B.chest.rotation.x += -0.25 * wind + 0.5 * slash - 0.25 * rec;
    B.chest.rotation.y = 0.3 * wind - 0.6 * slash + 0.3 * rec;
    B.jaw.rotation.x = 0.5 * Math.min(1, wind + slash) * (1 - rec);
    root.position.z = 0.25 * slash * (1 - rec);
    void k;
  }
  if (state === 'hit') {
    const k = Math.sin(Math.min(1, t / 0.35) * Math.PI);
    B.chest.rotation.x = -0.45 * k;
    B.head.rotation.x = -0.4 * k;
    root.position.z = -0.15 * k;
    B.upperArmL.rotation.x = 0.6 * k; B.upperArmR.rotation.x = 0.5 * k;
  }
  if (state === 'death') {
    const k = ease(t / 1.1);
    B.thighL.rotation.x = -1.2 * ease(t / 0.5); B.thighR.rotation.x = -1.0 * ease(t / 0.5);
    B.shinL.rotation.x = 1.8 * ease(t / 0.5); B.shinR.rotation.x = 1.6 * ease(t / 0.5);
    root.rotation.x = -1.45 * ease((t - 0.4) / 0.7);
    // knees buckle (down), then the body lies on its back: lift by about half a torso so it rests on the floor
    const fall = ease((t - 0.4) / 0.7);
    root.position.y = -0.3 * ease(t / 0.5) * (1 - fall) + 0.17 * fall;
    root.position.z = -0.4 * k;
    B.head.rotation.x = 0.5 * k; B.jaw.rotation.x = 0.6 * k;
    B.upperArmL.rotation.z = -0.8 * k; B.upperArmR.rotation.z = 0.8 * k;
  }
}

// Unrigged meshes (e.g. a TRELLIS spider): whole-body motion only.
function animRigid(m, state, t, time) {
  const g = m.inner;
  g.position.set(0, Math.abs(Math.sin(time * 2.2)) * 0.015, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1 + Math.sin(time * 2.2) * 0.015, 1);
  if (state === 'walk') { g.position.y = Math.abs(Math.sin(time * 8)) * 0.05; g.rotation.z = Math.sin(time * 8) * 0.04; }
  if (state === 'attack') { const up = ease(t / 0.3), hit = ease((t - 0.3) / 0.15), rec = ease((t - 0.5) / 0.5); g.rotation.x = -0.35 * up + 0.5 * hit - 0.15 * rec; g.position.z = 0.35 * hit * (1 - rec); g.position.y += 0.15 * up * (1 - rec); }
  if (state === 'hit') { const k = Math.sin(Math.min(1, t / 0.3) * Math.PI); g.position.z = -0.2 * k; g.rotation.x = -0.2 * k; }
  if (state === 'death') { const k = ease(t / 0.9); g.rotation.z = Math.PI * 0.95 * k; g.position.y = 0.35 * Math.sin(k * Math.PI) + 0.5 * k; }
}

function animCrawler(B, root, state, t, time) {
  root.position.y = Math.sin(time * 2) * 0.01;
  const legs = Object.keys(B).filter((n) => n.startsWith('upLeg'));
  legs.forEach((n, i) => {
    const L = n.slice(5), idx = Number(L.slice(1)), side = L[0] === 'L' ? 1 : -1;
    const group = (idx + (side > 0 ? 0 : 1)) % 2;
    let lift = 0, swing = 0;
    if (state === 'walk') { const ph = time * 8 + group * Math.PI; lift = Math.max(0, Math.sin(ph)) * 0.35; swing = Math.cos(ph) * 0.3; }
    else lift = Math.sin(time * 1.5 + i) * 0.03;
    B[n].rotation.z = side * lift;
    B[n].rotation.y = swing;
    B[`loLeg${L}`].rotation.z = -side * lift * 0.8;
  });
  B.abdomen.rotation.x = Math.sin(time * 1.8) * 0.05;
  if (state === 'attack') {
    const up = ease(t / 0.3), strike = ease((t - 0.3) / 0.15), rec = ease((t - 0.5) / 0.5);
    B.thorax.rotation.x = -0.5 * up + 0.8 * strike - 0.3 * rec;
    root.position.z = 0.35 * strike * (1 - rec);
    root.position.y += 0.12 * up * (1 - rec);
  }
  if (state === 'hit') { const k = Math.sin(Math.min(1, t / 0.3) * Math.PI); root.position.z = -0.2 * k; B.thorax.rotation.x = -0.3 * k; }
  if (state === 'death') {
    const k = ease(t / 0.9);
    // flip onto its back around the body centre, not the ground origin
    const bodyY = B.abdomen.position.y * 0.85; // abdomen is a child of root, so this is its rest height
    root.rotation.z = Math.PI * k * 0.95; root.position.y = 0.3 * Math.sin(k * Math.PI) + 2 * bodyY * k * 0.95;
    legs.forEach((n) => { B[n].rotation.z = (n.includes('L') ? 1 : -1) * 0.9 * k; });
  }
}

// ---------- archetypes with seeded variation ------------------------------------

// Shapes for attachments. Sizes in metres; boxes get UVs from three.js.
const ATTACH_GEO = {
  plate: (a) => { const g = new THREE.SphereGeometry(a.r ?? 0.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.55, 1); return g; }, // pauldron dome
  helm: (a) => new THREE.SphereGeometry(a.r ?? 0.12, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62),
  hood: (a) => { const g = new THREE.ConeGeometry(a.r ?? 0.14, a.len ?? 0.32, 9, 1, true); return g; },
  horn: (a) => { // curved horn: tube along an arc
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 1.4) * (a.len ?? 0.25) * 0.6 * (a.side ?? 1), t * (a.len ?? 0.25), -Math.sin(t * 2.0) * 0.05)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, a.r ?? 0.025, 6);
    const pos = g.attributes.position; // taper toward the tip
    for (let i = 0; i < pos.count; i++) { const k = Math.floor(i / 7) / 8; const c = new THREE.Vector3().fromBufferAttribute(pos, i); const p = pts[Math.min(6, Math.round(k * 6))]; c.sub(p).multiplyScalar(1 - k * 0.85).add(p); pos.setXYZ(i, c.x, c.y, c.z); }
    return g;
  },
  blade: (a) => { const g = new THREE.BoxGeometry(0.075, a.len ?? 0.7, 0.025); g.translate(0, -(a.len ?? 0.7) / 2, 0); return g; },
  shield: (a) => { const g = new THREE.CylinderGeometry(a.r ?? 0.24, a.r ?? 0.24, 0.04, 14); g.rotateX(Math.PI / 2); return g; },
  cloth: (a) => { const g = new THREE.PlaneGeometry(a.w ?? 0.14, a.len ?? 0.4, 1, 3); g.translate(0, -(a.len ?? 0.4) / 2, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * 0.6)); p.setZ(i, Math.sin(y * 9) * 0.02); } g.computeVertexNormals(); return g; },
  ribs: (a) => { // rib cage: stacked half-rings
    const parts = [];
    for (let i = 0; i < 4; i++) { const t = new THREE.TorusGeometry((a.r ?? 0.13) * (1 - i * 0.08), 0.012, 4, 10, Math.PI * 1.2); t.rotateX(Math.PI / 2); t.rotateZ(-Math.PI * 0.1); t.rotateY(Math.PI * 0.5 - Math.PI * 0.6); t.translate(0, -i * 0.06, 0); parts.push(t); }
    return mergeGeos(parts);
  },
};
function mergeGeos(list) {
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const g of list) {
    const gi = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...(g.attributes.uv?.array ?? new Float32Array(g.attributes.position.count * 2)));
    for (const i of gi) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); m.setIndex(idx);
  return m;
}

// Attachment sets per archetype. Offsets are relative to the bone's rest position (world axes).
function attachmentsFor(name, p, r) {
  const s = p.size, A = [];
  if (name === 'brute') {
    for (const [L, sd] of [['L', -1], ['R', 1]]) A.push({ bone: `upperArm${L}`, shape: 'plate', r: 0.15 * s, offset: V(sd * 0.02 * s, -0.01 * s, 0), tex: 'rusty-armour' });
    for (const sd of [-1, 1]) A.push({ bone: 'head', shape: 'horn', len: 0.22 * s, r: 0.03 * s, side: sd, offset: V(sd * 0.07 * s, 0.07 * s, 0.03 * s), tex: 'bone' });
    A.push({ bone: 'hips', shape: 'cloth', w: 0.36 * s, len: 0.32 * s, offset: V(0, 0.02, 0.15 * s), tex: 'leather-cloth' });
  }
  if (name === 'cultist') {
    A.push({ bone: 'head', shape: 'hood', r: 0.19 * s, len: 0.42 * s, offset: V(0, 0.05 * s, -0.04 * s), rot: [-0.45, 0, 0], tex: 'leather-cloth' });
    for (let i = 0; i < 5; i++) { const a = (i / 4 - 0.5) * 2.6; A.push({ bone: 'hips', shape: 'cloth', w: 0.13 * s, len: (0.5 + r() * 0.15) * s, offset: V(Math.sin(a) * 0.15 * s, 0.03 * s, Math.cos(a) * 0.12 * s), rot: [0, a, 0], tex: 'leather-cloth' }); }
    A.push({ bone: 'handR', shape: 'blade', len: 0.3 * s, offset: V(0, -0.1 * s, 0.04 * s), rot: [0.9, 0, 0], tex: 'rusty-armour' });
  }
  if (name === 'skeleton') {
    A.push({ bone: 'chest', shape: 'ribs', r: 0.15 * s, offset: V(0, 0.02 * s, 0), tex: 'bone' });
    A.push({ bone: 'head', shape: 'helm', r: 0.12 * s, offset: V(0, 0.03 * s, 0.03 * s), tex: 'rusty-armour' });
    A.push({ bone: 'handR', shape: 'blade', len: 0.75 * s, offset: V(0, -0.08 * s, 0.03 * s), rot: [1.2, 0, 0], tex: 'rusty-armour' });
    A.push({ bone: 'foreArmL', shape: 'shield', r: 0.25 * s, offset: V(-0.08 * s, -0.12 * s, 0.05 * s), rot: [0, 0.4, 0], tex: 'rusty-armour' });
    for (const [L, sd] of [['L', -1], ['R', 1]]) A.push({ bone: `upperArm${L}`, shape: 'plate', r: 0.09 * s, offset: V(sd * 0.01 * s, -0.015 * s, 0), tex: 'rusty-armour' });
  }
  if (name === 'ghoul' && p.spines > 0) A.push({ bone: 'hips', shape: 'cloth', w: 0.22 * s, len: 0.25 * s, offset: V(0, 0, 0.13 * s), tex: 'leather-cloth' });
  return A;
}

export const ARCHETYPES = {
  skeleton: (r) => ({ plan: 'biped', size: 1.0 + r() * 0.1, hunch: 0.15, armLength: 1.0, legLength: 1.0, thickness: 0.45, belly: 0.6, chest: 0.6, shoulders: 1.05, headSize: 0.95, snout: 0.55, claws: 0, teeth: 0.8, spines: 0, arms: 0.8, legs: 0.8, bodyTex: 'bone', headTex: 'bone', tint: '#ffffff', eye: '#60c0ff', lump: 0.05 }),
  ghoul: (r) => ({ lump: 0.14, plan: 'biped', size: 1.0 + r() * 0.15, hunch: 0.8 + r() * 0.4, armLength: 1.25 + r() * 0.2, legLength: 0.9, thickness: 1.0 + r() * 0.15, belly: 0.8, chest: 0.9 + r() * 0.2, shoulders: 1, headSize: 1 + r() * 0.2, snout: 1.1 + r() * 0.3, claws: 1.2 + r() * 0.5, teeth: 1.2 + r() * 0.6, spines: r() < 0.5 ? 0 : 0.6 + r() * 0.6, arms: 0.9, legs: 0.9, bodyTex: 'ghoul-skin', headTex: 'ghoul-skin', tint: '#ffffff', eye: '#ffe08a' }),
  brute: (r) => ({ lump: 0.1, plan: 'biped', size: 1.45 + r() * 0.2, hunch: 0.5 + r() * 0.3, armLength: 1.05 + r() * 0.15, legLength: 0.8, thickness: 1.5 + r() * 0.3, belly: 1.3 + r() * 0.3, chest: 1.3, shoulders: 1.3, headSize: 0.8, snout: 0.7, claws: 0.6, teeth: 1.5, spines: 0, arms: 1.4, legs: 1.3, bodyTex: 'scales', headTex: 'scales', tint: '#ffffff', eye: '#ff7040' }),
  cultist: (r) => ({ plan: 'biped', size: 1.0, hunch: 0.25 + r() * 0.2, armLength: 1.0, legLength: 1.0, thickness: 0.9, belly: 1.0, chest: 1.0, shoulders: 0.95, headSize: 1.0, snout: 0.6, claws: 0.3, teeth: 0.3, spines: 0, arms: 1, legs: 1, bodyTex: 'leather-cloth', headTex: 'bone', tint: '#ffffff', eye: '#90c0ff' }),
  spider: (r) => ({ lump: 0.08, plan: 'crawler', size: 1.0 + r() * 0.4, legLength: 1.0 + r() * 0.3, abdomen: 1 + r() * 0.4, legs: 1, legPairs: 4, claws: 1, bodyTex: 'chitin', tint: '#ffffff', eye: '#ff4040' }),
  crawler: (r) => ({ plan: 'crawler', size: 0.8 + r() * 0.2, legLength: 0.7, abdomen: 0.7, legs: 1.3, legPairs: 3, claws: 1.6, bodyTex: 'rusty-armour', tint: '#ffffff', eye: '#a0ff60' }),
};

export function makeArchetype(name, seed, mats) {
  const r = rng(seed * 7919 + name.length);
  const p = ARCHETYPES[name](r);
  const plan = p.plan === 'biped' ? biped(p) : crawler(p);
  plan.attach = attachmentsFor(name, p, r);
  const m = buildMonster(plan, mats, { eyeColor: p.eye, lump: p.lump ?? 0 });
  m.params = p; m.archetype = name; m.seed = seed;
  return m;
}
