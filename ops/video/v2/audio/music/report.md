# Floor v2 score: report (Composer)
Nothing here was verified by ear. Everything below is measured from the rendered files.

Script: `python3 make_music.py` (about 70 s, seeded 9090, deterministic: fixed a PYTHONHASHSEED-dependent seed bug with crc32; fixed a variable-shadowing crash in checks()).
Key D major, 90 BPM (32000 samples per beat), mixed meter so every scene change is a bar downbeat. Motif F#4 A4 B4 A4 E4 (open, degrees 3 5 6 5 2) returns on the stamp, in the slider plucks (beat 28), augmented and low in A2 (beat 60), and resolves to D4 at beat 88.
Arc: S0 sparse paper and heartbeat; C1/L1 warm pad opens, marimba ostinato; T1 playful marimba figure tracking the slider 90 to 80 (beats 24.5 to 28), crash figure falls, holds on a floor, rises; A1 sub bass and muted print-press ticks; A2 calm keeper clock; G1 FM bells; E1 low A drone, no percussion, suspended; E2 tonic hit exactly on beat 84 (frame 1680), D, G/D, D, silence from 59.995 s.
Files: pad, sub, pulse_perc, melody, texture, finale stems (60 s here, `30s/*_30s.wav`, `15s/*_15s.wav`), `music_mix_preview*.wav`, `arrangement.json`, `cut15.json`, `30s/cut30.json`, `duck_hint.json`, `score_events.json`, `measure.json`, `spec/*.png`.
15 s cut (14.667 s, 704000 samples): src beats 0-4 | 24-31 | 40-45 | 79-81 | 84-86 | 88-90; motif starts at cut frame 40 (1.33 s); tonic hit at cut frame 360.
## Measured
- Sample counts: 2,880,000 / 1,440,000 / 704,000, 48 kHz, 24-bit stereo. First and last 5 ms exactly zero, DC below 1e-6.
- Preview mix loudness -18.3 LUFS (target of the preview) in all three versions.
- Final hit onset: 60 s frame 1680.007, 30 s 780.007, 15 s 360.007 (0.23 ms).
- Thump onsets on the beat grid: max deviation 1.6 ms (46 on-beat onsets).
- Score: 0 out-of-key notes. Audio spectral peaks flagged out of key in bars 28, 32, 40, 44, 48, 72 are upper harmonics (7th, 11th) of the pad voices, not notes.
- Mono fold-down loss at most 1.8 dB (finale), mix 1.1 dB.
## Not verified
Taste, balance and the sync against the real v2/cues.json (absent when rendered; stamp beat defaults to 2, re-run after cues.json exists). Stems are about -9 to -26 dB peak-wise; the Mixer sets final levels.
## Update: re-synced to v2/cues.json and cues_cut15.json
Stamp beat now 1 (frame 20, from cues). T1 slider figure is one marimba note per real slider_step cue (frames 517-554; 15 s cut uses cues_cut15 frames 87-124). Crash figure starts on the COVID chip click (610), second step down on the 2022 chip click (664). Preview mix now -18.3 LUFS, TP -3.3 / -4.4 / -5.3 dBTP. Hit frames 1680.006 / 780.005 / 360.006. Note: cues_cut15.json lists the E2 lockup stamp at frame 1720 (master time), probably should be about 400.
