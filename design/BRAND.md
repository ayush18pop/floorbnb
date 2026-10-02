# Floor brand system v1

Date: 2026-10-02. Files: `tokens.css`, `preview.html`, `logo/*.svg`. Open `preview.html` first.
All numbers shown in designs are illustrative unless taken from CONTEXT.md.

## 1. Name

**Why Floor.** A floor is the lowest level you set and will not go below. That is the product in one word. It is short, plain and works as a verb ("floor it" is not a risk in a finance context, but keep copy literal).

### Name check (searched 2026-10-02)
Floor is crowded in crypto, mostly NFT:
- **Floor (floor.xyz), NFT portfolio app**, seed round $8M in 2022, acquired WGMI.io. Same name, same word, crypto consumer app. Closest clash. https://decrypt.co/119731/floor-acquires-wgmi-io-nft-portfolio-app-expansion , https://phantom.com/learn/crypto-101/floor-nft-app
- **FloorDAO, token FLOOR**, Olympus fork for NFT liquidity, listed on exchanges (KuCoin, CoinPaprika). A live ticker `FLOOR`. https://coinpaprika.com/coin/floor-floordao/ , https://www.kucoin.com/price/FLOOR
- **Floor Protocol** (freelunchcapital), NFT floor-price derivatives. https://www.quicknode.com/builders-guide/tools/floor-protocol-by-freelunchcapital
- "Floor price" is also the standard NFT term, so search results will be noisy.

Verdict: usable for a hackathon, weak as a long-term brand and hard to find in search or own a domain/ticker for. Domains, trademarks and social handles were **not checked** (unverified).

### Backups (same meaning: a base you set and rest on)
Search was a single quick pass per name, not a trademark search.
1. **Sill**. A sill is the lowest horizontal member of a frame. No crypto product found. Short, and fits the square-and-line mark unchanged. Best backup.
2. **Footing**. The base a structure rests on. No crypto clash found in search. Plainer, slightly longer.
3. **Plinth**. A base block. Clash: Plinth is the Cardano smart-contract language (https://developers.cardano.org/docs/smart-contracts/plinth) and a PLINTH token listing exists (https://www.livecoinwatch.com/price/Plinth-PLINTH). Avoid.

Rejected: Keel (Keel Finance on Solana, https://defillama.com/protocol/keel-finance), Ballast (Ballast.finance, https://web3.career/web3-companies/ballast-finance), Bedrock (Bedrock restaking, BR token).

The mark and grid system do not depend on the name. Wordmark SVG would need redrawing for a rename.

## 2. Direction

Visible-grid, blueprint, Swiss technical drawing. Hairlines divide the page into cells. Content snaps to cells. Small "+" crosshairs sit at intersections and box corners. Squares only (radius 0, 2px max on badges). One accent colour. Numbers in mono. No gradients, glow, shadows or illustration.
Difference from Vercel/Linear/Magic UI: the grid is structural not decorative (columns are real, content must sit on them), and the floor line is the recurring motif: one accent-coloured horizontal line is the only saturated stroke in most layouts.

## 3. Logo

**Concept.** A square (the portfolio) resting on a line (the floor) that extends past it on both sides. It reads as an object that stops at the line. In the lockup the wordmark baseline and the floor line's bottom edge are the same y.

**Geometry.** 32 x 32 grid, integer coordinates. Square 12 x 12 with a 2-unit stroke at (10,9). Line 32 x 2 at y=21. Wordmark: 82 x 24 box, 3-unit strokes, cap height 24, x-height 16, drawn as paths (no font dependency).

**Files** (all `currentColor`):
- `logo/floor-mark.svg` symbol, 32 x 32.
- `logo/floor-wordmark.svg` word, 82 x 24.
- `logo/floor-lockup.svg` mark + word, 126 x 24.
- `logo/favicon.svg` fixed-colour tile (#0A0B0D, off-white square, accent line #7C93FF). Reads at 16px: the line is 1.5px, square stroke 1px.
Inline the SVG (not `<img>`) when you want the line in `--floor-line`: give the `<rect>` `fill="var(--floor-line)"`. Default is one colour.

**Clear space** = half the mark's height (12 units of the 24-unit lockup) on all sides. **Minimum size**: mark 16px, lockup 96px wide (below that, use the mark alone).
**Colour:** text colour on neutral backgrounds; `--accent-ink` on accent. Never recolour parts other than the line.
**Do:** place on the grid, align the floor line to a grid line when possible. **Don't:** add effects, outline, rotate, stretch, put the mark in a rounded container (favicon tile excepted), animate the square (the line may draw in once), set the wordmark in a font.

## 4. Colour tokens

Defined in `tokens.css`. Light is default; dark follows the OS or `data-theme="dark"`. The ratios are WCAG 2.x contrast.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bg` | page | #FAFAF8 | #0A0B0D |
| `--surface` | cards, inputs | #FFFFFF | #111215 |
| `--surface-sunken` | hover, wells | #F3F3F0 | #0D0E10 |
| `--grid` | hairlines | #E4E5E0 | #1C1E21 |
| `--grid-strong` | section rules, control borders | #CFD0CA | #2C2E31 |
| `--crosshair` | "+" marks | #8C8E86 | #6E7068 |
| `--text` | primary | #10110F | #F2F2EE |
| `--text-2` | secondary | #464843 | #B4B6AE |
| `--text-muted` | labels, captions | #686A63 | #8D9088 |
| `--accent` | actions, links | #2440E0 | #7C93FF |
| `--accent-ink` | text on accent | #FFFFFF | #0A0B0D |
| `--accent-soft` | cushion fill, selection | #E9ECFC | #151A33 |
| `--floor-line` | the floor line, nothing else | #2440E0 | #7C93FF |
| `--positive` | gain, holding | #0B7544 | #3DD68C |
| `--negative` | loss, cash lock | #B8312A | #FF7469 |
| `--warning` | weekend, gap risk | #8F5600 | #F2B84B |

Contrast against `--bg` (against `--surface` is within 0.3 of these):
| Pair | Light | Dark |
|---|---|---|
| text | 18.1 | 17.5 |
| text-2 | 8.9 | 9.6 |
| text-muted | 5.3 | 6.1 |
| accent (links, floor-line label) | 7.0 | 7.0 |
| accent-ink on accent (buttons) | 7.3 | 7.0 |
| positive | 5.5 | 10.5 |
| negative | 5.7 | 7.5 |
| warning | 5.7 | 11.0 |
All text pairs pass AA (4.5:1). Non-text: `--crosshair` 3.2 (light) / 3.9 (dark) passes 3:1. `--grid` (1.5:1) and `--grid-strong` are decoration and dividers, not required for understanding; do not use `--grid` as the only boundary of an input (inputs use `--grid-strong`, and gain a 2px accent focus ring).
Rules: never rely on red/green alone, pair with a sign, word or arrow. Use the accent on at most one primary action per view.

## 5. Typography

Google Fonts: **Geist** (400, 500, 600) and **Geist Mono** (400, 500).
`<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">`
(Or self-host via `next/font/google`.) Fallbacks in `tokens.css`.

| Style | Size | Weight | Tracking | Line height |
|---|---|---|---|---|
| Display | clamp 40 to 72px (2.5 to 4.5rem) | 600 | -0.035em | 1.05 |
| H1 | 32 to 48px | 600 | -0.02em | 1.15 |
| H2 | 24 to 32px | 600 | -0.02em | 1.15 |
| H3 | 20px (1.25rem) | 600 | -0.01em | 1.3 |
| Body L | 18px (1.125rem) | 400 | 0 | 1.55 |
| Body | 16px (1rem) | 400 | 0 | 1.55 |
| Small | 14px (0.875rem) | 400 | 0 | 1.5 |
| Label | 12px (0.75rem), mono 500, uppercase | 500 | +0.08em | 1.4 |
| Number XL | 32 to 48px mono | 400 | -0.02em | 1.1 |

**Use mono for:** every number with a unit (prices, %, bps, $), addresses, tickers, labels, table headers, section indices ("01 / Logo"), badges, chart text. Use `font-variant-numeric: tabular-nums slashed-zero`. **Never mono for** sentences or headings. Max measure 64ch for body, 14ch to 20ch for display headlines.

## 6. Grid system

**Base unit 8px** (4px half step). Spacing scale: 4, 8, 16, 24, 32, 48, 64, 96, 128 (`--s-1` to `--s-9`). Section vertical padding 96px (64px on phone, set `--s-7`). Everything is a multiple of 8 except hairlines (1px) and crosshairs (11px).

| | Phone (<768) | Tablet (768 to 1199) | Desktop (1200+) |
|---|---|---|---|
| Columns | 4 | 8 | 12 |
| Column gutter | 0 (cells share hairlines) | 0 | 0 |
| Side gutter | 16px | 32px | 48px |
| Container | 100% (375px: 343px content) | 100% | max 1200px, centred |
| Row module | 64px | 80px | 96px |
| Cell at 1200px | n/a | n/a | 1104/12 = 92px wide, 96px tall |

There is no gap between columns. Separation comes from hairlines; inner padding inside cells is 24px (16px on phone). Because columns are fluid `fr` units, nothing has a fixed width: no horizontal scroll at 375px. Tables get their own `overflow-x:auto` wrapper. Test at 375, 768, 1200, 1440.

**Lines.** All lines 1px. `--grid` for the lattice and cell borders, `--grid-strong` for section top rules and control borders. Never 2px, except the floor line (2px, `--floor-line`) and focus ring.
**Page frame.** `.page` has 1px vertical rails (`border-inline`) at the container edges. `.section` has a 1px top rule, full container width.
**Lattice.** The visible background grid, used on the hero and demo areas only (not behind body text). Fluid columns, fixed rows:
```css
.lattice {
  background-image:
    linear-gradient(to right, var(--grid) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid) 1px, transparent 1px);
  background-size: calc(100% / var(--cols)) var(--row);
}
```
**Crosshair.** 11 x 11px box, 1px strokes, centred on the intersection (5px arm each side), colour `--crosshair`. CSS (in `tokens.css`):
```css
.xh { position:absolute; width:11px; height:11px; transform:translate(-50%,-50%);
  background:
    linear-gradient(var(--crosshair),var(--crosshair)) center/100% 1px no-repeat,
    linear-gradient(var(--crosshair),var(--crosshair)) center/1px 100% no-repeat; }
```
Usage: `<i class="xh" style="left:0;top:0"></i>` inside a positioned box, or add `.xh-corners` to a box for top-left and bottom-right crosshairs.
**Where crosshairs appear:** (1) top-left corner of the page frame and hero; (2) the four corners of the hero chart panel; (3) where a section's top rule meets the page rails (left and right); (4) opposite corners (TL + BR) of feature cards. Max about 8 per viewport. Never on text, buttons or inside tables. Do not animate them.
**Cards and panels.** Boxes occupy whole columns and rows, are square, have a 1px `--grid` border, `--surface` fill, no shadow. Adjacent boxes share one border (use `margin: 0 -1px -1px 0`, or the `.cell + .cell` rule). Content inside is on an 8px baseline with 24px padding.
**Tick marks and coordinates.** Optional: mono 10 to 12px labels at lattice edges ("COL 3 / ROW 2", "FLOOR $9,000"). Ticks are 6px, 1px, `--crosshair`.
**Phone.** Lattice shows 4 columns by 64px rows. Hide the lattice behind text-heavy sections; keep it in the hero. Stack cells 1-up; a 2-up row of small stat tiles is allowed at 343px.

## 7. Iconography and diagrams

Lucide, 1.5px stroke, 24px grid, `currentColor`, square caps and miter joins if configurable (`stroke-linecap="square"`), sizes 16, 20, 24. No filled icons, no duotone, no emoji. Icons sit in a 40px square cell with a hairline border when used as feature markers.
Diagrams: 1px strokes on the lattice, mono labels, orthogonal lines only (no curves except price paths), one accent element per diagram (the floor line), cushion region filled `--accent-soft`, price path in `--text` 1.5px. Label things directly, no legends where avoidable. Flows are boxes joined by right-angle lines with a 6px arrowhead. No 3D, gradients, isometric art, coins or blockchain clichés.
Charts: see components. Always note when data is illustrative.

## 8. Motion

Subtle, technical, informative.
- Easing `cubic-bezier(0.2, 0, 0, 1)`. Durations: hover/focus 120ms, panels/tabs 240ms, line draw 900ms.
- Allowed: floor line and price path draw on first view (`stroke-dashoffset`, once), number tickers up to 600ms ending on the exact value, 8px fade-up on section entry (240ms, once), hover border-colour change.
- Not allowed: bounce, parallax, looping animation, glow, cursor effects, animating crosshairs or the logo.
- `prefers-reduced-motion: reduce`: no draw, no tickers, no fades; show end states. `tokens.css` already zeros durations.
- Numbers never animate to a different value than the real one at any frame beyond 600ms.

## 9. Voice and tone

1. Plain and precise. Short sentences. Say the number: "93 of 93 one-year windows", not "very reliable".
2. No hype words ("revolutionary", "seamless", "unleash", "game-changing"). No exclamation marks.
3. State the limit with the claim: "holds unless prices gap more than 25% before the vault can rebalance". Never "guaranteed" or "you can't lose".
4. Name the cost of the protection: you keep part of the upside (about 42% of the basket's gain at m=4 in up years).
5. Explain mechanics in ordinary words first; jargon (CPPI, bps, MCP) second, with a one-line gloss. Spot trades only: say it early and say it once, no perps, options, leverage or borrowing.

## 10. Components

All components: square, 1px borders, no shadows, mono for data. See `preview.html`.
- **Button.** 40px high, 16px side padding, 14px/500 Geist, radius 0. Primary: `--accent` fill, `--accent-ink` text, one per view. Secondary: `--surface` fill, 1px `--grid-strong`, border goes `--text` on hover. Ghost: text only with a trailing arrow glyph. Disabled: `--surface-sunken`, `--text-muted`. Focus: 2px `--focus` outline, 2px offset. Phone: full width in stacks, min tap 40px (use 44px on touch if you can).
- **Input.** 40px high, 1px `--grid-strong`, mono 16px value (16px prevents iOS zoom), label above in mono label style, unit suffix inside right in `--text-muted`. Focus: border and 1px ring `--accent`. Error: border `--negative` plus a text message, never colour alone.
- **Stat tile.** `--bg` fill, 1px `--grid`, 16px padding. Mono label (12px caps) on top, value in mono 28 to 48px, one-line note in 13px `--text-muted`. Tiles abut in a row and share borders. Deltas carry a sign and colour.
- **Table.** Hairline rows only (`--grid`), header row mono 11px caps with a `--grid-strong` rule, numeric columns right-aligned mono, row hover `--surface-sunken`, 12px cell padding. Wrap in `overflow-x:auto` on phone.
- **Badge.** 24px high, 8px padding, radius 2px, 1px border, mono 11px caps. Neutral, positive, warning, negative = border and text in the semantic colour, transparent fill. No filled badges.
- **Chart (core).** Portfolio value above a flat floor line. Plot sits on the lattice (1px `--grid` lines every 120px or per tick). Value path 1.5px `--text`. Floor line 2px `--floor-line` with 11px end ticks and a mono label "FLOOR $9,000" just under it. Cushion (value minus floor) filled `--accent-soft`, labelled "CUSHION". A small crosshair marks the hovered point; tooltip is a square mono box with 1px border. Axes: mono 11px `--text-muted`, no axis lines beyond the lattice. Use the `dataviz` skill for interaction detail. Cash-lock periods are shown as a hatched or `--surface-sunken` band, labelled.

## 11. Open questions
- Name: keep Floor or switch to Sill? Domain, trademark and handles unchecked.
- Geist is a Vercel font; if the team lead wants less Vercel feel, substitute "Instrument Sans" or "Inter Tight" with Geist Mono kept. Tokens are variables, one-line change.
- Confirm cobalt blue accent (blueprint association). Alternative: a signal orange was rejected because it sits too close to `--negative`.
- CONTEXT.md names no contradictions with this brand. It does not give a tagline; the preview headline "The line your portfolio holds above." is a placeholder for the marketing agent to replace.
