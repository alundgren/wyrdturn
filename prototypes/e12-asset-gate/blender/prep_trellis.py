# Prepare a raw TRELLIS GLB for the game, headless:
#   Blender -b --factory-startup --python blender/prep_trellis.py -- in.glb out.glb TRIS HEIGHT_M [ROT_X_DEG] [TEX_PX]
# Steps:
#  1. import, join, optional X rotation (Pixal3D outputs come in sideways), weld loose triangles
#     (TRELLIS meshes are triangle soup; without welding, decimation tears them apart),
#  2. low-poly copy: collapse-decimate to ~TRIS, fresh UVs (Smart UV Project),
#  3. bake the original's base colour onto the low-poly (Cycles, selected-to-active),
#     because decimating the TRELLIS UV atlas (thousands of tiny islands) scrambles the texture,
#  4. scale to HEIGHT_M, origin at bottom centre, export with a TEX_PX JPEG texture.
import sys
import math
import bpy
import bmesh
import mathutils

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst, target_tris, height = argv[0], argv[1], int(argv[2]), float(argv[3])
rot_x = float(argv[4]) if len(argv) > 4 else 0.0
tex_px = int(argv[5]) if len(argv) > 5 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
for o in list(bpy.context.scene.objects):
    if o.type != "MESH":
        bpy.data.objects.remove(o, do_unlink=True)
if rot_x:
    high.rotation_euler[0] += math.radians(rot_x)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# scale to target height and put on the floor first, so bake distances are in metres
bb = [mathutils.Vector(c) for c in high.bound_box]
zmin, zmax = min(v.z for v in bb), max(v.z for v in bb)
xc = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
yc = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
s = height / max(1e-6, zmax - zmin)
high.scale = (s, s, s)
high.location = (-xc * s, -yc * s, -zmin * s)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

bm = bmesh.new(); bm.from_mesh(high.data)
vb = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005 * max(high.dimensions))
bm.to_mesh(high.data); bm.free()
tris_before = sum(len(p.vertices) - 2 for p in high.data.polygons)

# low-poly copy
low = high.copy(); low.data = high.data.copy(); low.name = "low"
bpy.context.scene.collection.objects.link(low)
for uv in list(low.data.uv_layers):
    low.data.uv_layers.remove(uv)
mod = low.modifiers.new("decimate", "DECIMATE")
mod.decimate_type = "COLLAPSE"
mod.ratio = min(1.0, target_tris / max(1, tris_before))
mod.use_collapse_triangulate = True
bpy.context.view_layer.objects.active = low
bpy.ops.object.select_all(action="DESELECT"); low.select_set(True)
bpy.ops.object.modifier_apply(modifier=mod.name)
tris_after = sum(len(p.vertices) - 2 for p in low.data.polygons)
low.data.uv_layers.new(name="UVMap")
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
bpy.ops.object.mode_set(mode="OBJECT")
for p in low.data.polygons:
    p.use_smooth = True

# bake target: one image on a fresh material
img = bpy.data.images.new("baked", tex_px, tex_px)
mat = bpy.data.materials.new("baked"); mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
try:
    bsdf.inputs["Roughness"].default_value = 0.85
except KeyError:
    pass
low.data.materials.clear(); low.data.materials.append(mat)
nt.nodes.active = tex

scene = bpy.context.scene
try:
    scene.render.engine = "CYCLES"
except TypeError as e:
    print("engine list:", e)
scene.cycles.samples = 4
scene.cycles.device = "CPU"
bake = scene.render.bake
bake.use_selected_to_active = True
bake.cage_extrusion = 0.02 * height
bake.margin = 4
bpy.ops.object.select_all(action="DESELECT")
high.select_set(True); low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
img.pack()

bpy.data.objects.remove(high, do_unlink=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True, export_apply=True, export_image_format="JPEG", export_jpeg_quality=88)
print(f"PREP {src} -> {dst}: welded verts {vb}, tris {tris_before} -> {tris_after}, height {height} m, rotX {rot_x}, baked {tex_px}px")
