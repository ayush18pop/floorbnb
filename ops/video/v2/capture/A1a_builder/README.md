# A1a_builder

Frames: `frames/f_0000.png`..`f_0199.png` (200 frames, 30 fps, 2880x1800 = 1440x900 CSS px at DPR 2, page only, light theme, no scrollbars/overlay).
Route: /app then /app/review (one session with A1b, A1c). Real current origin/main production build in example mode (NEXT_PUBLIC_DATA_SOURCE=mock), served on :3200.
Motion: Basket click QQQB (f26), eased drag floor 90->85 (f43-67), term '6 months' (f83), deposit 1000 typed f102-111, Review click f135 (client nav to /app/review), 3 acknowledgement clicks (f159,167,175), glide onto 'Run mock flow'. Frames 135-199 are the review page.
Regions (CSS px, in events.json `regions`): basket_picker, floor_slider, term_picker, amount_input, review_button, summary_card/tiles, chart_panel, floor_value, slider_thumb_by_frame (null once on review page). Builder regions are measured at f0; *_by_frame where they move.
Mouse in `frames_data` is the real eased pointer path (real mouse events). `contact.png` = 9-frame sheet.
Re-record: `node ../capture.mjs --shots A1` (see ../README.md).
