"""Floor v2 typography core: font loading, shaping (HarfBuzz), manual kerning, outline rendering (cairo),
pixel-serif accent rasterisation, flat shapes and halftone. Deterministic, no network.

Coordinates: layout is done in 1x frame px (1920x1080 card space); every raster is produced at SC = 2.
"""
import math
import os

import cairo
import numpy as np
import uharfbuzz as hb
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, 'fonts')
SC = 2  # asset scale

PAL = {
    'paper': (0xFA, 0xFA, 0xF8), 'cobalt': (0x24, 0x40, 0xE0), 'periwinkle': (0x7C, 0x93, 0xFF),
    'coral': (0xFF, 0x74, 0x69), 'mint': (0x3D, 0xD6, 0x8C), 'ink': (0x0B, 0x0C, 0x0E),
}
HEX = {k: '#%02X%02X%02X' % v for k, v in PAL.items()}


def rgbf(name):
    r, g, b = PAL[name]
    return r / 255.0, g / 255.0, b / 255.0


# ----------------------------------------------------------------------------------------------- fonts
class CairoPen(BasePen):
    def __init__(self, glyphset, ctx, ox, oy, s):
        super().__init__(glyphset)
        self.c, self.ox, self.oy, self.s = ctx, ox, oy, s

    def _p(self, pt):
        return self.ox + pt[0] * self.s, self.oy - pt[1] * self.s

    def _moveTo(self, p):
        self.c.move_to(*self._p(p))

    def _lineTo(self, p):
        self.c.line_to(*self._p(p))

    def _curveToOne(self, p1, p2, p3):
        self.c.curve_to(*self._p(p1), *self._p(p2), *self._p(p3))

    def _closePath(self):
        self.c.close_path()


class Font:
    def __init__(self, fname, label):
        self.path = os.path.join(FONTS, fname)
        self.label = label
        self.tt = TTFont(self.path)
        self.gs = self.tt.getGlyphSet()
        self.upem = self.tt['head'].unitsPerEm
        self.order = self.tt.getGlyphOrder()
        self.cmap = self.tt.getBestCmap()
        os2 = self.tt['OS/2']
        self.cap = os2.sCapHeight / self.upem
        self.xh = os2.sxHeight / self.upem
        self.asc = self.tt['hhea'].ascent / self.upem
        self.desc = self.tt['hhea'].descent / self.upem
        blob = hb.Blob.from_file_path(self.path)
        self.hbfont = hb.Font(hb.Face(blob))
        self._bounds = {}

    def gname(self, ch):
        return self.cmap[ord(ch)]

    def bounds(self, g):
        """Ink bounds (font units) or None for empty glyphs."""
        if g not in self._bounds:
            bp = BoundsPen(self.gs)
            self.gs[g].draw(bp)
            self._bounds[g] = bp.bounds
        return self._bounds[g]

    def shape(self, text, size, tracking=0.0, kern=None, features=None, space=1.0):
        """Returns list of dict(g, ch, x, adv) in px and the advance width. tracking in em, applied
        between glyphs (not after the last). kern: {(chL, chR): em} manual pair adjustments.
        space: word-space multiplier."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hbfont, buf, features or {'kern': True, 'liga': False})
        s = size / self.upem
        out, x = [], 0.0
        infos, poss = buf.glyph_infos, buf.glyph_positions
        for i, (inf, pos) in enumerate(zip(infos, poss)):
            ch = text[inf.cluster]
            g = self.order[inf.codepoint]
            adv = pos.x_advance * s
            if ch == ' ':
                adv *= space
            out.append({'g': g, 'ch': ch, 'x': x + pos.x_offset * s, 'adv': adv, 'i': inf.cluster})
            x += adv
            if i < len(infos) - 1:
                x += tracking * size
                nxt = text[infos[i + 1].cluster]
                if kern and (ch, nxt) in kern:
                    x += kern[(ch, nxt)] * size
        return out, x

    def draw(self, ctx, glyphs, ox, base, size, s=SC):
        """Fill glyph outlines; ox/base in 1x px, ctx in 2x px."""
        k = size / self.upem * s
        for gl in glyphs:
            pen = CairoPen(self.gs, ctx, (ox + gl['x']) * s, base * s, k)
            self.gs[gl['g']].draw(pen)
        ctx.fill()

    def ink_x(self, glyphs, size):
        """Ink extents [x0, x1] (1x px, relative to run origin)."""
        s = size / self.upem
        xs = []
        for gl in glyphs:
            b = self.bounds(gl['g'])
            if b:
                xs += [gl['x'] + b[0] * s, gl['x'] + b[2] * s]
        return min(xs), max(xs)

    def ink_y(self, glyphs, size):
        s = size / self.upem
        ys = []
        for gl in glyphs:
            b = self.bounds(gl['g'])
            if b:
                ys += [b[1] * s, b[3] * s]
        return -max(ys), -min(ys)  # top, bottom relative to baseline (y down)


_F = {}


def font(key):
    if key not in _F:
        spec = {
            'anton': ('Anton-Regular.ttf', 'Anton Regular (@fontsource/anton 5.3.0, OFL)'),
            'serif_it': ('InstrumentSerif-Italic.ttf', 'Instrument Serif Italic (@fontsource/instrument-serif 5.3.0, OFL), pixelated'),
            'mono500': ('GeistMono-Medium.ttf', 'Geist Mono Medium (geist npm, OFL)'),
            'mono400': ('GeistMono-Regular.ttf', 'Geist Mono Regular (geist npm, OFL)'),
        }[key]
        _F[key] = Font(*spec)
    return _F[key]


# ------------------------------------------------------------------------------------------ surfaces
class Layer:
    """A 2x RGBA canvas covering a 1x rectangle (x, y, w, h) of card space."""

    def __init__(self, w, h, x=0.0, y=0.0):
        self.x, self.y, self.w, self.h = x, y, w, h
        self.W, self.H = int(math.ceil(w * SC)), int(math.ceil(h * SC))
        self.surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, self.W, self.H)
        self.ctx = cairo.Context(self.surf)
        self.ctx.set_antialias(cairo.ANTIALIAS_BEST)
        self.ctx.translate(-x * SC, -y * SC)

    def rgba(self):
        self.surf.flush()
        buf = np.ndarray((self.H, self.surf.get_stride() // 4, 4), np.uint8, self.surf.get_data())[:, :self.W]
        b, g, r, a = [buf[..., i].astype(np.float32) for i in range(4)]
        af = np.maximum(a, 1) / 255.0
        out = np.stack([np.where(a > 0, r / af, 0), np.where(a > 0, g / af, 0), np.where(a > 0, b / af, 0), a], -1)
        return np.clip(np.round(out), 0, 255).astype(np.uint8)


def flat_color(rgba, name):
    """Force every pixel's RGB to the exact palette colour (alpha carries the AA)."""
    out = rgba.copy()
    out[..., :3] = PAL[name]
    out[out[..., 3] == 0, :3] = 0
    return out


def crop_alpha(rgba, pad=4):
    a = rgba[..., 3]
    ys, xs = np.nonzero(a.any(1))[0], np.nonzero(a.any(0))[0]
    if len(ys) == 0:
        return rgba[:1, :1], 0, 0
    y0, y1 = max(0, ys[0] - pad), min(a.shape[0], ys[-1] + 1 + pad)
    x0, x1 = max(0, xs[0] - pad), min(a.shape[1], xs[-1] + 1 + pad)
    # keep even offsets so 1x coordinates stay on half-pixels at worst
    x0 -= x0 % 2
    y0 -= y0 % 2
    return rgba[y0:y1, x0:x1], x0, y0


def save_png(rgba, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(path, optimize=True)


# ---------------------------------------------------------------------------------- pixel serif accent
def pixel_word(word, x_height_px, color='cobalt', blocks_per_xh=20, thresh=0.44):
    """Instrument Serif Italic rasterised so that its x-height spans `blocks_per_xh` blocks, hard
    thresholded on supersampled coverage, then upscaled nearest-neighbour to 2x px. Block size is an
    integer number of 2x px, the baseline falls on a block boundary.
    Returns (rgba 2x, info) with info['base_row'] = row index (2x px) of the baseline, info['block'],
    info['ink_left_px'] (2x px from image left to first ink column)."""
    f = font('serif_it')
    xh2 = x_height_px * SC
    block = max(2, int(round(xh2 / blocks_per_xh)))
    nb_xh = xh2 / block                    # blocks per x-height (close to blocks_per_xh)
    size_low = nb_xh / f.xh                # serif size in block units
    SS = 8                                 # supersampling of the low-res coverage
    glyphs, adv = f.shape(word, size_low * SS)
    top_lo = int(math.ceil(f.asc * size_low)) + 2
    bot_lo = int(math.ceil(-f.desc * size_low)) + 2
    wl = int(math.ceil(adv / SS)) + 8
    hl = top_lo + bot_lo
    surf = cairo.ImageSurface(cairo.FORMAT_A8, wl * SS, hl * SS)
    ctx = cairo.Context(surf)
    ctx.set_antialias(cairo.ANTIALIAS_BEST)
    f.draw(ctx, glyphs, 4 * SS, top_lo * SS, size_low * SS, s=1)
    surf.flush()
    a = np.ndarray((hl * SS, surf.get_stride()), np.uint8, surf.get_data())[:, :wl * SS].astype(np.float32) / 255.0
    cov = a.reshape(hl, SS, wl, SS).mean((1, 3))
    on = cov >= thresh
    # hairline rescue: keep a pixel that bridges two 'on' neighbours (vertical or horizontal) if cov >= 0.25
    weak = (cov >= 0.25) & ~on
    br = np.zeros_like(on)
    br[1:-1, :] |= on[:-2, :] & on[2:, :]
    br[:, 1:-1] |= on[:, :-2] & on[:, 2:]
    on |= weak & br
    # drop isolated single pixels (noise)
    nb = np.zeros(on.shape, np.int32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy or dx:
                nb += np.roll(np.roll(on, dy, 0), dx, 1)
    on &= nb > 0
    big = np.repeat(np.repeat(on, block, 0), block, 1)
    rgba = np.zeros(big.shape + (4,), np.uint8)
    rgba[big] = PAL[color] + (255,)
    cols = np.nonzero(on.any(0))[0]
    rows = np.nonzero(on.any(1))[0]
    info = {'block': block, 'base_row': top_lo * block, 'ink_left': int(cols[0]) * block,
            'ink_right': int(cols[-1] + 1) * block, 'ink_top': int(rows[0]) * block,
            'ink_bottom': int(rows[-1] + 1) * block, 'serif_size_px': size_low * block / SC,
            'blocks_per_xh': nb_xh}
    return rgba, info


# --------------------------------------------------------------------------------------------- shapes
def halftone(w, h, color, pitch=12.0, radius=3.6, angle=45.0, x=0, y=0, clip=None):
    """Flat round-dot pattern (uniform dots) on a screen rotated `angle` degrees. 1x units in, 2x raster out."""
    L = Layer(w, h, x, y)
    c = L.ctx
    c.set_source_rgb(*rgbf(color))
    if clip:
        clip(c)
        c.clip()
    th = math.radians(angle)
    ux, uy = math.cos(th), math.sin(th)
    vx, vy = -uy, ux
    cx, cy = x + w / 2, y + h / 2
    R = math.hypot(w, h) / 2 + pitch
    n = int(R / pitch) + 2
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            px = cx + (i * ux + j * vx) * pitch
            py = cy + (i * uy + j * vy) * pitch
            if x - radius <= px <= x + w + radius and y - radius <= py <= y + h + radius:
                c.new_sub_path()
                c.arc(px * SC, py * SC, radius * SC, 0, 2 * math.pi)
    c.fill()
    return L


def poly(c, pts):
    c.move_to(pts[0][0] * SC, pts[0][1] * SC)
    for p in pts[1:]:
        c.line_to(p[0] * SC, p[1] * SC)
    c.close_path()
