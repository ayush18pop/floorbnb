# Floor v2 type system (as built by build_typo.py)
Card plane 1920x1080 (assets 2x). Margin 96 px, baselines on a 12 px grid.
- Headline: Anton Regular, 228-312 px (cards 228/240/252/264/288), secondary 168 px (C1). Tracking -2.0% at >=300, -1.5% at >=200, -1.2% at >=120. Manual kern table (kern_table.py, 25 pairs). Optical left margin (round glyphs hang up to 0.025 em).
- Leading: 1.04-1.05 x size (deviation from the brief's 0.92-0.96: Anton descenders (g, y, p) collided with the next line's ascenders at 0.95; measured and fixed by eye on typo_sheet.png). C1 secondary lines 168 on 180 spacing.
- Accent word: Instrument Serif Italic, thresholded at 8x supersampling, nearest-neighbour blocks, x-height = 0.84 x Anton x-height (matches og/home.png proportion), cobalt or ink, same baseline.
- Labels: Geist Mono Medium 30 px, +8% tracking, cobalt, thin cobalt rule 288x3 above.
- Subs: Geist Mono Medium 32 px (S0, C4, E1), end card 30 px, small line Regular 26 px.
- Captions: Geist Mono Medium 28 px +6%, paper chip, 2 px ink keyline, 48 px high, lower third x96.
- Callouts: Anton 72 px, leading 80, flat paper-cut sticker (coral/mint/periwinkle) with 12 px hard offset shadow (cobalt or ink), -1.6..+1.4 deg tilt, flat ink arrow 108 px. Layers: shadow, sticker, text, arrow.
- Palette only; every asset RGB is an exact palette value (alpha carries antialiasing).
- Shapes: flat fills and uniform round-dot halftone (45 deg), full-card canvases so positions are preserved.
Reveals: word groups cut in on beat frames (20 f); every group holds >= 40 frames (1.33 s). Factory address verified equal to packages/contracts/deployments/56.json (42 chars).
Rebuild: python3 build_typo.py (about 2 min).
