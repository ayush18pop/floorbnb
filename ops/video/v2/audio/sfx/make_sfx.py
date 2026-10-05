#!/usr/bin/env python3
"""Floor launch video v2: sound design (SFX families + room bed), 60 s master and 30 s cut.

Everything is synthesized here with numpy/scipy (no samples), seeded and re-runnable.

  python3 ops/video/v2/audio/sfx/make_sfx.py                 # auto timing, key from arrangement.json or D major
  python3 ops/video/v2/audio/sfx/make_sfx.py --key "Bb major" # retune every pitched element
  python3 ops/video/v2/audio/sfx/make_sfx.py --timing script  # force the SCRIPT.md fallback timeline
  options: --seed N, --only 60|30, --no-png

Timing sources, in order of preference:
  1. ops/video/v2/cues.json (compositor): scene arrivals, camera moves, focus, words, callouts, stamps, UI cues.
  2. ops/video/v2/capture/<shot>/events.json (capture agent): clicks, slider values, scroll, keys, mapped to video
     frames with the shot offsets from cues.json (or the SCRIPT.md scene table when cues.json is absent).
  3. SCRIPT.md scene table + the capture contract in BRIEF2.md (fallback for anything not found).

Outputs (next to this file): <family>.wav and <family>_30s.wav for camera, focus, paper, ink_press, type, ui,
emotion, room (48 kHz, 24-bit, stereo), sfx_cue_map.json, cut30.json, measure.json, spec/*.png, report.md.
"""
import argparse, json, os, re, sys, time, zlib
import numpy as np
from scipy import signal

SR, FPS, BPF = 48000, 30, 20            # 90 BPM = 20 frames per beat
HERE = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.normpath(os.path.join(HERE, "..", ".."))
VIDEO = os.path.dirname(V2)
CUES = os.path.join(V2, "cues.json")
CAPTURE = os.path.join(V2, "capture")
SCRIPT = os.path.join(VIDEO, "SCRIPT.md")
ARRANGE = os.path.join(V2, "audio", "music", "arrangement.json")
FAMILIES = ["camera", "focus", "paper", "ink_press", "type", "ui", "emotion", "room"]
SEND = {"camera": 0.06, "focus": 0.05, "paper": 0.22, "ink_press": 0.28, "type": 0.18, "ui": 0.10,
        "emotion": 0.30, "room": 0.0}
SEED = 20261005


def F2S(f):
    return f / FPS


# ======================================================================================
# Key handling (only the pitched elements use it: type modes, slider detents, hum, E2 shimmer)
# ======================================================================================
NOTE = {"C": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3, "E": 4, "F": 5, "F#": 6, "GB": 6, "G": 7,
        "G#": 8, "AB": 8, "A": 9, "A#": 10, "BB": 10, "B": 11}
MODES = {"major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10], "dorian": [0, 2, 3, 5, 7, 9, 10],
         "mixolydian": [0, 2, 4, 5, 7, 9, 10], "lydian": [0, 2, 4, 6, 7, 9, 11]}


class Key:
    def __init__(self, s="D major"):
        m = re.match(r"\s*([A-Ga-g])([#b]?)\s*(m(?:in(?:or)?)?|maj(?:or)?|dorian|mixolydian|lydian)?\s*$", s)
        if not m:
            raise ValueError(f"cannot parse key {s!r} (use e.g. 'D major', 'F# minor', 'Bb')")
        name = (m.group(1) + m.group(2)).upper()
        mode = (m.group(3) or "major").lower()
        mode = "minor" if mode.startswith("m") and not mode.startswith("maj") and mode not in MODES else mode
        mode = "major" if mode.startswith("maj") else mode
        self.pc, self.mode = NOTE[name], mode
        self.name = f"{m.group(1).upper()}{m.group(2)} {mode}"
        self.steps = MODES[mode]

    def hz(self, degree, octave):
        """Scale degree (0-based, may exceed 6) in the octave that holds the tonic `octave` (C4 = 261.6)."""
        o, d = divmod(degree, 7)
        midi = 12 * (octave + 1 + o) + self.pc + self.steps[d]
        return 440.0 * 2 ** ((midi - 69) / 12)

    def near(self, f):
        """Nearest scale tone to f."""
        best = None
        for oc in range(0, 9):
            for d in range(7):
                h = self.hz(d, oc)
                if best is None or abs(np.log(h / f)) < abs(np.log(best / f)):
                    best = h
        return best


# ======================================================================================
# DSP helpers
# ======================================================================================
def rng_for(*parts):
    return np.random.default_rng(zlib.crc32(("|".join(str(p) for p in parts) + f"|{SEED}").encode()))


def tt(dur):
    return np.arange(max(int(dur * SR), 1)) / SR


def sos(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x, axis=0)


def peaking(x, f0, gain_db, q):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.lfilter(b, a, x, axis=0)


def edge(x, fin=0.003, fout=0.004):
    x = np.array(x, dtype=np.float64, copy=True)
    n = x.shape[0]
    a, b = min(int(fin * SR), n // 2), min(int(fout * SR), n // 2)
    if a > 0:
        w = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a)); x[:a] = (x[:a].T * w).T
    if b > 0:
        w = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b)); x[-b:] = (x[-b:].T * w).T
    return x


def smoothstep(u):
    u = np.clip(u, 0, 1); return u * u * (3 - 2 * u)


def bell(u):  # speed profile of an ease-in-out move, peak 1 at u=0.5
    u = np.clip(u, 0, 1); return np.sin(np.pi * u) ** 2


def resonate(exc, freqs, decays, gains):
    """Modal synthesis: excitation through damped 2-pole resonators (f Hz, decay s to -8.7 dB, gain)."""
    y = np.zeros_like(exc)
    for f, d, g in zip(freqs, decays, gains):
        if f >= 0.45 * SR: continue
        r = np.exp(-1.0 / (d * SR)); w = 2 * np.pi * f / SR
        y += g * (1 - r) * signal.lfilter([1, 0, -1], [1, -2 * r * np.cos(w), r * r], exc)
    return y


def swept_noise(R, n, fc, bw_oct, width=0.5, nper=1024):
    """Stereo noise through a log-gaussian band whose centre (Hz) and width (octaves) move over time.
    width: 0 = identical L/R, 1 = independent L/R (decorrelation); scalar or per-sample array."""
    hop = nper // 4
    fc = np.broadcast_to(np.asarray(fc, float), (n,))
    bw = np.broadcast_to(np.asarray(bw_oct, float), (n,))
    wd = np.broadcast_to(np.asarray(width, float), (n,))
    c = R.standard_normal(n + 3 * nper); l = R.standard_normal(n + 3 * nper); r = R.standard_normal(n + 3 * nper)
    freqs = np.fft.rfftfreq(nper, 1 / SR); lf = np.log2(np.maximum(freqs, 1.0))
    out = []
    for ch in (l, r):
        f, tfr, Z = signal.stft(ch, SR, nperseg=nper, noverlap=nper - hop, boundary=None, padded=False)
        _, _, Zc = signal.stft(c, SR, nperseg=nper, noverlap=nper - hop, boundary=None, padded=False)
        idx = np.clip((tfr * SR).astype(int) - nper, 0, n - 1)
        w = wd[idx]
        Zm = (np.sqrt(1 - w ** 2)[None, :] * Zc + w[None, :] * Z)
        sd = bw[idx] / 2.355
        mask = np.exp(-0.5 * ((lf[:, None] - np.log2(fc[idx])[None, :]) / sd[None, :]) ** 2)
        with np.errstate(all="ignore"):
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                _, x = signal.istft(Zm * mask, SR, nperseg=nper, noverlap=nper - hop, boundary=False)
        out.append(x[nper:nper + n])
    y = np.stack(out, axis=1)
    return y / (np.sqrt((y ** 2).mean()) + 1e-12)


def crinkle(R, dur, rate, decay, band=(900, 9000), grain=0.0008):
    """Paper crinkle: Poisson micro-impacts (rate per s, decaying with `decay` s) through a grain kernel."""
    t = tt(dur); n = len(t)
    p = rate * np.exp(-t / decay) / SR
    hits = (R.random(n) < p) * R.lognormal(0, 0.6, n) * R.choice([-1, 1], n)
    k = R.standard_normal(int(0.004 * SR)) * np.exp(-np.arange(int(0.004 * SR)) / SR / grain)
    x = signal.fftconvolve(hits, k)[:n]
    x = filt(filt(x, "highpass", band[0], 2), "lowpass", band[1], 2)
    return peaking(x, 3400, -5, 0.9)


def deharsh(x):
    return peaking(x, 3500, -3.0, 0.8)


# ======================================================================================
# Sound voices (all return mono (n,) or stereo (n,2) arrays at unit-ish level)
# ======================================================================================
def thump(f_hi=110, f_lo=70, drop=0.025, decay=0.09, dur=0.30, attack=0.0008):
    t = tt(dur)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / drop)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = (1 - np.exp(-t / attack)) * np.exp(-t / decay)
    return env * (np.sin(ph) + 0.15 * np.sin(2 * ph))


def noise_burst(R, dur, lo, hi, decay, attack=0.0004):
    t = tt(dur)
    x = filt(filt(R.standard_normal(len(t)), "highpass", lo, 2), "lowpass", hi, 2)
    return x * (1 - np.exp(-t / attack)) * np.exp(-t / decay) / 2.0


# ---------- CAMERA ----------
def cam_dolly_in(R, dur, inten=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    sp = bell(u)
    fc = 240 * (1650 / 240) ** smoothstep(u * 1.05)
    air = swept_noise(R, n, fc, 1.5 - 0.5 * u, width=0.12 + 0.75 * smoothstep(u))
    env = sp ** 1.1 * (0.5 + 0.5 * u)
    sub = filt(filt(R.standard_normal(n), "lowpass", 90, 4), "highpass", 28, 2)
    sub /= np.sqrt((sub ** 2).mean()) + 1e-12
    f = 46 + 10 * smoothstep(u)
    sub = 0.6 * sub + 0.8 * np.sin(2 * np.pi * np.cumsum(f) / SR)
    senv = bell(np.clip((u - 0.15) / 0.85, 0, 1)) ** 1.3
    y = 0.55 * air * env[:, None] + 0.35 * (sub * senv)[:, None]
    return inten * y


def cam_pull_back(R, dur, inten=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    sp = bell(u)
    fc = 1500 * (210 / 1500) ** smoothstep(u * 0.95)
    air = swept_noise(R, n, fc, 1.1 + 0.5 * u, width=0.85 - 0.7 * smoothstep(u))
    env = sp ** 1.1 * (1.0 - 0.45 * u)
    sub = filt(filt(R.standard_normal(n), "lowpass", 80, 4), "highpass", 28, 2)
    sub /= np.sqrt((sub ** 2).mean()) + 1e-12
    f = 56 - 12 * smoothstep(u)
    sub = 0.6 * sub + 0.7 * np.sin(2 * np.pi * np.cumsum(f) / SR)
    senv = bell(np.clip(u / 0.8, 0, 1)) ** 1.3
    y = 0.5 * air * env[:, None] + 0.3 * (sub * senv)[:, None]
    return inten * y


def cam_orbit(R, dur, inten=1.0, direction=1):
    """Lateral swing: band passes by (Doppler-like rise then fall), pans with the move, ITD follows pan."""
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    sp = bell(u)
    pos = smoothstep(u)                                    # -1 -> +1 lateral position
    fc = 520 * np.exp(0.75 * np.exp(-((u - 0.5) / 0.22) ** 2)) * (1 - 0.18 * u)
    m = swept_noise(R, n, fc, 1.0, width=0.25)[:, 0]
    flutter = 1 + 0.18 * np.sin(2 * np.pi * (6.5 + 2 * u) * t + R.uniform(0, 6))
    m = m * sp ** 1.2 * flutter
    p = direction * (-0.75 + 1.5 * pos)
    a = (p + 1) * np.pi / 4
    itd = 0.0006 * p                                      # up to 0.6 ms
    idx = np.arange(n)
    late = np.interp(idx - np.abs(itd) * SR, idx, m, left=0)
    L = np.where(p > 0, late, m) * np.cos(a); Rr = np.where(p < 0, late, m) * np.sin(a)
    body = filt(filt(R.standard_normal(n), "lowpass", 110, 4), "highpass", 30, 2)
    body = body / (np.sqrt((body ** 2).mean()) + 1e-12) * bell(u) ** 1.5 * 0.25
    y = 0.6 * np.stack([L, Rr], 1) + body[:, None]
    return inten * y


# ---------- FOCUS ----------
def focus_lock(R, pull_s):
    """Blur -> sharp: high-band hiss clears (rises, narrows, fades) then a lens-detent tick at the end.
    Returns (signal, offset_of_tick_in_seconds)."""
    n = int(pull_s * SR); t = np.arange(n) / SR; u = t / pull_s
    hiss = swept_noise(R, n, 5200 * (10500 / 5200) ** smoothstep(u), 1.3 - 0.8 * u, width=0.6)
    env = np.clip(t / 0.03, 0, 1) * (1 - smoothstep(u / 0.9)) ** 1.6
    smear = swept_noise(R, n, 1300 - 500 * u, 1.2, width=0.4) * (np.clip(t / 0.03, 0, 1) * (1 - smoothstep(u / 0.55)) ** 2)[:, None]
    body = 0.13 * hiss * env[:, None] + 0.05 * smear
    tl = tt(0.012)
    exc = np.zeros(len(tl)); exc[0] = 1.0; exc[int(0.0035 * SR)] = -0.45
    tick = resonate(exc, [1150 * R.uniform(0.97, 1.03), 2700, 7600], [0.0016, 0.0007, 0.0005], [1.0, 0.25, 0.5])
    tick += 0.25 * filt(R.standard_normal(len(tl)), "highpass", 6000, 2) * np.exp(-tl / 0.0006)
    out = np.zeros((n + len(tl), 2))
    out[:n] += body
    out[n:, 0] += 0.9 * tick; out[n:, 1] += 0.9 * tick * R.uniform(0.9, 1.0)
    return out, n / SR


def defocus_smear(R, dur):
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    x = swept_noise(R, n, 8000 * (1600 / 8000) ** smoothstep(u), 0.7 + 0.9 * u, width=0.7)
    return 0.1 * x * (bell(u) ** 0.8)[:, None]


# ---------- PAPER ----------
def card_arrival(R, heavy=1.0):
    th = thump(92 * R.uniform(0.96, 1.04), 52, 0.022, 0.075, 0.32)
    air = filt(filt(R.standard_normal(len(th)), "lowpass", 320, 2), "highpass", 45, 2)
    air *= np.exp(-tt(0.32) / 0.03) * 0.35
    slap = noise_burst(R, 0.06, 700, 6000, 0.008)
    dur = R.uniform(0.30, 0.42)
    tail = crinkle(R, dur, 900, dur / 3, (1000, 8500)) * 0.20
    fr = filt(filt(R.standard_normal(int(dur * SR)), "bandpass", [500, 2400], 2), "lowpass", 4000, 1)
    tail += 0.05 * fr * np.exp(-tt(dur) / (dur / 4)) * np.clip(tt(dur) / 0.01, 0, 1)
    y = np.zeros(int(0.44 * SR))
    y[:len(th)] += heavy * (th + air); y[:len(slap)] += 0.28 * slap
    o = int(0.008 * SR); y[o:o + len(tail)] += tail[: len(y) - o]
    return y


def panel_arrival(R):
    """Real-screen panel (stiffer board on paper): higher knock with short card-stock modes, short rustle."""
    th = thump(120 * R.uniform(0.97, 1.03), 72, 0.018, 0.06, 0.26)
    tl = tt(0.08); exc = np.zeros(len(tl)); exc[0] = 1
    knock = resonate(exc + 0.3 * R.standard_normal(len(tl)) * np.exp(-tl / 0.001),
                     [185, 410, 770, 1240], [0.03, 0.018, 0.010, 0.006], [1.0, 0.6, 0.35, 0.2])
    tail = crinkle(R, 0.26, 600, 0.07, (1200, 8000)) * 0.16
    y = np.zeros(int(0.32 * SR))
    y[:len(th)] += 0.85 * th; y[:len(knock)] += 0.55 * knock / (np.abs(knock).max() + 1e-9)
    o = int(0.006 * SR); y[o:o + len(tail)] += tail
    return y


def card_departure(R, dur=0.26, direction=1):
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    x = swept_noise(R, n, 1800 + 2600 * smoothstep(u), 1.4, width=0.3)
    x = deharsh(x) * (bell(u ** 0.8) ** 1.2)[:, None]
    p = direction * (-0.1 + 0.5 * smoothstep(u))
    a = (p + 1) * np.pi / 4
    x[:, 0] *= np.cos(a) * 1.41; x[:, 1] *= np.sin(a) * 1.41
    return 0.32 * x


def sticker_pop(R):
    """Peel (adhesive tear, starts 55 ms before the frame) + soft pat on the frame. Returns (sig, offset of pat)."""
    pre = 0.022
    nt = int(pre * SR); t = np.arange(nt) / SR
    hits = (R.random(nt) < 7000 / SR * (t / pre) ** 1.2) * R.lognormal(0, 0.5, nt)
    tear = filt(signal.fftconvolve(hits, R.standard_normal(60) * np.exp(-np.arange(60) / 12))[:nt], "highpass", 3800, 2)
    tear = peaking(tear, 4200, -4, 1) * (0.5 + 0.5 * t / pre)
    tear *= 1 - smoothstep((t - pre + 0.006) / 0.006)
    pat = noise_burst(R, 0.07, 140, 1100, 0.011, 0.0012) * 2.0
    pat += 0.5 * thump(175, 135, 0.008, 0.018, 0.07, attack=0.0012)
    y = np.zeros(nt + len(pat))
    y[:nt] += 0.16 * tear / (np.abs(tear).max() + 1e-9)
    y[nt:] += 0.85 * pat / (np.abs(pat).max() + 1e-9)
    return y, pre


def rustle_bed(R, speed):
    """Very quiet parallax paper rustle that follows camera speed (speed: per-sample 0..1)."""
    n = len(speed)
    x = np.stack([crinkle(R, n / SR, 260, 1e9, (1400, 7500), 0.0012) for _ in range(2)], 1)
    fr = filt(R.standard_normal((n, 2)), "bandpass", [600, 2600], 2) * 0.15
    x = x / (np.sqrt((x ** 2).mean()) + 1e-12) + fr
    return x * (speed ** 1.3)[:, None]


# ---------- INK AND PRESS ----------
def ink_stamp(R, size=1.0):
    th = thump(108, 72, 0.022, 0.085, 0.34)
    slap = noise_burst(R, 0.10, 1300, 8500, 0.016)
    tl = tt(0.015)
    click = filt(R.standard_normal(len(tl)), "highpass", 2500, 2) * np.exp(-tl / 0.0018)
    click = resonate(click, [1900, 5600], [0.003, 0.0015], [0.8, 0.4]) + 0.4 * click
    tack = crinkle(R, 0.12, 1800, 0.03, (1500, 7000)) * 0.1     # ink tack release after the press
    y = np.zeros(int(0.42 * SR))
    y[:len(th)] += 0.95 * th * size
    y[:len(slap)] += 0.6 * slap
    y[:len(tl)] += 0.22 * click / (np.abs(click).max() + 1e-9)
    o = int(0.11 * SR); y[o:o + len(tack)] += tack
    return y


def roller_draw(R, dur, direction=1):
    """Ink roller dragged over paper: band noise with rotation flutter, low rumble, pans with the line."""
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    sp = 0.35 + 0.65 * bell(np.clip(u * 1.1, 0, 1))
    rot = np.cumsum(9 + 16 * sp) / SR
    flutter = 1 + 0.35 * np.sin(2 * np.pi * rot) + 0.15 * np.sin(4 * np.pi * rot + 1.3)
    m = swept_noise(R, n, 650 + 900 * u, 1.6, width=0.15)[:, 0]
    grit = crinkle(R, dur, 1400, 1e9, (2000, 7000), 0.0005)
    grit /= np.sqrt((grit ** 2).mean()) + 1e-12
    rum = filt(filt(R.standard_normal(n), "bandpass", [70, 220], 2), "lowpass", 300, 2)
    rum /= np.sqrt((rum ** 2).mean()) + 1e-12
    x = (0.55 * m + 0.12 * grit) * flutter * sp + 0.3 * rum * sp
    x *= np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.06, 0, 1)
    p = direction * (-0.7 + 1.4 * u)
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1) * 1.41


def press_clunk(R, strength=1.0):
    """Muted riso drum clunk: damped low-mid thock + short latch."""
    tl = tt(0.16); exc = np.zeros(len(tl)); exc[0] = 1
    exc += 0.4 * R.standard_normal(len(tl)) * np.exp(-tl / 0.0015)
    th = resonate(exc, [118 * R.uniform(0.97, 1.03), 265, 510, 940], [0.045, 0.022, 0.011, 0.005],
                  [1.0, 0.55, 0.3, 0.15])
    th /= np.abs(th).max() + 1e-9
    latch = noise_burst(R, 0.02, 900, 2600, 0.0025)
    latch /= np.abs(latch).max() + 1e-9
    y = 0.9 * th; o = int(0.009 * SR); y[o:o + len(latch)] += 0.12 * latch
    return strength * filt(y, "lowpass", 2400, 2)


def misreg_jolt(R):
    tl = tt(0.04); exc = np.zeros(len(tl)); exc[0] = 1; exc[int(0.009 * SR)] = 0.6
    y = resonate(exc, [230, 1450, 3100], [0.012, 0.003, 0.0012], [1.0, 0.4, 0.15])
    return y / (np.abs(y).max() + 1e-9)


def press_hum(R, key, dur=0.55):
    """Tape/riso press hum burst, tuned to the tonic (octave 2) with its fifth, tape wow."""
    t = tt(dur)
    f0 = key.hz(0, 2)
    wow = 1 + 0.0035 * np.sin(2 * np.pi * 0.9 * t + R.uniform(0, 6))
    ph = 2 * np.pi * np.cumsum(f0 * wow) / SR
    x = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    env = np.clip(t / 0.08, 0, 1) ** 2 * np.exp(-t / 0.22) * np.clip((dur - t) / 0.08, 0, 1)
    return x * env


# ---------- TYPE ----------
def letterpress(R, key, idx, soft=1.0):
    """Dry key strike / letterpress clack: transient + 3-4 tuned modes (from the key), varies per word."""
    sets = [(0, 3), (4, 4), (2, 5), (1, 4), (5, 4), (3, 4)]
    a, b = sets[idx % len(sets)]
    f_low = key.hz(a, 3) if key.hz(a, 3) > 165 else key.hz(a, 3) * 2
    modes = [f_low, key.hz(b, 4) * 1.0, key.hz((b + 2) % 7, 5) if key.hz((b + 2) % 7, 5) < 1500 else key.hz((b + 2) % 7, 4),
             key.hz((a + 4) % 7, 5)]
    tl = tt(0.12)
    exc = np.zeros(len(tl)); exc[0] = 1
    exc += 0.5 * R.standard_normal(len(tl)) * np.exp(-tl / 0.0009)
    body = resonate(exc, modes, [0.028, 0.016, 0.009, 0.004], [1.0, 0.6, 0.4, 0.22])
    body /= np.abs(body).max() + 1e-9
    click = filt(R.standard_normal(len(tl)), "highpass", 2200, 2) * np.exp(-tl / 0.0012)
    click /= np.abs(click).max() + 1e-9
    y = 0.85 * body + 0.35 * click * soft
    return filt(y, "highpass", 120, 2)


def mono_ticks(R, count=4, spread=0.12):
    """Mono caption: a small run of tiny ticks (typewriter-light)."""
    y = np.zeros(int((spread + 0.02) * SR))
    for i in range(count):
        o = int(i * spread / max(count - 1, 1) * SR + R.uniform(-0.004, 0.004) * SR) if i else 0
        o = max(o, 0)
        tl = tt(0.012); exc = np.zeros(len(tl)); exc[0] = 1
        tk = resonate(exc, [R.uniform(1500, 1800), R.uniform(6000, 7500)], [0.0012, 0.0006], [1.0, 0.6])
        tk /= np.abs(tk).max() + 1e-9
        y[o:o + len(tk)] += tk * (1.0 if i == 0 else R.uniform(0.5, 0.8))
    return y


# ---------- UI ----------
def mouse_click(R, up=False, resolved=False):
    tl = tt(0.03); exc = np.zeros(len(tl)); exc[0] = 1
    exc += 0.4 * R.standard_normal(len(tl)) * np.exp(-tl / 0.0005)
    k = 1.08 if up else 1.0
    y = resonate(exc, [1250 * k, 2550 * k, 6300 * k, 9800 * k], [0.0022, 0.0011, 0.0009, 0.0005],
                 [1.0, 0.35, 0.6, 0.35])
    y /= np.abs(y).max() + 1e-9
    if resolved and not up:
        body = thump(190, 150, 0.006, 0.022, 0.08, attack=0.0006)
        air = noise_burst(R, 0.09, 5000, 11000, 0.025)
        z = np.zeros(max(len(body), len(air), len(y))); z[:len(y)] += y; z[:len(body)] += 0.45 * body
        z[:len(air)] += 0.25 * air / (np.abs(air).max() + 1e-9)
        y = z
    return y * (0.55 if up else 1.0)


def click_pair(R, resolved=False, gap=0.018):
    d = mouse_click(R, False, resolved); u = mouse_click(R, True)
    o = int(gap * SR)
    y = np.zeros(max(len(d), o + len(u))); y[:len(d)] += d; y[o:o + len(u)] += u
    return y


def detent(R, f):
    """Slider ratchet notch: a small spring-pawl click (tuned to the key) with a soft wooden thock under it."""
    tl = tt(0.035); exc = np.zeros(len(tl)); exc[0] = 1
    exc += 0.35 * R.standard_normal(len(tl)) * np.exp(-tl / 0.0004)
    y = resonate(exc, [f, f * 2.03, 7200], [0.004, 0.002, 0.0005], [1.0, 0.25, 0.4])
    y /= np.abs(y).max() + 1e-9
    th = resonate(exc, [310, 640], [0.014, 0.007], [1.0, 0.4]); th /= np.abs(th).max() + 1e-9
    out = np.zeros(int(0.05 * SR)); out[:len(y)] += y; out[:len(th)] += 0.55 * th
    pw = resonate(exc, [f * 1.5, 5400], [0.002, 0.0006], [1.0, 0.3]); pw /= np.abs(pw).max() + 1e-9   # pawl re-seat
    o = int(0.009 * SR); out[o:o + len(pw)] += 0.35 * pw
    return out


def drag_felt(R, dur):
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    x = swept_noise(R, n, 700, 1.4, width=0.3) * (0.4 + 0.6 * bell(u))[:, None]
    return x * np.clip(t / 0.03, 0, 1)[:, None] * np.clip((dur - t) / 0.04, 0, 1)[:, None]


def paper_flip(R):
    """Chart swap / page change: two quick flaps + air."""
    y = np.zeros(int(0.2 * SR))
    for i, (o, g) in enumerate(((0.0, 1.0), (0.028, 0.7))):
        b = noise_burst(R, 0.05, 500, 4200, 0.009, 0.0008)
        b = peaking(b, 3500, -4, 0.9)
        k = int(o * SR); y[k:k + len(b)] += g * b / (np.abs(b).max() + 1e-9)
    n = len(y); t = np.arange(n) / SR
    air = filt(filt(R.standard_normal(n), "bandpass", [300, 1500], 2), "lowpass", 2000, 1)
    y += 0.12 * air / (np.abs(air).max() + 1e-9) * bell(t / (n / SR))
    return y


def scroll_glide(R, speed):
    """Soft felt swish following scroll speed (per-sample 0..1)."""
    n = len(speed)
    x = swept_noise(R, n, 260 + 900 * speed, 1.3, width=0.35)
    return x * (speed ** 1.2)[:, None]


def key_tick(R):
    tl = tt(0.05); exc = np.zeros(len(tl)); exc[0] = 1
    exc += 0.3 * R.standard_normal(len(tl)) * np.exp(-tl / 0.0006)
    y = resonate(exc, [R.uniform(480, 560), R.uniform(1400, 1600), 5200], [0.012, 0.004, 0.0008], [1.0, 0.5, 0.25])
    return y / (np.abs(y).max() + 1e-9)


def row_tick(R):
    tl = tt(0.015); exc = np.zeros(len(tl)); exc[0] = 1
    y = resonate(exc, [R.uniform(1900, 2100), 7000], [0.0012, 0.0005], [1.0, 0.5])
    return y / (np.abs(y).max() + 1e-9)


# ---------- EMOTION ----------
def honest_thud(R):
    """E1: one low soft thud and a long quiet tail (honest, not dramatic)."""
    th = thump(68, 46, 0.03, 0.22, 0.9, attack=0.006)
    n = int(3.1 * SR); t = np.arange(n) / SR
    tail = filt(filt(R.standard_normal((n, 2)), "lowpass", 380, 2), "highpass", 60, 2)
    tail *= (np.exp(-t / 0.9) * np.clip(t / 0.08, 0, 1) * np.clip((3.1 - t) / 0.6, 0, 1))[:, None] * 0.05
    y = tail.copy(); y[:len(th)] += 0.9 * th[:, None]
    return y


def landing(R, key, hold_s):
    """E2: clean low hit + stamp + bright paper burst + shimmer (tuned) that is silent after hold_s."""
    n = int(hold_s * SR); t = np.arange(n) / SR
    y = np.zeros((n, 2))
    low = thump(64, 41, 0.035, 0.32, 1.2, attack=0.0012) * 0.95
    y[:len(low)] += low[:, None]
    st = ink_stamp(R, 0.7) * 0.75
    y[:len(st)] += st[:, None]
    # bright paper burst (wide, mostly above 5 kHz)
    bn = int(0.5 * SR)
    burst = np.stack([crinkle(R, 0.5, 9000, 0.06, (4800, 13000), 0.0004) for _ in range(2)], 1)
    burst = burst / (np.abs(burst).max() + 1e-9) * 0.42
    burst += 0.12 * swept_noise(R, bn, 7500, 1.4, width=0.9) * np.exp(-tt(0.5) / 0.07)[:, None]
    y[:bn] += burst
    # shimmer: tonic, fifth, ninth partials high up, slowly beating, decays to silence by hold_s
    parts = [(key.hz(0, 6), 0.0, 1.0), (key.hz(4, 6), 0.08, 0.7), (key.hz(1, 7), 0.15, 0.35),
             (key.hz(0, 7), 0.11, 0.4)]
    sh = np.zeros((n, 2))
    for f, delay, g in parts:
        for ch, det in ((0, -3.5), (1, 3.5)):
            ff = f * 2 ** (det / 1200)
            am = 1 + 0.25 * np.sin(2 * np.pi * R.uniform(4.5, 7.5) * t + R.uniform(0, 6))
            env = np.clip((t - delay) / 0.12, 0, 1) * np.exp(-np.maximum(t - delay, 0) / 0.85)
            sh[:, ch] += g * np.sin(2 * np.pi * ff * t + R.uniform(0, 6)) * am * env
    spark = np.stack([crinkle(R, hold_s, 400, 0.7, (7500, 14000), 0.0003) for _ in range(2)], 1)
    spark /= np.abs(spark).max() + 1e-9
    sh = sh / (np.abs(sh).max() + 1e-9) * 0.16 + spark * 0.10
    fade = np.clip((hold_s - 0.15 - t) / 1.6, 0, 1) ** 1.5
    y += sh * fade[:, None]
    return y


# ---------- ROOM ----------
def room_bed(R, n, level_env):
    """Paper-studio room tone: 120-400 Hz air + faint paper grain; level_env per-sample linear gain."""
    air = filt(filt(R.standard_normal((n, 2)), "highpass", 120, 2), "lowpass", 400, 2)
    c = filt(filt(R.standard_normal(n), "highpass", 120, 2), "lowpass", 400, 2)
    air = 0.6 * air + 0.8 * c[:, None]
    air /= np.sqrt((air ** 2).mean()) + 1e-12
    grain = np.stack([crinkle(R, n / SR, 35, 1e9, (2500, 9000), 0.0005) for _ in range(2)], 1)
    grain /= np.sqrt((grain ** 2).mean()) + 1e-12
    hiss = filt(R.standard_normal((n, 2)), "bandpass", [5000, 10000], 2)
    hiss /= np.sqrt((hiss ** 2).mean()) + 1e-12
    drift = 1 + 0.12 * filt(R.standard_normal(n), "lowpass", 0.4, 1) * 20
    return (air * 1.0 + grain * 0.06 + hiss * 0.015) * (level_env * np.clip(drift, 0.7, 1.3))[:, None]


def room_ir(R):
    """Short synthetic room reflections (send), ~180 ms, decorrelated L/R, early taps 8-90 ms."""
    n = int(0.18 * SR)
    ir = np.zeros((n, 2))
    for ch in range(2):
        for d in np.sort(R.uniform(0.008, 0.09, 22)):
            ir[int(d * SR), ch] += R.choice([-1, 1]) * np.exp(-d / 0.04) * R.uniform(0.4, 1)
        diff = R.standard_normal(n) * np.exp(-np.arange(n) / SR / 0.045) * 0.07
        diff[: int(0.012 * SR)] = 0
        ir[:, ch] += diff
    ir = filt(filt(ir, "lowpass", 5000, 2), "highpass", 220, 2)
    ir *= np.linspace(1, 0, n)[:, None] ** 0.6
    return ir / np.sqrt((ir ** 2).sum(axis=0)).max()


# ======================================================================================
# Timeline model
# ======================================================================================
SCENES_DEFAULT = [  # id, f0, f1, kind
    ("S0", 0, 160, "open"), ("C1", 160, 220, "card"), ("L1", 220, 400, "screen"), ("C2", 400, 460, "card"),
    ("T1", 460, 740, "screen"), ("C3", 740, 800, "card"), ("A1", 800, 1120, "screen"), ("C4", 1120, 1180, "card"),
    ("A2", 1180, 1360, "screen"), ("C5", 1360, 1420, "card"), ("G1", 1420, 1580, "screen"),
    ("E1", 1580, 1680, "honest"), ("E2", 1680, 1800, "end")]

# camera style of each arrival (fallback; cues.json overrides)
ARRIVAL_STYLE = {"C1": ("orbit", 1), "L1": ("dolly_in", 0), "C2": ("pull_back", 0), "T1": ("dolly_in", 0),
                 "C3": ("orbit", -1), "A1": ("dolly_in", 0), "C4": ("pull_back", 0), "A2": ("orbit", 1),
                 "C5": ("pull_back", 0), "G1": ("dolly_in", 0), "E1": ("pull_back", 0), "E2": ("dolly_in", 0)}

CARD_GROUPS = {  # (label/mono-first?, groups, mono sub after)
    "S0": ["Set a floor", "under your", "stocks."],
    "C1": ["One rule.", "Sell as prices fall.", "Buy as they rise."],
    "C2": ["Drag the floor.", "See the past."], "C3": ["A basket. A floor.", "A term."],
    "C4": ["Your money.", "Your vault."], "C5": ["Your agent can", "use it too."],
    "E1": ["A floor is not", "a guarantee."], "E2": ["We are live", "on mainnet."]}
LABELS = {"C1": "01 / THE IDEA", "C2": "02 / TRY IT", "C3": "03 / SET YOURS", "C4": "04 / YOUR OWN VAULT",
          "C5": "05 / FOR AGENTS"}
MONO_SUBS = {"S0": "Tokenized stocks. Spot swaps. Live on BNB Chain mainnet.",
             "C4": "One vault per position. Only you can exit it.",
             "E1": "Price gaps. Delayed sells. Token and contract risk.",
             "E2": "BNB Chain · Launch caps · No human audit"}
CALLOUTS = {"T1": [(480, "Drag the floor."), (560, "Higher floor: less loss, less upside."), (600, "Replay a crash.")],
            "A1": [(820, "Pick a basket."), (840, "Set the floor."), (880, "Pick a term."), (960, "Review, then confirm.")],
            "A2": [(1220, "Value. Floor. Cushion."), (1300, "A keeper rebalances. Spot swaps only.")],
            "G1": [(1460, "MCP tools. Unsigned transactions.")]}
CAPTIONS = {"L1": (300, "BACKTEST ON PAST DATA, NOT A PREDICTION"),
            "T1": (480, "SIMULATOR · BACKTEST ON PAST DATA, NOT A PREDICTION"),
            "A1": (820, "EXAMPLE DATA ON SCREEN"), "A2": (1200, "EXAMPLE DATA ON SCREEN"),
            "G1": (1440, "DEVELOPER PREVIEW · EXAMPLE DATA ON SCREEN")}
# capture shots: (scene, video frame of shot frame 0 in the SCRIPT fallback, frame count, sub-shots)
SHOTS = {"L1_landing": ("L1", 215, 190), "T1_try": ("T1", 455, 290), "A1": ("A1", 780, 360),
         "A2": ("A2", 1170, 200), "G1_agents": ("G1", 1420, 160)}
SUBSHOTS = {"A1": [("A1a_builder", 0, 200), ("A1b_review", 200, 90), ("A1c_confirmed", 290, 70)],
            "A2": [("A2a_position", 0, 100), ("A2b_keeper", 100, 100)]}
# capture-contract fallback (shot-local frames, from BRIEF2 + capture notes) when events.json is absent
SHOT_FALLBACK = {
    "L1_landing": {"scroll": [(40, 150)], "clicks": [], "drags": [], "keys": [], "flips": [], "rows": []},
    "T1_try": {"scroll": [], "clicks": [(155, "chip", "COVID crash chip"), (230, "chip", "2022 bear market chip")],
               "drags": [(30, 100, 90, 80)], "keys": [], "flips": [(157, "chart swap: COVID crash"), (232, "chart swap: 2022 bear")], "rows": []},
    "A1": {"scroll": [], "clicks": [(26, "chip", "basket QQQB"), (96, "chip", "term 6 months"), (112, "field", "Deposit field"),
                                   (150, "button", "Review"), (166, "check", "ack 1"), (176, "check", "ack 2"),
                                   (194, "check", "ack 3"), (230, "confirm", "Run mock flow (confirm)")],
           "drags": [(44, 80, 90, 85)], "keys": [116, 120, 124, 128],
           "flips": [(152, "page: /app/review"), (312, "page: /app/confirmed")], "rows": [(316 + 4 * i) for i in range(4)]},
    "A2": {"scroll": [], "clicks": [(102, "nav", "nav Keeper log")], "drags": [], "keys": [],
           "flips": [(104, "page: /app/keeper")], "rows": [(108 + 3 * i) for i in range(8)]},
    "G1_agents": {"scroll": [], "clicks": [], "drags": [], "keys": [], "flips": [], "rows": []},
}


def parse_script_scenes():
    try:
        txt = open(SCRIPT).read()
        rows = re.findall(r"^\|\s*([SCLTAGE]\d)\s*\|\s*[\d-]+\s*\|\s*(\d+)-(\d+)\s*\|", txt, re.M)
        if len(rows) >= 10:
            kinds = {s[0]: s[3] for s in SCENES_DEFAULT}
            return [(r[0], int(r[1]), int(r[2]), kinds.get(r[0], "card")) for r in rows], "SCRIPT.md table"
    except Exception as e:
        print("SCRIPT.md parse failed:", e)
    return list(SCENES_DEFAULT), "built-in copy of SCRIPT.md table"


class TL:
    """A list of cue dicts. Required keys: fam, name, frame, visual. Optional: dur (frames), pan, gain_db,
    struct (bool: structural hit, within 1 frame), cls ('transition'|'content'), scene, params."""
    def __init__(self, nframes, scenes):
        self.n, self.scenes, self.cues = nframes, scenes, []

    def add(self, fam, name, frame, visual, **kw):
        c = dict(fam=fam, name=name, frame=float(frame), visual=visual)
        c.update(kw)
        c.setdefault("cls", "content"); c.setdefault("struct", False); c.setdefault("pan", 0.0); c.setdefault("cue", None)
        self.cues.append(c)
        return c

    def scene_at(self, f):
        for s in self.scenes:
            if s[1] <= f < s[2]: return s[0]
        return self.scenes[-1][0]


def transition(tl, b, scene, kind_in, kind_out, style, length=None, cls="transition"):
    """Everything that happens when the camera flies from one plane to the next (arrival on beat frame b)."""
    mv, direction = style
    pre, post = (30, 20) if scene == "E1" else (18, 14)
    if length: pre, post = length
    inten = {"E1": 0.55, "E2": 0.9}.get(scene, 1.0)
    tl.add("camera", f"camera_{mv}", b - pre, f"camera {mv.replace('_', ' ')} into {scene}", dur=pre + post,
           move=mv, direction=direction, inten=inten, scene=scene, cls=cls)
    lock = b + post
    tl.add("focus", "focus_lock", lock, f"rack focus resolves on {scene} plane (sharp)", pull=min(post + 2, 16),
           struct=True, scene=scene, cls=cls, gain_db=-4 if scene == "E1" else 0)
    if kind_out is not None:
        tl.add("focus", "defocus_smear", b - 14, f"leaving plane goes soft ({kind_out})", dur=16, scene=scene, cls=cls)
        tl.add("paper", "departure_slide", b - 16, f"{kind_out} plane slides away", dur=9,
               direction=direction or (1 if mv == "dolly_in" else -1), scene=scene, cls=cls)
    if scene not in ("E1", "E2"):
        tl.add("ink_press", "press_clunk", b, f"scene change on beat into {scene}", struct=True, scene=scene, cls=cls,
               pan=0.0)
        tl.add("room", "press_hum", b - 2, f"press hum burst at scene change ({scene})", scene=scene, cls=cls)
    if kind_in == "card":
        tl.add("paper", "card_arrival", lock, f"{scene} card plane settles", struct=True, scene=scene, cls=cls)
        tl.add("ink_press", "misreg_jolt", b + 4, f"{scene} ink layers shift (misregistration)", scene=scene,
               cls=cls, pan=0.25 * (1 if (b // 20) % 2 else -1))
    elif kind_in == "screen":
        tl.add("paper", "panel_arrival", lock, f"{scene} real screen panel settles", struct=True, scene=scene, cls=cls)


def type_cues(tl, scene, b0, groups, gap=20, gain_db=0.0):
    nG = len(groups)
    for i, g in enumerate(groups):
        pan = -0.35 + 0.7 * i / max(nG - 1, 1)
        tl.add("type", "word_strike", b0 + i * gap, f"{scene} word group {i+1}: '{g}'", idx=i + 3 * len(scene),
               pan=pan, struct=True, scene=scene, gain_db=gain_db)


def script_timeline(scenes):
    tl = TL(1800, scenes)
    kinds = {s[0]: s[3] for s in scenes}
    prev = None
    for sid, f0, f1, kind in scenes:
        if sid != "S0":
            ko = {"open": "card", "honest": "card", "end": "card"}.get(kinds[prev], kinds[prev])
            ki = "card" if kind in ("card",) else ("screen" if kind == "screen" else kind)
            transition(tl, f0, sid, ki, ko, ARRIVAL_STYLE.get(sid, ("dolly_in", 0)))
        prev = sid
        if sid == "S0":
            tl.add("camera", "camera_dolly_in", 0, "opening slow push over bare paper", dur=60, move="dolly_in",
                   inten=0.35, scene=sid)
            tl.add("focus", "focus_lock", 16, "paper plane comes into focus", pull=14, struct=True, scene=sid, gain_db=-6)
            tl.add("ink_press", "roller_draw", 4, "cobalt floor line draws left to right", dur=32, direction=1, scene=sid)
            tl.add("ink_press", "lockup_stamp", 40, "lockup stamps onto paper", struct=True, scene=sid)
            tl.add("ink_press", "misreg_jolt", 43, "layers settle 3 px -> 1 px", scene=sid, pan=-0.2)
            type_cues(tl, sid, 60, CARD_GROUPS["S0"])
            tl.add("type", "mono_ticks", 120, f"mono sub: '{MONO_SUBS['S0']}'", count=5, struct=True, scene=sid, pan=0.1)
        elif kind == "card":
            tl.add("type", "mono_ticks", f0, f"label '{LABELS[sid]}'", count=3, struct=True, scene=sid, pan=-0.3)
            g = CARD_GROUPS[sid]
            type_cues(tl, sid, f0 + (0 if len(g) == 3 else 20), g)
            if sid in MONO_SUBS:
                tl.add("type", "mono_ticks", f0 + 40 + 6, f"mono sub: '{MONO_SUBS[sid]}'", count=5, struct=True,
                       scene=sid, pan=0.1)
        elif kind == "screen":
            if sid in CAPTIONS:
                f, txt = CAPTIONS[sid]
                tl.add("type", "mono_ticks", f, f"caption '{txt}'", count=4, struct=True, scene=sid, pan=-0.2, gain_db=-3)
            for f, txt in CALLOUTS.get(sid, []):
                tl.add("paper", "sticker_pop", f, f"callout sticker '{txt}'", struct=True, scene=sid,
                       pan=0.3 if (f // 20) % 2 else -0.25)
        elif sid == "E1":
            tl.add("emotion", "honest_thud", f0, "E1 'A floor is not a guarantee.' card lands, room ducks",
                   struct=True, scene=sid)
            type_cues(tl, sid, f0, CARD_GROUPS["E1"], gain_db=-7)
            tl.add("type", "mono_ticks", f0 + 40, f"mono sub: '{MONO_SUBS['E1']}'", count=4, struct=True, scene=sid,
                   gain_db=-6, pan=0.1)
        elif sid == "E2":
            tl.add("emotion", "landing", f0, "E2 'We are live on mainnet.' landing (impact, stamp, burst, shimmer)",
                   struct=True, scene=sid, until=min(f0 + 110, f1 - 4))
            type_cues(tl, sid, f0 + 20, CARD_GROUPS["E2"][1:], gain_db=-2)
            tl.cues[-1]["visual"] = "E2 word group 2: 'on mainnet.' (accent)"
            tl.add("type", "mono_ticks", f0 + 40, f"mono line '{MONO_SUBS['E2']}'", count=4, struct=True, scene=sid, pan=-0.1)
            tl.add("type", "mono_ticks", f0 + 60, "small mono line 'App screens in this video show example data.'",
                   count=3, struct=True, scene=sid, gain_db=-4, pan=0.15)
    # within-scene camera moves (follow on the T1 slider, small page re-framings in A1/A2)
    tl.add("camera", "camera_follow_in", 478, "T1 camera follows into the slider thumb", dur=26, move="dolly_in", inten=0.35, scene="T1")
    tl.add("camera", "camera_follow_out", 560, "T1 camera eases back to the whole panel", dur=26, move="pull_back", inten=0.35, scene="T1")
    for f, sc, d in ((928, "A1", 1), (1088, "A1", -1), (1272, "A2", 1)):
        tl.add("camera", "camera_reframe", f, f"{sc} camera re-frames on page change", dur=26, move="orbit",
               direction=d, inten=0.4, scene=sc)
    return tl


# ---------- UI events from capture (or the capture contract) ----------
def load_shot_events(shot):
    """Returns dict like SHOT_FALLBACK[shot] from capture/<sub>/events.json files, or None."""
    subs = SUBSHOTS.get(shot, [(shot, 0, SHOTS[shot][2])])
    out = {"scroll": [], "clicks": [], "drags": [], "keys": [], "flips": [], "rows": [], "src": []}
    found = False
    for name, g0, _ in subs:
        p = os.path.join(CAPTURE, name, "events.json")
        if not os.path.exists(p):
            continue
        try:
            ev = json.load(open(p))
        except Exception as e:
            print("unreadable", p, e); continue
        found = True; out["src"].append(name)
        fd = ev.get("frames_data", [])
        notes = ev.get("notes", "") or ""
        down_prev, drag_start, v_start = False, None, None
        sy = [d.get("scrollY") for d in fd]
        for d in fd:
            k = d["i"] + g0
            dn = bool(d.get("mouse", {}).get("down"))
            if d.get("click"):
                out["clicks"].append((k, "click", f"{name} click k{d['i']}"))
            if dn and not down_prev:
                drag_start = k; v_start = d.get("floor")
            if down_prev and not dn and drag_start is not None:
                out["drags"].append((drag_start, k, v_start, d.get("floor", v_start)))
                drag_start = None
            down_prev = dn
        # per-frame slider values (one detent per whole-percent step)
        vals = [(d["i"] + g0, d.get("floor")) for d in fd if d.get("floor") is not None]
        out.setdefault("steps", [])
        for (k0, a), (k1, b) in zip(vals, vals[1:]):
            if b != a:
                m = int(round(abs(b - a)))
                for s in range(max(m, 1)):
                    out["steps"].append((k1 + s / max(m, 1) - 0.5 * (m > 1), a + np.sign(b - a) * (s + 1)))
        # scroll speed segments
        if any(v is not None for v in sy):
            y = np.array([v or 0 for v in sy], float)
            sp = np.abs(np.diff(y))
            moving = sp > 0.5
            k = 0
            while k < len(sp):
                if moving[k]:
                    j = k
                    while j < len(sp) and moving[j]: j += 1
                    if j - k >= 6:
                        out["scroll"].append((k + g0, j + 1 + g0))
                    k = j
                else:
                    k += 1
            out.setdefault("scroll_speed", {})[name] = (g0, sp.tolist())
        m = re.search(r"keys at k([\d,\s]+)", notes)
        if m:
            out["keys"] += [int(x) + g0 for x in re.findall(r"\d+", m.group(1))]
    if not found:
        return None
    return out


def classify_clicks(shot, clicks):
    """Give real clicks a role (chip / button / confirm / check / nav) by order, per the capture contract."""
    fb = SHOT_FALLBACK.get(shot, {}).get("clicks", [])
    out = []
    for i, (k, _, desc) in enumerate(sorted(clicks)):
        role = "chip"
        if fb:
            near = min(fb, key=lambda c: abs(c[0] - k))
            if abs(near[0] - k) <= 30:
                role, desc = near[1], near[2] + f" ({desc})"
        out.append((k, role, desc))
    return out


def ui_cues(tl, shot_offsets, sources):
    for shot, (scene, v0_default, nfr) in SHOTS.items():
        v0 = shot_offsets.get(shot, v0_default)
        ev = load_shot_events(shot)
        src = "capture" if ev else "contract"
        if ev is None:
            ev = dict(SHOT_FALLBACK[shot]); ev["steps"] = []
            for (k0, k1, a, b) in ev["drags"]:      # eased drag, one detent per percent
                for s in range(1, int(abs(b - a)) + 1):
                    target = s / abs(b - a)
                    u = np.linspace(0, 1, 2001); pos = np.where(u < .5, 4 * u ** 3, 1 - (-2 * u + 2) ** 3 / 2)
                    us = u[np.searchsorted(pos, target - 0.5 / abs(b - a))]
                    ev["steps"].append((round(k0 + us * (k1 - k0)), a - np.sign(a - b) * s))
            clicks = SHOT_FALLBACK[shot]["clicks"]
        else:
            clicks = classify_clicks(shot, ev["clicks"])
            if not ev["flips"]:
                ev["flips"] = SHOT_FALLBACK[shot]["flips"] if shot != "T1_try" else \
                    [(k + 2, f"chart swap after {d}") for k, r, d in clicks if r == "chip"]
            if not ev["rows"]: ev["rows"] = SHOT_FALLBACK[shot]["rows"]
            if not ev["keys"]: ev["keys"] = SHOT_FALLBACK[shot]["keys"]
        sources.add(f"{shot}:{src}")
        V = lambda k: v0 + k
        lim = lambda f: f < tl.n - 2
        for k, role, desc in clicks:
            if not lim(V(k)): continue
            nm = {"confirm": "click_confirm", "chip": "click_chip", "check": "click_chip", "nav": "click",
                  "button": "click", "field": "click"}.get(role, "click")
            tl.add("ui", nm, V(k), f"{scene} real cursor click: {desc} [{src}]", struct=True, scene=scene,
                   pan=0.15, role=role, gain_db={"check": -4, "field": -3}.get(role, 0))
        for (k0, k1, a, b) in ev["drags"]:
            tl.add("ui", "mouse_down", V(k0), f"{scene} mouse down on slider thumb ({a}%) [{src}]", struct=True, scene=scene)
            tl.add("ui", "mouse_up", V(k1), f"{scene} mouse up ({b}%) [{src}]", scene=scene)
            tl.add("ui", "drag_felt", V(k0), f"{scene} slider drag {a}% -> {b}% [{src}]", dur=k1 - k0, scene=scene)
        steps = ev.get("steps", [])
        if steps:
            vmax = max(v for _, v in steps); vmin = min(v for _, v in steps)
            for k, v in steps:
                if not lim(V(k)): continue
                tl.add("ui", "slider_detent", V(k), f"{scene} slider value -> {v:g}% [{src}]", struct=True,
                       value=float(v), vmin=vmin, vmax=vmax, scene=scene, pan=-0.05 - 0.2 * (vmax - v) / max(vmax - vmin, 1))
        for (k0, k1) in ev["scroll"]:
            tl.add("ui", "scroll_glide", V(k0), f"{scene} page scroll glide [{src}]", dur=k1 - k0, scene=scene,
                   speed=ev.get("scroll_speed", {}))
        for k in ev["keys"]:
            if lim(V(k)):
                tl.add("ui", "key_tick", V(k), f"{scene} typed digit in Deposit [{src if ev.get('src') else 'contract'}]",
                       struct=True, scene=scene, pan=0.1)
        for k, desc in ev["flips"]:
            if lim(V(k)):
                tl.add("ui", "paper_flip", V(k), f"{scene} {desc}", scene=scene, pan=0.1)
        for i, k in enumerate(ev["rows"]):
            if lim(V(k)):
                tl.add("ui", "row_tick", V(k), f"{scene} table row {i+1} appears (assumed timing)", scene=scene,
                       pan=-0.2 + 0.05 * i, gain_db=-2 * (i % 2))


# ---------- compositor cues.json ----------
def walk(o, out, path=""):
    if isinstance(o, dict):
        f = None
        for k in ("frame", "f", "start_frame", "frame_start", "video_frame"):
            if isinstance(o.get(k), (int, float)): f = float(o[k]); break
        if f is None:
            for k in ("t", "time", "seconds", "start_s", "t_start", "start"):
                if isinstance(o.get(k), (int, float)): f = float(o[k]) * FPS; break
        if f is not None:
            name = " ".join(str(o.get(k, "")) for k in ("event", "type", "kind", "name", "cue", "id", "what", "label"))
            e = None
            for k in ("end_frame", "frame_end", "to_frame"):
                if isinstance(o.get(k), (int, float)): e = float(o[k]); break
            if e is None:
                for k in ("end", "t_end", "end_s"):
                    if isinstance(o.get(k), (int, float)): e = float(o[k]) * FPS; break
            if e is None and isinstance(o.get("dur_frames"), (int, float)): e = f + o["dur_frames"]
            out.append({"name": (path + " " + name).lower().strip(), "f": f, "end": e, "raw": o})
        for k, v in o.items():
            if isinstance(v, (dict, list)): walk(v, out, (path + " " + str(k)).strip())
    elif isinstance(o, list):
        for v in o: walk(v, out, path)


def cues_timeline(scenes, base):
    """Overlay the compositor's cues.json on the fallback timeline. Returns (tl, shot_offsets, notes)."""
    raw = json.load(open(CUES))
    items = []; walk(raw, items)
    notes = []
    def find(*keys, excl=()):
        return sorted([it for it in items if any(k in it["name"] for k in keys) and not any(x in it["name"] for x in excl)],
                      key=lambda d: d["f"])
    tl = TL(1800, scenes)
    # 1) shot offsets: video frame of capture frame 0
    shot_off = {}
    for it in items:
        r = it["raw"]
        sh = r.get("shot") or r.get("capture_shot")
        if isinstance(sh, str) and isinstance(r.get("capture_frame"), (int, float)):
            key = "A1" if sh.startswith("A1") else "A2" if sh.startswith("A2") else sh
            g0 = dict((n, g) for n, g, _ in SUBSHOTS.get(key, [])).get(sh, 0)
            shot_off.setdefault(key, int(round(it["f"] - r["capture_frame"] - g0)))
    if shot_off: notes.append(f"shot offsets from cues.json: {shot_off}")
    return tl, shot_off, items, notes


def build_master(timing, sources):
    scenes, ssrc = parse_script_scenes()
    sources.add("scenes:" + ssrc)
    tl = script_timeline(scenes)
    shot_off = {}
    if timing != "script" and os.path.exists(CUES):
        try:
            tl, shot_off, items = apply_cues(tl, scenes, sources)
        except Exception as e:
            import traceback; traceback.print_exc()
            print("cues.json could not be applied, keeping SCRIPT.md timing:", e)
    ui_cues(tl, shot_off if timing != "script" else {}, sources if timing != "script" else set())
    if timing == "script":
        sources.add("SCRIPT.md + capture contract (forced)")
    return tl


def apply_cues(tl, scenes, sources):
    """Adapter for the compositor's cues.json (filled in once its schema is known; generic keyword mapping)."""
    raw = json.load(open(CUES))
    items = []; walk(raw, items)
    shot_off = {}
    for it in items:
        r = it["raw"]
        sh = r.get("shot") or r.get("capture_shot")
        if isinstance(sh, str) and isinstance(r.get("capture_frame"), (int, float)):
            key = "A1" if sh.startswith("A1") else "A2" if sh.startswith("A2") else sh
            g0 = dict((n, g) for n, g, _ in SUBSHOTS.get(key, [])).get(sh, 0)
            shot_off.setdefault(key, int(round(it["f"] - r["capture_frame"] - g0)))
    sources.add("cues.json (generic)")
    return tl, shot_off, items


# ======================================================================================
# v2: voices and the cue-driven timeline (cues.json / cues_cut15.json used directly)
# ======================================================================================
CUES15 = os.path.join(V2, "cues_cut15.json")


def retime(sig, pk):
    """Move the peak of a symmetric-envelope move to fraction pk of its length (same length out)."""
    n = len(sig); u = np.arange(n) / n
    src = np.interp(u, warp_pk(u, pk), u) * n      # inverse of warp: where in the original each output sample comes from
    idx = np.arange(n)
    if sig.ndim == 1: return np.interp(src, idx, sig)
    return np.stack([np.interp(src, idx, sig[:, k]) for k in range(sig.shape[1])], 1)


def camera_move(R, dur, inten, dyaw, direction, pk, back=False):
    """Dolly (air rising + sub swell) mixed with an orbit sweep whose weight follows the yaw change of the move;
    a pull back swaps the dolly for the falling pull-back voice."""
    wo = 0.18 + 0.82 * min(1.0, abs(dyaw) / 40.0)       # 0.18 (pure dolly) .. 1 (orbit-heavy)
    wd = 1.0 - 0.45 * (wo - 0.18)
    d = (cam_pull_back if back else cam_dolly_in)(R, dur, 1.0)
    o = cam_orbit(R, dur, 1.0, direction)
    y = wd * d + 0.9 * wo * o
    return inten * retime(y, pk)


def defocus_bloom(R, dur):
    """Soft defocus bloom as a plane arrives out of focus: wide, low-mid, swells at once and relaxes while the lens
    closes in (the focus_lock hiss then clears above it)."""
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    x = swept_noise(R, n, 1100 * (380 / 1100) ** smoothstep(u), 1.9 - 0.7 * u, width=0.95)
    env = np.clip(t / 0.04, 0, 1) * (1 - smoothstep(u)) ** 1.3
    br = 1 + 0.12 * np.sin(2 * np.pi * 3.1 * t + R.uniform(0, 6))
    return 0.14 * x * (env * br)[:, None]


def arrow_draw(R, dur=0.13):
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    x = swept_noise(R, n, 1500 + 2500 * smoothstep(u), 1.3, width=0.3)
    x = deharsh(x) * (np.sin(np.pi * u) ** 1.5)[:, None]
    return 0.22 * x


STICKER_PAN = {"T1_drag": -0.30, "T1_tradeoff": 0.20, "T1_crash": -0.20, "A1_basket": -0.45, "A1_floor": -0.45,
               "A1_term": -0.40, "A1_review": 0.50, "A2_tiles": 0.15, "A2_keeper": 0.20, "G1_mcp": 0.35}
CLICK_ROLE = {("A1a_builder", 26): "chip", ("A1a_builder", 83): "chip", ("A1a_builder", 101): "field",
              ("A1a_builder", 135): "button", ("A1a_builder", 159): "check", ("A1a_builder", 167): "check",
              ("A1a_builder", 175): "check", ("A1b_review", 0): "confirm", ("A2b_keeper", 2): "nav"}


def cue_timeline(path, label, master_path=CUES):
    d = json.load(open(path)); N = d["frames"]; base = os.path.basename(path)
    cues = [dict(c, _i=i) for i, c in enumerate(d["cues"])]
    st = {s["id"]: s for s in d["stations"]}
    ids = [s["id"] for s in d["stations"]]
    scenes = [(s["id"], s["arrive"], (d["stations"][k + 1]["arrive"] if k + 1 < len(ids) else N),
               "card" if all(c.get("plane") == "card" for c in cues if c["kind"] == "arrival" and c["station"] == s["id"]) else "screen")
              for k, s in enumerate(d["stations"])]
    tl = TL(N, scenes); tl.duck = []; tl.drift = []; tl.notes = []
    cid = lambda c: f"{base}#{c['_i']}:{c['name']}"
    # rebuild list properly (above loop only collected notes)
    out = []
    mst = {}
    if path != master_path and os.path.exists(master_path):
        m = json.load(open(master_path)); mst = {s["id"]: s for s in m["stations"]}
    for c in cues:
        if c["frame"] >= N and c.get("station") in st and c["station"] in mst:
            off = st[c["station"]]["arrive"] - mst[c["station"]]["arrive"]
            nf = c["frame"] + off
            if nf <= st[c["station"]]["depart"] and nf < N - 2:
                out.append(dict(c, frame=nf, remapped=f"master f{c['frame']} {off:+d}")); tl.notes.append(f"remapped {c['name']} f{c['frame']}->{nf}")
            else:
                tl.notes.append(f"dropped {c['name']} (master f{c['frame']} falls outside the cut's hold of {c['station']})")
        else:
            out.append(c)
    cues = out
    cues.sort(key=lambda c: (c["frame"], c["_i"]))
    # capture anchors: (shot, capture_frame, frame)
    anchors = [(c["shot"], c["capture_frame"], c["frame"]) for c in cues if "shot" in c and "capture_frame" in c]
    lock = {c["station"]: c["frame"] for c in cues if c["kind"] == "focus_lock"}
    kindof = {s[0]: s[3] for s in scenes}
    def add(fam, name, f, vis, c, **kw):
        kw.setdefault("cue", cid(c) if c else None)
        return tl.add(fam, name, f, vis, **kw)
    nxt_lat = {}
    for c in cues:
        k, f, S = c["kind"], c["frame"], c.get("station")
        scn = S or tl.scene_at(f)
        if k == "arrival":
            if S == "S0" and f == 0:
                continue                               # film opens from the room bed, no thud on frame 0
            if S in ("E1", "E2"):
                continue                               # emotion family owns these two arrivals
            nm = "card_arrival" if c["plane"] == "card" else "panel_arrival"
            add("paper", nm, f, f"{S} {c['plane']} settles (camera arrives)", c, struct=True, scene=S)
            lk = lock.get(S, f + 14)
            add("focus", "defocus_bloom", f, f"{S} plane arrives defocused: soft bloom until focus lock f{lk}", c,
                dur=max(lk - f, 6), scene=S)
        elif k == "focus_lock":
            S0 = st[S]["arrive"]
            pull = max(f - S0, 8)
            add("focus", "focus_lock", f, f"{S} blur clears; sharp from f{f} (tick on the lock frame)", c, pull=min(pull, 16),
                struct=True, scene=S, gain_db=-4 if S == "E1" else (-6 if S == "S0" else 0))
            if S in ("E1", "E2"):
                add("focus", "defocus_bloom", S0, f"{S} plane arrives defocused: soft bloom until focus lock", c,
                    dur=max(f - S0, 6), scene=S, gain_db=-3 if S == "E1" else 0)
        elif k == "defocus":
            if f >= N - 6: continue
            add("focus", "defocus_smear", f, f"{S} plane leaves focus", c, dur=16, scene=S)
            add("paper", "departure_slide", f, f"{S} plane slides out", c, dur=9, direction=1, scene=S)
        elif k == "camera":
            if c["move"] == "hold-drift":
                tl.drift.append((f, c["end_frame"], c.get("intensity", 0.15))); continue
            a, b = c["frame"], c["end_frame"]
            pk = (c.get("peak_frame", (a + b) / 2) - a) / (b - a)
            dirn = 1 if c.get("lateral") == "right" else -1
            tl.add("camera", "camera_move", a, f"camera {c['move']} to {S}: {c['distance_units']} units, yaw {c['yaw_start']}->{c['yaw_end']}, {c['lateral']}",
                   dur=b - a, inten=c.get("intensity", 1), dyaw=c["yaw_end"] - c["yaw_start"], direction=dirn, pk=pk,
                   back=c.get("direction") in ("back", "backward"), scene=S, cls="transition", cue=cid(c),
                   struct=False, peak_frame=c.get("peak_frame"))
            if S == "E1":
                tl.duck_e1_start = a
            if S == "E2":
                tl.duck_e2_end = b
        elif k == "stamp":
            if S == "S0":
                add("ink_press", "lockup_stamp", f, "S0 lockup stamps onto paper", c, struct=True, scene=S)
                add("ink_press", "misreg_jolt", f + 3, "layers settle (misregistration 3 px to 1 px, inferred +3 f)", c, scene=S, pan=-0.2, struct=False)
                add("ink_press", "roller_draw", max(f - 17, 1), "cobalt floor line draws before the stamp (inferred window f3-f19)", c, dur=16, direction=1, scene=S, gain_db=-3)
            else:
                add("ink_press", "lockup_stamp", f, f"{S} lockup stamps", c, struct=True, scene=S, gain_db=-5, pan=-0.15)
        elif k == "word_reveal":
            role, txt = c["role"], c["text"]
            pre = f < lock.get(S, 0)
            g = -4 if pre else 0
            if S == "E1": g -= 7 if role == "headline" else 6
            if S == "E2" and role == "headline": g -= 2
            if role == "headline":
                grp = [x for x in cues if x["kind"] == "word_reveal" and x.get("station") == S and x["role"] == "headline"]
                j = grp.index(c); pan = -0.35 + 0.7 * j / max(len(grp) - 1, 1)
                add("type", "word_strike", f, f"{S} headline group: '{txt}'", c, idx=zlib.crc32(c["name"].encode()) % 6,
                    pan=pan, struct=True, scene=S, gain_db=g, delay_s=0.012 if f == 0 else 0.0)
            elif role == "label":
                add("type", "mono_ticks", f, f"{S} label '{txt}'", c, count=3, pan=-0.3, struct=True, scene=S, gain_db=g - 1)
            else:
                same = [x for x in cues if x["kind"] == "word_reveal" and x["role"] == "sub" and x["frame"] == f and x.get("station") == S]
                j = same.index(c) if c in same else 0
                add("type", "mono_ticks", f, f"{S} mono line '{txt[:48]}'", c, count=3 + (len(txt) > 30) + (len(txt) > 45),
                    pan=0.1 if len(same) == 1 else -0.45 + 0.3 * j, struct=True, scene=S, gain_db=g - (2 if len(same) > 1 else 0))
        elif k == "caption":
            add("type", "mono_ticks", f, "mono caption chip appears", c, count=4, pan=-0.2, struct=True, scene=tl.scene_at(f), gain_db=-3)
        elif k == "sticker_pop":
            add("paper", "sticker_pop", f, f"sticker '{c['text']}' ({c['color']}) pops", c, struct=True, scene=scn,
                pan=STICKER_PAN.get(c["name"], 0.2))
        elif k == "sticker_text":
            base_nm = c["name"].replace(" text", "")
            add("type", "mono_ticks", f, f"sticker text '{base_nm}' prints", c, count=3, pan=STICKER_PAN.get(base_nm, 0.2), scene=scn, gain_db=-6, struct=True)
        elif k == "arrow":
            base_nm = c["name"].replace(" arrow", "")
            add("paper", "arrow_draw", f, f"arrow from '{base_nm}' sticker draws toward the real control", c, scene=scn, pan=STICKER_PAN.get(base_nm, 0.2))
        elif k == "sticker_out":
            add("paper", "sticker_out", f, f"sticker '{c['name']}' leaves", c, scene=scn, pan=STICKER_PAN.get(c["name"], 0.2), direction=-1)
        elif k == "ui_click_down":
            add("ui", "mouse_down", f, f"{c['shot']} real mouse down", c, struct=True, scene=scn, pan=max(-0.5, min(0.5, c["x"] / 1440 - 0.5)))
        elif k == "ui_click_up":
            add("ui", "mouse_up", f, f"{c['shot']} real mouse up", c, scene=scn)
        elif k == "ui_click":
            role = "chip" if c["shot"] == "T1_try" else "click"
            for (sh, cf), r in CLICK_ROLE.items():
                if sh == c["shot"] and abs(cf - c["capture_frame"]) <= 3: role = r
            nm = {"confirm": "click_confirm", "chip": "click_chip", "check": "click_chip", "nav": "click", "button": "click", "field": "click"}.get(role, "click")
            pan = max(-0.5, min(0.5, c["x"] / 1440 - 0.5))
            add("ui", nm, f, f"{c['shot']} real click ({role}) at x={c['x']:.0f}", c, struct=True, scene=scn, pan=pan, role=role,
                gain_db={"check": -4, "field": -3}.get(role, 0))
            if c["shot"] == "T1_try":
                add("ui", "paper_flip", f + 2, "chart swaps after the chip click (inferred +2 f)", c, scene=scn, pan=0.1)
        elif k == "slider_step":
            v = c["value"]
            add("ui", "slider_detent", f, f"{c['shot']} slider -> {v}%", c, struct=True, value=float(v), vmin=80, vmax=90,
                abs_pitch=True, scene=scn, pan=-0.10 - 0.30 * (90 - v) / 10)
        elif k == "page_change":
            add("ui", "paper_flip", f, f"page change {c['name']}", c, struct=True, scene=scn, pan=0.1)
    # --- scroll: one continuous swish per run of scroll cues (speed follows speed_px_per_frame)
    sc = [c for c in cues if c["kind"] == "scroll"]
    run = []
    def flush(run):
        if not run: return
        add("ui", "scroll_swish", run[0]["frame"] - 2, f"{run[0]['shot']} page scroll: {len(run)} scroll cues, felt swish follows speed", run[0],
            frames=[x["frame"] for x in run], speeds=[x["speed_px_per_frame"] for x in run], dur=run[-1]["frame"] - run[0]["frame"] + 4,
            scene=tl.scene_at(run[0]["frame"]), cue=f"{base}#{run[0]['_i']}..{run[-1]['_i']} ({len(run)} scroll cues)")
    for c in sc:
        if run and c["frame"] - run[-1]["frame"] > 4: flush(run); run = []
        run.append(c)
    flush(run)
    # --- key ticks from capture events (typing digits), anchored to the nearest cue of the same shot
    for shot in {a[0] for a in anchors}:
        p = os.path.join(CAPTURE, shot, "events.json")
        if not os.path.exists(p): continue
        notes = json.load(open(p)).get("notes", "")
        m_ = re.search(r"keys[^.]*?at k(\d+(?:,\d+)+)", notes)
        if not m_: continue
        for kf in map(int, m_.group(1).split(",")):
            near = min((a for a in anchors if a[0] == shot), key=lambda a: abs(a[1] - kf))
            if abs(near[1] - kf) <= 12 and near[2] + kf - near[1] < N - 2:
                f = near[2] + kf - near[1]
                tl.add("ui", "key_tick", f, f"{shot} typed digit (capture k{kf}, notes)", struct=True, scene=tl.scene_at(f), pan=0.1, cue=f"{shot}/events.json notes keys k{kf}")
    # --- E1 pulls everything down; E2 lands with the impact stack
    e1 = st.get("E1"); e2 = st.get("E2")
    if e1:
        f_e1 = e1["arrive"]
        add("emotion", "honest_thud", f_e1, "E1 'A floor is not a guarantee.' card lands; everything pulls down", {"_i": -1, "name": "card E1 settled"} if False else next(c for c in cues if c["kind"] == "arrival" and c["station"] == "E1"), struct=True, scene="E1")
        a = getattr(tl, "duck_e1_start", f_e1 - 20)
        rel = (e2["arrive"] - 2) if e2 else N
        tl.duck.append((a, f_e1 + 10, rel - 2, rel + 8, 0.30))
    if e2:
        h0 = next((c for c in cues if c["name"] == "E2_h0"), None)
        f_l = h0["frame"] if h0 else e2["arrive"] + 2
        add("emotion", "landing", f_l, "E2 'We are live on mainnet.' lands: low hit, stamp, paper burst, shimmer", h0 or next(c for c in cues if c["kind"] == "arrival" and c["station"] == "E2"),
            struct=True, scene="E2", until=min(f_l + 110, N - 4))
    return tl


# ======================================================================================
# 30 s cut
# ======================================================================================
CUT30_DEFAULT = {
    "note": ("SCRIPT.md: 30 s cut = S0 (4 beats), T1 (8), A1 (10), E1+E2 (7), C2/C3 folded into 2-beat labels. "
             "Those beats sum to 33 (22 s), not 45 (30 s); the 12 missing beats are distributed here: S0 6 (keeps the "
             "whole headline), T1 12, A1 12 (builder + confirm), E1 5, E2 6 (keeps the full landing). Replace with the "
             "composer's / compositor's edit points when they exist; make_sfx.py re-reads this file."),
    "frames": 900,
    "segments": [
        {"scene": "S0", "src": [0, 120], "dst": 0},
        {"scene": "C2", "src": [400, 440], "dst": 120, "label_only": True},
        {"scene": "T1", "src": [460, 700], "dst": 160},
        {"scene": "C3", "src": [740, 780], "dst": 400, "label_only": True},
        {"scene": "A1", "src": [800, 960], "dst": 440},
        {"scene": "A1", "src": [1000, 1080], "dst": 600, "mid_scene": True},
        {"scene": "E1", "src": [1580, 1680], "dst": 680},
        {"scene": "E2", "src": [1680, 1800], "dst": 780}]}


CUT15_DEFAULT = {
    "note": ("SCRIPT.md 15 s cut for X: hook 0-4 beats (custom: first word group on frame 1, headline complete by "
             "frame 60), simulator 4-11 (T1 slider 90->80 + COVID chip), app 11-16 (A1 review click, confirm, confirmed), "
             "honest card 16-18 (E1), end card 18-22 (E2 landing hit on cut frame 360). src = master frames. Replace "
             "src ranges with the composer's / compositor's edit points when they exist; make_sfx.py re-reads this file."),
    "frames": 440,
    "segments": [
        {"scene": "S0", "src": [0, 80], "dst": 0, "custom": "hook15"},
        {"scene": "T1", "src": [480, 620], "dst": 80},
        {"scene": "A1", "src": [925, 965], "dst": 220,
         "extra": [{"fam": "type", "name": "mono_ticks", "frame": 224, "count": 4, "gain_db": -3, "pan": -0.2,
                    "visual": "caption 'EXAMPLE DATA ON SCREEN'"}]},
        {"scene": "A1", "src": [1000, 1030], "dst": 260, "mid_scene": True},
        {"scene": "A1", "src": [1086, 1116], "dst": 290, "mid_scene": True},
        {"scene": "E1", "src": [1580, 1620], "dst": 320},
        {"scene": "E2", "src": [1680, 1760], "dst": 360}]}


def hook15(tl, d, n):
    tl.add("camera", "camera_dolly_in", d, "hook: slow push over the paper", dur=60, move="dolly_in", inten=0.35, scene="S0")
    tl.add("focus", "focus_lock", d + 12, "hook headline plane comes into focus", pull=12, struct=True, scene="S0", gain_db=-6)
    tl.add("ink_press", "roller_draw", d + 2, "cobalt floor line draws under the headline", dur=30, direction=1, scene="S0", gain_db=-3)
    for i, (f, g) in enumerate(zip((1, 20, 40), CARD_GROUPS["S0"])):
        tl.add("type", "word_strike", d + f, f"hook word group {i+1}: '{g}'", idx=i + 6, pan=-0.35 + 0.35 * i,
               struct=True, scene="S0")
    tl.add("ink_press", "misreg_jolt", d + 43, "headline complete, layers settle", scene="S0", pan=0.2)
    tl.add("type", "mono_ticks", d + 60, "mono sub 'Live on BNB Chain mainnet.'", count=4, struct=True, scene="S0", pan=0.1)


def build_cut(master, cut):
    scenes30 = []
    for i, s in enumerate(cut["segments"]):
        n = s["src"][1] - s["src"][0]
        sid = s["scene"] + ("b" * sum(1 for x in cut["segments"][:i] if x["scene"] == s["scene"]))
        kind = {"S": "open", "C": "card", "E": "honest" if s["scene"] == "E1" else "end"}.get(s["scene"][0], "screen")
        scenes30.append((sid, s["dst"], s["dst"] + n, kind))
    tl = TL(cut["frames"], scenes30)
    kinds = {s[0]: s[3] for s in master.scenes}
    styles = {}
    for c in master.cues:
        if c["fam"] == "camera" and c["cls"] == "transition":
            styles[c["scene"]] = (c["move"], c.get("direction", 0))
    prev_kind = None
    for i, s in enumerate(cut["segments"]):
        a, b = s["src"]; d = s["dst"]; sc = s["scene"]
        kind = kinds.get(sc, "card")
        if i > 0:
            style = ("orbit", 1 if i % 2 else -1) if s.get("mid_scene") else styles.get(sc, ARRIVAL_STYLE.get(sc, ("dolly_in", 0)))
            ki = "screen" if kind == "screen" else ("card" if kind == "card" else kind)
            transition(tl, d, sc, ki, prev_kind, style)
        prev_kind = "screen" if kind == "screen" else "card"
        if s.get("custom") == "hook15":
            hook15(tl, d, b - a)
        else:
            for c in master.cues:
                if c["cls"] == "transition": continue
                if a <= c["frame"] < b and (c["scene"] == sc):
                    cc = dict(c); cc["frame"] = c["frame"] - a + d
                    if "until" in cc: cc["until"] = min(c["until"] - a + d, d + (b - a) - 4)
                    if "dur" in cc and cc["frame"] + cc["dur"] > d + (b - a) + 10:
                        cc["dur"] = max(6, d + (b - a) + 10 - cc["frame"])
                    cc["visual"] = c["visual"] + f" [cut: from master f{int(c['frame'])}]"
                    tl.cues.append(cc)
        for e in s.get("extra", []):
            e = dict(e); tl.add(e.pop("fam"), e.pop("name"), e.pop("frame"), e.pop("visual"), scene=sc, **e)
    return tl


# ======================================================================================
# Render
# ======================================================================================
def warp_pk(u, pk):
    """Re-time u in 0..1 so the symmetric bell peaks at fraction pk."""
    u = np.clip(u, 0, 1); pk = min(max(pk, 0.1), 0.9)
    return np.where(u < pk, 0.5 * u / pk, 0.5 + 0.5 * (u - pk) / (1 - pk))


def speed_env(tl, n):
    sp = np.zeros(n)
    for c in tl.cues:
        if c["fam"] == "camera":
            i0 = int(F2S(c["frame"]) * SR); m = int(F2S(c["dur"]) * SR)
            u = np.arange(m) / m
            seg = bell(warp_pk(u, c.get("pk", 0.5))) * c.get("inten", 1.0)
            i1 = min(n, i0 + m)
            if i1 > max(i0, 0):
                sp[max(i0, 0):i1] = np.maximum(sp[max(i0, 0):i1], seg[max(-i0, 0):i1 - i0])
    for (f0, f1, inten) in getattr(tl, "drift", []):
        i0, i1 = int(F2S(f0) * SR), min(n, int(F2S(f1) * SR))
        sp[i0:i1] = np.maximum(sp[i0:i1], inten)
    return np.clip(sp, 0, 1)


def place(buf, sig, t0, pan, R, haas=True, fin=0.003, fout=0.004):
    """Mono: low band (<150 Hz) centred and mono, upper band panned (constant power) with a small Haas delay
    on the far side (0.2-2.4 ms, randomized) and tiny L/R gain randomization. Stereo: panned by balance."""
    sig = edge(sig, fin, fout)
    if sig.ndim == 1:
        low = signal.sosfiltfilt(sos("lowpass", 150, 2), sig) if len(sig) > 30 else sig * 0
        hi = sig - low
        a = (pan + 1) * np.pi / 4
        gl, gr = np.cos(a) * R.uniform(0.97, 1.0), np.sin(a) * R.uniform(0.97, 1.0)
        L = hi * gl; Rr = hi * gr
        if haas and abs(pan) >= 0.15:
            dly = int(R.uniform(0.2, 2.4) * abs(pan) * SR / 1000) + 1
            if pan > 0: L = np.concatenate([np.zeros(dly), L])[:len(L)]
            else: Rr = np.concatenate([np.zeros(dly), Rr])[:len(Rr)]
        s = np.stack([L + low * 0.7071, Rr + low * 0.7071], 1)
    else:
        s = sig.copy()
        if pan:
            a = (pan + 1) * np.pi / 4
            s[:, 0] *= np.cos(a) * 1.4142; s[:, 1] *= np.sin(a) * 1.4142
    i0 = int(round(t0 * SR))
    if i0 < 0: s = s[-i0:]; i0 = 0
    i1 = min(buf.shape[0], i0 + s.shape[0])
    if i1 > i0: buf[i0:i1] += s[:i1 - i0]
    return float(np.abs(s).max()) if s.size else 0.0


BASE_DB = {  # instance level (dB) before the global gain; tuned by ear-less design rules
    "camera_dolly_in": -11, "camera_pull_back": -12, "camera_orbit": -12, "camera_follow_in": -11,
    "camera_follow_out": -12, "camera_reframe": -12,
    "focus_lock": -9, "defocus_smear": -16,
    "card_arrival": -6, "panel_arrival": -7, "departure_slide": -14, "sticker_pop": -9, "rustle_bed": -30,
    "lockup_stamp": 0, "roller_draw": -12, "press_clunk": -15, "misreg_jolt": -24,
    "word_strike": -3, "mono_ticks": -17,
    "click": -8, "click_chip": -9, "click_confirm": -6, "mouse_down": -9, "mouse_up": -17, "slider_detent": -10,
    "drag_felt": -37, "paper_flip": -15, "scroll_glide": -22, "key_tick": -18, "row_tick": -25,
    "camera_move": -11, "defocus_bloom": -17, "arrow_draw": -23, "sticker_out": -18, "scroll_swish": -27,
    "honest_thud": -6, "landing": -1, "press_hum": -33, "room_bed": -34}
HUMANIZE_MS = 6.0


def render(tl, key, label):
    n = tl.n * SR // FPS
    dry = {f: np.zeros((n, 2)) for f in FAMILIES}
    rows = []
    sp = speed_env(tl, n)
    e1 = [c for c in tl.cues if c["name"] == "honest_thud"] if not getattr(tl, "duck", None) else []
    duck = np.ones(n)
    xs = np.arange(n)
    for (a, b, c_, d_, depth) in getattr(tl, "duck", []):
        r = np.clip(np.minimum((xs - a * SR / FPS) / max((b - a) * SR / FPS, 1), (d_ * SR / FPS - xs) / max((d_ - c_) * SR / FPS, 1)), 0, 1)
        duck = np.minimum(duck, 1 - (1 - depth) * r)
    for c in e1:   # E1: everything else pulls down (and the room bed nearly to silence)
        i0 = int(F2S(c["frame"] - 22) * SR); i1 = int(F2S(c["frame"] + 96) * SR)
        x = np.arange(n)
        duck = np.minimum(duck, 1 - 0.65 * np.clip(np.minimum((x - i0) / (0.5 * SR), (i1 - x) / (0.6 * SR)), 0, 1))
    for c in sorted(tl.cues, key=lambda c: c["frame"]):
        R = rng_for(label, c["fam"], c["name"], round(c["frame"], 3))
        nm = c["name"]; base = nm
        jitter = 0.0 if (c.get("struct") or nm.startswith("camera_")) else R.uniform(-HUMANIZE_MS, HUMANIZE_MS) / 1000
        t0 = F2S(c["frame"]) + jitter + c.get("delay_s", 0.0)
        g = 10 ** ((BASE_DB.get(base, -20) + c.get("gain_db", 0)) / 20)
        i_c = min(int(t0 * SR), n - 1)
        if c["fam"] not in ("emotion", "room"): g *= duck[max(i_c, 0)]
        pan = c.get("pan", 0.0); off = 0.0
        if nm == "camera_move":
            sig = camera_move(R, F2S(c["dur"]), c.get("inten", 1), c.get("dyaw", 0), c.get("direction", 1), c.get("pk", 0.5), c.get("back", False)); fam = "camera"
        elif nm == "defocus_bloom":
            sig = defocus_bloom(R, F2S(c["dur"])); fam = "focus"
        elif nm == "arrow_draw":
            sig = arrow_draw(R); fam = "paper"
        elif nm == "sticker_out":
            sig = card_departure(R, 0.18, c.get("direction", 1)); fam = "paper"
        elif nm == "scroll_swish":
            fr = np.array(c["frames"], float); sp_ = np.array(c["speeds"], float)
            m = int((fr[-1] - fr[0] + 4) * SR / FPS)
            tf = fr[0] - 2 + np.arange(m) * FPS / SR
            e = np.interp(tf, fr, (sp_ / 19.0) ** 0.7, left=0, right=0)
            e = signal.sosfiltfilt(sos("lowpass", 18, 2), e); e = np.clip(e, 0, 1)
            sig = scroll_glide(R, e); t0 = F2S(fr[0] - 2); fam = "ui"
        elif nm.startswith("camera_"):
            d = F2S(c["dur"]); mv = c["move"]
            sig = {"dolly_in": cam_dolly_in, "pull_back": cam_pull_back}.get(mv)
            sig = sig(R, d, c.get("inten", 1)) if sig else cam_orbit(R, d, c.get("inten", 1), c.get("direction", 1) or 1)
            fam = "camera"
        elif nm == "focus_lock":
            sig, off = focus_lock(R, F2S(c.get("pull", 14))); t0 -= off; fam = "focus"
        elif nm == "defocus_smear":
            sig = defocus_smear(R, F2S(c["dur"])); fam = "focus"
        elif nm == "card_arrival":
            sig = card_arrival(R); fam = "paper"
        elif nm == "panel_arrival":
            sig = panel_arrival(R); fam = "paper"
        elif nm == "departure_slide":
            sig = card_departure(R, F2S(c.get("dur", 8)), c.get("direction", 1)); fam = "paper"
        elif nm == "sticker_pop":
            sig, off = sticker_pop(R); t0 -= off; fam = "paper"
        elif nm == "lockup_stamp":
            sig = ink_stamp(R); fam = "ink_press"
        elif nm == "roller_draw":
            sig = roller_draw(R, F2S(c["dur"]), c.get("direction", 1)); fam = "ink_press"
        elif nm == "press_clunk":
            sig = press_clunk(R); fam = "ink_press"
        elif nm == "misreg_jolt":
            sig = misreg_jolt(R); fam = "ink_press"
        elif nm == "word_strike":
            sig = letterpress(R, key, c.get("idx", 0)); fam = "type"
        elif nm == "mono_ticks":
            sig = mono_ticks(R, c.get("count", 4)); fam = "type"
        elif nm in ("click", "click_chip", "click_confirm"):
            sig = click_pair(R, resolved=(nm == "click_confirm"))
            if nm == "click_chip":
                sig = sig + 0.0
                pat = noise_burst(R, 0.04, 300, 2500, 0.006); sig[:len(pat)] += 0.25 * pat / (np.abs(pat).max() + 1e-9)
            fam = "ui"
        elif nm == "mouse_down":
            sig = mouse_click(R, False); fam = "ui"
        elif nm == "mouse_up":
            sig = mouse_click(R, True) * 1.4; fam = "ui"
        elif nm == "slider_detent":
            v, vmin, vmax = c["value"], c["vmin"], c["vmax"]
            # pitch falls slightly with the value: spans 3 scale degrees, snapped to the key
            f = key.hz(int(round(v - 80)), 5) if c.get("abs_pitch") else key.near(1450 * 2 ** (-(vmax - v) / max(vmax - vmin, 1) * 5 / 12))
            sig = detent(R, f); fam = "ui"; c["pitch_hz"] = round(f, 1)
        elif nm == "drag_felt":
            sig = drag_felt(R, F2S(c["dur"])); fam = "ui"
        elif nm == "scroll_glide_old":
            d = c["dur"]; m = int(F2S(d) * SR)
            u = np.arange(m) / m; spd = bell(u)
            sig = scroll_glide(R, spd); fam = "ui"
        elif nm == "key_tick":
            sig = key_tick(R); fam = "ui"
        elif nm == "paper_flip":
            sig = paper_flip(R); fam = "ui"
        elif nm == "row_tick":
            sig = row_tick(R); fam = "ui"
        elif nm == "honest_thud":
            sig = honest_thud(R); fam = "emotion"
        elif nm == "landing":
            hold = F2S(c["until"] - c["frame"])
            sig = landing(R, key, hold); fam = "emotion"
        elif nm == "press_hum":
            sig = press_hum(R, key); fam = "room"
        else:
            print("unknown cue", nm); continue
        pk = place(dry[fam], sig * g, t0, pan, R, fin=0.003 if nm not in ("focus_lock",) else 0.003,
                   fout=0.005)
        rows.append(dict(family=fam, name=nm, frame=round(c["frame"], 2), seconds=round(F2S(c["frame"]), 4),
                         sound_start_s=round(t0, 4), duration_s=round(sig.shape[0] / SR, 3),
                         gain_db=round(BASE_DB.get(base, -20) + c.get("gain_db", 0), 1), pan=round(pan, 2),
                         peak_pre_gain_dbfs=round(20 * np.log10(pk + 1e-12), 1), structural=bool(c.get("struct")),
                         humanize_ms=round(jitter * 1000, 2), scene=c.get("scene"), cls=c.get("cls"),
                         visual=c["visual"], cue_id=c.get("cue"), **({"pitch_hz": c["pitch_hz"]} if "pitch_hz" in c else {})))
    # continuous beds
    R = rng_for(label, "rustle")
    rb = rustle_bed(R, sp) * 10 ** (BASE_DB["rustle_bed"] / 20)
    dry["paper"] += rb
    rows.append(dict(family="paper", name="rustle_bed", frame=0, seconds=0.0, sound_start_s=0.0,
                     duration_s=n / SR, gain_db=BASE_DB["rustle_bed"], pan=0.0, structural=False,
                     visual="parallax paper layers (level follows camera speed)", scene="all", cls="bed"))
    R = rng_for(label, "room")
    lvl = 0.55 + 0.45 * sp
    t = np.arange(n) / SR
    lvl *= np.clip((t - 0.005) / 0.6, 0, 1) * np.clip((n / SR - 0.005 - t) / 0.9, 0, 1)
    lvl *= duck ** 3.2      # E1: near silence
    room = room_bed(R, n, lvl) * 10 ** (BASE_DB["room_bed"] / 20)
    dry["room"] += room
    rows.append(dict(family="room", name="room_bed", frame=0, seconds=0.0, sound_start_s=0.0, duration_s=n / SR,
                     gain_db=BASE_DB["room_bed"], pan=0.0, structural=False, scene="all", cls="bed",
                     visual="paper-studio room tone; rises with camera moves; ducks to near silence for E1"))
    # room reflections on a send (per family, kept in the family stem)
    ir = room_ir(rng_for("ir"))
    out = {}
    for f in FAMILIES:
        x = dry[f]
        if SEND[f] > 0:
            wet = np.stack([signal.oaconvolve(x[:, 0] + 0.3 * x[:, 1], ir[:, 0])[:n],
                            signal.oaconvolve(x[:, 1] + 0.3 * x[:, 0], ir[:, 1])[:n]], 1)
            x = x + SEND[f] * wet
        if f not in ("room", "camera", "emotion"):
            x = deharsh(x)
        x = signal.sosfilt(sos("highpass", 24, 2), x, axis=0)     # no subsonic / DC
        out[f] = x
    return out, rows


# ======================================================================================
# Measurement
# ======================================================================================
def kweight(x):
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]; a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]; a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def short_term(x, win=3.0, hop=0.1):
    y = kweight(x); p = (y ** 2).sum(axis=1)
    c = np.concatenate([[0], np.cumsum(p)])
    w, h = int(win * SR), int(hop * SR)
    idx = np.arange(0, len(p) - w + 1, h)
    ms = (c[idx + w] - c[idx]) / w
    return idx / SR, -0.691 + 10 * np.log10(ms + 1e-20)


def integrated(x):
    y = kweight(x); p = (y ** 2).sum(axis=1)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    c = np.concatenate([[0], np.cumsum(p)])
    idx = np.arange(0, len(p) - blk + 1, hop)
    z = (c[idx + blk] - c[idx]) / blk
    l = -0.691 + 10 * np.log10(z + 1e-20)
    z = z[l > -70]
    if not len(z): return -99.0
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    z2 = z[(-0.691 + 10 * np.log10(z)) > rel]
    return float(-0.691 + 10 * np.log10(z2.mean()))


def true_peak(x):
    up = signal.resample_poly(x, 4, 1, axis=0)
    return float(20 * np.log10(np.abs(up).max() + 1e-12))


def tp_limit(x, ceil_db):
    """Transparent true-peak limiter (5 ms look-ahead, smooth gain). Returns (y, max GR dB, ms of GR>0.5 dB)."""
    from scipy.ndimage import minimum_filter1d
    ceil = 10 ** (ceil_db / 20)
    up = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.abs(up).max(axis=1)
    pk = pk[: (len(pk) // 4) * 4].reshape(-1, 4).max(axis=1)
    pk = np.pad(pk, (0, len(x) - len(pk)), mode="edge")
    pk = np.maximum(pk, np.abs(x).max(axis=1))
    g = np.minimum(1.0, ceil / np.maximum(pk, 1e-12))
    L = int(0.005 * SR)
    g = minimum_filter1d(g, 2 * L + 1)
    w = np.hanning(2 * L + 1); w /= w.sum()
    g = np.convolve(np.pad(g, (L, L), mode="edge"), w, mode="valid")
    gr = -20 * np.log10(g)
    return x * g[:, None], float(gr.max()), float((gr > 0.5).sum() / SR * 1000)


_ONSET_CACHE = {}


def onset(x, t, search=0.06, band=None, cache_key=None, ratio=3.0):
    ck = (cache_key, band, x.shape[0])
    if ck in _ONSET_CACHE:
        m, e = _ONSET_CACHE[ck]
    else:
        if band:
            lo, hi = band
            if lo: x = signal.sosfilt(sos("highpass", lo, 4), x, axis=0)
            if hi: x = signal.sosfilt(sos("lowpass", hi, 4), x, axis=0)
        m = np.abs(x).max(axis=1)
        w = int(0.003 * SR)
        e = np.sqrt(np.maximum(signal.fftconvolve(m ** 2, np.ones(w) / w)[w - 1:], 0))
        if cache_key is not None: _ONSET_CACHE[ck] = (m, e)
    w = int(0.003 * SR)
    hop = int(0.0005 * SR)
    for nn in range(max(int((t - search) * SR), int(0.006 * SR)), min(int((t + search) * SR), len(m) - w), hop):
        bl = max(0.004, min(0.02, 0.6 * search)); gd = min(0.004, 0.25 * search)
        i_a = nn - int((bl + gd) * SR); i_b = nn - int(gd * SR)
        base = (np.sqrt((m[max(i_a, 0): i_b] ** 2).mean()) if i_b > max(i_a, 0) else 0.0) + 1e-7
        if e[nn] > ratio * base and e[nn] > 3e-5:
            return nn / SR
    return None


DETECT_BAND = {"focus_lock": (900, None), "card_arrival": (None, 400), "panel_arrival": (None, 900),
               "sticker_pop": (None, 900), "lockup_stamp": (None, None), "press_clunk": (None, 1200),
               "word_strike": (150, None), "mono_ticks": (1200, None), "click": (900, None),
               "click_chip": (900, None), "click_confirm": (900, None), "mouse_down": (900, None),
               "slider_detent": (900, None), "key_tick": (300, None), "honest_thud": (None, 200),
               "landing": (None, 200), "sticker_out": (None, None)}


def spectrogram_png(x, path, title, nframes, marks, scenes):
    from PIL import Image, ImageDraw
    mono = x.mean(axis=1); n = len(mono)
    nfft, hop = 4096, max(int(n / 1800), 240)
    win = np.hanning(nfft)
    pad = np.concatenate([np.zeros(nfft // 2), mono, np.zeros(nfft // 2)])
    frames = np.lib.stride_tricks.sliding_window_view(pad, nfft)[::hop][: n // hop]
    S = np.abs(np.fft.rfft(frames * win, axis=1)) / (win.sum() / 2)
    db = 20 * np.log10(S + 1e-9)
    W, H, ml, mt, mb = len(frames), 520, 60, 34, 46
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    fy = np.geomspace(20, 24000, H)[::-1]
    img = db[:, np.clip(np.searchsorted(freqs, fy), 0, len(freqs) - 1)].T
    v = np.clip((img + 120) / 95, 0, 1)
    stops = np.array([[11, 12, 14], [36, 64, 224], [124, 147, 255], [255, 116, 105], [250, 250, 248]]) / 255
    pos = np.linspace(0, 1, len(stops))
    rgb = np.stack([np.interp(v, pos, stops[:, c]) for c in range(3)], axis=-1)
    im = Image.new("RGB", (W + ml + 10, H + mt + mb), (250, 250, 248))
    im.paste(Image.fromarray((rgb * 255).astype(np.uint8)), (ml, mt))
    d = ImageDraw.Draw(im)
    d.text((ml, 8), title + "  (log f 20 Hz-24 kHz, -120..-25 dBFS; coral ticks = cues; scene ids below)", fill=(11, 12, 14))
    for f in (50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000):
        y = mt + int(np.argmin(np.abs(fy - f)))
        d.line([(ml - 6, y), (ml, y)], fill=(11, 12, 14))
        d.text((4, y - 6), f"{f/1000:g}k" if f >= 1000 else str(f), fill=(11, 12, 14))
    px = lambda fr: ml + int(F2S(fr) * SR / hop)
    for s in range(0, int(n / SR) + 1, 5):
        d.line([(px(s * FPS), mt + H), (px(s * FPS), mt + H + 5)], fill=(11, 12, 14))
        d.text((px(s * FPS) - 6, mt + H + 7), f"{s}s", fill=(11, 12, 14))
    for sid, f0, f1, _ in scenes:
        d.line([(px(f0), mt + H + 20), (px(f0), mt + H + 30)], fill=(36, 64, 224), width=2)
        d.text((px(f0) + 3, mt + H + 22), sid, fill=(36, 64, 224))
    for fr in marks:
        d.line([(px(fr), mt - 7), (px(fr), mt - 1)], fill=(255, 116, 105), width=1)
    im.save(path)


def write_wav24(path, x):
    x = np.clip(x, -1.0, 1.0 - 2 ** -23)
    q = np.round(x * (2 ** 23)).astype(np.int32)
    b = np.ascontiguousarray(q.astype("<i4")).view(np.uint8).reshape(-1, 4)[:, :3].reshape(-1)
    data = b.tobytes(); ch = x.shape[1]
    hdr = b"RIFF" + (36 + len(data)).to_bytes(4, "little") + b"WAVE"
    hdr += b"fmt " + (16).to_bytes(4, "little") + (1).to_bytes(2, "little") + ch.to_bytes(2, "little")
    hdr += SR.to_bytes(4, "little") + (SR * ch * 3).to_bytes(4, "little")
    hdr += (ch * 3).to_bytes(2, "little") + (24).to_bytes(2, "little")
    hdr += b"data" + len(data).to_bytes(4, "little")
    with open(path, "wb") as fh:
        fh.write(hdr + data)


def read_wav24(path):
    raw = open(path, "rb").read()
    i = raw.find(b"data"); nbytes = int.from_bytes(raw[i + 4:i + 8], "little")
    b = np.frombuffer(raw[i + 8:i + 8 + nbytes], np.uint8).reshape(-1, 3)
    v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
    v = np.where(v >= 2 ** 23, v - 2 ** 24, v)
    return (v.reshape(-1, 2) / 2 ** 23).astype(np.float64)


# ======================================================================================
# Main
# ======================================================================================
def finish(stems, rows, tl, label, suffix, args, meas, png=True):
    n = tl.n * SR // FPS
    # global gain: SFX sum peaks at -12 LUFS short-term in its busiest 3 s
    tot = sum(stems.values())
    ts, st = short_term(tot)
    gain_db = -12.0 - st.max()
    # keep every stem within 3 dB of the true-peak ceiling BEFORE the limiter, so the limiter only trims
    # (a 14 dB squash on the low hits would smear them); the mixer raises stems later if it wants more level
    peak_db = max(20 * np.log10(np.abs(stems[f]).max() + 1e-12) for f in FAMILIES)
    gain_db = min(gain_db, (-6.3 + 3.0) - peak_db)
    if args.fixed_gain is not None:
        gain_db = args.fixed_gain
    g = 10 ** (gain_db / 20)
    res = {"global_gain_db": round(gain_db, 2), "stems": {}}
    fade = np.ones(n); k5 = int(0.005 * SR); k3 = int(0.003 * SR)
    fade[:k5] = 0; fade[-k5:] = 0
    fade[k5:k5 + k3] = np.linspace(0, 1, k3); fade[-k5 - k3:-k5] = np.linspace(1, 0, k3)
    final = {}
    for f in FAMILIES:
        x = stems[f] * g
        x, gr, grms = tp_limit(x, -6.3)
        x = x * fade[:, None]
        path = os.path.join(HERE, f"{f}{suffix}.wav")
        write_wav24(path, x)
        y = read_wav24(path)
        final[f] = y
        _, sst = short_term(y)
        mono = y.mean(axis=1)
        side = (y[:, 0] - y[:, 1]) / 2
        lowc = signal.sosfiltfilt(sos("lowpass", 150, 4), y, axis=0)
        cc = np.corrcoef(lowc[:, 0], lowc[:, 1])[0, 1] if np.abs(lowc).max() > 1e-7 else 1.0
        rms_lr = np.sqrt((y ** 2).mean()); rms_m = np.sqrt((mono ** 2).mean())
        b25 = signal.sosfiltfilt(sos("bandpass", [2000, 5000], 4), y, axis=0)
        res["stems"][f] = {
            "file": os.path.relpath(path, VIDEO), "samples": int(y.shape[0]), "channels": int(y.shape[1]),
            "duration_s": y.shape[0] / SR, "sample_peak_dbfs": round(20 * np.log10(np.abs(y).max() + 1e-12), 2),
            "true_peak_dbtp": round(true_peak(y), 2), "integrated_lufs": round(integrated(y), 1),
            "short_term_max_lufs": round(float(sst.max()), 1), "limiter_max_gr_db": round(gr, 2),
            "limiter_ms_over_0p5db": round(grms, 1),
            "mono_sum_minus_stereo_rms_db": round(20 * np.log10((rms_m + 1e-12) / (rms_lr + 1e-12)), 2),
            "low_band_LR_correlation": round(float(cc), 3),
            "band_2k_5k_re_total_db": round(10 * np.log10(((b25 ** 2).sum() + 1e-20) / ((y ** 2).sum() + 1e-20)), 1),
            "first_5ms_peak": float(np.abs(y[:k5]).max()), "last_5ms_peak": float(np.abs(y[-k5:]).max())}
    tot = sum(final.values())
    ts, st = short_term(tot)
    res["sum_short_term_max_lufs"] = round(float(st.max()), 1)
    res["sum_short_term_max_at_s"] = round(float(ts[st.argmax()] + 1.5), 1)
    res["sum_integrated_lufs"] = round(integrated(tot), 1)
    res["sum_true_peak_dbtp"] = round(true_peak(tot), 2)
    # onset checks for every structural cue
    checks = []; masked = []
    struct = [r for r in rows if r["structural"]]
    by_fam = {}
    for r in struct: by_fam.setdefault(r["family"], []).append(r)
    for f, rs in by_fam.items():
        ts_ = sorted(r["seconds"] for r in rs)
        for r in rs:
            t = r["seconds"]
            others = [abs(t - u) for u in ts_ if abs(t - u) > 1e-6]
            gap = min(others) if others else 1.0
            s = max(0.008, min(0.06, 0.45 * gap))
            prior = [u for u in ts_ if 0 < t - u <= 0.08]
            if prior:
                masked.append({"family": f, "name": r["name"], "frame": r["frame"], "reason": "another structural cue of the family within 80 ms before"}); continue
            m = onset(final[f], t, s, DETECT_BAND.get(r["name"]), cache_key=(label, f), ratio=8.0 if r["name"] == "sticker_pop" else 3.0)
            checks.append({"family": f, "name": r["name"], "frame": r["frame"], "intended_s": t,
                           "measured_s": None if m is None else round(m, 4),
                           "err_ms": None if m is None else round((m - t) * 1000, 1), "visual": r["visual"]})
    found = [c for c in checks if c["err_ms"] is not None]
    res["onsets"] = {"structural_cues": len(checks), "found": len(found),
                     "worst_abs_err_ms": max((abs(c["err_ms"]) for c in found), default=None),
                     "mean_abs_err_ms": round(float(np.mean([abs(c["err_ms"]) for c in found])), 2) if found else None}
    worst = sorted(found, key=lambda c: -abs(c["err_ms"]))[:5]
    res["onsets"]["worst5"] = worst
    res["onsets"]["missing"] = [c for c in checks if c["err_ms"] is None]
    res["onsets"]["masked_by_neighbour"] = masked
    # camera envelope sync: lag of the stem's RMS envelope against the intended speed profile, per move
    lags = []
    y = final["camera"]; e = np.sqrt(np.convolve((y ** 2).sum(1), np.ones(480) / 480, mode="same"))
    cams = [r for r in rows if r["family"] == "camera"]
    for r in cams:
        c0 = r["seconds"]; d = r["duration_s"]
        if any(o is not r and o["seconds"] < c0 + d + 0.25 and o["seconds"] + o["duration_s"] > c0 - 0.25 for o in cams):
            continue                       # overlapping moves blend into one envelope; not a fair single-move check
        i0, i1 = int(c0 * SR), int((c0 + d) * SR)
        if i1 > len(e): continue
        seg = e[i0 - int(0.2 * SR) if i0 > int(0.2 * SR) else 0: i1 + int(0.2 * SR)][::48]
        ref = np.zeros_like(seg); a0 = (i0 - max(i0 - int(0.2 * SR), 0)) // 48
        u = np.arange((i1 - i0) // 48) / ((i1 - i0) / 48)
        ref[a0:a0 + len(u)] = bell(u)[: len(ref) - a0]
        xc = np.correlate(seg - seg.mean(), ref - ref.mean(), "full")
        lag = (np.argmax(xc) - (len(ref) - 1)) / 1000
        lags.append(lag)
    res["camera_envelope_lag_ms"] = {"moves": len(lags), "max_abs": round(1000 * max(map(abs, lags)), 1) if lags else None,
                                     "median": round(1000 * float(np.median(lags)), 1) if lags else None}
    if png:
        os.makedirs(os.path.join(HERE, "spec"), exist_ok=True)
        for f in FAMILIES:
            marks = [r["frame"] for r in rows if r["family"] == f and r["cls"] != "bed"]
            spectrogram_png(final[f], os.path.join(HERE, "spec", f"{f}{suffix}.png"), f"{f}{suffix}.wav", tl.n, marks, tl.scenes)
        spectrogram_png(tot, os.path.join(HERE, "spec", f"ALL_sum{suffix}.png"), f"sum of all SFX stems{suffix}",
                        tl.n, [r["frame"] for r in rows if r["structural"]], tl.scenes)
    return res, checks, final


def timeline_text(rows, scenes):
    out = []
    for sid, f0, f1, kind in scenes:
        rs = [r for r in rows if r["cls"] != "bed" and f0 - 18 <= r["frame"] < f1 - 18 + (18 if sid == scenes[-1][0] else 0)]
        fams = {}
        for r in rs: fams.setdefault(r["family"], []).append(r["name"])
        def summ(names):
            c = {}
            for x in names: c[x] = c.get(x, 0) + 1
            return ", ".join(f"{k}x{v}" if v > 1 else k for k, v in c.items())
        out.append(f"{sid} f{f0}-{f1} ({F2S(f0):.1f}-{F2S(f1):.1f} s, {kind}): " +
                   "; ".join(f"{f}: {summ(v)}" for f, v in fams.items()))
    return out


def main():
    global SEED
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=None)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--timing", choices=["auto", "script"], default=os.environ.get("FLOOR_SFX_TIMING", "auto"))
    ap.add_argument("--only", choices=["60", "15", "all"], default="all")
    ap.add_argument("--no-png", action="store_true")
    ap.add_argument("--fixed-gain", type=float, default=None, help="override the global gain (dB)")
    args = ap.parse_args()
    SEED = args.seed
    t_start = time.time()
    keysrc = "--key"
    ks = args.key
    if ks is None and os.path.exists(ARRANGE):
        try:
            arr = json.load(open(ARRANGE))
            k = arr.get("key") or arr.get("tonality") or (arr.get("meta") or {}).get("key")
            if isinstance(k, dict): k = f"{k.get('tonic', 'D')} {k.get('mode', 'major')}"
            if k: ks, keysrc = str(k), "music/arrangement.json"
        except Exception as e:
            print("arrangement.json unreadable:", e)
    if ks is None: ks, keysrc = "D major", "default"
    key = Key(ks)
    print("key:", key.name, f"({keysrc})")
    sources = set()
    use_cues = args.timing != "script" and os.path.exists(CUES)
    if use_cues:
        master = cue_timeline(CUES, "60"); sources.add("v2/cues.json (60 s master, used directly)")
    else:
        master = build_master(args.timing, sources)
    meas = {"key": key.name, "key_source": keysrc, "seed": SEED, "timing_sources": sorted(sources)}
    allrows = {}
    if args.only in ("60", "all"):
        stems, rows = render(master, key, "60")
        res, checks, _ = finish(stems, rows, master, "60", "", args, meas, not args.no_png)
        meas["master_60s"] = res; allrows["60s"] = rows; meas["master_60s"]["onset_table"] = checks
    if args.only in ("15", "all") and os.path.exists(CUES15) and use_cues:
        tlc = cue_timeline(CUES15, "15"); sources.add("v2/cues_cut15.json (15 s cut, used directly)")
        stems, rows = render(tlc, key, "15s")
        res, checks, _ = finish(stems, rows, tlc, "15s", "_15s", args, meas, not args.no_png)
        meas["cut_15s"] = res; allrows["15s"] = rows; res["onset_table"] = checks; res["scenes"] = tlc.scenes
        res["cue_file_repairs"] = tlc.notes
        meas["timeline_15s"] = timeline_text(rows, tlc.scenes)
    cm = {"fps": FPS, "sr": SR, "bpm": 90, "frames_per_beat": BPF, "key": key.name, "seed": SEED,
          "timing_sources": sorted(sources), "families": FAMILIES,
          "level_note": "gain_db = instance level before the global stem gain; global gain and limiter in measure.json",
          "cues": allrows.get("60s", []), "cues_15s": allrows.get("15s", []), }
    json.dump(cm, open(os.path.join(HERE, "sfx_cue_map.json"), "w"), indent=1)
    meas["timeline_60s"] = timeline_text(allrows.get("60s", []), master.scenes)
    meas["counts_60s"] = {f: sum(1 for r in allrows.get("60s", []) if r["family"] == f) for f in FAMILIES}
    for lab in ("15s",):
        meas["counts_" + lab] = {f: sum(1 for r in allrows.get(lab, []) if r["family"] == f) for f in FAMILIES}
    meas["render_s"] = round(time.time() - t_start, 1)
    json.dump(meas, open(os.path.join(HERE, "measure.json"), "w"), indent=1, default=float)
    print(json.dumps({k: v for k, v in meas.items() if not k.startswith(("master_", "cut_", "timeline_"))}, indent=1))
    for lab in ("master_60s", "cut_15s", "cut_30s"):
        if lab in meas:
            r = meas[lab]
            print(lab, "gain", r["global_gain_db"], "sumS", r["sum_short_term_max_lufs"], "sumTP", r["sum_true_peak_dbtp"],
                  "onsets", {k: v for k, v in r["onsets"].items() if k not in ("worst5", "missing")},
                  "camlag", r["camera_envelope_lag_ms"])
            for f, s in r["stems"].items():
                print(f"  {f:10s} TP {s['true_peak_dbtp']:6.2f}  I {s['integrated_lufs']:6.1f}  Smax {s['short_term_max_lufs']:6.1f}"
                      f"  GR {s['limiter_max_gr_db']:4.1f}  mono {s['mono_sum_minus_stereo_rms_db']:5.2f}  lowcc {s['low_band_LR_correlation']}"
                      f"  2-5k {s['band_2k_5k_re_total_db']}  n {s['samples']}")
            for w in r["onsets"]["worst5"]: print("   worst", w["family"], w["name"], w["frame"], w["err_ms"])
            for w in r["onsets"]["missing"]: print("   MISSING", w["family"], w["name"], w["frame"])
    for line in meas["timeline_60s"]: print(line)


if __name__ == "__main__":
    main()
