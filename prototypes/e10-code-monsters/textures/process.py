from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from scipy.ndimage import gaussian_filter
import json, shutil
R=Path(__file__).resolve().parent
# Reuse the exact E4 correction function without importing its executing batch.
source=(R.parent.parent/'e4-textures'/'scripts'/'process.py').read_text()
exec(source[source.index('def periodic('):source.index('def kuwahara(')])
def save(a,p): Image.fromarray(np.rint(np.clip(a,0,1)*255).astype('uint8')).save(p)
def edge(a): return float((abs(a[0]-a[-1]).mean()+abs(a[:,0]-a[:,-1]).mean())/2*255)
def repeat(im):
 out=Image.new('RGB',(3072,3072))
 for y in range(3):
  for x in range(3): out.paste(im,(1024*x,1024*y))
 return out
metrics={}
for name,p in json.loads((R/'generation-manifest.json').read_text()).items():
 d=R/name;d.mkdir(exist_ok=True);shutil.copyfile(p,d/'generated.png')
 raw=np.asarray(Image.open(p).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS),float)/255
 a=periodic(raw);save(a,d/'basecolor.png')
 a=np.asarray(Image.open(d/'basecolor.png'),float)/255
 repeat(Image.open(d/'basecolor.png')).save(d/'preview-3x3.png')
 # Offset inspection exposes wrap boundaries at the image centre.
 save(np.roll(a,(512,512),(0,1)),d/'offset-preview.png')
 h=gaussian_filter(a@np.array([.2126,.7152,.0722]),2,mode='wrap')
 dx=(np.roll(h,-1,1)-np.roll(h,1,1))*2
 dy=(np.roll(h,-1,0)-np.roll(h,1,0))*2
 n=np.stack([-dx,dy,np.ones_like(h)],2);n/=np.linalg.norm(n,axis=2,keepdims=True)
 n=periodic(n*.5+.5)*2-1;n/=np.linalg.norm(n,axis=2,keepdims=True)
 save(n*.5+.5,d/'normal.png')
 rough={'ghoul-skin':.80,'bone':.88,'chitin':.68,'rusty-armour':.82,'leather-cloth':.94,'scales':.75}[name]
 save(periodic(np.clip(rough+(0.5-h)*.12,.5,.98)),d/'roughness.png')
 metrics[name]={'raw_edge_MAE_255':edge(raw),'final_edge_MAE_255':edge(a),'mean_luminance':float(h.mean())}
 for f in ['basecolor','normal','roughness']:
  im=Image.open(d/(f+'.png'));assert im.size==(1024,1024)
  b=np.asarray(im,float);assert np.array_equal(b[0],b[-1]) and np.array_equal(b[:,0],b[:,-1])
(R/'validation.json').write_text(json.dumps(metrics,indent=2))
sheet=Image.new('RGB',(1800,1380),(28,29,32));draw=ImageDraw.Draw(sheet)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',28)
draw.text((20,15),'E10 | painted creature materials | each panel repeats 3 x 3',font=font,fill='white')
for i,name in enumerate(metrics):
 x=(i%3)*600;y=65+(i//3)*650
 draw.text((x+12,y),name,font=font,fill='white')
 sheet.paste(Image.open(R/name/'preview-3x3.png').resize((588,588),Image.Resampling.LANCZOS),(x+6,y+42))
sheet.save(R/'contact-sheet.png')
print(json.dumps(metrics,indent=2))
