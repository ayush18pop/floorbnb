# Floor: AI image prompts

Four prompts. Each block is self-contained: copy one block into the image model. Never ask the model for text, charts, numbers or logos: the product's lines, labels and logo are added in code or Figma afterwards (see 'Post-processing').

Colours are the real brand tokens from `design/tokens.css` (`--bg` #FAFAF8 / dark #0A0B0D, `--floor-line` and `--accent` #2440E0 / dark #7C93FF). All four prompts are optional: BRAND.md bans gradients, glow, shadows, 3D and illustration, so they ask only for flat, shadowless material backdrops. Re-tint to the tokens in post.

Reference image used by all four: render `assets/svg/floor-cushion-explainer.svg` to PNG: `rsvg-convert assets/svg/floor-cushion-explainer.svg -w 1920 -o ref.png`.

---

## G1: Drafting paper texture (light)

**Used in:** OPTIONAL (BRAND.md says no gradients; keep it near-flat). Backdrop under the landing hero grid, submission cover, deck cover, OG card (at low opacity). The crisp grid, crosshairs and all text are added in code.

**Final size / ratio:** 3840×2160 px, 16:9. Generate at the model's largest 16:9 (or 3:2) output, then upscale 2× (Real-ESRGAN, Topaz or Magnific, whichever you have). If upscaling is not possible, 2560×1440 is enough for web.

**Prompt (all models)**

```
A flat, perfectly front-on photograph of a blank sheet of warm off-white architectural drafting paper, filling the whole frame edge to edge. Colour: warm paper white, close to hex #FAFAF8, very slightly cooler in the top-left and warmer in the bottom-right. Material: fine cotton-rag paper grain, tiny fibres, a faint tooth, extremely subtle uneven tone like a lightly aged vellum sheet. A few barely visible ghost marks of a past drafting grid: very pale warm-grey straight hairlines (#E4E5E0) at low contrast, some erased and partly smudged, no pattern repeats, nothing centred. One extremely faint pencil construction line running horizontally across the lower third, almost invisible. Soft even studio daylight from above, no hard shadows, no vignette, no creases. Calm, quiet, professional, Swiss technical-drawing atmosphere. The image must contain no text, no letters, no numbers, no symbols, no logos, no objects, no people. Large areas of plain empty paper so that interface text can sit on top.
```

**Negative prompt / avoid**

```
text, letters, numbers, words, logos, watermark, signature, charts, graphs, candlesticks, coins, bitcoin symbols, neon, glow, lens flare, gradients of purple or pink, robots, people, hands, laptops, screens, stock photo look, 3D cartoon, clutter, heavy vignette, saturated colours, dark corners, folds, coffee stains, torn edges, strong shadows, bold lines, any visible writing
```

**Model variants**

- **ChatGPT / GPT-image:** Paste the prompt as is, then add at the end: "Landscape 16:9. Do not add any text." Attach the reference image and say "use it only for colour and line weight". Ask for 4 variations, pick the emptiest one.
- **Midjourney (v7):** `blank warm off-white architectural drafting paper, fine cotton rag grain, faint ghost drafting grid hairlines in pale warm grey, one barely visible pencil line across the lower third, soft even daylight, flat front view, calm, minimal, Swiss technical drawing --ar 16:9 --style raw --stylize 50 --chaos 0 --no text, letters, numbers, logo, watermark, shadows, folds, vignette, people, objects` Add `--sref <url of the attached reference>` and `--sw 40` to match line weight.
- **Gemini / Imagen:** Paste the prompt, set aspect ratio 16:9 in the UI, and add "No text of any kind" as the last sentence. Attach the reference and write: "Use only for palette and line weight."
- **Flux (1.1 pro / dev):** Paste the prompt. Width 1920, height 1088 (multiple of 16) or `aspect_ratio: 16:9`. Put the negative list in the negative-prompt field if the interface has one; otherwise append "Avoid: text, logos, folds, vignette." Low guidance (about 3 for dev) keeps it flat.

**Reference images to attach:** Attach `assets/svg/floor-cushion-explainer.svg` exported as a 1920×1080 PNG (`rsvg-convert floor-cushion-explainer.svg -w 1920 -o ref.png`). Why: it fixes the hairline weight, the warm paper colour, the single blue line and the amount of empty space. Tell the model: match the line weight, colours and restraint; do not copy the content or text. Optional second reference: a screenshot of `design/preview.html` (light mode) so the paper colour and hairline weight match the real brand.

**Post-processing**

1. Upscale 2×, then crop to exactly 3840×2160.
2. Colour-match to the brand `--bg` token: in Figma/Photoshop add a solid layer of the token colour on `Color` blend at 100%, then lower until the grain is still visible.
3. Reduce contrast of the ghost lines further (curves, −30%) if they compete with the CSS grid. Remove any stray shape or text-like marks.
4. Export WebP 2560 wide, ≤ 250 KB, quality 70. In code: opacity 0.06 to 0.12, `mix-blend-mode: multiply`.
5. Lay the real grid (SVG pattern, 1 px hairlines, 60 px cells, "+" crosshairs) over it in code.

---

## G2: Drafting film texture (dark)

**Used in:** OPTIONAL dark-mode twin of G1: landing hero backdrop, dark deck slides, video title-card backdrop.

**Final size / ratio:** 3840×2160 px, 16:9 (generate large, upscale 2×).

**Prompt (all models)**

```
A flat, perfectly front-on image of a blank sheet of dark graphite-black drafting film, filling the whole frame edge to edge. Colour: near-black cool charcoal, close to hex #0A0B0D, very slightly lighter toward the centre. Material: matte polyester drafting film with a fine, even micro-grain and a very faint satin sheen, a few tiny dust specks, no scratches. A few barely visible ghost marks of an old drafting grid: very dark grey straight hairlines (#1C1E21) at low contrast, partly faded, nothing centred, no repeating pattern. Soft diffuse overhead light, no highlights, no glow, no vignette. Calm, quiet, professional, Swiss technical-drawing atmosphere. The image must contain no text, no letters, no numbers, no symbols, no logos, no objects, no people. Large areas of plain empty surface so that interface text can sit on top.
```

**Negative prompt / avoid**

```
text, letters, numbers, words, logos, watermark, signature, charts, graphs, candlesticks, coins, bitcoin symbols, neon, glow, lens flare, gradients of purple or pink, robots, people, hands, laptops, screens, stock photo look, 3D cartoon, clutter, heavy vignette, saturated colours, blue glow, cyan, matrix, circuit board, stars, bokeh, bright highlights, scratches, any visible writing
```

**Model variants**

- **ChatGPT / GPT-image:** Paste as is, add "Landscape 16:9. No text." Ask for 4 variations and keep the darkest, flattest one.
- **Midjourney (v7):** `blank dark graphite-black matte drafting film, fine micro grain, very faint ghost drafting grid hairlines in dark grey, soft diffuse light, flat front view, calm, minimal, Swiss technical drawing --ar 16:9 --style raw --stylize 50 --chaos 0 --no text, letters, numbers, logo, glow, neon, highlights, vignette, people, objects`
- **Gemini / Imagen:** Paste, set 16:9, end with "No text of any kind, no glow."
- **Flux (1.1 pro / dev):** Paste. 1920×1088 or `aspect_ratio: 16:9`. Negative list in the negative field or "Avoid: glow, neon, text, vignette."

**Reference images to attach:** Attach the same `floor-cushion-explainer.svg` PNG, but rendered in dark mode (open the SVG in a browser with dark colour scheme and take a 1920×1080 screenshot, or use the `@media (prefers-color-scheme: dark)` colours). Why: it locks the dark background and hairline contrast. Say: palette and line weight only.

**Post-processing**

1. Upscale 2×, crop to 3840×2160.
2. Tint to the brand dark `--bg` token with a `Color` blend layer.
3. Check that body text colour (`ink`, dark mode) keeps contrast ≥ 7:1 on the darkest and the lightest patch; flatten the light patches if not.
4. Export WebP 2560 wide ≤ 250 KB. In code: opacity 0.10 to 0.18, `mix-blend-mode: screen`.
5. Add the real grid and crosshairs in code.

---

## G3: Backdrop: a flat wall with one ruled floor line

**Used in:** OPTIONAL. Submission cover backdrop, X header (crop 3:1), deck section divider. Logo, headline and all text are added in Figma or code. BRAND.md forbids gradients, glow, shadows, 3D and illustration, so this is deliberately a flat, front-on, shadowless material study. If it looks more decorative than the lattice alone, do not use it.

**Final size / ratio:** 2688×1512 px, 16:9 (crop to 1920×1080 for the cover, 1500×500 for X, 1200×630 for link previews). Keep the line in the lower third and the left 40% quiet for the title.

**Prompt (all models)**

```
A flat, perfectly front-on, orthographic photograph of a smooth matte pale plaster wall surface, warm off-white (#FAFAF8), filling the whole frame edge to edge. Across the full width, one single perfectly straight, perfectly horizontal hand-ruled line of cobalt-blue pigment (#2440E0), about two pixels thick at 1920 px wide, sitting at about 68% of the image height, slightly matte, with tiny natural pigment texture but crisp clean edges. Above the line, extremely faint, barely visible pencil drafting construction lines: a few very pale warm-grey horizontal and vertical hairlines forming part of a square grid, some of them partly erased, low contrast. No perspective, no depth of field, no vignette, no shadows, no highlights, no gradient: even flat soft daylight, like a scanned drawing. Quiet, precise, professional, Swiss technical-drawing mood. The image contains no text, no letters, no numbers, no symbols, no logos, no people, no objects. The left 40% of the frame is almost empty.
```

**Negative prompt / avoid**

```
text, letters, numbers, words, logos, watermark, signature, charts, graphs, candlesticks, coins, bitcoin symbols, neon, glow, lens flare, gradients of purple or pink, robots, people, hands, laptops, screens, stock photo look, 3D cartoon, clutter, heavy vignette, saturated colours, perspective, floor tiles, 3D room, shadows, reflections, rainbow, multiple blue lines, wavy or tilted line, thick brush stroke, paint drips, texture noise heavy
```

**Model variants**

- **ChatGPT / GPT-image:** Paste as is. Add: "Landscape 16:9. Exactly one blue line, perfectly horizontal. No text." Attach the reference and say: "Match the hairline weight and the blue; ignore its content." Generate 4, keep the cleanest line.
- **Midjourney (v7):** `flat front-on orthographic photo of a smooth pale plaster wall, one perfectly straight hand-ruled cobalt blue pigment line across it, faint erased pencil grid hairlines above, even soft light, no shadows, scanned drawing look, minimal, Swiss --ar 16:9 --style raw --stylize 50 --chaos 0 --no text, letters, people, objects, perspective, shadows, glow, multiple lines, floor, room` Add `--sref <reference url> --sw 30`.
- **Gemini / Imagen:** Paste, set 16:9, add "Exactly one thin horizontal blue line. No text, no people, no shadows." If extra lines appear, ask: "Remove all other blue lines."
- **Flux (1.1 pro / dev):** Paste. 2048×1152 or `aspect_ratio: 16:9`; guidance about 3. If the line is not exactly horizontal, fix in post (step 2).

**Reference images to attach:** Attach `assets/svg/floor-cushion-explainer.svg` exported as a 1920×1080 PNG (`rsvg-convert floor-cushion-explainer.svg -w 1920 -o ref.png`). Why: it fixes the hairline weight, the warm paper colour, the single blue line and the amount of empty space. Tell the model: match the line weight, colours and restraint; do not copy the content or text.

**Post-processing**

1. Choose the best frame, upscale if needed, crop to 16:9.
2. Straighten: rotate by fractions of a degree until the blue line is exactly horizontal. If it is soft or wobbly, delete it and draw a crisp 2 px `--floor-line` line in Figma in its place at the same height (the product's floor line is cleaner than any generated line).
3. Colour-match: set the wall to `--bg` and the line to `--floor-line` (Color-blend layers). Strip any shadow or gradient (Levels / flatten).
4. Overlay the real lattice (1 px `--grid`, 96 px rows) and corner crosshairs from code so image and page grid align.
5. Add the logo, headline and `BNB HACK: TOKENIZED STOCKS` in Geist / Geist Mono. Export PNG 1920×1080 and 1200×630 (≤ 300 KB), 1500×500 for X.

---

## G4: Backdrop: flat edge-on stack of layers (the cushion)

**Used in:** OPTIONAL. Thread/blog thumbnail or deck divider for the cushion idea. Flat, shadowless, no depth of field. Drop it if it reads as stock imagery.

**Final size / ratio:** 2048×2048 px, 1:1 (crop to 1200×630 for link previews, 1080×1350 for portrait posts).

**Prompt (all models)**

```
A flat, perfectly front-on, orthographic elevation of the cut edge of a block of many very thin horizontal sheets of off-white paper, like a ream of paper seen from the side, filling the lower half of the frame. All layers are perfectly straight, perfectly horizontal and perfectly parallel, in tones of warm off-white (#FAFAF8 to #F3F3F0), separated by hairline gaps. The very bottom of the stack rests on one single solid thin horizontal line of cobalt-blue (#2440E0), perfectly straight, the only saturated element. Above the stack the background is plain flat off-white (#FAFAF8) with generous empty space. No perspective, no depth of field, no shadows, no gradient, no glow: even flat light, like a technical elevation drawing photographed square-on. Calm, precise, quiet. No text, no letters, no numbers, no logos, no people, no objects, no coins.
```

**Negative prompt / avoid**

```
text, letters, numbers, words, logos, watermark, signature, charts, graphs, candlesticks, coins, bitcoin symbols, neon, glow, lens flare, gradients of purple or pink, robots, people, hands, laptops, screens, stock photo look, 3D cartoon, clutter, heavy vignette, saturated colours, perspective, tilted or wavy layers, rounded corners, foam, pillows, fabric, shadows, bokeh, rainbow edges, multiple blue lines, 3D render look
```

**Model variants**

- **ChatGPT / GPT-image:** Paste as is. Add "Square 1:1. One blue line at the base only. No text." Attach the reference for colour. 4 variations.
- **Midjourney (v7):** `flat front-on elevation of the cut edge of a ream of thin off-white paper sheets, perfectly parallel horizontal layers, one thin cobalt blue line under the stack, plain off-white background, no shadows, minimal, technical --ar 1:1 --style raw --stylize 50 --no text, letters, logo, perspective, shadows, bokeh, foam, fabric, coins, people`
- **Gemini / Imagen:** Paste, set 1:1, add "No text. Layers perfectly horizontal and parallel. No shadows."
- **Flux (1.1 pro / dev):** Paste, 1536×1536 or `aspect_ratio: 1:1`, then upscale. Guidance about 3.

**Reference images to attach:** Attach `assets/svg/floor-cushion-explainer.svg` exported as a 1920×1080 PNG (`rsvg-convert floor-cushion-explainer.svg -w 1920 -o ref.png`). Why: it fixes the hairline weight, the warm paper colour, the single blue line and the amount of empty space. Tell the model: match the line weight, colours and restraint; do not copy the content or text. Why: the blue line and paper colour must match the product's floor line.

**Post-processing**

1. Upscale to 2048×2048. Rotate by fractions of a degree if any layer is not horizontal; if the generated blue line is imperfect, replace it with a drawn 2 px `--floor-line` rule.
2. Colour-match the paper to `--bg` and the line to `--floor-line`; flatten any shadow.
3. Crop to the target ratio, add headline and logo in Figma (Geist), overlay the real lattice and crosshairs from code.
4. Export WebP/PNG ≤ 300 KB.

