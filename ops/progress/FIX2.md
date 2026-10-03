# FIX2 progress (residual fixes after A12r)
Branch agent/FIX2. Tests: forge 193 pass / 2 skipped (non-fork), FLOOR_FORK=1 206 pass / 0 fail; SDK 303 pass; keeper 34 pass (5 fork skipped); web build ok; forge fmt clean.

| Item | Status | Test |
|---|---|---|
| M-01 Medium: failed spot guard understated V | fixed: `_load` values a guard-failed asset at its TWAP (`twapOf`: history + TWAP only); value 0 only when no TWAP at all; failed asset still cannot be traded or bought; `previewRebalance` skips it | Recheck.t.sol `test_fix2_M01_pushedHeldPoolDoesNotForceUnwind`, `..._rebalancePublicCannotBeForced`, `..._noTwapAtAll_valuedZero`; F-03/F-02 tests (Findings, PashovPoC, Fixes, `test_r2_failedHeldPool_buysSuppressed`) still pass |
| L-01 closeToUSDT sum vs dust | fixed: per-asset `> dust` check | `test_fix2_L01_residueOfSeveralAssetsDoesNotBlockCloseToUsdt`, `..._assetAboveDustStillBlocksClose` |
| L-02 beacon revert blinds preview | fixed: `_beaconChangedSoft` (revert = buys hidden, sells shown) | `test_fix2_L02_revertingBeaconDoesNotBlindPreview` |
| Holiday table | extended to 2027-12-31: added 2027-09-06, 2027-11-25, 2027-11-26 (early close, treated as closed), 2027-12-24 (Christmas observed). 2027-12-31 is open (Jan 1 2028 is a Saturday, no observed holiday). Source https://www.nyse.com/trade/hours-calendars, fetched 2026-10-03, all 16 dates match. Nothing UNVERIFIED. SetHolidays now checks sorted and reaches 2027-12-24. SDK `market.ts` copy updated (test keeps it equal to the JSON). Extend before any term crosses 2028-01-17. | sdk market.test `holiday table equals the contracts JSON` |
| Deploy.s.sol checks (Pashov F-06/F-07, A12) | done, read-only `_preflight` before `startBroadcast`: USDT 18 decimals, asset decimals, uiMultiplier readable, pool == v3Factory.getPool, token0/token1 order, liquidity >= minLiquidity, cardinality >= 200, observe(twapWindow) works, beacon impl == approvedTokenImpl (beacon required on chain 56), router allowlist non-empty + lengths + Pancake router listed, keepers non-empty, cast ranges (uint24/uint128), caps and defaults bounds, holiday table reaches 2027-12-24. Nothing broadcast. | test/unit/DeployPreflight.t.sol (14) |
| D-1 disclosure | risks page + FAQ entry added; CONTRACTS.md T-lag row now says accepted; pricing note added | web build |
| Keeper | pokes `factory.pokeMultiplier` each cycle for stale multipliers (assets from FLOOR_ASSETS and tokens seen in previews; runs before the window check; dry run never sends); success without Rebalanced event = `poke_noop` skip, not failure | keeper.test: poke no-op, pokes stale multiplier |
| SDK cppi | `planSwap` mirrors `_plan` incl. unwind rule E_i > dust; 120 vectors generated from the real `FloorVault._plan` (PlanHarness, `GEN_PLAN_VECTORS=1`) | cppi.test planSwap vectors; PlanVectors.t.sol |
| ABIs | regenerated (gitignored output) | |

Skipped (not trivial / not asked): A12 F-11 (multiplier guard only on traded asset), F-13 (per-asset lastRebalance), F-15 (loose default bounds in factory), I-01 gasleft guard before the read leg of exitInKind, L-03 per-address position limit. Real `56.json` not run through preflight (owner/keepers are placeholders).
