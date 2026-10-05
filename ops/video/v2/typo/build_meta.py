"""Runs the typography build and writes typo.json, contact sheets and the check report."""
import json
import os

import build_typo as B
from typolib import HEX, SC

OUT = B.OUT


def variants(cards):
    """Alternate timelines. cut15 = the 15 s cut for X (SCRIPT.md, 440 frames). Frames are in that cut's timeline."""
    v = {
        'cut15': {
            'frames_total': 440, 'note': 'SCRIPT.md "15 s cut for X". Same assets, new in/out. Hook readable by f60.',
            'assets': {
                'S0_h0': dict(**{'in': 0, 'out': 80}), 'S0_h1': {'in': 20, 'out': 80}, 'S0_h2': {'in': 40, 'out': 80},
                'S0_underline_coral': {'in': 44, 'out': 80},
                'S0_floorline_full': {'in': 0, 'out': 80, 'reveal': 'already drawn on frame 0 (no draw-on in the hook)'},
                'S0_sub_cut15': {'in': 40, 'out': 80, 'text': 'Live on BNB Chain mainnet.'},
                'S0_sub': None, 'S0_lockup': None,
                'T1_drag': {'in': 100, 'out': 160}, 'T1_tradeoff': {'in': 160, 'out': 220},
                'cap_T1': {'in': 80, 'out': 220},
                'A1_review': {'in': 240, 'out': 320}, 'cap_A1': {'in': 220, 'out': 320},
                'E1_h0': {'in': 320, 'out': 360, 'reveal': 'both lines together on beat 16 (2-beat card, 1.33 s hold)'},
                'E1_h1': {'in': 320, 'out': 360}, 'E1_sub': None,
                'E1_shapes': {'in': 320, 'out': 360},
                'E2_h0': {'in': 360, 'out': 440}, 'E2_h1': {'in': 380, 'out': 440}, 'E2_lockup': {'in': 380, 'out': 440},
                'E2_factory': {'in': 400, 'out': 440}, 'E2_url': {'in': 400, 'out': 440},
                'E2_mono': {'in': 400, 'out': 440}, 'E2_small': {'in': 400, 'out': 440},
                'E2_shapes': {'in': 360, 'out': 440},
            },
            'hold_check': 'every group holds >= 40 frames (1.33 s) except S0_h2/S0_sub_cut15 (40) and E2 mono lines (40); hook complete on f40, fully readable by f60',
        },
        'cut30': {
            'note': 'SCRIPT.md 30 s cut (lower priority): reuse S0 cut15 timing for the 4-beat hook, C2/C3 labels '
                    '(C2_label, C3_label) as 2-beat labels over the panels, E1 + E2 as in cut15 shifted to the cut. '
                    'Exact frames come from the Composer edit points.',
        },
    }
    return v


def run():
    cards, callouts, captions = B.main()
    rep = B.checks(cards)
    for c in cards:
        c['shapes_note'] = 'shape layers sit on the card plane behind the type; colour layers may take riso misregistration'
    doc = dict(
        version=2, generated_by='ops/video/v2/typo/build_typo.py (python3 build_typo.py)',
        frame=dict(w=1920, h=1080, fps=30, bpm=90, beat_frames=20, margin_px=96, baseline_grid_px=12),
        asset_scale=SC,
        units='bbox = [x, y, w, h] in 1x card px of a 1920x1080 card plane (PNG pixels are 2x). Callout canvases '
              'are local px. Anchor offsets for callouts are capture CSS px (1440x900 viewport space).',
        palette=HEX,
        fonts=dict(headline='Anton Regular 400 (@fontsource/anton 5.3.0, fonts/Anton-Regular.ttf)',
                   accent='Instrument Serif Italic (@fontsource/instrument-serif 5.3.0), pixelated: x-height = 20 blocks, '
                          'coverage threshold 0.44 at 8x8 supersampling, hairline rescue, nearest-neighbour upscale',
                   mono='Geist Mono Medium / Regular (apps/web/node_modules/geist)'),
        type_scale=dict(headline_px=[312, 288, 264, 252, 240], headline_secondary_px=[168], callout_px=72,
                        mono_sub_px=32, label_px=30, mono_end_px=30, caption_px=28, small_mono_px=26),
        reveal_rule='Word groups cut in fully on their beat frame (no fades, no per-letter animation). Holds >= 1.3 s. '
                    'Riso misregistration only on colour layers (shapes, stickers, shadows); type stays registered or <= 1 px.',
        cards=cards, callouts=callouts, captions=captions, variants=variants(cards),
        no_callout_scenes={'L1': 'SCRIPT.md gives no callout words for the landing page; caption only'},
        checks=rep,
    )
    for c in doc['cards']:
        c['type_all_bbox'] = c.pop('_type_all_bbox')
    json.dump(doc, open(os.path.join(OUT, 'typo.json'), 'w'), indent=1, ensure_ascii=False)
    for c in cards:
        c['_type_all_bbox'] = c['type_all_bbox']
    B.contact_sheet(cards)
    B.callouts_sheet(callouts, captions)
    print('\n'.join(rep) or 'checks: clean')


if __name__ == '__main__':
    run()
