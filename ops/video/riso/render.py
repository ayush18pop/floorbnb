#!/usr/bin/env python3
"""Render the Floor proof with the riso compositor.

  python3 ops/video/riso/render.py --capture ops/video/proof/capture --out ops/video/proof/render [--frames 0-299] [--workers 4]

Refuses a stand-in capture unless --allow-standin (stand-in renders go to a separate --out you choose).
Writes r_NNNN.png, render_log.json (per-frame time, panel scale, camera) and ops/video/proof/cues.json.
"""
import argparse
import json
import os
import sys
import time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image  # noqa: E402

_cap = None


def _init(capture):
    global _cap
    _cap = capture
    import riso, scene_proof
    riso.bank()
    scene_proof.assets(capture)


def _job(args):
    n, out = args
    import scene_proof
    t0 = time.perf_counter()
    A = scene_proof.assets(_cap)
    fr, info = scene_proof.build(n, A)
    img = fr.render()
    Image.fromarray(img).save(os.path.join(out, f'r_{n:04d}.png'), compress_level=1)
    dt = time.perf_counter() - t0
    info = {k: (list(v) if isinstance(v, tuple) else v) for k, v in info.items()}
    return n, dt, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--capture', default=os.path.join(HERE, '..', 'proof', 'capture'))
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'proof', 'render'))
    ap.add_argument('--cues', default=os.path.join(HERE, '..', 'proof', 'cues.json'))
    ap.add_argument('--frames', default='0-299')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--allow-standin', action='store_true')
    a = ap.parse_args()
    cap = os.path.abspath(a.capture)
    standin = os.path.exists(os.path.join(cap, 'STANDIN'))
    if standin and not a.allow_standin:
        sys.exit('refusing: capture dir is a STAND-IN (use --allow-standin for tests)')
    if not standin and not os.path.exists(os.path.join(cap, 'DONE')):
        sys.exit('refusing: capture has no DONE marker yet')
    if standin and os.path.abspath(a.out) == os.path.abspath(os.path.join(HERE, '..', 'proof', 'render')):
        sys.exit('refusing: stand-in renders must not go to proof/render')
    os.makedirs(a.out, exist_ok=True)
    lo, hi = (int(x) for x in a.frames.split('-')) if '-' in a.frames else (int(a.frames), int(a.frames))
    frames = list(range(lo, hi + 1))
    t0 = time.time()
    with Pool(a.workers, initializer=_init, initargs=(cap,)) as pool:
        res = sorted(pool.imap_unordered(_job, [(n, a.out) for n in frames], chunksize=1))
    wall = time.time() - t0
    times = [r[1] for r in res]
    log = dict(capture=cap, standin=standin, frames=len(frames), workers=a.workers, wall_s=round(wall, 2),
               per_frame_mean_s=round(sum(times) / len(times), 3), per_frame_max_s=round(max(times), 3),
               wall_per_frame_s=round(wall / len(frames), 3),
               frames_info={r[0]: dict(t=round(r[1], 3), **r[2]) for r in res})
    json.dump(log, open(os.path.join(a.out, 'render_log.json'), 'w'), indent=1)
    # cues
    import scene_proof
    A = scene_proof.assets(cap)
    cues = scene_proof.cues(A)
    if not standin:
        json.dump(dict(fps=30, frames=300, duration_s=10.0, beat_frames=15, bpm=120,
                       source_capture=os.path.relpath(cap, os.path.join(HERE, '..')), events=cues),
                  open(a.cues, 'w'), indent=1)
    else:
        json.dump(dict(standin=True, events=cues), open(os.path.join(a.out, 'cues_standin.json'), 'w'), indent=1)
    print(f'rendered {len(frames)} frames in {wall:.1f}s wall ({wall / len(frames):.3f}s/frame wall, '
          f'{log["per_frame_mean_s"]}s/frame per worker)')


if __name__ == '__main__':
    main()
