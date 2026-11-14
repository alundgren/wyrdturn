import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// Kuwahara filter: flattens detail into brush-like patches. Cheap "painted" look.
const Kuwahara = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    radius: { value: 3 },
  },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform int radius; varying vec2 vUv;
    void main(){
      vec2 px = 1.0 / resolution;
      vec3 m[4]; vec3 s[4];
      for (int k=0;k<4;k++){ m[k]=vec3(0.0); s[k]=vec3(0.0); }
      float n = 0.0;
      for (int j=0;j<=6;j++){ if (j>radius) break;
        for (int i=0;i<=6;i++){ if (i>radius) break;
          vec3 c;
          c = texture2D(tDiffuse, vUv + vec2(-i,-j)*px).rgb; m[0]+=c; s[0]+=c*c;
          c = texture2D(tDiffuse, vUv + vec2( i,-j)*px).rgb; m[1]+=c; s[1]+=c*c;
          c = texture2D(tDiffuse, vUv + vec2( i, j)*px).rgb; m[2]+=c; s[2]+=c*c;
          c = texture2D(tDiffuse, vUv + vec2(-i, j)*px).rgb; m[3]+=c; s[3]+=c*c;
          n += 1.0;
        }
      }
      float best = 1e9; vec3 outc = vec3(0.0);
      for (int k=0;k<4;k++){
        vec3 mean = m[k]/n; vec3 v = abs(s[k]/n - mean*mean);
        float sv = v.r+v.g+v.b;
        if (sv < best){ best = sv; outc = mean; }
      }
      gl_FragColor = vec4(outc, 1.0);
    }`,
};

// Colour grade: cold shadows, warm highlights, vignette, film grain.
const Grade = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.025 },
    vignette: { value: 0.8 },
  },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float grain; uniform float vignette; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(vec3(l), c, 0.85);                         // slight desaturate
      c *= mix(vec3(0.92,0.97,1.08), vec3(1.06,1.0,0.92), smoothstep(0.0,0.5,l)); // split tone, multiplicative
      float d = distance(vUv, vec2(0.5));
      c *= mix(1.0, smoothstep(0.95, 0.35, d), vignette);                     // vignette
      c += (hash(vUv*1000.0) - 0.5) * grain;             // grain
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera, look) {
  const size = renderer.getSize(new THREE.Vector2()).multiplyScalar(renderer.getPixelRatio());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // AO at half resolution: it is soft anyway, and full-res AO is the most expensive pass.
  const gtao = new GTAOPass(scene, camera, size.x / 2, size.y / 2);
  // EffectComposer calls setSize with full size, so halve it there too.
  const gtaoSetSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => gtaoSetSize(Math.ceil(w / 2), Math.ceil(h / 2));
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
  composer.addPass(gtao);
  composer.addPass(new UnrealBloomPass(size.clone(), 0.4, 0.5, 0.85));
  let kuwa = null;
  if (look === "painted") {
    kuwa = new ShaderPass(Kuwahara);
    kuwa.uniforms.resolution.value.copy(size);
    kuwa.uniforms.radius.value = 3;
    composer.addPass(kuwa);
  }
  const grade = new ShaderPass(Grade);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    gtao,
    grade,
    render(t) {
      grade.uniforms.time.value = (t % 1000) / 1000;
      composer.render();
    },
    setSize(w, h) {
      composer.setSize(w, h);
      if (kuwa)
        kuwa.uniforms.resolution.value.set(
          w * renderer.getPixelRatio(),
          h * renderer.getPixelRatio(),
        );
    },
  };
}
