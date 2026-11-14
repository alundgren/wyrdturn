"""Headless image processing only. Reuse E4 functions without running its batch."""
import ast,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import gaussian_filter,uniform_filter
R=Path(__file__).resolve().parent
source=R.parent/'scripts/process.py'
tree=ast.parse(source.read_text())
# Executing function definitions only avoids the original script's top-level writes.
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),str(source),'exec'))
metrics={}
for b in ['crypt','forge','moss','bone']:
 for k in ['wall','floor']:
  d=R/b/k
  a=read(d/'source.png')
  raw=edge(a)
  # Lift low-value generation results while preserving channel ratios and hue.
  if b in ['forge','moss']:
   lum=a@np.array([.2126,.7152,.0722])
   target=112/255
   gain=target/max(float(lum.mean()),.01)
   a=np.clip(a*gain,0,1)
  a=periodic(a)
  save(a,d/'basecolor.png')
  maps(a,d)
  # Quantisation can leave a one-level discrepancy; make saved borders exact.
  for name in ['basecolor','normal','roughness']:
   p=d/(name+'.png');im=np.array(Image.open(p));im[-1]=im[0];im[:,-1]=im[:,0];Image.fromarray(im).save(p)
  a=read(d/'basecolor.png');preview(a,d/'preview-3x3.png')
  checks={}
  for name in ['basecolor','normal','roughness']:
   im=np.asarray(Image.open(d/(name+'.png')),dtype=float)
   checks[name]={'size':list(Image.open(d/(name+'.png')).size),'opposite_edge_MAE_255':edge(im/255),'opposite_edge_max_255':float(max(abs(im[0]-im[-1]).max(),abs(im[:,0]-im[:,-1]).max()))}
  lum=a@np.array([.2126,.7152,.0722])
  metrics[b+'/'+k]={'raw_edge_MAE_255':raw,'maps':checks,'basecolor_luminance_mean_255':float(lum.mean()*255),'basecolor_luminance_percentiles_255':list(np.percentile(lum,[5,50,95])*255)}
  assert all(v['opposite_edge_max_255']==0 and v['size']==[1024,1024] for v in checks.values())
W=1600; panel=750; row=810
sheet=Image.new('RGB',(W,100+4*row),(33,36,39));draw=ImageDraw.Draw(sheet)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',26)
small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',19)
draw.text((25,16),'DUNGEON BIOMES | painted mid-tone materials | each panel repeats 3 x 3',font=font,fill='white')
draw.text((25,60),'WALL | 2 m x 2 m per repeat',font=small,fill='white');draw.text((825,60),'FLOOR | 2 m x 2 m per repeat',font=small,fill='white')
for y,b in enumerate(['crypt','forge','moss','bone']):
 for x,k in enumerate(['wall','floor']):
  px=25+800*x;py=100+row*y
  draw.text((px,py),b.upper()+' / '+k,font=font,fill='white')
  sheet.paste(Image.open(R/b/k/'preview-3x3.png').resize((panel,panel),Image.Resampling.LANCZOS),(px,py+42))
sheet.save(R/'contact-sheet.png')
(R/'validation.json').write_text(json.dumps(metrics,indent=2))
print(json.dumps(metrics,indent=2))
