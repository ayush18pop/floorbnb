#!/usr/bin/env python3
"""STAND-IN inputs for engine tests only (never for the final render: every stand-in dir carries a STANDIN file
and render.py refuses them for the output path).

  python3 ops/video/v2/standin.py            -> ops/video/v2/_standin/{capture/<shot>,typo}

Capture stand-ins: solid-colour test panels (2880x1800) with frame counters, grids and fine text rows (to judge
resampling), plus a fake events.json with regions (slider thumb by frame, chips, mouse path).
Typo stand-ins: placeholder type set by PIL in Geist (NOT the typographer's assets), typo.json in the same shape.
"""
import json
import math
import os
import sys
from multiprocessing import Pool

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '_standin')
GEIST = '/home/user/floorbnb/apps/web/node_modules/geist/dist/fonts'
SANS = os.path.join(GEIST, 'geist-sans', 'Geist-Black.ttf')
MONO = os.path.join(GEIST, 'geist-mono', 'GeistMono-Medium.ttf')
SHOTS = {'L1_landing': 190, 'T1_try': 290, 'A1a_builder': 200, 'A1b_review': 90, 'A1c_confirmed': 70,
         'A2a_position': 100, 'A2b_keeper': 100, 'G1_agents': 160}
COLS = {'L1_landing': (230, 210, 190), 'T1_try': (200, 225, 240), 'A1a_builder': (215, 240, 215),
        'A1b_review': (240, 225, 200), 'A1c_confirmed': (225, 215, 245), 'A2a_position': (245, 215, 215),
        'A2b_keeper': (210, 235, 235), 'G1_agents': (235, 235, 205)}


def frame(args):
    shot, k, n = args
    d = os.path.join(OUT, 'capture', shot, 'frames')
    p = os.path.join(d, f'f_{k:04d}.png')
    img = np.full((1800, 2880, 3), COLS[shot][::-1], np.uint8)
    for x in range(0, 2880, 160):
        cv2.line(img, (x, 0), (x, 1799), (120, 120, 120), 2)
    for y in range(0, 1800, 160):
        cv2.line(img, (0, y), (2879, y), (120, 120, 120), 2)
    cv2.putText(img, f'STAND-IN {shot}', (160, 300), cv2.FONT_HERSHEY_DUPLEX, 4.0, (30, 30, 30), 8, cv2.LINE_AA)
    cv2.putText(img, f'k={k:04d}/{n}', (160, 520), cv2.FONT_HERSHEY_DUPLEX, 4.0, (30, 30, 200), 8, cv2.LINE_AA)
    for r in range(8):
        cv2.putText(img, 'The quick brown fox 0123456789 floor 85% backtest', (160, 760 + r * 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9 + 0.1 * r, (20, 20, 20), 2, cv2.LINE_AA)
    # fake slider (thumb moves 90 -> 80 between k30 and k100 on T1, k44..80 on A1a)
    t = 0.0
    if shot == 'T1_try':
        t = min(1, max(0, (k - 30) / 70))
    elif shot == 'A1a_builder':
        t = min(1, max(0, (k - 44) / 36)) * 0.5
    t = 0.5 - 0.5 * math.cos(math.pi * t)
    cv2.rectangle(img, (400, 1400), (1400, 1420), (60, 60, 60), -1)
    tx = int(1300 - 500 * t)
    cv2.rectangle(img, (tx - 24, 1360), (tx + 24, 1460), (200, 60, 30), -1)
    cv2.imwrite(p, img, [cv2.IMWRITE_PNG_COMPRESSION, 1])
    return k


def events(shot, n):
    fd = []
    for k in range(n):
        t = 0.0
        if shot == 'T1_try':
            t = min(1, max(0, (k - 30) / 70))
        elif shot == 'A1a_builder':
            t = min(1, max(0, (k - 44) / 36)) * 0.5
        t = 0.5 - 0.5 * math.cos(math.pi * t)
        tx = (1300 - 500 * t) / 2
        fd.append(dict(i=k, t=round(k / 30, 4), mouse=dict(x=tx, y=705, down=0 < t < 1), click=k in (130, 180),
                       scrollY=0, floor=round(90 - 10 * t) if shot == 'T1_try' else None))
    thumbs = [dict(x=f['mouse']['x'] - 12, y=680, w=24, h=50) for f in fd]
    regions = dict(slider_track=dict(x=200, y=695, w=500, h=20), slider_thumb_by_frame=thumbs,
                   floor_readout=dict(x=820, y=180, w=300, h=80), chart=dict(x=760, y=300, w=600, h=400),
                   crash_chips=dict(x=200, y=800, w=420, h=40), nav_try=dict(x=1100, y=20, w=60, h=30))
    return dict(fps=30, frames=n, viewport=dict(w=1440, h=900, dpr=2), frames_data=fd, regions=regions,
                notes='STAND-IN fake events')


TYPO = [
    # scene, role, text, x, y, size, in, color, anchor
    ('S0', 'headline', 'Set a floor', 96, 150, 200, 40, 'ink', 'card:S0'),
    ('S0', 'headline', 'under your', 96, 350, 200, 60, 'ink', 'card:S0'),
    ('S0', 'headline', 'stocks.', 96, 550, 200, 80, 'cobalt', 'card:S0'),
    ('S0', 'sub', 'Tokenized stocks. Spot swaps. Live on BNB Chain mainnet.', 96, 820, 30, 100, 'ink', 'card:S0'),
    ('C1', 'label', '01 / THE IDEA', 96, 140, 30, 160, 'cobalt', 'card:C1'),
    ('C1', 'headline', 'One rule.', 96, 220, 170, 160, 'ink', 'card:C1'),
    ('C1', 'headline', 'Sell as prices fall.', 96, 420, 170, 180, 'ink', 'card:C1'),
    ('C1', 'headline', 'Buy as they rise.', 96, 620, 170, 200, 'cobalt', 'card:C1'),
    ('L1', 'caption', 'BACKTEST ON PAST DATA, NOT A PREDICTION', 0, 0, 28, 280, 'ink', 'overlay'),
    ('C2', 'label', '02 / TRY IT', 96, 140, 30, 420, 'cobalt', 'card:C2'),
    ('C2', 'headline', 'Drag the floor.', 96, 260, 220, 420, 'ink', 'card:C2'),
    ('C2', 'headline', 'See the past.', 96, 520, 220, 440, 'cobalt', 'card:C2'),
    ('T1', 'caption', 'SIMULATOR · BACKTEST ON PAST DATA, NOT A PREDICTION', 0, 0, 28, 520, 'ink', 'overlay'),
    ('T1', 'callout', 'Drag the floor.', 0, 0, 72, 540, 'ink', 'panel:T1_try:slider_track'),
    ('T1', 'callout', 'Higher floor: less loss, less upside.', 0, 0, 64, 600, 'ink', 'panel:T1_try:floor_readout'),
    ('T1', 'callout', 'Replay a crash.', 0, 0, 72, 640, 'ink', 'panel:T1_try:crash_chips'),
    ('C3', 'label', '03 / SET YOURS', 96, 140, 30, 760, 'cobalt', 'card:C3'),
    ('C3', 'headline', 'A basket. A floor.', 96, 260, 220, 760, 'ink', 'card:C3'),
    ('C3', 'headline', 'A term.', 96, 520, 220, 780, 'cobalt', 'card:C3'),
    ('A1', 'caption', 'EXAMPLE DATA ON SCREEN', 0, 0, 28, 860, 'ink', 'overlay'),
    ('A1', 'callout', 'Pick a basket.', 0, 0, 72, 860, 'ink', 'panel:A1a_builder:basket_picker'),
    ('A1', 'callout', 'Review, then confirm.', 0, 0, 72, 1000, 'ink', 'panel:A1b_review:summary_card'),
    ('C4', 'label', '04 / YOUR OWN VAULT', 96, 140, 30, 1140, 'cobalt', 'card:C4'),
    ('C4', 'headline', 'Your money.', 96, 260, 220, 1140, 'ink', 'card:C4'),
    ('C4', 'headline', 'Your vault.', 96, 500, 220, 1160, 'cobalt', 'card:C4'),
    ('C4', 'sub', 'One vault per position. Only you can exit it.', 96, 820, 30, 1160, 'ink', 'card:C4'),
    ('A2', 'caption', 'EXAMPLE DATA ON SCREEN', 0, 0, 28, 1240, 'ink', 'overlay'),
    ('C5', 'label', '05 / FOR AGENTS', 96, 140, 30, 1380, 'cobalt', 'card:C5'),
    ('C5', 'headline', 'Your agent can', 96, 260, 220, 1380, 'ink', 'card:C5'),
    ('C5', 'headline', 'use it too.', 96, 520, 220, 1400, 'cobalt', 'card:C5'),
    ('G1', 'caption', 'DEVELOPER PREVIEW · EXAMPLE DATA ON SCREEN', 0, 0, 28, 1460, 'ink', 'overlay'),
    ('E1', 'headline', 'A floor is not', 96, 260, 220, 1600, 'ink', 'card:E1'),
    ('E1', 'headline', 'a guarantee.', 96, 520, 220, 1620, 'cobalt', 'card:E1'),
    ('E1', 'sub', 'Price gaps. Delayed sells. Token and contract risk.', 96, 820, 30, 1640, 'ink', 'card:E1'),
    ('E2', 'headline', 'We are live', 96, 260, 200, 1700, 'ink', 'card:E2'),
    ('E2', 'headline', 'on mainnet.', 96, 470, 200, 1720, 'cobalt', 'card:E2'),
    ('E2', 'sub', 'BNB Chain · Launch caps · No human audit', 96, 760, 30, 1740, 'ink', 'card:E2'),
    ('E2', 'sub', 'Factory 0x1147d482fD08DDd7F377838efb610B606B3Ad765', 96, 810, 26, 1740, 'ink', 'card:E2'),
    ('E2', 'sub', 'floor.ayush.works', 96, 860, 26, 1760, 'ink', 'card:E2'),
    ('E2', 'sub', 'App screens in this video show example data.', 96, 940, 22, 1760, 'ink', 'card:E2'),
]
PAL = {'ink': (11, 12, 14), 'cobalt': (36, 64, 224)}


def typo():
    d = os.path.join(OUT, 'typo')
    os.makedirs(d, exist_ok=True)
    assets = []
    stickers = ['coral', 'mint', 'periwinkle', 'cobalt']
    for i, (scene, role, text, x, y, size, fin, color, anchor) in enumerate(TYPO):
        font = ImageFont.truetype(MONO if role in ('label', 'sub', 'caption') else SANS, size * 2)
        l, t, r, b = font.getbbox(text)
        w, h = r - l + 8, b - t + 8
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((4 - l, 4 - t), text, font=font, fill=PAL[color] + (255,))
        fn = f'standin_{i:02d}_{scene}_{role}.png'
        im.save(os.path.join(d, fn))
        a = dict(id=f'{scene}_{role}_{i}', scene=scene, role=role, text=text, file=fn, scale=2,
                 bbox=dict(x=x, y=y, w=w / 2, h=h / 2), **{'in': fin}, anchor=anchor, color=color,
                 font='STAND-IN Geist (placeholder)')
        if role == 'callout':
            a['sticker'] = dict(shape='rect', color=stickers[i % 4])
            a['offset'] = dict(dx=0, dy=-140)
        assets.append(a)
    json.dump(dict(standin=True, scale=2, assets=assets), open(os.path.join(d, 'typo.json'), 'w'), indent=1)
    open(os.path.join(d, 'STANDIN'), 'w').write('placeholder type, not the typographer assets\n')
    open(os.path.join(d, 'DONE'), 'w').close()


def main():
    typo()
    jobs = []
    for shot, n in SHOTS.items():
        d = os.path.join(OUT, 'capture', shot)
        os.makedirs(os.path.join(d, 'frames'), exist_ok=True)
        json.dump(events(shot, n), open(os.path.join(d, 'events.json'), 'w'))
        open(os.path.join(d, 'STANDIN'), 'w').write('solid colour test panels\n')
        open(os.path.join(d, 'DONE'), 'w').close()
        jobs += [(shot, k, n) for k in range(n) if not os.path.exists(os.path.join(d, 'frames', f'f_{k:04d}.png'))]
    with Pool(4) as p:
        p.map(frame, jobs, chunksize=8)
    print('standin ok', len(jobs), 'frames')


if __name__ == '__main__':
    main()
