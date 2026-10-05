# A1b_review

Frames: `frames/f_0000.png`..`f_0089.png` (90 frames, 30 fps, 2880x1800 = 1440x900 CSS px at DPR 2, page only, light theme, no scrollbars/overlay).
Route: /app/review (same session, continues A1a). Real current origin/main production build in example mode (NEXT_PUBLIC_DATA_SOURCE=mock), served on :3200.
Motion: f0 real click on 'Run mock flow'; stepper Approve USDT -> Create position with example hashes. Mouse rests on button.
Regions (CSS px, in events.json `regions`): summary_card, acks, confirm_button, stepper, back_button, flow_rail.
Mouse in `frames_data` is the real eased pointer path (real mouse events). `contact.png` = 9-frame sheet.
Re-record: `node ../capture.mjs --shots A1` (see ../README.md).
