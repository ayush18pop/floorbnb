# Claims audit, pass 1 (A03)

Scope: `web/` as of main 69c582b (`apps/web` after A00), `README.md`, `docs/*.md`, `wireframes/prompts.html`. Read-only except this file.
Sources: `CONTEXT.md` (C), `docs/RESEARCH_RESULTS.md` (RR), `docs/data/gap_backtest.csv` (GB), `docs/data/vault_path_*.csv`, `docs/DECISIONS.md` (D), `docs/CONTRACTS.md` (K), `docs/EXECUTION_PLAN.md` (P).
Re-derivation was done with Python over the CSVs (commands at the end). Rendered pages were not built; text was read from the TSX sources.
Note on the build: the site renders only static text and CSV-driven numbers, so reading TSX is equivalent for copy.

## Verdict counts (by claim row below)
OK 33 | wrong 2 | unsourced 6 | stale vs DECISIONS/plan 4 | needs caveat (honesty rule) 6

## Top 5 fixes
1. `web/app/docs/spot-only/page.tsx:10` "Your exposure never goes above your deposit" is wrong. E* = min(4C, V) is capped at current value V, which exceeds the deposit after gains (K section 5). Say "never above your vault's value".
2. `web/components/landing/hero.tsx:19` and `web/lib/brand.ts:11,16` "keeps your tokenized stocks above a line you pick" / "Set the lowest your portfolio can go." state the floor with no limit in the same view. BRAND.md rule: state the limit with the claim. The `disclosure` string exists; show it under the hero.
3. `web/app/docs/how-it-works/page.tsx:24` "At 90%, your worst case is about a 10% loss." has no gap caveat (the FAQ and builder have it). Add "unless prices gap more than 25% before the vault can rebalance".
4. Cost claims (`faq` "0.7 to 6.6 bps", `builder.tsx:11-13`, `proof-panels.tsx:99-102`, `trade-off:59`) are aggregator quotes. A02 measured the direct Pancake route on a fork: 49 bps round trip for NVDAB and SPCXB, 1 bp for QQQB, at 100 USDT (`ops/spikes/RESULTS-taker.md`). The aggregator-from-contract path is untested (blocked on keys). Keep the "Live aggregator quotes" label and add "if the vault uses the aggregator route" until Monday's tx shows the path (conflict 10).
5. `README.md:7` says the web app is "deployed at floorbnb.vercel.app". P1 says Vercel has never deployed this project. Unsourced; remove or verify. Also `docs/contracts/page.tsx:30` "Owner (multisig)" is undecided (K Q10: Safe or EOA, team lead decision), and `faq`/`risks` say "The contract is public" before any deploy.

## Claim table
Verdicts: OK / wrong / unsourced / stale (vs D or P) / caveat (true number, wording breaks the honesty rule).

### Headline numbers
| Page | Exact text | Value | Source | Verdict | Fix |
|---|---|---|---|---|---|
| landing tile, hero note, backtest, docs index | "93 of 93" windows | 93/93 | C "Measured numbers"; GB all `m=4` rows `breach_pct` 0.0, `windows` 93 (also `close_only` m=4) | OK | none |
| backtest toc / proof-panels `WindowsStat` | "At m = 4 (also with one rebalance a day...), on NVDA, QQQ, SPY, TSLA and baskets" | m=4 held | GB close_only m=4: all 0.0 | OK | none (AAPL also held; list is a subset) |
| backtest:48, risks:11 | "At 5x it broke in 3.2% of TSLA windows" | 3.23 | GB TSLA close_only m=5 `breach_pct` 3.23 | OK | none |
| backtest:44-48, risks:11 | "4x"/"4×" claim only | m=4 | D open item 1 | OK | none |
| hero:34, sections:120, backtest:27, how-it-works FIG | NVDA 2022 "Holding lost 51.0%" | 49.012 end index | `vault_path_nvda_worst.csv` last row stock_index 49.012 -> -50.99% | OK | none |
| same | "With Floor: -10.0%" | 90.048 -> -9.95% | same CSV vault_value | OK (rounds to -10.0 at 1 dp, -9.95 exact) | none |
| backtest:25,27 | "down 62.7% at the low" | min stock_index 37.298 | same CSV | OK | none |
| backtest:25 | basket same window "holding lost 53.0% and the vault lost 9.9%" | 46.988 / 90.094 | `vault_path_basket_worst.csv` last row | OK | none |
| hero:32, backtest:27, position-view:40 | window "4 Jan 2022 to 4 Jan 2023" | CSV first row is 2022-01-03 (base 100), last row 2023-01-04 | C says 2022-01-04 -> 2023-01-04 | caveat (date) | Either label "3 Jan 2022" (CSV) or confirm which day is the entry day with the backtest author. Same off-by-one for best windows (CSV starts 2023-03-07 and 2019-09-04; C says 03-08 and 09-05) |
| hero:34, backtest:27 | "The worst one-year window since 2018" | NVDA only | C "Single worst window" lists NVDA; basket worst is the same dates | caveat | Say "NVDA's worst one-year window since 2018" |
| hero / backtest panels | path "Floor 90%, m = 4, full weekend gaps, 0% stablecoin yield" | open_close model | `afterbell/research/vault_check/export_paths.py` docstring: "open_close, m=4" | OK, but note | The paths use open/close rebalancing, not the contract's 15:30-19:30 window. The 93/93 `close_only` check covers the window; the paths do not. Say so in the note |
| trade-off:51 | best NVDA window holding +298.1%, Floor +240.6% | 398.054 / 340.62 | `vault_path_nvda_best.csv` last row | OK | none |
| (computed `b`) | basket best +307.2 / +256.3 | 407.224 / 356.296 | `vault_path_basket_best.csv` | OK | none |

### Bad years, upside, gaps
| Page | Text | Value | Source | Verdict |
|---|---|---|---|---|
| trade-off:11 | NVDA -9.9% vs holding 36.5% | -9.86 / -36.45 | GB NVDA open_close m=4 `bad_yr_*`, n_bad 17 | OK (C says "36%"; 36.45 rounds to 36.5 at 1 dp, fine) |
| trade-off:11 | QQQ -7.4% vs 19.4% | -7.42 / -19.43 | GB | OK |
| trade-off:10 | basket -8.6% vs 17.2% | -8.62 / -17.24 | GB NVDA+TSLA+QQQ | OK |
| TSLA panel | TSLA bad year | -9.7 / -26.84 | GB | OK |
| trade-off:33, backtest:33 | "medians ... not the single worst year" | n/a | C rule | OK |
| trade-off:10,41,44; faq:8; risks:8; docs index:16; sections:121; builder:181 | "about 42%" kept, "about 58%" given up | 41.88 | GB basket `capture_up` | OK (58 = 100-42, derived) |
| trade-off:11; faq:8; builder:181 | NVDA 45%, QQQ 32% | 44.66 / 32.32 | GB | OK |
| trade-off:55; builder:185 | TSLA median year -6.8% vs +22.4% | -6.76 / 22.4 | GB TSLA `med_ret`, `med_hold` | OK |
| trade-off:51 | "Strong trends keep more than the typical 42%" | 298.1 -> 240.6 = ~81% of the gain | derived from CSVs | OK |
| proof-panels GAPS | NVDA 19.3, TSLA 14.9, AAPL 13.0, SPCX 10.3 (76 days), QQQ 9.5 | as listed | C "Worst overnight/weekend gaps" | OK |
| faq:14; risks:6; builder:182 | "worst: NVDA -19.3%" | 19.3 | C | OK. Caveat: SPCX has 76 days only (panel says so; risks text does not) |
| proof-panels breach table | held = 93 - breach% per m (e.g. NVDA m=6 held 82, m=8 74) | breach 11.83 / 20.43 | GB open_close | OK (RR table says 12% / 20%) |
| docs index:13 | "A bad year can cut the value by a third." | median -36% | C | OK (median bad year; "can" is fine) |
| docs index:13 | "In 2022, holding NVDA lost 51%." | -51.0 | CSV | OK |
| faq / how-it-works | "m=4 survives ... 25%" (4 x 25% = 100% of cushion) | 25 | K section 5, C | caveat | K section 5 gives the honest limit: with a 1% sell band the tolerance is 24.4%, and trading costs eat cushion. The "25%" copy omits both. Add "about 25%" and a note, or use 24% |

### Cost numbers
| Page | Text | Source | Verdict |
|---|---|---|---|
| proof-panels COSTS | QQQB ~0 / 0.7 / no quote; NVDAB 2.8 / 5.9 / 10.1; SPCXB 3.1 / 6.0 / 7.7; SPYB 1.1 / 6.6 / 13.6 | RR table 1 | OK |
| proof-panels:99-102, builder:11-13 | 0.7, 5.9, 6.0, (6.6) bps | RR | OK as aggregator quotes; see fix 4 |
| faq:12 | "on a $10k round trip, 0.7 to 6.6 basis points ... measured on 2026-10-02" | RR (Thu 12:06 UTC) | caveat | conflict 10: aggregator path only. Direct route measured by A02 = 49 bps (NVDAB, SPCXB), 1 bp (QQQB), at 100 USDT |
| proof-panels:116 | "TSLAB (46 bps at $10k) ... not in v1" | RR | OK |
| trade-off:59, builder:141, proof-panels:95 | weekend and crash costs not measured | RR "Not yet tested" | OK |
| trade-off:59 | "1 bp = 0.01%. 0.7 bps = 0.007%, 100 bps = 1%" | arithmetic | OK |

### Mechanism numbers (K section 5-7)
| Page | Text | Source | Verdict |
|---|---|---|---|
| how-it-works:38,39; stack-diagram; cppi.ts; builder | stock = min(4 x (V-F), V); 4 x 25% = 100% of cushion; 90% floor, $9,000 / $1,000 / $4,000 / $6,000 | K section 5 worked example | OK |
| cppi.ts:62-65 | -10%, -10%, -25% gap, +10% steps | K section 5 table | OK (values reproduced by A01 unit tests) |
| position-view:119, replay.ts:7 | "sell at 1% of V, buy at 2% of V" | K section 7 defaults 100 / 200 bps | OK (defaults, not final) |
| position-view:31 | "keeper, or anyone after 4 hours idle" | K section 7 publicDelay 4 h | OK |
| contracts:19,22; risks:11 | window Mon-Fri 15:30-19:30 UTC; 10-minute TWAP | K sections 3, 6 | OK |
| contracts:19 | "QQQB the lowest" cap | K section 7: 25k / 10k / 5k | OK (proposed defaults) |
| builder.tsx:77, TERM | floor slider 50% to 98%; 365 days = 31,536,000 s | K section 5 (floorBps 5000-9800), P | OK |
| spot-only:10 | "No leverage. Your exposure never goes above your deposit." | K section 5: E* <= V | **wrong** (V can exceed the deposit) |
| faq:3 | "You keep your floor value." (after cash lock) | K section 5 cash lock | caveat | Value ends near the floor, not exactly; gap losses and rounding can leave it slightly below. Say "your value stays at about the floor" |
| how-it-works:24 | "At 90%, your worst case is about a 10% loss." | C honesty rule | **wrong as worded** (no gap caveat). FAQ:1 and builder:78 carry it |

### Honesty words and stale statements
| Where | Finding | Verdict |
|---|---|---|
| web, README, docs | no "guaranteed", "can't lose", "risk-free". Only "not a guarantee" (sections:167-174, risks:6) | OK |
| web | no "AW is the keeper". contracts:27, agents pages, agent-flow, risks:16 use "EOA primary, Agentic Wallet second keeper" | OK (matches D) |
| web | no "deposit bStocks" / "deposit tokenized stocks"; contracts:16, faq:19, builder say USDT only | OK (conflict 2 already fixed in web) |
| `docs/CONTRACTS.md:399,401,915` | roles table: keeper "Binance Agentic Wallet address (plus a spare EOA)"; deploy step: "Keeper (Agentic Wallet" | stale vs D (conflict 13). Manager to fix |
| `docs/ARCHITECTURE.md:776` and `CONTEXT.md` ("Previously: one Agentic Wallet is the vault's keeper") | records the old claim | stale but explicitly marked as superseded; OK |
| `marketing/` (gitignored, absent in the worktree) | DEMO_SCRIPT, LANDING_COPY, PITCH still said "AW is the keeper" and "deposit bStocks" per P conflicts 2, 3 | not audited here (not in repo). A27 / A25 |
| `wireframes/prompts.html:587` | "Your deposit is safe; the basket is bought in the next window." | caveat | "safe" is an absolute. Reword: "Your USDT stays in your vault; ..." |
| README:7 | "deployed at floorbnb.vercel.app" | unsourced (P1 says never deployed) | remove or verify |
| contracts:30 | "Owner (multisig)" | unsourced (K Q10 open, team lead decision) | say "Owner (Safe or hardware wallet, to be confirmed)" |
| faq:19, risks | "The contract is public." / "Who holds my money? Your own vault contract" | live-before-deploy claim | no deploy yet (P: Mon 5 Oct). Prefix with "Once deployed" until addresses exist |
| agents page, docs/agents | tool "list_assets ... live price and market status"; "get_rebalance_history", "last keeper run" | not live | OK only because the page labels the keeper log "Mock" and says the endpoint is a placeholder. Keep the labels until the server is live |
| hero:23 | "Built on CPPI, the floor method Fischer Black published in 1987" | unsourced in C/RR | Black and Jones, "Simplifying Portfolio Insurance", Journal of Portfolio Management 1987 (from memory, **unverified**). Add a cited source or say "published in the 1980s" |
| risks:14 | "No Apple token exists yet." | C "There is no AAPL bStock" | OK |
| risks:13 | issuer pause, blocklist, sanctions risk | K section 4; D open item 2 | OK |
| brand.ts:11/16 | headline "Set the lowest your portfolio can go." | wording | caveat | see fix 2 |
| faq / risks | "No audit is published yet" | true today (A12 review is planned) | OK, revisit at G8 |

## Coverage of numeric strings
`grep -rnoE '[0-9]+(\.[0-9]+)?\s?(%|bps|x|×)' apps/web/app apps/web/components apps/web/lib` gave 197 matches in 30 files. Classification:
- Claims: all rows above (backtest, trade-off, risks, faq, how-it-works, docs index, sections, hero, builder, position-view, proof-panels, agents).
- Not claims, no source needed: CSS and token values in `globals.css` (18) and `tokens.css` (12) (`%`, `x` units), Tailwind and inline layout (`width: "42%"` etc. in charts, `rootMargin`, `padL`, `calc(100% - ...)`, `Xh` crosshair offsets at 100%), logo path data (`logo.ts`, `Logo.tsx`), `opengraph-image.tsx` layout (cx, cy). The two data-bearing exceptions are `trade-off:41,44` (the 42% bar, sourced above) and `stack-diagram.tsx` 90/10/40/60 (schematic from the 90% floor, m=4 example, labelled "Not backtest data").
- Script-derived (not hard-coded) numbers: `value-chart` summary, `pathSummary`, `proofData` (`worst`, `best`, breach table): verified by the re-derivations below.

## Commands used
```
python3 - <<'PY'   # re-derive from CSVs
import csv
r=list(csv.DictReader(open('docs/data/gap_backtest.csv')))
[x for x in r if x['mode']=='open_close' and x['m']=='4']          # bad_yr_*, capture_up, breach_pct
[x for x in r if x['mode']=='close_only' and x['m'] in ('4','5')]  # 93/93 and TSLA 3.23
rows=list(csv.DictReader(open('docs/data/vault_path_nvda_worst.csv')))
min(float(x['stock_index']) for x in rows)   # 37.298 -> -62.7%
PY
```
Not done: building the site and reading the rendered HTML, the `marketing/` files (gitignored, not in this worktree), and checking any external fact (Black and Jones 1987).
