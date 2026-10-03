# Triage of the real Pashov run 02 (reviews/audit-pashov-02-real.md, commit 41bc39f)

Author: FIX3. Branch agent/FIX3. AI-assisted audit by Pashov Audit Group skills, not a formal audit.
All fix tests are in `packages/contracts/test/audit-pashov/PashovFix3.t.sol` (PoC fails on the old code, passes now) unless noted.
Max-loss figures use the launch caps: 1,000 USDT per position, 5,000 USDT total.

## Findings 1-3 (TakerProbe, `ops/spikes/taker-probe/src/TakerProbe.sol`)

Real, but the contract is a throwaway research spike that is never deployed and holds no user funds. Severity: Info (out of deploy scope).
Decision: FIX (cheap): owner-only on `execAggregator`, `execPancake`, `send`; `minOut > 0`; `router` may not be one of the swapped tokens.
`docs/AUDIT.md` now states that `ops/` is out of scope; the next run should pass `packages/contracts/src` and `packages/contracts/script` only.

## Findings 4-13

| # | Real? | Severity | Max loss | Decision | Test |
|---|---|---|---|---|---|
| 4 | Yes. Demo-size position: price falls 5%, gap 6 USDT is above the band but below `minTrade` (20), so the vault kept the excess. | Medium | the floor can be breached on a small position by the part of the move that was not sold; bounded by the 1,000 USDT cap | **FIX** | `test_F4_smallPositionSellsBelowMinTrade` |
| 5 | Yes (reproduced). One address fills 5 x 1,000. | Low (griefing, no loss) | 0 | **Listed (recommend accept)**, see below | `test_F5_tvlCapSquat_reproduces_andReleasesOnClose` |
| 6 | Yes. 1 wei plus a spot push beyond `maxTickDev` made `_price` revert, so `closeToUSDT` reverted `PriceDeviation`. | Medium (owner could not close to USDT; `exitInKind` still worked, no loss) | 0 | **FIX** | `test_F6_dustAndPushedPoolDoNotBlockClose`, control `test_F6_control_realStockStillBlocksClose` |
| 7 | Yes. A disabled token with a failed pool set `anyFailed`, which blocks buys of every other asset. | Low | 0 (missed exposure only) | **FIX** | `test_F7_disabledDustTokenDoesNotStopBuys` (and the invariant handler `GUARD_buyWithFailedPool` now exempts disabled assets) |
| 8 | Yes, but needs a TWAP outage on a pool the vault holds (200 swaps in the old 200-slot window, now much dearer, see #13). V is understated, E* drops, the vault sells other assets. | Medium | forced sells at fair price: tolerance 0.3% plus pool fee per sale, bounded by `maxTradeValue` per `minInterval`; round trip about 1% of at most 1,000 USDT per cycle | **FIX** (design choice, see below) | `test_F8_noTwapOnHeldTokenSuspendsSellsOfOthers`, `test_F8_noTwapStillAllowsLifecycleUnwind` |
| 9 | Yes. Per-token band lets a 3-token basket drift 3 bands. | Medium | extra exposure of up to (n-1) bands of V on a basket | **FIX** (band scaled by weight, same as Pashov's suggestion) | `test_F9_sellBandScaledByWeight` |
| 10 | Yes. Preview returned the first token even when `rebalance` would revert `MultiplierTransition`, hiding the others from the keeper. | Low | 0 | **FIX** (`_multiplierBlocked`; a merely STALE multiplier still shows, because the vault pokes it, A12 F-05) | `test_F10_previewSkipsMultiplierBlockedToken` |
| 11 | Yes. Wall-clock delay opened the public path at the start of the next session. | Low | the public sandwich of #12, so <= 100 bps of one capped trade | **FIX** (open-market seconds, O(1)) | `test_F11_publicDelayCountsOpenTimeOnly`, `test_F11_openSecondsMatchesBruteForce` |
| 12 | The exploit exists (spot moved inside `maxTickDev`, vault swaps at the TWAP tolerance). Pashov's fix does NOT work: a pushed spot only makes `max(twap, spot)` or `min(twap, spot)` equal the TWAP again, because the attacker pushes the price AGAINST the vault. Nothing on chain can see a push made in the same block except the TWAP, which is the guard. | Low | <= `tolDirectBps` (100 bps) of one trade, so <= 10 USDT per position per `minInterval`, minus the attacker's own pool fees (25 bps each way plus the cost of moving price) | **NOT-A-BUG as proposed; residual DESIGN-ACCEPT** (see below) | `test_F12_spotReferenceDoesNotChangeMinOut_pureMath` |
| 13 | Yes in part. 200 slots cover about 150 s of 0.75 s BSC blocks, so a per-block swapper makes `observe(600)` revert. The vault already fails soft (price fails, no trade, V uses the TWAP fallback or counts 0, see #8). The live pools have 3,000-5,000 slots (CONTRACTS.md section 2). | Medium (with #8) | see #8 | **FIX**: factory `addAsset` / `reenableAsset` and `createPosition` require `max(200, ceil(window * 4 / 3))` slots (800 for 600 s); deploy preflight too | `test_F13_createPositionRequiresSlotsForWindow`, `Factory.t.sol test_addAsset_checks`, `DeployPreflight.t.sol test_cardinality_below_window_need_reverts` |

### What the team lead must decide (plain words)

1. **#8 design choice (I fixed it, please confirm).** When one held stock has no price history at all, the vault cannot know its
   total value. Old behaviour: count that stock as zero and sell the OTHER stocks to be safe (an attacker who breaks one pool for a
   while can force needless sells, costing fees). New behaviour: stop de-risking sells of the other stocks while that is true
   (still unwinding on close, maturity, or a disabled stock). Trade-off: during a real long outage of one pool the vault will not
   reduce risk in the other stocks by itself; users can still `exitInKind`. My recommendation: keep the new behaviour (a forced
   sell loses money for certain, a paused sell only loses a chance to de-risk during an outage that the guardian can answer
   by disabling the asset).
2. **#11 side effect on the demo.** `publicDelay` now counts only open-market time. With the 4 h window and the 4 h default delay
   the public path is available from the second trading day after the last trade. A position created at 08:00 cannot use
   `rebalancePublic` on the same day (EXECUTION_PLAN R4 mentions this route). If the demo needs a same-day public trade, set
   `publicDelay` to 3600 (the minimum, already used by the fork tests) in `script/params/*.json`. Please decide.
3. **#5 TVL squatting: recommend accept.** A per-owner cap does not help, one person can use many addresses; squatting costs the
   attacker nothing and loses no funds (they can close at any time, you can raise the cap with `setLimits`). The cap is a temporary
   launch guard. I cannot accept; as Low it may simply be listed.
4. **#12 sandwich on `rebalancePublic`: recommend accept.** The public path is the last-resort fallback. The loss is at most about 1% of
   one capped trade (about 10 USDT on a 1,000 USDT position) and the caller needs capital and pays pool fees to move the price. Making
   the tolerance tighter would make the fallback revert more often, which is the already accepted F-04 trade-off. Severity
   Low; list.
5. **Live pools must keep 800+ observation slots** (for window 600) or `createPosition` reverts `OracleHistoryTooShort`. Today they have
   3,000+, so nothing to do. Re-check at deploy (preflight now checks it).

## Leads

| Lead | Decision |
|---|---|
| `amountInOk` rounds the lower bound to zero | **FIX**: non-zero and `>= ceil(computed / 2)` (`test_lead_amountInOkRoundsLowerBoundUp`); SDK mirror and vectors updated |
| Preflight accepts values the factory rejects (`buyBandBps` 2000 vs 1000) | **FIX**: preflight bound 1000, `DeployPreflight test_buyBand_above_factory_bound_reverts` |
| Deploy reverts when the beacon is zero | **FIX**: `setTokenBeacon` is skipped when the beacon is zero |
| `addAsset`: fee at or above `tolDirectBps` | **FIX** (`test_lead_addAssetSanity`) |
| `addAsset`: `maxTradeValue` below `minTrade` | **FIX** (same test) |
| `addAsset`: multiplier functions not checked | **FIX**: `hasPendingMultiplier` and `effectiveAt` must be readable |
| `addAsset`: zero multiplier | **FIX** (`test_lead_addAssetZeroMultiplierReverts`) |
| `setDefaults` zero `minInterval` / `dust` | **FIX**: `minInterval >= 60`, `dust > 0` (`test_lead_setDefaultsLowerBounds`) |
| `createPosition` while halted | **FIX**: reverts like pause (`test_lead_createPositionWhileHaltedReverts`) |
| Position outlives the holiday table | **FIX**: guardian `setHolidayHorizon`, deploy and SetHolidays set it from `coversThroughDay` (2027-12-31) (`test_lead_termBeyondHolidayTableReverts`). Concrete-only function, interface unchanged. Extend the table AND the horizon before 2027-12-31 minus 400 days. |
| `_capTransfer` treats no-code as success | **FIX** (`test_lead_capTransferNoCodeIsNotSuccess`) |
| USDT sent directly to a vault skips caps | NOT-A-BUG: it is the user's own money in their own vault; the caps limit deposits through the factory (launch guard), not donations. Info. |
| Longer TWAP window not checked against listed pools | **FIX** through #13: `createPosition` checks every basket pool against the current window |
| Disable and re-enable makes every vault sell and buy back | Listed, Low. Guardian or owner only; needs a trusted key; costs fees only (about 1% of exposure, within caps); documented in T15. |
| Donation above `dust` blocks `closeToUSDT` | Listed, Low. Each repeat costs the attacker the stock; `exitInKind` stays open; the unwind then sells the donated stock. |
| USDT hook calls `initialize` first | Listed, Info. BSC USDT has no hook; creation would revert, no loss. |
| Any contract can initialise its own clone | NOT-A-BUG: a fake vault cannot touch the real factory (`onPositionClosed` only releases registered vaults). |
| `balanceOf` of one stock reverts in `_load` | Listed, Low. Needs a bStock upgrade that breaks `balanceOf`; the beacon guard and guardian `disableAsset`, and `exitInKind` remain. Not changed to avoid hiding real errors. |
| Spot push on one pool stops all buys | Listed, Low (missed exposure only, accepted fail-closed behaviour from A12 F-03, pinned by `test_r2_failedHeldPool_buysSuppressed`). |
| Gas griefing of price self-calls | NOT-A-BUG: the pool read cannot be made to fail with 1/64 gas left (Pashov agents agree). |
| V and tick rounding for USDT-token0 pools (two leads) | Listed, Info. At most 1 bp, no trade crosses a band because of it; changing the rounding would touch I6 vectors. |
| Fallback value trusts a thin pool's TWAP | Listed, Low. The TWAP guard history plus caps; `minLiquidity` is enforced on the trading path. |
| Multiplier guard stops sales during a full unwind | Listed, Low. Short window (`twapWindow`, 10 min) after a real split; an unguarded sell would use a stale price. |
| Multiplier change of one token mis-sizes another | Listed, Low, already known (A12 F-11, skipped by FIX2). |
| `_plan` blocks buys when a guard fails but the TWAP is right | Listed, Info. Fail-closed by design (missed exposure only). |
| Trade rate limit slow for a large fall | Listed, Low. Same family as accepted F-04; launch caps. |
| Thin-pool TWAP manipulation, sell low and buy high | Listed, Low. Covered by T3 (`maxTickDev`, `tol`, `maxTradeValue`). |
| Zero `dust` leaves unsellable remainder | **FIX** via `dust > 0` in `setDefaults`. |
| Low-gas `balanceOf` skip in exit paths | Listed, Low. Owner only; owner chooses the gas. |
| Keeper resets public delay with a zero-size trade | **FIX** (same as the first lead, zero is rejected). |
| Public path ignores the doubled band in the full unwind | Listed, Low. At most about 1% of a small sale. |
| Each public trade resets the public delay for the whole vault | Listed, Low. Known keeper-offline case; the keeper path is not delayed. |
| Keeper gets the wide tolerance on any Pancake path; keeper pays only TWAP minimum; aggregator can change logic | Listed, Low. Keeper trust model, T1 (loss <= tol of a capped trade per `minInterval`). |
| Keeper cannot split a sale too large for a thin pool | Listed, Info. The factory `maxTradeValue` caps each sale; pools are 1M+ USDT. |
| Low-gas close leaves deposit in `totalTvl` | NOT-A-BUG: 63/64 rule leaves enough gas for the gas-capped report; `_reportClosed` is best effort by design. |
| Real fall makes sells revert until the TWAP catches up | Accepted already: A12 F-04 (T-lag). Not re-opened. |
| Holiday script accepts unix seconds as day numbers | **FIX**: Deploy preflight and SetHolidays now also require the last day <= 30,000 (about year 2052), so a file in unix seconds is rejected. |
| Known-from-earlier-scan list (`positions[]` growth, never-closed deposit, `pokeMultiplier` DoS, early close, ...) | Not re-checked here; all were triaged in A12 / FIX1 / FIX2 (see reviews/security-02.md and ops/progress). |

## Not done / residual

- Fork tests could not run here (no BSC RPC in this environment). The fork path uses `publicDelay` 3600 inside one window, which the new rule satisfies.
- The audit must be re-run on the final commit of this branch (src/ and script/ changed).
