# Builds the modular dungeon kit and exports it as one GLB.
# Run headless (no window):
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#     --python blender/build_kit.py -- out/kit.glb
#
# Conventions (Blender, Z up; glTF export turns this into Y up):
# - One grid tile is 2 m x 2 m, walls are 3 m high.
# - Wall pieces span x -1..1, z 0..3. The visible face is at y = 0 and faces -Y
#   (three.js +Z). The wall body goes back to +Y (behind the face).
# - Every object keeps its origin at the placement point; three.js looks objects
#   up by name and swaps materials by material name (wall, floor, wood, iron).
# - UVs are world-space box projection, 1 texture repeat per 2 m, so all pieces
#   share one texel density and line up.
import sys
import math
import random

import bpy
import bmesh
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "kit.glb"
TEX_M = 2.0
random.seed(3)

bpy.ops.wm.read_factory_settings(use_empty=True)

MATS = {}
for name, col in [("wall", (0.3, 0.28, 0.25, 1)), ("floor", (0.25, 0.23, 0.2, 1)),
                  ("wood", (0.3, 0.2, 0.12, 1)), ("iron", (0.15, 0.13, 0.12, 1))]:
    m = bpy.data.materials.new(name)
    m.diffuse_color = col
    MATS[name] = m


def box(bm, x0, x1, y0, y1, z0, z1, mat_index=0):
    """Add an axis-aligned box to a bmesh, return its faces."""
    vs = [bm.verts.new(v) for v in [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
    idx = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    faces = [bm.faces.new([vs[i] for i in f]) for f in idx]
    for f in faces:
        f.material_index = mat_index
    return faces


def finish(name, bm, mats, bevel=0.0, smooth_angle=None):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        me.materials.append(MATS[m])
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        apply_mods(obj)
    box_uv(obj)
    return obj


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def box_uv(obj):
    """World-space box projection, 1 repeat per TEX_M metres."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y * (1 if n.x > 0 else -1), co.z
            elif ax == 1:
                u, v = co.x * (-1 if n.y > 0 else 1), co.z
            else:
                u, v = co.x, co.y * (1 if n.z > 0 else -1)
            uv[li].uv = (u / TEX_M, v / TEX_M)


def jitter_face(bm, axis_min_y=-0.001, amount=0.035, cuts=10):
    """Push vertices on the visible face (y ~ 0) back a little at random,
    so the wall face is not perfectly flat. Normal map does the fine detail."""
    face_edges = [e for e in bm.edges if all(abs(v.co.y) < 1e-4 for v in e.verts)]
    bmesh.ops.subdivide_edges(bm, edges=face_edges, cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        if abs(v.co.y) < 1e-4 and 0.32 < v.co.z < 2.7 and abs(v.co.x) < 0.99:
            v.co.y += random.uniform(0, amount)


# --- wall: slab + plinth + cornice -------------------------------------------
bm = bmesh.new()
box(bm, -1, 1, 0, 0.3, 0, 3, 0)
jitter_face(bm)
box(bm, -1, 1, -0.09, 0.02, 0, 0.32, 0)        # plinth sticks out 9 cm
box(bm, -1, 1, -0.07, 0.02, 2.72, 3.0, 0)      # cornice
finish("kit_wall", bm, ["wall"], bevel=0.015)

# --- corner column (hides seams where walls meet) ----------------------------
bm = bmesh.new()
r = 0.2
box(bm, -r, r, -r, r, 0, 3, 0)
box(bm, -r - 0.05, r + 0.05, -r - 0.05, r + 0.05, 0, 0.36, 0)    # base
box(bm, -r - 0.04, r + 0.04, -r - 0.04, r + 0.04, 2.68, 3.0, 0)  # capital
finish("kit_corner", bm, ["wall"], bevel=0.025)

# --- floor and ceiling --------------------------------------------------------
bm = bmesh.new()
box(bm, -1, 1, -1, 1, -0.1, 0, 0)
finish("kit_floor", bm, ["floor"])

bm = bmesh.new()
box(bm, -1, 1, -1, 1, 3, 3.1, 0)
finish("kit_ceiling", bm, ["wall"])

# Wooden beam across a tile, under the ceiling (along X).
bm = bmesh.new()
box(bm, -1, 1, -0.12, 0.12, 2.7, 3.0, 0)
finish("kit_beam", bm, ["wood"], bevel=0.02)

# --- doorway: stone partition with an arched opening + wooden frame ------------
bm = bmesh.new()
box(bm, -1, 1, -0.25, 0.25, 0, 3, 0)
wall = finish("kit_doorway", bm, ["wall"])
# cutter: box for the lower part + cylinder for the round top
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.0))
c1 = bpy.context.active_object
c1.scale = (1.2, 1.0, 2.0)
bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.6, depth=1.0, location=(0, 0, 2.0), rotation=(math.pi / 2, 0, 0))
c2 = bpy.context.active_object
for c in (c1, c2):
    mod = wall.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = c
    mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = wall
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(c, do_unlink=True)
box_uv(wall)

# Wooden door frame inside the opening (two posts + lintel at arch spring).
bm = bmesh.new()
box(bm, -0.62, -0.5, -0.27, 0.27, 0, 2.0, 0)
box(bm, 0.5, 0.62, -0.27, 0.27, 0, 2.0, 0)
box(bm, -0.62, 0.62, -0.27, 0.27, 1.9, 2.05, 0)
finish("kit_doorframe", bm, ["wood"], bevel=0.015)

# --- wall sconce: back plate + arm + cup (flame added in code) ------------------
bm = bmesh.new()
box(bm, -0.08, 0.08, -0.03, 0.0, -0.15, 0.15, 0)        # plate on wall
box(bm, -0.025, 0.025, -0.3, -0.03, -0.03, 0.02, 0)     # arm out from wall
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.04, radius2=0.08, depth=0.12,
                      matrix=__import__("mathutils").Matrix.Translation((0, -0.3, 0.06)))
finish("kit_sconce", bm, ["iron"], bevel=0.005)

# --- report + export -----------------------------------------------------------
for o in bpy.context.scene.objects:
    o.select_set(o.type == "MESH")
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(f"PIECE {o.name:14s} tris={tris:5d} dims={tuple(round(d, 2) for d in o.dimensions)}")

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True,
                          export_apply=True, export_materials="EXPORT", export_yup=True)
print("EXPORTED", OUT)
