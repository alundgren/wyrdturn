import * as THREE from 'three';

// Painted sky dome: gradient, sun/moon disc, drifting fbm clouds, stars.
// One shader for all times of day so we can blend presets.
export const PRESETS = {
  day: {
    sunDir: new THREE.Vector3(0.45, 0.75, 0.3).normalize(),
    zenith: '#3f6aa8', horizon: '#c9cfc8', cloudLit: '#f2ebe0', cloudShade: '#7d8590',
    sun: '#fff1d6', sunIntensity: 3.2, hemiSky: '#b8c8e0', hemiGround: '#6a5c44', hemi: 2.4,
    fog: '#c8d0cc', fogDensity: 0.01, stars: 0, disc: 1,
  },
  dusk: {
    sunDir: new THREE.Vector3(-0.8, 0.12, 0.35).normalize(),
    zenith: '#232546', horizon: '#d9824a', cloudLit: '#f0a060', cloudShade: '#3a2f45',
    sun: '#ff9a50', sunIntensity: 2.6, hemiSky: '#b090a0', hemiGround: '#5a4030', hemi: 2.2,
    fog: '#b08070', fogDensity: 0.015, stars: 0.25, disc: 1,
  },
  night: {
    // "sun" is the moon here
    sunDir: new THREE.Vector3(0.3, 0.6, -0.55).normalize(),
    zenith: '#04060e', horizon: '#141c2c', cloudLit: '#4a5468', cloudShade: '#0a0d16',
    sun: '#9fb4ff', sunIntensity: 1.2, hemiSky: '#6070a0', hemiGround: '#28283a', hemi: 1.8,
    fog: '#2c3650', fogDensity: 0.02, stars: 1, disc: 0.6,
  },
};

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }`;

const frag = /* glsl */ `
  uniform vec3 zenith, horizon, cloudLit, cloudShade, sunCol, sunDir;
  uniform float time, stars, disc;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(horizon, zenith, pow(h, 0.55));
    // below horizon: fade to horizon colour (hidden by walls anyway)
    if (d.y < 0.0) col = horizon * 0.6;
    // stars
    vec2 sp = vec2(atan(d.z, d.x) * 120.0, d.y * 240.0);
    vec2 cell = floor(sp);
    float star = step(0.985, hash(cell)) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
    star *= 0.6 + 0.4 * sin(time * 2.0 + hash(cell + 3.0) * 30.0);
    col += star * stars * smoothstep(0.0, 0.25, d.y);
    // sun / moon
    float sd = max(dot(d, sunDir), 0.0);
    col += sunCol * (pow(sd, 900.0) * 6.0 * disc + pow(sd, 12.0) * 0.25);
    // clouds on a flat layer above
    if (d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.15) * 1.3 + vec2(time * 0.01, time * 0.004);
      float n = fbm(uv);
      float c = smoothstep(0.48, 0.75, n);
      float lit = clamp(0.5 + (fbm(uv + sunDir.xz * 0.08) - n) * -4.0, 0.0, 1.0);
      vec3 cc = mix(cloudShade, cloudLit, lit);
      col = mix(col, cc, c * smoothstep(0.0, 0.2, d.y) * 0.9);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function makeSky() {
  const uniforms = {
    zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    cloudLit: { value: new THREE.Color() }, cloudShade: { value: new THREE.Color() },
    sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() },
    time: { value: 0 }, stars: { value: 0 }, disc: { value: 1 },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return {
    mesh,
    apply(p) {
      for (const k of ['zenith', 'horizon', 'cloudLit', 'cloudShade']) uniforms[k].value.set(p[k]);
      uniforms.sunCol.value.set(p.sun);
      uniforms.sunDir.value.copy(p.sunDir);
      uniforms.stars.value = p.stars;
      uniforms.disc.value = p.disc;
    },
    update(t) { uniforms.time.value = t / 1000; },
  };
}
