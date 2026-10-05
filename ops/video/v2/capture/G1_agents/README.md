# G1_agents

Frames: `frames/f_0000.png`..`f_0159.png` (160 frames, 30 fps, 2880x1800 = 1440x900 CSS px at DPR 2, page only, light theme, no scrollbars/overlay).
Route: /agents (default tab 'MCP tools'). Real current origin/main production build in example mode (NEXT_PUBLIC_DATA_SOURCE=mock), served on :3200.
Motion: Hold 30, hover glides over the tool list, no clicks. Note: the page itself says 'Building, server not live'; it shows no EXAMPLE badge, so the caption EXAMPLE DATA ON SCREEN is the video's own.
Regions (CSS px, in events.json `regions`): tool_list, tool_names_col, tabs, headline.
Mouse in `frames_data` is the real eased pointer path (real mouse events). `contact.png` = 9-frame sheet.
Re-record: `node ../capture.mjs --shots G1_agents` (see ../README.md).
