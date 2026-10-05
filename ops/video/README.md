# Floor launch video: workspace snapshot (2026-10-05)

Snapshot of the video workspace that lived in a cloud container. Start with `BRIEF.md`, `BRIEF2.md`, `SCRIPT.md` (script, typography rules, 90 BPM beat table, 15 s cut for X) and `ROLES.md` (job specs for each agent role).

## What is here
- `v2/capture/` Playwright capture script (`capture.mjs`), `events.json` per shot (mouse, scroll, slider, regions), per-shot READMEs and contact sheets. NOT included: the frames.
- `v2/typo/` typography: builders, fonts, card, callout, caption and shape PNGs, `typo.json`, `SPEC.md`, contact sheets.
- `v2/engine.py`, `v2/comp.py`, `v2/choreo.py`: 3D camera compositor (pinhole camera, homography planes, depth of field and motion blur, riso layers); `run_all.sh`, `encode.sh`; `cues.json` and `cues_cut15.json` (every sound cue with frame numbers).
- `v2/audio/music/make_music.py` (D major, 90 BPM) and `v2/audio/sfx/make_sfx.py` (cue-driven effects), reports, spectrogram PNGs, `arrangement.json`. NOT included: the WAV stems (rebuild in about 4 minutes).
- `riso/`: the v1 10 s proof toolchain. `proof/`: v1 proof assets (no frames).
- `out/`: `floor_v2_60s_preview.mp4` (picture only, crf 22), `floor_v2_15s_silent.mp4`, `floor_proof_10s_share.mp4`. The full-quality 60 s silent master (238 MB) is not in git.

## Not in git (regenerate)
1. Capture frames (about 1,200 PNG at 2880x1800): build the CURRENT `main` web app in a scratch worktree with env `NEXT_PUBLIC_DATA_SOURCE=mock NEXT_PUBLIC_APP_LOCKED=0 APP_LOCKED=0` (never set NEXT_PUBLIC_LOCAL_DEV), `next start -p 3200`, then `node v2/capture/capture.mjs`. Capture is deterministic (verified: 0.0 pixel difference on re-runs, one page-transition frame excepted). To record the real app instead, see `--mode live` in `v2/capture/README.md` (not run yet).
2. Render: `bash v2/run_all.sh` (restartable; skips valid frames; about 10 minutes on 4 cores for the master), then `bash v2/encode.sh`.
3. Audio: `python3 v2/audio/music/make_music.py` and `python3 v2/audio/sfx/make_sfx.py` (they read `v2/cues.json` and `cues_cut15.json`).

## Setup notes
- Python: `pip install numpy scipy pillow opencv-python-headless`. Node: playwright; `riso/package.json` has the font packages. ffmpeg is required.
- Scripts hard-code `/home/user/floorbnb/ops/video` as the root: search and replace it with your path.
- Everything is unverified by eye or ear (no one has watched or listened to it). The mixer step (balance stems, master, mux) has NOT been done: stems are at per-stem preview levels.
- Known open items: callout stickers overlapped in the T1 scene (a fix was in progress when this snapshot was taken, so `cues.json` and the preview may be one iteration behind), `cues_cut15.json` may contain master-time frame numbers, pace may still feel fast. See the chat notes.
- The app screens are the app's example mode (`mock` data), not live mainnet data. The video's captions say so.
