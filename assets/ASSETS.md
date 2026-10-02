# Floor: visual asset plan

Last updated 2026-10-02. Written against `CONTEXT.md` and `docs/RESEARCH_RESULTS.md`; chart data comes from `afterbell/research/vault_check/gap_backtest.csv`. A browsable version with copy buttons is `assets/asset-plan.html`; the AI prompts alone are in `assets/PROMPTS.md`. Three example SVGs are in `assets/svg/`.

**Method decisions in one line.** Almost everything is code/SVG or a chart drawn from the real CSV, because this style is lines, grids and exact text, which image models draw badly, and BRAND.md bans illustration, gradients and shadows. AI images are limited to four OPTIONAL flat material backdrops (G1–G4) with no text, chart or logo. Screens, terminal sessions and DX-report figures are real captures.

**Counts.** Code/SVG: 32, Data chart: 9, AI image: 4, Real capture: 3. Total 48. Priority: P0: 21, P1: 20, P2: 7.

**Assumptions to confirm** (brand designer / web engineer)
- Palette, fonts and grid come from `design/BRAND.md` and `design/tokens.css` (read 2026-10-02). If the brand changes, the tokens win; the three example SVGs hard-code the same values and need a one-line colour update.
- The 96 px lattice row is the desktop value. The example figures are drawn on a 48 px step (half a row) with a crosshair every 96 px, all coordinates multiples of 8, so they snap to the page lattice when placed on whole cells.
- Hero: LANDING_COPY.md wants a real backtest path (stock falls, portfolio flattens at the floor). The CSV has only summaries. Someone must export one real window (asset C0). Until then use the illustration, labelled as one.
- COPY CHECK (marketing, research): the copy and demo script say 'the worst backtest year, holding NVDA lost 36%'. In the CSV, −36.45% is the MEDIAN hold return over the 17 windows where holding lost more than 10%. It is not the single worst window. Reword, or use the real worst window from C0.
- BRAND.md bans illustration, gradients, glow, shadow, 3D and looping motion. Result: AI images are only four optional, flat material backdrops (G1–G4). The product works without them. Web animation is draw-once; the video may loop.
- All backtest charts use CSV rows `mode=open_close` (the mode behind 93/93 and 42/45/32%). `close_only` differs slightly (e.g. TSLA breaches 3.2% at m=5).
- The backtest windows overlap (252 trading days, a new window every 21), so '93 windows' are not 93 independent years. Every chart footer says so.
- AAPL has no bStock. It appears only in the worst-gap chart (C7), as a fact about the underlying stock.
- docs/ARCHITECTURE.md and docs/CONTRACTS.md did not exist yet: D1 (architecture diagram) waits for them. MCP tool names come from CONTEXT.md and must be updated if they change.
- Weekend rebalancing cost and crash-time cost are unmeasured; C6 says so and must be updated if the measurement lands.
- The hackathon submission platform's cover-image size is unverified (S3).
- Image models: sizes and flags change often. The prompts give targets and exact intent; check each tool's current aspect-ratio options.

## Inventory

| ID | Asset | Where used | Method | Prio | Size | Status |
|---|---|---|---|---|---|---|
| B1 | Logo mark + wordmark + lockups | Everywhere | Code/SVG | P0 | SVG: mark 48×21, word 85×24, lockup 179×36 | Delivered by brand designer: design/logo/ |
| B2 | Favicon + app icons | Browser tab, bookmarks, PWA, wallet-app listing | Code/SVG | P0 | favicon.svg (done); 32/48 .ico; 180 apple-touch; 192, 512 PWA; 512 maskable | Partly done: favicon.svg exists; PNG/ICO exports to do |
| L1 | Hero chart: a real stock falls, the portfolio stops at the floor | Landing hero (right half or full width) | Data chart | P0 | Responsive; design at 960×576 (desktop panel), 4:5 on phone | Blocked on data: needs a day-by-day path (see C0). Fallback: svg/floor-cushion-explainer.svg, labelled illustration. |
| C0 | Data task: export one real window's day-by-day path | Feeds L1 (hero), the demo opener, the #problem visual, deck | Data chart | P0 | CSV, ~252 rows | To do (needs a re-run of gap_backtest.py, network for yfinance) |
| L2 | Floor + cushion explainer diagram | Landing 'what is a floor' section, pitch deck, app tooltip | Code/SVG | P0 | 960×576; SVG | Drawn: svg/floor-cushion-explainer.svg |
| L3 | How-it-works 4-step diagram + exposure mini chart | Landing 'how it works' row; deck | Code/SVG | P0 | One 12-column strip (4 cells × 3 columns), each cell ~288×192; mini chart ~576×192 | To do |
| L4 | Hero grid background layer (uses G1/G2 as optional texture) | Landing hero, behind the figure | Code/SVG | P2 | 3840×2160, 16:9 (also needs a dark version) | To do (prompt G1 / G2) |
| L5 | Section dividers, ruler, crosshair primitives | Landing, app, deck | Code/SVG | P0 | CSS / React components | To do |
| L6 | Token chips | Landing, app, deck, charts | Code/SVG | P1 | Component, 20 px high | To do |
| L7 | Icon set | Landing, app, MCP card | Code/SVG | P1 | 24×24, stroke 1.5, square caps, SVG components | To do |
| L8 | Competitive landscape matrix | Landing (optional), pitch deck, submission | Code/SVG | P1 | 1920×1080 slide / responsive table | To do |
| L9 | Spot-only strip (four crossed-out labels + swap arrow) | Landing #spot-only, deck | Code/SVG | P1 | 12-column strip; 4 cells × 3 columns, 96 px high + a swap arrow row | To do |
| L10 | MCP call snippet card | Landing #agents, README, S5 | Code/SVG | P1 | Card ~576×288 | To do (needs real tool schema) |
| C1 | Chart: bad years, vault vs holding | Landing proof section, deck, OG card, video | Data chart | P0 | 960×672 SVG / responsive | Drawn: svg/bad-years-chart.svg (generated from the CSV) |
| C2 | Chart: floor held in 93 of 93 windows (breach rate by m) | Landing proof, deck, 'why m=4' | Data chart | P0 | 960×540; a heat-table plus one big number | To do |
| C3 | Chart: how much upside you keep | Landing 'the price of protection', deck | Data chart | P0 | 960×480 | To do |
| C4 | Chart: the cost of honesty (median year) | Landing 'honest numbers' block, deck, DX report | Data chart | P1 | 960×480 | To do |
| C5 | Chart: the m dial (upside vs worst case) | Deck, 'why m=4' explainer, app 'how it works' page | Data chart | P2 | 960×540 | To do |
| C6 | Chart: rebalance cost by token | Landing 'real costs' strip, deck, submission, demo video | Data chart | P1 | 960×420 + a table | To do |
| C7 | Chart: worst overnight/weekend gaps vs the 25% limit | Landing 'what can go wrong', deck, pitch | Data chart | P1 | 960×420 | To do |
| C8 | Chart: the weekend strip | Landing, app (market state), deck | Code/SVG | P1 | 960×200 / full width | To do |
| D1 | Architecture diagram for judges | Submission, deck, README, DX report | Code/SVG | P0 | 1920×1080 SVG | Blocked: waits for docs/ARCHITECTURE.md |
| D2 | Agent flow: agent → MCP → b402 → keeper | Landing 'built for agents', submission (Agentic Wallet + BNB Agent Studio prizes), deck, video | Code/SVG | P0 | 960×480 SVG | Drawn: svg/agent-flow.svg |
| D3 | Vault lifecycle / state diagram | Docs, deck, DX report | Code/SVG | P1 | 960×420 | To do |
| D4 | Rebalance loop (CPPI formula card) | Landing (small), deck, app info panel | Code/SVG | P1 | 480×320 | To do |
| A1 | Quote preview chart (protection quote) | App: floor picker / quote_protection result | Code/SVG | P0 | Component, ≥ 560×320 | To do |
| A2 | Position status panel (value vs floor gauge) | App dashboard | Code/SVG | P0 | Component, 480×200 | To do |
| A8 | Simulated crash view (split) | Demo video 0:45–1:10, app 'how it works' demo mode, deck | Code/SVG | P0 | 1920×1080 for video; component ≥ 560×320 | To do |
| A3 | Empty states (3) | App | Code/SVG | P1 | 3 × 320×200 | To do |
| A4 | Loading + in-progress states | App | Code/SVG | P1 | Components | To do |
| A5 | Error / blocked / market-closed banners | App | Code/SVG | P1 | Component | To do |
| A6 | App screenshots in a frame (submission gallery) | Submission, README, deck | Real capture | P1 | 1920×1080, 3–5 images | Waits for the working app |
| A7 | Terminal / agent session capture | Demo video, submission, DX report | Real capture | P0 | 1920×1080 screen recording; also a still | Waits for working MCP + keeper |
| V1 | Demo-video title cards (intro, section, outro) | Demo video | Code/SVG | P0 | 1920×1080, 30/60 fps; PNG + short MP4/WebM | To do |
| V2 | Lower thirds + callouts | Demo video | Code/SVG | P1 | 1920×1080 transparent PNG / alpha WebM | To do |
| V3 | Chart animations for the video | Demo video, hero | Code/SVG | P0 | 1920×1080, 10–15 s each | To do |
| V5 | Demo-video number cards (trade-off cards) | Demo video 1:35–1:52 | Code/SVG | P0 | 1920×1080, 3 cards | To do |
| V4 | Pitch deck master + slides | Submission pitch, Q&A | Code/SVG | P1 | 1920×1080, ~10 slides | To do |
| S1 | Open Graph / link-preview image | Website meta tags, link unfurls (Discord, Telegram, X) | Code/SVG | P0 | 1200×630 (1.91:1) PNG, ≤ 300 KB | To do |
| S2 | X / Telegram number cards (4) | Launch posts, hackathon thread | Code/SVG | P1 | 1200×675 (16:9) PNG ×4 | To do |
| S3 | Submission cover image (text in code, backdrop from G3) | Hackathon submission page, social | Code/SVG | P0 | 1920×1080 (16:9); also 1200×630 and 3:2 crops | To do (prompts G3, G4 as backdrop) |
| S4 | X header + README / GitHub social preview | X profile, GitHub repo | Code/SVG | P2 | 1500×500 (3:1); 1280×640 (2:1) | To do |
| S5 | MCP / Skill listing card | BNB Agent Studio and Wallet Skills side-prize entries, README, skill hub listing | Code/SVG | P1 | 1200×630 | To do |
| S6 | DX report figures | Developer Experience Report | Real capture | P1 | As needed | Capture during the build |
| G1 | AI texture: drafting paper (light) | Optional backdrop: hero, cover, deck cover, OG | AI image | P2 | 3840×2160, 16:9 | Optional: prompt written |
| G2 | AI texture: drafting film (dark) | Optional backdrop, dark mode | AI image | P2 | 3840×2160, 16:9 | Optional: prompt written |
| G3 | AI backdrop: flat wall with one ruled floor line | Optional submission cover backdrop, X header crop, deck divider | AI image | P2 | 2688×1512 (16:9), crops to 3:1 | Optional: prompt written |
| G4 | AI backdrop: flat edge-on stack of layers (the cushion) | Optional blog/thread thumbnail, deck divider | AI image | P2 | 2048×2048 (1:1), crops to 1.91:1 | Optional: prompt written |


## 0. Conventions every asset follows

**Aligned to `design/BRAND.md` + `design/tokens.css` (v1, 2026-10-02).** Colours are referred to by token name. Hex values below are copied from `tokens.css`; if the tokens change, the tokens win. The three example SVGs in `assets/svg/` use these values (literal colours in classes, with a dark-mode media query, so they also open in Figma and Inkscape).

| Token / role | Used for in assets | Light | Dark |
|---|---|---|---|
| `--bg` | canvas | #FAFAF8 | #0A0B0D |
| `--surface` | cell / card fill | #FFFFFF | #111215 |
| `--grid` | lattice hairlines, cell borders | #E4E5E0 | #1C1E21 |
| `--grid-strong` | frames, axis lines, section rules | #CFD0CA | #2C2E31 |
| `--crosshair` | "+" marks, ticks, the 'hold' series fill | #8C8E86 | #6E7068 |
| `--text` | text, the portfolio value line (1.5px), box outlines | #10110F | #F2F2EE |
| `--text-muted` | mono labels, captions | #686A63 | #8D9088 |
| `--accent` | the 'vault' series, links, one primary element | #2440E0 | #7C93FF |
| `--floor-line` | the floor line and nothing else (2px) | #2440E0 | #7C93FF |
| `--accent-soft` | the cushion fill | #E9ECFC | #151A33 |
| `--warning` | gap risk, weekend, 'cost of honesty' callouts, the −25% limit line | #8F5600 | #F2B84B |
| `--negative` | cash lock, errors | #B8312A | #FF7469 |
| `--positive` | gain / holding, used sparingly and never alone | #0B7544 | #3DD68C |

- **Grid.** Base unit 8 px. Desktop lattice: 12 columns, 96 px rows (tablet 8 columns / 80 px, phone 4 columns / 64 px). In standalone figures the lattice step is 48 px (half a desktop row) with a crosshair every 96 px; all coordinates are multiples of 8. In the UI, figures sit on whole cells, left edge on a column line.
- **Lines.** All 1 px (`vector-effect: non-scaling-stroke`) except the floor line (2 px). Value path 1.5 px `--text`, round joins. Dashed reference lines `4 4`. Boxes square, no radius, no shadow. Crosshair: 11 px box (5 px arm), 1 px, `--crosshair`, at box corners and lattice intersections, never on text.
- **One accent rule.** The floor line is the only saturated stroke in most layouts. Vault = `--accent`, hold = `--crosshair` grey. No red/green gain-loss colouring; if `--positive` / `--negative` appear they carry a sign or a word as well.
- **Type.** Geist for headlines and body, Geist Mono for every number with a unit, ticker, label, table header and all chart text. Labels: mono 500, uppercase, +0.08 em; 12 px in the UI, 10–11 px inside exported figures. No sans text inside a figure. Use `font-variant-numeric: tabular-nums slashed-zero`.
- **Figure label.** Every diagram and chart starts with `FIG. NN / TITLE` top-left and a one-line subtitle in `--text-muted`.
- **Honesty footer on every backtest chart.** Bottom-left, exact wording: `93 ROLLING 1-YEAR WINDOWS, 2018 TO 2026-10 (252 TRADING DAYS, A NEW WINDOW EVERY 21), SO WINDOWS OVERLAP.` then `FULL WEEKEND GAPS ASSUMED · 0% STABLECOIN YIELD · REBALANCE AT OPEN AND CLOSE · BACKTEST, NOT A FORECAST.` In the web page also use the landing-copy caption: `Backtest on past prices. It does not predict the future.` Illustrations and simulations carry `ILLUSTRATION, NOT BACKTEST DATA.` or `SIMULATED` in the figure, never only in a caption.
- **Words.** Never "guaranteed" or "can't lose". Floor sentence: `A floor that holds unless prices gap more than 25% before the vault can rebalance.`
- **No logos of other companies** (NVIDIA, Tesla, Binance, PancakeSwap...). Tokens are mono chips: `NVDAB`, `SPCXB`, `QQQB`, `SPYB`. Partner names are plain mono text.
- **No illustration, no gradients, glow, shadow, 3D, coins** (BRAND.md §2, §7). This is why almost everything is code and why AI images are limited to optional flat material backdrops.
- **Motion** (BRAND.md §8): the floor line and value path may draw in once (900 ms, `cubic-bezier(0.2,0,0,1)`); numbers may tick up to the exact value within 600 ms; 8 px fade-up on section entry. **No looping, no bounce, no parallax, no glow, never animate crosshairs or the logo.** `prefers-reduced-motion`: show end states. (Video exports are not bound by the web motion rules but keep the same restraint.)
- **Dark mode.** Every asset has light and dark via tokens (`data-theme` or OS). Standalone SVGs use `prefers-color-scheme`.
- **Data source.** Charts read `research/vault_check/gap_backtest.csv` (afterbell project), rows `mode = open_close` unless said otherwise (the mode behind 93/93 and the 42% / 45% / 32% figures). Windows: 252 trading days, a new window every 21 days, so windows overlap. "Bad year" = windows where holding ended below 90% (CSV `n_bad`; `bad_yr_*` are **medians over those windows**). "Upside kept" = median of (vault gain ÷ hold gain) in windows where holding gained (`capture_up`).
- **Use the `dataviz` skill** for tooltip, legend and accessibility behaviour of the live chart components (BRAND.md §10).

## Asset specs

### B1 Logo mark + wordmark + lockups

- **Where used:** Everywhere
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** SVG: mark 48×21, word 85×24, lockup 179×36
- **Status:** Delivered by brand designer: design/logo/

Delivered in `design/logo/`: `floor-mark.svg` (48×21, adaptive: `currentColor`, `--floor-line`, `--accent-soft`), `floor-mark-dark.svg` / `-light`, `floor-wordmark.svg` (85×24, Geist Bold outlined), `floor-lockup.svg` (179×36) + `-dark` / `-light`, `favicon.svg` (app icon tile), `floor-avatar.svg` (400×400 X/Telegram avatar). Concept: a value line drops steeply, makes one small soft shoulder, then eases and rests flat one stroke width above a blue floor line it never touches or crosses (traced from the NVDA 2022 backtest), with a thin cushion fill and a short tick at the floor line's left end. Rules (BRAND.md §3): clear space = half the mark height, minimum mark 32 px wide, lockup 112 px wide (below that, the app icon); inline the SVG so the floor line and cushion follow the theme tokens; never reshape the curve; the wordmark is outlined Geist Bold, never retype it.
Open items for this plan: (1) an accent-ink variant for use on accent fills (all parts in accent-ink, no cushion) is not a file yet (BRAND.md says use `--accent-ink`); (2) the lockup is not exported as PNG for slides and video, so export 1× and 2× PNGs on transparent background in ink and in light.

### B2 Favicon + app icons

- **Where used:** Browser tab, bookmarks, PWA, wallet-app listing
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** favicon.svg (done); 32/48 .ico; 180 apple-touch; 192, 512 PWA; 512 maskable
- **Status:** Partly done: favicon.svg exists; PNG/ICO exports to do

`design/logo/favicon.svg` already exists (#0A0B0D tile with rx 6 of 32, simplified mark: off-white value line and #7C93FF floor line, no cushion or tick, strokes 3.4 of 48). Still needed, all exported from that file or the mark, no AI:
- `favicon.ico` 16/32/48.
- `apple-touch-icon.png` 180×180: the same tile at full bleed with square corners (iOS rounds it itself; drop the rx 6 so the corners are not rounded twice, BRAND.md §3).
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (mark kept inside the central 80% safe zone).
- In Next.js use `app/icon.svg` and `app/apple-icon.png`. Export with `rsvg-convert` or `next/og`.

### L1 Hero chart: a real stock falls, the portfolio stops at the floor

- **Where used:** Landing hero (right half or full width)
- **Method:** Data chart
- **Priority:** P0
- **Size:** Responsive; design at 960×576 (desktop panel), 4:5 on phone
- **Status:** Blocked on data: needs a day-by-day path (see C0). Fallback: svg/floor-cushion-explainer.svg, labelled illustration.

The landing copy (#hero) asks for: a price chart of a falling stock, a flat horizontal line `Your floor: 90%`, the portfolio line following the stock down then flattening at the floor, labelled `backtest`. The CSV has only summary rows, no daily series, so this chart needs the data in C0.
- Component `<FloorChart />` (BRAND.md §10 "Chart (core)"): plot on the lattice, value path 1.5px `--text`, stock path (the same stock held, no floor) 1.5px `--crosshair` dashed, floor line 2px `--floor-line` with 11px end ticks and mono label `FLOOR 90%` just under it, cushion filled `--accent-soft` labelled `CUSHION`. Hatched/sunken band for any cash-lock stretch, labelled `CASH LOCK`.
- Four corner crosshairs on the panel (BRAND.md §6). Panel label `FIG. 01 / NVDA, ONE REAL 1-YEAR WINDOW · BACKTEST` and under it `BACKTEST ON PAST PRICES. IT DOES NOT PREDICT THE FUTURE.`
- Motion (BRAND.md §8): floor line draws first (900 ms), then both paths (900 ms), once. Reduced motion: end state. No looping, no bounce, no glow.
- Hover: a crosshair marks the point; a square mono tooltip with date, stock index, vault value, floor (all from the exported file).
- Fallback if the data is late: ship `svg/floor-cushion-explainer.svg` geometry as `<FloorExplainer />` with its `ILLUSTRATION, NOT BACKTEST DATA.` footer. Do not draw a made-up price path and call it a backtest.

### C0 Data task: export one real window's day-by-day path

- **Where used:** Feeds L1 (hero), the demo opener, the #problem visual, deck
- **Method:** Data chart
- **Priority:** P0
- **Size:** CSV, ~252 rows
- **Status:** To do (needs a re-run of gap_backtest.py, network for yfinance)

The CSV `gap_backtest.csv` holds only per-basket summaries. Several assets need a real path. Ask whoever owns `afterbell/research/vault_check/gap_backtest.py` to add an export and re-run it (it downloads prices via yfinance). I could not do this: out of scope and needs network.
- Choose the NVDA one-year window with the lowest holding return (state its start and end dates), mode `open_close`, m=4, floor 90%.
- Output `vault_path_nvda.csv`: `date, stock_index (start=100, buy-and-hold), vault_value (start=100), floor (=90), stock_weight_pct, usdt_weight_pct`.
- Optional second window: the NVDA+TSLA+QQQ basket's worst window, and one calm up-year window to show the other side (the vault keeps part of the gain).
- **Copy check:** `marketing/` says "in the worst backtest year, holding NVDA lost 36%" and the demo script says "Worst backtest year: −36%". In the CSV, −36.45% is the **median** hold return across the 17 windows where holding lost more than 10% (`bad_yr_hold`), not the single worst window. The true worst window is probably worse. Either reword to "in a bad year (median of bad windows)" or use the real worst-window number from this export.
- The same file gives the exact numbers for the demo's opening line chart and for the #how-it-works mini chart of stock weight shrinking.

### L2 Floor + cushion explainer diagram

- **Where used:** Landing 'what is a floor' section, pitch deck, app tooltip
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** 960×576; SVG
- **Status:** Drawn: svg/floor-cushion-explainer.svg

Already drawn: `assets/svg/floor-cushion-explainer.svg`. Implement as a React component with the same geometry so labels can be translated and data-bound.
- Shows: deposit line (dashed, 100%), floor line (accent, 90%), value line, cushion bracket `CUSHION = V − F`, rule `STOCK HELD = 4 × CUSHION (NEVER MORE THAN V)`, `THE REST SITS IN USDT`, the shrink case `CUSHION SHRINKS: VAULT SELLS STOCK FOR USDT`, the growth case `CUSHION GROWS: VAULT BUYS STOCK BACK`.
- Footer wording is mandatory: `HOLDS UNLESS PRICES GAP MORE THAN 25% BEFORE THE VAULT CAN REBALANCE (m = 4).`
- Optional (P2): a draggable scrubber moves a vertical hairline along the value line and the readout `CUSHION / STOCK HELD / USDT HELD` updates. Computed from CPPI formula only (no market data), in percent of deposit.
- Not to scale; say so in the subtitle (done). Draw-on once per BRAND.md §8 (floor line first, then value path, 900 ms each). Geometry is on the 48 px lattice, all multiples of 8.

### L3 How-it-works 4-step diagram + exposure mini chart

- **Where used:** Landing 'how it works' row; deck
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** One 12-column strip (4 cells × 3 columns), each cell ~288×192; mini chart ~576×192
- **Status:** To do

Matches `#how-it-works` in LANDING_COPY.md: "a 4-step horizontal diagram on the grid. Under step 3, a small chart: stock exposure shrinking as the price falls toward the floor line." These are diagrams, not illustrations (BRAND.md: no illustration): orthogonal lines, mono labels, one accent element (the floor line) per cell, numerals `01`–`04` in a boxed cell corner. Phone: 4 cells stacked 1-up.
1. `01 / DEPOSIT`: a rectangle (the vault) and three mono chips `NVDAB` `QQQB` `USDT` stacked left of it with a right-angle arrow into it. Chips fade in once (240 ms, 8 px fade-up).
2. `02 / PICK YOUR FLOOR`: a horizontal slider track with thumb, ticks at 80%, 85%, 90%, 95%; a dashed deposit line above a `--floor-line` 2px line below, with a dimension bracket labelled `YOUR WORST CASE`. Label the thumb value in mono (`90%`, matches the copy's example).
3. `03 / THE VAULT KEEPS YOU ABOVE THE LINE`: two stacked bars `STOCK` and `USDT` plus the mini chart below the row: x = time, one line = price falling toward the floor line, a second line = stock exposure shrinking as it nears the line. The mini chart is a CPPI computation from the formula, not market data, so it carries `ILLUSTRATION, NOT BACKTEST DATA.`. Add the weekend ruler from C8 under it in small form: `WEEKEND: NO REBALANCING`.
4. `04 / WITHDRAW WHEN YOU LIKE`: the vault rectangle with an arrow out to the right and a ruler `END OF TERM: 1 YEAR`. Wording is the marketing writer's; keep labels ≤ 24 characters.

### L4 Hero grid background layer (uses G1/G2 as optional texture)

- **Where used:** Landing hero, behind the figure
- **Method:** Code/SVG
- **Priority:** P2
- **Size:** 3840×2160, 16:9 (also needs a dark version)
- **Status:** To do (prompt G1 / G2)

See G1 (light) and G2 (dark) in PROMPTS.md. **Brand tension:** BRAND.md says no gradients, glow or shadows and treats the lattice as structural. A paper-grain texture is therefore strictly optional and must be almost flat. Default: ship without it, using only `.lattice` from `tokens.css`. If used: behind the hero only (never behind body text), 6–12% opacity, `mix-blend-mode: multiply` (light) / `screen` (dark), WebP ≤ 250 KB at 2560 wide.

### L5 Section dividers, ruler, crosshair primitives

- **Where used:** Landing, app, deck
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** CSS / React components
- **Status:** To do

Build once as components, used by every other asset:
- `<GridCell>`: 1 px border grid-line, background surface, crosshair marks on its four corners (CSS `::before/::after` using two 10 px gradient lines).
- `<Crosshair size=10>`: "+" mark.
- `<Ruler ticks=… label=…>`: a horizontal line with ticks every 8 px and a longer tick every 40 px, mono labels under it. Used for the term axis (`DAY 0 … TERM END`) and the weekend strip.
- `<FigLabel n title sub>`: `FIG. 01 / TITLE` plus subtitle.
- `<DimLine from to label>`: a dimension line with end ticks and a centred mono label, as used for the cushion bracket.
- These should reuse what already exists in `design/tokens.css`: `.cell`, `.lattice`, `.xh`, `.xh-corners`, `.cols`, `.section`. Only `Ruler`, `FigLabel` and `DimLine` are new.

### L6 Token chips

- **Where used:** Landing, app, deck, charts
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** Component, 20 px high
- **Status:** To do

Mono text chips with a 1 px border: `NVDAB`, `SPCXB`, `QQQB`, `SPYB`, `USDT`. No company or token logos. Optional 6 px square marker left of the text in ink (stocks) or accent (USDT). Used in the deposit form, the position table and the step-2 illustration. TSLAB is not in v1; do not draw a chip for it.

### L7 Icon set

- **Where used:** Landing, app, MCP card
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 24×24, stroke 1.5, square caps, SVG components
- **Status:** To do

BRAND.md §7: Lucide, 1.5 px stroke, `currentColor`, `stroke-linecap="square"`, sizes 16/20/24; feature markers sit in a 40 px square hairline cell. Draw custom only for the Floor-specific ones.
- Custom (draw on a 24 px grid): `floor-line` (horizontal line with a short line above), `cushion` (two horizontal lines with a vertical dimension bracket), `cash-lock` (padlock over a horizontal line), `weekend-gap` (two vertical ticks with a gap between), `vault` (square with a crosshair).
- Lucide: `wallet`, `arrow-up-right`, `arrow-down-right`, `clock`, `calendar`, `terminal`, `plug`, `copy`, `check`, `alert-triangle`, `external-link`.
- No filled icons, no gradients, no emoji.

### L8 Competitive landscape matrix

- **Where used:** Landing (optional), pitch deck, submission
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 1920×1080 slide / responsive table
- **Status:** To do

A plain grid table drawn in the visible-grid style. Rows (from CONTEXT.md, 'found on BNB Chain'): Lending against bStocks (Venus, Lista DAO); Stock baskets (City Protocol, Mag-7 index); Stock perps (Aster); Pre-IPO tokens (Colb, Paimon); Floor. Columns: `HOLD STOCK AS SPOT`, `DOWNSIDE PROTECTION`, `NO PERPS / OPTIONS / BORROWING`.
- Fill cells with `●` (yes) / `○` (no) only where CONTEXT.md supports it. Floor row: spot yes, protection yes, no derivatives/borrowing yes. For the other rows only the claim "no downside-protection product for tokenized stocks found on BNB Chain" is supported: mark the protection column `○` and the footer says `AS FAR AS OUR RESEARCH FOUND, 2026-10.` Leave other cells empty rather than guess (unverified).
- No logos of those companies, names as mono text.

### L9 Spot-only strip (four crossed-out labels + swap arrow)

- **Where used:** Landing #spot-only, deck
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 12-column strip; 4 cells × 3 columns, 96 px high + a swap arrow row
- **Status:** To do

From LANDING_COPY.md `#spot-only`: four grid cells in a row, each with a mono label struck through by a 1 px diagonal line: `PERPS`, `OPTIONS`, `LEVERAGE`, `BORROWING`. Under them one right-angle swap arrow between two chips `NVDAB` ⇄ `USDT`, label `SWAP ON BNB CHAIN`. Strike lines in `--text`, 1 px; the arrow in `--accent`. No red crosses, no icons. Draws in once (240 ms stagger 80 ms).

### L10 MCP call snippet card

- **Where used:** Landing #agents, README, S5
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** Card ~576×288
- **Status:** To do (needs real tool schema)

A code card on the grid: header `EXAMPLE: quote_protection` and a monospace JSON request/response. The text must be an example, labelled `EXAMPLE` in the header, and use only arguments that exist in the real MCP tool schema (the contracts/architecture agents define it). Use only values that follow from the product rules (e.g. `floor: 0.90`, `term_days: 365`); never show a made-up balance or price. Optional second tab `HTTP 402` showing the payment-required step. Real syntax highlighting with only `--text`, `--text-muted`, `--accent`.

### C1 Chart: bad years, vault vs holding

- **Where used:** Landing proof section, deck, OG card, video
- **Method:** Data chart
- **Priority:** P0
- **Size:** 960×672 SVG / responsive
- **Status:** Drawn: svg/bad-years-chart.svg (generated from the CSV)

Horizontal paired bars per basket: vault (`--accent`) and hold (`--crosshair` grey), measured from 0% to the left, a vertical accent line at −10% labelled `FLOOR −10%`. The point: the vault bars stop at the floor, the hold bars don't.
- Source: `gap_backtest.csv`, `mode=open_close`, `m=4`, columns `bad_yr_vault`, `bad_yr_hold`, `n_bad`.
| Basket | Windows where holding lost >10% | Vault median (%) | Hold median (%) |
|---|---|---|---|
| NVDA | 17 of 93 | −9.9 | −36.5 |
| NVDA+TSLA+QQQ | 17 of 93 | −8.6 | −17.2 |
| TSLA | 19 of 93 | −9.7 | −26.8 |
| QQQ | 10 of 93 | −7.4 | −19.4 |
| SPY | 6 of 93 | −6.0 | −12.0 |
- Axis: 0% at right, −40% at left, ticks every 10%. Row order: by hold loss, largest first. Row label: basket name + `N OF 93 WINDOWS`. Value labels at the bar end, one decimal, true minus sign.
- Headline for the section (copy is the marketing writer's): research quotes NVDA −9.9% vs −36%, basket −8.6% vs −17%, QQQ −7.4% vs −19%. TSLA −9.7% vs −26.8% is in the CSV too.
- Honest footer from section 0. Implementation: React + plain SVG (no chart library needed); bars animate width over 0.8 s once.
- Variant C1a, the `#problem` visual: only the NVDA pair, big: `NVDA, hold: −36%` vs `NVDA with Floor: −9.9%`, caption `PAST DATA, NOT A PREDICTION.` Label the −36% honestly as `MEDIAN OF THE 17 BAD WINDOWS` until C0 supplies the real worst window (see C0 copy check).
- Landing-copy order for `#proof`: stat tile (C2 big number), this chart, upside bars (C3), gap bars (C7), breach table (C2). One chart type per number, no smoothing.

### C2 Chart: floor held in 93 of 93 windows (breach rate by m)

- **Where used:** Landing proof, deck, 'why m=4'
- **Method:** Data chart
- **Priority:** P0
- **Size:** 960×540; a heat-table plus one big number
- **Status:** To do

Left: the big number `93 / 93` (mono, large) with caption `1-YEAR WINDOWS WHERE A 90% FLOOR HELD, m = 4, NVDA, QQQ, SPY, TSLA AND THE BASKET`. (CONTEXT.md: held in 93 of 93 at m = 4.)
Right: a heat-table, rows = basket, columns = m, cell = breach rate (% of the 93 windows where value ever went below the floor). 0 cells are plain with `0`, non-zero cells filled `--accent-soft` with a `--warning` border and the value. Column m=4 outlined in accent: `OUR SETTING`.
- Source `breach_pct`, `mode=open_close`:
| Basket | m=2 | m=3 | m=4 | m=5 | m=6 | m=8 |
|---|---|---|---|---|---|---|
| NVDA | 0.0 | 0.0 | 0.0 | 0.0 | 11.8 | 20.4 |
| NVDA+TSLA+QQQ | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| TSLA | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 8.6 |
| QQQ | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| SPY | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
- Note under the table: `m = 4 SURVIVES ANY SINGLE GAP SMALLER THAN 25%. FLOOR BREAKS ON A SINGLE GAP BIGGER THAN 1/m.` (the CSV script prints: m=4 → 25%, m=5 → 20%, m=6 → 16.7%, m=8 → 12.5%).
- Worst breach at m=8 was −13.4% against a −10% floor (RESEARCH_RESULTS.md; that is `close_only`; if shown, say so).
- Standard footer.
- Landing copy asks for a small table with the caption `This is why we use 4x.`: at 4x 0% for every basket, at 6x NVDA 12%, at 8x NVDA 20% and TSLA 9%. This table gives exactly those cells.

### C3 Chart: how much upside you keep

- **Where used:** Landing 'the price of protection', deck
- **Method:** Data chart
- **Priority:** P0
- **Size:** 960×480
- **Status:** To do

Vertical bars per basket, y = share of the holder's gain the vault kept in up years, at m=4. A dashed line at 42% labelled `BASKET: ~42%`. TSLA's bar is negative (whipsaw): draw it below the axis in `--warning` with the label `−3.1% (WHIPSAW)`.
| Basket | Share of the holder's gain kept at m=4 (%) |
|---|---|
| NVDA | 44.7 |
| NVDA+TSLA+QQQ | 41.9 |
| TSLA | −3.1 |
| QQQ | 32.3 |
| SPY | 33.0 |
- Copy hook: "You keep part of the upside; that's the price of the protection." CONTEXT.md figures: ~42% basket, ~45% NVDA, ~32% QQQ.
- Definition line under the chart: `MEDIAN OF (VAULT GAIN ÷ HOLD GAIN) IN WINDOWS WHERE HOLDING GAINED.`
- Standard footer.

### C4 Chart: the cost of honesty (median year)

- **Where used:** Landing 'honest numbers' block, deck, DX report
- **Method:** Data chart
- **Priority:** P1
- **Size:** 960×480
- **Status:** To do

Paired bars per basket: median one-year return, vault vs hold, all 93 windows (not only bad ones). Shows what protection costs in a normal year, including that on a choppy stock (TSLA) the vault loses while holding gains.
| Basket | Vault median 1-year return (%) | Hold median 1-year return (%) |
|---|---|---|
| NVDA | 24.5 | 72.5 |
| NVDA+TSLA+QQQ | 16.8 | 53.3 |
| TSLA | −6.8 | 22.4 |
| QQQ | 8.3 | 26.2 |
| SPY | 4.3 | 16.6 |
- Highlight TSLA in `--warning` with the annotation `BUYS HIGH, SELLS LOW IN CHOPPY MARKETS` and the CONTEXT.md line: vault −6.8% median year vs holding +22%.
- Axis from −20% to +80%. Footer standard. This chart is the honesty proof, keep it as prominent as C1 in the deck.

### C5 Chart: the m dial (upside vs worst case)

- **Where used:** Deck, 'why m=4' explainer, app 'how it works' page
- **Method:** Data chart
- **Priority:** P2
- **Size:** 960×540
- **Status:** To do

One basket (NVDA+TSLA+QQQ), x = multiplier m (2,3,4,5,6,8). Two lines: upside kept (accent) and worst window (ink). A vertical accent marker at m=4.
| m | Upside kept (%) | Worst window (%) | Breach rate (%) |
|---|---|---|---|
| 2 | 20.9 | −8.4 | 0.0 |
| 3 | 29.7 | −9.6 | 0.0 |
| 4 | 41.9 | −9.9 | 0.0 |
| 5 | 51.5 | −10.0 | 0.0 |
| 6 | 57.9 | −10.0 | 0.0 |
| 8 | 68.0 | −10.0 | 0.0 |
- Shows the trade-off: more m keeps more upside but eventually risks a breach. Do NOT use it to argue for m>4; our setting stays 4 (CONTEXT.md).

### C6 Chart: rebalance cost by token

- **Where used:** Landing 'real costs' strip, deck, submission, demo video
- **Method:** Data chart
- **Priority:** P1
- **Size:** 960×420 + a table
- **Status:** To do

Horizontal bars, round-trip cost in basis points at $10k, sorted ascending: QQQB 0.7, NVDAB 5.9, SPCXB 6.0, SPYB 6.6, TSLAB 46. Next to the bars show the full table:
| Token | $1k (bps) | $10k (bps) | $50k (bps) |
|---|---|---|---|
| QQQB | ~0 | 0.7 | no quote |
| NVDAB | 2.8 | 5.9 | 10.1 |
| SPCXB | 3.1 | 6.0 | 7.7 |
| SPYB | 1.1 | 6.6 | 13.6 |
| TSLAB | 18 | 46 | 27 (noisy) |
- Under the chart: `LIVE AGGREGATOR QUOTES, THU 2026-10-02 12:06 UTC (US PRE-MARKET). 1 bp = 0.01%. WEEKEND AND CRASH-TIME COSTS NOT YET MEASURED.`
- TSLAB bar in `--warning` with `BORDERLINE LIQUIDITY, NOT IN V1`. Do not show CRCLB, MUB, or Ondo tokens (not usable). If the weekend measurement lands, add a second series and update the date line.

### C7 Chart: worst overnight/weekend gaps vs the 25% limit

- **Where used:** Landing 'what can go wrong', deck, pitch
- **Method:** Data chart
- **Priority:** P1
- **Size:** 960×420
- **Status:** To do

Horizontal bars of the worst single gap down since 2018, with a vertical line at −25% labelled `FLOOR HOLDS UP TO HERE` (the landing copy's wording; add `m=4: ONE GAP OF 25%` in smaller text), drawn in `--warning`. All bars end well short of the line, which is the point; the caption keeps it honest: `A GAP LARGER THAN 25% BEFORE THE VAULT CAN REBALANCE COULD BREAK THE FLOOR.`
| Ticker | Worst overnight/weekend gap since 2018 (%) |
|---|---|
| NVDA | −19.3 |
| TSLA | −14.9 |
| AAPL | −13.0 |
| SPCX* | −10.3 |
| QQQ | −9.5 |
- `*` SPCX: only 76 days of history (listed June 2026). NVDA's gap was 2018-11-16 (CSV script output). Landing-copy caption under it: `Backtest on past prices. It does not predict the future.` Standard source line, no 93-window footer needed: `WORST OPEN-VS-PREVIOUS-CLOSE MOVE, SINGLE STOCKS, 2018 TO 2026-10. SOURCE: gap_backtest.py.`

### C8 Chart: the weekend strip

- **Where used:** Landing, app (market state), deck
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 960×200 / full width
- **Status:** To do

A ruler Fri 16:00 → Mon 09:30 (US market hours, label `US MARKET`) with a hatched block (`--warning`, 45°) over the weekend labelled `NO REBALANCING: WEEKEND PRICES ARE NOISE VS MONDAY. THE FULL GAP IS ASSUMED IN THE RISK MATHS.` (CONTEXT.md). Two ticks mark the Friday close and Monday open with the words `LAST REBALANCE` and `NEXT REBALANCE`. No numbers beyond those. In the app this bar is live and driven by the RWA Data API `statusInfo` (market state).

### D1 Architecture diagram for judges

- **Where used:** Submission, deck, README, DX report
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** 1920×1080 SVG
- **Status:** Blocked: waits for docs/ARCHITECTURE.md

Draw only after `docs/ARCHITECTURE.md` and `docs/CONTRACTS.md` exist so names match. Skeleton (use the grid, boxes snapped to 60 px, same box style as `svg/agent-flow.svg`):
- Left column `USERS`: web app (wallet), any AI agent via MCP.
- Middle `FLOOR`: Floor MCP server, Floor API, Vault contract(s) on BSC (CPPI, m = 4, floor F, one-year term), keeper.
- Right `BINANCE / BSC`: Binance Web3 API (RWA Data API, Trading API quote → swap, Transaction API simulate/broadcast), Agentic Wallet (keeper), b402 facilitator, PancakeSwap / BSC tokenized-equity liquidity, bStock tokens, USDT.
- Arrows labelled with the real call names: `/api/v1/dex/aggregator/quote` → `/swap`, `/pre-transaction/simulate`, `/broadcast-transaction`, `contract-call preview → execute`, `rebalance()`.
- Mark the trust boundary with a dashed accent frame: `USER FUNDS LIVE ONLY IN THE VAULT CONTRACT`.
- Judges' scoring lens in the footer: `SPOT ONLY · BSC MAINNET · bSTOCKS CENTRAL`.
- Also include a small "unknowns" note only if the DX report wants it: `UNTESTED: confirmation prompts and risk-engine blocks on unattended keeper calls` (CONTEXT.md). Fallback path to be drawn when the architecture agent decides it.

### D2 Agent flow: agent → MCP → b402 → keeper

- **Where used:** Landing 'built for agents', submission (Agentic Wallet + BNB Agent Studio prizes), deck, video
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** 960×480 SVG
- **Status:** Drawn: svg/agent-flow.svg

Already drawn: `assets/svg/agent-flow.svg`. Six boxes in a 3×2 grid on the 48/96 px lattice (box 192×96, columns at x=48, 384, 720): YOUR AGENT, FLOOR MCP SERVER (tools: `quote_protection`, `deposit`, `withdraw`, `status`, `backtest`), b402 FACILITATOR, KEEPER (Binance Agentic Wallet, `baw contract-call` → `rebalance()`), FLOOR VAULT, PANCAKESWAP / BSC. Numbered steps 1 tool call, 2 HTTP 402, 3 signed payment (EIP-712), 4 settled.
- Web build: draw the arrows in order 1→2→3→4 then keeper→vault→venue, once, 240 ms each (BRAND.md §8 forbids looping). Reduced motion: static. The video version may play the same sequence on a loop.
- Facts to keep true: b402 pays for Floor's API calls and does not pay for LLM inference; user funds stay in the vault contract, not in the keeper wallet; there is no in-app AI model.
- Tool names must be updated if the MCP tool list changes.

### D3 Vault lifecycle / state diagram

- **Where used:** Docs, deck, DX report
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 960×420
- **Status:** To do

Left-to-right states in boxes: `DEPOSIT` → `ACTIVE (CPPI, m = 4)` → `TERM END (1 YEAR)` → `WITHDRAW / NEW TERM`. A side branch from ACTIVE: `VALUE REACHES FLOOR` → `CASH LOCK (HOLDS ONLY USDT UNTIL TERM END)` → joins TERM END. Annotate ACTIVE with a small loop arrow `REBALANCE: SELL ON FALLS, BUY BACK ON RISES (SPOT SWAPS ON BSC)` and a note `NO REBALANCING ON WEEKENDS`. Same box style as D2.

### D4 Rebalance loop (CPPI formula card)

- **Where used:** Landing (small), deck, app info panel
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 480×320
- **Status:** To do

A formula card: `STOCK = min(4 × (V − F), V)` and `REST = V − STOCK → USDT`, V = vault value, F = floor. Below it a mini three-row example in mono with deliberately generic round numbers and the label `EXAMPLE, NOT A QUOTE`, e.g. deposit 100, floor 90, cushion 10, stock 40, USDT 60 (this is arithmetic from the rule, not market data). Second row: value 95, cushion 5, stock 20, USDT 75. Only numbers that follow arithmetically from V and F; never market data.

### A1 Quote preview chart (protection quote)

- **Where used:** App: floor picker / quote_protection result
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** Component, ≥ 560×320
- **Status:** To do

Live from the user's inputs, not from backtest data. Shows: deposit line (dashed), the chosen floor line (accent), the one-year term as the x axis, and the cushion bracket with the computed cushion in % of deposit and `STOCK AT START = 4 × CUSHION` (capped at 100%). As the user drags the floor slider, the floor line moves in 1 px-snapped steps and the readouts update (no easing delay). Under it `HOLDS UNLESS PRICES GAP MORE THAN 25% BEFORE THE VAULT CAN REBALANCE.` No projected returns or simulated curves.

### A2 Position status panel (value vs floor gauge)

- **Where used:** App dashboard
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** Component, 480×200
- **Status:** To do

A horizontal gauge on a ruler: floor tick (`--floor-line`, 2 px), deposit tick (dashed), current value marker (`--text`, 1.5 px, labelled `NOW`). The cushion is the accent-soft span between value and floor. Beneath: three mono stat cells `CUSHION %`, `STOCK EXPOSURE %`, `USDT %`, and a status chip `ACTIVE` or `CASH LOCK` (cash lock = `--negative` outline with the `cash-lock` icon, plus the words). All values are the user's live position data; render `—` while unknown, never placeholder numbers.

### A8 Simulated crash view (split)

- **Where used:** Demo video 0:45–1:10, app 'how it works' demo mode, deck
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** 1920×1080 for video; component ≥ 560×320
- **Status:** To do

DEMO_SCRIPT 0:45: a `SIMULATED CRASH` label, price dropping day by day, split view: stock value falling, USDT share rising, vault value flat near the floor line.
- Computed live from the CPPI rule (`stock = min(4 × (V − F), V)`) on a scripted price path with a visible `SIMULATED` badge (`--warning` border, mono caps) that is on screen in every frame. Never present it as a backtest and never use the NVDA real path here without labelling.
- Three synchronised panels on the lattice: price, vault value vs floor (accent-soft cushion), stock % vs USDT % (two stacked bars). A tick counter `DAY 07 / 30` and a small swap log row that matches the real swap transactions when recorded on mainnet.
- Draw-once rule does not apply to the demo mode: it plays on a timeline. Reduced motion: static end state with a replay button.

### A3 Empty states (3)

- **Where used:** App
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 3 × 320×200
- **Status:** To do

Blueprint line drawings, ink + one accent element, 1 caption line and one button.
1. No wallet connected: an open dashed rectangle (vault outline) with a "+" in the middle. Caption `CONNECT A WALLET TO START`.
2. No positions yet: the floor line over an empty grid, no value line. Caption `NO PROTECTED PORTFOLIO YET`.
3. No history yet: a ruler with no ticks filled. Caption `HISTORY APPEARS AFTER THE FIRST REBALANCE`.
Wording can be replaced by the marketing writer.

### A4 Loading + in-progress states

- **Where used:** App
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** Components
- **Status:** To do

- Skeleton cells: grid cells with a 1 px border and a faint static diagonal-hatch fill (45°, 8 px pitch). No grey blobs, no spinners, no shimmer (BRAND.md bans looping motion).
- Chart loading: the floor line is drawn immediately, the value line draws on as a dashed line while data loads.
- `REBALANCING…` state: a badge (`--accent` border, mono caps) and a static 1 px accent top rule on the position cell. No animation.
- Transaction stepper: `APPROVE → DEPOSIT → CONFIRMED` as three boxed steps joined by lines, active step has an accent outline. Everything here is already static.

### A5 Error / blocked / market-closed banners

- **Where used:** App
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** Component
- **Status:** To do

Full-width bordered strip with the `alert-triangle` icon in `--warning`, mono text. Variants: `MARKET CLOSED: NO REBALANCING UNTIL OPEN` (uses the weekend strip C8), `KEEPER NEEDS CONFIRMATION` (relevant to the untested Agentic Wallet confirmation behaviour), `QUOTE UNAVAILABLE FOR THIS TOKEN`. 404 page: a large `404` in mono over the grid with the floor line through its middle, caption `NOTHING HERE`.

### A6 App screenshots in a frame (submission gallery)

- **Where used:** Submission, README, deck
- **Method:** Real capture
- **Priority:** P1
- **Size:** 1920×1080, 3–5 images
- **Status:** Waits for the working app

Real screenshots of the deployed app only. Place each in a thin-bordered browser frame (no browser chrome from a real browser vendor) on the grid background with a mono caption `FIG. NN / SCREEN NAME`. Needs: floor picker + quote, deposit flow, position status, MCP call from an agent (terminal capture, see A7). Don't mock numbers; use a test position or testnet-free mainnet small position only if the team lead approves.

### A7 Terminal / agent session capture

- **Where used:** Demo video, submission, DX report
- **Method:** Real capture
- **Priority:** P0
- **Size:** 1920×1080 screen recording; also a still
- **Status:** Waits for working MCP + keeper

A real recording of an agent calling `quote_protection`, `deposit`, `status`, with the b402 payment shown, and of the keeper's `contract-call preview → execute`. Terminal theme set to the brand colours (background, ink, accent). Font = brand mono at 18 px+. Hide the account address and any secrets. This is the DX report's evidence: real, not generated.

### V1 Demo-video title cards (intro, section, outro)

- **Where used:** Demo video
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** 1920×1080, 30/60 fps; PNG + short MP4/WebM
- **Status:** To do

Build in HTML/Remotion or Figma, export as PNG/ProRes. Grid background full-bleed, crosshairs, `FIG.`-style labels.
- Intro (3 s): the floor line draws across the grid, the value path draws and turns up above it (use the illustration geometry, labelled illustration, or the C0 real path), then the wordmark and tagline (marketing writer's line: `Your stocks, with a floor.` per DEMO_SCRIPT 1:52; headline `Set the lowest your portfolio can go.`).
- Section cards (2 s each): `01 / THE PROBLEM`, `02 / HOW IT WORKS`, `03 / LIVE DEMO`, `04 / THE NUMBERS`, `05 / BUILT FOR AGENTS`. Big mono numeral on a grid cell, title beside it.
- Outro (4 s): wordmark, repo URL, `BNB HACK: TOKENIZED STOCKS`, `SPOT ONLY · BSC MAINNET`, and the line `A FLOOR THAT HOLDS UNLESS PRICES GAP MORE THAN 25% BEFORE THE VAULT CAN REBALANCE.`
- Safe area 5% inset. Keep text ≥ 36 px on 1080p.

### V2 Lower thirds + callouts

- **Where used:** Demo video
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 1920×1080 transparent PNG / alpha WebM
- **Status:** To do

- Lower third: a boxed strip at the left of the lower grid row (x = 120 px, y = 900 px), crosshair on its corners, two lines: bold mono title, muted mono subtitle. Slide in 0.3 s stepped; hold; out.
- Callouts: a leader line from a UI element to a small boxed label with a "+" at the anchor point. Used for `FLOOR`, `CUSHION`, `KEEPER CALLS rebalance()`, `b402 PAYMENT`.
- Number card (C1/C6 numbers): one big mono number, one caption, e.g. `93 / 93` + `1-YEAR WINDOWS WHERE THE FLOOR HELD`.

### V3 Chart animations for the video

- **Where used:** Demo video, hero
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** 1920×1080, 10–15 s each
- **Status:** To do

Re-use the chart components (C1, C2, C6, C7) with a timeline prop: bars grow in 0.8 s, labels fade in after. Record with a headless browser at 60 fps or build as Remotion compositions. The floor-bounce (L1) at 12 s, looping, for the intro card. Keep the honesty footer visible in every frame that shows a backtest number.

### V5 Demo-video number cards (trade-off cards)

- **Where used:** Demo video 1:35–1:52
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** 1920×1080, 3 cards
- **Status:** To do

From DEMO_SCRIPT: three cards in sequence. Card 1 `You keep about 42% of the gain in up years.` Card 2 `93 of 93 windows held.` Card 3 `Holds unless prices gap more than 25% before the vault can rebalance.` Each: big mono number or the sentence in a lattice cell, `FIG.`-style label, honesty footer from section 0 in small type, 5 s each, 240 ms fade-up. Card 2 shows `93 / 93` large.

### V4 Pitch deck master + slides

- **Where used:** Submission pitch, Q&A
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 1920×1080, ~10 slides
- **Status:** To do

One master: grid background, 60 px cells, `FIG.` label slot top-left, slide number bottom-right in a boxed cell. Slide list: 1 title, 2 problem (non-crypto users won't hold stock tokens with no protection), 3 the floor (L2), 4 how it works (L3), 5 numbers (C1+C2), 6 cost of honesty (C4+C7), 7 costs (C6), 8 built for agents (D2), 9 architecture (D1), 10 what's next / unknowns. Use the slides artifact type or Figma; export PDF.

### S1 Open Graph / link-preview image

- **Where used:** Website meta tags, link unfurls (Discord, Telegram, X)
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** 1200×630 (1.91:1) PNG, ≤ 300 KB
- **Status:** To do

Generate with Next.js `opengraph-image.tsx` (next/og / satori) so text is real and crisp. Layout on the grid: wordmark top-left, headline in the left 2/3 (`Set the lowest your portfolio can go.` — the hero headline in LANDING_COPY.md), the floor-bounce line drawing (`svg/floor-cushion-explainer.svg` geometry, static, with its illustration label) in the right 1/3 over a grid, footer strip `SPOT ONLY · BSC · bSTOCKS` in mono. Backdrop: `.lattice` drawn in code; G1 only if the brand lead wants a material feel. Use the same file for Twitter/X `summary_large_image`.

### S2 X / Telegram number cards (4)

- **Where used:** Launch posts, hackathon thread
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 1200×675 (16:9) PNG ×4
- **Status:** To do

Four static cards from the same template: big mono number + caption + footer. 1) `93 / 93` — 1-year windows where the floor held (m = 4). 2) `−8.6% vs −17%` — basket in bad years, vault vs holding. 3) `~42%` — of the basket's upside kept at m=4. 4) `SPOT ONLY` — no perps, no options, no leverage, no borrowing. Every card has the one-line caveat from the honesty footer. Export from React via next/og or a Figma template.

### S3 Submission cover image (text in code, backdrop from G3)

- **Where used:** Hackathon submission page, social
- **Method:** Code/SVG
- **Priority:** P0
- **Size:** 1920×1080 (16:9); also 1200×630 and 3:2 crops
- **Status:** To do (prompts G3, G4 as backdrop)

Default (no AI): `--bg`, the lattice, four corner crosshairs, the floor line across the full width, wordmark, headline `Set the lowest your portfolio can go.`, `BNB HACK: TOKENIZED STOCKS`, `bSTOCKS · BSC MAINNET · SPOT ONLY`. All in code/Figma with Geist + Geist Mono. Optional: G3 (flat material backdrop) behind the lattice at 100% only if it passes the brand check. The hackathon platform's exact cover-image size is unverified: ask for the field's dimensions before final export. Export 1920×1080, 1200×630, and a 3:2 crop.

### S4 X header + README / GitHub social preview

- **Where used:** X profile, GitHub repo
- **Method:** Code/SVG
- **Priority:** P2
- **Size:** 1500×500 (3:1); 1280×640 (2:1)
- **Status:** To do

Wordmark + one-line description on the grid; G3 cropped as the backdrop for the X header. GitHub social preview 1280×640, safe margin 40 px.

### S5 MCP / Skill listing card

- **Where used:** BNB Agent Studio and Wallet Skills side-prize entries, README, skill hub listing
- **Method:** Code/SVG
- **Priority:** P1
- **Size:** 1200×630
- **Status:** To do

A tool-catalogue card: title `FLOOR MCP SERVER`, tools listed in mono (`quote_protection`, `deposit`, `withdraw`, `status`, `backtest`) each in a grid cell with a one-line description (from the MCP server's own tool descriptions, once they exist), footer `PAY PER CALL WITH b402 · BSC`. Skip tool names that do not exist at submission time.

### S6 DX report figures

- **Where used:** Developer Experience Report
- **Method:** Real capture
- **Priority:** P1
- **Size:** As needed
- **Status:** Capture during the build

The report must be real, not AI-written. Visuals are your own screenshots and logs: terminal output of real errors (e.g. `351803 AGENT_DEV_MODE_RISK_BLOCKED` if it occurs), the Developer Mode toggle, quote JSON, a simple timeline of what blocked you. Frame them like A6. Do not generate or retouch any of these. Cropping and redacting addresses/secrets only.

### G1 AI texture: drafting paper (light)

- **Where used:** Optional backdrop: hero, cover, deck cover, OG
- **Method:** AI image
- **Priority:** P2
- **Size:** 3840×2160, 16:9
- **Status:** Optional: prompt written

See PROMPTS.md, prompt G1.

### G2 AI texture: drafting film (dark)

- **Where used:** Optional backdrop, dark mode
- **Method:** AI image
- **Priority:** P2
- **Size:** 3840×2160, 16:9
- **Status:** Optional: prompt written

See PROMPTS.md, prompt G2.

### G3 AI backdrop: flat wall with one ruled floor line

- **Where used:** Optional submission cover backdrop, X header crop, deck divider
- **Method:** AI image
- **Priority:** P2
- **Size:** 2688×1512 (16:9), crops to 3:1
- **Status:** Optional: prompt written

See PROMPTS.md, prompt G3.

### G4 AI backdrop: flat edge-on stack of layers (the cushion)

- **Where used:** Optional blog/thread thumbnail, deck divider
- **Method:** AI image
- **Priority:** P2
- **Size:** 2048×2048 (1:1), crops to 1.91:1
- **Status:** Optional: prompt written

See PROMPTS.md, prompt G4.

## Example SVGs (drawn in this folder)

- `assets/svg/floor-cushion-explainer.svg` (L2, and the fallback for L1)
- `assets/svg/agent-flow.svg` (D2)
- `assets/svg/bad-years-chart.svg` (C1, generated from the CSV)

All three use the brand token values with `prefers-color-scheme` dark mode and open correctly in browsers, Figma and Inkscape.
