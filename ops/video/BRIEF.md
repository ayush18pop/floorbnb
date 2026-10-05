# Floor launch video: director's brief (shared by every agent)

Workspace: `/home/user/floorbnb/ops/video/` (untracked scratch; never `git add`, commit or push anything). Repo files outside `ops/video/` are READ ONLY. Never touch `packages/contracts`, `apps/web/lib/launch.ts`, the lock settings, `.env*`, or any secret. No network except `localhost`, pip (pypi) and npm registry.

## Deliverables of this phase: the 10 second pipeline proof
`ops/video/out/floor_proof_10s.mp4`: 1920x1080, 30 fps, H.264, yuv420p, 10.000 s, stereo AAC 48 kHz. Built from: real captured UI (capture agent) + riso compositor (motion agent) + original synthesized audio (sound agent). The director muxes the final file.

## Look: riso print, not CGI
Palette ONLY: paper `#FAFAF8`, cobalt `#2440E0`, periwinkle `#7C93FF`, coral `#FF7469`, mint `#3DD68C`, ink `#0B0C0E`. No other colors, no gradients (halftone dots and flat fills only).
- Flat spot-color shapes. Slight misregistration between color layers (1 to 3 px offset), drifting slowly (animate it, never static, never more than 3 px). Halftone dot shading (round dots, 45 degree screen for ink, other angles for other inks). Paper grain, soft ink bleed on shape edges. Grain and offsets must be animated subtly per frame so it feels printed, not CGI. No glow, no glass, no dark theme, no depth-of-field, no heavy motion blur.
- Style references (LOOK AT THEM FIRST, they are the target): `apps/web/public/og/home.png`, `try.png`, `risks.png`, `backtest.png`, `how-it-works.png`. Also read `design/BRAND.md` section 3 and 4, `design/tokens.css`.
- Type: big flat headline type in the Floor headline style (heavy condensed grotesque, tight leading, with one accent word in a pixel-serif italic, as in home.png and try.png). Fonts available on disk: Geist and Geist Mono in `apps/web/node_modules/geist/dist/fonts/`. For the condensed headline, pick the closest free font you can obtain from pypi or npm (for example an `@fontsource` package: Anton or Bebas Neue style; for the italic accent a pixel/bitmap serif such as an `@fontsource` pixel serif, or Geist italic if nothing better). Say which you used. Footer and captions in Geist Mono.
- Lockup: use `design/logo/floor-lockup-light.svg` byte for byte (copy it, inline it, scale it uniformly). Never redraw, recolor, stretch, outline or apply misregistration/halftone/blur to the lockup itself (BRAND.md forbids effects on it). Only the frame-level paper grain may sit over it. Keep clear space of half the mark height.
- Real app UI stays crisp and readable: captured screens sit as flat paper-cut panels on the off-white paper with a hard cobalt or coral offset shadow (solid, 12 to 20 px, no blur). No rounded glass, no reflections. The panel pixels themselves are never filtered, tinted, halftoned or blurred. Real screens are real captures only; never fake, redraw or animate a screen.
- Camera: a gentle 3D feel only: parallax between paper layers, small perspective tilt (max about 4 degrees), push-ins and pull-backs, and one follow move on the slider. Stepped, slightly snappy easing (for example 4 to 6 step quantized ease-out, or cubic-bezier(0.2,0.9,0.2,1) sampled at 12 fps for non-UI layers), cuts on beat.
- Beat grid: 120 BPM. One beat = 0.5 s = 15 frames. Every cut, stamp and type hit lands exactly on a beat frame.

## Content rules (hard)
- Never write or imply: safe, guaranteed, protected, secure, "never loses", "audited". No live or mainnet claim. No figures that are not shown by the real UI. Any chart or number from the simulator is labeled as a backtest on screen while visible.
- This proof clip is the public simulator (`/try`), NOT a chain recording. Therefore it must NOT carry the caption "Recorded on a local fork of BSC mainnet" (that caption is reserved for later scenes that really run on the local fork).
- Allowed on-screen text, exactly, nothing else:
  1. Headline `Set a floor under your stocks.` (accent word: `stocks.`)
  2. Second line card `Spot swaps. BNB Chain.`
  3. Caption while the UI is on screen: `SIMULATOR · BACKTEST ON PAST DATA, NOT A PREDICTION`
  4. End card: lockup plus footer `Not on mainnet · No human audit`
  Text inside the captured UI is whatever the real UI shows.

## Timeline of the proof (30 fps, frame = t*30). Director's storyboard
| t (s) | Frames | Beat | What |
|---|---|---|---|
| 0.0 to 0.5 | 0 to 14 | 0 to 1 | Bare paper, grain animating. A cobalt floor line draws left to right across the frame in 4 stepped moves. |
| 0.5 | 15 | 1 | STAMP: lockup lands (scale 1.06 to 1.0 in 3 steps), layers settle from 3 px to 1 px misregistration. Sound: stamp. |
| 1.0 / 1.5 / 2.0 | 30 / 45 / 60 | 2,3,4 | Headline appears one word group per beat: `Set a floor` / `under your` / `stocks.` Big flat type, coral underline bar under `stocks.` |
| 2.5 | 75 | 5 | CUT ON BEAT: headline slides off as a paper layer; real UI panel slides in with cobalt offset shadow. Parallax begins. Caption appears. |
| 3.0 to 4.6 | 90 to 138 | 6 to 9 | Real slider is dragged 90% to 80% (capture frames 15 to 63). The camera pushes in on the slider thumb and follows it (events.json), floor value and chart respond for real. Stepped easing. |
| 4.6 to 4.9 | 138 to 147 | | Camera eases back to the whole panel. |
| 4.9 to 6.9 | 147 to 207 | 10 to 13 | Real replay of a crash on the chart (capture frames 72 to 132). Camera does a slow pull-back with parallax. |
| 7.0 | 210 | 14 | CUT ON BEAT: panel exits; second line card `Spot swaps. BNB Chain.` in headline type with a mint flat shape and periwinkle halftone block, two beats. |
| 9.0 | 270 | 18 | CUT: end card on paper: lockup centered, footer line, cobalt floor line across. Hold to 10.0. Fade the last 6 frames to paper (no black). |

The real UI is on screen from 2.5 s to 7.0 s = 4.5 s = 135 capture frames (capture frame k maps to video frame 75 + k).

## Interface contracts (do not deviate, other agents depend on them)
Capture agent writes `ops/video/proof/capture/`:
- `frames/f_0000.png` ... `f_0134.png` (135 frames, 30 fps virtual time), viewport 1440x900 CSS px, deviceScaleFactor 2 (2880x1800 PNG), page content only (no browser chrome, no cursor baked in).
- `events.json`: `{ "fps":30, "frames":135, "viewport":{"w":1440,"h":900,"dpr":2}, "frames_data":[{"i":0,"t":0.0,"mouse":{"x":..,"y":..,"down":false}}, ...], "regions":{"slider_track":{x,y,w,h}, "slider_thumb_by_frame":[{x,y,w,h} per frame], "chart":{x,y,w,h}, "floor_readout":{x,y,w,h}}, "notes":"..." }` all in CSS px, page coordinates.
- `DONE` (empty file) written last. `capture.mjs` (re-runnable script) and `README.md` (how it was recorded, what route, what was clicked).
Motion agent writes `ops/video/proof/render/` (PNG sequence `r_0000.png`...`r_0299.png`, 1920x1080) plus `ops/video/riso/` (the reusable compositor toolchain) and `ops/video/proof/cues.json` (every sound-relevant event: stamp, word hits, panel slide, slider steps, cut, end, with frame and seconds). Output `ops/video/out/floor_proof_10s_silent.mp4`.
Sound agent writes `ops/video/proof/audio/`: `mix.wav` (48 kHz, 24-bit stereo, exactly 10.000 s), stems `music.wav`, `sfx.wav`, `make_audio.py` (reads `proof/cues.json` and `proof/capture/events.json` when present, else the storyboard times above), `report.md` with measured integrated loudness (EBU R128, target -14 LUFS, tolerance 1 LU), true peak (at or below -1 dBTP), and spectrogram PNGs.

## Reporting
Final message to the director: under 25 lines. List output paths, exact commands to re-run, measured facts (frame counts, durations, loudness, render time), deviations from this brief and why, and anything you could not verify. Do not claim something works unless you ran it. Do not use `pkill -f` with patterns that match your own command; use PID files. Leave no servers running when you finish.
