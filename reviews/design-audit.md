# Design audit (agent DESIGN, 2026-10-03)

Method: production build served locally, Chromium (Playwright) full-page screenshots of 19 routes x 375/768/1440 x light/dark (114 shots), plus DOM measurement for horizontal overflow. Code read: app/page, components/landing, app/docs/*, app/app/*, app/agents. Before/after pairs: `apps/web/screenshots/design/`. Numbers: CONTEXT.md and `research/m_study/REPORT.md` only.

## 1. What works
- The visual language is coherent and distinctive: hairline rails, "+" crosshairs, Geist/Geist Mono, one cobalt accent, the floor line as the only saturated stroke. It reads as a technical drawing, not a template.
- Landing is short: hero chart, -51% vs -10% moment, three steps, four proof tiles, spot-only, agents, limits, CTA. Honest caption on every figure.
- App (set floor, review, positions, position, keeper) is task-focused; the live chart beside the controls explains the floor without text.
- Reveal / NumberTicker default to the final state without JS or with reduced motion. Good progressive enhancement.
- Global focus ring exists (`:focus-visible`, `--focus`), skip link exists, tables have captions and scopes, colour is always paired with signs/words.

## 2. Top findings
1. **Honesty drift (P0).** "93 of 93" was the landing/proof headline and the backtest title, and "survives any gap under 25%" appeared as fact. MSTUDY (1,581 periods, 1928-2026) shows 0.44% clear breaches and real one-day drops of -30% to -61% in single stocks. Fixed (see section 6).
2. **No page showed the long-history evidence (P0).** Added `/docs/evidence`, one landing tile, links from Risks, Trade-off, How it works, Backtest.
3. **Agent flow diagram clipped at 768 (P1).** Grid columns did not shrink (`1fr` with min-content), nodes ran past the panel and "rebalance()" was cut. Fixed: stacked below 1200px, `minmax(0,1fr)` above.
4. **"~42% upside kept" was presented as typical (P1).** It is a pooled mean of up-year gains; the median year is +1.6% vs +13.7% holding. Added the caveat on the tile, Trade-off and Evidence.
5. **Long source paths overflow chart panels on phones (P1).** `Source: docs/data/...csv` ran past the card edge at 375. Fixed with `overflow-wrap:anywhere`.

## 3. Route-by-route decisions (each block: format, where, why)

### Landing `/`
| Block | Verdict | Format / placement / rationale |
|---|---|---|
| Nav | keep | Text links: How it works, Backtest, Agents, Risks, Docs + one primary CTA. Add "Evidence" only inside Docs (nav stays 5 items; judges can reach it from the proof tile). |
| Hero (headline, one sentence, disclosure, 2 CTAs) | keep | Display type 40-64px, balanced. The disclosure line under the hero stays (honesty rule). "Built on CPPI" line: keep but it is small; fine as an expert hook. |
| Hero chart (NVDA 2022) | keep | Chart: it is the whole pitch in one image. On phones it sits after the CTAs; acceptable because the CTA is above the fold. Source line is mono-small; it now wraps safely. |
| Moment (-51% vs -10%) | keep | Two big numerals + equal-scale bars. This is the 10-second takeaway. Caption must say "worst year, not typical" (it does). |
| Three steps | keep | Mini diagrams, not text. Could be animated later (P2). |
| Proof tiles | change | Tile 1 was "93 / 93" (a sample result used as a headline). Now "0.44%" of 1,581 periods, with the limit stated inside the tile. Tile 3 now says "average of up-year gains; a typical year keeps less". Tiles stay numbers, because they are scannable; detail lives in /docs/evidence. |
| Spot only (4 struck words) | keep | Strong, cheap, memorable. |
| Agents (flow diagram) | keep, fixed | Diagram, not prose. It serves the side prize and is correctly below the fold. |
| Not a guarantee | keep, reword | Text with warning rule. Now says "about 24%". Must stay. |
| CTA | keep | One headline, one primary, one ghost. |
| Footer | keep | Added Evidence link. "(soon)" placeholders are honest; replace when links exist. |

What a judge sees: 10 s = hero + -51/-10 moment. 2 min = steps, proof tiles, agents, limits, CTA. 10 min = /docs/how-it-works, /docs/evidence, /docs/risks, /app prototype, /agents/run.

### Docs
| Page | Verdict |
|---|---|
| Overview | Keep as map. Text. Fix: 42% claim already carries the up-years qualifier. |
| How it works | Keep. Text + stack diagram + exposure chart + worked example table. The "4 x 25% = 100%" line corrected to "about 24%, 1 / m" and links to Evidence. |
| Trade-off | Keep. Give/get table is the right format. Added the median-year caveat (text, small). |
| Backtest | Keep as the 2018-2026 sample. Renamed "93 of 93" section to "The 2018 to 2026 sample", stat panel labelled as the short sample. Gap chart reference line moved to 24%. Later: collapse the trading-window paragraph into a callout (P2). |
| **Evidence (new)** | Depth page. Three stat tiles, method list, two bar charts, results table, 1/m rule, crash table, group table, floor-vs-m reading table, "what we did not build", limits. Tables for exact values, bars for comparison; no decoration. |
| Spot only, Contracts, Agents | Keep. Agents flow fixed. |
| Risks | Keep, extended: long-history sentence and the 93-of-93 reword. F-04 disclosure unchanged. |
| FAQ | Keep. Wording "about 24%". F-04 answer unchanged. |

### App
| Route | Verdict |
|---|---|
| /app (set floor) | Keep. Four controls, live chart, three stats. No m dial: MSTUDY says the floor is the dial. Starting split and term stay as read-only facts. |
| review, confirmed, position*, positions, keeper, states | Keep. Tables scroll inside their wrapper on phones (good). "Worst case" tile and the checkbox now say "about 24%". |
| /agents, /agents/run | Keep; demo screens for the agent prize. |

## 4. Information architecture
Nav: How it works / Backtest / Agents / Risks / Docs + CTA. Docs sidebar order: Overview, How it works, Trade-off, Backtest, **Evidence**, Spot only, Agents, Contracts, Risks, FAQ. Landing order stays: hero, moment, steps, proof, spot only, agents, limits, CTA.

## 5. Accessibility and performance
- Contrast tokens pass AA (BRAND.md table). Mono 11px labels at `--text-muted` are 5.3:1+; acceptable, but 10px connector labels in the agent diagram are small (P2: raise to 11).
- Overflow: documentElement scrollWidth exceeds viewport on /docs/how-it-works, /docs/backtest, /app/positions at 375 (tables are wider than the screen). `body` is `overflow-x:hidden` and the tables sit in `overflow-x:auto` wrappers, so users cannot see a page-level horizontal scroll, but the wrapper's width is not constrained to the column (P2: add `min-width:0` to the wrapper parents).
- Keyboard: summary, links, buttons all take the global ring. Mobile menu has aria-expanded/controls.
- Not measured: Lighthouse scores (no Lighthouse binary run here). By construction: static pages, no images except OG, two font files via next/font, charts are inline SVG/HTML, JS is React + motion + wagmi on /app only (providers are scoped to /app). CLS risk: NumberTicker swaps text after hydration (monospace tabular figures, so width is stable).

## 6. Fix list
**P0 (done)**
- Remove "93 of 93" as a headline (landing tile, backtest title/toc/lead/stat, risks). Kept as the labelled 2018-2026 sample.
- "25%" gap wording -> "about 24%" everywhere via `BRAND.gapLimitPct` (builder, review checkbox, landing, OG image, FAQ, risks, how it works, backtest, agent-run log line). `BRAND.disclosure` updated.
- Gap chart reference line 25 -> 24, label "1 ÷ m, minus costs".
- "Strong trends keep more than 42%": 42% qualified as pooled average, median year stated.
**P1 (done)**
- New Evidence page; one landing tile; footer link; docs nav.
- AgentFlow overflow at 768; ChartPanel source wrap.
**P1 (open)**
- Footer "(soon)" items once contracts/GitHub exist. Needs deployed addresses.
- Contract-side "gap tolerance 24%" wording should match CONTRACTS.md (not mine to edit).
**P2**
- Raise 10px diagram labels to 11px. Wrap-parent `min-width:0` for table overflow. Animate step diagrams (draw-in, 400ms). Lighthouse run in CI. Optional "typical year" mini-chart on Trade-off using the median numbers.

## 7. Motion and interaction plan
Motion explains: (1) hero floor line draws first, then the value line (existing); (2) numerals count once on first view (existing, 600ms); (3) bars grow from 0 on view (existing `.bar`); (4) Evidence: no new motion, tables and bars appear with the standard 8px fade-up reveal; (5) the app chart redraws when the floor changes (existing). All motion is off under `prefers-reduced-motion`. No decorative loops.
