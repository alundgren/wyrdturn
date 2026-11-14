#!/bin/sh
# Prep every TRELLIS asset: simplify shape -> bake colour -> gate. Usage: sh scripts/prep-all.sh
set -e
# Raw TRELLIS output is not in git; it lives in <repo>/local/trellis-raw
IN=${TRELLIS_RAW:-../../local/trellis-raw}
B=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
mkdir -p prepped/work
run() { # name src tris height rotX profile
  name=$1; src=$2; tris=$3; h=$4; rot=$5; prof=$6
  total=$(node -e "import('@gltf-transform/core').then(async({NodeIO})=>{const{ALL_EXTENSIONS}=await import('@gltf-transform/extensions');const d=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('$src');let t=0;for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives())t+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;console.log(t)})")
  ratio=$(node -e "console.log(Math.min(1, $tris / $total * 1.05))")
  node scripts/prep.mjs "$src" prepped/work/$name-high.glb 1 $h $rot >/dev/null
  SHAPE_ONLY=1 ERR=0.03 node scripts/prep.mjs "$src" prepped/work/$name-low.glb $ratio $h $rot | grep PREP
  $B -b --factory-startup --python blender/bake_from_high.py -- prepped/work/$name-high.glb prepped/work/$name-low.glb prepped/$name.glb 1024 2>&1 | grep -E "BAKED|Error" || true
}
run chest       $IN/e5e6/e5e6/models/chest.glb          4000  0.75 0  prop
run chest-px    $IN/e5e6/e5e6/models/chest-pixal3d.glb  4000  0.75 90 prop
run bones       $IN/e5e6/e5e6/models/bones.glb          5000  0.55 0  prop
run brazier     $IN/e5e6/e5e6/models/brazier.glb        5000  1.1  0  prop
run door        $IN/e5e6/e5e6/models/door.glb           3000  2.2  0  prop
run sconce      $IN/e5e6/e5e6/models/sconce.glb         3000  0.6  0  prop
run ghoul       $IN/e5e6/e5e6/models/ghoul.glb          12000 1.7  0  monster
run ghoul-px    $IN/e5e6/e5e6/models/ghoul-pixal3d.glb  12000 1.7  90 monster
run skeleton    $IN/e5e6/e5e6/models/skeleton.glb       12000 1.8  0  monster
run spider      $IN/e5e6/e5e6/models/spider.glb         12000 0.9  0  monster
run oak         $IN/e8/e8/models/oak.glb                10000 5.0  0  tree
run dead        $IN/e8/e8/models/dead.glb               8000  4.5  0  tree
run cypress     $IN/e8/e8/models/cypress.glb            8000  6.0  0  tree
run shrub       $IN/e8/e8/models/shrub.glb              5000  1.2  0  tree
