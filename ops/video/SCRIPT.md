# Floor launch video v2: script, typography and shot list (60 s master)

Grid: 90 BPM, 1 beat = 20 frames = 0.6667 s at 30 fps, 90 beats = 1800 frames = 60.000 s. Every scene boundary is on a beat.
Voice: captions and big type only, no voiceover. Words: plain, short, literal. Never: safe, guaranteed, protected, secure, audited, "never loses". The live-on-mainnet statement is required (user decision, see BRIEF2.md item 6).

| # | Beats | Frames | Seconds | Scene | Big type (exact words) | Real screen | Small caption (Geist Mono, lower third) |
|---|---|---|---|---|---|---|---|
| S0 | 0-8 | 0-160 | 0.0-5.3 | Cold open | `Set a floor / under your / stocks.` (accent: stocks.) + mono sub `Tokenized stocks. Spot swaps. Live on BNB Chain mainnet.` | none (paper, floor line draws, lockup stamps) | none |
| C1 | 8-11 | 160-220 | 5.3-7.3 | Card 01 | label `01 / THE IDEA`, headline `One rule. / Sell as prices fall. / Buy as they rise.` | none | none |
| L1 | 11-20 | 220-400 | 7.3-13.3 | Landing page | callout stickers around the panel: `The landing page.` no; see typography notes | real `/` scroll: hero, then the "moment" chart, then steps, ends with the cursor on nav "Try it" | `BACKTEST ON PAST DATA, NOT A PREDICTION` while any chart shows |
| C2 | 20-23 | 400-460 | 13.3-15.3 | Card 02 | `02 / TRY IT`, `Drag the floor. / See the past.` | none | none |
| T1 | 23-37 | 460-740 | 15.3-24.7 | Simulator | callouts: `Drag the floor.` near the thumb; `Higher floor: less loss, less upside.` beside the readout; `Replay a crash.` near the chips | real `/try`: slider 90 to 80, COVID crash chip, 2022 bear market chip | `SIMULATOR · BACKTEST ON PAST DATA, NOT A PREDICTION` |
| C3 | 37-40 | 740-800 | 24.7-26.7 | Card 03 | `03 / SET YOURS`, `A basket. A floor. / A term.` | none | none |
| A1 | 40-56 | 800-1120 | 26.7-37.3 | App: builder to review to confirmed | callouts: `Pick a basket.` `Set the floor.` `Pick a term.` `Review, then confirm.` | real `/app`, `/app/review`, `/app/confirmed` (app example mode) | `EXAMPLE DATA ON SCREEN` |
| C4 | 56-59 | 1120-1180 | 37.3-39.3 | Card 04 | `04 / YOUR OWN VAULT`, `Your money. / Your vault.` mono sub `One vault per position. Only you can exit it.` | none | none |
| A2 | 59-68 | 1180-1360 | 39.3-45.3 | Position and keeper | callouts: `Value. Floor. Cushion.` `A keeper rebalances. Spot swaps only.` | real `/app/position` then `/app/keeper` (example mode) | `EXAMPLE DATA ON SCREEN` |
| C5 | 68-71 | 1360-1420 | 45.3-47.3 | Card 05 | `05 / FOR AGENTS`, `Your agent can / use it too.` | none | none |
| G1 | 71-79 | 1420-1580 | 47.3-52.7 | Agents page | callout `MCP tools. Unsigned transactions.` | real `/agents` (app example mode) | `DEVELOPER PREVIEW · EXAMPLE DATA ON SCREEN` |
| E1 | 79-84 | 1580-1680 | 52.7-56.0 | Honest card | `A floor is not / a guarantee.` mono sub `Price gaps. Delayed sells. Token and contract risk.` | none | none |
| E2 | 84-90 | 1680-1800 | 56.0-60.0 | End card | headline `We are live / on mainnet.` (accent: `mainnet.`), lockup (repo SVG, unmodified), mono line `BNB Chain · Launch caps · No human audit`, mono line `Factory 0x1147d482fD08DDd7F377838efb610B606B3Ad765` (full address, from packages/contracts/deployments/56.json, so viewers can check it), mono line `floor.ayush.works`, small mono line `App screens in this video show example data.` | none | none |

30 s cut = S0 (shortened to 4 beats), T1 (8 beats), A1 (10 beats), E1+E2 (7 beats), with cards C2/C3 folded into 2-beat labels. Built from the same shots after the master is approved.

## Typography system (the point of v2)
- Headline: Anton, tight leading (0.92 to 0.96), tracking -1 to -2 %, ink #0B0C0E on paper, 200 to 300 px cap height on 1080p for card headlines. One accent word per card may be set in the pixel-serif italic (Instrument Serif Italic, pixelated by nearest-neighbour as in the OG banners) in cobalt #2440E0 or ink.
- Section labels: Geist Mono 500, 30 px, uppercase, tracking +8 %, cobalt, form `01 / THE IDEA`.
- Captions (lower third): Geist Mono 500, 26 to 30 px, ink on a paper chip with a 2 px ink keyline, never over UI text that must be read.
- Callouts: Anton 64 to 96 px, ink, on a flat paper-cut sticker (coral, mint, periwinkle or cobalt flat shape, hard offset, 1 to 3 px misregistration), with a flat arrow pointing at the real UI element. Callouts sit on paper layers in front of or beside the panel, never covering the control they describe.
- Placement: type sits on the grid (BRAND.md: left margin 96 px on 1920, baselines on a 12 px grid), headline blocks left aligned, big air around them, one idea per card. Word groups reveal on beats; each group holds at least 1.3 s before the card leaves. Cards are large paper planes placed in the 3D scene, not overlays.
- Reading time: at most 7 words per big-type card, hold at least 1.3 s per line pair.

## 15 s cut for X (priority over the 30 s cut), added after review
Silent-friendly (every idea is in the type and captions), hook inside the first 2 s. 22 beats = 440 frames = 14.667 s.
| Beats | Frames | Scene | Notes |
|---|---|---|---|
| 0-4 | 0-80 | Hook | `Set a floor under your stocks.` complete by frame 60 (2.0 s), first word group on frame 0 to 20 so something readable is on screen immediately. Sub line `Live on BNB Chain mainnet.` |
| 4-11 | 80-220 | Simulator | T1 highlights: slider 90 to 80 and the COVID crash chip, callouts `Drag the floor.` `Higher floor: less loss, less upside.`, backtest caption |
| 11-16 | 220-320 | App | A1 highlights: builder to review to confirmed, callout `Review, then confirm.`, `EXAMPLE DATA ON SCREEN` |
| 16-18 | 320-360 | Honest card | `A floor is not a guarantee.` (kept, user and reviewer agree it is the trust beat) |
| 18-22 | 360-440 | End card | `We are live on mainnet.`, lockup, factory address, `floor.ayush.works`, `No human audit` |
The 30 s cut stays as a lower priority deliverable. Both are musical edits of the master material (the Composer gives edit points), not fades.
Rule: the video does NOT say "source verified on BscScan" or any verification claim (the team could not open BscScan from this environment). The factory address on the end card lets viewers check it themselves.
