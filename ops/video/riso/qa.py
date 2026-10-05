#!/usr/bin/env python3
"""QA for the proof render: contact sheet, palette audit, beat landings, lockup fidelity, 100% UI crop.
  python3 ops/video/riso/qa.py
"""
import json, os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import riso, scene_proof as sp  # noqa: E402

V = os.path.abspath(os.path.join(HERE, '..'))
R = os.path.join(V, 'proof', 'render')
C = os.path.join(V, 'proof', 'contact')
os.makedirs(C, exist_ok=True)
fr = lambda n: np.asarray(Image.open(os.path.join(R, f'r_{n:04d}.png')).convert('RGB'))
FONT = ImageFont.truetype('/home/user/floorbnb/apps/web/node_modules/geist/dist/fonts/geist-mono/GeistMono-Medium.ttf', 18)

# 1 contact sheet
SHEET = [0, 14, 15, 18, 30, 60, 75, 90, 120, 138, 180, 207, 210, 240, 270, 295, 299]
tw, th, cols = 384, 216, 6
rows = math.ceil(len(SHEET) / cols)
sheet = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 34) + 8), (40, 40, 40))
d = ImageDraw.Draw(sheet)
for i, n in enumerate(SHEET):
    im = Image.fromarray(fr(n)).resize((tw, th), Image.LANCZOS)
    x, y = 8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 34)
    sheet.paste(im, (x, y)); d.text((x, y + th + 6), f'f{n:03d}  {n / 30:.2f}s', font=FONT, fill=(230, 230, 230))
sheet.save(os.path.join(C, 'render_contact.png'))

# 2 palette audit: 20 random px outside panel/lockup/crisp text in 10 frames
A = sp.assets(os.path.join(V, 'proof', 'capture'))
pal = {k: v * 255 for k, v in riso.PALETTE.items()}
names = list(pal)
cands = [pal[k] for k in names]
labels = list(names)
for i in range(1, len(names)):          # ink-on-paper mixes and two-ink overprints (multiply)
    for j in range(i + 1, len(names)):
        pass
def nearest_mix(c):
    """distance to nearest paper/ink tint (ink coverage a over paper) or two-ink overprint."""
    best = (1e9, '')
    P = pal['paper']
    inks = [k for k in names if k != 'paper']
    for k in inks:
        r = pal[k] / P
        for a in np.linspace(0, 1, 41):
            m = P * (1 - a + a * r)
            dd = np.abs(m - c).max()
            if dd < best[0]: best = (dd, f'{k}@{a:.2f}' if a < 1 else k)
    if best[0] <= 12:
        return best
    g = np.linspace(0, 1, 21)
    for i, k1 in enumerate(inks):
        for k2 in inks[i + 1:]:
            r1, r2 = pal[k1] / P, pal[k2] / P
            m = P * (1 - g[:, None, None] + g[:, None, None] * r1) * (1 - g[None, :, None] + g[None, :, None] * r2)
            dd = np.abs(m - c).max(-1)
            ij = np.unravel_index(dd.argmin(), dd.shape)
            if dd[ij] < best[0]: best = (float(dd[ij]), f'{k1}@{g[ij[0]]:.2f}x{k2}@{g[ij[1]]:.2f}')
    return best
rng = np.random.default_rng(7)
audit, bad = [], []
for n in [18, 40, 60, 76, 100, 150, 190, 230, 260, 285]:
    img = fr(n).astype(np.float32)
    f, info = sp.build(n, A)
    excl = np.zeros(img.shape[:2], bool)
    for op in f.crisp:
        if op[0] == 'rgba':
            _, a, x, y = op; excl[max(0, y - 4):y + a.shape[0] + 4, max(0, x - 4):x + a.shape[1] + 4] = True
        elif op[0] == 'rgbm':
            _, rgb, m, x, y = op; excl[max(0, y - 6):y + m.shape[0] + 6, max(0, x - 6):x + m.shape[1] + 6] = True
        elif op[0] == 'outline':
            xs = [p[0] for p in op[1]]; ys = [p[1] for p in op[1]]
            excl[max(0, int(min(ys)) - 6):int(max(ys)) + 6, max(0, int(min(xs)) - 6):int(max(xs)) + 6] = True
    ys, xs = np.nonzero(~excl)
    idx = rng.choice(len(ys), 20, replace=False)
    for k in idx:
        c = img[ys[k], xs[k]]
        dist, lab = nearest_mix(c)
        audit.append(dict(frame=n, x=int(xs[k]), y=int(ys[k]), rgb=[int(v) for v in c], nearest=lab, dist=round(float(dist), 1)))
        if dist > 12: bad.append(audit[-1])
# 3 beats
cues = json.load(open(os.path.join(V, 'proof', 'cues.json')))['events']
hits = [e for e in cues if e['event'] in ('lockup_stamp', 'headline_word_group', 'headline_slide_off', 'panel_slide_in_start',
                                          'crash_swap', 'cut_to_line_card', 'line_card_word_group', 'shape_hit', 'end_card_cut', 'headline_shapes_hit')]
beat = [(e['event'], e['frame'], e['frame'] % 15 == 0 or e['event'] == 'crash_swap') for e in hits]
# also detect actual hard cuts from pixel differences
diffs = []
prev = fr(0).astype(np.int16)
for n in range(1, 300):
    cur = fr(n).astype(np.int16)
    diffs.append((n, float(np.abs(cur - prev).mean())))
    prev = cur
big = [n for n, v in diffs if v > 6.0]
# 4 lockup fidelity (end card, frame 280, 640 px wide lockup at the same position), also with grain disabled
lk = np.asarray(Image.open(os.path.join(sp.ASSETS, 'lockup_640_paper.png')).convert('RGB')).astype(np.int16)
x0, y0 = 960 - 320, int(round(470 - lk.shape[0] / 2))
crop = fr(280)[y0:y0 + lk.shape[0], x0:x0 + lk.shape[1]].astype(np.int16)
d_grain = np.abs(crop - lk)
f280, _ = sp.build(280, A); f280.grain = 0; f280.crisp_grain = 0
ng = f280.render()[y0:y0 + lk.shape[0], x0:x0 + lk.shape[1]].astype(np.int16)
# compare only where the lockup has ink (alpha>0) - background there is riso paper anyway
alpha = np.asarray(Image.open(os.path.join(sp.ASSETS, 'lockup_640_alpha.png')))[..., 3]
mk = alpha == 255   # fully opaque lockup pixels (edge AA pixels blend with the paper under them)
d_ng = np.abs(ng - lk)
# 5 UI 100% crop mid-drag
mid = 110
log = json.load(open(os.path.join(R, 'render_log.json')))
scale = log['frames_info'][str(mid)]['panel_scale']
Image.fromarray(fr(mid)[300:700, 500:1300]).save(os.path.join(C, f'ui_crop_100pct_f{mid}.png'))
out = dict(palette_samples=len(audit), palette_outliers=bad, beats=beat, pixel_cut_frames_gt40=[n for n, v in diffs if v > 40],
           lockup=dict(max_diff_with_grain=int(d_grain.max()), mean_diff_with_grain=round(float(d_grain.mean()), 2),
                       max_diff_no_grain_on_lockup_px=int(d_ng[mk].max()), max_diff_no_grain_full_crop=int(d_ng.max())),
           mid_drag_frame=mid, mid_drag_panel_scale=scale, render=dict(wall_s=log['wall_s'], per_frame_worker_s=log['per_frame_mean_s']))
json.dump(dict(out, palette_audit=audit), open(os.path.join(C, 'qa.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
