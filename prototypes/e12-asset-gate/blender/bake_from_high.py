# Bake the high-poly TRELLIS colour onto a simplified low-poly (headless):
#   Blender -b --factory-startup --python blender/bake_from_high.py -- high.glb low.glb out.glb TEX_PX
# Both files must already share the same transform (prep.mjs applies the same rotation/scale/offset
# to both: run it on high with ratio 1, and on low with SHAPE_ONLY=1).
import sys, math, bpy
a = sys.argv[sys.argv.index("--") + 1:]
high_p, low_p, out_p, px = a[0], a[1], a[2], int(a[3]) if len(a) > 3 else 1024
bpy.ops.wm.read_factory_settings(use_empty=True)

def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    ms = [o for o in new if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in ms: o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    if len(ms) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for x in new:
        if x.type != "MESH": bpy.data.objects.remove(x, do_unlink=True)
    return o

high = load(high_p)
low = load(low_p)
for uv in list(low.data.uv_layers): low.data.uv_layers.remove(uv)
low.data.uv_layers.new(name="UVMap")
bpy.ops.object.select_all(action="DESELECT"); low.select_set(True); bpy.context.view_layer.objects.active = low
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.shade_smooth()

img = bpy.data.images.new("baked", px, px)
mat = bpy.data.materials.new("baked"); mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.85
low.data.materials.clear(); low.data.materials.append(mat)
nt.nodes.active = tex
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.samples = 1; sc.cycles.device = "CPU"
bk = sc.render.bake
bk.use_selected_to_active = True
bk.cage_extrusion = 0.015 * max(low.dimensions)
bk.max_ray_distance = 0.05 * max(low.dimensions)
bk.margin = 6
bpy.ops.object.select_all(action="DESELECT")
high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
img.pack()
bpy.data.objects.remove(high, do_unlink=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=out_p, export_format="GLB", use_selection=True, export_image_format="JPEG", export_jpeg_quality=88)
print(f"BAKED {out_p}: {sum(len(p.vertices) - 2 for p in low.data.polygons)} tris, {px}px")
