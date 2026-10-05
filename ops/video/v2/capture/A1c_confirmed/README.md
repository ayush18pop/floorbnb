# A1c_confirmed

Frames: `frames/f_0000.png`..`f_0069.png` (70 frames, 30 fps, 2880x1800 = 1440x900 CSS px at DPR 2, page only, light theme, no scrollbars/overlay).
Route: /app/confirmed (same session). Real current origin/main production build in example mode (NEXT_PUBLIC_DATA_SOURCE=mock), served on :3200.
Motion: 'Your floor is set.', vault with EXAMPLE badge, floor 850.00 USDT, 6 months. Static hold. App navigates from review at about f9-11.
Regions (CSS px, in events.json `regions`): summary_card, confirmed_badge, headline, open_position_button, vault_cell, flow_rail.
Mouse in `frames_data` is the real eased pointer path (real mouse events). `contact.png` = 9-frame sheet.
Re-record: `node ../capture.mjs --shots A1` (see ../README.md).
