"""Floor launch video v2 - typography build.

Writes every type asset (2x RGBA PNG), the flat shape layers, typo.json, the contact sheets.
Usage:  python3 ops/video/v2/typo/build_typo.py      (deps: fonttools brotli uharfbuzz pycairo numpy pillow)
Layout unit = 1x frame px of a 1920x1080 card plane. All rasters are 2x (3840x2160 card space).
Words come only from ops/video/SCRIPT.md. Do not add strings here that are not in SCRIPT.md.
"""
import json
import math
import os
import shutil

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from typolib import (SC, PAL, HEX, Layer, font, flat_color, crop_alpha, save_png, pixel_word, halftone,
                     poly, rgbf)
from kern_table import KERN_ANTON

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = HERE
W, H = 1920, 1080
M = 96            # margin
GRID = 12         # baseline grid
BEAT = 20         # 90 BPM at 30 fps
LOCKUP_PNG = os.path.join(HERE, '..', '..', 'riso', 'build', 'assets', 'lockup_640_alpha.png')


def track_for(size):
    """Headline tracking (em) by size: tighter as the type gets bigger."""
    if size >= 300:
        return -0.020
    if size >= 200:
        return -0.015
    if size >= 120:
        return -0.012
    return -0.008


# ============================================================================================ card specs
# A line = list of words; a word wrapped in {} is the pixel-serif accent. 'g' = reveal group index.
# Baselines are absolute (multiples of 12). Groups reveal on the beat frames in 'reveal'.
CARDS = [
    dict(scene='S0', frames=(0, 160), title='Cold open', lockup=dict(x=96, y=96, w=320),
         lines=[dict(t='Set a floor', size=228, base=396, g=0),
                dict(t='under your', size=228, base=636, g=1),
                dict(t='{stocks.}', size=228, base=876, g=2, accent='ink')],
         subs=[dict(id='sub', t='Tokenized stocks. Spot swaps. Live on BNB Chain mainnet.', font='mono500', size=32,
                    base=972, g=3, color='ink'),
               dict(id='sub_cut15', t='Live on BNB Chain mainnet.', font='mono500', size=32, base=972, g=3,
                    color='ink', variant_only='cut15')],
         reveal=[40, 60, 80, 100], lockup_in=20,
         shapes=['floorline_full', 'underline_coral', 'S0_halftone', 'S0_mint', 'S0_pixels']),
    dict(scene='C1', frames=(160, 220), title='Card 01', label='01 / THE IDEA',
         lines=[dict(t='One {rule.}', size=312, base=480, g=0, accent='cobalt'),
                dict(t='Sell as prices fall.', size=168, base=672, g=1),
                dict(t='Buy as they rise.', size=168, base=852, g=1)],
         reveal=[160, 180], shapes=['C1_mint', 'C1_steps', 'C1_floor']),
    dict(scene='C2', frames=(400, 460), title='Card 02', label='02 / TRY IT',
         lines=[dict(t='Drag the floor.', size=264, base=456, g=0),
                dict(t='See the {past.}', size=264, base=732, g=1, accent='cobalt')],
         reveal=[400, 420], shapes=['C2_track', 'C2_thumb', 'C2_halftone']),
    dict(scene='C3', frames=(740, 800), title='Card 03', label='03 / SET YOURS',
         lines=[dict(t='A basket. A {floor.}', size=240, base=456, g=0, accent='cobalt'),
                dict(t='A term.', size=240, base=708, g=1)],
         reveal=[740, 760], shapes=['C3_floor', 'C3_mint', 'C3_peri', 'C3_coral']),
    dict(scene='C4', frames=(1120, 1180), title='Card 04', label='04 / YOUR OWN VAULT',
         lines=[dict(t='Your money.', size=288, base=468, g=0),
                dict(t='Your {vault.}', size=288, base=768, g=1, accent='ink')],
         subs=[dict(id='sub', t='One vault per position. Only you can exit it.', font='mono500', size=32, base=900, g=1,
                    color='ink')],
         reveal=[1120, 1140], shapes=['C4_halftone', 'C4_block', 'C4_key']),
    dict(scene='C5', frames=(1360, 1420), title='Card 05', label='05 / FOR AGENTS',
         lines=[dict(t='Your {agent} can', size=252, base=456, g=0, accent='cobalt'),
                dict(t='use it too.', size=252, base=720, g=1)],
         reveal=[1360, 1380], shapes=['C5_halftone', 'C5_coral', 'C5_pixels']),
    dict(scene='E1', frames=(1580, 1680), title='Honest card',
         lines=[dict(t='A floor is not', size=264, base=420, g=0),
                dict(t='a {guarantee.}', size=264, base=696, g=1, accent='ink')],
         subs=[dict(id='sub', t='Price gaps. Delayed sells. Token and contract risk.', font='mono500', size=32, base=864,
                    g=2, color='ink')],
         reveal=[1580, 1600, 1620], shapes=['E1_floor_broken', 'E1_coral', 'E1_halftone']),
    dict(scene='E2', frames=(1680, 1800), title='End card', lockup=dict(x=96, y=660, w=320),
         lines=[dict(t='We are live', size=240, base=312, g=0),
                dict(t='on {mainnet.}', size=240, base=564, g=1, accent='cobalt')],
         subs=[dict(id='factory', t='Factory 0x1147d482fD08DDd7F377838efb610B606B3Ad765', font='mono500', size=30,
                    base=792, g=2, color='ink', features={'kern': True, 'ss09': True}),
               dict(id='url', t='floor.ayush.works', font='mono500', size=30, base=840, g=2, color='cobalt'),
               dict(id='mono', t='BNB Chain · Launch caps · No human audit', font='mono500', size=30, base=900, g=2,
                    color='ink'),
               dict(id='small', t='App screens in this video show example data.', font='mono400', size=26, base=948,
                    g=2, color='ink')],
         reveal=[1680, 1700, 1740], lockup_in=1720,
         shapes=['floorline_full', 'underline_mint', 'E2_pixels']),
]

# Callouts: SCRIPT.md words, line breaks only at sentence/clause boundaries (allowed by the brief).
# anchor offsets are CSS px of the capture viewport (region space, 1440x900), measured from the named
# region edge given by 'side'. size_frame_px assumes the panel face-on at ~0.93 frame px per CSS px.
CALLOUTS = [
    dict(id='T1_drag', scene='T1', text='Drag the floor.', lines=['Drag the floor.'], color='coral', shadow='cobalt',
         angle=-1.6, inf=480, outf=600, anchor='panel:T1_try:slider_thumb_by_frame', side='below',
         offset=(-40, 56), arrow='up', sync='capture T1_try k30 mouse down (drag 90 -> 80 runs k30-100)'),
    dict(id='T1_tradeoff', scene='T1', text='Higher floor: less loss, less upside.',
         lines=['Higher floor:', 'less loss, less upside.'], color='periwinkle', shadow='ink', angle=1.2, inf=540,
         outf=640, anchor='panel:T1_try:floor_readout', side='right', offset=(48, -24), arrow='left',
         sync='after drag ends (capture k100)'),
    dict(id='T1_crash', scene='T1', text='Replay a crash.', lines=['Replay a crash.'], color='mint', shadow='cobalt',
         angle=-1.0, inf=620, outf=720, anchor='panel:T1_try:crash_chips', side='above', offset=(0, -40),
         arrow='down', sync='capture k155 click COVID crash, k230 click 2022 bear market'),
    dict(id='A1_basket', scene='A1', text='Pick a basket.', lines=['Pick a basket.'], color='mint', shadow='cobalt',
         angle=-1.4, inf=820, outf=880, anchor='panel:A1a_builder:basket_picker', side='left', offset=(-48, -8),
         arrow='right', sync='capture A1a k26 click QQQB'),
    dict(id='A1_floor', scene='A1', text='Set the floor.', lines=['Set the floor.'], color='coral', shadow='cobalt',
         angle=1.0, inf=880, outf=940, anchor='panel:A1a_builder:floor_slider', side='left', offset=(-48, 0),
         arrow='right', sync='capture A1a k44-80 drag to 85'),
    dict(id='A1_term', scene='A1', text='Pick a term.', lines=['Pick a term.'], color='periwinkle', shadow='ink',
         angle=-0.8, inf=940, outf=1000, anchor='panel:A1a_builder:term_picker', side='left', offset=(-48, 0),
         arrow='right', sync='capture A1a k96 click 6 months'),
    dict(id='A1_review', scene='A1', text='Review, then confirm.', lines=['Review, then confirm.'], color='coral',
         shadow='ink', angle=1.4, inf=1000, outf=1100, anchor='panel:A1b_review:confirm_button', side='below',
         offset=(-200, 56), arrow='up', sync='A1a k150 click Review; A1b confirm click'),
    dict(id='A2_tiles', scene='A2', text='Value. Floor. Cushion.', lines=['Value. Floor. Cushion.'],
         color='periwinkle', shadow='cobalt', angle=-1.2, inf=1200, outf=1280, anchor='panel:A2a_position:tiles',
         side='above', offset=(0, -48), arrow='down', sync='capture A2a k12-72 glide value, floor, cushion'),
    dict(id='A2_keeper', scene='A2', text='A keeper rebalances. Spot swaps only.',
         lines=['A keeper rebalances.', 'Spot swaps only.'], color='mint', shadow='cobalt', angle=1.0, inf=1280,
         outf=1360, anchor='panel:A2b_keeper:keeper_log_table', side='above', offset=(48, -48), arrow='down',
         sync='capture A2b k2 keeper page arrives'),
    dict(id='G1_mcp', scene='G1', text='MCP tools. Unsigned transactions.', lines=['MCP tools.', 'Unsigned transactions.'],
         color='coral', shadow='cobalt', angle=-1.2, inf=1440, outf=1560, anchor='panel:G1_agents:tool_list',
         side='right', offset=(48, 0), arrow='left', sync='G1 tool list on screen'),
]

CAPTIONS = [
    dict(id='cap_L1', scene='L1', text='BACKTEST ON PAST DATA, NOT A PREDICTION', inf=220, outf=400,
         note='visible while any chart shows; held for the whole landing shot'),
    dict(id='cap_T1', scene='T1', text='SIMULATOR · BACKTEST ON PAST DATA, NOT A PREDICTION', inf=460, outf=740),
    dict(id='cap_A1', scene='A1', text='EXAMPLE DATA ON SCREEN', inf=800, outf=1120),
    dict(id='cap_A2', scene='A2', text='EXAMPLE DATA ON SCREEN', inf=1180, outf=1360),
    dict(id='cap_G1', scene='G1', text='DEVELOPER PREVIEW · EXAMPLE DATA ON SCREEN', inf=1420, outf=1580),
]

# ============================================================================================ type setting
_hang_cache = {}


def left_hang(fnt, g):
    """Optical left-margin hang (em) of a glyph: 0.3 x its mean left-profile inset over its ink rows,
    capped at 0.025 em (rounds and diagonals hang slightly, straight stems sit on the margin)."""
    key = (fnt.path, g)
    if key in _hang_cache:
        return _hang_cache[key]
    import cairo
    S, Wd, Hd, base = 400, 700, 800, 600
    surf = cairo.ImageSurface(cairo.FORMAT_A8, Wd, Hd)
    c = cairo.Context(surf)
    fnt.draw(c, [{'g': g, 'x': 0}], 100, base, S, s=1)
    surf.flush()
    a = np.ndarray((Hd, surf.get_stride()), np.uint8, surf.get_data())[:, :Wd] > 127
    rows = [r for r in a[:base] if r.any()]
    L = np.array([np.argmax(r) for r in rows], float)
    inset = (L - L.min()).mean() / S
    h = float(min(0.3 * inset, 0.025))
    _hang_cache[key] = h
    return h


def set_line(line, x_margin=M):
    """Typeset one headline line. Returns dict(ops, words, ink) where ops are drawing operations."""
    A = font('anton')
    size = line['size']
    tr = track_for(size)
    raw = line['t']
    words = raw.split(' ')
    plain = raw.replace('{', '').replace('}', '')
    glyphs, adv = A.shape(plain, size, tracking=tr, kern=KERN_ANTON)
    # map glyphs to words by cluster index
    starts, pos = [], 0
    for w in words:
        clean = w.strip('{}')
        starts.append((pos, pos + len(clean)))
        pos += len(clean) + 1
    s = size / A.upem
    winfo = []
    for wi, (a0, a1) in enumerate(starts):
        gl = [g for g in glyphs if a0 <= g['i'] < a1]
        x0, x1 = A.ink_x(gl, size)
        winfo.append(dict(text=words[wi].strip('{}'), accent=words[wi].startswith('{'), glyphs=gl, ink=(x0, x1)))
    # optical margin: put the first glyph's ink edge on the margin, minus its hang
    first = winfo[0]
    if first['accent']:
        origin = x_margin  # handled after the pixel raster is built
    else:
        g0 = first['glyphs'][0]
        b = A.bounds(g0['g'])
        origin = x_margin - (g0['x'] + b[0] * s) - left_hang(A, g0['g']) * size
    ops, out_words, shift = [], [], 0.0
    xh = A.xh * size
    for wi, w in enumerate(winfo):
        if w['accent']:
            rgba, info = pixel_word(w['text'], xh * 0.84, color=line.get('accent', 'cobalt'))
            ink_w = (info['ink_right'] - info['ink_left']) / SC
            if wi == 0:
                ink_left = x_margin - 0.35 * info['block'] / SC          # italic s/a hang a touch
            else:
                prev = winfo[wi - 1]
                gap = w['ink'][0] - prev['ink'][1]                     # the Anton word gap it replaces
                ink_left = origin + prev['ink'][1] + shift + gap * 1.05
            X2 = int(round(ink_left * SC)) - info['ink_left']
            Y2 = int(round(line['base'] * SC)) - info['base_row']
            ops.append(dict(kind='pixel', rgba=rgba, X2=X2, Y2=Y2))
            new_right = ink_left + ink_w
            old_right = origin + w['ink'][1] + shift
            top = (Y2 + info['ink_top']) / SC
            bot = (Y2 + info['ink_bottom']) / SC
            out_words.append(dict(text=w['text'], accent=True, color=line.get('accent', 'cobalt'),
                                  bbox=[round(ink_left, 1), round(top, 1), round(ink_w, 1), round(bot - top, 1)],
                                  block_px_2x=info['block'], serif_size_px=round(info['serif_size_px'], 1)))
            if wi == 0:
                origin = new_right - w['ink'][1]   # following words continue after the accent
                shift = 0.0
            else:
                shift += new_right - old_right
        else:
            ops.append(dict(kind='anton', glyphs=w['glyphs'], ox=origin + shift, base=line['base'], size=size))
            t, bt = A.ink_y(w['glyphs'], size)
            x0, x1 = w['ink']
            out_words.append(dict(text=w['text'], accent=False, color='ink',
                                  bbox=[round(origin + shift + x0, 1), round(line['base'] + t, 1),
                                        round(x1 - x0, 1), round(bt - t, 1)]))
    xs = [w['bbox'][0] for w in out_words] + [w['bbox'][0] + w['bbox'][2] for w in out_words]
    return dict(ops=ops, words=out_words, ink_x=(min(xs), max(xs)), tracking=tr)


def render_ops(ops, canvas=None):
    """Render ops into a full-card 2x RGBA array."""
    L = Layer(W, H)
    c = L.ctx
    c.set_source_rgb(*rgbf('ink'))
    for op in ops:
        if op['kind'] == 'anton':
            font('anton').draw(c, op['glyphs'], op['ox'], op['base'], op['size'])
    rgba = flat_color(L.rgba(), 'ink')
    for op in ops:
        if op['kind'] == 'pixel':
            paste(rgba, op['rgba'], op['X2'], op['Y2'])
    return rgba


def paste(dst, src, X, Y):
    h, w = src.shape[:2]
    x0, y0 = max(0, X), max(0, Y)
    x1, y1 = min(dst.shape[1], X + w), min(dst.shape[0], Y + h)
    if x1 <= x0 or y1 <= y0:
        raise ValueError('paste out of canvas')
    s = src[y0 - Y:y1 - Y, x0 - X:x1 - X].astype(np.float32)
    d = dst[y0:y1, x0:x1].astype(np.float32)
    sa = s[..., 3:4] / 255.0
    da = d[..., 3:4] / 255.0
    oa = sa + da * (1 - sa)
    rgb = (s[..., :3] * sa + d[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    dst[y0:y1, x0:x1] = np.concatenate([rgb, oa * 255], -1).round().astype(np.uint8)


def set_mono(text, fkey, size, x, base, color, tracking=0.0, features=None):
    f = font(fkey)
    gl, adv = f.shape(text, size, tracking=tracking, features=features)
    g0 = gl[0]
    b = f.bounds(g0['g'])
    ox = x - b[0] * size / f.upem          # ink edge on the margin
    words, pos = [], 0
    for w in text.split(' '):
        sub = [g for g in gl if pos <= g['i'] < pos + len(w)]
        pos += len(w) + 1
        if not sub or not any(f.bounds(g['g']) for g in sub):
            continue
        x0, x1 = f.ink_x(sub, size)
        t, bt = f.ink_y(sub, size)
        words.append(dict(text=w, bbox=[round(ox + x0, 1), round(base + t, 1), round(x1 - x0, 1), round(bt - t, 1)]))
    return dict(f=f, glyphs=gl, ox=ox, base=base, size=size, color=color, words=words, adv=adv)


def render_mono(m, L=None):
    L = L or Layer(W, H)
    L.ctx.set_source_rgb(*rgbf(m['color']))
    m['f'].draw(L.ctx, m['glyphs'], m['ox'], m['base'], m['size'])
    return L


def save_layer(rgba_full, relpath, pad=4):
    """Crop a full-card 2x layer, save, return bbox in 1x card px."""
    cr, X0, Y0 = crop_alpha(rgba_full, pad)
    save_png(cr, os.path.join(OUT, relpath))
    return [X0 / SC, Y0 / SC, cr.shape[1] / SC, cr.shape[0] / SC], cr


# ============================================================================================ shapes
def ht(w, h, color, x=0, y=0, **kw):
    L = halftone(w, h, color, x=x, y=y, **kw)
    full = np.zeros((H * SC, W * SC, 4), np.uint8)
    a = L.rgba()
    full[int(y * SC):int(y * SC) + a.shape[0], int(x * SC):int(x * SC) + a.shape[1]] = a
    return full


def shape_layer(name, ctx_info):
    """Return (rgba 2x full card, color, desc) for a named flat shape."""
    L = Layer(W, H)
    c = L.ctx
    col = None
    desc = ''
    info = ctx_info
    if name == 'floorline_full':
        col = 'cobalt'
        y = info.get('floor_y', 1002)
        c.rectangle(0, y * SC, W * SC, 6 * SC)
        c.set_source_rgb(*rgbf(col)); c.fill()
        desc = f'cobalt floor line, full bleed, y {y}-{y + 6}; draws left to right'
    elif name in ('underline_coral', 'underline_mint'):
        col = 'coral' if 'coral' in name else 'mint'
        x0, x1, y = info['ul']
        c.rectangle(x0 * SC, y * SC, (x1 - x0) * SC, 18 * SC)
        c.set_source_rgb(*rgbf(col)); c.fill()
        desc = f'{col} underline bar under the accent word (18 px), wipes left to right on the accent beat'
    elif name == 'S0_halftone':
        return ht(456, 552, 'periwinkle', x=1272, y=204), 'periwinkle', 'periwinkle halftone panel (45 deg, 12 px pitch)'
    elif name == 'S0_mint':
        col = 'mint'; c.rectangle(1200 * SC, 660 * SC, 216 * SC, 192 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'mint block overlapping the halftone panel'
    elif name in ('S0_pixels', 'E2_pixels', 'C5_pixels'):
        col = {'S0_pixels': 'coral', 'E2_pixels': 'coral', 'C5_pixels': 'mint'}[name]
        ox, oy = {'S0_pixels': (1704, 168), 'E2_pixels': (1704, 600), 'C5_pixels': (1656, 168)}[name]
        cells = [(0, 1), (1, 0), (1, 2), (2, 1), (3, 0)] if name != 'C5_pixels' else [(0, 0), (1, 1), (2, 0), (2, 2), (3, 1)]
        for i, j in cells:
            c.rectangle((ox + i * 24) * SC, (oy + j * 24) * SC, 24 * SC, 24 * SC)
        c.set_source_rgb(*rgbf(col)); c.fill()
        desc = f'{col} pixel squares (24 px cells)'
    elif name == 'C1_mint':
        col = 'mint'; c.rectangle(1536 * SC, 0, 384 * SC, 420 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'mint block bleeding off the top right'
    elif name == 'C1_steps':
        col = 'cobalt'
        pts = [(1392, 600), (1464, 600), (1464, 672), (1536, 672), (1536, 744), (1608, 744), (1608, 792),
               (1680, 792), (1680, 720), (1752, 720), (1752, 648), (1824, 648)]
        c.set_line_width(12 * SC); c.set_line_join(0); c.set_line_cap(0)
        c.move_to(pts[0][0] * SC, pts[0][1] * SC)
        for p in pts[1:]:
            c.line_to(p[0] * SC, p[1] * SC)
        c.set_source_rgb(*rgbf(col)); c.stroke()
        desc = 'cobalt stepped price path: falls, rests above the floor, rises'
    elif name == 'C1_floor':
        col = 'ink'; c.rectangle(1392 * SC, 852 * SC, 432 * SC, 6 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'ink floor rule under the steps, on the last baseline'
    elif name == 'C2_track':
        col = 'coral'; c.rectangle(96 * SC, 888 * SC, 1248 * SC, 12 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'coral slider track bar'
    elif name == 'C2_thumb':
        col = 'cobalt'; c.rectangle(1032 * SC, 858 * SC, 48 * SC, 72 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'cobalt slider thumb on the track (may slide left on the "Drag" beat)'
    elif name == 'C2_halftone':
        return ht(384, 216, 'periwinkle', x=1440, y=816), 'periwinkle', 'periwinkle halftone panel, bottom right'
    elif name == 'C3_floor':
        col = 'cobalt'; c.rectangle(912 * SC, 708 * SC, 912 * SC, 6 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'cobalt floor line on the baseline of "A term."'
    elif name == 'C3_mint':
        col = 'mint'; c.rectangle(1056 * SC, 552 * SC, 144 * SC, 156 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'mint token block resting on the floor line'
    elif name == 'C3_peri':
        return ht(144, 108, 'periwinkle', x=1272, y=600, pitch=10, radius=3.4), 'periwinkle', 'periwinkle halftone token block'
    elif name == 'C3_coral':
        col = 'coral'; c.rectangle(1488 * SC, 576 * SC, 144 * SC, 132 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'coral token block resting on the floor line'
    elif name == 'C4_halftone':
        return ht(216, 672, 'periwinkle', x=1644, y=132), 'periwinkle', 'periwinkle halftone offset behind the vault block'
    elif name == 'C4_block':
        col = 'cobalt'; c.rectangle(1608 * SC, 96 * SC, 216 * SC, 672 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'cobalt vault block, top margin to the last baseline'
    elif name == 'C4_key':
        col = 'mint'; c.rectangle(1680 * SC, 396 * SC, 72 * SC, 72 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'mint square on the vault block'
    elif name == 'C5_halftone':
        return ht(576, 216, 'periwinkle', x=1200, y=744), 'periwinkle', 'periwinkle halftone panel (offset under the coral block)'
    elif name == 'C5_coral':
        col = 'coral'; c.rectangle(1248 * SC, 792 * SC, 576 * SC, 144 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'coral block, bottom right'
    elif name == 'E1_floor_broken':
        col = 'cobalt'
        c.rectangle(0, 924 * SC, 1152 * SC, 6 * SC)
        c.rectangle(1296 * SC, 948 * SC, (W - 1296) * SC, 6 * SC)
        c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'cobalt floor line with a gap and a step down (a price gap)'
    elif name == 'E1_coral':
        col = 'coral'; c.rectangle(1584 * SC, 0, 240 * SC, 228 * SC); c.set_source_rgb(*rgbf(col)); c.fill()
        desc = 'coral block hanging from the top edge'
    elif name == 'E1_halftone':
        return ht(480, 120, 'ink', x=1344, y=792, pitch=12, radius=2.6), 'ink', 'ink halftone strip (45 deg screen)'
    else:
        raise KeyError(name)
    return flat_color(L.rgba(), col), col, desc


# ============================================================================================ cards
def build_card(card):
    sc = card['scene']
    d = os.path.join('cards', sc)
    shutil.rmtree(os.path.join(OUT, d), ignore_errors=True)
    assets, full_type = [], np.zeros((H * SC, W * SC, 4), np.uint8)
    reveal = card['reveal']
    fin, fout = card['frames']
    info = {}
    # label
    if card.get('label'):
        m = set_mono(card['label'], 'mono500', 30, M, 144, 'cobalt', tracking=0.08)
        L = render_mono(m)
        L.ctx.rectangle(M * SC, 96 * SC, 288 * SC, 3 * SC)
        L.ctx.fill()
        rgba = flat_color(L.rgba(), 'cobalt')
        bbox, _ = save_layer(rgba, f'{d}/{sc}_label.png')
        paste(full_type, rgba, 0, 0)
        assets.append(dict(id=f'{sc}_label', scene=sc, role='label', text=card['label'], font='Geist Mono Medium',
                           size_px=30, tracking_em=0.08, color='cobalt', file=f'{d}/{sc}_label.png', bbox=bbox,
                           baseline=144, rule=dict(x=M, y=96, w=288, h=3, color='cobalt'), word_boxes=m['words'],
                           **timing(reveal[0], fout, 'with the card (beat 0)')))
    # headline lines -> groups
    groups = {}
    for li, line in enumerate(card['lines']):
        r = set_line(line)
        line['_r'] = r
        groups.setdefault(line['g'], []).append((li, line, r))
        for w in r['words']:
            if w['accent']:
                info['ul'] = (w['bbox'][0], w['bbox'][0] + w['bbox'][2], line['base'] + 24)
    for g, items in sorted(groups.items()):
        ops = [op for _, _, r in items for op in r['ops']]
        rgba = render_ops(ops)
        gid = f'{sc}_h{g}'
        bbox, _ = save_layer(rgba, f'{d}/{gid}.png')
        paste(full_type, rgba, 0, 0)
        text = ' / '.join(l['t'].replace('{', '').replace('}', '') for _, l, _ in items)
        acc = [w['text'] for _, _, r in items for w in r['words'] if w['accent']]
        assets.append(dict(
            id=gid, scene=sc, role='headline', text=text, font='Anton Regular' + (' + pixel Instrument Serif Italic' if acc else ''),
            size_px=items[0][1]['size'], tracking_em=items[0][2]['tracking'], color='ink',
            accent=(dict(word=acc[0], color=items[0][1].get('accent'), style='pixel serif italic') if acc else None),
            file=f'{d}/{gid}.png', bbox=bbox,
            lines=[dict(text=l['t'].replace('{', '').replace('}', ''), baseline=l['base'], size_px=l['size'],
                        leading_px=None, ink_x=[round(r['ink_x'][0], 1), round(r['ink_x'][1], 1)]) for _, l, r in items],
            word_boxes=[w for _, _, r in items for w in r['words']],
            **timing(reveal[g], fout, f'word group {g + 1}: hard cut on beat {reveal[g] // BEAT}')))
    # leading info
    ls = card['lines']
    for a in assets:
        for ln in a.get('lines', []):
            idx = [l['t'].replace('{', '').replace('}', '') for l in ls].index(ln['text'])
            if idx > 0:
                ln['leading_px'] = ls[idx]['base'] - ls[idx - 1]['base']
    # subs
    for sub in card.get('subs', []):
        m = set_mono(sub['t'], sub['font'], sub['size'], M, sub['base'], sub['color'], features=sub.get('features'))
        rgba = flat_color(render_mono(m).rgba(), sub['color'])
        sid = f"{sc}_{sub['id']}"
        bbox, _ = save_layer(rgba, f'{d}/{sid}.png')
        assets.append(dict(id=sid, scene=sc, role='sub', text=sub['t'],
                           font='Geist Mono ' + ('Medium' if sub['font'] == 'mono500' else 'Regular'),
                           size_px=sub['size'], tracking_em=0, color=sub['color'], file=f'{d}/{sid}.png', bbox=bbox,
                           baseline=sub['base'], word_boxes=m['words'], opentype_features=sub.get('features'),
                           variant_only=sub.get('variant_only'),
                           **timing(reveal[sub['g']], fout, f"appears on beat {reveal[sub['g']] // BEAT}")))
        if not sub.get('variant_only'):
            paste(full_type, rgba, 0, 0)
    # whole-card type composite
    type_all_bbox, _ = save_layer(full_type, f'{d}/{sc}_type_all.png', pad=0)
    # shapes
    shape_assets = []
    for nm in card['shapes']:
        rgba, col, desc = shape_layer(nm, info)
        fn = f'shapes/{sc}_{nm}.png'
        bbox, _ = save_layer(rgba, fn, pad=0)
        shape_assets.append(dict(id=f'{sc}_{nm}', scene=sc, role='shape', color=col, desc=desc, file=fn, bbox=bbox,
                                 z='behind type', **timing(fin, fout, shape_reveal(nm, card))))
    lockup = None
    if card.get('lockup'):
        lk = card['lockup']
        lockup = dict(file='design/logo/floor-lockup-light.svg (repo file, unmodified, scaled uniformly)',
                      x=lk['x'], y=lk['y'], w=lk['w'], h=round(lk['w'] * 36 / 179, 2),
                      clear_space_px=round(lk['w'] * 36 / 179 / 2, 1), stamp_frame=card['lockup_in'],
                      note='no misregistration, halftone or blur on the lockup (BRAND.md)')
    return dict(scene=sc, title=card['title'], frames=list(card['frames']), _type_all_bbox=type_all_bbox,
                plane=dict(w=W, h=H, paper=HEX['paper'], asset_scale=SC), type_all=f'{d}/{sc}_type_all.png',
                lockup=lockup, assets=assets, shapes=shape_assets)


def shape_reveal(nm, card):
    if nm == 'floorline_full':
        return 'draws left to right over the first beat of the card' if card['scene'] == 'S0' else 'present when the card arrives'
    if nm.startswith('underline'):
        g = [l['g'] for l in card['lines'] if '{' in l['t']][0]
        return f'wipes in left to right on frame {card["reveal"][g]} + 4'
    return 'present with the card plane (the paper already carries it)'


def timing(inf, outf, rule):
    return {'in': inf, 'out': outf, 'hold_frames': outf - inf, 'hold_s': round((outf - inf) / 30, 3),
            'in_beat': inf / BEAT, 'reveal': rule}


# ============================================================================================ callouts
STICK_SIZE = 72
STICK_LEAD = 80


def build_callout(co):
    A = font('anton')
    size = STICK_SIZE
    tr = track_for(size)
    padx, padt, padb = 28, 24, 26
    runs, widths = [], []
    for t in co['lines']:
        g, adv = A.shape(t, size, tracking=tr, kern=KERN_ANTON)
        x0, x1 = A.ink_x(g, size)
        runs.append((g, x0, x1))
        widths.append(x1 - x0)
    cap = A.cap * size
    tw = max(widths)
    nl = len(co['lines'])
    sw = tw + 2 * padx
    sh = padt + cap + (nl - 1) * STICK_LEAD + padb
    shadow = 12
    margin = 24
    cw, ch = sw + shadow + 2 * margin, sh + shadow + 2 * margin
    ang = math.radians(co['angle'])
    cx, cy = margin + sw / 2, margin + sh / 2

    # deterministic paper-cut jitter on the corners (2-5 px), never a perfect rectangle
    rs = np.random.RandomState(sum(ord(ch) * 131 ** i for i, ch in enumerate(co['id'])) % (2 ** 31))
    jit = rs.uniform(-4, 4, (4, 2))
    corners = [(margin, margin), (margin + sw, margin), (margin + sw, margin + sh), (margin, margin + sh)]
    corners = [(x + j[0], y + j[1]) for (x, y), j in zip(corners, jit)]

    def rot(p, dx=0, dy=0):
        x, y = p[0] - cx, p[1] - cy
        return (cx + x * math.cos(ang) - y * math.sin(ang) + dx, cy + x * math.sin(ang) + y * math.cos(ang) + dy)

    layers = {}
    Ls = Layer(cw, ch)
    poly(Ls.ctx, [rot(p, shadow, shadow) for p in corners])
    Ls.ctx.set_source_rgb(*rgbf(co['shadow'])); Ls.ctx.fill()
    layers['shadow'] = flat_color(Ls.rgba(), co['shadow'])
    Lp = Layer(cw, ch)
    poly(Lp.ctx, [rot(p) for p in corners])
    Lp.ctx.set_source_rgb(*rgbf(co['color'])); Lp.ctx.fill()
    layers['sticker'] = flat_color(Lp.rgba(), co['color'])
    Lt = Layer(cw, ch)
    c = Lt.ctx
    c.translate(cx * SC, cy * SC); c.rotate(ang); c.translate(-cx * SC, -cy * SC)
    c.set_source_rgb(*rgbf('ink'))
    wboxes = []
    for i, (g, x0, x1) in enumerate(runs):
        base = margin + padt + cap + i * STICK_LEAD
        ox = margin + padx - x0
        A.draw(c, g, ox, base, size)
        # word boxes (unrotated, local sticker coords) for reveals
        pos = 0
        t = co['lines'][i]
        for w in t.split(' '):
            sub = [q for q in g if pos <= q['i'] < pos + len(w)]
            pos += len(w) + 1
            a0, a1 = A.ink_x(sub, size)
            tt, bb = A.ink_y(sub, size)
            wboxes.append(dict(text=w, bbox_unrotated=[round(ox + a0, 1), round(base + tt, 1), round(a1 - a0, 1), round(bb - tt, 1)]))
    layers['text'] = flat_color(Lt.rgba(), 'ink')
    d = f"callouts/{co['id']}"
    files = {}
    for k, v in layers.items():
        save_png(v, os.path.join(OUT, d, f"{co['id']}_{k}.png"))
        files[k] = f"{d}/{co['id']}_{k}.png"
    # arrow: tail attaches to the sticker edge facing the target
    arrow_file, tip, tail = build_arrow(co, d)
    edge = {'left': (margin, cy), 'right': (margin + sw, cy), 'up': (cx, margin), 'down': (cx, margin + sh)}
    # arrow points from the sticker toward the target: 'right' arrow leaves the right edge, etc.
    attach = rot(edge[co['arrow']])
    comp = sum(layers[k].astype(np.float32) * 0 for k in layers)  # placeholder (sheet composes itself)
    return dict(id=co['id'], scene=co['scene'], role='callout', text=co['text'], lines=co['lines'],
                font='Anton Regular', size_px=size, leading_px=STICK_LEAD if nl > 1 else None, tracking_em=tr,
                color='ink', sticker=dict(color=co['color'], hex=HEX[co['color']], shadow_color=co['shadow'],
                                          shadow_offset_px=[shadow, shadow], angle_deg=co['angle'],
                                          corners=[[round(x, 1), round(y, 1)] for x, y in (rot(p) for p in corners)]),
                files=files, canvas_px=[round(cw, 1), round(ch, 1)], canvas_2x=list(layers['text'].shape[1::-1]),
                layer_order=['shadow', 'sticker', 'text'],
                misregistration='apply 1-3 px drift to shadow and sticker (colour layers); text layer stays registered or drifts <= 1 px',
                word_boxes=wboxes, arrow=dict(file=arrow_file, direction=co['arrow'], tail_px=tail, tip_px=tip,
                                              attach_at_canvas_px=[round(attach[0], 1), round(attach[1], 1)],
                                              color='ink'),
                anchor=co['anchor'], side=co['side'], offset_css_px=list(co['offset']),
                offset_rule=('offset is from the region edge named by side (below: bottom edge, above: top edge, '
                             'left: left edge, right: right edge) to the nearest sticker edge, in capture CSS px; '
                             'the arrow tip lands on that region edge, the sticker never covers the region'),
                sync=co['sync'], **timing(co['inf'], co['outf'],
                                          'sticker cuts in on the in-beat (shadow first, sticker+text 2 frames later), '
                                          'arrow on the next beat; whole sticker cuts out on the out-beat'))


def build_arrow(co, d):
    """Flat ink arrow: 10 px shaft, 36x30 head, 108 px long, pointing in co['arrow'] direction."""
    ln, sh, hw, hl = 108, 10, 36, 30
    pad = 8
    if co['arrow'] in ('left', 'right'):
        cw, ch = ln + 2 * pad, hw + 2 * pad
    else:
        cw, ch = hw + 2 * pad, ln + 2 * pad
    L = Layer(cw, ch)
    # build pointing right then rotate
    pts = [(0, -sh / 2), (ln - hl, -sh / 2), (ln - hl, -hw / 2), (ln, 0), (ln - hl, hw / 2), (ln - hl, sh / 2), (0, sh / 2)]
    rotm = {'right': (1, 0, 0, 1), 'left': (-1, 0, 0, -1), 'down': (0, -1, 1, 0), 'up': (0, 1, -1, 0)}[co['arrow']]
    a, b, c_, e = rotm
    tf = lambda p: (p[0] * a + p[1] * b, p[0] * c_ + p[1] * e)
    P = [tf(p) for p in pts]
    mx, my = min(p[0] for p in P), min(p[1] for p in P)
    P = [(x - mx + pad, y - my + pad) for x, y in P]
    poly(L.ctx, P)
    L.ctx.set_source_rgb(*rgbf('ink')); L.ctx.fill()
    fn = f"{d}/{co['id']}_arrow.png"
    save_png(flat_color(L.rgba(), 'ink'), os.path.join(OUT, fn))
    tip = tf((ln, 0)); tail = tf((0, 0))
    return fn, [round(tip[0] - mx + pad, 1), round(tip[1] - my + pad, 1)], [round(tail[0] - mx + pad, 1), round(tail[1] - my + pad, 1)]


# ============================================================================================ captions
def build_caption(cp):
    size, tr = 28, 0.06
    f = font('mono500')
    gl, adv = f.shape(cp['text'], size, tracking=tr)
    x0, x1 = f.ink_x(gl, size)
    padx, h = 20, 48
    w = (x1 - x0) + 2 * padx
    w = math.ceil(w / 4) * 4
    L = Layer(w, h)
    c = L.ctx
    c.rectangle(0, 0, w * SC, h * SC); c.set_source_rgb(*rgbf('paper')); c.fill()
    k = 2  # keyline 2 px ink
    c.rectangle(0, 0, w * SC, h * SC); c.rectangle(k * SC, (h - k) * SC, (w - 2 * k) * SC, -(h - 2 * k) * SC)
    c.set_fill_rule(1); c.set_source_rgb(*rgbf('ink')); c.fill(); c.set_fill_rule(0)
    chip = L.rgba()
    T = Layer(w, h)
    cap = f.cap * size
    base = (h + cap) / 2
    T.ctx.set_source_rgb(*rgbf('ink'))
    f.draw(T.ctx, gl, padx - x0 + ((w - 2 * padx) - (x1 - x0)) / 2, base, size)
    text = flat_color(T.rgba(), 'ink')
    merged = chip.copy()
    paste(merged, text, 0, 0)
    d = 'captions'
    save_png(merged, os.path.join(OUT, d, f"{cp['id']}.png"))
    save_png(text, os.path.join(OUT, d, f"{cp['id']}_text.png"))
    save_png(chip, os.path.join(OUT, d, f"{cp['id']}_chip.png"))
    return dict(id=cp['id'], scene=cp['scene'], role='caption', text=cp['text'], font='Geist Mono Medium', size_px=size,
                tracking_em=tr, color='ink', chip=dict(fill='paper', keyline_px=2, keyline_color='ink', h=h, w=w),
                files=dict(merged=f"{d}/{cp['id']}.png", text=f"{d}/{cp['id']}_text.png", chip=f"{d}/{cp['id']}_chip.png"),
                size_frame_px=[w, h], baseline_in_chip=round(base, 1),
                anchor='screen:lower_left', offset_frame_px=[96, 1080 - 96 - h],
                anchor_alt=f"panel:{cp['scene']}:frame below-left, offset (0, +24) CSS px under the panel's bottom edge",
                rule='screen-space lower third (x 96, chip bottom on the 984 margin); never over UI text that must be read: '
                     'if the panel bottom edge projects below y 920, move the chip to the top margin (y 96)',
                note=cp.get('note', ''), **timing(cp['inf'], cp['outf'], 'cuts in on the scene beat, holds the whole shot'))


# ============================================================================================ sheets
def compose_card(card_json):
    canvas = np.zeros((H * SC, W * SC, 4), np.uint8)
    canvas[...] = PAL['paper'] + (255,)
    for s in card_json['shapes']:
        img = np.asarray(Image.open(os.path.join(OUT, s['file'])).convert('RGBA'))
        paste(canvas, img, int(round(s['bbox'][0] * SC)), int(round(s['bbox'][1] * SC)))
    if card_json['lockup'] and os.path.exists(LOCKUP_PNG):
        lk = card_json['lockup']
        im = Image.open(LOCKUP_PNG).convert('RGBA')
        im = im.resize((int(lk['w'] * SC), int(round(lk['h'] * SC))), Image.LANCZOS)
        paste(canvas, np.asarray(im), int(lk['x'] * SC), int(lk['y'] * SC))
    img = np.asarray(Image.open(os.path.join(OUT, card_json['type_all'])).convert('RGBA'))
    bb = [a for a in card_json['assets']]
    # type_all bbox: recompute from file name crop (save_layer pad 0); stored separately
    paste(canvas, img, int(round(card_json['_type_all_bbox'][0] * SC)), int(round(card_json['_type_all_bbox'][1] * SC)))
    return Image.fromarray(canvas[..., :3])


def mono_pil(size):
    return ImageFont.truetype(os.path.join(HERE, 'fonts', 'GeistMono-Medium.ttf'), size)


def contact_sheet(cards):
    cw, chh, gap, lab = 800, 450, 40, 56
    cols = 3
    rows = math.ceil(len(cards) / cols)
    S = Image.new('RGB', (cols * cw + (cols + 1) * gap, rows * (chh + lab) + (rows + 1) * gap), (0xE4, 0xE5, 0xE0))
    dr = ImageDraw.Draw(S)
    for i, cj in enumerate(cards):
        full = compose_card(cj)
        os.makedirs(os.path.join(OUT, 'preview'), exist_ok=True)
        full.resize((W, H), Image.LANCZOS).save(os.path.join(OUT, 'preview', f"{cj['scene']}.png"))
        th = full.resize((cw, chh), Image.LANCZOS)
        x = gap + (i % cols) * (cw + gap)
        y = gap + (i // cols) * (chh + lab + gap)
        S.paste(th, (x, y))
        dr.rectangle([x - 1, y - 1, x + cw, y + chh], outline=(0x0B, 0x0C, 0x0E))
        f0, f1 = cj['frames']
        dr.text((x, y + chh + 14), f"{cj['scene']}  {cj['title'].upper()}  frames {f0}-{f1}  ({f0 / 30:.1f}-{f1 / 30:.1f} s)",
                fill=(0x0B, 0x0C, 0x0E), font=mono_pil(22))
    S.save(os.path.join(OUT, 'typo_sheet.png'))


def callouts_sheet(callouts, captions):
    cols = 2
    cell_w, cell_h = 1100, 420
    rows = math.ceil(len(callouts) / cols)
    capH = 70 * len(captions) + 40
    S = Image.new('RGBA', (cols * cell_w + 80, rows * cell_h + 80 + capH), PAL['paper'] + (255,))
    dr = ImageDraw.Draw(S)
    for i, co in enumerate(callouts):
        x = 40 + (i % cols) * cell_w
        y = 40 + (i // cols) * cell_h
        stack = None
        for k in co['layer_order']:
            im = Image.open(os.path.join(OUT, co['files'][k])).convert('RGBA')
            stack = im if stack is None else Image.alpha_composite(stack, im)
        stack = stack.resize((stack.width // 2, stack.height // 2), Image.LANCZOS)
        ar = Image.open(os.path.join(OUT, co['arrow']['file'])).convert('RGBA')
        ar = ar.resize((ar.width // 2, ar.height // 2), Image.LANCZOS)
        ax, ay = co['arrow']['attach_at_canvas_px']
        tx, ty = co['arrow']['tail_px']
        # arrow placed with its tail on the sticker edge (+8 px gap in the pointing direction)
        dd = {'right': (8, 0), 'left': (-8, 0), 'up': (0, -8), 'down': (0, 8)}[co['arrow']['direction']]
        ox = x + 140 if co['arrow']['direction'] == 'left' else x + 20
        oy = y + 140 if co['arrow']['direction'] == 'up' else y + 20
        S.alpha_composite(stack, (int(ox), int(oy)))
        S.alpha_composite(ar, (int(ox + ax - tx + dd[0]), int(oy + ay - ty + dd[1])))
        dr.text((x + 20, y + cell_h - 46), f"{co['id']}  {co['sticker']['color']} / shadow {co['sticker']['shadow_color']}  "
                f"-> {co['anchor'].split(':', 1)[1]} ({co['side']})  f{co['in']}-{co['out']}",
                fill=PAL['ink'], font=mono_pil(20))
    y = 40 + rows * cell_h
    for cp in captions:
        im = Image.open(os.path.join(OUT, cp['files']['merged'])).convert('RGBA')
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
        S.alpha_composite(im, (60, y))
        dr.text((60 + im.width + 24, y + 12), f"{cp['id']}  f{cp['in']}-{cp['out']}", fill=PAL['ink'], font=mono_pil(20))
        y += 70
    S.convert('RGB').save(os.path.join(OUT, 'callouts_sheet.png'))


# ============================================================================================ checks
def checks(cards_json):
    rep = []
    for cj in cards_json:
        for a in cj['assets']:
            x, y, w, h = a['bbox']
            if x < 0 or y < 0 or x + w > W or y + h > H:
                rep.append(f"CLIP {a['id']} bbox {a['bbox']}")
            for wb in a.get('word_boxes', []):
                bx, by, bw, bh = wb['bbox']
                if bx + bw > W - M + 1:
                    rep.append(f"MARGIN {a['id']} '{wb['text']}' right edge {bx + bw:.0f} > {W - M}")
                if bx < M - 12:
                    rep.append(f"MARGIN {a['id']} '{wb['text']}' left edge {bx:.0f}")
            if a['role'] == 'headline':
                for ln in a['lines']:
                    if ln['baseline'] % GRID:
                        rep.append(f"GRID {a['id']} baseline {ln['baseline']}")
                    if ln['leading_px'] and not 0.92 <= ln['leading_px'] / ln['size_px'] <= 1.06 and ln['leading_px'] / ln['size_px'] < 1.2:
                        rep.append(f"LEAD {a['id']} {ln['leading_px']}/{ln['size_px']}={ln['leading_px'] / ln['size_px']:.3f}")
    # collision between consecutive headline lines (ink boxes per word, any overlap)
    for cj in cards_json:
        boxes = [(a['id'], wb) for a in cj['assets'] for wb in a.get('word_boxes', [])]
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                (ia, a), (ib, b) = boxes[i], boxes[j]
                ax, ay, aw, ah = a['bbox']; bx, by, bw, bh = b['bbox']
                if ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah:
                    rep.append(f"OVERLAP {cj['scene']} '{a['text']}' x '{b['text']}' (box level; check pixels)")
    return rep


def main():
    os.chdir(OUT)
    for d in ('cards', 'callouts', 'captions', 'shapes', 'preview'):
        shutil.rmtree(os.path.join(OUT, d), ignore_errors=True)
    cards_json = []
    for card in CARDS:
        cj = build_card(card)
        img = np.asarray(Image.open(os.path.join(OUT, cj['type_all'])).convert('RGBA'))
        full = np.zeros((H * SC, W * SC, 4), np.uint8)
        cards_json.append(cj)
    # type_all bbox: re-derive by cropping again (save_layer returned it but we kept the API small)
    for cj, card in zip(cards_json, CARDS):
        pass
    callouts = [build_callout(c) for c in CALLOUTS]
    captions = [build_caption(c) for c in CAPTIONS]
    return cards_json, callouts, captions


if __name__ == '__main__':
    import build_meta
    build_meta.run()
