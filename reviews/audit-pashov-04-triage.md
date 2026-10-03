# Triage of the real Pashov run 04 (reviews/audit-pashov-04-real.md, commit 453356a)

Triage by agent FIX5 (Sonnet). I can never accept a finding: only the team lead can (docs/AUDIT.md). Launch caps bound every loss: 1,000 USDT per position, 5,000 USDT total (reviews/acceptances.md). All five findings were already KNOWN from earlier scans. Tests: `packages/contracts/test/audit-pashov/PashovFix5.t.sol` (17), `test/unit/DeployPreflight.t.sol` (+2). Forge: 270 pass, 2 skipped (fork tests run separately with FLOOR_FORK=1: 13 pass).

## The five findings

| # | Finding | Severity | Decision | Test |
|---|---|---|---|---|
| 1 | One user fills the TVL cap | Low (design trade-off) | ACCEPT-NEEDS-LEAD, already recommended, unchanged | `test_F5_tvlCapSquat_reproduces_andReleasesOnClose` (FIX3) |
| 2 | Spot push on a disabled token makes the vault sell active tokens | Medium, real | FIXED. A disabled token with a failed guarded price is valued at its last good TWAP (like an active one): V is not understated, so nothing is sold. The TWAP only sizes sells; buys stay suppressed above `dust`; it never sets the lock. Neither of the auditor's fixes was taken (Option A would freeze sells of the active tokens while the disabled pool is bad). Residual: a TWAP raised in a thin disabled pool inflates V, so the vault sells less, never buys (needs a sustained 10-minute manipulation). | `test_F2_disabledTokenSpotPush_doesNotMakeTheVaultSellActiveTokens`, `PashovFix4.test_F2_disabledRaisedTwapDoesNotDriveBuys` (changed: no buy) |
| 3 | Cash lock trusts a price that failed its guard | Medium (harm: lost upside, floor safe), real | FIXED. `_lockCheck` needs: no failed or paused or unpriced asset, no failed held token, every token's multiplier settled. It never trusts the unguarded TWAP. | `test_F3_spotGuardFailure_cannotSetTheLock`, `test_F3_liquidityGuardFailure_cannotSetTheLock`, `test_F3_keeperRebalance_withFailedGuard_doesNotLock`, `test_lead_lock_skipsAnUnsettledMultiplier` |
| 4 | Anyone sets the lock while trading is closed or halted | Medium, real | FIXED. `lockIfBelowFloor` reverts `TradingClosed` unless the market is open and not halted or paused. The lock also needs V below F by a margin of `tolDirectBps` of V (1% default): `V*(BPS+tol) <= F*BPS`. One swap loses at most `tolDirectBps` of its value (<= V), so a fill loss cannot trip it: the lead's 902 -> 897/899 case does not lock; V <= 891.08 (F 900) does. | `test_F4_lockIfBelowFloor_needsAnOpenMarket`, `test_F4_marginMeansASandwichFillLossCannotTripTheLock`, `test_F4_marginBoundary_locksOnlyBelowFloorMinusTolerance` |
| 5 | `rebalancePublic` sandwich | Low (design trade-off) | ACCEPT-NEEDS-LEAD, already recommended, unchanged. The auditor's min(TWAP, spot) reference is bounded by `maxTickDev` (3%) and the vault pays that on every guarded swap; same reason as FIX3 `test_F12_*`. | FIX3 |

## Priority leads

| Lead | Decision | Notes and test |
|---|---|---|
| A rebalance revert removes the cash lock it set | FIXED | In `rebalance` and `rebalancePublic`, when the lock was set by this call and the call cannot trade (wrong direction, amount out of range, nothing to do, failed price for the traded token) it RETURNS instead of reverting. `test_lead_lockSurvivesAKeeperCallThatCannotTrade`, `test_lead_lockSurvivesAPublicCallThatCannotTrade` |
| A rebalance that pokes an old multiplier returns before the lock check | NOT-A-BUG now | A stale multiplier means the lock cannot be set anyway (multiplier must be settled); the next call sets it. `test_lead_lock_skipsAnUnsettledMultiplier` |
| The cash lock skips the multiplier guard | FIXED | Same test. All listed tokens are checked, not only the traded one. |
| Held token with no TWAP blocks all sells after the lock | FIXED | `unwinding` now includes `cashLocked` (E* = 0, the sale does not depend on V). `test_lead_lockedVault_unpricedTokenDoesNotBlockSellsOfOthers` |
| Zero TWAP price passes the dust test | FIXED | `twapOf` reverts on 0, `closeToUSDT` also rejects 0. `test_lead_zeroTwap_isNotAPriceAndBlocksCloseToUSDT` |
| A disabled token's weight stays in USDT | ACCEPT-NEEDS-LEAD (Low) | Upside only, never the floor. Documented in CONTRACTS.md; the risks copy should say that disabling a token leaves its share in cash. |
| `unpause`, `setHalted(false)`, `setNonTradingDay(false)` without a prior state restart the public delay | FIXED | Only a real state change writes `tradingResumedAt` (clearing a day that was closed and is today or past). `test_lead_noStateChange_*`, `test_lead_clearingARealHoliday_*`, `test_lead_haltOnOffRestartsOnlyOnTheRealChange` |
| Preflight: `router.factory() == v3Factory` and `approveTarget` | FIXED | `Deploy._preflight`. `test_router_factory_mismatch_reverts`, `test_pancake_approveTarget_must_be_router` |
| createPosition: every target vs `minTrade`; floor too high for the buy band | FIXED | Every target must reach `minTrade` (`PositionTooSmall`) and the weighted buy band (`BadFloor`). Cost: a 60/40 basket now needs D >= 125 USDT at floor 90%. `test_lead_everyBasketTargetMustReachMinTrade`, `test_lead_floorTooHighForTheFirstBuyBand_isRejected` |
| `_capTransfer` >32 byte return | FIXED | A successful call with long return data counts as good. `test_lead_exitInKind_longReturnDataIsNotASkip` |

## Other leads (one line each)

| Lead | Real? / Severity | Decision |
|---|---|---|
| Keeper can always trade half the amount (`amountInOk`) | Yes, Low | By design (trusted keeper; documented rule `[ceil(x/2), x]`). Keeper is a trusted role. |
| Listing leaves multiplier change time at zero | Low, unproven | NOT-A-BUG: owner-only, `addAsset` stores the live multiplier as baseline and the pool needs a full TWAP window of history anyway. |
| Disabled tokens still limit the defaults | Low, no fund loss | NOT-A-BUG (conservative; owner can only loosen after re-listing rules). |
| Basket the vault cannot buy (issuer pause, beacon) is accepted | Low | NOT-A-BUG: deposit stays in USDT, owner can always exit; the UI should warn. |
| 14-day unwind buffer too short for large positions with a small `maxTradeValue` | Low, bounded by caps (1,000 USDT) | ACCEPT-NEEDS-LEAD (already accepted in FIX4 spirit): with 25,000 maxTradeValue one trade unwinds a launch-cap position. |
| USDT donated to a vault skips the caps | Low | NOT-A-BUG (the donor's own money; I5 and the lock still hold). |
| Token disable forces a full public sale in every vault | Low | By design (guardian/owner trusted role; disabling means exit). Disclose. |
| Cardinality bound assumes 0.75 s blocks | None | NOT-A-BUG (conservative). |
| Owner grants keeper with no delay / keeper tolerance on any Pancake path / keeper pays only TWAP minimum | Low, trusted role | BY DESIGN (trusted-role abuse): a malicious keeper can take up to `tolDirectBps` per trade from the cushion. Docs must disclose that the keeper is trusted within the tolerance, and that a compromised owner key can add keepers. |
| Guardian can cancel an owner pause/halt at once | Low, trusted role | BY DESIGN. Disclose that guardian and owner each hold pause powers. |
| `exitInKind` reports a transfer as skipped | Low | FIXED (see above). |
| Held stock with no TWAP makes `closeToUSDT` revert | Low | NOT-A-BUG (fail closed; `exitInKind` always works). |
| Disabled token at or below `dust` leaves V without `understated` | Low | FIXED by #2/#3 (valued at its TWAP; the lock needs no failed held token). |
| Multiplier poke while market closed ends the guard before the session | Low, unproven | ACCEPT-NEEDS-LEAD: depends on bStock raw price stepping; keeper and guardian can poke earlier; weekend poke is rare. |
| Sell band sized on V hides drift with a small cushion | Low | NOT-A-BUG (documented 25% gap limit; the 24% disclosure is for the weighted case). |
| Public sell band equals keeper band for weights < 100 bps | Low | NOT-A-BUG (still after `publicDelay` and `tolDirectBps`). |
| Buys only at `minTrade`, sells at ~3 USDT | Low (upside) | By design, documented. |
| Public path accepts sells as small as dust+1 | Low | NOT-A-BUG (no profit shown; caller pays gas, vault pays pool fee on a tiny trade). |
| Failed swap of the first token hides the others in the preview | Low | NOT-A-BUG (liveness only; keeper tries next index; public path takes any index). |
| Vault copies fixed block-time slot count | None | NOT-A-BUG. |
| Public path ignores doubled band when E* is 0 | Low | NOT-A-BUG (full unwind of an understated or locked vault is the intent). |
| After maturity or `requestClose` any caller sells the whole position first | Low | By design (unwind). Disclose. |
| Public delay counts time when the keeper cannot trade the token | Low | ACCEPT-NEEDS-LEAD (known 4 scans): keeper always has real sessions first; pause/transition time is short. |
| Sandwich loss on public sell pushes V under F for the lock | Medium as written | FIXED by the margin (#4). |
| Low-gas close leaves deposit in `totalTvl` | Low | NOT-A-BUG (best-effort report; retry with `exitInKind`). |
| One vault's sell makes other vaults' sells revert on `minOut` | Low | NOT-A-BUG (liveness in a fast fall; same as accepted F-04). |
| `_tokenPaused` misses global pause and blocklist | Low | ACCEPT-NEEDS-LEAD (known 2 scans): fail-soft by design; the swap itself reverts for a frozen token. |
| Bad pause data makes `_load` revert | Low, unproven | NOT-A-BUG (no live bStock does this; the three live pause managers are verified). |
| `exec` accepts a fall in `tokenOut` when `minOut` is 0 | None | NOT-A-BUG (vault always passes `minOut` > 0). |
| Tick rounding raises USDT-token0 price by up to 1 bp | None | NOT-A-BUG. |

Leads that only concern owner, keeper or guardian trust (keeper delay, keeper tolerance, guardian cancel, disable) are trusted-role behaviour. The product docs must say: the keeper and guardian are trusted inside `tolAggBps`/`tolDirectBps`, the owner key can add keepers, routers (24 h delay) and disable tokens, and none of them can move user funds out of the vault.

## Freeze readiness

Remaining items the team lead must sign in writing (reviews/acceptances.md):
1. TVL squatting (#1): one user can fill the 5,000 USDT cap with 5 deposits (the user can exit any time). Recommend accept for the launch caps; add a per-owner cap later.
2. `rebalancePublic` sandwich (#5): the caller can keep up to `tolDirectBps` of each public trade, bounded by `maxTickDev` and only after the public delay. Recommend accept.
3. The cash lock is permanent and now needs a 1% (`tolDirectBps`) margin and clean guards: it costs upside only. Recommend accept and disclose in the risks page.
4. Public delay counts from the last trade, and counts pause/multiplier time (needs a drift timestamp). Recommend accept.
5. Disabled token's weight stays in USDT; a raised disabled-pool TWAP can reduce sells. Recommend accept.
6. Trusted-role items (keeper tolerance, guardian cancel, disable forces sale). Recommend accept with disclosure.

Honest view: the real run 04 produced no new finding that was not already known, and every Medium it raised was in the cash lock added one round ago. FIX5 changes the lock (stricter) and `_load` for disabled tokens, which is the same area the last two rounds touched. I think the contracts can be frozen after ONE more clean run on this commit if that run reports nothing new above Low and only the accepted items above; a run that again attacks the lock or the disabled-token valuation would mean the lock should be simplified rather than patched again (for example, only ever set from `lockIfBelowFloor`).
