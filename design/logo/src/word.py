from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
f=TTFont('/home/hyprayush/Documents/Projects/floor/web/node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf')
gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f['head'].unitsPerEm
os2=f['OS/2']; cap=os2.sCapHeight
track=-0.02*upm
x=0; parts=[]
for ch in "Floor":
    g=cmap[ord(ch)]
    pen=SVGPathPen(gs, ntos=lambda v: ('%.1f'%v).rstrip('0').rstrip('.'))
    # scale so cap height = 24 units, baseline y=24
    s=24/cap
    tp=TransformPen(pen,(s,0,0,-s,x*s,24))
    gs[g].draw(tp)
    parts.append(pen.getCommands())
    x+=gs[g].width+track
# bounds
from fontTools.pens.boundsPen import BoundsPen
print("width_units", (x-track)*24/cap, "cap", cap, "upm", upm)
open('word.d','w').write(''.join(parts))
