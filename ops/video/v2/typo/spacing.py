"""Area-based optical spacing check for Anton pairs (used to derive the manual kerning table)."""
import cairo, numpy as np
from typolib import font
S = 400
A = font('anton')
_prof = {}
def profile(g):
    if g in _prof: return _prof[g]
    W, H = 900, 900; base = 700
    surf = cairo.ImageSurface(cairo.FORMAT_A8, W, H); c = cairo.Context(surf)
    A.draw(c, [{'g': g, 'x': 0}], 100, base, S, s=1); surf.flush()
    a = np.ndarray((H, surf.get_stride()), np.uint8, surf.get_data())[:, :W] > 127
    xh = int(A.xh * S); rows = a[base - xh:base]
    L = np.array([np.argmax(r) - 100 if r.any() else np.nan for r in rows], float)
    R = np.array([W - 1 - np.argmax(r[::-1]) - 100 if r.any() else np.nan for r in rows], float)
    _prof[g] = (L, R); return _prof[g]
def gap(chL, chR, kern=0.0):
    gl, gr = A.gname(chL), A.gname(chR)
    run, _ = A.shape(chL + chR, S)
    off = run[1]['x'] + kern * S
    Ll, Rl = profile(gl); Lr, Rr = profile(gr)
    d = (off + Lr) - Rl
    D = 0.16 * S                        # cavities deeper than this count as this deep
    d = np.where(np.isnan(d), D, np.minimum(d, D))
    return float(np.mean(d)) / S
if __name__ == '__main__':
    import sys, collections
    lines = sys.argv[1:]
    pairs = collections.OrderedDict()
    for l in lines:
        for w in l.split(' '):
            for a, b in zip(w, w[1:]): pairs[a + b] = gap(a, b)
    ref = np.median(list(pairs.values()))
    print('median gap/em', round(ref, 4))
    for p, v in sorted(pairs.items(), key=lambda kv: kv[1]):
        flag = '  <-- tight' if v < ref * 0.72 else ('  <-- loose' if v > ref * 1.35 else '')
        print(repr(p), round(v, 4), round(v / ref, 2), flag)
