import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Kind } from "../rules/combat.ts";

// Copied from prototypes/e13-board/src/view/models.ts (the totem lost its point light).
import { autorigBiped, rigidMonster, type Rig } from "./rig.ts";

// Unit models. Enemies and the bone servant reuse the gated TRELLIS meshes (ghoul, skeleton,
// spider), told apart by scale, tint and a code-built shield or glow. The hero, the wolf and
// the totem have no TRELLIS model yet, so they are built from primitives in bright party
// colours: in the top view, colour does more for readability than detail.

async function loadMesh(name: string, lift = 1.8): Promise<THREE.Mesh> {
  const g = await new GLTFLoader().loadAsync(`trellis/${name}.glb`);
  g.scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  g.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error(`no mesh in ${name}`);
  const m = mesh as THREE.Mesh;
  (m.material as THREE.MeshStandardMaterial).color.multiplyScalar(lift); // TRELLIS albedo bakes dark
  return m;
}

export interface Models {
  make(kind: Kind): { rig: Rig; scale: number };
  prop(name: "brazier" | "bones"): THREE.Object3D | null;
}

function tinted(src: THREE.Mesh, color: string, emissive = "#000000", ei = 0) {
  const m = (src.material as THREE.MeshStandardMaterial).clone();
  m.color.multiply(new THREE.Color(color));
  m.emissive = new THREE.Color(emissive);
  m.emissiveIntensity = ei;
  return m;
}

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function heroFigure(): THREE.Group {
  const g = new THREE.Group();
  const cloak = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.3, 12, 1, true),
    std("#2f6fd0", { side: THREE.DoubleSide }),
  );
  cloak.position.y = 0.75;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.9, 10), std("#c9b48a"));
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), std("#e0b896"));
  head.position.y = 1.55;
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 12), std("#2f6fd0"));
  hood.position.y = 1.72;
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.9, 0.02),
    std("#d8dde4", { metalness: 0.6, roughness: 0.3 }),
  );
  blade.position.set(0.38, 1.0, 0.18);
  blade.rotation.x = 0.35;
  const shield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16),
    std("#d4a640", { metalness: 0.4 }),
  );
  shield.rotation.z = Math.PI / 2;
  shield.position.set(-0.34, 1.0, 0.1);
  g.add(cloak, body, head, hood, blade, shield);
  return g;
}

function wolfFigure(): THREE.Group {
  const g = new THREE.Group();
  const fur = std("#8a8f99"),
    dark = std("#4a4e57");
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.7, 6, 12), fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.62;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.34), fur);
  head.position.set(0, 0.85, 0.55);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.22), dark);
  snout.position.set(0, 0.8, 0.8);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), dark);
    ear.position.set(s * 0.1, 1.05, 0.5);
    g.add(ear);
    for (const z of [-0.3, 0.3]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 6), dark);
      leg.position.set(s * 0.14, 0.25, z);
      g.add(leg);
    }
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), fur);
  tail.position.set(0, 0.75, -0.6);
  tail.rotation.x = -2.2;
  g.add(body, head, snout, tail);
  return g;
}

function totemFigure(): THREE.Group {
  const g = new THREE.Group();
  const wood = std("#7a5a3a");
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26 - i * 0.04, 0.3 - i * 0.04, 0.45, 8),
      wood,
    );
    seg.position.y = 0.23 + i * 0.45;
    g.add(seg);
  }
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12),
    new THREE.MeshStandardMaterial({
      color: "#7fe8ff",
      emissive: "#3fc8ff",
      emissiveIntensity: 2.2,
    }),
  );
  orb.position.y = 1.6;
  g.add(orb); // no light of its own: adding lights at runtime recompiles every shader
  return g;
}

export async function loadModels(): Promise<Models> {
  const [ghoul, skeleton, spider, brazier, bones] = await Promise.all([
    loadMesh("ghoul-px"),
    loadMesh("skeleton"),
    loadMesh("spider"),
    loadMesh("brazier", 1.6).catch(() => null),
    loadMesh("bones", 1.5).catch(() => null),
  ]);
  const mats = {
    ghoul: tinted(ghoul, "#ffffff"),
    priest: tinted(ghoul, "#b48ad8", "#5a2a7a", 0.6),
    archer: tinted(skeleton, "#ffffff"),
    spear: tinted(skeleton, "#e8c8a0"),
    warden: tinted(skeleton, "#8a9ab0", "#101820", 0.3),
    servant: tinted(skeleton, "#a8f0e0", "#2aa88a", 0.7),
  };
  const shieldMat = std("#5a6a80", { metalness: 0.7, roughness: 0.35 });
  const woodMat = std("#6a4a2a");
  return {
    make(kind) {
      switch (kind) {
        case "hero":
          return { rig: rigidMonster(heroFigure()), scale: 1 };
        case "wolf":
          return { rig: rigidMonster(wolfFigure()), scale: 1 };
        case "totem":
          return { rig: rigidMonster(totemFigure()), scale: 1 };
        case "spider": {
          const c = spider.clone();
          c.applyMatrix4(spider.matrixWorld);
          c.castShadow = true;
          return { rig: rigidMonster(c), scale: 0.8 };
        }
        case "ghoul":
        case "priest":
          return { rig: autorigBiped(ghoul, mats[kind]), scale: kind === "ghoul" ? 1.15 : 0.95 };
        case "archer":
        case "spear":
        case "warden":
        case "servant": {
          const rig = autorigBiped(skeleton, mats[kind]);
          if (kind === "warden") {
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.08), shieldMat);
            s.position.set(0, 0.85, 0.42);
            s.castShadow = true;
            rig.group.add(s);
          }
          if (kind === "archer") {
            const bow = new THREE.Mesh(
              new THREE.TorusGeometry(0.45, 0.025, 6, 16, Math.PI),
              woodMat,
            );
            bow.position.set(0.35, 1.0, 0.3);
            bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
            rig.group.add(bow);
          }
          if (kind === "spear") {
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), woodMat);
            shaft.position.set(0.32, 1.0, 0.5);
            shaft.rotation.x = Math.PI / 2 - 0.35;
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), shieldMat);
            tip.position.set(0.32, 1.42, 1.62);
            tip.rotation.x = Math.PI / 2 - 0.35;
            rig.group.add(shaft, tip);
          }
          return { rig, scale: kind === "warden" ? 1.12 : kind === "servant" ? 0.85 : 0.95 };
        }
      }
      throw new Error(`no model for ${kind as string}`);
    },
    prop(name) {
      const src = name === "brazier" ? brazier : bones;
      if (!src) return null;
      const o = src.clone();
      o.applyMatrix4(src.matrixWorld);
      o.castShadow = o.receiveShadow = true;
      return o;
    },
  };
}
