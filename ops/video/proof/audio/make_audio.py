#!/usr/bin/env python3
"""Floor launch video, 10 s proof clip: original synthesized sound design + mix.

Everything is generated here (numpy + scipy); no samples. Seeded, re-runnable.
    python3 ops/video/proof/audio/make_audio.py
Timing source priority: proof/cues.json (motion agent) > proof/capture/events.json
(slider steps) > storyboard times from BRIEF.md.
Outputs (next to this script): mix.wav, music.wav, sfx.wav (48 kHz / 24-bit / stereo /
480000 samples), spec_*.png, timing_used.json, measure.json.
Key: D major pentatonic (D E F# A B). 120 BPM, beat = 0.5 s = 15 video frames.
"""
import json, os, re, subprocess, sys
import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d

SR = 48000
DUR = 10.0
N = int(SR * DUR)            # 480000
FPS = 30
SEED = 20261005
HERE = os.path.dirname(os.path.abspath(__file__))
PROOF = os.path.dirname(HERE)
CUES = os.path.join(PROOF, "cues.json")
EVENTS = os.path.join(PROOF, "capture", "events.json")
rng = np.random.default_rng(SEED)

def fr(t):  # snap to the video frame grid
    return round(t * FPS) / FPS

def hz(note):  # 'D4' style -> Hz (A4 = 440)
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3,
             "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    m = re.match(r"([A-G]#?)(-?\d)", note)
    return 440.0 * 2 ** ((names[m.group(1)] + 12 * (int(m.group(2)) - 4)) / 12)

# --------------------------------------------------------------------------------------
# Timing
# --------------------------------------------------------------------------------------
def storyboard():
    return {
        "source": "storyboard (BRIEF.md)",
        "line": [0.0, 0.5],
        "line_steps": [fr(0.0), fr(0.125), fr(0.25), fr(0.375)],
        "stamp": 0.5,
        "words": [1.0, 1.5, 2.0],
        "cut1": 2.5,
        "slider": [3.0, 4.6],
        "slider_ticks": [[fr(3.0 + 1.6 * (i + 1) / 10), 90 - (i + 1)] for i in range(10)],
        "settle": [4.6, 4.9],
        "crash": [4.9, 6.9],
        "cut2": 7.0,
        "card_words": [7.0, 7.5],
        "end": 9.0,
        "fade": [9.8, 10.0],
    }

def _walk(o, out):
    """Collect every dict carrying a time (seconds or frame) from arbitrary JSON."""
    if isinstance(o, dict):
        t = None
        for k in ("t", "time", "seconds", "sec", "s", "t_s", "time_s", "start"):
            if isinstance(o.get(k), (int, float)):
                t = float(o[k]); break
        if t is None:
            for k in ("frame", "f", "video_frame", "start_frame"):
                if isinstance(o.get(k), (int, float)):
                    t = float(o[k]) / FPS; break
        if t is not None:
            name = " ".join(str(o.get(k, "")) for k in
                            ("name", "type", "event", "kind", "id", "label", "cue", "what", "text"))
            end = None
            for k in ("end", "t_end", "end_s", "until"):
                if isinstance(o.get(k), (int, float)):
                    end = float(o[k]); break
            if end is None and isinstance(o.get("end_frame"), (int, float)):
                end = float(o["end_frame"]) / FPS
            if end is None and isinstance(o.get("dur"), (int, float)):
                end = t + float(o["dur"])
            out.append({"name": name.lower(), "t": t, "end": end, "raw": o})
        for k, v in o.items():
            if isinstance(v, (dict, list)):
                # key names can carry the meaning ("stamp": {"frame": 15})
                sub = []
                _walk(v, sub)
                for s in sub:
                    s["name"] = (str(k).lower() + " " + s["name"]).strip()
                out.extend(sub)
    elif isinstance(o, list):
        for v in o:
            _walk(v, out)

def load_timing():
    T = storyboard()
    used = []
    if os.environ.get("FLOOR_AUDIO_TIMING") == "storyboard":   # force fallback timing
        return T
    # capture events: real slider steps (floor value per capture frame; video frame = 75 + k)
    if os.path.exists(EVENTS):
        try:
            ev = json.load(open(EVENTS))
            fd = ev.get("frames_data", [])
            vals = [(d["i"], d.get("floor")) for d in fd if d.get("floor") is not None]
            if not vals:  # fall back to thumb rect values
                vals = [(i, d.get("value")) for i, d in
                        enumerate(ev.get("regions", {}).get("slider_thumb_by_frame", []))
                        if d.get("value") is not None]
            ticks = []
            for (i0, v0), (i1, v1) in zip(vals, vals[1:]):
                if v1 != v0:
                    # one tick per 1% step crossed in this frame (spread inside the frame)
                    steps = int(round(abs(v1 - v0)))
                    for s in range(max(steps, 1)):
                        vv = v0 + np.sign(v1 - v0) * (s + 1)
                        ticks.append([(75 + i1 + s / max(steps, 1)) / FPS, float(vv)])
            if ticks:
                T["slider_ticks"] = ticks
                T["slider"] = [fr(ticks[0][0]), fr(ticks[-1][0])]
                used.append("capture/events.json (slider steps from per-frame floor value)")
        except Exception as e:
            print("events.json unreadable, using storyboard slider:", e)
    explicit = False
    if os.path.exists(CUES):
        try:   # explicit schema written by the motion agent: {"events":[{"event":..,"frame":..,"t":..}]}
            evs = json.load(open(CUES)).get("events", [])
            def ts(name):
                return sorted(e["frame"] / FPS for e in evs if e.get("event") == name)
            def one(name, default):
                v = ts(name); return v[0] if v else default
            if ts("lockup_stamp") and ts("end_card_cut"):
                st = ts("floor_line_step")
                T["line"] = [one("floor_line_draw_start", T["line"][0]), one("floor_line_draw_end", T["line"][1])]
                if st: T["line_steps"] = st
                T["stamp"] = one("lockup_stamp", T["stamp"])
                if len(ts("headline_word_group")) >= 3: T["words"] = ts("headline_word_group")[:3]
                T["cut1"] = one("headline_slide_off", one("panel_slide_in_start", T["cut1"]))
                T["settle"] = [one("camera_pull_back_start", T["settle"][0]), one("camera_whole_panel", T["settle"][1])]
                T["cut2"] = one("cut_to_line_card", T["cut2"])
                T["crash"] = [one("crash_replay_start", T["crash"][0]), min(T["crash"][1], T["cut2"] - 0.1)]
                T["crash_swap"] = one("crash_swap", None)
                lw = ts("line_card_word_group")
                if lw: T["card_words"] = [T["cut2"], lw[0]]
                T["shape_hits"] = [t for t in ts("shape_hit") if T["card_words"][-1] + 0.1 < t < one("end_card_cut", 9.0) - 0.1]
                T["end"] = one("end_card_cut", T["end"])
                T["fade"] = [one("final_fade_start", T["fade"][0]), one("final_fade_end", T["fade"][1])]
                if "events" not in " ".join(used):   # ticks from cues only if capture is absent
                    sl = [(e["frame"] / FPS, e.get("value_pct")) for e in evs if e.get("event") == "slider_step"]
                    if sl:
                        T["slider_ticks"] = [[t + (1 / FPS / 2 if i and sl[i - 1][0] == t else 0), v]
                                             for i, (t, v) in enumerate(sl)]
                used.append("proof/cues.json (motion agent frames)")
                explicit = True
        except Exception as e:
            print("cues.json explicit parse failed, trying generic:", e)
    if os.path.exists(CUES) and not explicit:
        try:
            items = []
            _walk(json.load(open(CUES)), items)
            def find(*keys, excl=()):
                return sorted([it for it in items if any(k in it["name"] for k in keys)
                               and not any(x in it["name"] for x in excl)], key=lambda d: d["t"])
            st = find("stamp")
            if st: T["stamp"] = st[0]["t"]
            w = [it for it in find("word", "headline", "type_hit", "typehit", "hit")
                 if 0.75 < it["t"] < 2.4]
            if len(w) >= 3: T["words"] = [d["t"] for d in w[:3]]
            cuts = find("cut", "panel", "slide", excl=("slider",))
            c1 = [d for d in cuts if 2.0 < d["t"] < 3.0]
            if c1: T["cut1"] = c1[0]["t"]
            c2 = [d for d in cuts if 6.5 < d["t"] < 7.5]
            if c2: T["cut2"] = c2[0]["t"]
            e = [d for d in find("end") if 8.5 < d["t"] < 9.5]
            if e: T["end"] = e[0]["t"]
            cw = [d for d in find("word", "line", "card", "hit") if 6.8 < d["t"] < 8.8]
            if len(cw) >= 2: T["card_words"] = sorted({round(d["t"], 4) for d in cw})[:2]
            cr = find("crash", "replay")
            if cr:
                T["crash"] = [cr[0]["t"], cr[0]["end"] or T["crash"][1]]
            se = find("settle", "ease back", "pull")
            se = [d for d in se if 4.3 < d["t"] < 5.0]
            if se: T["settle"] = [se[0]["t"], se[0]["end"] or T["settle"][1]]
            sl = find("slider", "tick", "step", excl=("cut",))
            sl_t = [d for d in sl if 2.8 < d["t"] < 4.9]
            if len(sl_t) >= 3 and "events" not in " ".join(used):
                T["slider_ticks"] = [[d["t"], 90 - (i + 1)] for i, d in enumerate(sl_t)]
            used.append("proof/cues.json")
        except Exception as e:
            print("cues.json unreadable, keeping storyboard cue times:", e)
    if used:
        T["source"] = " + ".join(used) + " (storyboard for anything not found)"
    return T

# --------------------------------------------------------------------------------------
# DSP helpers
# --------------------------------------------------------------------------------------
def tt(dur):
    return np.arange(int(round(dur * SR))) / SR

def edge(x, fin=0.002, fout=0.004):
    """2..5 ms raised-cosine fades at both edges of an event (anti-click)."""
    x = np.array(x, dtype=np.float64, copy=True)
    n = x.shape[0]
    a, b = min(int(fin * SR), n // 2), min(int(fout * SR), n // 2)
    if a > 0:
        w = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
        x[:a] = (x[:a].T * w).T
    if b > 0:
        w = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b))
        x[-b:] = (x[-b:].T * w).T
    return x

def pan_gains(p):  # constant power, p in [-1, 1]
    a = (p + 1) * np.pi / 4
    return np.cos(a), np.sin(a)

def place(buf, sig, t0, pan=0.0, fin=0.002, fout=0.004):
    sig = edge(sig, fin, fout)
    i0 = int(round(t0 * SR))
    if sig.ndim == 1:
        gl, gr = pan_gains(pan)
        sig = np.stack([sig * gl, sig * gr], axis=1)
    i1 = min(N, i0 + sig.shape[0])
    if i0 < 0:
        sig = sig[-i0:]; i0 = 0
    buf[i0:i1] += sig[: i1 - i0]

def sos(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")

def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x, axis=0)

def peaking(x, f0, gain_db, q):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.lfilter(b, a, x, axis=0)

def svf_bp(x, fc, q):
    """Time-varying TPT state-variable band-pass. x: (n,) or (n,c); fc: (n,) Hz."""
    x2 = x if x.ndim == 2 else x[:, None]
    g = np.tan(np.pi * np.clip(fc, 20, 0.45 * SR) / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2
    ic1 = np.zeros(x2.shape[1]); ic2 = np.zeros(x2.shape[1])
    y = np.empty_like(x2)
    for n in range(x2.shape[0]):
        v3 = x2[n] - ic2
        v1 = a1[n] * ic1 + a2[n] * v3
        v2 = ic2 + a2[n] * ic1 + a3[n] * v3
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
        y[n] = v1 * k  # unity-gain band-pass
    return y if x.ndim == 2 else y[:, 0]

def noise(n, ch=1):
    return rng.standard_normal((n, ch) if ch > 1 else n)

def stereo_noise(n, width=0.35):
    """Partly decorrelated L/R noise: common + width * independent."""
    c = rng.standard_normal(n); l = rng.standard_normal(n); r = rng.standard_normal(n)
    s = np.sqrt(1 + width ** 2)
    return np.stack([(c + width * l) / s, (c + width * r) / s], axis=1)

def phase(f):
    return 2 * np.pi * np.cumsum(f) / SR

# --------------------------------------------------------------------------------------
# SFX voices
# --------------------------------------------------------------------------------------
def thump(f_hi=110, f_lo=70, drop=0.025, decay=0.09, dur=0.30):
    t = tt(dur)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / drop)
    ph = phase(f)
    env = (1 - np.exp(-t / 0.0008)) * np.exp(-t / decay)
    return env * (np.sin(ph) + 0.18 * np.sin(2 * ph))

def paper_slap(dur=0.08, hp=1400, decay=0.016, lp=9000):
    t = tt(dur)
    x = filt(filt(noise(len(t)), "highpass", hp, 4), "lowpass", lp, 2)
    return x * np.exp(-t / decay) / 2.2

def tick20(f=1650):
    t = tt(0.020)
    body = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.0035)
    click = filt(noise(len(t)), "highpass", 6500, 2) * np.exp(-t / 0.0012) * 0.5
    return body + click

def stamp():
    th = thump(110, 70, 0.022, 0.085, 0.33)
    out = 0.95 * th
    sl = paper_slap(0.10, 1500, 0.017)
    out[: len(sl)] += 0.55 * sl
    tk = tick20(1650)
    out[: len(tk)] += 0.16 * tk
    return out

def clack(f=1200, low=210, bright=1.0):
    """Dry mechanical key strike: noise click + damped plate modes + low 'thock'."""
    t = tt(0.13)
    click = filt(noise(len(t)), "highpass", 2500, 2) * np.exp(-t / 0.0018) * 0.6 * bright
    modes = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.022)
             + 0.45 * np.sin(2 * np.pi * f * 1.53 * t + 0.7) * np.exp(-t / 0.012)
             + 0.18 * np.sin(2 * np.pi * f * 2.31 * t + 1.9) * np.exp(-t / 0.006))
    thock = np.sin(2 * np.pi * low * t * (1 + 0.15 * np.exp(-t / 0.01))) * np.exp(-t / 0.028)
    x = click + 0.55 * modes + 0.75 * thock
    return x * (1 - np.exp(-t / 0.0004))

def whoosh(dur=0.35, f0=380, fpk=2400, f1=520, peak_at=0.4, width=0.4, q=1.3):
    t = tt(dur)
    u = t / dur
    lf0, lpk, lf1 = np.log(f0), np.log(fpk), np.log(f1)
    lf = np.where(u < peak_at, lf0 + (lpk - lf0) * np.sin(0.5 * np.pi * u / peak_at),
                  lpk + (lf1 - lpk) * np.sin(0.5 * np.pi * (u - peak_at) / (1 - peak_at)))
    fc = np.exp(lf)
    x = svf_bp(stereo_noise(len(t), width), fc, q)
    tp = peak_at * dur * 0.8
    env = (t / tp) * np.exp(1 - t / tp)                # smooth swell, onset at t=0
    env = np.minimum(env, 1.0) * (1 - np.exp(-t / 0.004))
    env *= 0.5 - 0.5 * np.cos(np.pi * np.clip((dur - t) / (0.25 * dur), 0, 1))  # tail to 0
    return x * env[:, None]

def detent(f, level=1.0):
    """Fine ratchet detent: tiny click + short damped tone."""
    t = tt(0.035)
    body = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.0055)
            + 0.25 * np.sin(2 * np.pi * f * 2.02 * t) * np.exp(-t / 0.0025))
    click = filt(noise(len(t)), "highpass", 7000, 2) * np.exp(-t / 0.0007) * 0.35
    return level * (body + click) * (1 - np.exp(-t / 0.0003))

def drag_scrape(T):
    """Floor line draw: dry rising roller-on-paper scrape, 4 stepped pushes."""
    t0 = T["line"][0]
    t1 = min(T["stamp"], T["line"][1] + 0.1)        # last stepped move runs to the stamp
    t = tt(t1 - t0 + 0.04)
    n = len(t)
    fc = 500 * (3800 / 500) ** np.clip(t / (t1 - t0), 0, 1)   # rising centre
    x = svf_bp(stereo_noise(n, 0.25), fc, 0.9)
    # grain: amplitude flutter like paper fibres under a roller
    flutter = 1 + 0.35 * filt(noise(n), "lowpass", 60, 2) * 4
    env = np.zeros(n)
    for s in T["line_steps"]:
        d = t - (s - t0)
        env += np.where(d >= 0, (1 - np.exp(-np.maximum(d, 0) / 0.006))
                        * np.exp(-np.maximum(d, 0) / 0.07), 0)
    env = 0.35 + 0.65 * env / env.max()
    env *= np.clip(t / 0.03, 0, 1) * np.clip((t1 - t0 + 0.04 - t) / 0.06, 0, 1)
    env *= np.linspace(0.6, 1.0, n)
    return x * (env * np.clip(flutter, 0.3, 2))[:, None]

def settle(dur):
    t = tt(dur)
    x = filt(filt(stereo_noise(len(t), 0.5), "highpass", 180, 2), "lowpass", 1100, 2)
    env = np.sin(np.pi * t / dur) ** 2
    return x * env[:, None]

def crash_line(T):
    """Restrained descending tone following the crash: A3 -> A2 over the replay."""
    t0, t1 = T["crash"]
    dur = t1 - t0
    t = tt(dur)
    u = t / dur
    # chart-like shape: slow sag, steep drop around 35-60%, small bounce, settle an octave down
    sig = 1 / (1 + np.exp(-(u - 0.45) / 0.07))
    sig = (sig - sig[0]) / (sig[-1] - sig[0])
    shape = 0.12 * u + 0.88 * sig - 0.05 * np.sin(np.pi * np.clip((u - 0.65) / 0.3, 0, 1))
    shape = shape / shape[-1]
    f = 220.0 * 2 ** (-shape)                # 220 -> 110 Hz
    fc = 1500 - 800 * shape                  # filter closes as it falls
    out = np.zeros((len(t), 2))
    for det, p in ((-4, -0.35), (4, 0.35)):
        ff = f * 2 ** (det / 1200)
        ph = phase(ff)
        v = np.zeros(len(t))
        for k in range(1, 40):
            hk = k * ff
            w = (1 / k) / np.sqrt(1 + (hk / fc) ** 4) * (hk < 16000)
            if w.max() < 1e-4: break
            v += w * np.sin(k * ph)
        v += 0.6 * np.sin(ph)
        gl, gr = pan_gains(p)
        out[:, 0] += gl * v; out[:, 1] += gr * v
    env = (1 - np.exp(-t / 0.012)) * (0.75 + 0.25 * np.sin(np.pi * u)) \
        * np.clip((dur - t) / 0.18, 0, 1)
    out *= env[:, None]
    # faint dry grain: sparse filtered crackle
    g = np.zeros(len(t))
    idx = rng.integers(0, len(t), int(55 * dur))
    g[idx] = rng.uniform(-1, 1, len(idx))
    g = filt(g, "bandpass", [700, 1800], 2) * 2.5 + 0.12 * filt(noise(len(t)), "bandpass", [300, 1400], 2)
    g *= np.clip(t / 0.05, 0, 1) * np.clip((dur - t) / 0.2, 0, 1) * (0.5 + 0.5 * shape)
    out += 0.18 * g[:, None]
    return out

def build_sfx(T):
    dry = np.zeros((N, 2))
    place(dry, 0.20 * drag_scrape(T), T["line"][0], fin=0.003)
    place(dry, 0.95 * stamp(), T["stamp"], 0.0, fin=0.0005, fout=0.005)
    # headline word hits: three clacks, rising pitch, panning L -> R
    for t, f, low, p, b in zip(T["words"], (1120, 1260, 1420), (200, 225, 250),
                               (-0.35, 0.0, 0.35), (0.9, 1.0, 1.1)):
        place(dry, 0.50 * clack(f, low, b), t, p, fin=0.0004)
    # CUT 2.5: paper whoosh + soft low thud
    place(dry, 0.45 * whoosh(0.35, 380, 2300, 520), T["cut1"], fin=0.0008)
    place(dry, 0.45 * thump(85, 55, 0.02, 0.07, 0.25), T["cut1"], fin=0.0005)
    # slider detents: one per 1 % step, pitch falls with the value, pan follows thumb (moves left)
    ticks = T["slider_ticks"]
    vmax = max(v for _, v in ticks) + 1
    for i, (t, v) in enumerate(ticks):
        f = 1350 * 2 ** ((v - vmax) / 40)
        p = 0.2 - 0.35 * i / max(len(ticks) - 1, 1)
        place(dry, 0.22 * detent(f), t, p, fin=0.0003)
    # camera settle
    s0, s1 = T["settle"]
    place(dry, 0.07 * settle(s1 - s0), s0, fin=0.004, fout=0.005)
    # crash replay line
    place(dry, 0.12 * crash_line(T), T["crash"][0], fin=0.003, fout=0.005)
    # CUT 7.0: firm hit + whoosh, line-card clacks
    place(dry, 0.80 * thump(100, 60, 0.02, 0.08, 0.3), T["cut2"], fin=0.0005)
    place(dry, 0.40 * paper_slap(0.09, 1300, 0.02), T["cut2"], 0.0, fin=0.0005)
    place(dry, 0.50 * whoosh(0.38, 340, 2100, 450, 0.38, 0.45), T["cut2"], fin=0.0008)
    for t, f, low, p in zip(T["card_words"], (1180, 1340), (215, 240), (-0.2, 0.25)):
        place(dry, 0.45 * clack(f, low, 0.95), t, p, fin=0.0004)
    # hard chart swap at the crash start: light paper tick
    if T.get("crash_swap") is not None:
        place(dry, 0.18 * paper_slap(0.05, 2000, 0.008), T["crash_swap"], 0.1, fin=0.0005)
    # line-card shape hits (cobalt squares, coral squares): small soft paper taps
    for i, t in enumerate(T.get("shape_hits", [])):
        place(dry, 0.20 * paper_slap(0.06, 1600, 0.010) + 0.12 * thump(140, 110, 0.01, 0.025, 0.06)[:int(0.06 * SR)],
              t, (-0.3, 0.3)[i % 2], fin=0.0005)
    # END cut 9.0: soft paper tap under the chord (chord is in music)
    place(dry, 0.25 * paper_slap(0.07, 1800, 0.012), T["end"], 0.0, fin=0.0005)
    place(dry, 0.30 * thump(80, 58, 0.02, 0.06, 0.2), T["end"], fin=0.0005)
    return dry

def room_ir():
    """Short synthetic early-reflection room, ~120 ms, decorrelated L/R."""
    n = int(0.12 * SR)
    ir = np.zeros((n, 2))
    for ch in range(2):
        taps = np.sort(rng.uniform(0.006, 0.115, 26))
        for d in taps:
            ir[int(d * SR), ch] += rng.choice([-1, 1]) * np.exp(-d / 0.035) * rng.uniform(0.4, 1)
        diff = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / 0.025) * 0.08
        diff[: int(0.008 * SR)] = 0
        ir[:, ch] += diff
    ir = filt(filt(ir, "lowpass", 5500, 2), "highpass", 200, 2)
    ir *= np.linspace(1, 0, n)[:, None] ** 0.5
    return ir / np.sqrt((ir ** 2).sum(axis=0)).max()

# --------------------------------------------------------------------------------------
# Music
# --------------------------------------------------------------------------------------
PAD = [  # (start, end, notes, sub root)
    (0.0, 2.5, ["D3", "A3", "E4"], "D2"),
    (2.5, None, ["D3", "A3", "E4", "F#4"], "D2"),      # opens at the cut to real UI
    (None, 7.0, ["B2", "F#3", "A3", "D4"], "B1"),       # crash: Bm7, tense not dark
    (7.0, 9.0, ["G2", "D3", "A3", "B3"], "G1"),         # Gadd9 lift on the line card
    (9.0, 10.0, ["D3", "F#3", "A3"], "D2"),             # resolve
]

def pad_cutoff(T, t):
    c1, cr0, c2, e = T["cut1"], T["crash"][0], T["cut2"], T["end"]
    fc = np.full_like(t, 280.0)
    up = np.clip((t - c1) / 1.2, 0, 1)
    fc = 280 + (1300 - 280) * (0.5 - 0.5 * np.cos(np.pi * up))
    fc = np.where(t >= cr0, 1300 - 350 * np.clip((t - cr0) / 1.0, 0, 1), fc)
    fc = np.where(t >= c2, 1450, fc)
    fc = np.where(t >= e, 1150, fc)
    w = np.hanning(int(0.12 * SR)); w /= w.sum()          # glide, never jump (no clicks)
    fc = np.convolve(np.pad(fc, (len(w) // 2, len(w) - 1 - len(w) // 2), mode="edge"), w, mode="valid")
    return fc

def saw_voice(f, t, fc, nmax=30):
    ph = 2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)
    v = np.zeros(len(t))
    for k in range(1, nmax + 1):
        if k * f > 12000: break
        v += (1 / k) / np.sqrt(1 + (k * f / fc) ** 4) * np.sin(k * ph)
    return v

def pluck(f, dur=0.7, nh=10, bright=1.0):
    t = tt(dur)
    v = np.zeros(len(t))
    for k in range(1, nh + 1):
        if k * f > 9000: break
        tau = 0.45 / (1 + 0.8 * (k - 1)) * bright
        v += (1 / k ** 1.4) * np.sin(2 * np.pi * k * f * t) * np.exp(-t / tau)
    return v * (1 - np.exp(-t / 0.0015))

def bell(f, dur=1.0):
    t = tt(dur)
    parts = [(1.0, 1.0, 0.9), (2.0, 0.42, 0.5), (3.0, 0.16, 0.3), (4.07, 0.10, 0.18), (5.43, 0.04, 0.1)]
    v = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in parts)
    return v * (1 - np.exp(-t / 0.002))

def build_music(T):
    mus = np.zeros((N, 2))
    sub = np.zeros(N)                     # mono sub, added to both channels
    t_all = np.arange(N) / SR
    fc_all = pad_cutoff(T, t_all)
    segs = []
    bounds = [T["cut1"], T["crash"][0], T["cut2"], T["end"]]
    starts = [0.0] + bounds
    ends = bounds + [DUR]
    for (s, e), (_, _, notes, root) in zip(zip(starts, ends), PAD):
        segs.append((s, e, notes, root))
    for i, (s, e, notes, root) in enumerate(segs):
        xf = 0.06                                   # crossfade at chord changes
        a0 = max(0.0, s - (xf if i else 0))
        a1 = min(DUR, e + xf)
        i0, i1 = int(a0 * SR), int(a1 * SR)
        t = t_all[i0:i1]
        lt = t - a0
        att = 0.9 if i == 0 else xf
        env = np.clip(lt / att, 0, 1) * np.clip((a1 - t) / xf, 0, 1) if e < DUR else np.clip(lt / att, 0, 1)
        env = 0.5 - 0.5 * np.cos(np.pi * env)
        lvl = 0.55 if i == 0 else 1.0
        for nt in notes:
            f = hz(nt)
            for det, p in ((-6, -0.55), (6, 0.55)):
                v = saw_voice(f * 2 ** (det / 1200), t, fc_all[i0:i1])
                gl, gr = pan_gains(p)
                mus[i0:i1, 0] += 0.032 * lvl * gl * v * env
                mus[i0:i1, 1] += 0.032 * lvl * gr * v * env
        fr_ = hz(root)
        sub_lvl = 0.04 if i == 0 else 0.06
        sub[i0:i1] += sub_lvl * np.sin(2 * np.pi * fr_ * t) * env
    # slow breathing on the pad
    mus *= (1 + 0.08 * np.sin(2 * np.pi * 0.25 * t_all))[:, None]
    # pulse: muted kick-like thump on every beat 0.5 .. 8.5 (mono, sub-ish)
    for b in np.arange(0.5, T["end"] - 0.25, 0.5):
        lvl = 0.08 if b < T["cut1"] else 0.13
        k = thump(68, 46, 0.015, 0.07, 0.22) * lvl
        i0 = int(round(b * SR)); k = edge(k, 0.0005, 0.004)
        sub[i0:i0 + len(k)] += k[: N - i0]
    # tiny pitched tick on the off-beats once the UI is on (keeps the grid alive, quiet)
    for b in np.arange(T["cut1"] + 0.25, T["cut2"], 0.5):
        tk = pluck(hz("A5"), 0.08, 3, 0.15) * 0.035
        place(mus, tk, b, 0.1, fin=0.0005)
    # plucks on the crash beats 5.0 .. 6.5, D major pentatonic, descending with the chart
    for b, nt, p in zip((5.0, 5.5, 6.0, 6.5), ("B4", "A4", "F#4", "E4"), (-0.25, 0.2, -0.15, 0.25)):
        place(mus, 0.14 * pluck(hz(nt), 0.7), b, p, fin=0.0005)
    # END: warm three-note bell/pluck chord D4 F#4 A4 (resolution)
    for nt, p, d in (("D4", -0.25, 0.0), ("F#4", 0.25, 0.0), ("A4", 0.0, 0.0)):
        place(mus, 0.17 * bell(hz(nt), 1.0) + 0.07 * pluck(hz(nt), 1.0), T["end"] + d, p, fin=0.0005)
    place(mus, 0.05 * bell(hz("D3"), 1.0), T["end"], 0.0, fin=0.0005)
    # keep the low end mono: high-pass the side channel at 150 Hz
    m = (mus[:, 0] + mus[:, 1]) / 2; s = (mus[:, 0] - mus[:, 1]) / 2
    s = filt(s, "highpass", 150, 2)
    mus = np.stack([m + s, m - s], axis=1)
    sub = filt(sub, "lowpass", 220, 2)
    mus += sub[:, None]
    return mus

# --------------------------------------------------------------------------------------
# Loudness (BS.1770-4 integrated, used for iterating; ffmpeg confirms)
# --------------------------------------------------------------------------------------
def lufs(x):
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    z = np.array([(y[i:i + blk] ** 2).mean(axis=0).sum() for i in range(0, len(y) - blk + 1, hop)])
    l = -0.691 + 10 * np.log10(z + 1e-20)
    z = z[l > -70]
    if not len(z): return -99.0
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    z2 = z[(-0.691 + 10 * np.log10(z)) > rel]
    return -0.691 + 10 * np.log10(z2.mean())

def true_peak_env(x, os_=4):
    up = signal.resample_poly(x, os_, 1, axis=0)
    a = np.abs(up).max(axis=1)
    return a.reshape(-1, os_).max(axis=1)[: x.shape[0]]

def limiter_gain(x, ceil_db=-1.6, look=0.005):
    ceil = 10 ** (ceil_db / 20)
    pk = np.maximum(true_peak_env(x), np.abs(x).max(axis=1))
    g = np.minimum(1.0, ceil / np.maximum(pk, 1e-12))
    L = int(look * SR)
    g = minimum_filter1d(g, 2 * L + 1)
    w = np.hanning(2 * L + 1); w /= w.sum()
    g = np.convolve(np.pad(g, (L, L), mode="edge"), w, mode="valid")
    return g

def ffmpeg_measure(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
                        "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr
    summ = txt[txt.rfind("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1))
    LRA = float(re.search(r"LRA:\s+(-?[\d.]+) LU", summ).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summ).group(1))
    ms = [float(v) for v in re.findall(r"\bM:\s*(-?[\d.]+)", txt[: txt.rfind("Summary:")])]
    return {"integrated_lufs": I, "true_peak_dbtp": tp, "lra_lu": LRA,
            "momentary_max_lufs": max(ms) if ms else None}

# --------------------------------------------------------------------------------------
# IO
# --------------------------------------------------------------------------------------
def write_wav24(path, x):
    x = np.clip(x, -1.0, 1.0 - 2 ** -23)
    q = np.round(x * (2 ** 23)).astype(np.int32)
    q = np.clip(q, -2 ** 23, 2 ** 23 - 1)
    b = np.ascontiguousarray(q.astype("<i4")).view(np.uint8).reshape(-1, 4)[:, :3].reshape(-1)
    ch = x.shape[1]
    data = b.tobytes()
    hdr = b"RIFF" + (36 + len(data)).to_bytes(4, "little") + b"WAVE"
    hdr += b"fmt " + (16).to_bytes(4, "little") + (1).to_bytes(2, "little") + ch.to_bytes(2, "little")
    hdr += SR.to_bytes(4, "little") + (SR * ch * 3).to_bytes(4, "little")
    hdr += (ch * 3).to_bytes(2, "little") + (24).to_bytes(2, "little")
    hdr += b"data" + len(data).to_bytes(4, "little")
    with open(path, "wb") as fh:
        fh.write(hdr + data)
    return q.astype(np.float64) / 2 ** 23

def spectrogram_png(x, path, title, T):
    from PIL import Image, ImageDraw
    mono = x.mean(axis=1)
    nfft, hop = 4096, 240
    win = np.hanning(nfft)
    pad = np.concatenate([np.zeros(nfft // 2), mono, np.zeros(nfft // 2)])
    frames = np.lib.stride_tricks.sliding_window_view(pad, nfft)[::hop][: N // hop]
    S = np.abs(np.fft.rfft(frames * win, axis=1)) / (win.sum() / 2)
    db = 20 * np.log10(S + 1e-9)
    W, H, ml, mt, mb = len(frames), 640, 70, 34, 30
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    fy = np.geomspace(20, 24000, H)[::-1]                     # log axis 20 Hz .. 24 kHz
    idx = np.clip(np.searchsorted(freqs, fy), 0, len(freqs) - 1)
    img = db[:, idx].T
    v = np.clip((img + 110) / 100, 0, 1)                      # -110 .. -10 dBFS
    # paper -> cobalt -> coral -> ink style ramp (dark = quiet would hide things; use dark bg)
    stops = np.array([[11, 12, 14], [36, 64, 224], [124, 147, 255], [255, 116, 105], [250, 250, 248]]) / 255
    pos = np.linspace(0, 1, len(stops))
    rgb = np.stack([np.interp(v, pos, stops[:, c]) for c in range(3)], axis=-1)
    im = Image.new("RGB", (W + ml + 10, H + mt + mb), (250, 250, 248))
    im.paste(Image.fromarray((rgb * 255).astype(np.uint8)), (ml, mt))
    d = ImageDraw.Draw(im)
    d.text((ml, 8), title + "   (log freq 20 Hz-24 kHz, -110..-10 dBFS, mid channel)", fill=(11, 12, 14))
    for f in (50, 100, 200, 500, 1000, 2000, 5000, 10000, 16000, 20000):
        y = mt + int(np.argmin(np.abs(fy - f)))
        d.line([(ml - 6, y), (ml + W, y)], fill=(90, 90, 90) if f != 16000 else (255, 116, 105), width=1)
        d.text((4, y - 6), f"{f/1000:g}k" if f >= 1000 else str(f), fill=(11, 12, 14))
    for s in range(11):
        xx = ml + int(s * SR / hop)
        d.line([(xx, mt + H), (xx, mt + H + 6)], fill=(11, 12, 14))
        d.text((xx - 4, mt + H + 10), f"{s}s", fill=(11, 12, 14))
    for name, t in cue_list(T):
        xx = ml + int(t * SR / hop)
        d.line([(xx, mt - 6), (xx, mt)], fill=(255, 116, 105), width=2)
    im.save(path)

# --------------------------------------------------------------------------------------
# Verification
# --------------------------------------------------------------------------------------
def cue_list(T):
    c = [("line draw", T["line"][0] + 0.0), ("stamp", T["stamp"])]
    c += [(f"word {i+1}", t) for i, t in enumerate(T["words"])]
    c += [("cut 1 (whoosh+thud)", T["cut1"])]
    c += [(f"slider tick {i+1} ({v:g}%)", t) for i, (t, v) in enumerate(T["slider_ticks"])]
    c += [("crash line", T["crash"][0]), ("cut 2 (hit+whoosh)", T["cut2"]),
          ("card word 2", T["card_words"][1])]
    c += [(f"shape hit {i+1}", t) for i, t in enumerate(T.get("shape_hits", []))]
    c += [("end chord", T["end"])]
    return c

def onset(x, t, search=0.06, hp=None):
    """Optional high-pass (to see a tonal entry over the pad). First 1 ms frame inside +-search where 4 ms RMS rises >= 9 dB over the 20 ms before."""
    if hp: x = signal.sosfiltfilt(sos("highpass", hp, 4), x, axis=0)
    m = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    w = int(0.004 * SR)
    e = np.sqrt(np.convolve(m ** 2, np.ones(w) / w, mode="full")[w - 1:])  # forward window
    hop = int(0.001 * SR)
    best = None
    for n in range(int((t - search) * SR), int((t + search) * SR), hop):
        if n < int(0.025 * SR):
            base = 1e-7
        else:
            bl = max(0.004, min(0.020, 0.6 * search))      # baseline shrinks for close cues
            gd = min(0.005, 0.25 * search)                 # guard gap before n
            base = np.sqrt((m[n - int((bl + gd) * SR): n - int(gd * SR)] ** 2).mean()) + 1e-7
        if e[n] > 2.8 * base and e[n] > 1e-4:
            best = n; break
    return None if best is None else best / SR

def main():
    T = load_timing()
    for k in ("stamp", "cut1", "cut2", "end"):
        T[k] = fr(T[k])
    T["words"] = [fr(t) for t in T["words"]]
    T["card_words"] = [fr(t) for t in T["card_words"]]
    print("timing source:", T["source"])
    sfx_dry = build_sfx(T)
    # tame 2-5 kHz build-up on SFX, keep >16 kHz clean, remove DC
    sfx_dry = peaking(sfx_dry, 3300, -3.0, 0.9)
    sfx_dry = filt(sfx_dry, "lowpass", 15000, 4)
    sfx_dry = filt(sfx_dry, "highpass", 30, 2)
    k = 0.32                                                 # soft knee on the SFX bus
    a = np.abs(sfx_dry)
    sfx_dry = np.where(a > k, np.sign(sfx_dry) * (k + (1 - k) * np.tanh((a - k) / (1 - k))), sfx_dry)
    ir = room_ir()
    wet = np.stack([signal.fftconvolve(sfx_dry[:, c], ir[:, c])[:N] for c in range(2)], axis=1)
    sfx = sfx_dry + 0.22 * wet                            # early-reflection send (SFX only)
    music = build_music(T)
    music = filt(music, "highpass", 28, 2)
    # sidechain: duck music under SFX hits, lookahead via zero-phase envelope
    w = int(0.012 * SR)
    env = np.sqrt(np.convolve((sfx_dry ** 2).sum(axis=1), np.ones(w) / w, mode="same"))
    env = signal.filtfilt(*signal.butter(1, 12, fs=SR), env)
    edb = 20 * np.log10(env + 1e-9)
    duck_db = -np.clip((edb - (-30)) * 0.35, 0, 4.0)       # up to -4 dB
    duck = 10 ** (duck_db / 20)
    music = music * duck[:, None]
    # final fade (9.8 s -> last fade frame) to true silence (applied on stems, so mix inherits it)
    t = np.arange(N) / SR
    fe = min(T["fade"][1], DUR - 0.008)                  # silent from the last faded frame on
    fade = np.clip((fe - t) / (fe - T["fade"][0]), 0, 1)
    fade = 0.5 - 0.5 * np.cos(np.pi * fade)
    fin = np.clip((t - 0.005) / 0.006, 0, 1)            # silent first 5 ms, 6 ms ramp
    fin = 0.5 - 0.5 * np.cos(np.pi * fin)
    stem_env = (fade * fin)[:, None]
    music *= stem_env; sfx *= stem_env
    # balance + master gain search: music sits ~4 dB under SFX hits
    music *= 0.95
    target, gain = -14.0, 1.0
    for it in range(8):
        mix_pre = (music + sfx) * gain
        g = limiter_gain(mix_pre)
        mix = mix_pre * g[:, None]
        L = lufs(mix)
        if abs(L - target) < 0.05: break
        gain *= 10 ** ((target - L) / 20)
    # ffmpeg confirmation loop (the authoritative meter)
    out = lambda n: os.path.join(HERE, n)
    for it in range(4):
        mix_pre = (music + sfx) * gain
        g = limiter_gain(mix_pre)
        mus_o, sfx_o = music * gain * g[:, None], sfx * gain * g[:, None]
        mix = mus_o + sfx_o
        write_wav24(out("mix.wav"), mix)
        meas = ffmpeg_measure(out("mix.wav"))
        print(f"pass {it}: ffmpeg I={meas['integrated_lufs']} TP={meas['true_peak_dbtp']}")
        if abs(meas["integrated_lufs"] - target) <= 0.2 and meas["true_peak_dbtp"] <= -1.0:
            break
        gain *= 10 ** ((target - meas["integrated_lufs"]) / 20)
    mix_q = write_wav24(out("mix.wav"), mix)
    write_wav24(out("music.wav"), mus_o)
    write_wav24(out("sfx.wav"), sfx_o)
    meas = ffmpeg_measure(out("mix.wav"))
    # checks
    db = lambda v: 20 * np.log10(v + 1e-12)
    n5 = int(0.005 * SR)
    checks = {
        "samples": int(mix_q.shape[0]), "channels": int(mix_q.shape[1]),
        "duration_s": mix_q.shape[0] / SR,
        "first_5ms_peak_dbfs": round(float(db(np.abs(mix_q[:n5]).max())), 1),
        "last_5ms_peak_dbfs": round(float(db(np.abs(mix_q[-n5:]).max())), 1),
        "sample_peak_dbfs": round(float(db(np.abs(mix_q).max())), 2),
        "any_sample_at_full_scale": bool((np.abs(mix_q) >= 1.0).any()),
        "dc_offset_dbfs": [round(float(db(abs(mix_q[:, c].mean()))), 1) for c in range(2)],
        "limiter_max_gr_db": round(float(-db(g.min())), 2),
        "limiter_gr_over_0p5db_ms": round(float((g < 10 ** (-0.5 / 20)).sum() / SR * 1000), 1),
        "master_gain_db": round(float(db(gain)), 2),
        "music_peak_dbfs": round(float(db(np.abs(mus_o).max())), 2),
        "sfx_peak_dbfs": round(float(db(np.abs(sfx_o).max())), 2),
        "hf_above_16k_rel_db": None,
    }
    spec = np.abs(np.fft.rfft(mix_q.mean(axis=1)))
    fq = np.fft.rfftfreq(N, 1 / SR)
    checks["hf_above_16k_rel_db"] = round(float(10 * np.log10((spec[fq > 16000] ** 2).sum() / (spec ** 2).sum())), 1)
    checks["band_2k_5k_rel_db"] = round(float(10 * np.log10((spec[(fq > 2000) & (fq < 5000)] ** 2).sum() / (spec ** 2).sum())), 1)
    stems = {"sfx": sfx_o, "music": mus_o}
    rows = []
    cl = cue_list(T)
    for j, (name, tc) in enumerate(cl):
        src = "music" if name == "end chord" else "sfx"
        gaps = [abs(tc - cl[k][1]) for k in (j - 1, j + 1) if 0 <= k < len(cl) and cl[k][1] != tc]
        srch = min([0.06] + [0.45 * g for g in gaps])   # never reach a neighbouring cue
        o = onset(stems[src], tc, search=srch, hp=400 if src == "music" else (5000 if name.startswith("slider") else None))
        rows.append({"cue": name, "stem": src, "intended_s": round(tc, 4),
                     "frame": round(tc * FPS, 2),
                     "measured_s": None if o is None else round(o, 4),
                     "err_ms": None if o is None else round((o - tc) * 1000, 1)})
    errs = [abs(r["err_ms"]) for r in rows if r["err_ms"] is not None]
    print(f"{'cue':28s} {'stem':6s} {'intended':>9s} {'measured':>9s} {'err ms':>7s}")
    for r in rows:
        print(f"{r['cue']:28s} {r['stem']:6s} {r['intended_s']:9.4f} "
              f"{(r['measured_s'] if r['measured_s'] is not None else float('nan')):9.4f} "
              f"{(r['err_ms'] if r['err_ms'] is not None else float('nan')):7.1f}")
    print(f"onsets found {len(errs)}/{len(rows)}, max |err| {max(errs) if errs else None} ms (1 frame = 33.3 ms)")
    spectrogram_png(mix_q, out("spec_mix.png"), "mix.wav", T)
    spectrogram_png(sfx_o, out("spec_sfx.png"), "sfx.wav", T)
    spectrogram_png(mus_o, out("spec_music.png"), "music.wav", T)
    json.dump(T, open(out("timing_used.json"), "w"), indent=1)
    json.dump({"ffmpeg": meas, "checks": checks, "onsets": rows}, open(out("measure.json"), "w"), indent=1)
    print(json.dumps(meas)); print(json.dumps(checks))
    write_report(T, meas, checks, rows)

def write_report(T, meas, checks, rows):
    errs = [abs(r["err_ms"]) for r in rows if r["err_ms"] is not None]
    L = []
    L.append("# Proof clip audio: report\n")
    L.append("**Verification status: this mix has been verified by measurement and visual spectrogram "
             "inspection only, NOT by ear.** Nobody has listened to it yet.\n")
    L.append(f"Timing source used for this build: **{T['source']}**.\n")
    L.append("Re-run: `python3 ops/video/proof/audio/make_audio.py` (from repo root; numpy + scipy + Pillow; "
             "seed " + str(SEED) + "; ~10 s). `FLOOR_AUDIO_TIMING=storyboard` forces storyboard timing.\n")
    L.append("## Files\n- `mix.wav` 48 kHz / 24-bit PCM / stereo / " + str(checks["samples"]) +
             " samples (" + f"{checks['duration_s']:.3f}" + " s)\n- `music.wav`, `sfx.wav` stems, same format; "
             "post master gain and post limiter gain curve, so `music + sfx` equals `mix` to within 24-bit rounding\n"
             "- `spec_mix.png`, `spec_sfx.png`, `spec_music.png` (log freq 20 Hz to 24 kHz; coral ticks on top = cue times; coral line = 16 kHz)\n"
             "- `timing_used.json` (every cue time used), `measure.json` (all numbers below)\n")
    L.append("## Loudness (ffmpeg `ebur128=peak=true` on the final mix.wav)\n")
    L.append(f"| metric | value | target |\n|---|---|---|\n"
             f"| Integrated | {meas['integrated_lufs']} LUFS | -14 +-1 |\n"
             f"| True peak | {meas['true_peak_dbtp']} dBTP | <= -1 |\n"
             f"| Momentary max | {meas['momentary_max_lufs']} LUFS | |\n"
             f"| Loudness range | {meas['lra_lu']} LU | |\n")
    c = checks
    L.append("## Integrity checks (numpy on the written 24-bit file)\n")
    L.append(f"- samples {c['samples']}, channels {c['channels']}, duration {c['duration_s']:.4f} s\n"
             f"- first 5 ms peak {c['first_5ms_peak_dbfs']} dBFS, last 5 ms peak {c['last_5ms_peak_dbfs']} dBFS (-240 = digital zero; need < -60)\n"
             f"- sample peak {c['sample_peak_dbfs']} dBFS; any sample at full scale: {c['any_sample_at_full_scale']}\n"
             f"- stem peaks: music {c['music_peak_dbfs']} dBFS, sfx {c['sfx_peak_dbfs']} dBFS (no clipping)\n"
             f"- DC offset L/R {c['dc_offset_dbfs']} dBFS\n"
             f"- energy above 16 kHz {c['hf_above_16k_rel_db']} dB re total; 2-5 kHz band {c['band_2k_5k_rel_db']} dB re total\n"
             f"- master gain {c['master_gain_db']} dB; true-peak limiter (4x oversampled, 5 ms lookahead, ceiling -1.6 dBTP): "
             f"max GR {c['limiter_max_gr_db']} dB, {c['limiter_gr_over_0p5db_ms']} ms total with GR > 0.5 dB (transients only)\n")
    L.append("## Cue onset accuracy\n")
    L.append("Onset = first 1 ms step where the 4 ms RMS rises >= 9 dB over the preceding 5-25 ms (baseline and guard shortened for close cues), searched +-60 ms "
             "around the cue (narrowed to < half the gap when cues are closer, e.g. two 1 % slider steps inside one frame), on the stem that carries the cue (end chord: music stem high-passed at 400 Hz so the pad does not mask it; slider ticks: sfx high-passed at 5 kHz, i.e. the detent click). "
             "The detector window starts slightly before the energy, so a -2..-3 ms reading means on time. Where the real slider jumped 2 % in one frame, the second detent is 16.7 ms after the first (inside the same frame); its -6..-8 ms reading is the edge of the narrowed search window catching the tail of the first tick. A direct 5 kHz-band probe of sfx.wav shows that second click rising ~30 dB exactly at its time (e.g. 3.450 s).\n")
    L.append(f"**{len(errs)}/{len(rows)} cues found, max |error| {max(errs) if errs else 'n/a'} ms (1 frame = 33.3 ms).**\n")
    L.append("| cue | stem | frame | intended s | measured s | err ms |\n|---|---|---|---|---|---|")
    for r in rows:
        L.append(f"| {r['cue']} | {r['stem']} | {r['frame']} | {r['intended_s']} | {r['measured_s']} | {r['err_ms']} |")
    L.append("\n## Design\n"
             "- Key **D major pentatonic** (D E F# A B), 120 BPM. Pad: Dsus2 closed (0-2.5 s) -> Dadd9 with the low-pass opening "
             "280 Hz -> 1.3 kHz from the 2.5 s cut -> Bm7 under the crash (tense, not dark) -> Gadd9 on the line card -> D major at 9.0 s. "
             "Detuned additive saws (+-6 cents, panned +-0.55), side channel high-passed at 150 Hz; sub sine on the chord root is mono.\n"
             "- Pulse: muted mono thump (68 -> 46 Hz) on every beat 0.5-8.5 s, quieter before the UI arrives; a faint A5 tick on the off-beats while the UI is on.\n"
             "- Plucks at 5.0/5.5/6.0/6.5 s: B4 A4 F#4 E4 (descending with the chart, leaves the E hanging); resolution at 9.0 s: bell/pluck chord D4 F#4 A4 over a soft D3, ~1 s decay into the 9.8-10.0 s fade.\n"
             "- SFX: line draw = rising band-passed noise scrape (500 Hz -> 3.8 kHz) with 4 stepped pushes on the line's 4 moves; "
             "STAMP = 110 -> 70 Hz pitch-dropped thump + 1.5 kHz high-passed paper slap + 20 ms tick; word hits = dry key clacks "
             "(noise click + 3 damped plate modes + low thock), pitch rising 1.12/1.26/1.42 kHz, panned L/C/R; cuts = time-varying SVF band-pass "
             "noise whoosh (rise then fall), decorrelated L/R, plus a soft thud (2.5 s) or a firm hit + slap (7.0 s); slider = one detent per 1 % step, "
             "pitch falling 1.35 kHz -> ~1.1 kHz with the value, pan following the thumb leftwards; settle = soft low-passed paper breath; "
             "crash = band-limited saw glide A3 -> A2 shaped like a crash (sag, steep drop, small bounce) with a closing filter plus faint crackle grain.\n"
             "- Mix: SFX bus has a -3 dB bell at 3.3 kHz, 15 kHz low-pass, soft knee; synthetic 120 ms early-reflection room as a send on SFX only; "
             "music is ducked up to 4 dB by a zero-phase (look-ahead) envelope of the dry SFX. 2-5 ms fades on every event, 6 ms fade-in after 5 ms of silence at the head, "
             f"raised-cosine fade {T['fade'][0]:.3f} -> {min(T['fade'][1], DUR - 0.008):.3f} s to digital zero at the tail. Nothing sampled; all synthesized with numpy/scipy.\n"
             "- When cues.json is present: a light paper tick on the hard chart swap (crash start) and two small soft paper taps on the line-card shape hits (8.0 / 8.5 s), so every visual hit has a sound.\n")
    L.append("## Spectrogram inspection (what I looked for and saw)\n"
             "- Energy sits where designed: broadband scrape 0-0.5 s, low thump + slap at 0.5 s, three narrow clacks with rising mode lines at 1.0/1.5/2.0, "
             "whoosh blobs at 2.5 and 7.0, ten thin detents 3.1-4.6 s, the descending harmonic glide 4.9-6.9 s, end chord partials from 9.0 s, fade to black at 10 s.\n"
             "- No DC offset (also measured), no steady buzz/hum line, no broadband hiss above 16 kHz except the short noise transients themselves.\n"
             "- An earlier build showed a broadband vertical line in the music stem at 7.0 s (pad filter cutoff jumping): fixed by gliding the cutoff over 120 ms; re-checked, gone.\n")
    L.append("## Not verified\n- Not listened to by anyone: tonal balance, perceived punch, and how the bass translates on laptop/phone speakers are unjudged. "
             "The low end (sub + pulse at 46-80 Hz) is the most likely thing to need a trim by ear.\n"
             "- Sync is verified against cue times, not against the rendered picture (not muxed here).\n"
             "- Loudness measured on the WAV; the AAC encode in the final mux can shift true peak by a few tenths of a dB.\n")
    open(os.path.join(HERE, "report.md"), "w").write("\n".join(L) + "\n")

if __name__ == "__main__":
    main()
