import cv2, numpy as np, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comp, cues_qa
R = 'render'
def sheet(frames, out, cols, tw=384, label=True):
    th = tw * 9 // 16
    rows = (len(frames) + cols - 1) // cols
    s = np.full((rows * (th + 18), cols * tw, 3), 235, np.uint8)
    for i, n in enumerate(frames):
        im = cv2.imread(f'{R}/r_{n:04d}.png')
        im = cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA)
        r, c = divmod(i, cols)
        s[r * (th + 18) + 18:(r + 1) * (th + 18), c * tw:(c + 1) * tw] = im
        cv2.putText(s, str(n), (c * tw + 4, r * (th + 18) + 13), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.imwrite(out, s)
os.makedirs('contact', exist_ok=True)
sheet([int(round(i * 1799 / 24)) for i in range(25)], 'contact/master_contact.png', 5)
# motion study: 3 biggest moves (by distance): frames across the move
inp, plan, world, rig = comp.make_all(True)
mv = sorted([g for g in plan.seg if g['kind'] != 'hold-drift'], key=lambda g: -np.linalg.norm(g['p1'] - g['p0']))[:3]
fr = []
for g in mv:
    fr += [int(g['n0'] + (g['n1'] - g['n0']) * k / 5) for k in range(6)]
print('moves', [(g['to'], g['n0'], g['n1']) for g in mv])
sheet(fr, 'contact/motion_study.png', 6, tw=320)
# blur study: rack focus on headline card C2 (arrive 386, L 400) + dolly on real screen T1 (move 459-489)
rack = [398, 401, 404, 406, 408, 410]
dolly = [462, 467, 472, 477, 482, 489]
sheet(rack + dolly, 'contact/blur_study.png', 6, tw=320)
# per-scene blur radii
rows = []
for s in plan.st:
    for n in (s.a - 4, s.a, (s.a + s.L) // 2, s.L, (s.L + s.d) // 2, s.d, s.d + 12):
        n = max(0, min(1799, n))
        cam = rig.cam(n)
        p = [q for q in world.planes if getattr(q, 'group', None) == s.id and q.role in ('card', 'ui')][0]
        rows.append((s.id, n, round(comp.blur_radius(world, plan, p, n, cam), 1)))
json.dump(rows, open('qa_blur_radius.json', 'w'))
print(rows)
# palette audit
pal = np.array([[250, 250, 248], [36, 64, 224], [124, 147, 255], [255, 116, 105], [61, 214, 140], [11, 12, 14]], float)
rng = np.random.default_rng(1)
tot = ok = 0
for n in sorted(rng.choice(1800, 15, replace=False)):
    im = cv2.cvtColor(cv2.imread(f'{R}/r_{int(n):04d}.png'), cv2.COLOR_BGR2RGB).astype(float)
    g = cv2.Laplacian(cv2.cvtColor(im.astype(np.uint8), cv2.COLOR_RGB2GRAY), cv2.CV_32F)
    ys, xs = np.where(np.abs(g) < 1.5)
    # exclude UI panel: ui frames have text; crude: use only pixels within 18 of a palette colour or flat
    idx = rng.choice(len(ys), 20)
    for i in idx:
        d = np.sqrt(((pal - im[ys[i], xs[i]]) ** 2).sum(1)).min()
        tot += 1; ok += d < 14
print('palette audit flat pixels within 14 RGB of palette', ok, '/', tot)
