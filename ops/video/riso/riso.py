"""Floor riso compositor core (reusable).

A frame is built from spot-colour PLATES (cobalt, periwinkle, coral, mint, ink): float32 coverage maps that get
solid fills, type masks and round-dot halftone screens. At render time every plate gets ink bleed / edge roughening,
its own small drifting misregistration offset (integer px, |d| <= 3), and is printed multiplicatively on paper
#FAFAF8 together with paper fibre + per-frame grain. CRISP layers (captured UI panel, lockup, caption/footer
type, keylines) are composited after the riso pass and never filtered; only a very light frame-wide grain sits
over them. Everything is seeded by frame number (deterministic).
"""
import math
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw

W, H = 1920, 1080


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


PAPER = hexrgb('#FAFAF8')
INKS = {
    'periwinkle': hexrgb('#7C93FF'),
    'mint': hexrgb('#3DD68C'),
    'coral': hexrgb('#FF7469'),
    'cobalt': hexrgb('#2440E0'),
    'ink': hexrgb('#0B0C0E'),
}
PALETTE = {'paper': PAPER, **INKS}
# screen angles per plate (classic separation: ink 45, others spread)
ANGLE = {'ink': 45.0, 'cobalt': 15.0, 'periwinkle': 75.0, 'coral': 0.0, 'mint': 30.0}
# misregistration direction per plate (unit-ish), ink is the key plate (smallest)
MIS_DIR = {'ink': (0.35, -0.25), 'cobalt': (-0.8, 0.55), 'periwinkle': (0.9, 0.4), 'coral': (0.55, -0.85),
           'mint': (-0.6, -0.8)}


# ----------------------------------------------------------------------------------------------- noise bank
class NoiseBank:
    """Pre-generated noise textures (seeded); frames slice them at frame-seeded offsets (cheap, deterministic)."""

    def __init__(self, seed=20261005):
        rng = np.random.default_rng(seed)
        BH, BW = H + 256, W + 256
        self.fine = rng.standard_normal((BH, BW), dtype=np.float32)
        lo = rng.standard_normal((BH // 2, BW // 2), dtype=np.float32)
        lo = ndimage.gaussian_filter(lo, 1.2)
        lo /= lo.std() + 1e-6
        self.clump = np.repeat(np.repeat(lo, 2, 0), 2, 1)[:BH, :BW]          # 2-4 px clumps (ink bleed)
        vlo = rng.standard_normal((BH // 8, BW // 8), dtype=np.float32)
        vlo = ndimage.gaussian_filter(vlo, 2.0)
        vlo /= vlo.std() + 1e-6
        self.mottle = np.asarray(Image.fromarray(vlo).resize((BW, BH), Image.BILINEAR))  # ink density mottle
        fib = rng.standard_normal((H, W), dtype=np.float32)
        fib = ndimage.gaussian_filter(fib, (0.6, 2.2))                           # paper fibre (static)
        fib /= fib.std() + 1e-6
        self.fibre = fib

    def slice(self, arr, n, salt, h=H, w=W):
        r = np.random.default_rng((n * 7919 + salt * 104729) & 0xFFFFFFFF)
        oy = int(r.integers(0, arr.shape[0] - h + 1))
        ox = int(r.integers(0, arr.shape[1] - w + 1))
        return arr[oy:oy + h, ox:ox + w]


_BANK = None


def bank():
    global _BANK
    if _BANK is None:
        _BANK = NoiseBank()
    return _BANK


# ----------------------------------------------------------------------------------------------- helpers
def stepped(u, steps=5, ease=True):
    """Quantised ease-out: u in [0,1] -> value held in `steps` snappy steps (print-motion look)."""
    if u <= 0:
        return 0.0
    if u >= 1:
        return 1.0
    q = math.floor(u * steps) / steps
    q = min(1.0, q + 1.0 / steps)  # first step lands immediately
    return 1 - (1 - q) ** 3 if ease else q


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def sample12(n, fps=30):
    """Frame number re-sampled to a 12 fps clock (for non-UI paper layers)."""
    return math.floor(n * 12 / fps) * fps / 12.0


# ----------------------------------------------------------------------------------------------- frame
class Frame:
    def __init__(self, n, misreg=1.5, grain=0.022, crisp_grain=0.007):
        self.n = n
        self.plates = {}
        self.over = []       # (ink, coverage, x, y) solid opaque ink printed above crisp layers (rare)
        self.crisp = []      # ops composited after riso
        self.misreg = misreg
        self.grain = grain
        self.crisp_grain = crisp_grain
        self.fade = 1.0      # 1 = full image, 0 = bare paper

    def plate(self, ink):
        p = self.plates.get(ink)
        if p is None:
            p = np.zeros((H, W), np.float32)
            self.plates[ink] = p
        return p

    # -- solid shapes
    def rect(self, ink, x0, y0, x1, y1, v=1.0):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
        if X1 <= X0 or Y1 <= Y0:
            return
        p = self.plate(ink)
        np.maximum(p[Y0:Y1, X0:X1], v, out=p[Y0:Y1, X0:X1])

    def poly(self, ink, pts, v=1.0, ss=2):
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        bx0, by0 = max(0, int(math.floor(min(xs))) - 1), max(0, int(math.floor(min(ys))) - 1)
        bx1, by1 = min(W, int(math.ceil(max(xs))) + 1), min(H, int(math.ceil(max(ys))) + 1)
        if bx1 <= bx0 or by1 <= by0:
            return
        im = Image.new('L', ((bx1 - bx0) * ss, (by1 - by0) * ss), 0)
        ImageDraw.Draw(im).polygon([((x - bx0) * ss, (y - by0) * ss) for x, y in pts], fill=255)
        if ss > 1:
            im = im.resize((bx1 - bx0, by1 - by0), Image.BOX)
        a = np.asarray(im, np.float32) * (v / 255.0)
        p = self.plate(ink)
        np.maximum(p[by0:by1, bx0:bx1], a, out=p[by0:by1, bx0:bx1])

    def disc(self, ink, cx, cy, r, v=1.0):
        pts = [(cx + r * math.cos(t * 2 * math.pi / 64), cy + r * math.sin(t * 2 * math.pi / 64)) for t in range(64)]
        self.poly(ink, pts, v)

    def mask(self, ink, alpha, x, y, v=1.0):
        """alpha: float32 0..1 array pasted at integer x,y (type masks, never resampled)."""
        x, y = int(round(x)), int(round(y))
        h, w = alpha.shape
        X0, Y0, X1, Y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        if X1 <= X0 or Y1 <= Y0:
            return
        p = self.plate(ink)
        src = alpha[Y0 - y:Y1 - y, X0 - x:X1 - x]
        np.maximum(p[Y0:Y1, X0:X1], src * v, out=p[Y0:Y1, X0:X1])

    # -- halftone (round dots only)
    def tone(self, ink, x0, y0, x1, y1, t0, t1=None, axis='x', pitch=10.0, origin=(0.0, 0.0), angle=None,
             clip_poly=None):
        """Axis-aligned halftone block. Tone ramps linearly t0->t1 along `axis` (dot size changes, never colour).
        The screen is anchored at `origin` (move it with the layer so dots travel with the paper)."""
        if t1 is None:
            t1 = t0
        X0, Y0 = max(0, int(math.floor(x0))), max(0, int(math.floor(y0)))
        X1, Y1 = min(W, int(math.ceil(x1))), min(H, int(math.ceil(y1)))
        if X1 <= X0 or Y1 <= Y0:
            return
        ang = math.radians(ANGLE[ink] if angle is None else angle)
        yy, xx = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
        xx += 0.5; yy += 0.5
        if axis == 'x':
            f = np.clip((xx - x0) / max(1e-3, x1 - x0), 0, 1)
        else:
            f = np.clip((yy - y0) / max(1e-3, y1 - y0), 0, 1)
        t = t0 + (t1 - t0) * f
        lx, ly = xx - origin[0], yy - origin[1]
        c, s = math.cos(ang), math.sin(ang)
        u = (lx * c + ly * s) / pitch
        v = (-lx * s + ly * c) / pitch
        du = u - np.round(u); dv = v - np.round(v)
        d = np.sqrt(du * du + dv * dv) * pitch
        r = pitch * np.sqrt(np.clip(t, 0, 1) / math.pi) * 1.02
        cov = np.clip(r - d + 0.5, 0, 1)
        cov[t <= 0.002] = 0
        if clip_poly is not None:
            im = Image.new('L', (X1 - X0, Y1 - Y0), 0)
            ImageDraw.Draw(im).polygon([(px - X0, py - Y0) for px, py in clip_poly], fill=255)
            cov *= np.asarray(im, np.float32) / 255.0
        p = self.plate(ink)
        np.maximum(p[Y0:Y1, X0:X1], cov, out=p[Y0:Y1, X0:X1])

    def pixels(self, ink, cells, x, y, size):
        """Pixel-square clusters: cells = [(col,row), ...]."""
        for cx, cy in cells:
            self.rect(ink, x + cx * size, y + cy * size, x + (cx + 1) * size, y + (cy + 1) * size)

    # -- crisp layers (never filtered)
    def crisp_rgba(self, rgba_u8, x, y):
        self.crisp.append(('rgba', rgba_u8, int(round(x)), int(round(y))))

    def crisp_rgbmask(self, rgb_f, mask_f, x, y):
        self.crisp.append(('rgbm', rgb_f, mask_f, int(x), int(y)))

    def crisp_outline(self, pts, ink='ink', width=2):
        self.crisp.append(('outline', pts, ink, width))

    # ------------------------------------------------------------------------------------------- render
    def offsets(self):
        """Per-plate misregistration, slow sinusoidal drift + tiny random walk, integer px, |d| <= 3."""
        n = self.n
        out = {}
        for i, (ink, (dx, dy)) in enumerate(MIS_DIR.items()):
            ph = i * 1.7
            a = self.misreg * (0.75 + 0.25 * math.sin(n * 0.11 + ph))
            ox = dx * a + 0.6 * math.sin(n * 0.071 + ph * 2.3)
            oy = dy * a + 0.6 * math.cos(n * 0.053 + ph * 1.1)
            if ink == 'ink':
                ox *= 0.6; oy *= 0.6
            out[ink] = (int(max(-3, min(3, round(ox)))), int(max(-3, min(3, round(oy)))))
        return out

    def _bleed(self, cov, n, salt, ink):
        """Soft ink bleed + edge roughening + slight density mottle (stays inside the plate's colour)."""
        nz = bank()
        ys, xs = np.nonzero(cov.any(axis=1))[0], np.nonzero(cov.any(axis=0))[0]
        if len(ys) == 0:
            return None
        y0, y1 = max(0, ys[0] - 3), min(H, ys[-1] + 4)
        x0, x1 = max(0, xs[0] - 3), min(W, xs[-1] + 4)
        c = cov[y0:y1, x0:x1]
        b = ndimage.uniform_filter(c, 3)
        clump = nz.slice(nz.clump, n // 2, salt)[y0:y1, x0:x1]     # boils at 15 fps
        edge = b * (1 - b) * 4
        rough, mo = (0.24, 0.010) if ink == 'ink' else (0.34, 0.022)
        r = np.clip((b - 0.5) * 1.9 + 0.5 + rough * edge * clump, 0, 1)
        # 1 px bloom: faint spread just outside edges
        r = np.maximum(r, b * 0.2)
        mott = nz.slice(nz.mottle, 0, salt)[y0:y1, x0:x1]           # static plate density variation
        r *= (1.0 - mo + mo * 0.8 * mott).clip(0.9, 1.0)
        return r, (y0, y1, x0, x1)

    def render(self):
        n = self.n
        nz = bank()
        img = np.empty((H, W, 3), np.float32)
        img[:] = PAPER
        offs = self.offsets()
        for k, (ink, cov) in enumerate(self.plates.items()):
            res = self._bleed(cov, n, list(INKS).index(ink) + 1, ink)
            if res is None:
                continue
            r, (y0, y1, x0, x1) = res
            dx, dy = offs[ink]
            # shift region by misregistration
            Y0, Y1, X0, X1 = y0 + dy, y1 + dy, x0 + dx, x1 + dx
            cy0, cy1, cx0, cx1 = max(0, Y0), min(H, Y1), max(0, X0), min(W, X1)
            if cy1 <= cy0 or cx1 <= cx0:
                continue
            sub = r[cy0 - Y0:cy1 - Y0, cx0 - X0:cx1 - X0]
            fac = 1.0 - INKS[ink] / PAPER          # multiplicative ink on paper
            img[cy0:cy1, cx0:cx1] *= 1.0 - sub[..., None] * fac
        # paper fibre (static) + animated grain (new each frame) over the print
        g = nz.slice(nz.fine, n, 99)
        img *= (1.0 + 0.008 * nz.fibre + self.grain * 0.5 * g)[..., None]

        # crisp layers
        for op in self.crisp:
            if op[0] == 'rgba':
                _, a, x, y = op
                h, w = a.shape[:2]
                X0, Y0, X1, Y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
                if X1 <= X0 or Y1 <= Y0:
                    continue
                s = a[Y0 - y:Y1 - y, X0 - x:X1 - x].astype(np.float32) / 255.0
                al = s[..., 3:4]
                img[Y0:Y1, X0:X1] = img[Y0:Y1, X0:X1] * (1 - al) + s[..., :3] * al
            elif op[0] == 'rgbm':
                _, rgb, m, x, y = op
                h, w = m.shape
                X0, Y0, X1, Y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
                if X1 <= X0 or Y1 <= Y0:
                    continue
                s = rgb[Y0 - y:Y1 - y, X0 - x:X1 - x]
                al = m[Y0 - y:Y1 - y, X0 - x:X1 - x][..., None]
                img[Y0:Y1, X0:X1] = img[Y0:Y1, X0:X1] * (1 - al) + s * al
            elif op[0] == 'outline':
                _, pts, ink, width = op
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                bx0, by0 = max(0, int(min(xs)) - width - 2), max(0, int(min(ys)) - width - 2)
                bx1, by1 = min(W, int(max(xs)) + width + 3), min(H, int(max(ys)) + width + 3)
                if bx1 <= bx0 or by1 <= by0:
                    continue
                ss = 4
                im = Image.new('L', ((bx1 - bx0) * ss, (by1 - by0) * ss), 0)
                q = [((px - bx0) * ss, (py - by0) * ss) for px, py in pts]
                dr = ImageDraw.Draw(im)
                # keyline sits just OUTSIDE the quad (never covers panel pixels): outer offset polygon minus quad
                cx = sum(p[0] for p in q) / len(q); cy = sum(p[1] for p in q) / len(q)
                inner = []
                for i in range(len(q)):
                    p0, p1, p2 = q[i - 1], q[i], q[(i + 1) % len(q)]
                    def nrm(a, b):
                        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
                        nx, ny = -dy / L, dx / L
                        if (cx - a[0]) * nx + (cy - a[1]) * ny < 0: nx, ny = -nx, -ny
                        return nx, ny
                    n1, n2 = nrm(p0, p1), nrm(p1, p2)
                    inner.append((p1[0] - (n1[0] + n2[0]) * width * ss, p1[1] - (n1[1] + n2[1]) * width * ss))
                dr.polygon(inner, fill=255)
                dr.polygon(q, fill=0)
                im = im.resize((bx1 - bx0, by1 - by0), Image.BOX)
                al = (np.asarray(im, np.float32) / 255.0)[..., None]
                img[by0:by1, bx0:bx1] = img[by0:by1, bx0:bx1] * (1 - al) + INKS[ink] * al
        for ink, cov, x, y in self.over:
            h, w = cov.shape
            X0, Y0, X1, Y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
            al = cov[Y0 - y:Y1 - y, X0 - x:X1 - x][..., None]
            img[Y0:Y1, X0:X1] = img[Y0:Y1, X0:X1] * (1 - al) + INKS[ink] * al
        if self.fade < 1.0:
            img = PAPER + (img - PAPER) * self.fade
        # very light frame-wide grain over everything (including crisp layers)
        g2 = nz.slice(nz.fine, n, 7)
        img *= (1.0 + self.crisp_grain * g2)[..., None]
        return (np.clip(img, 0, 1) * 255.0 + 0.5).astype(np.uint8)
