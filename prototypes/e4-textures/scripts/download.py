import json,urllib.request,pathlib,time,subprocess
root=pathlib.Path(__file__).resolve().parents[1]; start=time.time(); manifest=[]
for mat,asset in {'wall':'castle_brick_01','floor':'monastery_stone_floor','wood':'medieval_wood','iron':'rusty_metal_03'}.items():
 d=root/'method-b'/mat;d.mkdir(exist_ok=True)
 data=json.loads(subprocess.check_output(['curl','-fLsS','https://api.polyhaven.com/files/'+asset])); (d/'files.json').write_text(json.dumps(data,indent=2))
 for key,name in [('Diffuse','source-basecolor'),('nor_gl','source-normal'),('Rough','source-roughness')]:
  item=data[key]['1k']; fmt='png' if 'png' in item else 'jpg'; info=item[fmt]
  subprocess.run(['curl','-fLsS','--retry','3',info['url'],'-o',str(d/(name+'.'+fmt))],check=True);manifest.append(dict(material=mat,asset=asset,map=key,licence='CC0',licence_url='https://polyhaven.com/license',asset_url='https://polyhaven.com/a/'+asset,**info))
(root/'method-b/manifest.json').write_text(json.dumps(manifest,indent=2));print('Download seconds',time.time()-start)
