#!/usr/bin/env python3
"""
Floor launch video v2: original score, synthesized in code (numpy/scipy only, no samples).

    python3 make_music.py            # render 60 s + 30 s stems, preview mixes, verification
    python3 make_music.py --no-check # render only

Seeded (SEED) and re-runnable: the same inputs give bit-identical files.
Timing: 90 BPM, 1 beat = 20 frames @30 fps = 0.6667 s = 32000 samples @48 kHz.
Sync source: SCRIPT.md beat table. If ../../cues.json (compositor) exists, the S0 stamp beat
and the dense-SFX frames for duck_hint.json are taken from it (snapped to the beat grid).

Outputs (this folder):
  pad.wav sub.wav pulse_perc.wav melody.wav texture.wav finale.wav       60.000 s each
  30s/pad.wav ... 30s/finale.wav                                        30.000 s each
  music_mix_preview.wav, 30s/music_mix_preview_30s.wav                  (stems summed)
  arrangement.json, duck_hint.json, measure.json, report.md, spec/*.png
"""
import json, math, os, re, subprocess, sys, zlib
import numpy as np
from scipy import signal

SEED = 9090
SR = 48000
BPM = 90
BEAT = 60.0 / BPM                  # 0.6667 s
SPB = 32000                        # samples per beat (exact)
FPB = 20                           # video frames per beat
N60, N30, N15 = 2_880_000, 1_440_000, 704_000
NLEN = {60: N60, 30: N30, 15: N15}
FADE = {60: 1.0, 30: 1.0, 15: 0.8}
HERE = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.abspath(os.path.join(HERE, "..", ".."))
EDGE = 240                         # 5 ms of digital silence at both ends

# --------------------------------------------------------------------------------------
# Key, harmony, form
# --------------------------------------------------------------------------------------
KEY = "D major"
KEY_PCS = {2, 4, 6, 7, 9, 11, 1}   # D E F# G A B C#
PCN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12.0)
def nname(m): return f"{PCN[m % 12]}{m // 12 - 1}"
def nm(s):
    """'F#4' -> midi"""
    mm = re.match(r"([A-G])(#?)(-?\d)", s)
    pc = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[mm.group(1)] + (1 if mm.group(2) else 0)
    return pc + 12 * (int(mm.group(3)) + 1)

SCENES = [  # id, start beat, end beat, name (SCRIPT.md)
    ("S0", 0, 8, "Cold open"), ("C1", 8, 11, "Card 01 The idea"), ("L1", 11, 20, "Landing page"),
    ("C2", 20, 23, "Card 02 Try it"), ("T1", 23, 37, "Simulator"), ("C3", 37, 40, "Card 03 Set yours"),
    ("A1", 40, 56, "App builder, review, confirmed"), ("C4", 56, 59, "Card 04 Your own vault"),
    ("A2", 59, 68, "Position and keeper"), ("C5", 68, 71, "Card 05 For agents"), ("G1", 71, 79, "Agents page"),
    ("E1", 79, 84, "Honest card"), ("E2", 84, 90, "End card")]

# chord events: start beat, beats, symbol, pad voicing (midi), sub root (midi or None)
CH = [
    (0, 4, "Dsus2", "D3 A3 E4", None),
    (4, 4, "Bm7", "B2 F#3 A3 D4", None),
    (8, 4, "Gadd9", "G2 D3 B3 D4 A4", None),
    (12, 4, "D/F#", "F#2 A3 D4 F#4", None),
    (16, 4, "A", "A2 A3 C#4 E4", None),
    (20, 4, "Bm7", "B2 A3 D4 F#4", None),
    (24, 4, "G", "G2 B3 D4 G4", None),
    (28, 4, "F#m7", "F#2 A3 C#4 E4", None),
    (32, 5, "Em7", "E2 G3 B3 D4", None),
    (37, 3, "Asus4", "A2 A3 D4 E4", "A1"),
    (40, 4, "D", "D3 A3 D4 F#4", "D2"),
    (44, 4, "Bm7", "B2 A3 D4 F#4", "B1"),
    (48, 4, "Gmaj7", "G2 B3 D4 F#4", "G1"),
    (52, 4, "A", "A2 A3 C#4 E4", "A1"),
    (56, 4, "Dadd9", "D3 A3 E4 F#4 A4", "D2"),
    (60, 4, "Gmaj7", "G2 D3 B3 F#4 B4", "G1"),
    (64, 4, "Em7", "E2 B3 D4 G4", "E2"),
    (68, 4, "G6", "G2 B3 D4 E4", "G1"),
    (72, 4, "D/F#", "F#2 A3 D4 F#4", "F#1"),
    (76, 3, "Em7", "E2 G3 B3 D4", "E2"),
    (79, 5, "Asus4(add9)", "A3 D4 E4 B4", "A1"),
    (84, 2, "D", "D3 A3 D4 F#4 A4", "D2"),
    (86, 2, "G/D", "D3 G3 B3 D4 G4", "D2"),
    (88, 2, "D", "D3 A3 D4 F#4 A4", "D2"),
]
CHORD_PCS = {}
for b, d, sym, v, r in CH:
    CHORD_PCS[b] = sorted({nm(x) % 12 for x in v.split()})

# bars (mixed meter so every section change is a downbeat): start, beats
BARS = [(0, 4), (4, 4), (8, 4), (12, 4), (16, 4), (20, 4), (24, 4), (28, 4), (32, 5), (37, 3), (40, 4),
        (44, 4), (48, 4), (52, 4), (56, 4), (60, 4), (64, 4), (68, 4), (72, 4), (76, 3), (79, 5), (84, 4), (88, 2)]

MOTIF = ["F#4", "A4", "B4", "A4", "E4"]          # open form (ends on scale degree 2)
MOTIF_RES = ["F#4", "A4", "B4", "A4", "D4"]      # resolved form (ends on the tonic)
MOTIF_RHY = [0, 0.5, 1.0, 2.0, 2.5]              # beats

# 30 s musical edit: (src start, src end, instruments excluded). dst is cumulative.
CUT30 = [(0, 4, []), (20, 32, []), (37, 52, []), (76, 79, ["bell", "shaker", "tick"]), (79, 90, [])]
# 15 s cut for X (SCRIPT.md, 22 beats): hook (S0, motif on the stamp) | simulator | app | honest | end card hit | resolved tail
CUT15 = [(0, 4, []), (24, 31, []), (40, 45, []), (79, 81, []), (84, 86, []), (88, 90, [])]
CUTS = {30: CUT30, 15: CUT15}

# section automation keyframes on SOURCE beats
PAD_DB = [(0, -15), (6, -12), (8, -7), (11, -5), (20, -6), (28, -6.5), (37, -6), (40, -5), (56, -3.5), (68, -6),
          (79, -9), (83.5, -9.5), (84, -3), (90, -3)]
PAD_FC = [(0, 380), (8, 420), (12, 950), (20, 1050), (28, 850), (37, 800), (40, 1200), (56, 1600), (68, 1250),
          (79, 650), (84, 1800), (90, 1100)]
PAD_W = [(0, 0.35), (8, 0.55), (40, 0.6), (56, 0.95), (68, 0.75), (79, 0.45), (84, 0.85)]
TEX_DB = [(0, -3), (8, -9), (20, -11), (40, -12), (56, -11), (79, -6), (84, -10), (90, -12)]

def kf(keys, b):
    xs = np.array([k[0] for k in keys], float); ys = np.array([k[1] for k in keys], float)
    return np.interp(b, xs, ys)

# --------------------------------------------------------------------------------------
# Sync with the picture (SCRIPT.md defaults, optional compositor cues)
# --------------------------------------------------------------------------------------
def walk(o, out, path=""):
    if isinstance(o, dict):
        fr = None
        for k in ("frame", "f", "start_frame", "frame_start", "in"):
            if isinstance(o.get(k), (int, float)): fr = o[k]; break
        if fr is not None:
            label = " ".join(str(o.get(k, "")) for k in ("type", "kind", "name", "id", "event", "cue") if o.get(k))
            out.append((float(fr), (label or path).lower()))
        for k, v in o.items(): walk(v, out, path + "/" + str(k))
    elif isinstance(o, list):
        for v in o: walk(v, out, path)

def load_sync():
    sync = {"source": "SCRIPT.md beat table (no v2/cues.json yet)", "stamp_beat": 2, "cue_frames": []}
    p = os.path.join(V2, "cues.json")
    if os.path.exists(p):
        try:
            cues = []
            walk(json.load(open(p)), cues)
            sync["cue_frames"] = sorted(cues)
            st = [f for f, l in cues if "stamp" in l and f < 160]
            if st: sync["stamp_beat"] = int(round(st[0] / FPB))
            sync["source"] = "v2/cues.json"
            raw = json.load(open(p))["cues"]
            sync["slider"] = sorted(x["frame"] for x in raw if x["kind"] == "slider_step" and x["frame"] < 700)
            sync["t1_clicks"] = sorted(x["frame"] for x in raw if x["kind"] == "ui_click" and "T1" in x["name"])
            sync["stations"] = json.load(open(p))["stations"]
            sync["e2_stamp"] = [x["frame"] for x in raw if x["kind"] == "stamp" and x["frame"] > 1000]
            pc = os.path.join(V2, "cues_cut15.json")
            if os.path.exists(pc):
                r15 = json.load(open(pc))["cues"]
                sync["slider15"] = sorted(x["frame"] for x in r15 if x["kind"] == "slider_step" and x["frame"] < 200)
                sync["t1_clicks15"] = sorted(x["frame"] for x in r15 if x["kind"] == "ui_click" and "T1" in x["name"])
        except Exception as e:
            sync["source"] = f"SCRIPT.md (cues.json unreadable: {e})"
    return sync

# --------------------------------------------------------------------------------------
# Score (events on SOURCE beats). Each event: inst, b, d, m, v, pan, ph (phrase anchor), jit (s)
# --------------------------------------------------------------------------------------
def build_score(sync):
    rng = np.random.default_rng(SEED)
    E = []
    def add(inst, b, d=0.5, m=None, v=0.6, pan=0.0, ph=None, human=True, **kw):
        jit = float(np.clip(rng.uniform(-0.006, 0.006), -0.008, 0.008)) if human else 0.0
        vv = v * (1 + rng.uniform(-0.08, 0.08)) if human else v
        e = dict(inst=inst, b=float(b), d=float(d), m=m, v=float(vv), pan=pan, ph=float(b if ph is None else ph), jit=jit)
        e.update(kw); E.append(e); return e

    # ---- pad (all chords) and sub
    for b, d, sym, v, r in CH:
        for m in [nm(x) for x in v.split()]:
            add("pad", b, d, m, 1.0, human=False, sym=sym)
    def sub(b, d, note, v=0.8, att=0.03): add("sub", b, d, nm(note), v, human=False, att=att)
    sub(37, 3, "A1", 0.55, att=1.3)                                   # C3 pickup swell
    for bb, root in ((40, "D2"), (44, "B1"), (48, "G1"), (52, "A1")):  # A1: bass enters
        sub(bb, 1.5, root); sub(bb + 1.5, 0.5, root, 0.55); sub(bb + 2.5, 1.5, root, 0.75)
    for bb, root in ((56, "D2"), (60, "G1"), (64, "E2")):            # C4/A2: calm whole notes
        sub(bb, 4, root, 0.75, att=0.08)
    sub(68, 2, "G1", 0.6); sub(70, 2, "D2", 0.55); sub(72, 4, "F#1", 0.6); sub(76, 3, "E2", 0.55)
    sub(79, 5, "A1", 0.5, att=1.6)                                    # E1: low drone, no resolution
    sub(84, 2, "D2", 1.0, att=0.006); sub(86, 2, "D2", 0.7, att=0.05); sub(88, 2, "D2", 0.6, att=0.05)

    # ---- pulse / percussion (structural thumps exactly on the grid, human=False)
    def thump(b, v, kind="lub"): add("thump", b, 0.5, None, v, human=False, kind=kind)
    for i, b in enumerate(range(1, 8)):                               # S0 heartbeat
        thump(b, 0.42 + 0.05 * i); thump(b + 0.25, (0.42 + 0.05 * i) * 0.5, "dub")
    for b in range(8, 20): thump(b, 0.40 if b % 4 == 0 else 0.30, "soft")  # C1/L1 gentle pulse
    for b in range(12, 20):
        add("shaker", b + 0.5, v=0.22, pan=0.35)
    for bar in (20, 24):                                              # C2/T1 playful
        for k in range(4):
            if k in (0, 2): thump(bar + k, 0.5, "soft")
            if k in (1, 3): add("tick", bar + k, m=nm("D5"), v=0.22, pan=-0.3, muted=False)
            if bar == 20 and k == 0: continue
            add("shaker", bar + k + 0.5, v=0.26, pan=0.35); add("shaker", bar + k, v=0.12, pan=0.35)
    thump(28, 0.5, "soft"); add("shaker", 28.5, v=0.2, pan=0.35); add("shaker", 29.0, v=0.12, pan=0.35)
    for b in range(30, 37):                                           # crash: the heartbeat returns
        thump(b, 0.5); thump(b + 0.25, 0.25, "dub")
    thump(37, 0.45, "soft")                                           # C3
    for i, x in enumerate(np.arange(38, 40, 0.5)):
        add("tick", x, m=None, v=0.10 + 0.04 * i, pan=0.25, muted=True)
    acc = [0.40, 0.18, 0.28, 0.18, 0.34, 0.18, 0.28, 0.20]
    for bar in (40, 44, 48, 52):                                      # A1: quiet print press
        for k, x in enumerate(np.arange(0, 4, 0.5)):
            add("tick", bar + x, v=acc[k], pan=0.25 if k % 2 else -0.15, muted=True)
        thump(bar, 0.62, "soft"); thump(bar + 2, 0.5, "soft")
        add("brush", bar + 1, v=0.40, pan=-0.2); add("brush", bar + 3, v=0.44, pan=-0.2)
        if bar >= 48:
            for x in np.arange(0, 4, 0.25):
                add("shaker", bar + x, v=0.10 if x % 0.5 else 0.06, pan=0.4)
    for bar in (56, 60, 64):                                          # C4/A2: keeper clock
        thump(bar, 0.5, "soft")
        for k in range(4):
            if bar == 56 and k == 0: continue
            add("tick", bar + k, m=nm("A4") if k % 2 else nm("D5"), v=0.30, pan=-0.25 if k % 2 else 0.25, muted=False)
    for bar, n in ((68, 4), (72, 4), (76, 3)):                        # C5/G1: lighter
        thump(bar, 0.36, "soft")
        for k in range(n):
            if bar == 68 and k == 0: continue
            add("tick", bar + k, m=nm("A4") if k % 2 else nm("D5"), v=0.18, pan=-0.25 if k % 2 else 0.25, muted=False)
            for x in (0.25, 0.5, 0.75):
                add("shaker", bar + k + x, v=0.08 if x == 0.5 else 0.05, pan=0.45)
    # E1: no percussion. E2: final hit lives in finale.wav

    # ---- melody (mallets, kalimba, bells)
    sb = sync["stamp_beat"]
    for i, (n, r) in enumerate(zip(MOTIF, MOTIF_RHY)):               # S0: motif on the stamp
        add("kalimba", sb + r, 1.5, nm(n), [0.85, 0.65, 0.75, 0.6, 0.7][i], pan=-0.1, ph=sb, human=(i > 0), whole=True)
    def ostinato(bar, nbeats, pos, lo, hi, vel, ph=None):
        pcs = CHORD_PCS[max(b for b, *_ in CH if b <= bar)]
        pool = [m for m in range(lo, hi + 1) if m % 12 in pcs]
        seq = pool + pool[-2:0:-1]
        for i, x in enumerate(p for p in pos if p < nbeats):
            add("marimba", bar + x, 0.5, seq[i % len(seq)], vel * (1.0 if x == 0 else 0.8), pan=0.2 * ((-1) ** i), ph=ph)
    for bar in (12, 16):                                              # L1: gentle forward motion
        ostinato(bar, 4, [0, 0.75, 1.5, 2, 2.75, 3.5], 50, 64, 0.34)
    # T1: slider 90 -> 80. One marimba note per REAL slider_step cue (v2/cues.json), falling D major line.
    fall = [nm(x) for x in ("A5", "F#5", "E5", "D5", "C#5", "B4", "A4", "G4", "F#4", "E4", "D4")]
    sl = sync.get("slider") or [round(20 * (24.5 + 0.25 * i)) for i in range(10)]
    sl15 = sync.get("slider15") or []
    add("marimba", (sl[0] - 14) / FPB, 0.5, fall[0], 0.34, ph=24.0, human=False)        # lead-in on the thumb grab
    for i, f in enumerate(sl[:10]):
        deg = fall[1 + i]
        kw = {}
        if i < len(sl15): kw["db15"] = sl15[i] / FPB
        add("marimba", f / FPB, 0.5, deg, 0.40 + 0.12 * (i / 9), pan=0.3 * (0.5 - i / 9), ph=24.0, human=False, slider_step=i, **kw)
    for i, (n, r) in enumerate(zip(MOTIF, MOTIF_RHY)):               # T1: motif in the plucks
        add("marimba", 28 + r, 1.0, nm(n), [0.6, 0.48, 0.55, 0.45, 0.5][i], pan=0.1, ph=28.0, whole=True)
        add("kalimba", 28 + r, 1.0, nm(n) - 12, 0.25, pan=-0.2, ph=28.0, whole=True)
    c1 = (sync.get("t1_clicks") or [610, 664]); c15 = sync.get("t1_clicks15") or []
    k1 = c1[0] / FPB; k2 = (c1[1] if len(c1) > 1 else 664) / FPB                         # COVID chip, 2022 chip
    for x, n, v in ((k1, "G4", .45), (k1 + .5, "E4", .4), (k1 + 1, "D4", .38), (k1 + 1.5, "B3", .4),   # crash: falls on the chip click,
                    (k2, "A3", .34), (k2 + .75, "B3", .26), (k2 + 1.75, "B3", .22),                    # 2022 chip: second step down, holds on a floor,
                    (35.5, "D4", .3), (35.75, "E4", .33), (36, "F#4", .36), (36.5, "A4", .4)):          # rises into C3
        add("marimba", x, 0.5, nm(n), v, pan=0.15, ph=30.0, human=False, **({"db15": c15[0] / FPB} if (c15 and abs(x - k1) < 1e-9) else {}))
    for bar in (40, 44, 48, 52):                                      # A1: low ostinato under the UI
        ostinato(bar, 4, [0, 0.5, 1.5, 2, 2.5, 3.5], 45, 62, 0.36, ph=bar)
    for n, x in zip(MOTIF, [60, 61, 62, 64, 65]):                     # A2: motif, augmented, low
        add("kalimba", x, 2.0, nm(n) - 12, 0.55, pan=-0.15, ph=60.0)
    for bar, n, pos in ((68, 4, [2.5, 3, 3.5]), (72, 4, [0.5, 1, 1.5, 2.5, 3, 3.5]), (76, 3, [0.5, 1, 1.5, 2])):
        pcs = CHORD_PCS[bar]                                          # C5/G1: FM bells, restrained
        pool = [m for m in range(nm("D4"), nm("E5") + 1) if m % 12 in pcs]
        for i, x in enumerate(pos):
            add("bell", bar + x, 1.0, pool[(i * 2 + (bar // 4)) % len(pool)], 0.32 - 0.03 * (bar == 76) * i,
                pan=0.45 * ((-1) ** i), ph=bar)
    for n, x in zip(MOTIF_RES, [84, 85, 86, 87, 88]):                 # E2: motif resolves
        add("kalimba", x, 2.0, nm(n), 0.75, pan=-0.1, human=(x not in (84, 88)))
        add("marimba", x, 1.0, nm(n) - 12, 0.45, pan=0.15, human=(x not in (84, 88)))

    # ---- finale: the hit on beat 84 and one low brass-like swell
    add("hit", 84, 1, None, 1.0, human=False)
    for m in ("D3", "A3", "D4", "F#4"):
        add("marimba_f", 84, 1.0, nm(m), 0.55, human=False)
    for b, d, notes in ((84, 2, "D3 A3 D4 F#4"), (86, 2, "D3 G3 B3 D4"), (88, 2, "D3 A3 D4 F#4")):
        for m in notes.split():
            add("brass", b, d, nm(m), 1.0, human=False, first=(b == 84))
    return E

STEM_OF = {"pad": "pad", "sub": "sub", "thump": "pulse_perc", "tick": "pulse_perc", "brush": "pulse_perc",
           "shaker": "pulse_perc", "kalimba": "melody", "marimba": "melody", "bell": "melody",
           "hit": "finale", "marimba_f": "finale", "brass": "finale"}
STEMS = ["pad", "sub", "pulse_perc", "melody", "texture", "finale"]

# --------------------------------------------------------------------------------------
# DSP helpers
# --------------------------------------------------------------------------------------
def sosf(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")

def filt(x, kind, f, order=2, zero=False):
    s = sosf(kind, f, order)
    return signal.sosfiltfilt(s, x, axis=0) if zero else signal.sosfilt(s, x, axis=0)

def peaking(x, f0, gain_db, q):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)

def fades(x, fin=0.004, fout=0.006):
    n = len(x); a = min(int(fin * SR), n // 2); b = min(int(fout * SR), n // 2)
    if a > 0: x[:a] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a))[:, None] if x.ndim == 2 else 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
    if b > 0: x[-b:] *= (0.5 + 0.5 * np.cos(np.pi * np.arange(1, b + 1) / b))[:, None] if x.ndim == 2 else 0.5 + 0.5 * np.cos(np.pi * np.arange(1, b + 1) / b)
    return x

def pan_g(p): a = (p + 1) * np.pi / 4; return np.cos(a), np.sin(a)

def place(buf, sig, s0, pan=0.0, gain=1.0):
    if sig.ndim == 1:
        gl, gr = pan_g(pan); sig = np.stack([sig * gl, sig * gr], axis=1)
    if s0 < 0: sig = sig[-s0:]; s0 = 0
    n = min(len(sig), len(buf) - s0)
    if n > 0: buf[s0:s0 + n] += gain * sig[:n]

# ---------------- instruments (all return arrays starting at the note onset) ----------
def pad_note(m, dur, b_src, rng, release=1.1):
    f0 = mtof(m); att = 0.55 if b_src < 8 else 0.35
    L = int((dur + release) * SR); t = np.arange(L) / SR
    bsrc = b_src + t / BEAT
    fc = kf(PAD_FC, bsrc) * (1 + 0.12 * np.sin(2 * np.pi * t / 7.3 + rng.uniform(0, 6.28)))
    gdb = kf(PAD_DB, bsrc)
    env = np.minimum(1, t / att) ** 1.5
    rel = np.clip((t - dur) / release, 0, 1)
    env *= np.where(t < dur, 1.0, np.cos(rel * np.pi / 2) ** 2) * 10 ** (gdb / 20)
    width = float(kf(PAD_W, b_src))
    r8 = (f0 / fc) ** 8
    out = np.zeros((L, 2))
    voices = [(0.0, 0.0, 1.0), (+6.5, -width, 0.55), (-6.0, +width, 0.55)]
    kmax = max(1, min(40, int(min(4200, 2.6 * float(fc.max())) / f0)))
    ph = rng.uniform(0, 2 * np.pi, (3, kmax + 1))
    for vi, (cents, pan, g) in enumerate(voices):
        fv = f0 * 2 ** (cents / 1200)
        acc = np.zeros(L)
        for k in range(1, kmax + 1):
            amp = 0.55 / k + (0.45 / (k * k) if k % 2 else 0.0)      # saw / triangle blend
            acc += amp / np.sqrt(1 + (k ** 8) * r8) * np.sin(2 * np.pi * fv * k * t + ph[vi, k])
        gl, gr = pan_g(pan)
        out[:, 0] += g * gl * acc; out[:, 1] += g * gr * acc
    return fades(out * env[:, None] * 0.22, 0.006, 0.008)

def sub_note(m, dur, v, att):
    f = mtof(m); rel = 0.35 if dur < 3 else 0.6
    L = int((dur + rel) * SR); t = np.arange(L) / SR
    env = np.minimum(1, t / att) ** 1.2 * np.where(t < dur, 1.0, np.cos(np.clip((t - dur) / rel, 0, 1) * np.pi / 2) ** 2)
    if att < 0.01: env *= 0.75 + 0.25 * np.exp(-t / 0.4)
    x = np.sin(2 * np.pi * f * t) + 0.10 * np.sin(4 * np.pi * f * t)
    return fades(x * env * v * 0.5, 0.005, 0.008)

def thump(v, kind):
    if kind == "dub": f0, f1, dec = 72, 48, 0.085
    elif kind == "soft": f0, f1, dec = 78, 50, 0.11
    else: f0, f1, dec = 85, 52, 0.13
    L = int(dec * 7 * SR); t = np.arange(L) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.028)
    x = np.cos(2 * np.pi * np.cumsum(f) / SR - 2 * np.pi * f[0] / SR) * np.exp(-t / dec)
    return fades(x * v, 0.002, 0.008)

def tick(v, f, muted, rng):
    L = int(0.25 * SR); t = np.arange(L) / SR
    if muted:   # woody, unpitched-ish, low: the quiet print press
        n = filt(rng.standard_normal(L), "bandpass", [450, 1100], 2) * np.exp(-t / 0.012)
        x = 0.6 * np.sin(2 * np.pi * 520 * t) * np.exp(-t / 0.02) + 0.9 * n / (np.abs(n).max() + 1e-9)
        x = filt(x, "lowpass", 1300, 2)
    else:       # pitched clock tick, lowpassed
        x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.045) + 0.18 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.010)
        x = filt(x, "lowpass", 1800, 2)
    return fades(x * v * 0.5, 0.003, 0.006)

def brush(v, rng):
    L = int(0.42 * SR); t = np.arange(L) / SR
    n = filt(rng.standard_normal((L, 2)), "bandpass", [380, 1500], 2)
    env = (1 - np.exp(-t / 0.03)) * np.exp(-t / 0.12)
    return fades(n * env[:, None] * v * 0.35, 0.004, 0.006)

def shaker(v, rng):
    L = int(0.12 * SR); t = np.arange(L) / SR
    n = filt(rng.standard_normal(L), "bandpass", [5600, 9500], 2)
    env = (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.03)
    return fades(n * env * v * 0.55, 0.003, 0.006)

def marimba(m, v, rng, dur=0.5):
    f = mtof(m); T1 = float(np.clip(0.75 * (300 / f) ** 0.35, 0.35, 1.3))
    L = int((T1 * 5 + 0.05) * SR); t = np.arange(L) / SR
    x = np.zeros(L)
    for ratio, a, tau in ((1.0, 1.0, T1), (3.93, 0.22, T1 * 0.18), (9.2, 0.04, T1 * 0.05)):
        if f * ratio < 9000: x += a * np.sin(2 * np.pi * f * ratio * t + rng.uniform(0, 6.28) * (ratio > 1)) * np.exp(-t / tau)
    thud = filt(rng.standard_normal(L), "lowpass", 500, 2) * np.exp(-t / 0.006)
    x += 0.12 * thud / (np.abs(thud).max() + 1e-9)
    return fades(x * v * 0.32, 0.003, 0.008)

def kalimba(m, v, rng, dur=1.5):
    f = mtof(m); L = int(2.6 * SR); t = np.arange(L) / SR
    x = np.sin(2 * np.pi * f * t + 0.6 * np.exp(-t / 0.03) * np.sin(2 * np.pi * f * t)) * np.exp(-t / 0.9)
    x += 0.05 * np.sin(2 * np.pi * f * 5.95 * t) * np.exp(-t / 0.05)
    x += 0.10 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.35)
    return fades(x * v * 0.3, 0.003, 0.008)

def bell(m, v, rng):
    f = mtof(m); L = int(2.6 * SR); t = np.arange(L) / SR
    I = 1.1 * np.exp(-t / 0.45)
    x = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * 3.5 * f * t)) * np.exp(-t / 1.1)
    x = filt(x, "lowpass", 2600, 2)
    return fades(x * v * 0.22, 0.003, 0.008)

def hit(v, rng):
    L = int(1.6 * SR); t = np.arange(L) / SR
    f = 50 + 30 * np.exp(-t / 0.05)
    x = np.cos(2 * np.pi * np.cumsum(f) / SR - 2 * np.pi * f[0] / SR) * np.exp(-t / 0.35)
    n = filt(rng.standard_normal(L), "lowpass", 700, 2) * np.exp(-t / 0.05)
    x += 0.25 * n / (np.abs(n).max() + 1e-9)
    return fades(x * v * 0.55, 0.002, 0.01)

def brass(m, dur, first, rng):
    f0 = mtof(m); rel = 1.0 if dur >= 2 else 0.6
    L = int((dur + rel) * SR); t = np.arange(L) / SR
    att = 0.30 if first else 0.18
    env = np.minimum(1, t / att) ** 2 * np.where(t < dur, 1.0, np.cos(np.clip((t - dur) / rel, 0, 1) * np.pi / 2) ** 2)
    env *= (0.8 + 0.2 * np.exp(-t / 0.8))
    fc = 250 + (1100 if first else 700) * np.minimum(1, t / (att * 1.6)) * np.exp(-t / 2.2)
    r8 = (f0 / fc) ** 8
    kmax = max(1, int(3000 / f0))
    vib = 1 + 0.0025 * np.minimum(1, t / 1.0) * np.sin(2 * np.pi * 5.0 * t)
    out = np.zeros((L, 2))
    for cents, pan in ((-4, -0.35), (4, 0.35)):
        phase = 2 * np.pi * np.cumsum(f0 * 2 ** (cents / 1200) * vib) / SR
        acc = np.zeros(L)
        for k in range(1, kmax + 1):
            acc += (1 / k) / np.sqrt(1 + (k ** 8) * r8) * np.sin(k * phase + rng.uniform(0, 6.28))
        gl, gr = pan_g(pan); out[:, 0] += gl * acc; out[:, 1] += gr * acc
    return fades(out * env[:, None] * 0.12, 0.006, 0.01)

def reverb_ir(rng, rt_lo=2.0, rt_hi=1.0, length=2.6):
    L = int(length * SR); t = np.arange(L) / SR
    ir = np.zeros((L, 2))
    for c in range(2):
        n = rng.standard_normal(L)
        lo = filt(n, "lowpass", 900, 2) * np.exp(-6.9 * t / rt_lo)
        hi = filt(n, "highpass", 900, 2) * np.exp(-6.9 * t / rt_hi)
        ir[:, c] = filt(lo + 0.6 * hi, "lowpass", 5000, 2)
    pre = int(0.014 * SR); ir = np.concatenate([np.zeros((pre, 2)), ir])[:L]
    ir[pre:pre + 240] *= np.linspace(0, 1, 240)[:, None]
    return ir / np.sqrt((ir ** 2).sum(axis=0).mean())

def add_reverb(x, ir, send):
    if send <= 0: return x
    wet = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return x + send * wet

# --------------------------------------------------------------------------------------
# Rendering (60 s master or 30 s edit)
# --------------------------------------------------------------------------------------
def timeline(version):
    """list of (src_start, src_end, dst_start, excluded)"""
    if version == 60: return [(0, 90, 0, [])]
    out, d = [], 0
    for s, e, ex in CUTS[version]:
        out.append((s, e, d, ex)); d += e - s
    assert d * SPB == NLEN[version], d
    return out

def src_of_dst(segs, b):
    b = np.asarray(b, float); out = np.zeros_like(b)
    for s, e, d, _ in segs:
        msk = (b >= d) & (b < d + (e - s)) if (s, e) != (segs[-1][0], segs[-1][1]) else (b >= d)
        out[msk] = s + (b[msk] - d)
    return out

def map_events(E, version):
    segs = timeline(version); out = []
    for e in E:
        for s, en, d, ex in segs:
            if s <= e["ph"] < en and e["inst"] not in ex and (e["b"] < en or e.get("whole")):
                e2 = dict(e); e2["db"] = d + (e["b"] - s)
                if version == 15 and "db15" in e: e2["db"] = e["db15"]
                if e["inst"] in ("pad", "sub", "brass") and e["b"] + e["d"] > en:
                    e2["d"] = en - e["b"]
                out.append(e2); break
    return out

def render(E, version):
    N = NLEN[version]
    segs = timeline(version)
    ev = map_events(E, version)
    st = {k: np.zeros((N, 2)) for k in STEMS}
    for i, e in enumerate(ev):
        rng = np.random.default_rng([SEED, int(e["b"] * 1000), int(e["m"] or 0), i % 7, zlib.crc32(e["inst"].encode()) % 1000])
        s0 = int(round(e["db"] * SPB + e["jit"] * SR))
        inst, v = e["inst"], e["v"]
        if inst == "pad": sig = pad_note(e["m"], e["d"] * BEAT, e["b"], rng)
        elif inst == "sub": sig = sub_note(e["m"], e["d"] * BEAT, v, e["att"])
        elif inst == "thump": sig = thump(v, e["kind"])
        elif inst == "tick": sig = tick(v, mtof(e["m"]) if e["m"] else 0, e["muted"], rng)
        elif inst == "brush": sig = brush(v, rng)
        elif inst == "shaker": sig = shaker(v, rng)
        elif inst in ("marimba", "marimba_f"): sig = marimba(e["m"], v, rng)
        elif inst == "kalimba": sig = kalimba(e["m"], v, rng)
        elif inst == "bell": sig = bell(e["m"], v, rng)
        elif inst == "hit": sig = hit(v, rng)
        elif inst == "brass": sig = brass(e["m"], e["d"] * BEAT, e.get("first", False), rng)
        place(st[STEM_OF[inst]], sig, s0, e.get("pan", 0.0))
    # texture: paper-and-tape bed, automation follows the SOURCE timeline
    rng = np.random.default_rng(SEED + 1)
    w = rng.standard_normal((N, 2))
    W = np.fft.rfft(w, axis=0); fr = np.fft.rfftfreq(N, 1 / SR); fr[0] = fr[1]
    pink = np.fft.irfft(W / np.sqrt(fr)[:, None], n=N, axis=0)
    pink = filt(pink, "bandpass", [120, 7000], 2)
    pink = peaking(pink, 2200, -8, 0.5)
    pink /= np.sqrt((pink ** 2).mean())
    hiss = filt(rng.standard_normal((N, 2)), "highpass", 6000, 2); hiss /= np.sqrt((hiss ** 2).mean())
    mono = 0.6 * pink.mean(axis=1, keepdims=True) + 0.4 * pink          # partly correlated
    bsrc = src_of_dst(segs, np.arange(N) / SPB)
    slow = 1 + 0.25 * np.sin(2 * np.pi * np.arange(N) / SR / 6.1 + 1.0) * np.sin(2 * np.pi * np.arange(N) / SR / 2.3)
    st["texture"] = (mono * 0.05 + hiss * 0.012) * (10 ** (kf(TEX_DB, bsrc) / 20) * slow)[:, None]
    # carve 1-4 kHz room for the SFX on tonal stems, reverb, DC block
    ir = reverb_ir(np.random.default_rng(SEED + 2))
    sends = {"pad": 0.22, "sub": 0.0, "pulse_perc": 0.10, "melody": 0.30, "texture": 0.0, "finale": 0.22}
    for k in STEMS:
        x = st[k]
        if k in ("pad", "melody", "finale"):
            x = peaking(x, 2500, -6, 0.8); x = filt(x, "lowpass", 5000, 2)
        if k == "sub":
            x = filt(x, "lowpass", 120, 4); x = x.mean(axis=1, keepdims=True).repeat(2, axis=1)
        x = add_reverb(x, ir, sends[k])
        x = filt(x, "highpass", 25 if k == "sub" else 30, 2, zero=True)
        st[k] = x
    # global edges: 5 ms digital silence at both ends, short ramp in, clean tail by the end
    T = N / SR; t = np.arange(N) / SR
    g = np.ones(N)
    g[:EDGE] = 0; g[EDGE:EDGE + 480] = 0.5 - 0.5 * np.cos(np.pi * np.arange(480) / 480)
    f0 = T - FADE[version]; f1 = T - EDGE / SR
    m = (t >= f0) & (t < f1); g[m] *= 0.5 + 0.5 * np.cos(np.pi * (t[m] - f0) / (f1 - f0))
    g[t >= f1] = 0
    for k in STEMS: st[k] = st[k] * g[:, None] - 0  # same curve on every stem
    return st, ev

# stem balance (dB) before the common loudness gain
BAL = {"pad": 0.0, "sub": 1.0, "pulse_perc": 2.0, "melody": 1.0, "texture": 0.0, "finale": 0.0}

# --------------------------------------------------------------------------------------
# Loudness, IO
# --------------------------------------------------------------------------------------
def lufs(x):
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]; a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]; a2 = [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    c = np.cumsum(np.concatenate([np.zeros((1, y.shape[1])), y ** 2]), axis=0)
    idx = np.arange(0, len(y) - blk + 1, hop)
    z = ((c[idx + blk] - c[idx]) / blk).sum(axis=1)
    l = -0.691 + 10 * np.log10(z + 1e-20); z = z[l > -70]
    if not len(z): return -99.0
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    z2 = z[(-0.691 + 10 * np.log10(z)) > rel]
    return -0.691 + 10 * np.log10(z2.mean())

def write_wav24(path, x):
    x = np.clip(x, -1.0, 1.0 - 2 ** -23)
    q = np.clip(np.round(x * 2 ** 23).astype(np.int32), -2 ** 23, 2 ** 23 - 1)
    b = np.ascontiguousarray(q.astype("<i4")).view(np.uint8).reshape(-1, 4)[:, :3].reshape(-1)
    data = b.tobytes(); ch = x.shape[1]
    hdr = b"RIFF" + (36 + len(data)).to_bytes(4, "little") + b"WAVE"
    hdr += b"fmt " + (16).to_bytes(4, "little") + (1).to_bytes(2, "little") + ch.to_bytes(2, "little")
    hdr += SR.to_bytes(4, "little") + (SR * ch * 3).to_bytes(4, "little") + (ch * 3).to_bytes(2, "little") + (24).to_bytes(2, "little")
    hdr += b"data" + len(data).to_bytes(4, "little")
    with open(path, "wb") as fh: fh.write(hdr + data)
    return q.astype(np.float64) / 2 ** 23

def read_wav24(path):
    raw = open(path, "rb").read()
    i = raw.find(b"data"); n = int.from_bytes(raw[i + 4:i + 8], "little")
    b = np.frombuffer(raw[i + 8:i + 8 + n], np.uint8).reshape(-1, 3)
    v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
    v = np.where(v >= 2 ** 23, v - 2 ** 24, v)
    return v.reshape(-1, 2).astype(np.float64) / 2 ** 23

def ffmpeg_measure(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", s).group(1))
    tp = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", s).group(1)
    lra = float(re.search(r"LRA:\s+(-?[\d.]+) LU", s).group(1))
    return {"integrated_lufs": I, "true_peak_dbtp": float(tp) if tp != "-inf" else -999.0, "lra_lu": lra}

# --------------------------------------------------------------------------------------
# Verification
# --------------------------------------------------------------------------------------
def spectrogram_png(x, path, title, nbeats):
    from PIL import Image, ImageDraw, ImageFont
    mono = x.mean(axis=1); N = len(mono)
    nfft, hop = 4096, 480
    win = np.hanning(nfft)
    pad = np.concatenate([np.zeros(nfft // 2), mono, np.zeros(nfft // 2)])
    frames = np.lib.stride_tricks.sliding_window_view(pad, nfft)[::hop][: N // hop]
    S = np.abs(np.fft.rfft(frames * win, axis=1)) / (win.sum() / 2)
    db = 20 * np.log10(S + 1e-9)
    W, H, ml, mt, mb = len(frames), 560, 64, 46, 34
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    fy = np.geomspace(25, 20000, H)[::-1]
    img = db[:, np.clip(np.searchsorted(freqs, fy), 0, len(freqs) - 1)].T
    v = np.clip((img + 110) / 95, 0, 1)
    stops = np.array([[11, 12, 14], [36, 64, 224], [124, 147, 255], [255, 116, 105], [250, 250, 248]]) / 255
    pos = np.linspace(0, 1, len(stops))
    rgb = np.stack([np.interp(v, pos, stops[:, c]) for c in range(3)], axis=-1)
    im = Image.new("RGB", (W + ml + 12, H + mt + mb), (250, 250, 248))
    im.paste(Image.fromarray((rgb * 255).astype(np.uint8)), (ml, mt))
    d = ImageDraw.Draw(im)
    try: font = ImageFont.load_default(size=13)
    except Exception: font = ImageFont.load_default()
    d.text((ml, 6), title + "  | log f 25 Hz-20 kHz, -110..-15 dBFS | coral lines = 1 kHz and 4 kHz (SFX band)", fill=(11, 12, 14), font=font)
    for f in (50, 100, 200, 500, 1000, 2000, 4000, 10000):
        y = mt + int(np.argmin(np.abs(fy - f)))
        col = (255, 116, 105) if f in (1000, 4000) else (120, 120, 120)
        d.line([(ml - 5, y), (ml + W, y)], fill=col, width=1)
        d.text((4, y - 7), f"{f/1000:g}k" if f >= 1000 else str(f), fill=(11, 12, 14), font=font)
    px_per_beat = SPB / hop
    scenes = SCENES if nbeats == 90 else [(f"src{s}-{e}", d0, d0 + (e - s), "") for s, e, d0, _ in timeline(30 if nbeats == 45 else 15)]
    for sid, b0, b1, _ in scenes:
        xx = ml + int(b0 * px_per_beat)
        d.line([(xx, mt - 14), (xx, mt + H)], fill=(11, 12, 14), width=1)
        d.text((xx + 3, mt - 16), sid, fill=(36, 64, 224), font=font)
    for b in range(0, nbeats + 1, 2):
        xx = ml + int(b * px_per_beat)
        d.line([(xx, mt + H), (xx, mt + H + (8 if b % 10 == 0 else 4))], fill=(11, 12, 14))
        if b % 10 == 0: d.text((xx - 6, mt + H + 12), f"b{b}", fill=(11, 12, 14), font=font)
    im.save(path)

def detect_onsets(x, fc=200.0):
    from scipy.ndimage import uniform_filter1d
    lp = signal.sosfiltfilt(sosf("lowpass", fc, 4), x.mean(axis=1))
    env = uniform_filter1d(np.abs(signal.hilbert(lp)), 24)
    lag = int(0.002 * SR)
    dlt = np.zeros_like(env); dlt[lag:] = env[lag:] - env[:-lag]
    thr = 0.03 * env.max()
    pk, _ = signal.find_peaks(dlt, height=thr, distance=int(0.08 * SR))
    ons = []
    for p in pk:
        a = max(0, p - int(0.015 * SR)); m = a + int(np.argmin(env[a:p + 1]))
        top = env[p:p + int(0.02 * SR)].max()
        target = env[m] + 0.1 * (top - env[m])
        n = m + int(np.argmax(env[m:p + 1] >= target))
        ons.append(n)
    return np.array(ons), env

def checks(out, E):
    st60, mix60, ev60 = out[60][0], out[60][1], out[60][2]
    R = {}
    # beat grid: low band of pulse_perc holds only the thumps (structural hits)
    ons, _ = detect_onsets(st60["pulse_perc"])
    exp = sorted(int(round(e["db"] * SPB)) for e in ev60 if e["inst"] == "thump")
    sub16 = SPB // 4
    dev_grid = [(o - round(o / sub16) * sub16) / SR * 1000 for o in ons]
    dev_exp = []
    for o in ons:
        j = int(np.argmin([abs(o - x) for x in exp])); dev_exp.append((o - exp[j]) / SR * 1000)
    on_beat = [o for o in ons if abs(o - round(o / SPB) * SPB) < 0.002 * SR]
    beat_dev = [(o - round(o / SPB) * SPB) / SR * 1000 for o in on_beat]
    R["beat_grid"] = {"detected_onsets": len(ons), "expected_thumps": len(exp),
                      "max_abs_dev_to_16th_grid_ms": round(float(np.max(np.abs(dev_grid))), 3) if ons.size else None,
                      "onsets_on_beat_grid": len(on_beat),
                      "max_abs_dev_on_beat_ms": round(float(np.max(np.abs(beat_dev))), 3) if beat_dev else None,
                      "mean_dev_ms": round(float(np.mean(dev_grid)), 3) if ons.size else None,
                      "first_onsets_frames": [round(o / SR * 30, 3) for o in ons[:12]]}
    # harmony (score): notes per bar and key membership
    rows, bad = [], []
    for b0, nb in BARS:
        ms = sorted({e["m"] for e in ev60 if e["m"] is not None and b0 <= e["db"] < b0 + nb})
        oks = [nname(m) for m in ms if m % 12 not in KEY_PCS]
        rows.append({"bar_start_beat": b0, "beats": nb, "chord": "/".join(c[2] for c in CH if b0 <= c[0] < b0 + nb),
                     "notes": [f"{nname(m)} {mtof(m):.1f}Hz" for m in ms], "out_of_key": oks})
        bad += oks
    R["harmony_score"] = {"key": KEY, "bars": rows, "out_of_key_total": len(bad)}
    # harmony (audio): spectral peaks of pad+sub per bar, 50-700 Hz, within 24 dB of the bar max
    au = []
    x = (st60["pad"] + st60["sub"]).mean(axis=1)
    for b0, nb in BARS:
        s = int((b0 + 0.6) * SPB); e = int((b0 + nb) * SPB) - 2000
        seg = x[s:e] * np.hanning(e - s)
        nfft = 1 << int(np.ceil(np.log2(len(seg)) + 1))
        S = np.abs(np.fft.rfft(seg, nfft)); f = np.fft.rfftfreq(nfft, 1 / SR)
        band = (f > 50) & (f < 700)
        Sb = np.where(band, S, 0)
        pk, _ = signal.find_peaks(Sb, height=Sb.max() * 10 ** (-24 / 20), distance=int(4 / (SR / nfft)))
        pcs = []
        for p in pk:
            mm = 69 + 12 * np.log2(f[p] / 440); r = int(round(mm))
            pcs.append((round(float(f[p]), 1), PCN[r % 12], round(float((mm - r) * 100)), r % 12 in KEY_PCS))
        au.append({"bar_start_beat": b0, "peaks": [f"{a}Hz {n} {c:+d}c{'' if ok else ' OUT'}" for a, n, c, ok in pcs],
                   "out_of_key": [n for a, n, c, ok in pcs if not ok]})
    R["harmony_audio_pad_sub"] = au
    # files: counts, DC, edges, mono compatibility
    files = {}
    lh = {}
    for ver, beat in ((60, 84), (30, 39), (15, 18)):
        o, _ = detect_onsets(out[ver][0]["finale"])
        exp = beat * SPB
        n = o[np.argmin(np.abs(o - exp))] if len(o) else None
        lh[f"{ver}s"] = {"expected_frame": beat * FPB, "detected_frame": round(n / 1600, 3) if n is not None else None,
                         "dev_ms": round((n - exp) / SR * 1000, 3) if n is not None else None}
    R["landing_hits"] = lh
    for ver in (60, 30, 15):
        st, mix = out[ver][0], out[ver][1]
        for k, xx in list(st.items()) + [("mix_preview", mix)]:
            ms = xx.mean(axis=1, keepdims=True).repeat(2, axis=1)
            Ls, Lm = lufs(xx), lufs(ms)
            files[f"{ver}s/{k}"] = {"samples": int(len(xx)), "dc": [float(f"{v:.2e}") for v in xx.mean(axis=0)],
                                   "first5ms_max": float(np.abs(xx[:EDGE]).max()), "last5ms_max": float(np.abs(xx[-EDGE:]).max()),
                                   "lufs_internal": round(Ls, 2), "mono_minus_stereo_db": round(Lm - Ls, 2) if Ls > -90 else None,
                                   "lr_correlation": round(float(np.corrcoef(xx[:, 0], xx[:, 1])[0, 1]), 3) if xx.std() > 0 else None}
    R["files"] = files
    return R

# --------------------------------------------------------------------------------------
def nb2f(b): return int(round(b * FPB))

def write_json(path, o):
    with open(path, "w") as fh: json.dump(o, fh, indent=1)

def arrangement(sync, E):
    segs = timeline(30)
    bars = []
    for i, (b0, nb) in enumerate(BARS):
        sc = [s[0] for s in SCENES if s[1] <= b0 < s[2]][0]
        bars.append({"bar": i + 1, "start_beat": b0, "beats": nb, "meter": f"{nb}/4", "start_frame": nb2f(b0),
                     "start_s": round(b0 * BEAT, 4), "scene_at_downbeat": sc,
                     "chords": [{"beat": c[0], "frame": nb2f(c[0]), "chord": c[2], "pad_voicing": c[3], "sub": c[4]} for c in CH if b0 <= c[0] < b0 + nb]})
    sections = [
        ("Intro: paper and heartbeat", ["S0"], 0, 8, "Curious, sparse. Paper/tape bed, heartbeat lub-dub on beats 1-7, faint Dsus2 pad (filter closed). Motif (open form) on kalimba on the stamp."),
        ("The idea", ["C1", "L1"], 8, 20, "Warm pad opens (Gadd9, D/F#, A), soft pulse every beat, low marimba ostinato with dotted forward motion from beat 12, shaker offbeats above 5.6 kHz."),
        ("Try it", ["C2", "T1"], 20, 37, "Playful: Bm7-G. Marimba figure follows the slider 90->80 (beats 24.5-28, descending D5..D4 with the same ease in-out), motif in plucks at 28 over F#m7, crash replay: heartbeat returns, figure falls to B3, holds (the floor), rises into C3."),
        ("Set it up", ["C3", "A1"], 37, 56, "Confident build: Asus4 pickup with sub swell, sub bass enters on 40 (D-Bm-Gmaj7-A), quiet print press: muted woody 8th ticks, brushes on 2 and 4, low marimba ostinato under the UI."),
        ("Your own vault", ["C4", "A2"], 56, 68, "Calm, assured: wider pad (Dadd9, Gmaj7, Em7), keeper clock tick-tock on every beat, motif augmented an octave low at 60."),
        ("For agents", ["C5", "G1"], 68, 79, "Lighter, techy: restrained FM glass bells arpeggiating G6, D/F#, Em7 off the downbeats; clock at half level; air shaker."),
        ("Honesty", ["E1"], 79, 84, "Thins to a low A drone and a thin Asus4(add9) pad. No percussion, no melody. Suspended, no resolution."),
        ("Release", ["E2"], 84, 90, "Resolves to D exactly on beat 84 (frame 1680): final hit, low brass-like swell, D - G/D - D, motif resolves to the tonic on 88; clean fade to digital silence at 59.995 s."),
    ]
    motif_app = [{"where": "S0 stamp", "beat": sync["stamp_beat"], "frame": nb2f(sync["stamp_beat"]), "inst": "kalimba", "form": "open"},
                 {"where": "T1 pluck figure (after the slider)", "beat": 28, "frame": 560, "inst": "marimba + kalimba 8vb", "form": "open"},
                 {"where": "A2 augmented, octave low", "beat": 60, "frame": 1200, "inst": "kalimba", "form": "open, half speed"},
                 {"where": "E2 resolution", "beat": 84, "frame": 1680, "inst": "kalimba + marimba 8vb", "form": "resolved (ends on D4 at beat 88, frame 1760)"}]
    cut = []
    for s, e, d, ex in segs:
        cut.append({"src_beats": [s, e], "dst_beats": [d, d + e - s], "src_frames": [nb2f(s), nb2f(e)], "dst_frames": [nb2f(d), nb2f(d + e - s)],
                    "src_scenes": [x[0] for x in SCENES if x[1] < e and x[2] > s], "excluded_instruments": ex})
    return {
        "title": "Floor launch video v2 score", "seed": SEED, "sample_rate": SR, "bit_depth": 24, "channels": 2,
        "key": KEY, "key_why": "D major: open, bright-but-not-sugary key whose relative minor (B minor) gives sober colour; the low D (73 Hz) and A (55 Hz) roots sit cleanly in the sub range below 120 Hz, and the melodic register F#3-A4 stays under 1 kHz, leaving 1-4 kHz to the SFX.",
        "tempo_bpm": BPM, "beat_s": BEAT, "beat_frames": FPB, "beat_samples": SPB, "fps": 30,
        "length": {"60s": {"beats": 90, "frames": 1800, "samples": N60}, "30s": {"beats": 45, "frames": 900, "samples": N30}},
        "meter_note": "Mixed meter (4/4 with one 5/4 at the crash, 3/4 at C3 and G1 end, 5/4 at E1, 2/4 tail) so every section change is a bar downbeat.",
        "sync_source": sync["source"],
        "motif": {"notes": MOTIF, "rhythm_beats": MOTIF_RHY, "resolved_form": MOTIF_RES,
                  "degrees": "3-5-6-5-2 (open) / 3-5-6-5-1 (resolved)", "appearances": motif_app},
        "scenes": [{"id": s, "beats": [b0, b1], "frames": [nb2f(b0), nb2f(b1)], "name": n} for s, b0, b1, n in SCENES],
        "sections": [{"name": n, "scenes": sc, "beats": [b0, b1], "frames": [nb2f(b0), nb2f(b1)], "music": txt} for n, sc, b0, b1, txt in sections],
        "bars": bars,
        "sync_points": {"stamp_motif_beat": sync["stamp_beat"], "slider_figure_beats": [round((sync.get("slider") or [490])[0] / 20, 3), round((sync.get("slider") or [0, 560])[min(9, len(sync.get("slider") or [0,560]) - 1)] / 20, 3)], "slider_figure_frames": [(sync.get("slider") or [490])[0], (sync.get("slider") or [0, 560])[min(9, len(sync.get("slider") or [0,560]) - 1)]], "t1_chip_clicks_frames": sync.get("t1_clicks"), "e2_lockup_stamp_frame": sync.get("e2_stamp"),
                        "crash_heartbeat_beats": [30, 37], "station_arrivals_frames": {x["id"]: x["arrive"] for x in sync.get("stations", [])}, "station_focus_lock_frames": {x["id"]: x["focus_lock"] for x in sync.get("stations", [])}, "bass_entry_beat": 40, "e1_suspension_beat": 79, "final_hit_beat": 84,
                        "final_hit_frame": 1680, "final_hit_s": 56.0, "tail_silent_from_s": 59.995},
        "cut_30s": {"segments": cut, "landing_beat_30s": 39, "landing_frame_30s": 780, "landing_s_30s": 26.0,
                    "edit_points_dst_beats": [4, 16, 31, 34],
                    "method": "Re-rendered from the same note events: each kept segment's notes are re-timed (dst = src - src_start + dst_start); phrases are kept whole (anchored by phrase start) and tails ring over the edit, so every join is a musical edit on a bar line, not a fade.",
                    "picture_note": "Picture order matches SCRIPT.md 30 s cut: S0 (4) | C2 label + T1 (12) | C3 label + A1 (15) | bridge bar (3) | E1 (5) | E2 (6). If the picture editor uses other lengths, move whole bars."},
        "stems": {k: f"{k}.wav" for k in STEMS},
    }

def duck_hints(sync):
    H = []
    def h(f0, f1, why, density, music):
        H.append({"frames": [f0, f1], "seconds": [round(f0 / 30, 3), round(f1 / 30, 3)], "beats": [round(f0 / FPB, 2), round(f1 / FPB, 2)],
                  "sfx": why, "density": density, "music_in_arrangement": music})
    sb = nb2f(sync["stamp_beat"])
    h(0, 40, "floor line draw, paper", "low", "texture + heartbeat only")
    h(sb - 4, sb + 30, "lockup stamp", "high", "kalimba motif (F#4-B4, <500 Hz fundamentals), no pad attack")
    h(60, 160, "headline word reveals on beats", "medium", "heartbeat + faint pad, no melody after the motif")
    for f, n in ((160, "C1"), (400, "C2"), (740, "C3"), (1120, "C4"), (1360, "C5"), (1580, "E1")):
        h(f - 10, f + 40, f"camera move + {n} card arrival + word reveals", "high", "melody rests on the first 2 beats of every card; pad only changes chord on the downbeat")
    h(220, 400, "L1 landing scroll, cursor to nav", "medium", "low marimba ostinato D3-D4 only")
    sl = sync.get("slider") or [490, 560]
    h(sl[0] - 8, sl[-1] if len(sl) < 11 else sl[9], "T1 slider drag detents (real slider_step cues)", "high", "marimba figure follows the slider (fundamentals 294-587 Hz), carved -6 dB at 2.5 kHz")
    c = sync.get("t1_clicks") or [610, 664]
    h(c[0] - 4, c[0] + 14, "COVID crash chip click", "high", "motif note on 29.5 is soft")
    h(c[-1] - 4, c[-1] + 14, "2022 bear market chip click", "high", "falling figure, low register")
    h(800, 1120, "A1 builder clicks, review, confirm", "high", "sub + muted ticks <1.3 kHz + low ostinato A2-D4; no upper melody")
    h(1180, 1360, "A2 position and keeper", "medium", "steady clock ticks (A4/D5, lowpassed 1.8 kHz), motif low (F#3-B3)")
    h(1420, 1580, "G1 agents page + callout", "medium", "FM bells off the downbeats, lowpassed 2.6 kHz, restrained")
    h(1670, 1735, "E2 end card arrival, lockup stamp at 1720, final hit", "high", "music final hit is ON beat 84 (frame 1680): SFX may layer, mixer should not duck the hit itself")
    if sync["cue_frames"]:
        H.append({"note": "cue frames read from v2/cues.json", "frames": [f for f, _ in sync["cue_frames"]][:400]})
    return H

def cut_json(ver):
    segs = timeline(ver); N = NLEN[ver]
    o = {"version": f"{ver}s", "fps": 30, "beat_frames": FPB, "frames": N // 1600, "samples": N, "seconds": round(N / SR, 4),
         "segments": [{"src_beats": [s, e], "dst_beats": [d, d + e - s], "src_frames": [nb2f(s), nb2f(e)],
                       "dst_frames": [nb2f(d), nb2f(d + e - s)], "frame_offset_dst_minus_src": nb2f(d - s),
                       "src_scenes": [x[0] for x in SCENES if x[1] < e and x[2] > s], "excluded_instruments": ex} for s, e, d, ex in segs],
         "edit_points_dst_frames": [nb2f(d) for s, e, d, ex in segs][1:],
         "method": "Musical edit: the same note events re-timed per segment (dst = src + offset), cuts on bar lines/beats, phrases kept whole, release and reverb tails ring across each edit; no crossfades.",
         "rule": "master frame f inside a segment's src_frames maps to cut frame f + frame_offset_dst_minus_src"}
    if ver == 15:
        o["picture_sync"] = {"hook_word_groups_frames": [0, 20, 40], "hook_music": "src beats 0-4 (S0: Dsus2 pad, heartbeat from beat 1, kalimba motif F#4-A4-B4-A4-E4 from cut beat 2 = frame 40, audible by 1.4 s)",
                             "slider_figure_frames": [nb2f(4.5), nb2f(8)], "motif_in_plucks_frame": nb2f(8), "covid_chip_frame": nb2f(9.5),
                             "app_bass_entry_frame": nb2f(11), "E1_frame": 320, "E2_landing_hit_frame": 360, "motif_resolves_D4_frame": 400,
                             "tail_digital_silence_from_frame": 440 - 0.15, "tail_fade_s": [round(N / SR - FADE[15], 3), round((N - EDGE) / SR, 3)],
                             "end_card_extras": "factory address and floor.ayush.works need no music cue (SFX: a soft typing tick at most)"}
    return o

def main():
    check = "--no-check" not in sys.argv
    sync = load_sync()
    E = build_score(sync)
    for d in ("30s", "15s", "spec"): os.makedirs(os.path.join(HERE, d), exist_ok=True)
    out = {}
    for ver in (60, 30, 15):
        st, ev = render(E, ver)
        for k in STEMS: st[k] *= 10 ** (BAL[k] / 20)
        mix = sum(st[k] for k in STEMS)
        g = 10 ** ((-18.3 - lufs(mix)) / 20)
        d = HERE if ver == 60 else os.path.join(HERE, f"{ver}s")
        suf = "" if ver == 60 else f"_{ver}s"
        q = {}
        for k in STEMS: q[k] = write_wav24(os.path.join(d, f"{k}{suf}.wav"), st[k] * g)
        mixq = write_wav24(os.path.join(d, f"music_mix_preview{suf}.wav"), sum(q[k] for k in STEMS))
        out[ver] = (q, mixq, ev, g)
        print(f"{ver}s rendered, gain {20*np.log10(g):+.2f} dB", flush=True)
    write_json(os.path.join(HERE, "arrangement.json"), arrangement(sync, E))
    write_json(os.path.join(HERE, "cut15.json"), cut_json(15))
    write_json(os.path.join(HERE, "30s", "cut30.json"), cut_json(30))
    write_json(os.path.join(HERE, "duck_hint.json"), {"fps": 30, "beat_frames": FPB, "hints": duck_hints(sync)})
    write_json(os.path.join(HERE, "score_events.json"), out[60][2])
    if not check: return
    R = checks(out, E)
    R["ffmpeg"] = {}
    for ver in (60, 30, 15):
        d = HERE if ver == 60 else os.path.join(HERE, f"{ver}s")
        for f in sorted(os.listdir(d)):
            if f.endswith(".wav"): R["ffmpeg"][f"{ver}s/{f}"] = ffmpeg_measure(os.path.join(d, f))
    q60, mix60 = out[60][0], out[60][1]
    for k in STEMS: spectrogram_png(q60[k], os.path.join(HERE, "spec", f"{k}.png"), f"60s stem: {k}.wav", 90)
    spectrogram_png(mix60, os.path.join(HERE, "spec", "mix_preview.png"), "60s music_mix_preview.wav", 90)
    spectrogram_png(out[30][1], os.path.join(HERE, "spec", "mix_preview_30s.png"), "30s music_mix_preview_30s.wav", 45)
    spectrogram_png(out[15][1], os.path.join(HERE, "spec", "mix_preview_15s.png"), "15s music_mix_preview_15s.wav", 22)
    write_json(os.path.join(HERE, "measure.json"), R)
    print(json.dumps(R["beat_grid"], indent=1)); print(json.dumps(R["landing_hits"], indent=1))
    print("score out-of-key notes:", R["harmony_score"]["out_of_key_total"])
    print("audio out-of-key peaks:", [(a["bar_start_beat"], a["out_of_key"]) for a in R["harmony_audio_pad_sub"] if a["out_of_key"]])
    for k, v in R["ffmpeg"].items(): print(f"{k:40s} I={v['integrated_lufs']:6.1f}  TP={v['true_peak_dbtp']:6.1f}")
    for k, v in R["files"].items(): print(f"{k:22s} n={v['samples']} dc={v['dc']} e0={v['first5ms_max']:.1e} e1={v['last5ms_max']:.1e} mono={v['mono_minus_stereo_db']} corr={v['lr_correlation']}")

if __name__ == "__main__":
    main()
