import sys,glob,os
from PIL import Image, ImageDraw
d=sys.argv[1]; fs=sorted(glob.glob(d+'/frames/f_*.png')); n=len(fs)
idx=[round(i*(n-1)/8) for i in range(9)]
W,H=640,400
sheet=Image.new('RGB',(W*3,H*3),'white')
for j,i in enumerate(idx):
    im=Image.open(fs[i]).convert('RGB').resize((W,H),Image.LANCZOS)
    ImageDraw.Draw(im).text((6,4),f'f{i}',fill=(255,0,0))
    sheet.paste(im,((j%3)*W,(j//3)*H))
sheet.save(d+'/contact.png')
