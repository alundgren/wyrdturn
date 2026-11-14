from PIL import Image,ImageDraw,ImageFont
import numpy as np
from scipy.ndimage import uniform_filter,gaussian_filter
from pathlib import Path
import json,time
R=Path(__file__).resolve().parents[1];start=time.time();metrics={}
def read(p):return np.asarray(Image.open(p).convert('RGB').resize((1024,1024)),dtype=float)/255
def save(a,p):Image.fromarray(np.uint8(np.clip(a,0,1)*255)).save(p)
def edge(a):return float((abs(a[0]-a[-1]).mean()+abs(a[:,0]-a[:,-1]).mean())/2*255)
def periodic(a,width=64):
 a=a.copy()
 for axis in [0,1]:
  b=np.moveaxis(a,axis,0);delta=(b[-1]-b[0])/2
  for i in range(width):
   w=(1-i/width)**2;b[i]+=delta*w;b[-1-i]-=delta*w
 return np.clip(a,0,1)
def kuwahara(a):
 means=[];variances=[]
 for y,x in [(-4,-4),(-4,4),(4,-4),(4,4)]:
  mean=np.roll(uniform_filter(a,size=(9,9,1),mode='wrap'),(y,x),(0,1));sq=np.roll(uniform_filter(a*a,size=(9,9,1),mode='wrap'),(y,x),(0,1))
  means.append(mean);variances.append((sq-mean*mean).sum(2))
 idx=np.argmin(variances,axis=0);return np.take_along_axis(np.stack(means),idx[None,:,:,None],axis=0)[0]
def maps(a,d,height=None):
 h=gaussian_filter(a.mean(2) if height is None else height,2,mode='wrap');dx=(np.roll(h,-1,1)-np.roll(h,1,1))*3;dy=(np.roll(h,-1,0)-np.roll(h,1,0))*3
 n=np.stack([-dx,-dy,np.ones_like(h)],2);n/=np.linalg.norm(n,axis=2,keepdims=True);save(periodic(n*.5+.5),d/'normal.png');save(periodic(np.clip(.9-h*.16,0,1)),d/'roughness.png')
def preview(a,path):
 tile=Image.fromarray(np.uint8(np.clip(a,0,1)*255));out=Image.new('RGB',(3072,3072))
 for y in range(3):
  for x in range(3):out.paste(tile,(x*1024,y*1024))
 out.save(path)
for method in ['a','b','c']:
 for mat in ['wall','floor','wood','iron']:
  d=R/('method-'+method)/mat;d.mkdir(exist_ok=True)
  if method=='a':
   for trial in range(1,4):
    p=R/'method-a'/f'{mat}-trial-{trial}.png'
    if not p.exists():continue
    a=read(p);preview(a,d/f'trial-{trial}-raw-3x3.png');metrics[f'a/{mat}/trial-{trial}']={'raw_edge_MAE_255':edge(a)};a=periodic(a);save(a,d/f'trial-{trial}-basecolor.png');preview(a,d/f'trial-{trial}-3x3.png')
   if not (d/'trial-3-basecolor.png').exists():continue
   a=read(d/'trial-3-basecolor.png')
  elif method=='b':
   src=list(d.glob('source-basecolor.*'))
   if not src:continue
   a=read(src[0]);preview(a,d/'source-3x3.png');a=kuwahara(a);a=np.round(a*18)/18
   lum=a.mean(2,keepdims=True);a=(a*.72+lum*.28)*np.array([.76,.77,.72]);grad=np.sqrt(sum(g*g for g in np.gradient(gaussian_filter(lum[:,:,0],1))));a*=np.clip(1-grad[:,:,None]*3,.65,1)
  else:a=read(d/'basecolor-raw.png')
  raw=edge(a);a=periodic(a);metrics[f'{method}/{mat}']={'before_edge_MAE_255':raw,'after_edge_MAE_255':edge(a)};save(a,d/'basecolor.png');preview(a,d/'preview-3x3.png')
  if method!='b':maps(a,d,read(d/'height-raw.png').mean(2) if method=='c' else None)
  else:
   for name in ['normal','roughness']:
    p=next(d.glob('source-'+name+'.*'));save(periodic(read(p)),d/(name+'.png'))
  wet=periodic(a*np.array([.65,.72,.73]));save(wet,d/'wet-basecolor.png');preview(wet,d/'wet-3x3.png');save(np.ones((1024,1024))*.28,d/'wet-roughness.png')
# Every cell contains a literal 3x3 repetition without lines masking its boundaries.
cols=['A1 painted','A2 gouache','A3 production','B CC0 paint-over','C procedural','A3 wet','B wet','C wet'];cw=480;ch=520
sheet=Image.new('RGB',(cw*8,100+ch*4),(20,22,25));draw=ImageDraw.Draw(sheet)
try:font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',22)
except:font=ImageFont.load_default(size=22)
draw.text((15,12),'E4 — painted dark fantasy materials | each panel repeats 3 x 3 | albedo only',font=font,fill='white')
for x,title in enumerate(cols):draw.text((x*cw+8,65),title,font=font,fill='white')
for y,mat in enumerate(['wall','floor','wood','iron']):
 paths=[R/'method-a'/mat/f'trial-{i}-3x3.png' for i in range(1,4)]+[R/f'method-{m}'/mat/'preview-3x3.png' for m in ['b','c']]+[R/f'method-{m}'/mat/'wet-3x3.png' for m in ['a','b','c']]
 for x,p in enumerate(paths):
  if p.exists():sheet.paste(Image.open(p).resize((474,474)),(x*cw+3,100+y*ch+35))
  draw.text((x*cw+8,100+y*ch+5),mat,font=font,fill='white')
sheet.save(R/'contact-sheet.png');(R/'edge-metrics.json').write_text(json.dumps(metrics,indent=2));print('Processing seconds',time.time()-start)
