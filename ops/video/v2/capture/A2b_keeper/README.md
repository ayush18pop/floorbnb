# A2b_keeper

Frames: `frames/f_0000.png`..`f_0099.png` (100 frames, 30 fps, 2880x1800 = 1440x900 CSS px at DPR 2, page only, light theme, no scrollbars/overlay).
Route: /app/keeper (same session, reached by real nav click). Real current origin/main production build in example mode (NEXT_PUBLIC_DATA_SOURCE=mock), served on :3200.
Motion: Mouse glides gently over the public log table.
Regions (CSS px, in events.json `regions`): keeper_log_table, status_tiles, table_wrap, headline.
Mouse in `frames_data` is the real eased pointer path (real mouse events). `contact.png` = 9-frame sheet.
Re-record: `node ../capture.mjs --shots A2` (see ../README.md).
