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
   hit unhedged) is a fair stand-in. In it, **m = 4 held 93/93 windows on every asset and basket**, but m = 5
   broke in 3.2% of TSLA windows. So the public claim is "at m = 4", not "at m ≤ 5". An hourly re-run
   (yfinance has ~2 years of 1h bars) would be more exact.
2. **CONTRACTS.md found bStocks have an issuer pause, a per-token blocklist and a sanctions list.** That
   contradicts EXECUTION.md §4. Treat CONTRACTS.md as correct. The landing page's risk section must mention it.
3. **NVDAB pool TVL is ~$4.8M (measured 2026-10-02)**, not $3.35M (2026-09-30).
4. **b402 production access is gated** (merchant application). The team lead must apply.
