# CALM: progressive disclosure and declutter (agent/CALM)

## Research notes (8 lines, from the published patterns of each product and the WAI-ARIA APG; no live browsing)
1. Disclosure (APG): a button with aria-expanded and aria-controls reveals text in place. Used for the "More" control on each acknowledgement.
2. Popover / info icon: Stripe Dashboard and Linear put a short (i) hint next to the label, never in place of it. Kept to one or two sentences, opened by click, tap or Enter, closed by Escape or outside click. Never hover-only.
3. Drawer / side sheet: Stripe, Linear and Vercel open detail and settings in a right-hand sheet and keep the list or form visible behind it. Used for "Risks" and "See the tradeoff".
4. Bottom sheet: Uniswap and Aave open token, route and risk detail as a sheet that rises from the bottom on phones. Same components switch to a bottom sheet below 640px (popover) and 768px (drawer).
5. Tabs: Vercel and Aave split dense pages into a few named panels (overview, activity, details). Used for position (Activity, Holdings) and agents (Tools, Connect and pay, Notes).
6. Expandable rows: Aave and Uniswap show a headline value and let each row expand to the long explanation. Used for review acknowledgements and the extra review terms.
7. Apple: one idea per screen, a clear primary action, and the explanation one tap away. Applied as one viewport per page with one primary button.
8. Accessibility rules we hold to: every hidden text has a real button with an accessible name, reachable by keyboard and touch; native popover/dialog give Escape, outside click, top layer (no clipping) and focus return; focus is moved into the panel and trapped while it is open; motion is off under prefers-reduced-motion; risk text is never removed, only moved one click away, and the exact original wording is still in the Risks drawer.

## What was built
- apps/web/components/ui: InfoPopover (native popover, placed next to the (i), bottom sheet on phones, focus move/trap/restore), DetailsDrawer (native dialog: side sheet on desktop, bottom sheet on phones), ExpandRow (aria-expanded disclosure), Tabs (APG tabs, arrow/Home/End), calm.css, use-viewport. No new dependencies (native popover and dialog, already in the repo for Dialog).
- App shell: one-line title, footer is one line plus a Risks link (opens the full disclosure drawer). Page body fills the viewport (100dvh minus header).
- Tests: components/ui/ui.test.ts (placement, focus wrap, tab keys, accessible markup), lib/acks.test.ts (short labels). Browser checks (Playwright, run by hand, all passed): Enter opens, focus moves in and is trapped, Escape closes and returns focus to the (i), outside click closes, popover stays inside the viewport at 1280x720 and 375x812 (bottom sheet), Risks drawer opens, contains the exact original disclosure and acknowledgement wording, closes on Escape with focus restored; review "More" reveals the exact original acknowledgement text and the three boxes still gate the primary button.

## Where the text went
- Builder: basket note, trading window -> (i) on Basket. Floor range note, "slider stops at 98" and the starting-split bar and text -> (i) on Floor. Term end text and backtested range -> (i) on Term. Worst case / Upside kept / Cost notes -> (i) on each stat. Chart caption long form (window choice, cash lock, simplifications, "Backtest on past prices...") -> (i) on the caption. "What you gain and give up" (meters text, strip across floors, historical-test rates, backtest caveat) -> "See the tradeoff" drawer. Default-limits note -> (i) next to Risks. One-line note stays by the primary button: "Backtest on past prices; not a forecast; floor can break on a gap of about 24%. Risks".
- Review: three acknowledgements stay as checkboxes with a one-line label and a More control (exact original text); the Risks drawer holds the same text plus the disclosure and backtest note. Multiplier, split and fees -> "Show" row. Example mode paragraph -> (i). Term-end text and "Exit in kind is always allowed..." -> Risks drawer.
- Confirmed: "what happens next" paragraph and the first-rebalance/holiday/term-end text -> (i).
- Position: status banners are one line with More; value tooltip -> (i); rebalance rules -> (i); Activity and Holdings are tabs.
- Close modal: option explanations -> "How it works" row for the selected option; swap-cost estimate note inside it. The "leaving before X removes the floor" line stays visible.
- Keeper log: footnote -> (i); six latest rows, "Show all 12"; trading window and fallback explanations -> (i).
- Agents: three tabs; the b402 and Agentic Wallet notes are in Notes, word for word.

## Measured (production build, mock data, light theme; document height vs viewport, words visible by default)

Words are the same at every size (mobile differs by a few). Height is document scrollHeight in px.

| Page | words before | words after | 1440x900 before -> after | 1280x720 before -> after | 375x812 before -> after |
|---|---|---|---|---|---|
| builder | 622 | 149 | 2398 -> 900 (fits) | 2398 -> 720 (fits) | 4012 -> 1557 (scrolls) |
| review | 316 | 157 | 1582 -> 900 (fits) | 1582 -> 720 (fits) | 2466 -> 1264 (scrolls) |
| confirmed | 180 | 84 | 1100 -> 900 (fits) | 1099 -> 720 (fits) | 1537 -> 953 (scrolls) |
| positions | 146 | 120 | 900 -> 900 (fits) | 797 -> 720 (fits) | 1096 -> 894 (scrolls) |
| position | 231 | 144 | 1564 -> 900 (fits) | 1564 -> 720 (fits) | 2297 -> 1472 (scrolls) |
| close-modal | 116 | 79 | 525 -> 414 (fits) | 525 -> 414 (fits) | 780 -> 698 (fits) |
| keeper | 334 | 178 | 1443 -> 900 (fits) | 1443 -> 720 (fits) | 1857 -> 911 (scrolls) |
| agents | 394 | 203 | 1540 -> 900 (fits) | 1540 -> 720 (fits) | 2457 -> 861 (scrolls) |
| agents-run | 185 | 178 | 900 -> 900 (fits) | 766 -> 720 (fits) | 1505 -> 1236 (scrolls) |

close-modal height is the dialog box, not the document (it never scrolls the page).

Totals at 1440: 2,524 words before, 1,292 after across the nine screens.

## What does not fit one viewport, and why
- Desktop 1440x900 and 1280x720: every page fits (no page scroll). Content that is long by nature scrolls inside its own focusable panel: the Activity list on a position (tabpanel, tabindex 0) and the keeper table after "Show all".
- Below 1200px wide (tablet and phone) the builder, position and others stack to one column and scroll, as intended. Mobile pages are 861 to 1557 px tall, down from 1096 to 4012, and built from short blocks.
- Widths between 768 and 1199 were not tuned for one viewport.
- Not changed: /app/states, docs, landing.
