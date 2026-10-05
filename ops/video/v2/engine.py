"""Floor v2 compositor core: pinhole camera, textured paper planes projected by homography, riso ink, lens.

World: right-handed, X right, Y up, Z toward the viewer of the first card (the path runs into -Z).
Camera: position, look-at target, roll, focal length in px (pinhole, principal point at the frame centre).
Plane: centre C, yaw/pitch/roll (deg), world size w x h, texture size tw x th px. Texture (u,v) with v down.
  X_cam = R_cam @ (O + ex*su*u - ey*sv*v - cam.pos), screen = K @ X_cam  ->  H = K @ M  (exact homography).

Every plane renders into its own premultiplied RGBA buffer (screen bbox), gets its lens effects there
(motion blur = average of sub-frame projections over a 180 degree shutter; thin-lens defocus = gaussian of the
circle of confusion), then is composited back to front (painter's algorithm) with "over". Real UI pixels are
only resampled (INTER_AREA prescale to a mip level, then Lanczos4 warp), never tinted. Ink layers (type, flat
shapes, halftone) carry the riso treatment: per-ink misregistration (screen px, 15 fps state), texture-space bleed,
halftone shimmer variants; paper grain + fibre over everything except UI and the lockup.
Deterministic: all noise is seeded by frame / 15 fps state.
"""
import math
import os
import sys
from collections import OrderedDict

import cv2
import numpy as np
from scipy import ndimage

cv2.setNumThreads(1)
W, H = 1920, 1080
CX, CY = W / 2.0, H / 2.0
NEAR = 60.0


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


PAPER = hexrgb('#FAFAF8')
INKS = {'periwinkle': hexrgb('#7C93FF'), 'mint': hexrgb('#3DD68C'), 'coral': hexrgb('#FF7469'),
        'cobalt': hexrgb('#2440E0'), 'ink': hexrgb('#0B0C0E')}
PALETTE = {'paper': PAPER, **INKS}
ANGLE = {'ink': 45.0, 'cobalt': 15.0, 'periwinkle': 75.0, 'coral': 0.0, 'mint': 30.0}
MIS_DIR = {'ink': (0.35, -0.25), 'cobalt': (-0.8, 0.55), 'periwinkle': (0.9, 0.4), 'coral': (0.55, -0.85),
           'mint': (-0.6, -0.8)}


# ------------------------------------------------------------------------------------------------ math
def nrm(v):
    v = np.asarray(v, np.float64)
    return v / (np.linalg.norm(v) + 1e-12)


def rot_ypr(yaw, pitch=0.0, roll=0.0):
    a, b, c = math.radians(yaw), math.radians(pitch), math.radians(roll)
    Ry = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(b), -math.sin(b)], [0, math.sin(b), math.cos(b)]])
    Rz = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    return Ry @ Rx @ Rz


def T2(tx, ty):
    return np.array([[1, 0, tx], [0, 1, ty], [0, 0, 1]], np.float64)


class Cam:
    def __init__(self, pos, target, f=2000.0, roll=0.0):
        self.pos = np.asarray(pos, np.float64)
        self.target = np.asarray(target, np.float64)
        self.f = float(f)
        self.roll = float(roll)
        fwd = nrm(self.target - self.pos)
        right = nrm(np.cross(fwd, [0.0, 1.0, 0.0]))
        up = np.cross(right, fwd)
        r = math.radians(roll)
        right, up = right * math.cos(r) + up * math.sin(r), up * math.cos(r) - right * math.sin(r)
        self.R = np.stack([right, up, fwd])
        self.K = np.array([[f, 0, CX], [0, -f, CY], [0, 0, 1]], np.float64)

    def to_cam(self, X):
        return self.R @ (np.asarray(X, np.float64) - self.pos)

    def project(self, X):
        x, y, z = self.to_cam(X)
        return CX + self.f * x / z, CY - self.f * y / z, z

    def yaw_pitch(self):
        fwd = self.R[2]
        return (math.degrees(math.atan2(-fwd[0], -fwd[2])), math.degrees(math.asin(max(-1, min(1, fwd[1])))))


# ------------------------------------------------------------------------------------------------ noise
class NoiseBank:
    def __init__(self, seed=20261005):
        rng = np.random.default_rng(seed)
        BH, BW = H + 256, W + 256
        self.fine = rng.standard_normal((BH, BW), dtype=np.float32)
        fib = rng.standard_normal((H, W), dtype=np.float32)
        fib = ndimage.gaussian_filter(fib, (0.6, 2.2))
        self.fibre = (fib / (fib.std() + 1e-6)).astype(np.float32)

    def slice(self, arr, n, salt):
        r = np.random.default_rng((n * 7919 + salt * 104729) & 0xFFFFFFFF)
        oy = int(r.integers(0, arr.shape[0] - H + 1))
        ox = int(r.integers(0, arr.shape[1] - W + 1))
        return arr[oy:oy + H, ox:ox + W]


_BANK = None


def bank():
    global _BANK
    if _BANK is None:
        _BANK = NoiseBank()
    return _BANK


def misreg_offsets(state, amp=1.6, kick=0.0):
    """Per-ink screen offsets (px), slow drift + small wander, updated at 15 fps (state = n // 2).
    Key plate (ink, i.e. all type) stays within 1 px; colour plates within 1..3 px."""
    out = {}
    for i, (ink, (dx, dy)) in enumerate(MIS_DIR.items()):
        ph = i * 1.7
        a = (amp + kick) * (0.75 + 0.25 * math.sin(state * 0.22 + ph))
        ox = dx * a + 0.6 * math.sin(state * 0.142 + ph * 2.3)
        oy = dy * a + 0.6 * math.cos(state * 0.106 + ph * 1.1)
        lim = 1 if ink == 'ink' else 3
        if ink == 'ink':
            ox *= 0.5
            oy *= 0.5
        out[ink] = (float(max(-lim, min(lim, round(ox)))), float(max(-lim, min(lim, round(oy)))))
    return out


# ------------------------------------------------------------------------------------------------ texture fx
def halftone(w, h, t0, t1=None, axis='x', pitch=18.0, ink='ink', gain=1.0, phase=(0.0, 0.0)):
    """Round-dot halftone coverage (uint8) for a w x h texture block; tone ramps t0->t1 along axis."""
    if t1 is None:
        t1 = t0
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xx += 0.5 + phase[0]
    yy += 0.5 + phase[1]
    f = np.clip(xx / max(1, w), 0, 1) if axis == 'x' else np.clip(yy / max(1, h), 0, 1)
    t = t0 + (t1 - t0) * f
    ang = math.radians(ANGLE[ink])
    c, s = math.cos(ang), math.sin(ang)
    u = (xx * c + yy * s) / pitch
    v = (-xx * s + yy * c) / pitch
    du, dv = u - np.round(u), v - np.round(v)
    d = np.sqrt(du * du + dv * dv) * pitch
    r = pitch * np.sqrt(np.clip(t, 0, 1) / math.pi) * 1.02 * gain
    cov = np.clip(r - d + 0.5, 0, 1)
    cov[t <= 0.002] = 0
    return (cov * 255 + 0.5).astype(np.uint8)


def shape_bleed(cov_u8, seed, rough=0.30):
    """Riso ink bleed for flat shapes (texture space): soft spread + clumpy edge roughening (static)."""
    c = cov_u8.astype(np.float32) / 255.0
    rng = np.random.default_rng(seed)
    clump = ndimage.gaussian_filter(rng.standard_normal(c.shape).astype(np.float32), 1.6)
    clump /= clump.std() + 1e-6
    b = ndimage.uniform_filter(c, 5)
    edge = b * (1 - b) * 4
    r = np.clip((b - 0.5) * 1.9 + 0.5 + rough * edge * clump, 0, 1)
    r = np.maximum(r, b * 0.2)
    return (r * 255 + 0.5).astype(np.uint8)


def type_bleed(cov_u8, sigma_tex=1.0):
    """Light ink bleed for type: about 0.5 screen px (assets are 2x), keeps edges crisp."""
    c = cov_u8.astype(np.float32) / 255.0
    g = cv2.GaussianBlur(c, (0, 0), sigma_tex)
    r = np.maximum(c, np.clip(g * 1.15, 0, 1) * 0.85)
    return (r * 255 + 0.5).astype(np.uint8)


# ------------------------------------------------------------------------------------------------ caches
class LRU:
    def __init__(self, budget_bytes):
        self.d = OrderedDict()
        self.budget = budget_bytes
        self.size = 0

    def get(self, k):
        v = self.d.get(k)
        if v is not None:
            self.d.move_to_end(k)
        return v

    def put(self, k, v):
        if k in self.d:
            return
        self.d[k] = v
        self.size += v.nbytes
        while self.size > self.budget and len(self.d) > 1:
            _, old = self.d.popitem(last=False)
            self.size -= old.nbytes


PRESCALE = LRU(700 * 2 ** 20)
WARPCACHE = LRU(300 * 2 ** 20)
STATS = {'warps': 0, 'warp_cache_hits': 0, 'fast_paste': 0}


def level_for(s):
    """Mip level k with L = 2^(-k/16) >= s (never upsample the source; 0.5 is an exact level)."""
    if s >= 1.0:
        return 0
    return max(0, min(80, int(math.floor(-16.0 * math.log2(max(s, 1e-4)) + 1e-9))))


def prescaled(key, arr, k):
    if k == 0:
        return arr, 1.0, 1.0
    ck = (key, k)
    v = PRESCALE.get(ck)
    if v is None:
        L = 2.0 ** (-k / 16.0)
        h, w = arr.shape[:2]
        nw, nh = max(1, int(round(w * L))), max(1, int(round(h * L)))
        v = cv2.resize(arr, (nw, nh), interpolation=cv2.INTER_AREA)
        PRESCALE.put(ck, v)
    return v, v.shape[1] / arr.shape[1], v.shape[0] / arr.shape[0]


def jac_scale(Hm, pts):
    """Max singular value of the homography Jacobian over pts (texture coords)."""
    best = 0.0
    for u, v in pts:
        p = Hm @ np.array([u, v, 1.0])
        w = p[2]
        if w <= 1e-6:
            continue
        X, Y = p[0] / w, p[1] / w
        a = (Hm[0, 0] - X * Hm[2, 0]) / w
        b = (Hm[0, 1] - X * Hm[2, 1]) / w
        c = (Hm[1, 0] - Y * Hm[2, 0]) / w
        d = (Hm[1, 1] - Y * Hm[2, 1]) / w
        s1 = a * a + b * b + c * c + d * d
        det = a * d - b * c
        sv = math.sqrt(max(0.0, (s1 + math.sqrt(max(0.0, s1 * s1 - 4 * det * det))) / 2))
        best = max(best, sv)
    return best


def warp(key, arr, Hm, x0, y0, bbox, interp, border=cv2.BORDER_CONSTANT, s_pts=None):
    """Warp texture `arr` (placed at tex offset x0,y0) by continuous homography Hm (tex->screen) into bbox."""
    bx0, by0, bx1, by1 = bbox
    h, w = arr.shape[:2]
    pts = s_pts if s_pts is not None else [(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h),
                                           (x0 + w / 2, y0 + h / 2)]
    k = level_for(jac_scale(Hm, pts))
    src, fx, fy = prescaled(key, arr, k)
    S = np.array([[1 / fx, 0, x0], [0, 1 / fy, y0], [0, 0, 1]], np.float64)
    Hcv = T2(-0.5 - bx0, -0.5 - by0) @ Hm @ S @ T2(0.5, 0.5)
    Hcv = Hcv / Hcv[2, 2]
    ow, oh = bx1 - bx0, by1 - by0
    # fast path: pure integer translation at 1:1 -> exact paste (lockup on the idle end card, idle UI)
    if (abs(Hcv[0, 0] - 1) < 1e-7 and abs(Hcv[1, 1] - 1) < 1e-7 and abs(Hcv[0, 1]) < 1e-7 and abs(Hcv[1, 0]) < 1e-7
            and abs(Hcv[2, 0]) < 1e-10 and abs(Hcv[2, 1]) < 1e-10
            and abs(Hcv[0, 2] - round(Hcv[0, 2])) < 1e-4 and abs(Hcv[1, 2] - round(Hcv[1, 2])) < 1e-4):
        tx, ty = int(round(Hcv[0, 2])), int(round(Hcv[1, 2]))
        out = np.zeros((oh, ow) + src.shape[2:], src.dtype)
        if border == cv2.BORDER_REPLICATE:
            out = cv2.warpPerspective(src, Hcv, (ow, oh), flags=cv2.INTER_NEAREST, borderMode=border)
        else:
            X0, Y0 = max(0, tx), max(0, ty)
            X1, Y1 = min(ow, tx + src.shape[1]), min(oh, ty + src.shape[0])
            if X1 > X0 and Y1 > Y0:
                out[Y0:Y1, X0:X1] = src[Y0 - ty:Y1 - ty, X0 - tx:X1 - tx]
        STATS['fast_paste'] += 1
        return out, k
    ck = (key, k, Hcv.round(7).tobytes(), ow, oh, interp)
    v = WARPCACHE.get(ck)
    if v is not None:
        STATS['warp_cache_hits'] += 1
        return v, k
    out = cv2.warpPerspective(src, Hcv, (ow, oh), flags=interp, borderMode=border, borderValue=0)
    STATS['warps'] += 1
    WARPCACHE.put(ck, out)
    return out, k


def poly_mask(pts, bbox, ss=4):
    """Anti-aliased (4x4 supersampled) coverage of a screen polygon inside bbox, float32."""
    bx0, by0, bx1, by1 = bbox
    ow, oh = bx1 - bx0, by1 - by0
    SH = 4
    q = np.array([[((x - bx0) * ss - 0.5) * (1 << SH), ((y - by0) * ss - 0.5) * (1 << SH)] for x, y in pts])
    q = np.round(q).astype(np.int64)
    big = np.zeros((oh * ss, ow * ss), np.uint8)
    cv2.fillPoly(big, [q.astype(np.int32)], 255, lineType=cv2.LINE_8, shift=SH)
    small = cv2.resize(big, (ow, oh), interpolation=cv2.INTER_AREA)
    return small.astype(np.float32) / 255.0


def clip_near(poly_tex, M):
    """Sutherland-Hodgman clip of a texture-space polygon against camera z >= NEAR (z is affine in u,v)."""
    def z(p):
        return M[2, 0] * p[0] + M[2, 1] * p[1] + M[2, 2]
    out = []
    n = len(poly_tex)
    for i in range(n):
        a, b = poly_tex[i], poly_tex[(i + 1) % n]
        za, zb = z(a), z(b)
        if za >= NEAR:
            out.append(a)
        if (za >= NEAR) != (zb >= NEAR):
            t = (NEAR - za) / (zb - za)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def apply_h(Hm, pts):
    res = []
    for u, v in pts:
        p = Hm @ np.array([u, v, 1.0])
        res.append((p[0] / p[2], p[1] / p[2]))
    return res


# ------------------------------------------------------------------------------------------------ planes
class Layer:
    """kind: 'cov' (uint8 ink coverage texture, optional shimmer variants), 'rect' (solid ink rect, tex coords),
    'ui' (RGB source supplied per frame by src_fn), 'rgba' (premultiplied-safe RGBA, e.g. the lockup)."""

    def __init__(self, kind, ink=None, arr=None, x0=0.0, y0=0.0, w=None, h=None, on=-10 ** 9, off=10 ** 9,
                 variants=None, src_fn=None, key=None, protect=False, rect_fn=None, alpha_fn=None):
        self.kind, self.ink, self.arr, self.x0, self.y0 = kind, ink, arr, float(x0), float(y0)
        if arr is not None and w is None:
            h, w = arr.shape[:2]
        self.w, self.h = w, h
        self.on, self.off = on, off
        self.variants = variants
        self.src_fn = src_fn
        self.key = key or ('L', id(self))
        self.protect = protect
        self.rect_fn = rect_fn      # n -> (x0,y0,x1,y1) tex rect for animated rects (floor line draw)
        self.alpha_fn = alpha_fn    # n -> 0..1 (stepped reveals are 0/1)

    def visible(self, n):
        return self.on <= n < self.off


class Plane:
    def __init__(self, name, C, yaw=0.0, pitch=0.0, roll=0.0, w=1920.0, h=1080.0, tw=3840, th=2160, paper=True,
                 layers=None, on=-10 ** 9, off=10 ** 9, role='decor', parent=None, pose_fn=None, order_bias=0.0):
        self.name, self.C = name, np.asarray(C, np.float64)
        self.yaw, self.pitch, self.roll = yaw, pitch, roll
        self.w, self.h, self.tw, self.th = float(w), float(h), tw, th
        self.paper = paper
        self.layers = layers or []
        self.on, self.off = on, off
        self.role = role            # 'card' | 'ui' | 'decor' | 'shadow' | 'callout' | 'floor'
        self.parent = parent        # lens focus follows the parent (shadows, callouts)
        self.pose_fn = pose_fn      # n -> dict(dC=vec, scale=float, dyaw=deg) small animations (sticker pops)
        self.order_bias = order_bias

    def pose(self, n):
        C, yaw, pitch, roll, sc = self.C, self.yaw, self.pitch, self.roll, 1.0
        if self.pose_fn is not None:
            p = self.pose_fn(n)
            C = C + np.asarray(p.get('dC', (0, 0, 0)), np.float64)
            yaw += p.get('dyaw', 0.0)
            sc = p.get('scale', 1.0)
        R = rot_ypr(yaw, pitch, roll)
        return C, R, self.w * sc, self.h * sc

    def normal(self, n=0):
        return self.pose(n)[1][:, 2]

    def M(self, cam, n):
        C, R, w, h = self.pose(n)
        ex, ey = R[:, 0], R[:, 1]
        O = C - ex * w / 2 + ey * h / 2
        su, sv = w / self.tw, h / self.th
        return np.stack([cam.R @ (ex * su), cam.R @ (-ey * sv), cam.R @ (O - cam.pos)], axis=1)

    def depth(self, cam, n):
        C = self.pose(n)[0]
        return float(cam.to_cam(C)[2])


def screen_poly(plane, cam, n, rect=None):
    """Clipped screen polygon of the plane (or of a tex rect on it). Returns (poly_screen, Hm, clipped)."""
    M = plane.M(cam, n)
    Hm = cam.K @ M
    if rect is None:
        rect = (0, 0, plane.tw, plane.th)
    x0, y0, x1, y1 = rect
    poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    cp = clip_near(poly, M)
    if len(cp) < 3:
        return None, Hm, True
    return apply_h(Hm, cp), Hm, len(cp) != 4 or any(abs(a[0] - b[0]) + abs(a[1] - b[1]) > 1e-6 for a, b in zip(cp, poly))


def bbox_of(polys, pad):
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    bx0 = max(0, int(math.floor(min(xs))) - pad)
    by0 = max(0, int(math.floor(min(ys))) - pad)
    bx1 = min(W, int(math.ceil(max(xs))) + pad)
    by1 = min(H, int(math.ceil(max(ys))) + pad)
    if bx1 - bx0 < 1 or by1 - by0 < 1:
        return None
    return bx0, by0, bx1, by1


def render_plane(plane, cam, n, bbox, mis, state):
    """Plane -> premultiplied (rgb, alpha, protect) float32 buffers in bbox (no lens effects)."""
    bx0, by0, bx1, by1 = bbox
    oh, ow = by1 - by0, bx1 - bx0
    rgb = np.zeros((oh, ow, 3), np.float32)
    al = np.zeros((oh, ow), np.float32)
    prot = None
    poly, Hm, clipped = screen_poly(plane, cam, n)
    if poly is None:
        return None
    foot = None
    if plane.paper or plane.role == 'ui' or clipped:
        foot = poly_mask(poly, bbox)
    if plane.paper:
        rgb += PAPER * foot[..., None]
        al += foot
    for L in plane.layers:
        if not L.visible(n):
            continue
        a_mul = L.alpha_fn(n) if L.alpha_fn else 1.0
        if a_mul <= 0:
            continue
        if L.kind == 'ui':
            src, skey = L.src_fn(n)
            if src is None:
                continue
            out, _ = warp(skey, src, Hm, L.x0, L.y0, bbox, cv2.INTER_LANCZOS4, cv2.BORDER_REPLICATE)
            m = foot
            col = np.clip(out.astype(np.float32) * (1.0 / 255.0), 0, 1)
            rgb[:] = rgb * (1 - m[..., None]) + col * m[..., None]
            al[:] = al * (1 - m) + m
            prot = m if prot is None else np.maximum(prot, m)
            continue
        dx, dy = mis.get(L.ink, (0.0, 0.0)) if L.ink else (0.0, 0.0)
        Hs = T2(dx, dy) @ Hm
        if L.kind == 'rect':
            r = L.rect_fn(n) if L.rect_fn else (L.x0, L.y0, L.x0 + L.w, L.y0 + L.h)
            if r[2] - r[0] <= 0 or r[3] - r[1] <= 0:
                continue
            p2, _, _ = screen_poly(plane, cam, n, rect=r)
            if p2 is None:
                continue
            p2 = [(x + dx, y + dy) for x, y in p2]
            cov = poly_mask(p2, bbox)
            col = INKS[L.ink]
        elif L.kind == 'cov':
            arr = L.arr
            key = L.key
            if L.variants:
                vi = (state * 5 + (hash(L.key) & 7)) % len(L.variants)   # halftone shimmer (15 fps)
                arr = L.variants[vi]
                key = (L.key, vi)
            wf = getattr(L, 'wipe_fn', None)
            if wf is not None:
                f = wf(n)
                if f <= 0:
                    continue
                cols = max(1, int(round(arr.shape[1] * f)))
                arr = arr[:, :cols]
                key = (key, cols)
            out, _ = warp(key, arr, Hs, L.x0, L.y0, bbox, cv2.INTER_CUBIC)
            cov = np.clip(out.astype(np.float32) * (1.0 / 255.0), 0, 1)
            col = INKS[L.ink]
        elif L.kind == 'rgba':
            out, _ = warp(L.key, L.arr, Hm, L.x0, L.y0, bbox, cv2.INTER_LANCZOS4)
            o = np.clip(out.astype(np.float32) * (1.0 / 255.0), 0, 1)
            a = o[..., 3]
            if clipped:
                a = a * foot
            pm = o[..., :3] * (a_mul if a_mul < 1 else 1.0)      # texture is stored premultiplied
            if clipped:
                pm = pm * foot[..., None]
            a = a * a_mul
            rgb[:] = rgb * (1 - a[..., None]) + pm
            al[:] = al * (1 - a) + a
            if L.protect:
                prot = a if prot is None else np.maximum(prot, a)
            continue
        else:
            continue
        if clipped:
            cov = cov * foot
        if a_mul < 1:
            cov = cov * a_mul
        rgb[:] = rgb * (1 - cov[..., None]) + col * cov[..., None]
        al[:] = al * (1 - cov) + cov
        if prot is not None:
            prot *= (1 - cov)
    return rgb, al, prot


def lens_blur(buf, sigma):
    if sigma < 0.2:
        return buf
    return cv2.GaussianBlur(buf, (0, 0), sigma, borderType=cv2.BORDER_CONSTANT)


class FrameCtx:
    def __init__(self, n):
        self.n = n
        self.img = np.empty((H, W, 3), np.float32)
        self.img[:] = PAPER
        self.prot = np.zeros((H, W), np.float32)

    def over(self, bbox, rgb, al, prot):
        bx0, by0, bx1, by1 = bbox
        reg = self.img[by0:by1, bx0:bx1]
        reg *= (1 - al[..., None])
        reg += rgb
        p = self.prot[by0:by1, bx0:bx1]
        p *= (1 - al)
        if prot is not None:
            p += prot
        np.clip(p, 0, 1, out=p)

    def finish(self, grain=0.020, state=None):
        nz = bank()
        s = self.n // 2 if state is None else state
        g = nz.slice(nz.fine, s, 99)
        mod = (0.008 * nz.fibre + grain * 0.5 * g) * (1.0 - self.prot)
        self.img *= (1.0 + mod)[..., None]
        return (np.clip(self.img, 0, 1) * 255.0 + 0.5).astype(np.uint8)
