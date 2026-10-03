# Security review 02: Floor contracts re-check after FIX1 (A12r)

Reviewer: A12r (Sonnet 5.5). Base: `main` at `dfe6f70` (includes FIX1 `a26b506`), branch `agent/A12r`.
Scope: every line of `packages/contracts/src/**` as changed by FIX1 (FloorVault, FloorFactory, interfaces; CPPIMath, SwapGuard, TwapOracle, FloorLens re-read, unchanged). Method: line read, FIX1 diff review, adversarial Foundry tests (`packages/contracts/test/audit/Recheck.t.sol`, 14 tests), Slither re-run, `forge test`, fork tests.

## Test and tool results

- `forge test` (non-fork): all pass (160 pass, 2 skipped before my tests; plus 14 new, all pass).
- `FLOOR_FORK=1 forge test --match-path 'test/fork/*'` against `bsc-rpc.publicnode.com` (read-only): 13/13 pass.
- Slither (`packages/contracts`, `--filter-paths "lib|test|script|vendor"`): 55 results (was 57). Delta: new `assembly` informational hits (`_readBalance`, `_capTransfer`, `_reportClosed`, reviewed by hand, see below), new `calls-loop` for `this.priceOf` in `_tryPrice`, `onPositionClosed` adds no reentrancy hit. No new High/Medium detector result.
- The new tests PASS because there is no High finding; the ones named `_KNOWN_` pin a weakness (they pass while it exists).

## Verdict for gate G3

**GO for the $1k / $5k launch caps**, conditional on the team lead knowingly accepting M-01 (or fixing it, 1 small change) and on the T-lag disclosure (docs item D-1) being on the risks page and FAQ before launch. No Critical or High. The earlier High (F-00) is closed. I could not break the exit path, the TVL accounting, the listing immutability or the multiplier auto-poke.

## Counts by severity (new findings)

| Critical | High | Medium | Low | Info |
|---|---|---|---|---|
| 0 | 0 | 1 | 3 | 3 |

## Earlier findings: verification

| Earlier finding | Verdict | Evidence |
|---|---|---|
| A12 F-00 High: exit lock by bad `balanceOf` | **Verified fixed** | `FloorVault.sol:319-332` `_readBalance`: gas cap 100k, 32-byte return limit, `size != 32` means skip; USDT is sent first (`:293-294`). Tests: ExitGasLock F00/F00b, Fixes F00 (garbage, revert, 1 MB, no-code, burning transfer), plus new `test_r2_exit_threeGasBurningTokens_usdtStillReturned` (3 tokens that burn all gas in both `balanceOf` and `transfer`, exit succeeds with 3M gas), `..._threeBurningReads_closeToUsdt`, `..._reentrantTokenCannotDoubleSpendOrBreakExit` (re-entry blocked, token moved once). I8 holds. |
| A12 F-01 / Pashov F-08 lifetime TVL counter | **Verified fixed** | `FloorFactory.sol:208-213` `onPositionClosed` keyed on `liveDeposit[msg.sender]`, zeroed on first report. New tests: exit three times with two vaults (no double decrement), a fake clone initialised with a fake factory and a direct call from an unregistered address cannot lower `totalTvl`; `exitInKind` twice, then `closeToUSDT` reverts `BadStatus`. Residual: cap can be filled by an attacker who holds 5 x 1,000 USDT open (see L-03). |
| A12 F-02, Pashov F-03 / F-05 `addAsset` re-point | **Verified fixed** | `FloorFactory.sol:322` `AssetExists`; `reenableAsset` (`:338-344`) keeps stored pool/fee/limits, re-runs `_checkPool`, does not touch the multiplier. `lastMultiplier` can no longer be reset. `addAsset` reverts when `uiMultiplier()` is unreadable (`:328-332`). |
| A12 F-03, Pashov F-02 one bad pool freezes sells | **Partially fixed** | Liveness fixed: a failed pool no longer reverts the call (`_load` `:480-487`, `_tryPrice`), tests pass. But the fail-soft rule opens a new lever: M-01. A single-asset vault whose own pool fails still cannot sell (traded asset must be priceable, `:196`); that is the intended fail-closed case. |
| A12 F-04 sells revert when spot lags TWAP | **Accepted (lead), disclosure unmet** | `reviews/acceptances.md` requires the risks page and FAQ to say a sell can be delayed in a fast crash and the value can fall below the floor. `apps/web/app/docs/risks/page.tsx` and `apps/web/app/docs/faq/page.tsx` do not say it (only "Costs rise in a crash" and the 25% gap line). Docs item D-1. Not re-raised as a contract finding. |
| A12 F-05 nobody pokes the multiplier | **Verified fixed in-contract** | `_multiplierSettle` (`:561-572`) pokes and returns on both paths. New tests: `rebalancePublic` pokes and settles; a poke with no change cannot re-arm the window (`lastMultiplierChange` unchanged); no loop or DoS beyond the designed `twapWindow` block. Reentrancy: `pokeMultiplier` is called under `nonReentrant`; a vault re-entry reverts. Keeper must still treat a no-event success as "poked" (FIX1 follow-up). |
| A12 F-06, Pashov F-01 residue between dust and minTrade | **Partially fixed** | Single asset fixed (`_plan` `:515-516`, test `test_r2_residueSingleAssetBetweenDustAndMinTrade_unwinds`). Multi-asset still sticks: L-01. |
| A12 F-07 min deposit | **Verified fixed** | `MIN_DEPOSIT = 1e18` (`FloorFactory.sol:28,160`). |
| A12 F-08 100 bps bound | **Verified (docs)** | T-lag row in CONTRACTS.md states 100 bps for the Pancake route. |
| A12 F-09 low-gas skip | **Verified fixed** for transfer | `:337` reverts below the cap. Read leg: scanned gas 60k to 700k in 2.5k steps with a plain token, no silent skip (`test_r2_lowGasScan_noSilentSkipOnReadLeg_mockToken`). Real beacon proxies cost more per read: unverified, I-01. |
| A12 F-10 holiday table ends 2027-07-05 | **Not fixed** | Open (FIX1 notes it). Add dates before any term crosses 2027-09-06. |
| A12 F-11 multiplier guard only on traded asset | **Not fixed** | Open. Low. |
| A12 F-12 guardian powers | **Not fixed (documented)** | T15. |
| A12 F-13 per-asset `lastRebalance` | **Not fixed** | Open. Low. |
| A12 F-14 initialize front-run | **Unchanged, still not exploitable** | New test confirms a fake-factory clone cannot touch the real factory's accounting. |
| A12 F-15 loose default bounds | **Not fixed** | Open. Info. |
| A12 F-16 / F-17 / F-18 | **Docs** | F-18 resolved by the concurrent-TVL fix. |
| Pashov F-04 `addRouter` on active router | **Verified fixed** | `RouterExists` (`:371`); re-adding a removed router still works with the 24 h delay. |
| Pashov F-05b uiMultiplier unreadable | **Verified fixed** | See F-02 row. |
| Pashov F-06 / F-07 deploy-script checks | **Not fixed** | Script not in FIX1 scope. Open Low. |
| Pashov F-09 halt blocks sells | **Not fixed (by design)** | Info. |
| Pashov F-11 returndata copy | **Verified fixed** | 32-byte limit in `_readBalance` and `_capTransfer`; Fixes `oneMegabyte` passes. |

## New findings

| ID | Sev | Location | Scenario | Fix | Conf | Test |
|---|---|---|---|---|---|---|
| **M-01** | Medium | `FloorVault.sol:480-487` (`_load` value-0 on failed price), `:505-530` (`_plan`), public path `:214-246` | **Fail-soft lets anyone force an unwind of a healthy asset.** A held asset B whose spot is pushed more than `maxTickDev` (300 ticks) from its TWAP for one block fails the deviation guard and is valued at 0. V drops, so cushion and E* drop (below the floor, E* = 0), and every other asset is planned for sale. `rebalancePublic` is permissionless once `publicDelay` (4 h) has passed, which is true at every market open after a night or weekend. An attacker flash-pushes pool B (TWAP is not affected: `observe` extrapolates with the pre-swap tick), calls `rebalancePublic(A)` in the same transaction and sandwiches pool A inside the 100 bps `tolDirectBps`. Position left under-exposed until the keeper buys back, so the user pays fees, up to 1% slippage and the whipsaw, once per `minInterval` per asset. Cost to attacker is the pool fee on the push (about 0.25% of the pushed notional), so it is mostly a griefing / small extraction; bounded by `maxTradeValue` and the launch caps. | For valuation only, use the TWAP even when the spot-deviation guard fails (the deviation guard exists to protect `minOut` of the TRADED asset). Keep value 0 only for history/liquidity failures. Alternative: when `anyFailed`, forbid `rebalancePublic` and allow keeper sells only. | H (reproduced in unit test) | `Recheck.t.sol::test_r2_M01_KNOWN_failedHeldPoolForcesUnwindOfHealthyAsset` (passes while the weakness exists: 2-asset vault exactly on target turns into a full sale of asset 1 when pool 2 spot is pushed 400 ticks); control `test_r2_failedHeldPool_buysSuppressed_keeperCannotBuy` passes. |
| L-01 | Low | `FloorVault.sol:276` vs `:515-516` | **Residue of several assets blocks `closeToUSDT`.** The unwind sells an asset only if `E_i > dust`, but `closeToUSDT` compares the SUM of all stock values to `dust`. Two assets of 0.9 USDT each: keeper has nothing to sell, `closeToUSDT` reverts `StockNotUnwound`; up to `n x dust` (3 USDT by default) can be stuck. Owner still exits in kind. | Compare each asset against `dust`, or let `closeToUSDT` accept `stockValue <= n * dust`. | H | `test_r2_N01_KNOWN_residueOfSeveralAssetsBlocksCloseToUsdt` |
| L-02 | Low | `FloorVault.sol:406` (`previewRebalance`) | **A reverting beacon blinds the keeper and Lens.** `_beaconChanged()` runs unconditionally, so a beacon that reverts makes `previewRebalance` revert; `FloorLens.scan` swallows it and reports nothing to do, although sells never read the beacon and would work. Pre-existing, but now matters more because buys and sells share the preview. | Call the beacon only when a buy is planned, or wrap it in try/catch. | H | `test_r2_N02_KNOWN_revertingBeaconBlindsPreview` |
| L-03 | Low | `FloorFactory.sol:162,208` | **Concurrent cap can still be held full for free.** After the fix, filling 5,000 USDT of cap needs the attacker's own capital to stay open, but they can exit at any moment at no cost, so honest creates revert `TvlCapReached` for as long as the attacker waits (gas only). The previous cost-free burn-and-repeat is gone. Owner can raise `setLimits`. | Accept for launch (cap is a safety valve, not a market), or add a per-address position limit. | H | none (by reasoning; test `test_fix_tvl_capStillBindsConcurrentDeposits` shows the cap binds) |
| I-01 | Info | `FloorVault.sol:319-332` | Read leg of F-09 uses a 100k cap without a `gasleft` guard. Not reproduced with a plain token. Real beacon proxies cost more per read; on the fork `exitInKind` works with a normal gas estimate (fork5/fork9). Worst case is a skip, recoverable with `rescue`. | Add the same `gasleft` revert before `_readBalance` in `exitInKind`. | M | `test_r2_lowGasScan_noSilentSkipOnReadLeg_mockToken` |
| I-02 | Info | `FloorVault.sol:189,219` | The auto-poke makes `rebalance` and `rebalancePublic` return success with no trade. Keepers and the SDK must treat a success without a `Rebalanced` event as a poke (FIX1 follow-up). | Keeper change. | H | `test_fix_F05_...`, `test_r2_poke_publicPathPokesToo_andSettles` |
| I-03 | Info | `FloorVault.sol:353-359` | `_reportClosed` is best-effort with a 100k gas cap and ignores failure. If it fails, the cap stays consumed; the owner can call `exitInKind` again to re-report (idempotent, tested). | None. | H | `test_r2_exit_zeroBalancesAndTwice` |

### Docs items (not contract findings)

- **D-1** (from the F-04 acceptance): add the required disclosure to `apps/web/app/docs/risks/page.tsx` and `apps/web/app/docs/faq/page.tsx`. Sentence needed: in a fast crash a sell can be delayed until spot and the 10-minute average agree, and this can let the value fall below the floor. Not present today.
- D-2: CONTRACTS.md should state that a failed pool prices as 0 and what that does (M-01), and that `totalTvl` is now concurrent and released on close.

## Attack attempts that did NOT work (so they are not repeated)

- Token that returns 1 MB, 64 bytes, nothing, reverts, burns gas, or re-enters from `transfer`: exit completes, USDT is returned first (tests above).
- `onPositionClosed` from a non-vault, from a cloned vault with a fake factory, repeated, or from the same vault after `closeToUSDT`: counter moves once only (`liveDeposit`), cannot underflow (`d <= totalTvl` always).
- Gas-starving `this.priceOf` so `_tryPrice` falls into `catch` while the rest of the call still has gas: not feasible, the 1/64 left cannot pay for the swap (needs a block of about 10M forwarded gas, which prices B easily).
- Value-0 asset making the vault under-sell or buy more: V is only understated, so sells grow and buys are suppressed (`!anyFailed`); `amountIn` division by a zero price cannot happen because value is 0 for a failed asset. A keeper cannot pass a bad swap: the traded asset must price and `minOut` is enforced.
- `reenableAsset` abuse: owner-only, original pool and limits, pool checks rerun; no multiplier reset.
- Poke loop: poke is a no-op when the multiplier is unchanged; only a real token change arms the window.
- TVL underflow, closing twice, zero balances, dust-sized sells (single asset): covered above.

## Invariants (CONTRACTS.md section 12)

I1 holds (100 bps on the Pancake route, documented). I2 holds. I3-I5 hold (E* <= V, E* <= 4C; fail-soft only lowers E*). I6 rounding unchanged. I7, I10, I11, I12 unchanged and hold. **I8 now holds** (was broken by F-00). I9 holds (listing immutable). I13 holds: exits read no factory state; `_reportClosed` is gas-capped and ignored.

## Not checked

- Real compliance-hook gas cost of a bStock `balanceOf` / `transfer` for a 3-asset exit on mainnet (fork tests cover 1 asset).
- Mainnet behaviour of the same-block pool push in M-01 (reasoned from `observe` semantics, not run on a fork).

## Go / no-go for G3

**GO** with the conditions above: (1) team lead decides M-01 (fix recommended, a few lines in `_load`), (2) D-1 disclosure published, (3) F-10 holiday dates before term crosses 2027-09-06, (4) deploy-script checks from Pashov F-06/F-07 done by the deploy owner. No finding requires a failing PoC (no High+).
