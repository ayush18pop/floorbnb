# L1_landing

Frames: `frames/f_0000.png`..`f_0189.png` (190 frames, 30 fps, 2880x1800 = 1440x900 CSS px at DPR 2, page only, light theme, no scrollbars/overlay).
Route: / (landing). Real current origin/main production build in example mode (NEXT_PUBLIC_DATA_SOURCE=mock), served on :3200.
Motion: Hold 40, eased scroll (ease-in-out cubic) of 708 px over frames 40-149 to the end of 'Three steps', mouse glides to nav 'Try it' (f140-171), hover hold to f189 (no click).
Regions (CSS px, in events.json `regions`): hero_chart, hero_headline, hero_cta_try, nav_try_link, moment, how_it_works, nav (per-frame *_by_frame because the page scrolls); scrollY per frame in frames_data.
Mouse in `frames_data` is the real eased pointer path (real mouse events). `contact.png` = 9-frame sheet.
Re-record: `node ../capture.mjs --shots L1_landing` (see ../README.md).
