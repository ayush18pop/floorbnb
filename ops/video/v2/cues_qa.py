#!/usr/bin/env python3
"""cues.json (sound cues with frames) and camera/focus QA numbers for a plan.

  python3 cues_qa.py --plan master        -> v2/cues.json, v2/qa_camera.json
"""
import argparse
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import comp as C
from engine import rot_ypr


def sec(n):
    return round(n / 30.0, 4)


def build_cues(plan, world, rig, inp):
    cues = []

    def add(kind, frame, **kw):
        d = dict(kind=kind, frame=int(frame), seconds=sec(frame))
        d.update(kw)
        cues.append(d)

    N = plan.frames
    # camera moves
    for sg in plan.seg:
        if sg['kind'] in ('hold', 'hold-drift'):
            if sg['kind'] == 'hold-drift' and sg['n1'] - sg['n0'] > 10:
                add('camera_drift', sg['n0'], end=sg['n1'], end_seconds=sec(sg['n1']), station=sg['to'],
                    note='slow dolly/orbit during the hold (zero velocity at both ends)')
            continue
        dist = float(np.linalg.norm(sg['p1'] - sg['p0']))
        d0 = sg['p0'] - sg['t0']
        d1 = sg['p1'] - sg['t1']
        yaw_change = math.degrees(math.atan2(d1[0], d1[2]) - math.atan2(d0[0], d0[2]))
        yaw_change = (yaw_change + 180) % 360 - 180
        mid = (sg['n0'] + sg['n1']) // 2
        add('camera_move', sg['n0'], end=sg['n1'], end_seconds=sec(sg['n1']), move=sg['kind'], to=sg['to'],
            distance=round(dist), orbit_deg=round(yaw_change, 1), peak_speed_frame=int(mid),
            note='dolly forward with orbit; peak speed at mid-move, eases to rest at arrival')
    # follow moves
    for s in plan.st:
        for (shot, ki0, ki1, ko0, ko1, Df) in s.follow:
            n_in0, n_in1 = C.vf_of(s, shot, ki0), C.vf_of(s, shot, ki1)
            n_out0, n_out1 = C.vf_of(s, shot, ko0), C.vf_of(s, shot, ko1)
            add('camera_move', n_in0, end=n_in1, end_seconds=sec(n_in1), move='push_in', to=s.id + ':follow',
                distance=round(s.D0 - Df), note='push-in onto the slider thumb')
            add('camera_move', n_in1, end=n_out0, end_seconds=sec(n_out0), move='follow', to=s.id + ':follow',
                note='follows the thumb (events.json)')
            add('camera_move', n_out0, end=n_out1, end_seconds=sec(n_out1), move='pull_back', to=s.id,
                distance=round(s.D0 - Df))
    # arrivals, focus locks, departures
    for s in plan.st:
        add('card_arrival' if s.kind == 'card' else 'panel_arrival', s.a, station=s.id, settle_frame=s.a)
        add('focus_lock', s.L, station=s.id, rack_start=s.a - 4, rack_frames=s.L - (s.a - 4),
            note='plane becomes exactly sharp on this frame')
        add('defocus_start', s.d, station=s.id, note='subject leaves focus, blur ramps up as the camera departs')
    # word reveals
    for s in plan.st:
        if s.card is None:
            continue
        ov = plan.typo_over
        for a in s.card['assets']:
            if 'cut15' in a['id'] and plan.name != 'cut15':
                continue
            o = ov.get(a['id'], {})
            if o.get('skip'):
                continue
            add('word_reveal', o.get('in', a['in']), station=s.id, id=a['id'], text=a['text'], role=a['role'])
        for sh in s.card.get('shapes', []):
            o = ov.get(sh['id'], {})
            if 'wipe' in o:
                add('shape_wipe', o['wipe'][0], end=o['wipe'][1], station=s.id, id=sh['id'], color=sh['color'])
    # stickers
    for co in plan.callouts:
        add('sticker_pop', co['n_in'], id=co['id'], station=co['station'], stage='shadow')
        add('sticker_pop', co['n_in'] + 2, id=co['id'], station=co['station'], stage='sticker+text')
        add('sticker_arrow', co['n_in'] + 20, id=co['id'], station=co['station'])
        add('sticker_out', co['n_out'], id=co['id'], station=co['station'])
    for c in plan.captions:
        add('caption_in', c['n_in'], id=c['id'])
        add('caption_out', c['n_out'], id=c['id'])
    # real UI events from capture events.json mapped to video frames
    for s in plan.st:
        if s.kind != 'panel':
            continue
        last_floor = {}
        for i, (shot, k) in enumerate(s.frames):
            n = s.p0 + i
            if n >= N:
                break
            evd = inp.ev(shot)
            fd = evd['frames_data'][k]
            if fd.get('click'):
                add('ui_click', n, station=s.id, shot=shot, capture_frame=k,
                    x=round(fd['mouse']['x'], 1), y=round(fd['mouse']['y'], 1))
            fl = fd.get('floor')
            if fl is not None:
                if shot in last_floor and last_floor[shot] != fl:
                    add('slider_step', n, station=s.id, shot=shot, capture_frame=k, value=fl, prev=last_floor[shot])
                last_floor[shot] = fl
            if i > 0 and fd.get('down') is not None:
                pass
        # scroll segments
        prev = None
        seg = None
        for i, (shot, k) in enumerate(s.frames):
            n = s.p0 + i
            if n >= N:
                break
            fd = inp.ev(shot)['frames_data'][k]
            sy = fd.get('scrollY', 0) or 0
            if prev is not None and abs(sy - prev) > 0.5:
                if seg is None:
                    seg = [n, n]
                seg[1] = n
            elif seg is not None:
                add('ui_scroll', seg[0], end=seg[1], end_seconds=sec(seg[1]), station=s.id)
                seg = None
            prev = sy
        if seg is not None:
            add('ui_scroll', seg[0], end=seg[1], end_seconds=sec(seg[1]), station=s.id)
    # stamps and end card
    for s in plan.st:
        if s.card and s.card.get('lockup'):
            lk = s.card['lockup']
            n = plan.typo_over.get('lockup_in', {}).get(s.id) if isinstance(plan.typo_over.get('lockup_in'), dict) else None
            add('stamp', lk.get('stamp_frame', s.L), station=s.id, what='lockup')
    add('end_card', plan.st[-1].L if plan.st[-1].id == 'E2' else N - 120, station='E2')
    add('fade_to_paper', N - 6, end=N, end_seconds=sec(N))
    cues.sort(key=lambda c: (c['frame'], c['kind']))
    return dict(plan=plan.name, fps=30, tempo_bpm=90, beat_frames=20, total_frames=N,
                beat_frame_list=list(range(0, N + 1, 20)), cues=cues)


def camera_qa(plan, world, rig):
    N = plan.frames
    pos = np.zeros((N, 3))
    fwd = np.zeros((N, 3))
    for n in range(N):
        cam = rig.cam(n)
        pos[n] = cam.pos
        fwd[n] = cam.R[2]
    v = np.gradient(pos, axis=0)
    a = np.gradient(v, axis=0)
    j = np.gradient(a, axis=0)
    sp = np.linalg.norm(v, axis=1)
    ac = np.linalg.norm(a, axis=1)
    jk = np.linalg.norm(j, axis=1)
    ang = np.degrees(np.arccos(np.clip((fwd[1:] * fwd[:-1]).sum(1), -1, 1)))
    ang = np.concatenate([[0], ang])
    ang_acc = np.abs(np.gradient(ang))
    per = []
    for s in plan.st:
        n0, n1 = s.a, s.d
        yaw_off = []
        for n in range(max(0, n0), min(N, n1 + 1), 4):
            cam = rig.cam(n)
            nrm_ = rot_ypr(s.yaw, s.pitch, 0)[:, 2]
            ang_ = math.degrees(math.acos(max(-1, min(1, float(np.dot(-cam.R[2], nrm_))))))
            yaw_off.append(ang_)
        per.append(dict(station=s.id, kind=s.kind, plane_yaw_deg=s.yaw, plane_pitch_deg=s.pitch,
                        arrival=s.a, lock=s.L, depart=s.d, D_arrival=s.D0, D_end=s.D1,
                        max_view_angle_in_hold=round(max(yaw_off), 1) if yaw_off else None,
                        min_view_angle_in_hold=round(min(yaw_off), 1) if yaw_off else None,
                        sharp_frames=[s.L, s.d], sharp_seconds=round((s.d - s.L) / 30.0, 2)))
    # UI planes: consecutive frames with view angle > 25 deg while the plane is on screen and >50% frame
    over = {}
    for s in plan.st:
        if s.kind != 'panel':
            continue
        run = best = 0
        for n in range(max(0, s.a - 30), min(N, s.d + 40)):
            cam = rig.cam(n)
            nrm_ = rot_ypr(s.yaw, s.pitch, 0)[:, 2]
            ang_ = math.degrees(math.acos(max(-1, min(1, float(np.dot(-cam.R[2], nrm_))))))
            z = float(cam.to_cam(s.C)[2])
            x, y, _ = cam.project(s.C)
            readable = z < 4200 and abs(x - 960) < 900 and abs(y - 540) < 520
            if ang_ > 25 and readable:
                run += 1
                best = max(best, run)
            else:
                run = 0
        over[s.id] = best
    return dict(max_speed_units_per_frame=float(sp.max()), max_speed_frame=int(sp.argmax()),
                max_accel=float(ac.max()), max_accel_frame=int(ac.argmax()), max_jerk=float(jk.max()),
                max_jerk_frame=int(jk.argmax()),
                max_ang_vel_deg_per_frame=float(ang.max()), max_ang_vel_frame=int(ang.argmax()),
                max_ang_acc=float(ang_acc.max()), max_ang_acc_frame=int(ang_acc.argmax()),
                frames_over_25deg_readable=over, stations=per)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', default='master')
    a = ap.parse_args()
    inp, plan, world, rig = C.make_all(True) if a.plan == 'master' else C.make_plan(a.plan)
    cues = build_cues(plan, world, rig, inp)
    name = 'cues.json' if a.plan == 'master' else f'cues_{a.plan}.json'
    json.dump(cues, open(os.path.join(HERE, name), 'w'), indent=1)
    qa = camera_qa(plan, world, rig)
    json.dump(qa, open(os.path.join(HERE, f'qa_camera_{a.plan}.json'), 'w'), indent=1)
    print(name, len(cues['cues']), 'cues')
    print({k: v for k, v in qa.items() if k not in ('stations',)})


if __name__ == '__main__':
    main()
