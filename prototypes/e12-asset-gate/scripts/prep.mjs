// Prepare a raw TRELLIS GLB for the game (no Blender needed):
//   node scripts/prep.mjs in.glb out.glb [ratio=0.03] [height_m] [rotX_deg]
// weld -> meshoptimizer simplify (keeps UV seams, so the TRELLIS texture still fits) ->
// optional rotation fix + scale to height + origin on the floor -> prune.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify, prune, dedup, getBounds } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const [src, dst, ratioArg, heightArg, rotArg] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const count = () =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce(
      (a, p) => a + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3,
      0,
    );
const before = count();
await MeshoptSimplifier.ready;
// SHAPE_ONLY=1: drop UVs/normals so welding and simplifying ignore texture seams (texture is
// re-baked afterwards in Blender: blender/bake_from_high.py). Otherwise seams cap the reduction.
if (process.env.SHAPE_ONLY)
  for (const p of doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())) {
    for (const sem of p.listSemantics()) if (sem !== "POSITION") p.setAttribute(sem, null);
    p.setMaterial(null);
  }
await doc.transform(
  weld(),
  simplify({
    simplifier: MeshoptSimplifier,
    ratio: Number(ratioArg ?? 0.03),
    error: Number(process.env.ERR ?? 0.05),
  }),
  dedup(),
  prune(),
);
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
// wrap everything in one root node we can rotate/scale/offset
const rootNode = doc.createNode("prep");
for (const n of scene.listChildren()) {
  scene.removeChild(n);
  rootNode.addChild(n);
}
scene.addChild(rootNode);
const rot = (Number(rotArg ?? 0) * Math.PI) / 180;
if (rot) rootNode.setRotation([Math.sin(rot / 2), 0, 0, Math.cos(rot / 2)]);
let b = getBounds(scene);
const h = Number(heightArg ?? 0);
const s = h ? h / (b.max[1] - b.min[1]) : 1;
rootNode.setScale([s, s, s]);
b = getBounds(scene);
rootNode.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
await io.write(dst, doc);
console.log(
  `PREP ${src.split("/").pop()} -> ${dst}: tris ${before} -> ${count()}${h ? `, height ${h} m` : ""}${rot ? `, rotX ${rotArg}` : ""}`,
);
