import * as THREE from 'three';

// Instanced grass blades with a wind sway in the vertex shader.
// tiles: [{ x, z }] world centres of grass tiles; avoid: [{ x, z, r }] circles to keep clear.
export function makeGrass(tiles, tileSize, avoid = [], perTile = 260) {
  // One blade: 3 segments, tapering to a tip. uv.y = 0 at root, 1 at tip.
  const geo = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  const segs = 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = 0.035 * (1 - t);
    pos.push(-w, t, 0, w, t, 0);
    uv.push(0, t, 1, t);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  const uniforms = { time: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.time = uniforms.time;
    sh.vertexShader = 'uniform float time;\nvarying float vTip;\nvarying vec3 vUp;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vTip = uv.y;
        vUp = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(time * 1.7 + wp.x * 0.6 + wp.z * 0.4) * 0.5 + sin(time * 3.1 + wp.x * 1.3) * 0.2;
        transformed.x += sway * 0.12 * uv.y * uv.y;
        transformed.z += sway * 0.05 * uv.y * uv.y;`);
    // Fake normal pointing up so blades light like a soft carpet, not flat cards.
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    // Both sides of a blade use the same up normal (three would flip it on back faces -> black blades).
    sh.fragmentShader = 'varying float vTip;\nvarying vec3 vUp;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vUp);')
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        diffuseColor.rgb *= mix(0.55, 1.05, vTip);`);
  };

  const rng = mulberry(5);
  const xf = [];
  for (const t of tiles)
    for (let i = 0; i < perTile; i++) {
      const x = t.x + (rng() - 0.5) * tileSize, z = t.z + (rng() - 0.5) * tileSize;
      if (avoid.some((a) => (a.x - x) ** 2 + (a.z - z) ** 2 < a.r * a.r)) continue;
      xf.push([x, z, rng() * Math.PI, 0.14 + rng() * 0.22, rng()]);
    }
  const mesh = new THREE.InstancedMesh(geo, mat, xf.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  const dark = new THREE.Color('#3d4a22'), light = new THREE.Color('#8a8a48'), dry = new THREE.Color('#8a7448');
  xf.forEach(([x, z, r, h, v], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
    m.compose(p.set(x, 0, z), q, s.set(1, h, 1));
    mesh.setMatrixAt(i, m);
    c.copy(dark).lerp(light, v);
    if (v > 0.85) c.lerp(dry, 0.6);
    mesh.setColorAt(i, c);
  });
  mesh.receiveShadow = true;
  return { mesh, count: xf.length, update(t) { uniforms.time.value = t / 1000; } };
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
