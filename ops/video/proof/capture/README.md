# Capture of the real /try simulator
- Route: http://localhost:3200/try?theme=light (production build `next start -p 3200`, default locked config, light theme, no dev overlay).
- Run: start server, then `node capture.mjs frames` (about 25 s). Writes frames/f_0000..f_0134.png (2880x1800) and events.json.
- Virtual time: Playwright clock installed before load, paused after first paint, `clock.runFor(33.333)` per frame. Injected stylesheet sets transition/animation none (the app has no visible CSS animation on /try; only a skeleton shimmer in app.css, not on screen).
- Choreography: k0-14 still, mouse at (1390,120); k15-26 mouse glides to the 90 thumb; k27 mouse down; k28-62 drag to 80 (6-step ease-out); k63 mouse up; k64-71 hold (mouse glides to chip from k66); k72 real click on the "COVID crash" chip (replay a crash preset); k73-134 final state held.
- IMPORTANT: the replay is not animated by the app. Clicking the chip swaps the chart instantly (value-chart.tsx has no JS motion on /try). The chart is static from k72 on; the visible change is a hard cut from the 1-year worst window to the COVID crash chart.
- events.json: thumb rect = x: track.x + ((value-80)/15)*(track.w-24), w 24, h 36, y: track.y+(track.h-36)/2 (track = #try-floor rect; thumb sized per app.css). CSS px, page coords, page unscrolled. `floor` field = real slider value per frame.
- Determinism: run twice (frames/ vs run2/), mean abs pixel diff 0.0 on 7 sampled frames.
