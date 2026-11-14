from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[1];results=[]
for row in json.loads((R/'method-b/manifest.json').read_text()):
 name={'Diffuse':'source-basecolor','nor_gl':'source-normal','Rough':'source-roughness'}[row['map']]
 p=next((R/'method-b'/row['material']).glob(name+'.*'));actual=hashlib.md5(p.read_bytes()).hexdigest();assert actual==row['md5'],p
 results.append({'asset':row['asset'],'map':row['map'],'md5_verified':True})
(R/'method-b/download-verification.json').write_text(json.dumps(results,indent=2));print('12 downloaded source map hashes verified')
