# A2a_position

Frames: `frames/f_0000.png`..`f_0099.png` (100 frames, 30 fps, 2880x1800 = 1440x900 CSS px at DPR 2, page only, light theme, no scrollbars/overlay).
Route: /app/position (example position). Real current origin/main production build in example mode (NEXT_PUBLIC_DATA_SOURCE=mock), served on :3200.
Motion: Hold, eased glides over Value (f30), Floor tile (f50), Cushion tile (f72), then to nav 'Keeper log' (f96); click lands in A2b f2.
Regions (CSS px, in events.json `regions`): position_value, floor_line, floor_tile, cushion, tiles, value_chart, chart_section, activity_panel, nav_keeper_link.
Mouse in `frames_data` is the real eased pointer path (real mouse events). `contact.png` = 9-frame sheet.
Re-record: `node ../capture.mjs --shots A2` (see ../README.md).
