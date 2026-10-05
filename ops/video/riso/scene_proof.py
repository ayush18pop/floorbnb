"""Floor launch video - 10 s pipeline proof scene (300 frames @ 30 fps, 1920x1080).

Timeline follows ops/video/BRIEF.md storyboard; every cut / stamp / type hit is on a beat frame (multiple of 15).
build(n) -> riso.Frame ; cues() -> list of sound-relevant events.
"""
import json
import math
import os
import numpy as np
from PIL import Image

import riso
from riso import Frame, stepped, smooth, sample12, W, H

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, 'build', 'assets')
FPS = 30
BEAT = 15

# ---- beat map (frames)
F_LINE_STEPS = (3, 6, 9, 12)          # floor line draws in 4 stepped moves
F_STAMP = 15
F_WORDS = (30, 45, 60)
F_PANEL = 75
F_DRAG0, F_DRAG1 = 90, 138             # capture frames 15..63
F_BACK1 = 147
F_CRASH0, F_CRASH1 = 147, 207          # capture k72 = instant chart swap (app does not animate), held to k134
F_SWAP = 147                           # crash_swap cut (capture k72)
F_READ_IN0, F_READ_IN1 = 152, 162      # stepped push-in on the crash readout
F_READ_OUT0 = 178                      # slow pull-back to the cut at 210
READOUT_CSS = (900.0, 196.0)           # centre of the 'HOLDING THE STOCK / WITH THE FLOOR VAULT' numbers (CSS px)
ZOOM_READ = 1.7
F_CARD = 210
F_CARD2 = 225
F_HITS = (240, 255)
F_END = 270
F_FADE0 = 294                          # last 6 frames fade to paper
NFRAMES = 300

# ---- panel geometry (world px at camera zoom 1)
PX, PY, PW, PH = 288, 80, 1344, 840
SRC_W, SRC_H = 2880, 1800
CSS_W, CSS_H = 1440, 900
SHADOW = 16
SCREEN_C = (960.0, 480.0)
CAPTION_XY = (288, 990)
ZOOM_IN = 1.8


class Assets:
    def __init__(self, capture_dir):
        m = json.load(open(os.path.join(ASSETS, 'manifest.json')))
        self.m = m
        self.mask = {}
        for k in ('h1', 'h2', 'h3', 'l1', 'l2'):
            L = m['layers'][k]
            a = np.asarray(Image.open(os.path.join(ASSETS, L['file'])).convert('RGBA'))[..., 3].astype(np.float32) / 255.0
            ys, xs = np.nonzero(a.any(1))[0], np.nonzero(a.any(0))[0]
            self.mask[k] = (a[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1].copy(), L['x'] + xs[0], L['y'] + ys[0])
        self.rgba = {}
        for k in ('caption', 'footer'):
            L = m['layers'][k]
            self.rgba[k] = np.asarray(Image.open(os.path.join(ASSETS, L['file'])).convert('RGBA'))
        self.lockup = {int(w): np.asarray(Image.open(os.path.join(ASSETS, v['file'])).convert('RGBA'))
                       for w, v in m['lockup'].items()}
        self.capture_dir = capture_dir
        self.events = json.load(open(os.path.join(capture_dir, 'events.json')))
        self.standin = os.path.exists(os.path.join(capture_dir, 'STANDIN'))
        reg = self.events['regions']
        self.thumbs = reg['slider_thumb_by_frame']
        self.readout = reg.get('floor_readout')
        self.scroll = [(fd.get('scroll', {}) or {}) for fd in self.events['frames_data']]

    def cap(self, k):
        k = max(0, min(self.events['frames'] - 1, k))
        return Image.open(os.path.join(self.capture_dir, 'frames', f'f_{k:04d}.png')).convert('RGB')


_A = None


def assets(capture_dir=None):
    global _A
    if _A is None:
        _A = Assets(capture_dir)
    return _A


# ------------------------------------------------------------------------------------------- camera
def css_to_world(x, y):
    return PX + x * PW / CSS_W, PY + y * PH / CSS_H


def thumb_world(A, k):
    k = max(0, min(len(A.thumbs) - 1, k))
    t = A.thumbs[k]
    sy = (A.scroll[k].get('y', 0) if k < len(A.scroll) else 0) or 0
    sx = (A.scroll[k].get('x', 0) if k < len(A.scroll) else 0) or 0
    return css_to_world(t['x'] - sx + t['w'] / 2, t['y'] - sy + t['h'] / 2)


def focus_point(A, k):
    """Thumb-centred focus; pulled half-way to the floor readout when both fit in frame at full zoom."""
    tx, ty = thumb_world(A, k)
    if A.readout:
        r = A.readout
        sy = (A.scroll[min(k, len(A.scroll) - 1)].get('y', 0) or 0)
        rx, ry = css_to_world(r['x'] + r['w'] / 2, r['y'] - sy + r['h'] / 2)
        if abs(rx - tx) * ZOOM_IN < 1300 and abs(ry - ty) * ZOOM_IN < 700:
            return 0.5 * (tx + rx), 0.5 * (ty + ry)
    return tx, ty


def follow_focus(A, n):
    """Thumb follow, lightly smoothed (one-pole, deterministic: recomputed from the start of the drag)."""
    fx, fy = focus_point(A, F_DRAG0 - F_PANEL)
    for m in range(F_DRAG0, n + 1):
        tx, ty = focus_point(A, m - F_PANEL)
        fx += (tx - fx) * 0.45
        fy += (ty - fy) * 0.45
    return fx, fy


def panel_camera(A, n):
    """Returns (zoom, F(world focus), tilt_deg, slide_x)."""
    S = SCREEN_C
    z, F, tilt, slide = 1.0, S, 0.0, 0.0
    if n < F_PANEL + 9:  # slide-in (stepped, 2-frame holds) with a little tilt settling to 0
        steps = {75: 820, 76: 820, 77: 250, 78: 250, 79: 64, 80: 64, 81: 12, 82: 12}
        slide = steps.get(n, 0)
        tilt = {75: 4.0, 76: 4.0, 77: 2.6, 78: 2.6, 79: 1.2, 80: 1.2, 81: 0.4, 82: 0.4}.get(n, 0.0)
    elif F_DRAG0 <= n < F_DRAG1:
        e = stepped((n - F_DRAG0 + 1) / 10.0, 5)
        z = 1 + (ZOOM_IN - 1) * e
        f = follow_focus(A, n)
        F = (S[0] + (f[0] - S[0]) * e, S[1] + (f[1] - S[1]) * e)
    elif F_DRAG1 <= n < F_BACK1:
        e = 1 - stepped((n - F_DRAG1 + 1) / 9.0, 4)
        z = 1 + (ZOOM_IN - 1) * e
        f = follow_focus(A, F_DRAG1 - 1)
        F = (S[0] + (f[0] - S[0]) * e, S[1] + (f[1] - S[1]) * e)
    elif n >= F_CRASH0:
        R = css_to_world(*READOUT_CSS)
        if n < F_READ_IN0:
            e = 0.0
        elif n < F_READ_OUT0:
            e = stepped((n - F_READ_IN0 + 1) / (F_READ_IN1 - F_READ_IN0), 5)
        else:
            e = 1.0 - smooth((n - F_READ_OUT0) / (F_CARD - 1 - F_READ_OUT0)) * 1.0
        R = (R[0] + (min(n, F_READ_OUT0) - F_READ_IN1) * 0.6, R[1]) if n >= F_READ_IN1 else R
        if n >= F_READ_OUT0:   # slow pull-back overshoots to a slightly wider than base framing, small tilt
            u = smooth((n - F_READ_OUT0) / (F_CARD - 1 - F_READ_OUT0))
            z = 1 + (ZOOM_READ - 1) * e - 0.05 * u
            tilt = -1.6 * u
        else:
            z = 1 + (ZOOM_READ - 1) * e
        F = (S[0] + (R[0] - S[0]) * e, S[1] + (R[1] - S[1]) * e)
    return z, F, tilt, slide


def to_screen(wx, wy, z, F, k=1.0, slide=0.0):
    zk = 1 + (z - 1) * k
    Fk = (SCREEN_C[0] + (F[0] - SCREEN_C[0]) * k, SCREEN_C[1] + (F[1] - SCREEN_C[1]) * k)
    return (wx - Fk[0]) * zk + SCREEN_C[0] + slide * k, (wy - Fk[1]) * zk + SCREEN_C[1]


def project_tilt(pts, tilt_deg, c):
    if abs(tilt_deg) < 1e-3:
        return pts
    th = math.radians(tilt_deg); ph = math.radians(tilt_deg * 0.35); f = 2600.0
    out = []
    for x, y in pts:
        X, Y = x - c[0], y - c[1]
        X1, Z1 = X * math.cos(th), X * math.sin(th)
        Y2, Z2 = Y * math.cos(ph) - Z1 * math.sin(ph), Y * math.sin(ph) + Z1 * math.cos(ph)
        s = f / (f + Z2)
        out.append((c[0] + X1 * s, c[1] + Y2 * s))
    return out


def persp_coeffs(dst, src):
    """PIL PERSPECTIVE coefficients mapping output quad `dst` -> input quad `src`."""
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


PANEL_LOG = {}


def draw_panel(fr, A, n, z, F, tilt, slide):
    k = n - F_PANEL
    x0, y0 = to_screen(PX, PY, z, F, 1.0, slide)
    wi, hi = int(round(PW * z)), int(round(PH * z))
    scale = wi / SRC_W
    assert scale <= 2.0
    PANEL_LOG[n] = scale
    src = A.cap(k)
    if abs(tilt) < 1e-3:
        x0i, y0i = int(round(x0)), int(round(y0))
        quad = [(x0i, y0i), (x0i + wi, y0i), (x0i + wi, y0i + hi), (x0i, y0i + hi)]
        X0, Y0, X1, Y1 = max(0, x0i), max(0, y0i), min(W, x0i + wi), min(H, y0i + hi)
        if X1 > X0 and Y1 > Y0:
            sx = SRC_W / wi; sy = SRC_H / hi
            box = ((X0 - x0i) * sx, (Y0 - y0i) * sy, (X1 - x0i) * sx, (Y1 - y0i) * sy)
            rgb = np.asarray(src.resize((X1 - X0, Y1 - Y0), Image.LANCZOS, box=box), np.float32) / 255.0
            fr.crisp_rgbmask(rgb, np.ones(rgb.shape[:2], np.float32), X0, Y0)
    else:
        c = (x0 + wi / 2, y0 + hi / 2)
        flat = [(x0, y0), (x0 + wi, y0), (x0 + wi, y0 + hi), (x0, y0 + hi)]
        quad = project_tilt(flat, tilt, c)
        pre = src.resize((wi, hi), Image.LANCZOS)              # Lanczos to final scale first, then a near 1:1 warp
        xs = [p[0] for p in quad]; ys = [p[1] for p in quad]
        bx0, by0 = int(math.floor(min(xs))), int(math.floor(min(ys)))
        bx1, by1 = int(math.ceil(max(xs))), int(math.ceil(max(ys)))
        cx0, cy0, cx1, cy1 = max(0, bx0), max(0, by0), min(W, bx1), min(H, by1)
        if cx1 > cx0 and cy1 > cy0:
            dst = [(px - cx0, py - cy0) for px, py in quad]
            co = persp_coeffs(dst, [(0, 0), (wi, 0), (wi, hi), (0, hi)])
            size = (cx1 - cx0, cy1 - cy0)
            rgb = np.asarray(pre.transform(size, Image.PERSPECTIVE, co, Image.BICUBIC), np.float32) / 255.0
            ones = Image.new('L', (wi, hi), 255)
            m = np.asarray(ones.transform(size, Image.PERSPECTIVE, co, Image.BILINEAR), np.float32) / 255.0
            fr.crisp_rgbmask(rgb, m, cx0, cy0)
    # hard solid offset shadow (cobalt plate, riso) + thin ink keyline (crisp)
    fr.poly('coral' if n >= F_SWAP else 'cobalt', [(px + SHADOW, py + SHADOW) for px, py in quad])
    fr.crisp_outline(quad, 'ink', 2)
    return quad


# ------------------------------------------------------------------------------------------- scene parts
def floor_line(fr, y, x0=-40, x1=W + 40, th=10):
    fr.rect('cobalt', x0, y, x1, y + th)


def misreg_for(n):
    """Stamp kicks: 3 px at the stamp, settling to 1 px; small kicks on every type/shape hit."""
    base = 1.4
    if F_STAMP <= n < F_STAMP + 10:
        return 3.0 - 2.0 * stepped((n - F_STAMP + 1) / 10, 4, ease=True)
    for h in F_WORDS + (F_PANEL, F_SWAP, F_CARD, F_CARD2) + F_HITS + (F_END,):
        if h <= n < h + 3:
            return (3.0, 2.4, 1.8)[n - h] if h == F_SWAP else (2.6, 2.0, 1.6)[n - h]
    return base


def lockup_at(fr, A, W_, cx, cy):
    a = A.lockup[W_]
    fr.crisp_rgba(a, int(round(cx - W_ / 2)), int(round(cy - a.shape[0] / 2)))


STAIR_CELLS = [(0, 2), (1, 1), (2, 0), (2, 2), (3, 1)]
STAIR_CELLS2 = [(0, 0), (1, 1), (0, 2), (2, 2), (1, 3)]


def sparkle(fr, cx, cy, r):
    pts = []
    for i in range(8):
        a = -math.pi / 2 + i * math.pi / 4
        rr = r if i % 2 == 0 else r * 0.24
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    fr.poly('ink', pts)


def scene_intro(fr, A, n):
    # floor line draws in 4 stepped moves (left to right) then holds
    widths = [0.0, 0.34, 0.66, 0.88, 1.0]
    i = sum(1 for f in F_LINE_STEPS if n >= f)
    if i:
        floor_line(fr, 680, -40, -40 + (W + 80) * widths[i])
    if n >= F_STAMP:
        W_ = {15: 678, 16: 659}.get(n, 640)
        lockup_at(fr, A, W_, 960, 470)
        d = int(sample12(n - F_STAMP))
        fr.tone('periwinkle', 1180 - d * 0.5, 610, 1920, 676, 0.0, 0.55, 'x', pitch=9, origin=(1180 - d * 0.5, 610))
        fr.pixels('mint', STAIR_CELLS, 1716 + d * 0.4, 96, 22)
        fr.pixels('coral', STAIR_CELLS2, 120 - d * 0.4, 860, 22)


def headline_art(fr, n, ox):
    """Right column collage; ox = horizontal offset of the whole group (slide-off). Parallax by layer depth."""
    d = sample12(max(0, n - F_WORDS[0]))
    if n >= F_WORDS[0]:
        a = ox - d * 0.30
        fr.tone('ink', 1240 + a, 190, 1700 + a, 520, 0.62, 0.12, 'y', pitch=8, origin=(1240 + a, 190))
        b = ox - d * 0.45
        fr.tone('periwinkle', 1150 + b, 340, 1620 + b, 770, 0.58, 0.58, pitch=11, origin=(1150 + b, 340))
        fr.pixels('mint', STAIR_CELLS2, 1150 + ox - d * 0.7, 200, 20)
    if n >= F_WORDS[1]:
        c = ox - d * 0.55
        # stepped value line falling to rest one stroke above the floor line (never touching it)
        pts, x, y, sw = [], 1180.0 + c, 270.0, 14
        steps = [(46, 40), (40, 64), (52, 36), (36, 88), (60, 52), (44, 70), (70, 40), (40, 60)]
        top, bot = [], []
        for dx, dy in steps:
            top += [(x, y), (x + dx, y)]
            x += dx; y += dy
        y_rest = 870 - 10 - sw
        top += [(x, y_rest), (W + 60, y_rest)]
        for (x0, y0), (x1, y1) in zip(top[:-1], top[1:]):
            if y1 == y0:
                fr.rect('cobalt', min(x0, x1) - sw / 2, y0, max(x0, x1) + sw / 2, y0 + sw)
            else:
                fr.rect('cobalt', x0 - sw / 2, min(y0, y1), x0 + sw / 2, max(y0, y1) + sw)
    if n >= F_WORDS[2]:
        e = ox - d * 0.85
        fr.disc('mint', 1712 + e, 300, 48)
        sparkle(fr, 1712 + e, 300, 30)
        fr.pixels('coral', STAIR_CELLS, 1640 + e, 600, 22)


def scene_headline(fr, A, n, ox=0.0):
    d = sample12(max(0, n - F_WORDS[0]))
    if ox == 0.0:
        floor_line(fr, 870)   # during the slide-off only the panel's floor line remains
    if ox == 0.0:
        lockup_at(fr, A, 300, 96 + 150, 60 + 30)   # top-left, as on the OG cards
    t = ox - d * 0.18
    if n >= F_WORDS[0]:
        a, x, y = A.mask['h1']; fr.mask('ink', a, x + t, y)
    if n >= F_WORDS[1]:
        a, x, y = A.mask['h2']; fr.mask('ink', a, x + t, y)
    if n >= F_WORDS[2]:
        a, x, y = A.mask['h3']; fr.mask('ink', a, x + t, y)
        bl = A.m['accent']['baseline']
        fr.rect('coral', x + t + 4, bl + 26, x + t + a.shape[1] - 4, bl + 48)
    headline_art(fr, n, ox)


KICK = {F_SWAP: 26.0, F_SWAP + 1: 12.0, F_SWAP + 2: 4.0}


def panel_decor(fr, n, z, F, tilt, slide):
    d = sample12(max(0, n - F_PANEL))
    kk = KICK.get(n, 0.0)          # stepped parallax kick on the crash swap (paper layers only)
    def S(x, y, k):
        return to_screen(x, y, z, F, k, slide)
    # periwinkle halftone block behind the panel's top-left corner
    x0, y0 = S(150 - d * 0.10 - kk, 26 - kk * 0.4, 0.55); x1, y1 = S(640 - d * 0.10 - kk, 430 - kk * 0.4, 0.55)
    zk = 1 + (z - 1) * 0.55
    if n >= F_PANEL + 4:   # lands once the headline collage has left (avoids screen-on-screen moire)
        fr.tone('periwinkle', x0, y0, x1, y1, 0.5, 0.5, pitch=11 * zk, origin=(x0, y0))
    # ink halftone strip behind the right edge (vertical dot ramp)
    x0, y0 = S(1560 + d * 0.12 + kk * 0.8, 540, 0.7); x1, y1 = S(1790 + d * 0.12 + kk * 0.8, 1000, 0.7)
    zk = 1 + (z - 1) * 0.7
    fr.tone('ink', x0, y0, x1, y1, 0.06, 0.42, 'y', pitch=8 * zk, origin=(x0, y0))
    # pixel squares
    zk = 1 + (z - 1) * 1.2
    x, y = S(1676 + d * 0.2 + kk * 1.2, 18 - kk * 0.5, 1.2); fr.pixels('mint', STAIR_CELLS, x, y, 22 * zk)
    x, y = S(150 - d * 0.2 - kk * 1.2, 820 + kk * 0.5, 1.2); fr.pixels('coral', STAIR_CELLS2, x, y, 22 * zk)
    if n >= F_SWAP:   # re-print: a coral dot ramp lands with the swap
        zk = 1 + (z - 1) * 0.8
        x0, y0 = S(980 + kk * 1.5 - d * 0.15, 978, 0.8); x1, y1 = S(1640 + kk * 1.5 - d * 0.15, 1020, 0.8)
        fr.tone('coral', x0, y0, x1, y1, 0.0, 0.6, 'x', pitch=9 * zk, origin=(x0, y0))
    # floor line the panel stands on
    _, ly = S(0, 960, 1.0)
    fr.rect('cobalt', -40, ly, W + 40, ly + 10 * z)


def scene_panel(fr, A, n):
    z, F, tilt, slide = panel_camera(A, n)
    panel_decor(fr, n, z, F, tilt, slide)
    draw_panel(fr, A, n, z, F, tilt, slide)
    fr.crisp_rgba(A.rgba['caption'], *CAPTION_XY)
    return z, F, tilt


def scene_card(fr, A, n):
    d = sample12(n - F_CARD)
    fr.rect('cobalt', -40, 850, W + 40, 860)
    # mint flat paper-cut shape (slightly rotated)
    cx, cy, w, h, r = 1560 - d * 0.25, 360, 520, 330, math.radians(-4)
    pts = [(cx + (x * math.cos(r) - y * math.sin(r)), cy + (x * math.sin(r) + y * math.cos(r)))
           for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
    fr.poly('mint', pts)
    t = -d * 0.12
    a, x, y = A.mask['l1']; fr.mask('ink', a, x + t, y)
    if n >= F_CARD2:
        b = -d * 0.45
        fr.tone('periwinkle', 1380 + b, 470, 1850 + b, 846, 0.6, 0.6, pitch=12, origin=(1380 + b, 470))
        a, x, y = A.mask['l2']; fr.mask('ink', a, x + t, y)
    if n >= F_HITS[0]:
        fr.pixels('cobalt', STAIR_CELLS, 1248 - d * 0.6, 120, 22)
    if n >= F_HITS[1]:
        fr.pixels('coral', STAIR_CELLS2, 1300 - d * 0.7, 900, 22)
        fr.tone('coral', 1420 - d * 0.7, 900, 1860 - d * 0.7, 950, 0.5, 0.0, 'x', pitch=9, origin=(1420, 900))


def scene_end(fr, A, n):
    floor_line(fr, 680)
    lockup_at(fr, A, 640, 960, 470)
    f = A.rgba['footer']
    fr.crisp_rgba(f, 960 - f.shape[1] // 2, 752)
    fr.tone('periwinkle', 1180, 610, 1920, 676, 0.0, 0.55, 'x', pitch=9, origin=(1180, 610))
    if n >= F_FADE0:
        fr.fade = (NFRAMES - 1 - n) / 6.0


def build(n, A):
    fr = Frame(n, misreg=misreg_for(n))
    info = {}
    if n < F_WORDS[0]:
        scene_intro(fr, A, n)
    elif n < F_PANEL:
        scene_headline(fr, A, n)
    elif n < F_CARD:
        if n < F_PANEL + 8:   # headline group slides off left as a paper layer (stepped, 2-frame holds)
            off = {0: -240, 1: -240, 2: -760, 3: -760, 4: -1500, 5: -1500, 6: -2400, 7: -2400}[n - F_PANEL]
            scene_headline(fr, A, n, ox=off)
        z, F, tilt = scene_panel(fr, A, n)
        info = dict(zoom=z, focus=F, tilt=tilt, panel_scale=PANEL_LOG.get(n))
    elif n < F_END:
        scene_card(fr, A, n)
    else:
        scene_end(fr, A, n)
    return fr, info


# ------------------------------------------------------------------------------------------- cues
def slider_value_series(A):
    fd = A.events['frames_data']
    keys = ('slider_value', 'value', 'floor_pct', 'floor', 'sliderValue')
    for key in keys:
        if all(key in f and f[key] is not None for f in fd):
            return [float(f[key]) for f in fd], key
    # fallback: derive from the thumb centre along the track, 90 at the first, 80 at the last drag position
    xs = [t['x'] + t['w'] / 2 for t in A.thumbs]
    a, b = xs[F_DRAG0 - F_PANEL], xs[F_DRAG1 - F_PANEL]
    if abs(b - a) < 1e-6:
        return [90.0] * len(xs), 'none'
    return [90.0 + (x - a) / (b - a) * (80.0 - 90.0) for x in xs], 'thumb_x_interp'


def cues(A):
    ev = []
    def add(name, f, **kw):
        ev.append(dict(event=name, frame=int(f), t=round(f / FPS, 4), **kw))
    add('floor_line_draw_start', F_LINE_STEPS[0])
    for i, f in enumerate(F_LINE_STEPS):
        add('floor_line_step', f, step=i + 1)
    add('floor_line_draw_end', F_LINE_STEPS[-1])
    add('lockup_stamp', F_STAMP)
    for f, words in zip(F_WORDS, ('Set a floor', 'under your', 'stocks.')):
        add('headline_word_group', f, text=words)
    add('headline_shapes_hit', F_WORDS[0], what='halftone blocks')
    add('headline_shapes_hit', F_WORDS[1], what='cobalt value line')
    add('headline_shapes_hit', F_WORDS[2], what='mint disc, coral squares, coral underline')
    add('headline_slide_off', F_PANEL)
    add('panel_slide_in_start', F_PANEL)
    add('panel_slide_in_end', F_PANEL + 8)
    add('caption_on', F_PANEL)
    add('camera_push_in_start', F_DRAG0)
    md = [f['i'] for f in A.events['frames_data'] if f.get('mouse', {}).get('down')]
    if md:
        add('slider_mouse_down', F_PANEL + md[0], capture_frame=md[0])
        add('slider_mouse_up', F_PANEL + md[-1] + 1, capture_frame=md[-1] + 1)
    vals, src = slider_value_series(A)
    last = None
    for k, v in enumerate(vals):
        f = F_PANEL + k
        q = int(round(v))
        if last is None:
            last = q
            continue
        if q != last:
            step = -1 if q < last else 1
            for p in range(last + step, q + step, step):
                add('slider_step', f, value_pct=p, source=src)
            last = q
    add('camera_pull_back_start', F_DRAG1)
    add('camera_whole_panel', F_BACK1)
    add('crash_swap', F_SWAP, capture_frame=F_SWAP - F_PANEL, note='real chart swap (COVID crash chip), hard cut; coral shadow swap + misreg jolt')
    add('crash_replay_start', F_SWAP, capture_frame=F_SWAP - F_PANEL)
    add('camera_push_in_readout_start', F_READ_IN0)
    add('camera_push_in_readout_end', F_READ_IN1)
    add('camera_slow_pull_back_start', F_READ_OUT0)
    add('cut_to_line_card', F_CARD, text='Spot swaps.')
    add('shape_hit', F_CARD, what='mint shape')
    add('line_card_word_group', F_CARD2, text='BNB Chain.')
    add('shape_hit', F_CARD2, what='periwinkle halftone block')
    add('shape_hit', F_HITS[0], what='cobalt squares')
    add('shape_hit', F_HITS[1], what='coral squares + dot ramp')
    add('end_card_cut', F_END)
    add('final_fade_start', F_FADE0)
    add('final_fade_end', NFRAMES - 1)
    add('end', NFRAMES, t_end=10.0)
    ev.sort(key=lambda e: (e['frame'], e['event']))
    return ev
