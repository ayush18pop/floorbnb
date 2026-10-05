#!/usr/bin/env python3
"""Floor v2 compositor: plan (scenes, camera path, focus schedule) -> world (planes) -> frames.

  python3 comp.py --plan master --frames 0-1799 --out render --workers 4
  python3 comp.py --plan master --standin --frames 0-99 --out /tmp/x     (stand-in inputs, never final)

A Plan is a list of Stations (card or UI panel).  Each station owns planes in a 3D paper diorama.  The camera path
is keyed per station: A_i (arrival, camera settled face-on at frame a_i), A'_i (end of the hold drift at frame d_i)
and moves A'_i -> A_{i+1} (smootherstep, arc).  Focus: group (station) schedule, see blur_radius().
"""
import argparse
import glob
import json
import math
import os
import sys
import time

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as E
from engine import (W, H, INKS, PAPER, Layer, Plane, Cam, rot_ypr, nrm, FrameCtx, render_plane, screen_poly,
                    bbox_of, misreg_offsets, halftone, shape_bleed, type_bleed)

cv2.setNumThreads(1)
FPS, BEAT = 30, 20
F_PX = 2000.0
A_LENS = 70.0            # thin lens aperture (world units)
R0 = 16.0                # rack focus start radius (px at 1080p)
CAP_HOLD, CAP_MOVE = 8.0, 16.0
PANEL_W, PANEL_H = 1440.0, 900.0        # UI plane world size (0.5 of the 2x capture = exact mip)
CARD_W, CARD_H = 1920.0, 1080.0
CARD_D, PANEL_D = 2180.0, 1900.0
MOTION_BLUR_MAX = 24.0
PAL_NAMES = ['paper', 'ink', 'cobalt', 'periwinkle', 'coral', 'mint']
INK_ARR = np.stack([E.INKS[k] for k in ['ink', 'cobalt', 'periwinkle', 'coral', 'mint']]) * 255.0
INK_NAMES = ['ink', 'cobalt', 'periwinkle', 'coral', 'mint']


def ss(x):
    x = min(1.0, max(0.0, x))
    return x * x * x * (x * (x * 6 - 15) + 10)


def cap_for_ink(n):
    return n


# ================================================================================================ inputs
class Inputs:
    def __init__(self, capture_root, typo_root):
        self.cap = capture_root
        self.typo_root = typo_root
        self.typo = json.load(open(os.path.join(typo_root, 'typo.json')))
        self.events = {}
        self._img = {}
        self._pil = {}
        self.standin = os.path.exists(os.path.join(typo_root, 'STANDIN'))

    def ev(self, shot):
        if shot not in self.events:
            self.events[shot] = json.load(open(os.path.join(self.cap, shot, 'events.json')))
        return self.events[shot]

    def frame(self, shot, k):
        key = (shot, k)
        v = self._img.get(key)
        if v is None:
            p = os.path.join(self.cap, shot, 'frames', f'f_{k:04d}.png')
            v = cv2.cvtColor(cv2.imread(p, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
            if len(self._img) > 6:
                self._img.pop(next(iter(self._img)))
            self._img[key] = v
        return v

    def nframes(self, shot):
        p = os.path.join(self.cap, shot, 'events.json')
        if os.path.exists(p):
            return self.ev(shot)['frames']
        return len(glob.glob(os.path.join(self.cap, shot, 'frames', 'f_*.png')))

    def png(self, rel):
        v = self._pil.get(rel)
        if v is None:
            v = cv2.imread(os.path.join(self.typo_root, rel), cv2.IMREAD_UNCHANGED)
            self._pil[rel] = v
        return v


def ink_split(rgba_bgra, bleed='type'):
    """RGBA(BGRA) flat-ink asset -> {ink: coverage uint8}.  Nearest palette ink per pixel (flat colours)."""
    a = rgba_bgra[..., 3]
    if a.max() == 0:
        return {}
    rgb = rgba_bgra[..., 2::-1].astype(np.float32)
    m = a > 8
    out = {}
    cols = rgb[m]
    d = ((cols[:, None, :] - INK_ARR[None]) ** 2).sum(-1)
    idx = np.argmin(d, axis=1)
    full = np.full(a.shape, -1, np.int8)
    full[m] = idx
    for i, nm in enumerate(INK_NAMES):
        sel = (full == i) | ((full >= 0) & (a < 255) & (full == i))
        if sel.any():
            c = np.where(full == i, a, 0).astype(np.uint8)
            out[nm] = c
    return out


def bleed_cov(c, kind, seed):
    if kind == 'shape':
        return shape_bleed(c, seed)
    return type_bleed(c, 1.0)


# ================================================================================================ idle trimming
def idle_map(inp, shot):
    p = os.path.join(HERE, 'build', 'idle.json')
    cache = json.load(open(p)) if os.path.exists(p) else {}
    n = inp.nframes(shot)
    key = f'{shot}:{n}'
    if key not in cache:
        prev, idle = None, []
        for k in range(n):
            im = cv2.imread(os.path.join(inp.cap, shot, 'frames', f'f_{k:04d}.png'), cv2.IMREAD_REDUCED_GRAYSCALE_4)
            im = im.astype(np.int16)
            idle.append(bool(prev is not None and float(np.abs(im - prev).mean()) < 0.004))
            prev = im
        cache[key] = idle
        os.makedirs(os.path.dirname(p), exist_ok=True)
        json.dump(cache, open(p, 'w'))
    return cache[key]


def seq_frames(inp, parts, drop=0, keep_run=10):
    """parts [(shot,k0,k1)] -> explicit frame list; drops `drop` frames from the tails of long idle (identical) runs."""
    fr = []
    runs = []
    for shot, k0, k1 in parts:
        idle = idle_map(inp, shot)
        i = k0
        while i < k1:
            if idle[i]:
                j = i
                while j < k1 and idle[j]:
                    j += 1
                runs.append([shot, i, j])
                i = j
            else:
                i += 1
    dropped = set()
    budget = drop
    while budget > 0:
        runs.sort(key=lambda r: -(r[2] - r[1]))
        if not runs or runs[0][2] - runs[0][1] <= keep_run:
            break
        r = runs[0]
        dropped.add((r[0], r[2] - 1))
        r[2] -= 1
        budget -= 1
    for shot, k0, k1 in parts:
        fr += [(shot, k) for k in range(k0, k1) if (shot, k) not in dropped]
    return fr, drop - budget


# ================================================================================================ plan
class Station:
    def __init__(self, sid, kind, **kw):
        self.id, self.kind = sid, kind
        self.yaw = kw.get('yaw', 0.0)
        self.pitch = kw.get('pitch', 0.0)
        self.D0 = kw.get('D0', CARD_D if kind == 'card' else PANEL_D)
        self.D1 = kw.get('D1', self.D0)
        self.dyaw = kw.get('dyaw', 2.0)
        self.dpitch = kw.get('dpitch', 0.0)
        self.off0 = np.array(kw.get('off0', (0, 0)), float)     # target offset in plane-local px (x right, y up)
        self.off1 = np.array(kw.get('off1', (0, 0)), float)
        self.a = kw['a']          # arrival frame (camera settled)
        self.d = kw['d']          # departure frame (move out starts)
        self.L = kw.get('L', self.a + 14)
        self.T_in = kw.get('T_in', 26)
        self.shadow = kw.get('shadow', 'cobalt')
        self.shot_seq = kw.get('shot_seq')     # UI: [(shot, k0, k1)] concatenated
        self.p0 = kw.get('p0')                 # video frame where shot_seq[0] starts
        self.frames = kw.get('frames') or [(sh, k) for sh, k0, k1 in (self.shot_seq or []) for k in range(k0, k1)]
        self.follow = kw.get('follow', [])     # [(shot, k_in0, k_in1, k_out0, k_out1, Df)]
        self.dx = kw.get('dx', 2300.0)
        self.dy = kw.get('dy', 0.0)
        self.card = kw.get('card')             # typo card dict (cards)
        self.scene = kw.get('scene', sid)
        self.name = sid
        self.C = None
        self.truck = kw.get('truck', False)    # same-scene lateral move from previous panel
        self.m0 = None                         # move-in start (= previous d)


def smoothstep_arr(x):
    return ss(x)


class Plan:
    def __init__(self, name, stations, frames, callouts, captions, typo_over=None):
        self.name = name
        self.st = stations
        self.frames = frames
        self.callouts = callouts      # list of dict(id, station, n_in, n_out) in plan frames
        self.captions = captions      # list of dict(id, n_in, n_out)
        self.typo_over = typo_over or {}
        self.layout()
        self.build_segments()

    # ---- world layout
    def layout(self):
        C = np.zeros(3)
        prev = None
        for i, s in enumerate(self.st):
            if i == 0:
                s.C = C.copy()
            elif s.truck:
                s.C = prev.C + np.array([PANEL_W + 330.0, 0, 0]) if False else prev.C + np.array([1780.0, 0, 0])
            else:
                sg = 1.0 if prev.yaw >= 0 else -1.0
                s.C = prev.C + np.array([sg * abs(prev.dx), prev.dy, -2850.0])
            s.m0 = self.st[i - 1].d if i else None
            prev = s

    def pos_target(self, s, drift):
        yaw = s.yaw + (s.dyaw if drift else 0)
        pitch = s.pitch + (s.dpitch if drift else 0)
        R = rot_ypr(yaw, pitch, 0)
        D = s.D1 if drift else s.D0
        off = s.off1 if drift else s.off0
        Rb = rot_ypr(s.yaw, s.pitch, 0)
        tgt = s.C + Rb[:, 0] * off[0] + Rb[:, 1] * off[1]
        pos = tgt + R[:, 2] * D
        return pos, tgt

    def build_segments(self):
        keys = []   # (n, pos, tgt)
        self.seg = []
        prev_key = None
        for i, s in enumerate(self.st):
            pA, tA = self.pos_target(s, False)
            pB, tB = self.pos_target(s, True)
            if prev_key is not None:
                arc = self.arc_for(prev_key, (s.a, pA, tA), self.st[i - 1], s)
                self.seg.append(dict(n0=prev_key[0], n1=s.a, p0=prev_key[1], t0=prev_key[2], p1=pA, t1=tA, arc=arc,
                                     kind='truck' if s.truck else ('dolly' if not self.is_orbit(prev_key[1], pA, tA)
                                                                     else 'dolly+orbit'), to=s.id))
            else:
                if s.a > 0:
                    self.seg.append(dict(n0=0, n1=s.a, p0=pA, t0=tA, p1=pA, t1=tA, arc=np.zeros(3), kind='hold', to=s.id))
            self.seg.append(dict(n0=s.a, n1=s.d, p0=pA, t0=tA, p1=pB, t1=tB, arc=np.zeros(3), kind='hold-drift', to=s.id))
            prev_key = (s.d, pB, tB)

    def is_orbit(self, p0, p1, t1):
        return True

    def arc_for(self, k0, k1, sa, sb):
        n0, p0, t0 = k0
        n1, p1, t1 = k1
        dv = p1 - p0
        d = nrm([dv[0], 0, dv[2]])
        perp = np.array([d[2], 0, -d[0]])
        best, bs = None, 0
        # choose the sign that keeps the camera outside the previous plane (distance in plane-local x)
        for sgn in (1.0, -1.0):
            worst = 1e9
            for u in np.linspace(0.05, 0.95, 19):
                s_ = ss(u)
                pos = p0 + dv * s_ + perp * sgn * 520.0 * math.sin(math.pi * s_)
                R = rot_ypr(sa.yaw, sa.pitch, 0)
                loc = R.T @ (pos - sa.C)
                if abs(loc[2]) < 700:
                    worst = min(worst, max(abs(loc[0]) - PANEL_W / 2, abs(loc[1]) - 500))
            if best is None or worst > best:
                best, bs = worst, sgn
        amp = 520.0 if not sb.truck else 120.0
        return perp * bs * amp

    def cam_base(self, n):
        n = float(n)
        seg = self.seg
        sgm = seg[-1]
        for sg in seg:
            if n < sg['n1']:
                sgm = sg
                break
        n0, n1 = sgm['n0'], sgm['n1']
        u = 0.0 if n1 <= n0 else ss((n - n0) / (n1 - n0))
        if n >= seg[-1]['n1']:
            u = 1.0
        pos = sgm['p0'] + (sgm['p1'] - sgm['p0']) * u + sgm['arc'] * math.sin(math.pi * u)
        tgt = sgm['t0'] + (sgm['t1'] - sgm['t0']) * u + sgm['arc'] * 0.0
        return pos, tgt

    def station_at(self, n):
        cur = self.st[0]
        for s in self.st:
            if n >= s.a - 4:
                cur = s
        return cur


# ================================================================================================ world
class World:
    def __init__(self, plan, inp, final=True):
        self.plan, self.inp = plan, inp
        self.planes = []
        self.groups = {}
        self.rng = np.random.default_rng(7)
        for s in plan.st:
            self.add_station(s)
        self.add_decor()
        self.cam_cache = {}

    # ---- helpers
    def rect_plane(self, name, C, yaw, pitch, w, h, ink, group, bias, role='decor', on=-10 ** 9, off=10 ** 9):
        p = Plane(name, C, yaw, pitch, 0.0, w, h, 100, 100, paper=False, role=role, on=on, off=off, order_bias=bias)
        p.layers = [Layer('rect', ink=ink, x0=0, y0=0, w=100, h=100)]
        p.group = group
        return p

    def add_station(self, s):
        g = s.id
        self.groups[g] = s
        C = s.C
        R = rot_ypr(s.yaw, s.pitch, 0)
        ex, ey, ez = R[:, 0], R[:, 1], R[:, 2]
        if s.kind == 'card':
            w, h = CARD_W, CARD_H
            self.planes.append(self.rect_plane(g + '_shadow', C + ex * 16 - ey * 16 - ez * 10, s.yaw, s.pitch, w, h,
                                               s.shadow, g, 30, 'shadow'))
            self.planes.append(self.rect_plane(g + '_key', C - ez * 4, s.yaw, s.pitch, w + 6, h + 6, 'ink', g, 15,
                                               'shadow'))
            self.planes.append(self.card_plane(s, C, ex, ey))
        else:
            w, h = PANEL_W, PANEL_H
            self.planes.append(self.rect_plane(g + '_shadow', C + ex * 18 - ey * 18 - ez * 10, s.yaw, s.pitch, w, h,
                                               s.shadow, g, 30, 'shadow'))
            self.planes.append(self.rect_plane(g + '_key', C - ez * 4, s.yaw, s.pitch, w + 6, h + 6, 'ink', g, 15,
                                               'shadow'))
            self.planes.append(self.ui_plane(s))
        for co in self.plan.callouts:
            if co['station'] == g:
                self.planes.append(self.callout_plane(s, co))

    def card_plane(self, s, C, ex, ey):
        card = s.card
        p = Plane(s.id + '_card', C, s.yaw, s.pitch, 0.0, CARD_W, CARD_H, 3840, 2160, paper=True, role='card')
        p.group = s.id
        ov = self.plan.typo_over
        inp = self.inp
        layers = []
        sc = 2
        for sh in card.get('shapes', []):
            o = ov.get(sh['id'], {})
            if o.get('skip'):
                continue
            arr = inp.png(sh['file'])
            if arr is None:
                continue
            bb = sh['bbox']
            seed = abs(hash(sh['id'])) % 99991
            for ink, cov in ink_split(arr).items():
                cov = bleed_cov(cov, 'shape', seed)
                L = Layer('cov', ink=ink, arr=cov, x0=bb[0] * sc, y0=bb[1] * sc, key=('shape', sh['id'], ink))
                if 'wipe' in o:
                    n0, n1 = o['wipe']
                    L.wipe_fn = (lambda n, n0=n0, n1=n1: ss((n - n0) / max(1, n1 - n0)))
                    L.on = n0
                layers.append(L)
        for a in card['assets']:
            o = ov.get(a['id'], {})
            if o.get('skip'):
                continue
            if 'cut15' in a['id'] and self.plan.name != 'cut15':
                continue
            if self.plan.name == 'cut15' and a['id'] + '_cut15' in [b['id'] for b in card['assets']]:
                continue
            arr = inp.png(a['file'])
            if arr is None:
                continue
            bb = a['bbox']
            n_in = o.get('in', a['in'])
            seed = abs(hash(a['id'])) % 99991
            for ink, cov in ink_split(arr).items():
                cov = bleed_cov(cov, 'type', seed)
                L = Layer('cov', ink=ink, arr=cov, x0=bb[0] * sc, y0=bb[1] * sc, key=('type', a['id'], ink), on=n_in)
                if 'text' in o:
                    pass
                layers.append(L)
        lk = card.get('lockup')
        if lk and not ov.get('S0_lockup', {}).get('skip') and not (s.id == 'S0' and ov.get('no_lockup')):
            lay = self.lockup_layer(lk, ov.get('lockup_in', lk.get('stamp_frame', 0)))
            if lay is not None:
                layers.append(lay)
        p.layers = layers
        return p

    def lockup_layer(self, lk, n_in):
        man = json.load(open(os.path.join(HERE, 'build/lockup/manifest.json')))
        best = max(man['sizes'].items(), key=lambda kv: int(kv[0]))
        rel = os.path.join(HERE, 'build/lockup', best[1]['alpha'])
        im = cv2.imread(rel, cv2.IMREAD_UNCHANGED)       # BGRA straight alpha
        tw = int(round(lk['w'] * 2))
        th = int(round(im.shape[0] * tw / im.shape[1]))
        a = im[..., 3:4].astype(np.float32) / 255.0
        pm = np.concatenate([im[..., :3].astype(np.float32) * a, im[..., 3:4].astype(np.float32)], -1)
        pm = cv2.resize(pm, (tw, th), interpolation=cv2.INTER_AREA)
        out = np.zeros_like(pm)
        out[..., :3] = pm[..., 2::-1]
        out[..., 3] = pm[..., 3]
        out = np.clip(out, 0, 255).astype(np.uint8)
        L = Layer('rgba', arr=out, x0=lk['x'] * 2, y0=lk['y'] * 2, key=('lockup', n_in, tw), protect=True, on=n_in)
        return L

    def ui_plane(self, s):
        p = Plane(s.id + '_ui', s.C, s.yaw, s.pitch, 0.0, PANEL_W, PANEL_H, 2880, 1800, paper=False, role='ui')
        p.group = s.id
        seq = s.shot_seq
        inp = self.inp
        s_ = s

        def src(n, s_=s_):
            shot, k = frame_for(s_, n)
            return inp.frame(shot, k), ('ui', shot, k)
        p.layers = [Layer('ui', src_fn=src, x0=0, y0=0, w=2880, h=1800)]
        return p

    def callout_plane(self, s, co):
        """Sticker: arrow tip lands on a target point (panel CSS px); sticker body sits on free paper (left margin or a
        blank part of the panel).  Screen-size capped in plane_pose_apply (body width <= BODY_CAP px)."""
        inp = self.inp
        c = next(x for x in inp.typo['callouts'] if x['id'] == co['id'])
        cw, ch = c['canvas_2x']
        wl, hl = c['canvas_px']
        PAD = 140                                   # 1x px of padding for the arrow
        lay = co['layout']                          # dict(dir, tip=('region', shot, name, dx, dy) | ('css', x, y), frac)
        dr = lay['dir']
        cr = np.array(c['sticker']['corners'], float)
        x0b, y0b = cr.min(0)
        x1b, y1b = cr.max(0)
        frac = lay.get('frac', 0.5)
        if dr == 'right':
            att = (x1b, (y0b + y1b) / 2)
        elif dr == 'left':
            att = (x0b, (y0b + y1b) / 2)
        elif dr == 'up':
            att = (x0b + frac * (x1b - x0b), y0b)
        else:
            att = (x0b + frac * (x1b - x0b), y1b)
        L = 108.0
        tipc = {'right': (att[0] + L, att[1]), 'left': (att[0] - L, att[1]), 'up': (att[0], att[1] - L),
                'down': (att[0], att[1] + L)}[dr]                    # canvas 1x
        base = inp.png(next(x for x in inp.typo['callouts'] if x['id'] == 'A1_basket')['arrow']['file'])
        a_r = base[..., 3] if base.ndim == 3 else base                # 'right' arrow, 2x, tail (16,52) tip (232,52)
        if dr == 'right':
            ar, tail = a_r, (16, 52)
        elif dr == 'left':
            ar, tail = a_r[:, ::-1].copy(), (248 - 16, 52)
        elif dr == 'up':
            ar, tail = np.rot90(a_r, 1).copy(), (52, 248 - 16)
        else:
            ar, tail = np.rot90(a_r, -1).copy(), (52, 16)
        p = Plane(co['id'], (0, 0, 0), s.yaw, s.pitch, 0.0, wl + 2 * PAD, hl + 2 * PAD, cw + 4 * PAD, ch + 4 * PAD,
                  paper=False, role='callout')
        p.group = s.id
        p.order_bias = -60
        n_in, n_out = co['n_in'], co['n_out']
        off2 = 2 * PAD
        cols = [('shadow', c['sticker']['shadow_color'], n_in), ('sticker', c['sticker']['color'], n_in + 2),
                ('text', 'ink', n_in + 2)]
        layers = []
        for key, ink, on in cols:
            arr = inp.png(c['files'][key])
            cov = arr[..., 3] if arr.ndim == 3 else arr
            layers.append(Layer('cov', ink=ink, arr=type_bleed(cov, 1.0) if key == 'text' else cov, x0=off2, y0=off2,
                                key=('co', co['id'], key), on=on, off=n_out))
        layers.append(Layer('cov', ink='ink', arr=ar, x0=att[0] * 2 - tail[0] + off2, y0=att[1] * 2 - tail[1] + off2,
                            key=('co', co['id'], 'arrow', dr), on=n_in + 20, off=n_out))
        p.layers = layers
        p.on, p.off = n_in, n_out
        sc = PANEL_W / 1440.0
        ex, ey, ez = (rot_ypr(s.yaw, s.pitch, 0)[:, i_] for i_ in range(3))
        tip_t = lay['tip']
        body_w = float(x1b - x0b)
        shot_ = tip_t[1] if tip_t[0] == 'region' else None

        def tip_css(n):
            if tip_t[0] == 'css':
                return tip_t[1], tip_t[2]
            _, shot, name, dx, dy = tip_t
            evd = inp.ev(shot)
            regs = evd['regions']
            sh, k = frame_for(s, n)
            if sh != shot:
                k = 0 if n < vf_of(s, shot, 0) else evd['frames'] - 1
            key = name
            if key == 'slider_thumb_by_frame' and 'slider_thumb_smooth_by_frame' in regs:
                key = 'slider_thumb_smooth_by_frame'
            v = regs.get(key)
            if isinstance(v, list):
                v = v[min(len(v) - 1, max(0, k))]
            return v['x'] + dx, v['y'] + v['h'] / 2 + dy

        def pose(n):
            px, py = tip_css(n)
            tipw = s.C + ex * ((px - 720.0) * sc) + ey * ((450.0 - py) * sc) + ez * 90.0
            cx = (wl / 2 - tipc[0])
            cy = -(hl / 2 - tipc[1])
            cen = tipw + ex * cx + ey * cy
            age = n - n_in
            pop = 0.85 + 0.15 * ss(age / 6.0)
            return dict(abs=cen, tip=tipw, scale=pop, body_w=body_w, dir=dr)
        p.pose_abs = pose
        p.stC = s.C
        p.pose_fn = None
        return p

    def hold_cams(self):
        plan = self.plan
        out = []
        for s in plan.st:
            for drift in (False, True):
                p, t = plan.pos_target(s, drift)
                out.append((Cam(p, t, F_PX, 0.0), s))
        return out

    def decor_ok(self, pl):
        if not self._decor_ok_holds(pl):
            return False
        # never in front of / overlapping a station's subject during its sampled hold (incl. follow pushes)
        if not hasattr(self, '_rig'):
            self._rig = Rig(self.plan, self)
            self._samples = []
            for s in self.plan.st:
                for n in range(int(s.a), int(s.d) + 1, 4):
                    self._samples.append((n, s))
        R = pl.pose(0)[1]
        for n, s in self._samples:
            cam = self._rig.cam(n)
            zs = float(cam.to_cam(s.C)[2])
            pts = []
            front = False
            behind = False
            for sx in (-1, 1):
                for sy in (-1, 1):
                    X = pl.C + R[:, 0] * sx * pl.w / 2 + R[:, 1] * sy * pl.h / 2
                    x, y, z = cam.project(X)
                    if z < E.NEAR:
                        behind = True
                    pts.append((x, y))
                    if z < zs - 40:
                        front = True
            if behind or not front:
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            ww, hh = (CARD_W, CARD_H) if s.kind == 'card' else (PANEL_W, PANEL_H)
            cs = [cam.project(s.C + rot_ypr(s.yaw, s.pitch, 0) @ np.array([sx * ww / 2, sy * hh / 2, 0]))
                  for sx in (-1, 1) for sy in (-1, 1)]
            px = [c[0] for c in cs]
            py = [c[1] for c in cs]
            m = 10
            if not (max(xs) < min(px) - m or min(xs) > max(px) + m or max(ys) < min(py) - m or min(ys) > max(py) + m):
                return False
        return True

    def _decor_ok_holds(self, pl):
        for cam, s in self.hold_cams():
            R = pl.pose(0)[1]
            C = pl.C
            pts = []
            behind = False
            for sx in (-1, 1):
                for sy in (-1, 1):
                    X = C + R[:, 0] * sx * pl.w / 2 + R[:, 1] * sy * pl.h / 2
                    x, y, z = cam.project(X)
                    if z < E.NEAR:
                        behind = True
                    pts.append((x, y))
            if behind:
                continue
            zc = cam.to_cam(C)[2]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            ov = not (max(xs) < 120 or min(xs) > 1800 or max(ys) < 40 or min(ys) > 1040)
            if ov and zc < s_depth(cam, s) + 150:
                return False
        return True

    def add_decor(self):
        st = self.plan.st
        rng = self.rng
        cols = ['periwinkle', 'mint', 'coral', 'cobalt']
        for i in range(len(st) - 1):
            a, b = st[i], st[i + 1]
            made, tries = 0, 0
            while made < 4 and tries < 80:
                tries += 1
                u = rng.uniform(0.05, 0.95)
                pa, _ = self.plan.pos_target(a, True)
                pb, _ = self.plan.pos_target(b, False)
                base = pa + (pb - pa) * u
                side = rng.choice([-1.0, 1.0])
                C = base + np.array([side * rng.uniform(1100, 2400), rng.uniform(-550, 650), -rng.uniform(200, 2200)])
                w = rng.uniform(240, 700)
                h = w * rng.uniform(0.35, 1.0)
                ink = cols[int(rng.integers(0, 4))]
                yaw = rng.uniform(-26, 26)
                pitch = rng.uniform(-6, 6)
                j = made
                if rng.random() < 0.45:
                    hi = 'periwinkle' if ink in ('periwinkle', 'cobalt') else ink
                    pl = Plane(f'decor{i}_{j}', C, yaw, pitch, 0.0, w, h, int(w), int(h), paper=False, role='decor')
                    ax = 'x' if rng.random() < 0.5 else 'y'
                    vars_ = [halftone(int(w), int(h), 0.22, 0.82, ax, 16.0, hi, phase=(ph * 3.0, ph * 2.0))
                             for ph in range(3)]
                    pl.layers = [Layer('cov', ink=hi, arr=vars_[0], variants=vars_, x0=0, y0=0, key=('decor', i, j))]
                else:
                    pl = self.rect_plane(f'decor{i}_{j}', C, yaw, pitch, w, h, ink, None, 0, 'decor')
                pl.group = None
                if not self.decor_ok(pl):
                    continue
                self.planes.append(pl)
                made += 1


def s_depth(cam, s):
    return float(cam.to_cam(s.C)[2])


def frame_for(s, n):
    """UI plane: video frame n -> (shot, k)."""
    i = int(min(len(s.frames) - 1, max(0, n - s.p0)))
    return s.frames[i]


def vf_of(s, shot, k):
    """first video frame at which the station shows capture frame (shot, >= k)."""
    for i, (sh, kk) in enumerate(s.frames):
        if sh == shot and kk >= k:
            return s.p0 + i
    return s.p0 + len(s.frames)


def k_float(s, shot, n):
    """continuous capture index of `shot` at (fractional) video frame n, or None if another shot is on screen."""
    x = n - s.p0
    x = min(len(s.frames) - 1.0, max(0.0, x))
    i0 = int(math.floor(x))
    i1 = min(len(s.frames) - 1, i0 + 1)
    a, b = s.frames[i0], s.frames[i1]
    if a[0] != shot:
        return None
    if b[0] != shot:
        return float(a[1])
    return a[1] + (b[1] - a[1]) * (x - i0)


# ================================================================================================ camera + focus
class Rig:
    """Camera per (fractional) frame, including follow overlays on UI stations."""

    def __init__(self, plan, world):
        self.plan, self.world = plan, world
        self.f = F_PX

    def region(self, shot, name, k):
        evd = self.world.inp.ev(shot)
        r = evd['regions']
        key = name
        if name == 'slider_thumb_by_frame' and 'slider_thumb_smooth_by_frame' in r:
            key = 'slider_thumb_smooth_by_frame'
        v = r.get(key)
        if v is None:
            v = r.get(name)
        if isinstance(v, list):
            return v[min(len(v) - 1, max(0, int(round(k))))]
        return v

    def cam(self, n):
        plan = self.plan
        pos, tgt = plan.cam_base(n)
        s = plan.station_at(n)
        if s.kind == 'panel' and s.follow:
            Rb = rot_ypr(s.yaw, s.pitch, 0)
            sc = PANEL_W / 1440.0
            for (shot, ki0, ki1, ko0, ko1, Df) in s.follow:
                kk = k_float(s, shot, n)
                if kk is None:
                    continue
                w = ss((kk - ki0) / max(1.0, ki1 - ki0)) * (1 - ss((kk - ko0) / max(1.0, ko1 - ko0)))
                if w <= 0:
                    continue
                r = self.region(shot, 'slider_thumb_by_frame', kk)
                if not r:
                    continue
                lx = (r['x'] + r['w'] / 2 - 720.0) * sc * 0.62
                ly = (450.0 - (r['y'] + r['h'] / 2)) * sc * 0.62
                t2 = s.C + Rb[:, 0] * lx + Rb[:, 1] * ly
                p2 = t2 + Rb[:, 2] * Df
                pos = pos + (p2 - pos) * w
                tgt = tgt + (t2 - tgt) * w
        return Cam(pos, tgt, self.f, 0.0)


def thin_radius(zp, zf, cap):
    if zp < 80 or zf < 80:
        return cap
    r = A_LENS * F_PX * abs(1.0 / zf - 1.0 / zp)
    return min(cap, r)


def move_activity(plan, n):
    """1 while the camera is flying between stations (6 frame ramps), else 0."""
    a = 0.0
    for sg in plan.seg:
        if sg['kind'] in ('hold-drift', 'hold'):
            continue
        n0, n1 = sg['n0'], sg['n1']
        a = max(a, ss((n - (n0 - 6)) / 8.0) * (1 - ss((n - (n1 + 6)) / 8.0)) if n0 - 6 <= n <= n1 + 14 else 0.0)
    return a


def group_radius(s, n, prev_d):
    """Explicit subject schedule: approach, rack focus, exact sharp hold, leave."""
    a, L, d = s.a, s.L, s.d
    if n < L:
        if prev_d is not None and n < prev_d:
            return None                                  # not yet in flight: neighbour rule
        if n < a - 4:
            m0 = prev_d if prev_d is not None else a - 14
            return 8.0 + (R0 - 8.0) * ss((n - m0) / 10.0)
        return R0 * (1.0 - ss((n - (a - 4)) / float(L - (a - 4))))
    if n <= d:
        return 0.0
    return 14.0 * ss((n - d) / 22.0) if n < d + 40 else 14.0


def blur_radius(world, plan, p, n, cam):
    g = getattr(p, 'group', None)
    act = move_activity(plan, n)
    cap = CAP_HOLD + (CAP_MOVE - CAP_HOLD) * act
    cur = plan.station_at(n)
    C = p.pose(n)[0]
    zp = float(cam.to_cam(C)[2])
    zf = float(cam.to_cam(cur.C)[2])
    if g is None:
        return thin_radius(zp, max(zf, 900.0), cap)
    s = world.groups[g]
    i = plan.st.index(s)
    prev_d = plan.st[i - 1].d if i else None
    r = group_radius(s, n, prev_d)
    if r is None:
        return thin_radius(zp, max(zf, 900.0), cap)
    return r


# ================================================================================================ render
def mis_state(n):
    return n // 2


BODY_CAP = 440.0         # max sticker body width on screen (px at 1920)


def plane_pose_apply(p, n, cam=None):
    if getattr(p, 'pose_abs', None) is not None:
        d = p.pose_abs(n)
        z = float(cam.to_cam(p.stC)[2]) if cam is not None else PANEL_D
        px_per_unit = F_PX / max(z, 200.0)
        fit = min(1.0, BODY_CAP / (d['body_w'] * px_per_unit))
        tot = d['scale'] * fit
        if cam is not None and d.get('dir') == 'right':       # never clip at the left frame edge (40 px margin)
            tx = cam.project(np.asarray(d['tip'], float))[0]
            room = (tx - 40.0) / ((d['body_w'] + 108.0) * px_per_unit)
            tot = min(tot, max(0.3, room))
        tip, cen = np.asarray(d['tip'], float), np.asarray(d['abs'], float)
        p.C = tip + (cen - tip) * tot
        p.pose_fn = (lambda m, sc=tot: dict(scale=sc))
    return p


def mb_samples(plan, rig, p, n, sharp_lock):
    if sharp_lock:
        return [n]
    c0, c1 = rig.cam(n - 0.25), rig.cam(n + 0.25)
    C = p.pose(n)[0]
    w, h = p.w, p.h
    R = p.pose(n)[1]
    corners = [C + R[:, 0] * sx * w / 2 + R[:, 1] * sy * h / 2 for sx in (-1, 1) for sy in (-1, 1)] + [C]
    disp = 0.0
    for X in corners:
        a, b = c0.project(X), c1.project(X)
        if a[2] > 60 and b[2] > 60:
            disp = max(disp, math.hypot(a[0] - b[0], a[1] - b[1]))
    if disp < 1.4:
        return [n]
    shut = 0.5 if disp <= MOTION_BLUR_MAX else 0.5 * MOTION_BLUR_MAX / disp
    S = int(min(6, max(4, math.ceil(min(disp, MOTION_BLUR_MAX) / 5.0))))
    return [n + (j / (S - 1) - 0.5) * shut for j in range(S)]


def render_frame(world, plan, rig, n, use_blur=True, stats=None):
    cam = rig.cam(n)
    fc = FrameCtx(n)
    state = mis_state(n)
    kick = 0.0
    for s in plan.st:
        if s.card is not None and s.id in ('S0',):
            kick = max(kick, 1.5 * math.exp(-(n - 20) / 9.0) if n >= 20 else 0.0)
    mis = misreg_offsets(state, 1.6, kick)
    vis = []
    for p in world.planes:
        if not (p.on <= n < p.off):
            continue
        plane_pose_apply(p, n, cam)
        z = p.depth(cam, n)
        if z < E.NEAR * 2:
            continue
        vis.append((z + p.order_bias, p))
    vis.sort(key=lambda t: -t[0])
    for _, p in vis:
        r = blur_radius(world, plan, p, n, cam) if use_blur else 0.0
        g = getattr(p, 'group', None)
        sharp_lock = False
        if g is not None:
            s = world.groups[g]
            sharp_lock = s.L <= n <= s.d
        subs = mb_samples(plan, rig, p, n, sharp_lock) if use_blur else [n]
        sigma = r * 0.5
        pad = int(math.ceil(3 * sigma)) + 3
        polys = []
        cams = []
        for t in subs:
            cm = cam if t == n else rig.cam(t)
            poly, _, _ = screen_poly(p, cm, int(n), None)
            if poly is None:
                continue
            polys.append(poly)
            cams.append(cm)
        if not polys:
            continue
        if len(polys) > 1 or True:
            bb = bbox_of(polys, pad)
        if bb is None:
            continue
        acc_rgb = None
        for cm in cams:
            out = render_plane(p, cm, int(n), bb, mis, state)
            if out is None:
                continue
            rgb, al, prot = out
            if acc_rgb is None:
                acc_rgb, acc_al = rgb.copy(), al.copy()
                acc_pr = prot.copy() if prot is not None else None
            else:
                acc_rgb += rgb
                acc_al += al
                if prot is not None:
                    acc_pr = prot.copy() if acc_pr is None else acc_pr + prot
        if acc_rgb is None:
            continue
        k = float(len(cams))
        if k > 1:
            acc_rgb /= k
            acc_al /= k
            if acc_pr is not None:
                acc_pr /= k
        if sigma >= 0.25:
            buf = np.dstack([acc_rgb, acc_al, acc_pr if acc_pr is not None else np.zeros_like(acc_al)])
            buf = cv2.GaussianBlur(buf, (0, 0), sigma, borderType=cv2.BORDER_CONSTANT)
            acc_rgb, acc_al = buf[..., :3], buf[..., 3]
            acc_pr = buf[..., 4] if acc_pr is not None else None
        fc.over(bb, acc_rgb, acc_al, acc_pr)
        if stats is not None:
            stats['planes'] = stats.get('planes', 0) + 1
    img = fc.finish()
    img = overlay_captions(world, plan, img, n)
    img = end_fade(plan, img, n)
    return img


_CAP_CACHE = {}


def overlay_captions(world, plan, img, n):
    for c in plan.captions:
        if c['n_in'] <= n < c['n_out']:
            cap = next(x for x in world.inp.typo['captions'] if x['id'] == c['id'])
            key = cap['files']['merged']
            arr = _CAP_CACHE.get(key)
            if arr is None:
                arr = world.inp.png(key)
                _CAP_CACHE[key] = arr
            h2, w2 = arr.shape[:2]
            # 2x asset -> 1x screen px, INTER_AREA
            w1, h1 = w2 // 2, h2 // 2
            small = cv2.resize(arr, (w1, h1), interpolation=cv2.INTER_AREA)
            x0, y0 = 96, 1024
            a = small[..., 3:4].astype(np.float32) / 255.0
            rgb = small[..., 2::-1].astype(np.float32)
            reg = img[y0:y0 + h1, x0:x0 + w1].astype(np.float32)
            img[y0:y0 + h1, x0:x0 + w1] = np.clip(reg * (1 - a) + rgb * a + 0.5, 0, 255).astype(np.uint8)
    return img


def end_fade(plan, img, n):
    last = plan.frames - 1
    if n > last - 6:
        t = (n - (last - 6)) / 6.0
        pap = (PAPER * 255).astype(np.float32)
        img = np.clip(img.astype(np.float32) * (1 - t) + pap * t + 0.5, 0, 255).astype(np.uint8)
    return img


# ================================================================================================ plans
def card_of(inp, scene):
    return next(c for c in inp.typo['cards'] if c['scene'] == scene)


LAYOUT = {
    'T1_drag': dict(dir='right', tip=('region', 'T1_try', 'slider_thumb_by_frame', -8, 0)),
    'T1_tradeoff': dict(dir='right', tip=('css', 158, 255)),
    'T1_crash': dict(dir='right', tip=('css', 160, 478)),
    'A1_basket': dict(dir='right', tip=('css', 185, 183)),
    'A1_floor': dict(dir='right', tip=('css', 185, 398)),
    'A1_term': dict(dir='right', tip=('css', 185, 544)),
    'A1_review': dict(dir='up', frac=0.8, tip=('css', 1146, 548)),
    'A2_tiles': dict(dir='right', tip=('css', 160, 268)),
    'A2_keeper': dict(dir='right', tip=('css', 160, 560)),
    'G1_mcp': dict(dir='right', tip=('css', 177, 400)),
}
# one sticker at a time, each >= 40 frames: (in, out) master frames; out = successor's in
WINDOWS = {'T1_drag': (505, 570), 'T1_tradeoff': (570, 615), 'T1_crash': (615, 700),
           'A1_basket': (828, 868), 'A1_floor': (868, 908), 'A1_term': (908, 948), 'A1_review': (952, 1084),
           'A2_tiles': (1225, 1275), 'A2_keeper': (1275, 1324), 'G1_mcp': (1465, 1544)}


def ui_callouts(inp, plan_stations, rules):
    """rules: id -> (station id, shot, k_in, k_out) in capture frames; returns callout dicts in video frames."""
    out = []
    st = {s.id: s for s in plan_stations}
    for cid, (sid, shot, ki, ko) in rules.items():
        s = st[sid]
        c = next(x for x in inp.typo['callouts'] if x['id'] == cid)
        n_in, n_out = WINDOWS[cid]
        out.append(dict(id=cid, station=sid, n_in=n_in, n_out=n_out, shot=shot, k_in=ki, layout=LAYOUT[cid]))
    return out


def plan_master(inp):
    T_IN, T_OUT = 30, 30
    n_k = inp.nframes
    S = []

    def card(sc, start, end, a=None, L=None, d=None, **kw):
        # default: camera settles 14 frames before the slot start (blank card, focus locks on the beat the type cuts in),
        # leaves on the last slot frame.  Card-to-card joins pass explicit a/d/L (see v2/choreo.py).
        a = (start - 6 if sc != 'S0' else 0) if a is None else a
        L = (start + 10 if sc != 'S0' else 14) if L is None else L
        d = end - 1 if d is None else d
        S.append(Station(sc, 'card', a=a, d=d, L=L, card=card_of(inp, sc), **kw))

    def panel(sid, start, nxt, parts, p0, **kw):
        a = start - 1 + T_IN
        d = nxt - 14 - T_OUT
        S.append(Station(sid, 'panel', a=a, d=d, shot_seq=parts, p0=p0, **kw))

    def fr(parts, drop=0):
        f, got = seq_frames(inp, parts, drop)
        return f

    card('S0', 0, 160, d=142, yaw=0, pitch=0, dx=2300)
    card('C1', 160, 220, a=172, L=186, yaw=-20, pitch=2, shadow='mint', dx=-2300)
    panel('L1', 220, 400, [('L1_landing', 16, 190)], 232, yaw=18, pitch=-2, dx=2300, D1=2000, dyaw=-3,
          frames=fr([('L1_landing', 16, 190)], 26))
    card('C2', 400, 460, yaw=22, pitch=2, shadow='coral', dx=2300)
    panel('T1', 460, 740, [('T1_try', 0, 290)], 474, yaw=-17, pitch=2, dx=-2300, D0=2050, D1=2250, off0=(-177, 0), off1=(-124, 0), dyaw=3,
          frames=fr([('T1_try', 0, 290)], 56), follow=[('T1_try', 40, 58, 100, 120, 1750)])
    card('C3', 740, 800, yaw=-22, pitch=-2, shadow='periwinkle', dx=-2300)
    panel('A1', 800, 1120, [], 812, yaw=17, pitch=-2, dx=2300, shadow='coral', D0=2050, D1=2050, off0=(-177, 0), off1=(-177, 0),
          frames=fr([('A1a_builder', 8, inp.nframes('A1a_builder')), ('A1b_review', 0, inp.nframes('A1b_review')),
                     ('A1c_confirmed', 0, 24)], 36), follow=[('A1a_builder', 20, 34, 70, 94, 1800)])
    card('C4', 1120, 1180, yaw=24, pitch=2, shadow='cobalt', dx=2300)
    panel('A2', 1180, 1360, [], 1195, yaw=-15, pitch=1, dx=-2300, shadow='cobalt', D0=2050, D1=2250, off0=(-177, 0), off1=(-124, 0),
          frames=fr([('A2a_position', 6, 92), ('A2b_keeper', 0, 52)], 0))
    card('C5', 1360, 1420, yaw=-22, pitch=-2, shadow='mint', dx=-2300)
    panel('G1', 1420, 1580, [], 1405, yaw=18, pitch=2, dx=2300, D0=2050, D1=2250, off0=(-177, 0), off1=(-124, 0), frames=fr([('G1_agents', 20, 160)], 0))
    card('E1', 1580, 1680, d=1648, yaw=20, pitch=-1, shadow='coral', dx=2300)
    card('E2', 1680, 1800, a=1678, L=1692, yaw=0, pitch=0, shadow='cobalt', dyaw=1.0)
    rules = {
        'T1_drag': ('T1', 'T1_try', 36, 100), 'T1_tradeoff': ('T1', 'T1_try', 122, 166),
        'T1_crash': ('T1', 'T1_try', 172, 232),
        'A1_basket': ('A1', 'A1a_builder', 14, 36), 'A1_floor': ('A1', 'A1a_builder', 36, 70),
        'A1_term': ('A1', 'A1a_builder', 76, 100), 'A1_review': ('A1', 'A1b_review', 0, 60),
        'A2_tiles': ('A2', 'A2a_position', 30, 78), 'A2_keeper': ('A2', 'A2b_keeper', 8, 52),
        'G1_mcp': ('G1', 'G1_agents', 40, 150),
    }
    rules = {k: v for k, v in rules.items() if os.path.exists(os.path.join(inp.cap, v[1], 'events.json'))}
    callouts = ui_callouts(inp, S, rules)
    st = {s.id: s for s in S}
    captions = []
    for cid, sid in (('cap_L1', 'L1'), ('cap_T1', 'T1'), ('cap_A1', 'A1'), ('cap_A2', 'A2'), ('cap_G1', 'G1')):
        s = st[sid]
        captions.append(dict(id=cid, n_in=max(0, s.a - 30), n_out=min(1800, s.d + 30)))   # on every frame the panel is on screen
    return Plan('master', S, 1800, callouts, captions)


def plan_cut15(inp):
    """15 s cut for X: 22 beats = 440 frames.  Same stations, new timing (typo.json variants.cut15)."""
    var = inp.typo['variants']['cut15']['assets']
    over = {}
    for k, v in var.items():
        if v is None:
            over[k] = {'skip': True}
        else:
            over[k] = {'in': v['in']}
    over['lockup_in'] = var['E2_lockup']['in']
    over['no_lockup'] = True
    S = []
    S.append(Station('S0', 'card', a=0, d=56, L=8, card=card_of(inp, 'S0'), yaw=0, pitch=0, dx=2300))
    t1 = [('T1_try', 26, 106), ('T1_try', 148, 188)]
    S.append(Station('T1', 'panel', a=80, d=204, L=92, shot_seq=t1, p0=66, yaw=-17, pitch=2, dx=-2300, D0=2050, D1=2250, off0=(-177, 0), off1=(-124, 0), dyaw=3,
                     frames=[(sh, k) for sh, a, b in t1 for k in range(a, b)], follow=[('T1_try', 36, 48, 92, 106, 1750)],
                     shadow='cobalt'))
    a1 = [('A1a_builder', 50, 80), ('A1a_builder', 152, 164), ('A1b_review', 0, 12), ('A1c_confirmed', 0, 12)]
    S.append(Station('A1', 'panel', a=226, d=292, L=238, shot_seq=a1, p0=226, yaw=17, pitch=-2, dx=2300, shadow='coral', D0=2050, D1=2050, off0=(-177, 0), off1=(-177, 0),
                     frames=[(sh, k) for sh, x, y in a1 for k in range(x, y)]))
    S.append(Station('E1', 'card', a=312, d=340, L=324, card=card_of(inp, 'E1'), yaw=20, pitch=-1, dx=2300, shadow='coral'))
    S.append(Station('E2', 'card', a=356, d=439, L=370, card=card_of(inp, 'E2'), yaw=0, pitch=0, shadow='cobalt', dyaw=1.0))
    callouts = []
    for cid, sid in (('T1_drag', 'T1'), ('T1_tradeoff', 'T1'), ('A1_review', 'A1')):
        c = next(x for x in inp.typo['callouts'] if x['id'] == cid)
        v = var[cid]
        callouts.append(dict(id=cid, station=sid, n_in=v['in'] if cid != 'A1_review' else 244, n_out=min(v['out'], 300 if sid == 'A1' else 212),
                             layout=LAYOUT[cid]))
    captions = [dict(id='cap_T1', n_in=62, n_out=214), dict(id='cap_A1', n_in=214, n_out=330)]
    return Plan('cut15', S, 440, callouts, captions, typo_over=over)


def make_all_named(name):
    inp = build_inputs(False)
    plan = plan_cut15(inp) if name == 'cut15' else plan_master(inp)
    world = World(plan, inp, True)
    return inp, plan, world, Rig(plan, world)


def build_inputs(standin):
    if standin:
        return Inputs(os.path.join(HERE, '_standin', 'capture'), os.path.join(HERE, '_standin', 'typo'))
    return Inputs(os.path.join(HERE, 'capture'), os.path.join(HERE, 'typo'))


# ================================================================================================ CLI
def make_all(final):
    inp = build_inputs(False)
    plan = plan_master(inp)
    world = World(plan, inp, final)
    rig = Rig(plan, world)
    return inp, plan, world, rig


_G = {}


def _init(planname):
    inp, plan, world, rig = make_all_named(planname)
    _G.update(inp=inp, plan=plan, world=world, rig=rig)


def _job(args):
    n, out, noblur = args
    t = time.time()
    img = render_frame(_G['world'], _G['plan'], _G['rig'], n, use_blur=not noblur)
    tmp = os.path.join(out, f'.tmp_{n:04d}.png')
    cv2.imwrite(tmp, cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_PNG_COMPRESSION, 1])
    os.replace(tmp, os.path.join(out, f'r_{n:04d}.png'))
    return n, time.time() - t


def parse_frames(spec):
    out = []
    for part in spec.split(','):
        if '-' in part:
            a, b = part.split('-')
            step = 1
            if ':' in b:
                b, step = b.split(':')
            out += list(range(int(a), int(b) + 1, int(step)))
        else:
            out.append(int(part))
    return out


def main():
    from multiprocessing import Pool
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', default='0-0')
    ap.add_argument('--out', default=os.path.join(HERE, 'render'))
    ap.add_argument('--noblur', action='store_true')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--plan', default='master')
    a = ap.parse_args()
    frames = parse_frames(a.frames)
    os.makedirs(a.out, exist_ok=True)
    def valid(n):
        pth = os.path.join(a.out, f'r_{n:04d}.png')
        if not os.path.exists(pth) or os.path.getsize(pth) < 20000:
            return False
        im = cv2.imread(pth, cv2.IMREAD_REDUCED_GRAYSCALE_8)
        return im is not None
    todo = [n for n in frames if not valid(n)]
    jobs = [(n, a.out, a.noblur) for n in todo]
    t0 = time.time()
    done = len(frames) - len(todo)
    tsum = 0.0
    prog = os.path.join(a.out, 'PROGRESS.txt')
    print('skipping', done, 'todo', len(todo), flush=True)
    with Pool(a.workers, initializer=_init, initargs=(a.plan,)) as p:
        for n, dt in p.imap_unordered(_job, jobs, chunksize=1):
            done += 1
            tsum += dt
            print(n, round(dt, 2), flush=True)
            if done % 5 == 0:
                open(prog, 'w').write(f'{done}/{len(frames)} frames, elapsed {time.time()-t0:.0f}s, mean {tsum/max(1,done-(len(frames)-len(todo))):.2f}s/frame/worker, last {n}\n')
    open(prog, 'w').write(f'FINISHED {done}/{len(frames)} total {time.time()-t0:.0f}s\n')
    print('total', round(time.time() - t0, 1))


if __name__ == '__main__':
    main()
