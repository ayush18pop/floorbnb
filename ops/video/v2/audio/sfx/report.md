# SFX report (sound designer, v2)

Nothing here was verified by ear: all checks are measurements and spectrograms.

Re-run: `python3 ops/video/v2/audio/sfx/make_sfx.py` (about 2.5 min; reads v2/cues.json, v2/cues_cut15.json directly, capture events for typed digits, music/arrangement.json for the key). Key: D major (music/arrangement.json). Seed 20261005. `--timing script` forces the old SCRIPT.md fallback.

## 60 s master (2,880,000 samples)
Global gain -5.41 dB (set by the loudest stem so every stem peaks at most -6.3 dBTP); sum of stems: integrated -26.5 LUFS, short-term max -23.7, true peak -5.86 dBTP. The mixer is expected to rebalance stems.

| stem | samples | true peak dBTP | integrated LUFS | first/last 5 ms peak | mono-sum vs stereo RMS dB |
|---|---|---|---|---|---|
| camera | 2880000 | -9.49 | -25.0 | 0.0/0.0 | -0.6 |
| focus | 2880000 | -19.02 | -36.1 | 0.0/0.0 | -1.19 |
| paper | 2880000 | -10.54 | -33.6 | 0.0/0.0 | -0.4 |
| ink_press | 2880000 | -7.72 | -23.1 | 0.0/0.0 | -0.25 |
| type | 2880000 | -14.65 | -40.0 | 0.0/0.0 | -1.74 |
| ui | 2880000 | -16.13 | -36.8 | 0.0/0.0 | -0.52 |
| emotion | 2880000 | -6.3 | -22.6 | 0.0/0.0 | -0.11 |
| room | 2880000 | -28.1 | -41.0 | 0.0/0.0 | -0.86 |

Onset check (structural cues, measured onset vs intended frame, causal band filters): 110/110 found, worst 4.0 ms, mean 2.54 ms (1 frame = 33.3 ms). Worst five: sticker_pop@915 -4.0 ms; sticker_pop@970 -4.0 ms; sticker_pop@1465 -4.0 ms; sticker_pop@615 -3.5 ms; sticker_pop@875 -3.5 ms. Masked by an adjacent structural cue of the same family within 80 ms (not measurable separately): slider_detent@534, slider_detent@539, slider_detent@859, slider_detent@860, key_tick@902, click@1283. Camera envelope lag vs move bell: median 19.0 ms, max 53.0 ms over 12 isolated moves.

## 15 s cut (704,000 samples)
Global gain -5.42 dB (set by the loudest stem so every stem peaks at most -6.3 dBTP); sum of stems: integrated -25.5 LUFS, short-term max -22.7, true peak -5.96 dBTP. The mixer is expected to rebalance stems.

| stem | samples | true peak dBTP | integrated LUFS | first/last 5 ms peak | mono-sum vs stereo RMS dB |
|---|---|---|---|---|---|
| camera | 704000 | -12.42 | -26.0 | 0.0/0.0 | -0.57 |
| focus | 704000 | -20.98 | -37.3 | 0.0/0.0 | -1.13 |
| paper | 704000 | -10.68 | -34.5 | 0.0/0.0 | -0.55 |
| ink_press | 704000 | -12.41 | -26.8 | 0.0/0.0 | -0.05 |
| type | 704000 | -15.63 | -37.6 | 0.0/0.0 | -0.9 |
| ui | 704000 | -17.21 | -41.8 | 0.0/0.0 | -0.9 |
| emotion | 704000 | -6.3 | -21.9 | 0.0/0.0 | -0.09 |
| room | 704000 | -26.66 | -41.5 | 0.0/0.0 | -0.86 |

Onset check (structural cues, measured onset vs intended frame, causal band filters): 47/47 found, worst 9.5 ms, mean 2.67 ms (1 frame = 33.3 ms). Worst five: word_strike@0 9.5 ms; sticker_pop@100 -4.0 ms; sticker_pop@160 -3.5 ms; sticker_pop@244 -3.5 ms; word_strike@380 -3.0 ms. Masked by an adjacent structural cue of the same family within 80 ms (not measurable separately): slider_detent@104, slider_detent@109, slider_detent@228, slider_detent@233, slider_detent@234. Camera envelope lag vs move bell: median 18.0 ms, max 22.0 ms over 4 isolated moves.

Counts 60 s: {'camera': 12, 'focus': 37, 'paper': 53, 'ink_press': 4, 'type': 44, 'ui': 40, 'emotion': 2, 'room': 1}
Counts 15 s: {'camera': 4, 'focus': 13, 'paper': 16, 'ink_press': 1, 'type': 17, 'ui': 25, 'emotion': 2, 'room': 1}

## Design mapping
- focus: every focus_lock cue frame gets hiss-clearing from the card arrival ending in a soft tick on the lock frame; each arrival also gets a defocus bloom (low-mid, wide) from the arrival frame to the lock frame; plane leaving focus gets a defocus smear and a departure slide.
- camera: each non-drift move in cues is one `camera_move` of exactly end-start frames; dolly (air rising + sub swell) plus orbit sweep weighted by the yaw change (0 deg = pure dolly, 41 deg = orbit-heavy), pan from `lateral`, loudness peak retimed to `peak_frame`, level from `intensity`. NOTE: all 12 (master) and 4 (cut) moves in the cue files are `dolly+orbit, forward`; there is no pull-back move, so the pull-back voice exists but is not used.
- scroll: the 94 scroll cues become ONE continuous felt swish (frames 255-353) whose level and brightness follow speed_px_per_frame (1..19).
- slider: ratchet detent per slider_step with pitch = D major scale degree of the value (80 -> D5 587 Hz up to 89 -> F#6 1480 Hz, so pitch falls as the value falls). T1 has 10 transitions (11 values 90..80); A1 builder 5.
- E1: everything ducks to 30 percent (room bed to near silence, cubed) from the move into E1 until 2 frames before E2, one low soft thud on the E1 arrival; E2: impact stack (low hit, stamp, paper burst, tuned shimmer decaying) on the E2_h0 frame (1680 master, 360 cut), lockup stamp on its cue.
- room bed follows camera speed (moves + drift cues).

## Inferred or adjusted (not directly in cues)
- S0 floor-line roller sound placed in the 16 frames before the S0 lockup stamp (master only; no cue for the line).
- misregistration tick 3 frames after the S0 stamp; chart-swap paper flip 2 frames after each T1 chip click; four typed digits from capture notes (A1a k94..106, anchored on the nearest cue of that shot; not placed in the cut because the cut jumps in capture time).
- Click roles by capture frame (chip, field, button, check, confirm, nav); pans from click x and from sticker position seen in the contact sheet.
- Cut: S0 first word group sits on frame 0, so its strike starts 12 ms late (the stem edge is silent for 5 ms); it measures +9.5 ms.
- Keeper row ticks: not placed (no events/cues for row appearance).
- cues_cut15.json was regenerated by the compositor during this job; the script reads whatever is current (it contains no S0 lockup stamp, so the cut has no stamp sound at S0).

## Timeline of the 60 s master
- S0 f0-172 (0.0-5.7 s, card): ink_press: roller_draw, lockup_stamp, misreg_jolt; focus: focus_lock, defocus_smear; type: word_strikex3, mono_ticks; camera: camera_move; paper: departure_slide
- C1 f172-249 (5.7-8.3 s, card): type: mono_ticksx2, word_strikex2; paper: card_arrival, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; camera: camera_move
- L1 f249-394 (8.3-13.1 s, screen): paper: panel_arrival, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; ui: scroll_swish; camera: camera_move
- C2 f394-489 (13.1-16.3 s, card): paper: card_arrival, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; type: mono_ticksx2, word_strikex2; camera: camera_move
- T1 f489-734 (16.3-24.5 s, screen): paper: panel_arrival, sticker_popx3, arrow_drawx3, sticker_outx3, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; ui: mouse_down, slider_detentx10, mouse_up, click_chipx2, paper_flipx2; type: mono_ticksx3; camera: camera_move
- C3 f734-829 (24.5-27.6 s, card): paper: card_arrival, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; type: mono_ticksx2, word_strikex2; camera: camera_move
- A1 f829-1114 (27.6-37.1 s, screen): paper: panel_arrival, sticker_popx4, arrow_drawx4, sticker_outx4, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; ui: click_chipx5, mouse_down, slider_detentx5, mouse_up, key_tickx4, clickx2, paper_flipx2, click_confirm; type: mono_ticksx4; camera: camera_move
- C4 f1114-1209 (37.1-40.3 s, card): paper: card_arrival, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; type: mono_ticksx3, word_strikex2; camera: camera_move
- A2 f1209-1354 (40.3-45.1 s, screen): paper: panel_arrival, sticker_popx2, arrow_drawx2, sticker_outx2, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; type: mono_ticksx2; ui: paper_flip, click; camera: camera_move
- C5 f1354-1449 (45.1-48.3 s, card): paper: card_arrival, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; type: mono_ticksx2, word_strikex2; camera: camera_move
- G1 f1449-1574 (48.3-52.5 s, screen): paper: panel_arrival, sticker_pop, arrow_draw, departure_slide, sticker_out; focus: defocus_bloom, focus_lock, defocus_smear; type: mono_ticks; camera: camera_move
- E1 f1574-1678 (52.5-55.9 s, card): focus: defocus_bloom, focus_lock, defocus_smear; emotion: honest_thud; type: word_strikex2, mono_ticks; camera: camera_move; paper: departure_slide
- E2 f1678-1800 (55.9-60.0 s, card): focus: defocus_bloom, focus_lock; type: word_strikex2, mono_ticksx4; emotion: landing; ink_press: lockup_stamp

## Timeline of the 15 s cut
- S0 f0-80 (0.0-2.7 s, card): type: word_strikex3, mono_ticks; focus: focus_lock, defocus_smear; camera: camera_move; paper: departure_slide
- T1 f80-226 (2.7-7.5 s, screen): type: mono_ticksx3; ui: mouse_down, slider_detentx10, mouse_up, click_chip, paper_flip; paper: panel_arrival, sticker_popx2, arrow_drawx2, sticker_out, departure_slide; focus: defocus_bloom, focus_lock, defocus_smear; camera: camera_move
- A1 f226-312 (7.5-10.4 s, screen): paper: sticker_out, panel_arrival, sticker_pop, arrow_draw, departure_slide; type: mono_ticksx2; focus: defocus_bloom, focus_lock, defocus_smear; ui: mouse_down, slider_detentx5, mouse_up, click_chip, paper_flipx2, click_confirm; camera: camera_move
- E1 f312-356 (10.4-11.9 s, card): paper: sticker_out; focus: defocus_bloom, focus_lock; emotion: honest_thud; type: word_strikex2
- E2 f356-440 (11.9-14.7 s, card): camera: camera_move; focus: defocus_smear, defocus_bloom, focus_lock; paper: departure_slide; type: word_strikex2, mono_ticksx4; emotion: landing; ink_press: lockup_stamp

Spectrograms: spec/<stem>.png and spec/<stem>_15s.png, ALL_sum*.png (viewed: ALL_sum, camera, focus_15s: moves, hiss+tick pairs, E1 dark gap, E2 shimmer in key visible).
Stale 30 s outputs from the fallback run were deleted; the 30 s cut is not delivered.
