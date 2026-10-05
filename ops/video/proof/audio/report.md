# Proof clip audio: report

**Verification status: this mix has been verified by measurement and visual spectrogram inspection only, NOT by ear.** Nobody has listened to it yet.

Timing source used for this build: **capture/events.json (slider steps from per-frame floor value) + proof/cues.json (motion agent frames) (storyboard for anything not found)**.

Re-run: `python3 ops/video/proof/audio/make_audio.py` (from repo root; numpy + scipy + Pillow; seed 20261005; ~10 s). `FLOOR_AUDIO_TIMING=storyboard` forces storyboard timing.

## Files
- `mix.wav` 48 kHz / 24-bit PCM / stereo / 480000 samples (10.000 s)
- `music.wav`, `sfx.wav` stems, same format; post master gain and post limiter gain curve, so `music + sfx` equals `mix` to within 24-bit rounding
- `spec_mix.png`, `spec_sfx.png`, `spec_music.png` (log freq 20 Hz to 24 kHz; coral ticks on top = cue times; coral line = 16 kHz)
- `timing_used.json` (every cue time used), `measure.json` (all numbers below)

## Loudness (ffmpeg `ebur128=peak=true` on the final mix.wav)

| metric | value | target |
|---|---|---|
| Integrated | -14.0 LUFS | -14 +-1 |
| True peak | -1.6 dBTP | <= -1 |
| Momentary max | -8.1 LUFS | |
| Loudness range | 5.9 LU | |

## Integrity checks (numpy on the written 24-bit file)

- samples 480000, channels 2, duration 10.0000 s
- first 5 ms peak -240.0 dBFS, last 5 ms peak -240.0 dBFS (-240 = digital zero; need < -60)
- sample peak -1.61 dBFS; any sample at full scale: False
- stem peaks: music -1.43 dBFS, sfx -1.14 dBFS (no clipping)
- DC offset L/R [-83.4, -83.1] dBFS
- energy above 16 kHz -46.9 dB re total; 2-5 kHz band -18.0 dB re total
- master gain 3.6 dB; true-peak limiter (4x oversampled, 5 ms lookahead, ceiling -1.6 dBTP): max GR 4.05 dB, 135.8 ms total with GR > 0.5 dB (transients only)

## Cue onset accuracy

Onset = first 1 ms step where the 4 ms RMS rises >= 9 dB over the preceding 5-25 ms (baseline and guard shortened for close cues), searched +-60 ms around the cue (narrowed to < half the gap when cues are closer, e.g. two 1 % slider steps inside one frame), on the stem that carries the cue (end chord: music stem high-passed at 400 Hz so the pad does not mask it; slider ticks: sfx high-passed at 5 kHz, i.e. the detent click). The detector window starts slightly before the energy, so a -2..-3 ms reading means on time. Where the real slider jumped 2 % in one frame, the second detent is 16.7 ms after the first (inside the same frame); its -6..-8 ms reading is the edge of the narrowed search window catching the tail of the first tick. A direct 5 kHz-band probe of sfx.wav shows that second click rising ~30 dB exactly at its time (e.g. 3.450 s).

**22/22 cues found, max |error| 6.5 ms (1 frame = 33.3 ms).**

| cue | stem | frame | intended s | measured s | err ms |
|---|---|---|---|---|---|
| line draw | sfx | 3.0 | 0.1 | 0.098 | -2.0 |
| stamp | sfx | 15.0 | 0.5 | 0.498 | -2.0 |
| word 1 | sfx | 30.0 | 1.0 | 0.997 | -3.0 |
| word 2 | sfx | 45.0 | 1.5 | 1.497 | -3.0 |
| word 3 | sfx | 60.0 | 2.0 | 1.997 | -3.0 |
| cut 1 (whoosh+thud) | sfx | 75.0 | 2.5 | 2.497 | -3.0 |
| slider tick 1 (89%) | sfx | 103.0 | 3.4333 | 3.4298 | -3.5 |
| slider tick 2 (88%) | sfx | 103.5 | 3.45 | 3.4435 | -6.5 |
| slider tick 3 (87%) | sfx | 105.0 | 3.5 | 3.4965 | -3.5 |
| slider tick 4 (86%) | sfx | 107.0 | 3.5667 | 3.5632 | -3.5 |
| slider tick 5 (85%) | sfx | 107.5 | 3.5833 | 3.5768 | -6.5 |
| slider tick 6 (84%) | sfx | 110.0 | 3.6667 | 3.6632 | -3.5 |
| slider tick 7 (83%) | sfx | 110.5 | 3.6833 | 3.6768 | -6.5 |
| slider tick 8 (82%) | sfx | 113.0 | 3.7667 | 3.7632 | -3.5 |
| slider tick 9 (81%) | sfx | 118.0 | 3.9333 | 3.9298 | -3.5 |
| slider tick 10 (80%) | sfx | 118.5 | 3.95 | 3.9435 | -6.5 |
| crash line | sfx | 147.0 | 4.9 | 4.897 | -3.0 |
| cut 2 (hit+whoosh) | sfx | 210.0 | 7.0 | 6.997 | -3.0 |
| card word 2 | sfx | 225.0 | 7.5 | 7.497 | -3.0 |
| shape hit 1 | sfx | 240.0 | 8.0 | 7.997 | -3.0 |
| shape hit 2 | sfx | 255.0 | 8.5 | 8.497 | -3.0 |
| end chord | music | 270.0 | 9.0 | 9.004 | 4.0 |

## Design
- Key **D major pentatonic** (D E F# A B), 120 BPM. Pad: Dsus2 closed (0-2.5 s) -> Dadd9 with the low-pass opening 280 Hz -> 1.3 kHz from the 2.5 s cut -> Bm7 under the crash (tense, not dark) -> Gadd9 on the line card -> D major at 9.0 s. Detuned additive saws (+-6 cents, panned +-0.55), side channel high-passed at 150 Hz; sub sine on the chord root is mono.
- Pulse: muted mono thump (68 -> 46 Hz) on every beat 0.5-8.5 s, quieter before the UI arrives; a faint A5 tick on the off-beats while the UI is on.
- Plucks at 5.0/5.5/6.0/6.5 s: B4 A4 F#4 E4 (descending with the chart, leaves the E hanging); resolution at 9.0 s: bell/pluck chord D4 F#4 A4 over a soft D3, ~1 s decay into the 9.8-10.0 s fade.
- SFX: line draw = rising band-passed noise scrape (500 Hz -> 3.8 kHz) with 4 stepped pushes on the line's 4 moves; STAMP = 110 -> 70 Hz pitch-dropped thump + 1.5 kHz high-passed paper slap + 20 ms tick; word hits = dry key clacks (noise click + 3 damped plate modes + low thock), pitch rising 1.12/1.26/1.42 kHz, panned L/C/R; cuts = time-varying SVF band-pass noise whoosh (rise then fall), decorrelated L/R, plus a soft thud (2.5 s) or a firm hit + slap (7.0 s); slider = one detent per 1 % step, pitch falling 1.35 kHz -> ~1.1 kHz with the value, pan following the thumb leftwards; settle = soft low-passed paper breath; crash = band-limited saw glide A3 -> A2 shaped like a crash (sag, steep drop, small bounce) with a closing filter plus faint crackle grain.
- Mix: SFX bus has a -3 dB bell at 3.3 kHz, 15 kHz low-pass, soft knee; synthetic 120 ms early-reflection room as a send on SFX only; music is ducked up to 4 dB by a zero-phase (look-ahead) envelope of the dry SFX. 2-5 ms fades on every event, 6 ms fade-in after 5 ms of silence at the head, raised-cosine fade 9.800 -> 9.967 s to digital zero at the tail. Nothing sampled; all synthesized with numpy/scipy.
- When cues.json is present: a light paper tick on the hard chart swap (crash start) and two small soft paper taps on the line-card shape hits (8.0 / 8.5 s), so every visual hit has a sound.

## Spectrogram inspection (what I looked for and saw)
- Energy sits where designed: broadband scrape 0-0.5 s, low thump + slap at 0.5 s, three narrow clacks with rising mode lines at 1.0/1.5/2.0, whoosh blobs at 2.5 and 7.0, ten thin detents 3.1-4.6 s, the descending harmonic glide 4.9-6.9 s, end chord partials from 9.0 s, fade to black at 10 s.
- No DC offset (also measured), no steady buzz/hum line, no broadband hiss above 16 kHz except the short noise transients themselves.
- An earlier build showed a broadband vertical line in the music stem at 7.0 s (pad filter cutoff jumping): fixed by gliding the cutoff over 120 ms; re-checked, gone.

## Not verified
- Not listened to by anyone: tonal balance, perceived punch, and how the bass translates on laptop/phone speakers are unjudged. The low end (sub + pulse at 46-80 Hz) is the most likely thing to need a trim by ear.
- Sync is verified against cue times, not against the rendered picture (not muxed here).
- Loudness measured on the WAV; the AAC encode in the final mux can shift true peak by a few tenths of a dB.

