# T1_try

Frames: `frames/f_0000.png`..`f_0289.png` (290 frames, 30 fps, 2880x1800 = 1440x900 CSS px at DPR 2, page only, light theme, no scrollbars/overlay).
Route: /try. Real current origin/main production build in example mode (NEXT_PUBLIC_DATA_SOURCE=mock), served on :3200.
Motion: Idle 30; mouse down on 90 thumb f30; eased drag to 80 f30-100; up f100; click 'COVID crash' f155; click '2022 bear market' f230.
Regions (CSS px, in events.json `regions`): slider_track, floor_readout, chart, crash_chips, term_chips, headline_numbers, slider_thumb_by_frame (real thumb, snaps to whole percent: 11 values, steps of ~25 px), slider_thumb_smooth_by_frame (unsnapped eased path, use for camera follow); floor per frame in frames_data.
Mouse in `frames_data` is the real eased pointer path (real mouse events). `contact.png` = 9-frame sheet.
Re-record: `node ../capture.mjs --shots T1_try` (see ../README.md).
