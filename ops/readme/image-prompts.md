# Floor README image brief

For the image-generation agent. This file is self-contained. Produce every image below and save it under `docs/assets/readme/` in the repo root with the exact filename given. The root `README.md` references these filenames. Do not rename. Do not write any other file.

Floor is a spot-only protection vault for tokenized stocks on BNB Chain. A user sets a "floor" under a stock position. The vault sells stock as prices fall and buys it back as prices rise, using the CPPI rule. The README must look institutional, calm and precise.

## 0. How to work

- Charts and diagrams that carry data or exact labels (items 6 to 14) should be produced with a plotting or vector tool (matplotlib, SVG, D3, Figma export), NOT a raster image model, because text and numbers must be exact. Use the image-model prompts only as a layout and mood description for that tool, or as a fallback.
- Decorative images (items 3 and 4: hero banner and social card) may use an image model. Keep all words out of the raster and overlay text afterwards in a vector tool using the allowed strings.
- The logo (items 1 and 2) already exists as vector geometry in `apps/web/lib/logo.ts` (constants `MARK`, `WORDMARK`, `LOCKUP`) and `apps/web/app/icon.svg`. Export those as PNG. Do not redraw the logo with a model.
- Every themed image needs two files: `<name>-dark.png` and `<name>-light.png`. The README uses a `<picture>` element to switch.
- Output PNG, sRGB, no transparency unless stated, export at the given pixel size (the README scales down). Opaque background matching the theme `--bg`.

## Style guide

Source of truth: `apps/web/app/tokens.css`, `apps/web/app/globals.css`, `apps/web/lib/brand.ts`.

Mood: dark, calm, precise, institutional. A blueprint or ledger feel: hairline 1 px grid lines, small "+" crosshair marks where lines cross, square corners (radius 0, at most 2 px on small badges), lots of empty space. Think engineering drawing, not marketing.

Colour tokens (use exactly):

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| bg | `#FAFAF8` | `#0A0B0D` | image background |
| surface | `#FFFFFF` | `#111215` | cards, boxes |
| surface-sunken | `#F3F3F0` | `#0D0E10` | inset panels |
| grid | `#E4E5E0` | `#1C1E21` | hairline grid |
| grid-strong | `#CFD0CA` | `#2C2E31` | box borders |
| crosshair | `#8C8E86` | `#6E7068` | "+" marks |
| text | `#10110F` | `#F2F2EE` | primary text |
| text-2 | `#464843` | `#B4B6AE` | secondary text |
| text-muted | `#686A63` | `#8D9088` | labels |
| accent / floor line | `#2440E0` | `#7C93FF` | the floor line, key highlights, one accent per image |
| accent-soft | `#E9ECFC` | `#151A33` | cushion fill |
| positive | `#0B7544` | `#3DD68C` | gains, "kept" |
| negative | `#B8312A` | `#FF7469` | losses, breaches |
| warning | `#8F5600` | `#F2B84B` | caution |

Fonts: Geist (sans) for text, Geist Mono for numbers, labels, addresses. Labels are mono, uppercase, 0.08em letter spacing, 12 px at 1x. Numbers use tabular figures and a slashed zero.

Visual motif: the **floor line** is a flat, solid accent-blue horizontal line. The **value line** is a thin text-colour curve that rests above it and never crosses it. The shaded gap between them is the **cushion** (accent-soft fill). Reuse this motif across images.

Do not use: neon glow, gradients with purple-pink hype, coins, rockets, bulls, bears, lightning, chains, padlocks as clichés, 3D, glassmorphism, stock-photo people, candlestick wallpaper. Do not draw Binance or BNB logos, or any third-party logos. The text "BNB Chain" and "PancakeSwap" may appear as plain neutral text labels only. No fake audit seals. No claims such as "guaranteed", "risk-free", "principal protected", "max loss". Do not invent numbers: use only the numbers in this file.

Allowed words are listed per image. Any other text is forbidden. Check every word for spelling after export.

---

## 1. Logo mark (square)

- Priority: P1
- Files: `docs/assets/readme/logo-mark-512-dark.png`, `docs/assets/readme/logo-mark-512-light.png`
- Size: 512 x 512 px, ratio 1:1, variants: dark and light.
- Source: render `MARK` from `apps/web/lib/logo.ts` (viewBox `0 0 48 21`): a value line resting above a solid floor line, with a cushion fill and a small tick at the left end. Centre it with about 25% padding on a solid `bg` square. Value line in `text`, floor in `accent`, cushion in `accent-soft`.
- Prompt (fallback only, if vector export is impossible): "Minimal flat logo mark on a solid near-black square. A thin off-white wavy line that dips and recovers, resting just above a straight horizontal electric-blue bar, never touching it. The narrow strip between the line and the bar is filled with a faint blue tint. Square corners, perfectly centred, generous padding, crisp vector edges, no gradient, no shadow, no text."
- Negative prompt: gradient, glow, 3D, shadow, coin, shield, padlock, letters, text, border radius, texture, multiple colours beyond off-white and blue.
- On-image text: none.
- Alt text: "Floor logo mark: a value line resting above a solid floor line".
- README use: not embedded directly. Used as the favicon and avatar candidate. Referenced in the wordmark lockup.

## 2. Logo wordmark (horizontal lockup)

- Priority: P0
- Files: `docs/assets/readme/logo-wordmark-dark.png`, `docs/assets/readme/logo-wordmark-light.png`
- Size: 960 x 240 px, ratio 4:1, variants: dark and light. Opaque `bg`.
- Source: render `LOCKUP` from `apps/web/lib/logo.ts` (viewBox `0 0 179 36`): mark on the left, the word "Floor" in Geist Bold on the right with its baseline on the floor line's bottom edge. Scale to about 60% of the image height and centre.
- Prompt (fallback only): "Horizontal logo lockup on a flat background: a small mark of a thin wavy line resting above a solid blue bar, followed by the single word Floor in a clean geometric bold sans-serif (Geist), baseline aligned to the bottom of the blue bar. Flat vector, precise, wide empty margins, no effects."
- Negative prompt: gradient, glow, 3D, shadow, extra words, tagline, symbol other than the mark, decorative flourish, italic, outline text.
- On-image text: "Floor" only.
- Alt text: "Floor logo: a value line resting above a solid floor line, next to the word Floor".
- README use: centred at the top of `README.md`, width 320.

## 3. Hero banner

- Priority: P0
- Files: `docs/assets/readme/hero-banner-dark.png`, `docs/assets/readme/hero-banner-light.png`
- Size: 1600 x 500 px, ratio 3.2:1, variants: dark and light.
- Prompt: "Wide editorial banner on a near-black blueprint grid with faint 1 px lines and tiny plus-shaped crosshair marks at line intersections. A thin off-white price curve starts at the left, climbs, falls sharply in the middle, then recovers toward the right, always staying above one perfectly straight solid periwinkle-blue horizontal line that spans the whole width. The narrow band between curve and line is filled with a faint translucent blue tint. Below the curve, a precise staircase of thin step lines rises and falls in sync with the curve, like an exposure indicator. Calm, institutional, engineering-drawing feel, lots of negative space on the left third for text overlay. No glow, no gradients beyond the flat tint, flat vector look."
- Negative prompt: neon, glow, 3D, coins, rockets, bulls, bears, candlesticks, logos, people, hands, buildings, text, numbers, watermark, lens flare, stock photo, purple-pink gradient.
- On-image text (overlay in a vector tool, left third, Geist, text colour): headline "Set a floor under your stocks." and a mono uppercase label "SPOT ONLY / BNB CHAIN". Nothing else.
- Alt text: "Banner: a price path falling and recovering above a fixed blue floor line, with the exposure staircase below it".
- README use: full-width banner under the badge row.

## 4. Social card

- Priority: P1
- File: `docs/assets/readme/social-card.png` (dark only)
- Size: 1200 x 630 px, ratio 1.91:1, variants: dark only.
- Prompt: "Dark social preview card with a faint blueprint grid and small plus-shaped crosshair marks. Left half: empty space for text. Right half: a thin off-white wavy line resting just above a straight solid periwinkle-blue horizontal bar, with a faint blue tint between them, drawn large and precisely. Flat vector look, calm and institutional, wide margins, square corners."
- Negative prompt: neon, glow, 3D, coins, rockets, people, logos of third parties, extra text, gradients, shadows, watermark.
- On-image text (overlay): "Floor" (wordmark, use item 2 geometry), "Set a floor under your stocks." and a mono uppercase label "SPOT ONLY / BNB CHAIN". No other words.
- Alt text: "Floor social card: the Floor wordmark and tagline beside a value line above a floor line".
- README use: not embedded. Upload in the GitHub repository settings as the social preview.

## 5. Architecture overview

- Priority: P0
- Files: `docs/assets/readme/architecture-overview-dark.png`, `docs/assets/readme/architecture-overview-light.png`
- Size: 1600 x 900 px, ratio 16:9, variants: dark and light.
- Draw as a vector diagram on the blueprint grid. Layout left to right in four columns, boxes with 1 px `grid-strong` borders on `surface`, square corners, mono uppercase labels, arrows 1 px `text-2` with small arrowheads. One accent-coloured element only: the arrow labelled "unsigned tx, user signs".
  - Column 1 (users): "USER WALLET", "AGENT (MCP, API, SKILL)".
  - Column 2 (core): "FLOORFACTORY" on top; below it a stack of three small boxes "FLOORVAULT CLONE 1", "FLOORVAULT CLONE 2", "FLOORVAULT CLONE N" with a caption "one vault per position"; "FLOORLENS" beside the stack.
  - Column 3 (actors): "KEEPER (EOA)" and "ANYONE (PUBLIC REBALANCE)" above the vaults, arrows into the vault stack.
  - Column 4 (venue): "PANCAKESWAP V3 ROUTER" and "USDT / BSTOCK POOLS" (with sub-label "10-MIN TWAP").
- Arrows: wallet to factory "createPosition"; factory to vault "clone"; keeper to vault "rebalance, one swap"; anyone to vault "rebalancePublic"; vault to router "swap"; vault to pools "TWAP read"; agent to lens "read"; agent to wallet "unsigned tx, user signs"; wallet to vault "exitInKind".
- Prompt (for an image-model layout fallback): "Clean technical architecture diagram on a dark blueprint grid, four columns of thin-bordered square boxes connected by thin arrows, mono uppercase labels, one electric-blue accent arrow, generous spacing, flat vector, no icons, no gradients."
- Negative prompt: icons, logos, 3D, shadows, clip-art, gradients, rounded blobs, cartoon, extra boxes, misspelled text.
- Allowed text: exactly the labels above. No others.
- Alt text: "Architecture overview: wallet and agents on the left, factory and per-position vault clones in the centre, keeper and public caller above, PancakeSwap v3 pools on the right".
- README use: after the Mermaid architecture diagram, width 100%.

## 6. CPPI mechanism

- Priority: P0
- Files: `docs/assets/readme/cppi-mechanism-dark.png`, `docs/assets/readme/cppi-mechanism-light.png`
- Size: 1600 x 900 px, ratio 16:9, variants: dark and light.
- Two stacked panels sharing one x axis (time, no tick labels).
  - Top panel "VALUE AND FLOOR": a thin `text`-colour value curve that falls from 100 to about 94, wobbles, then recovers toward 108; a flat solid accent line at 90 labelled "FLOOR"; the gap between curve and line shaded `accent-soft` and labelled "CUSHION". Mark three points on the curve with small plus marks.
  - Bottom panel "STOCK HELD": a step line (square steps) that moves opposite in size to the cushion: steps down as the cushion shrinks, steps up as it grows. Label the first step "4 x CUSHION" and the cap line "NEVER MORE THAN VALUE".
  - Footer in mono, left aligned: "STOCK = MIN(4 x (VALUE - FLOOR), VALUE)".
- Use the worked example numbers only if numbers are shown: deposit 10,000, floor 9,000, start stock 4,000 and USDT 6,000. Preferred: show no numbers except those.
- Prompt (fallback): "Two-panel technical chart on a dark blueprint grid. Top: a thin off-white price curve dipping and recovering above a straight solid blue horizontal floor line, with the gap between them tinted faint blue. Bottom: a square-step staircase line that steps down as the gap narrows and up as it widens. Thin hairline axes, no tick labels, mono uppercase captions, flat vector, calm, precise."
- Negative prompt: candlesticks, glow, 3D, coins, arrows pointing up in green, gradients, extra labels, shadows, watermark.
- Allowed text: "VALUE AND FLOOR", "FLOOR", "CUSHION", "STOCK HELD", "4 x CUSHION", "NEVER MORE THAN VALUE", "STOCK = MIN(4 x (VALUE - FLOOR), VALUE)", "TIME", and the example numbers 10,000 / 9,000 / 4,000 / 6,000 if used.
- Alt text: "Diagram: a stock price path above a fixed floor line, with the vault's stock exposure stepping down as the cushion shrinks and up as it grows".
- README use: in "How it works", width 860.

## 7. Trade-off chart (floor level versus upside kept)

- Priority: P0
- Files: `docs/assets/readme/tradeoff-chart-dark.png`, `docs/assets/readme/tradeoff-chart-light.png`
- Size: 1400 x 800 px, ratio 7:4, variants: dark and light.
- Type: plot with a script (matplotlib or similar), not a model. Combo chart: bars for share of gain kept (primary y axis, percent), and a line with markers for clear-breach rate (secondary y axis, percent). X axis: floor level, categories in this order: 80%, 85%, 90%, 95%.
- Data (m = 4, pooled equities, 6 bps one way, daily rebalance, 1,581 one-year windows; source `apps/web/app/docs/evidence/page.tsx`, "dial" table, column "m = 4 (ours)"; the "kept" values are approximate, keep the leading tilde in labels):

```csv
floor_pct,share_of_gain_kept_pct,clear_breach_rate_pct
80,72,0.5
85,59,0.5
90,42,0.4
95,23,0.3
```

- Styling: bars `accent`, with the 90% bar emphasised (full accent, others at 55% opacity); breach line `negative` with round markers; value labels above bars in mono, e.g. "~72%", "~59%", "~42%", "~23%"; breach labels "0.5%", "0.5%", "0.4%", "0.3%". Primary axis 0 to 100, secondary axis 0 to 1.0. Hairline grid only on the primary axis.
- Footer caption in muted mono: "m = 4, 6 BPS ONE WAY. PAST DATA, NOT A PREDICTION."
- Prompt (fallback only): "Clean dark-theme combo chart with four square-edged blue bars descending left to right and a thin red line with round markers running low and nearly flat above a hairline grid, mono value labels, axis titles in small uppercase mono, no decoration, flat vector."
- Negative prompt: 3D bars, gradients, glow, shadows, extra series, pie chart, legend clutter, invented numbers, misspelled labels.
- Allowed text: "FLOOR LEVEL", "SHARE OF GAIN KEPT (%)", "CLEAR-BREACH RATE (%)", the category and value labels above, the footer caption, legend entries "GAIN KEPT" and "CLEAR BREACH".
- Alt text: "Chart: share of gain kept rises from about 23 percent at a 95 percent floor to about 72 percent at an 80 percent floor, with the clear-breach rate staying between 0.3 and 0.5 percent".
- README use: in "How it works", under the trade-off table, width 760.

## 8. Backtest breach-rate bar chart

- Priority: P0
- Files: `docs/assets/readme/backtest-breach-chart-dark.png`, `docs/assets/readme/backtest-breach-chart-light.png`
- Size: 1400 x 800 px, ratio 7:4, variants: dark and light.
- Type: plot with a script. Vertical bars, one per term, with 95% confidence-interval whiskers. Y axis: percent of windows that ended more than 1 point below a 90% floor, 0 to 1.0. Highlight the 1-year bar in `accent`; the others in `text-2` at 60% opacity. Value label above each whisker in mono.
- Data (source `research/m_study2/results/tables.md`, table T1, floor 90%, non-overlapping windows over 38 series, 1928 to 2026):

```json
[
  {"term": "1 week",   "rate_pct": 0.02, "ci_low": 0.01, "ci_high": 0.04},
  {"term": "2 weeks",  "rate_pct": 0.04, "ci_low": 0.02, "ci_high": 0.06},
  {"term": "1 month",  "rate_pct": 0.09, "ci_low": 0.04, "ci_high": 0.15},
  {"term": "3 months", "rate_pct": 0.20, "ci_low": 0.08, "ci_high": 0.36},
  {"term": "6 months", "rate_pct": 0.25, "ci_low": 0.06, "ci_high": 0.50},
  {"term": "1 year",   "rate_pct": 0.44, "ci_low": 0.07, "ci_high": 0.93}
]
```

- Callout text (small, mono, top-left inside the plot): "1 YEAR: 7 OF 1,581 WINDOWS". Footer caption: "90% FLOOR, M = 4, 6 BPS ONE WAY. DAILY CLOSES, SURVIVORSHIP BIAS. PAST DATA, NOT A PREDICTION."
- Prompt (fallback only): "Dark-theme bar chart with six slim square-edged bars growing from left to right, thin whisker error bars, the last bar in electric blue and the rest in muted grey, mono labels, hairline grid, flat vector, no decoration."
- Negative prompt: 3D, gradients, glow, shadows, red alarm colours, rounded bars, extra bars, invented numbers, misspelled labels.
- Allowed text: "TERM", "WINDOWS ENDING MORE THAN 1 POINT BELOW A 90% FLOOR (%)", the six term labels, value labels "0.02%", "0.04%", "0.09%", "0.20%", "0.25%", "0.44%", the callout and footer above.
- Alt text: "Bar chart: share of windows ending more than 1 point below a 90 percent floor, rising from 0.02 percent for one week to 0.44 percent for one year".
- README use: in "Backtest evidence", width 760.

## 9. User flow

- Priority: P1
- Files: `docs/assets/readme/user-flow-dark.png`, `docs/assets/readme/user-flow-light.png`
- Size: 1600 x 700 px, ratio 16:7, variants: dark and light.
- Horizontal flow of six numbered boxes joined by thin arrows, with a fork at the end:
  1. "CHOOSE" (sub-label "basket, floor, term")
  2. "APPROVE USDT"
  3. "CREATE POSITION" (sub-label "your own vault")
  4. "KEEPER REBALANCES" (sub-label "MON TO FRI, 15:30 TO 19:30 UTC")
  5a. "EXIT IN KIND" (sub-label "any time")
  5b. "CLOSE TO USDT" (sub-label "request, sell, close")
- The fork after box 4 splits into 5a and 5b. Box 3 gets the one accent border. Step numbers in mono.
- Prompt (fallback): "Horizontal process diagram on a dark blueprint grid: four square-bordered boxes in a row joined by thin arrows, then a fork into two stacked boxes, mono uppercase labels, one blue accent border, flat vector, spacious."
- Negative prompt: icons, people, wallets with logos, 3D, gradients, glow, cartoon, extra boxes.
- Allowed text: exactly the labels above.
- Alt text: "User flow: choose basket and floor, approve USDT, create position, keeper rebalances in the market window, exit in kind or close to USDT".
- README use: after the Mermaid user flow, width 100%.

## 10. Agent and x402 payment flow

- Priority: P1
- Files: `docs/assets/readme/agent-x402-flow-dark.png`, `docs/assets/readme/agent-x402-flow-light.png`
- Size: 1600 x 800 px, ratio 2:1, variants: dark and light.
- Three vertical lanes (swimlane): "AGENT", "FLOOR MCP SERVER", "FACILITATOR (SELF OR B402)", plus a thin bottom lane "BNB CHAIN". Numbered arrows top to bottom:
  1. Agent to server: "get_floor_info (free)"
  2. Agent to server: "quote_protection (paid)"
  3. Server to agent: "402 PAYMENT REQUIRED"
  4. Agent (self-arrow): "WALLET SIGNS"
  5. Agent to server: "RETRY WITH PAYMENT"
  6. Server to facilitator: "VERIFY, SETTLE"
  7. Server to agent: "RESULT"
  8. Agent to server: "build_create_position_tx (free)"
  9. Server to agent: "UNSIGNED TX" (accent colour)
  10. Agent to chain: "USER SIGNS AND SENDS"
- Footer caption: "FLOOR NEVER SIGNS. FLOOR NEVER HOLDS KEYS."
- Prompt (fallback): "Swimlane sequence diagram on a dark blueprint grid with four vertical lanes, numbered horizontal arrows between lanes, mono uppercase labels, one electric-blue arrow, flat vector, spacious, precise."
- Negative prompt: logos of Binance or BNB, coin icons, robots, 3D, gradients, glow, extra lanes, misspelled words.
- Allowed text: lane titles and arrow labels above, footer caption. No other brand marks.
- Alt text: "Agent flow: free tools, paid tool returns payment required, wallet signs, retry, verify and settle, unsigned transaction returned for the user to sign".
- README use: in the agents section, width 100%.

## 11. Security layers

- Priority: P1
- Files: `docs/assets/readme/security-layers-dark.png`, `docs/assets/readme/security-layers-light.png`
- Size: 1400 x 900 px, ratio 14:9, variants: dark and light.
- Concentric square-cornered rectangles, eight nested layers from outside in, with a small box "VAULT" at the centre. Layer labels in mono along the top-left of each ring, outermost first:
  1. "LAUNCH CAPS: 1,000 / 5,000 USDT"
  2. "ROUTER ALLOWLIST: DIRECT PANCAKE V3 ONLY"
  3. "TRADING WINDOW: MON TO FRI, 15:30 TO 19:30 UTC"
  4. "RATE AND SIZE LIMITS"
  5. "SWAPGUARD: BALANCE CHECKS, MIN OUT"
  6. "ON-CHAIN PRICE: 10-MIN TWAP"
  7. "ISOLATION: ONE VAULT PER POSITION"
  8. "EXIT: EXITINKIND ALWAYS OPEN"
  Innermost label: "VAULT". Thin 1 px borders, alternating `surface` and `surface-sunken` fills, only the exit layer (8) bordered in `accent`. Footer caption in muted mono: "LAYERS REDUCE RISK. THEY DO NOT REMOVE IT."
- Prompt (fallback): "Concentric nested square-cornered rectangles on a dark blueprint grid, eight thin-bordered layers around a small central box, mono uppercase labels at the top-left of each layer, the innermost layer border in electric blue, flat vector, calm, precise."
- Negative prompt: shield icon, padlock, castle, 3D, gradients, glow, rounded blobs, extra labels, 'secure' or 'safe' badges, misspelled words.
- Allowed text: exactly the labels above and the footer. Do not write the words "secure", "safe", "audited" or "guaranteed".
- Alt text: "Layered security diagram: price source, swap guard, limits, trading window, router allowlist, isolation, exit in kind and launch caps around a vault".
- README use: in "Security model and reviews", width 760.

## 12. Keeper timeline (NYSE window in UTC)

- Priority: P1
- Files: `docs/assets/readme/keeper-timeline-dark.png`, `docs/assets/readme/keeper-timeline-light.png`
- Size: 1600 x 500 px, ratio 3.2:1, variants: dark and light.
- Type: week grid. Seven rows (MON to SUN) by 24 columns (00 to 23 UTC hour ticks along the top). Cells are `surface-sunken` (closed). On MON to FRI, fill the span 15:30 to 19:30 UTC with `accent` (4 hours, starts half-way into the 15 column, ends half-way into the 19 column). SAT and SUN stay empty with the mono label "CLOSED". Under the grid, a legend: accent swatch "KEEPER MAY TRADE" and sunken swatch "NO TRADING". A caption: "HOLIDAYS CLOSED BY A GUARDIAN-SET TABLE THROUGH 2028-12-31. NO DAYLIGHT-SAVING LOGIC. ALL TIMES UTC."
- Data:

```csv
day,open_utc,close_utc
MON,15:30,19:30
TUE,15:30,19:30
WED,15:30,19:30
THU,15:30,19:30
FRI,15:30,19:30
SAT,,
SUN,,
```

- Prompt (fallback): "Week schedule grid on a dark blueprint background: seven thin rows, twenty-four hour columns, a short electric-blue block on each weekday in the afternoon, weekend rows empty, mono uppercase labels, flat vector, precise."
- Negative prompt: clocks, gears, robots, 3D, gradients, glow, calendar icons, extra colours, misspelled labels.
- Allowed text: day names, hour numbers 00 to 23, "15:30", "19:30", "CLOSED", the legend and caption above, "UTC".
- Alt text: "Weekly timeline in UTC: trading is allowed Monday to Friday between 15:30 and 19:30, closed otherwise and on holidays".
- README use: in the Keeper section, width 100%.

## 13. Vault state machine

- Priority: P1
- Files: `docs/assets/readme/vault-state-machine-dark.png`, `docs/assets/readme/vault-state-machine-light.png`
- Size: 1400 x 800 px, ratio 7:4, variants: dark and light.
- Boxes: "ACTIVE", "CASH LOCKED" (drawn as a sub-state box inside or adjacent to ACTIVE, labelled "flag inside ACTIVE"), "CLOSING", "CLOSED". Start dot into ACTIVE labelled "createPosition". Arrows:
  - ACTIVE to ACTIVE (loop): "rebalance (keeper or public)"
  - ACTIVE to CASH LOCKED: "value reaches floor, all guards pass"
  - ACTIVE to CLOSING: "requestClose"
  - CLOSING to CLOSED: "closeToUSDT (stock at dust)"
  - ACTIVE to CLOSED, CLOSING to CLOSED, CASH LOCKED to CLOSED: "exitInKind (always allowed)" drawn in `accent`
  - CASH LOCKED to CLOSED: "closeToUSDT"
- Footer caption: "AFTER CASH LOCK THE VAULT HOLDS USDT UNTIL THE TERM ENDS."
- Prompt (fallback): "State machine diagram on a dark blueprint grid: four square-bordered state boxes, a start dot, thin labelled arrows between them, one electric-blue arrow group, mono labels, flat vector, spacious."
- Negative prompt: icons, 3D, gradients, glow, rounded blobs, extra states, misspelled labels.
- Allowed text: exactly the labels above.
- Alt text: "Vault state machine: Active, Closing and Closed, with the cash-lock condition inside Active".
- README use: in "Security model and reviews", width 760.

## 14. Repository map

- Priority: P2
- Files: `docs/assets/readme/repo-map-dark.png`, `docs/assets/readme/repo-map-light.png`
- Size: 1600 x 900 px, ratio 16:9, variants: dark and light.
- Type: layered box diagram. Four rows, each box with a mono path label and a one-line sub-label. Arrows point from dependant to dependency.
  - Row "APPS": `apps/web` ("site and docs"), `apps/api` ("REST API"), `apps/mcp` ("MCP server"), `apps/keeper` ("rebalance keeper"), `apps/onebox` ("single-process runner").
  - Row "PACKAGES": `packages/sdk` ("CPPI maths"), `packages/x402` ("x402 and b402"), `packages/bw3` ("Binance Web3 client"), `packages/db` ("receipt storage").
  - Row "CHAIN": `packages/contracts` ("Foundry: Factory, Vault, Lens, libs").
  - Side column "SUPPORT": `local` ("Anvil fork stack"), `skills/floor` ("agent skill"), `docs` ("design and evidence"), `reviews` ("AI-assisted reviews"), `research` ("backtest studies"), `ops` ("deploy runbook").
- Arrows (simple, do not invent others): `apps/api` to `packages/sdk`; `apps/mcp` to `apps/api`; `apps/mcp` to `packages/x402`; `apps/keeper` to `packages/bw3`; `apps/api` to `packages/contracts` labelled "reads chain"; `apps/keeper` to `packages/contracts` labelled "rebalance".
- Prompt (fallback): "Layered repository map on a dark blueprint grid: rows of square-bordered boxes with mono path labels, thin dependency arrows pointing downward, a narrow side column of support folders, one electric-blue box for the contracts, flat vector, spacious."
- Negative prompt: folder icons, GitHub logo, 3D, gradients, glow, extra boxes, misspelled paths.
- Allowed text: exactly the paths and sub-labels above.
- Alt text: "Map of the monorepo: apps, packages, contracts, local stack, docs and ops, with arrows showing which package depends on which".
- README use: after the repository tree, width 100%.

---

## Checklist before handing back

- 14 specs, 27 files: logo mark (2), wordmark (2), hero (2), social card (1), then items 5 to 14 at 2 each (20). Total 27 PNGs.
- Every file name matches this brief exactly and sits in `docs/assets/readme/`.
- Every word on every image is from the allowed list. Spell-check the PNGs.
- Dark and light variants use the token table above, no other colours.
- Charts reproduce the data blocks exactly. No extra numbers.
