# Decisions that reconcile the agents' outputs (2026-10-02)

Where documents disagree, this file wins, then CONTRACTS.md (on-chain), then ARCHITECTURE.md (off-chain).

## On-chain surface (CONTRACTS.md is authoritative; ARCHITECTURE.md §2.1 A1–A11 is superseded)
| ARCHITECTURE assumed | Decided (CONTRACTS.md) |
|---|---|
| A1: single vault, `deposit(asset, amount, floorBps, termDays) → positionId` | `FloorFactory.createPosition(amount, floorBps, termSeconds, basket…)` clones one `FloorVault` per position. **USDT-only deposit.** Position id = the vault clone's address. User approves USDT to the **factory**. |
| A2: per-position accounting in one vault | Full isolation: one clone per position. One user's gap loss can't touch another. |
| A3: `withdraw(positionId)`, in kind, any time | `exitInKind(to)` (always allowed, skips a paused token) and `requestClose()` → `closeToUSDT()`. Owner-only. |
| A4: `rebalance(...)` with several swaps + nonce | `rebalance(Swap)`: one swap per call, keeper-only. Vault re-validates direction, size, router, `minOut`. `rebalancePublic(assetIdx)` opens to anyone after 4h idle, via the direct Pancake pool. |
| A5: price source open | Pancake v3 10-minute TWAP inside the vault. The keeper supplies no price. Per-asset trade caps (QQQB lowest). |
| A7: keeper-set `marketOpen` flag | **No keeper flag.** On-chain trading window Mon–Fri 15:30–19:30 UTC, a guardian-set holiday table and a guardian halt flag. |
| A9/A10: views and events | Use `FloorLens.status(vault)` / `scan(from,to)` and the events in CONTRACTS.md §11. |

## Other decisions
- **Keeper:** an EOA is the primary keeper. An Agentic Wallet holds the same keeper role as a supervised second
  keeper (demo rebalances). Users' own Agentic Wallets sign `createPosition` / exits via `contract-call` and pay b402.
- **Fees:** zero protocol fee in v1. b402 pay-per-call is for the API/MCP only.
- **Numbers:** "−36%" is the median bad year. The worst year is NVDA 2022: holding −51.0%, Floor −10.0%.
- **Name:** **Floor (team lead, 2026-10-02: "keep floor for now").** It clashes with floor.xyz, FloorDAO and Floor Protocol; Sill is the backup. Every
  product surface must read the name from one constant so a rename is a one-line change.

## Open, needs follow-up
1. **Trading window vs the backtest: checked, holds at m = 4.** The contract trades only 15:30–19:30 UTC, not at
   the open and close. The backtest's `close_only` mode (one rebalance a day; overnight plus the next day's move
   hit unhedged) is a fair stand-in. In it, **m = 4 had no breach in the short 93-window 2018 to 2026 sample on any asset or basket** (not a safety claim; the long study found 0.44% of one-year windows ended more than 1 point below a 90% floor, 95% CI 0.07% to 0.93%), but m = 5
   broke in 3.2% of TSLA windows. So the public claim is "at m = 4", not "at m ≤ 5". An hourly re-run
   (yfinance has ~2 years of 1h bars) would be more exact.
2. **CONTRACTS.md found bStocks have an issuer pause, a per-token blocklist and a sanctions list.** That
   contradicts EXECUTION.md §4. Treat CONTRACTS.md as correct. The landing page's risk section must mention it.
3. **NVDAB pool TVL is ~$4.8M (measured 2026-10-02)**, not $3.35M (2026-09-30).
4. **b402 uses a normal Binance Web3 API key** with the B402 Payments permission (no merchant application). Supported and verify are verified live; settle is not yet, so the demo uses the self facilitator (`X402_FACILITATOR=self`) until it is.

## Honesty pass (2026-10-04, agent DISCLOSE)
Headline numbers come from `research/m_study2/REPORT.md`: 0.44% of one-year windows ended more than 1 point below a 90% floor (95% CI 0.07% to 0.93%), 0.09% of one-month windows, cash lock 2.85% / 0.17%, upside kept about 4 x (100 - floor)%. "93 of 93" is never used alone and "42%" always carries "at a 90% floor". Never "max loss 10%": the worst one-week window lost 24%. Trusted roles and the batch acceptance disclosures are on the public risks page, README and `/docs/open-items`.

## Docs sync (2026-10-05)
5. **Launch caps are shared and owner-changeable.** 1,000 USDT per position and 5,000 USDT in total across all users, at deploy. The owner can change both at any time with `setLimits` (no redeploy); existing positions are unaffected. This is stated beside "owner and guardian are the same address" (`0x762c…1F1A`) in the README, `/docs/risks`, `/docs/contracts` and `/docs/open-items`.
6. **Pashov run 06 (2026-10-05): proposed acceptance, no contract change.** The finding (a caller with 5,000 USDT can fill the shared cap) is proposed accepted for the hackathon launch in `reviews/acceptances.md`. Not signed. The team lead confirms in writing.
7. **Keepers.** An EOA keeper is primary. An Agentic Wallet is an optional second keeper and is not set up. BNB Agent Studio and the Agentic Wallet side prize are skipped. ERC-8004 registration is optional, prepared and not broadcast. Frontend domain: `https://floor.ayush.works` (planned, not verified live); fallback `floorbnb.vercel.app`.
8. **Deadline.** Sun 2026-10-11 12:00 UTC, which is 17:30 IST.
