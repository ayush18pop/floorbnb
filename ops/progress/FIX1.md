# FIX1 progress (contracts fixes after security review)
Branch agent/FIX1. Tests: non-fork 160 pass / 2 skipped; FLOOR_FORK=1 173 pass / 0 fail; SDK 181 pass; forge fmt clean.

| Finding | Status | Test |
|---|---|---|
| A12 F-00 High (exit lock) | fixed | ExitGasLock.t.sol F00/F00b; Fixes.t.sol test_fix_F00_* |
| totalTvl never decreases (A12 F-01, Pashov F-08) | fixed (factory.onPositionClosed) | Findings F01, Fixes test_fix_tvl_* |
| addAsset re-point (A12 F-02, Pashov F-03/F-05) | fixed (AssetExists, reenableAsset) | Findings F02, PashovPoC F03/F05, Fixes |
| One bad pool freezes sells (A12 F-03, Pashov F-02) | fixed (fail-soft pricing, buys suppressed) | Findings F03, PashovPoC F02, Fixes |
| pokeMultiplier never called (A12 F-05) | fixed in-contract (vault pokes, call is a no-op) | Fixes F05, ForkFloor fork6 |
| Residue dust..minTrade (A12 F-06, Pashov F-01) | fixed | Findings F06, PashovPoC F01 |
| addRouter on active router (Pashov F-04) | fixed (RouterExists) | PashovPoC F04, Fixes |
| A12 F-04 sells revert when spot lags TWAP | ACCEPTED-NEEDS-LEAD (not fixed, pinned) | Findings test_audit_F04_KNOWN_* |
| A12 F-07 min deposit | fixed (1 USDT) | Findings F07 |
| A12 F-09 low-gas skip | fixed (revert on low gas) | Fixes test_fix_F09 |
| Pashov F-11 returndata copy | fixed (32-byte limit) | Fixes oneMegabyte |
| Pashov F-05b uiMultiplier unreadable at listing | fixed (revert) | Fixes |

Open (not fixed): A12 F-08 doc (done in T-lag row), F-10 holiday table ends 2027-07-05 (needs verified NYSE dates; holidays/ not owned), F-11 multiplier guard only on traded asset, F-12 guardian powers (documented T15), F-13 per-asset lastRebalance, F-15 loose default bounds, Pashov F-06/F-07 deploy-script checks (beacon impl, downcasts, USDT decimals).
Follow-ups: keeper should still call pokeMultiplier each cycle and treat a successful rebalance with no Rebalanced event as a poke no-op; SDK cppi.ts unwind rule should mirror `E_i > dust` for E*==0; Lens could expose multiplier state.
