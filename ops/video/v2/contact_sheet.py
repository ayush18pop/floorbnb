import cv2,sys,numpy as np,glob,os
d=sys.argv[1]; out=sys.argv[2]; cols=int(sys.argv[3]); frames=[int(x) for x in sys.argv[4].split(',')]
tw=480; th=270
rows=(len(frames)+cols-1)//cols
sheet=np.full((rows*(th+22),cols*tw,3),235,np.uint8)
for i,n in enumerate(frames):
    im=cv2.imread(f'{d}/r_{n:04d}.png')
    if im is None: continue
    im=cv2.resize(im,(tw,th),interpolation=cv2.INTER_AREA)
    r,c=divmod(i,cols)
    sheet[r*(th+22)+22:(r+1)*(th+22),c*tw:(c+1)*tw]=im
    cv2.putText(sheet,str(n),(c*tw+4,r*(th+22)+16),cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,0,0),1,cv2.LINE_AA)
cv2.imwrite(out,sheet)
