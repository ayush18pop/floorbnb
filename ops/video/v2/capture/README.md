# Floor launch video v2: capture

All eight shots recorded from the real current `origin/main` frontend (scratch worktree `ops/video/_web`, removed afterwards),
`apps/web` production build with env only: `NEXT_PUBLIC_DATA_SOURCE=mock NEXT_PUBLIC_APP_LOCKED=0 APP_LOCKED=0`
(no NEXT_PUBLIC_LOCAL_DEV, no tracked file edited), served `next start -p 3200`. Example mode: the UI labels itself EXAMPLE / EXAMPLE DATA where it shows labels
(position, review, confirmed, keeper). /agents and the builder carry no such label in the UI. These screens are NOT live mainnet data.

Method: Playwright Chromium headless, viewport 1440x900, DPR 2, light theme, `?theme=light`, scrollbars hidden. Virtual clock (page.clock): paused after first paint,
runFor(33.33 ms) per frame; CSS animations are paused and seeked to the virtual time each frame, so output is reproducible. Fixed virtual date 2026-10-05T16:00Z.
All input is real mouse/keyboard events with ease-in-out cubic glides (each glide lasts about sqrt(distance) frames). A1a/A1b/A1c are one continuous session (global frames 0-359 split 200/90/70);
A2a/A2b one session (100/100).

Shots (frames): L1_landing 190, T1_try 290, A1a_builder 200, A1b_review 90, A1c_confirmed 70, A2a_position 100, A2b_keeper 100, G1_agents 160.
Each folder: frames/, events.json (fps, frames, viewport, frames_data with mouse x,y,down,click,scrollY,floor; `regions` in CSS px incl. *_by_frame), README.md, contact.png, DONE.
T1 note: the native range input snaps to whole percents; use `slider_thumb_smooth_by_frame` for smooth follow.

Re-run:
    node capture.mjs [--base-url http://localhost:3200] [--mode example|live] [--out DIR] [--shots L1_landing,T1_try,A1,A2,G1_agents] [--limit N] [--headed] [--storage-state state.json]
    `--base-url` points at any deployment (e.g. https://floor.ayush.works); `--mode live` uses the real date and does not mock anything; for A1 on the live app run `--headed` with a
    `--storage-state` of a profile with the wallet connected (wallet popups are real-time, so those frames are not bit-exact; the "Run mock flow" button text is only expected in example mode).
    `--mode example` (default) uses the fixed virtual date. Requires playwright resolvable from /home/user/floorbnb/package.json (createRequire path at top of capture.mjs).
    `--out` writes elsewhere (existing frames in the target shot folder are deleted first). `--mode` other than example/live throws. Example mode verified; live mode not run here (no chain access).
Server: start from the worktree `apps/web` with the env above; `server.pid` holds the PID (stopped at the end).
