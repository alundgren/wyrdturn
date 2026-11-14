# Builds outdoor props (trees, fountain) and exports one GLB.
# Run headless (no window):
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#     --python blender/build_outdoor.py -- out/outdoor.glb
# Origins sit on the ground at the tile centre. Materials are swapped by name in
# three.js: bark, leaves, stone, water.
import sys
import math
import random

import bpy
import bmesh
from mathutils import Vector, Matrix, noise

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "outdoor.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)

MATS = {}
for name in ["bark", "leaves", "stone", "water"]:
    MATS[name] = bpy.data.materials.new(name)


def new_obj(name, bm, mats, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        me.materials.append(MATS[m])
    return obj


def box_uv(obj, scale=2.0):
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u, v = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
            uv[li].uv = (u / scale, v / scale)


def tapered_branch(bm, start, direction, length, r0, r1, segs=7, mat=0):
    """Tapered cylinder from start along direction."""
    d = direction.normalized()
    up = Vector((0, 0, 1)) if abs(d.z) < 0.99 else Vector((1, 0, 0))
    side = d.cross(up).normalized()
    side2 = d.cross(side).normalized()
    rings = []
    steps = 3
    for s in range(steps + 1):
        t = s / steps
        c = start + d * length * t
        r = r0 + (r1 - r0) * t
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            ring.append(bm.verts.new(c + (side * math.cos(a) + side2 * math.sin(a)) * r))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(segs):
            f = bm.faces.new([a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]])
            f.material_index = mat
    return start + d * length


def blob(bm, center, radius, seed, mat=1):
    """Lumpy foliage cluster: icosphere pushed out by noise."""
    ret = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=radius, matrix=Matrix.Translation(center))
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in ret["verts"]:
        n = (v.co - center).normalized()
        k = noise.noise(v.co * 1.6 + off)
        v.co = center + n * radius * (1.0 + 0.35 * k)
        v.co.z -= max(0.0, -(v.co.z - center.z)) * 0.35  # flatter underside
    vs = set(ret["verts"])
    for f in bm.faces:
        if all(v in vs for v in f.verts):
            f.material_index = mat


def tree(name, seed, height, spread):
    random.seed(seed)
    bm = bmesh.new()
    top = tapered_branch(bm, Vector((0, 0, -0.1)), Vector((random.uniform(-.1, .1), random.uniform(-.1, .1), 1)), height * 0.6, 0.22, 0.12, mat=0)
    # flare at the root
    tapered_branch(bm, Vector((0, 0, -0.1)), Vector((0, 0, 1)), 0.35, 0.34, 0.2, mat=0)
    tips = [top]
    for i in range(5):
        a = i * 2 * math.pi / 5 + random.uniform(-.3, .3)
        d = Vector((math.cos(a) * spread, math.sin(a) * spread, random.uniform(0.6, 1.1)))
        start = top - Vector((0, 0, random.uniform(0, height * 0.2)))
        tips.append(tapered_branch(bm, start, d, height * random.uniform(0.25, 0.4), 0.09, 0.03, mat=0))
    for i, t in enumerate(tips):
        blob(bm, t + Vector((0, 0, 0.2)), random.uniform(0.7, 1.0) * height * 0.22, seed * 10 + i)
    blob(bm, top + Vector((0, 0, height * 0.28)), height * 0.3, seed * 10 + 9)
    obj = new_obj(name, bm, ["bark", "leaves"])
    box_uv(obj, 1.0)
    return obj


tree("tree_a", 1, 4.2, 0.9)
tree("tree_b", 2, 3.4, 1.2)

# --- fountain -------------------------------------------------------------------
bm = bmesh.new()
OCT = 8


def ring_solid(bm, r_out, r_in, z0, z1, segs=OCT, rot=math.pi / 8):
    """Hollow octagonal wall (basin rim) from z0 to z1."""
    def ring(r, z):
        return [bm.verts.new((r * math.cos(rot + 2 * math.pi * k / segs), r * math.sin(rot + 2 * math.pi * k / segs), z)) for k in range(segs)]
    ob, ot, it, ib = ring(r_out, z0), ring(r_out, z1), ring(r_in, z1), ring(r_in, z0)
    for k in range(segs):
        n = (k + 1) % segs
        bm.faces.new([ob[k], ob[n], ot[n], ot[k]])   # outside
        bm.faces.new([ot[k], ot[n], it[n], it[k]])   # top lip
        bm.faces.new([it[k], it[n], ib[n], ib[k]])   # inside


def disc(bm, r, z, segs=OCT, rot=math.pi / 8, up=True):
    vs = [bm.verts.new((r * math.cos(rot + 2 * math.pi * k / segs), r * math.sin(rot + 2 * math.pi * k / segs), z)) for k in range(segs)]
    bm.faces.new(vs if up else list(reversed(vs)))


ring_solid(bm, 0.95, 0.78, 0.0, 0.5)
disc(bm, 0.8, 0.12)                                   # basin floor
bmesh.ops.create_cone(bm, cap_ends=True, segments=OCT, radius1=0.16, radius2=0.12, depth=1.1,
                      matrix=Matrix.Translation((0, 0, 0.55)))   # column
ring_solid(bm, 0.42, 0.34, 1.0, 1.15)                 # upper bowl rim
bmesh.ops.create_cone(bm, cap_ends=True, segments=OCT, radius1=0.12, radius2=0.42, depth=0.14,
                      matrix=Matrix.Translation((0, 0, 0.94)))   # upper bowl body
bmesh.ops.create_cone(bm, cap_ends=True, segments=OCT, radius1=0.07, radius2=0.03, depth=0.25,
                      matrix=Matrix.Translation((0, 0, 1.3)))    # spout
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
f = new_obj("fountain", bm, ["stone"], smooth=False)
bev = f.modifiers.new("bevel", "BEVEL")
bev.width = 0.015
bev.limit_method = "ANGLE"
bpy.context.view_layer.objects.active = f
bpy.ops.object.modifier_apply(modifier=bev.name)
box_uv(f, 1.0)

bm = bmesh.new()
disc(bm, 0.79, 0.42)
w1 = new_obj("fountain_water", bm, ["water"], smooth=False)
bm = bmesh.new()
disc(bm, 0.35, 1.12)
w2 = new_obj("fountain_water_top", bm, ["water"], smooth=False)
for w in (w1, w2):
    box_uv(w, 1.0)

for o in bpy.context.scene.objects:
    o.select_set(True)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(f"PIECE {o.name:20s} tris={tris:5d} dims={tuple(round(d, 2) for d in o.dimensions)}")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True,
                          export_materials="EXPORT", export_yup=True)
print("EXPORTED", OUT)
