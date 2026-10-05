#!/usr/bin/env python3
"""Synthetic STAND-IN capture (pipeline testing only, never shipped).
Writes ops/video/riso/_standin/{frames/f_0000..f_0134.png, events.json} following the capture contract.
Every frame is visibly marked STAND-IN."""
import json, os, math
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '_standin')
FONT = '/home/user/floorbnb/apps/web/node_modules/geist/dist/fonts/geist-mono/GeistMono-Medium.ttf'
os.makedirs(os.path.join(OUT, 'frames'), exist_ok=True)

N = 135
track = dict(x=180, y=520, w=500, h=6)
chart = dict(x=760, y=180, w=600, h=420)
readout = dict(x=180, y=430, w=300, h=60)

def value_at(i):              # 90% -> 80% between capture frames 15 and 63
    if i <= 15: return 90.0
    if i >= 63: return 80.0
    u = (i - 15) / 48
    return 90.0 - 10.0 * (0.5 - 0.5 * math.cos(math.pi * u))

def thumb(i):
    v = value_at(i)
    x = track['x'] + (v - 50) / 50 * track['w']  # pretend range 50..100
    return dict(x=round(x - 9, 2), y=track['y'] - 7, w=18, h=20)

big = ImageFont.truetype(FONT, 120); mid = ImageFont.truetype(FONT, 56)
frames_data, thumbs = [], []
for i in range(N):
    S = 2
    im = Image.new('RGB', (2880, 1800), (236, 236, 236))
    d = ImageDraw.Draw(im)
    for gx in range(0, 2880, 80): d.line([(gx, 0), (gx, 1800)], fill=(222, 222, 222), width=2)
    d.text((80, 60), 'STAND-IN  (not a capture)', font=big, fill=(150, 30, 150))
    v = value_at(i)
    d.text((readout['x'] * S, readout['y'] * S), f'FLOOR {v:5.1f}%', font=mid, fill=(20, 20, 20))
    t = track; d.rectangle([t['x'] * S, t['y'] * S, (t['x'] + t['w']) * S, (t['y'] + t['h']) * S], fill=(120, 120, 120))
    th = thumb(i); thumbs.append(th)
    d.rectangle([th['x'] * S, th['y'] * S, (th['x'] + th['w']) * S, (th['y'] + th['h']) * S], fill=(150, 30, 150))
    c = chart; d.rectangle([c['x'] * S, c['y'] * S, (c['x'] + c['w']) * S, (c['y'] + c['h']) * S], outline=(40, 40, 40), width=3)
    pts = []
    k = max(0, i - 72)
    for j in range(0, 61):
        px = c['x'] + j * c['w'] / 60
        crash = 0 if j > k else 0
        py = c['y'] + 80 + 40 * math.sin(j / 5) + (min(j, k) * 4 if i >= 72 else 0)
        pts.append((px * S, py * S))
    d.line(pts, fill=(150, 30, 150), width=6)
    fy = c['y'] + c['h'] - (v - 50) / 50 * c['h']
    d.line([(c['x'] * S, fy * S), ((c['x'] + c['w']) * S, fy * S)], fill=(40, 40, 200), width=4)
    d.text((80, 1650), f'STAND-IN frame {i:03d}', font=mid, fill=(150, 30, 150))
    im.save(os.path.join(OUT, 'frames', f'f_{i:04d}.png'), compress_level=1)
    down = 15 <= i <= 63
    frames_data.append(dict(i=i, t=round(i / 30, 4), mouse=dict(x=th['x'] + 9, y=th['y'] + 10, down=down), slider_value=round(v, 3)))

json.dump(dict(fps=30, frames=N, viewport=dict(w=1440, h=900, dpr=2), frames_data=frames_data,
               regions=dict(slider_track=track, slider_thumb_by_frame=thumbs, chart=chart, floor_readout=readout),
               notes='SYNTHETIC STAND-IN for pipeline tests'), open(os.path.join(OUT, 'events.json'), 'w'), indent=1)
open(os.path.join(OUT, 'STANDIN'), 'w').write('synthetic\n')
print('standin ok')
