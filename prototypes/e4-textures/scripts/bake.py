import bpy, pathlib,time
root=pathlib.Path(__file__).resolve().parents[1];start=time.time()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_plane_add(size=2);obj=bpy.context.object
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False
for kind in ['wall','floor','wood','iron']:
 d=root/'method-c'/kind;d.mkdir(exist_ok=True)
 mat=bpy.data.materials.new(kind);mat.use_nodes=True;obj.data.materials.clear();obj.data.materials.append(mat)
 n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
 out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeEmission');l.new(em.outputs[0],out.inputs['Surface'])
 uv=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(18,1,1) if kind=='wood' else (1,1,1);l.new(uv.outputs['UV'],mapping.inputs[0])
 noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=7;noise.inputs['Detail'].default_value=3;l.new(mapping.outputs[0],noise.inputs['Vector'])
 ramp=n.new('ShaderNodeValToRGB');l.new(noise.outputs['Fac'],ramp.inputs[0]);ramp.color_ramp.interpolation='CONSTANT'
 colors={'wall':[(.035,.042,.04,1),(.14,.16,.14,1),(.26,.27,.23,1)],'floor':[(.035,.04,.045,1),(.12,.14,.16,1),(.28,.29,.27,1)],'wood':[(.018,.012,.007,1),(.085,.045,.018,1),(.22,.13,.055,1)],'iron':[(.018,.023,.025,1),(.11,.038,.012,1),(.32,.12,.028,1)]}[kind]
 for i,c in enumerate(colors):
  e=ramp.color_ramp.elements[i] if i<2 else ramp.color_ramp.elements.new(.65);e.position=[.25,.48,.65][i];e.color=c
 color=ramp.outputs[0];height=noise.outputs['Fac']
 if kind in ['wall','floor','wood']:
  brick=n.new('ShaderNodeTexBrick');l.new(uv.outputs['UV'],brick.inputs['Vector']);brick.inputs['Scale'].default_value=3 if kind=='floor' else 4 if kind=='wall' else 2;brick.offset=0 if kind in ['floor','wood'] else .5;brick.inputs['Mortar Size'].default_value=.025;brick.inputs['Brick Width'].default_value=.8 if kind=='wall' else .5;brick.inputs['Row Height'].default_value=1.8 if kind=='wood' else .85 if kind=='floor' else .4;brick.inputs['Color1'].default_value=(.8,.8,.8,1);brick.inputs['Color2'].default_value=(.5,.5,.5,1);brick.inputs['Mortar'].default_value=(.08,.08,.08,1)
  mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;l.new(color,mix.inputs[1]);l.new(brick.outputs['Color'],mix.inputs[2]);color=mix.outputs[0];height=brick.outputs['Color']
 tex=n.new('ShaderNodeTexImage');n.active=tex
 for name,socket in [('basecolor',color),('height',height)]:
  img=bpy.data.images.new(kind+name,width=1024,height=1024);tex.image=img;l.new(socket,em.inputs['Color']);bpy.ops.object.bake(type='EMIT');img.filepath_raw=str(d/(name+'-raw.png'));img.file_format='PNG';img.save()
 bpy.ops.wm.save_as_mainfile(filepath=str(root/'method-c/materials.blend'))
print('Bake seconds',time.time()-start)
