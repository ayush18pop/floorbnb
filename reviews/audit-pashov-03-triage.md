# Triage of the real Pashov run 03 (reviews/audit-pashov-03-real.md, commit 10a8575)

Triage by agent FIX4 (Sonnet). I can never accept a finding: only the team lead can (docs/AUDIT.md). Launch caps bound every loss: 1,000 USDT per position, 5,000 USDT total (reviews/acceptances.md). Tests: `packages/contracts/test/audit-pashov/PashovFix4.t.sol` (28), `test/unit/DeployPreflight.t.sol` (+6). Forge: 250 pass, 2 skipped (fork tests, run separately with FLOOR_FORK=1: 13 pass).

## The six findings

| # | Finding | Severity | Decision | Test |
|---|---|---|---|---|
| 1 | One user fills the TVL cap | Low (design trade-off) | ACCEPT-NEEDS-LEAD, already recommended, unchanged | `test_F5_tvlCapSquat_reproduces_andReleasesOnClose` (FIX3) |
| 2 | Disabled token with a raised thin-pool TWAP makes the vault spend its USDT | Medium, real | FIXED. A disabled token whose guarded price fails is left OUT of V; buys are suppressed while it is worth more than `dust`. (The auditor's one-line fix would have broken Pashov 02 #7: 1 wei of dust must not stop buys.) | `test_F2_disabledRaisedTwapDoesNotDriveBuys` (fails on old code), `test_F2_control_disabledDustWithBrokenPoolStillAllowsBuys` |
| 3 | Buy band not scaled by weight | Low-Medium, real | FIXED. `buyband_i = max(1, buyBandBps * bandMul * w_i / BPS)`, same as the sell band. Rule written in CONTRACTS.md section 5. SDK mirror and 120 plan vectors regenerated from the real `_plan`. | `test_F3_threeTokenBasket_*`, `test_F3_heavyToken_bandsScaleToo`, `test_F3_hysteresis_*` |
| 4 | Preview returns a paused token | Low, real | FIXED. `_load` reads `pauseManager().isTokenPaused` (gas-capped, fail-soft); preview skips paused tokens. | `test_F4_previewSkipsPausedToken` |
| 5 | Public delay counts holidays and halts | Low-Medium, real | FIXED. `factory.hasOpenSeconds` walks days backwards, skips `nonTradingDay`, and ignores time before `tradingResumedAt` (last unpause or un-halt). Bound on `publicDelay` is now 1 h..24 h of OPEN time. | `test_F5_holidaysDoNotCountForPublicDelay`, `test_F5_haltDoesNotCountForPublicDelay`, `test_F5_pauseResetsPublicDelay`, `testFuzz_hasOpenSeconds_*`, `test_hasOpenSeconds_gasBoundedOverLongHolidayRun` |
| 6 | `rebalancePublic` sandwich | Low (design trade-off) | ACCEPT-NEEDS-LEAD, already recommended, unchanged (a spot reference cannot help, see `test_F12_*`) | FIX3 |

## Priority leads

| Lead | Decision | Notes and test |
|---|---|---|
| (a) Vault buys again after the cash lock | FIXED (real: contradicted the public claim) | `cashLocked` stored; set by `rebalance`, `rebalancePublic` and the new permissionless `lockIfBelowFloor()` when V <= F while Active, never from an understated V. E* is 0 for the rest of the term. I1-I13 and the invariant suite stay green; I5 is now stronger. Residual: a flash dip that no call observes does not lock, and the lock is permanent (a TWAP pushed down for 10 minutes in a thin pool would lock the position into cash for good, which costs upside only, never the floor). Tests `test_lead_cashLock_*`, `test_lead_lockIfBelowFloor_*`. Keeper follow-up (optional, no change made): call `lockIfBelowFloor()` when it sees V <= F with nothing to sell. |
| (b) Small position gets no stock | FIXED | `createPosition` reverts `PositionTooSmall` when no token's initial target reaches `minTrade` (50 USDT at floor 90% with `minTrade` 20). 1-USDT deposits are now rejected. `test_lead_smallPositionRejected`, `..._oneTokenReachingMinTradeIsEnough`. |
| (c) Paused bStock keeps last price in V | FIXED (conservative) | Buys of the others are suppressed while a paused token is held; sells and exits go on. `test_lead_pausedHeldTokenSuppressesBuys`. Residual: V still shows the frozen price. |
| (d) addAsset / reenableAsset / setDefaults checks | FIXED, except beacon on chain | Fee in bps x 2 must be <= `tolDirectBps` (margin); `maxTradeValue >= minTrade` and the three multiplier getters were already there, now shared and repeated in `reenableAsset`; `setDefaults` uses the shared `DefaultsCheck` library (same as the constructor and the deploy preflight), requires listed fees to fit the new `tolDirectBps` and listed trade caps to cover the new `minTrade`. Beacon proxy cannot be read on chain: checked in the deploy preflight via the EIP-1967 slot (all three live bStocks verified on BSC: `0x156d...93a3`). Tests `test_lead_addAsset_*`, `test_lead_reenable*`, `test_lead_setDefaults_*`, preflight tests. |
| (e) Deploy | FIXED | `_u16/_u32` check before casting; preflight checks pool fee vs tolerance, multiplier getters, beacon slot, `publicDelay` bound (via `DefaultsCheck`); runbook note that the deployer stays owner until `acceptOwnership` (Deploy natspec and CONTRACTS.md step 8); SetHolidays checks `coversThroughDay`. Tests `test_load_checksNarrowingBeforeCast` etc. |
| (f) Unwind horizon | FIXED | A term must end 14 days (`UNWIND_BUFFER`) before `holidayHorizonDay`. `test_lead_termMustLeaveRoomForTheUnwind`. |

## Other leads

| Lead | Decision | Reason |
|---|---|---|
| Keeper stretches full unwind with half-size sells / keeps public path closed with half-size trades | NOT-A-BUG (keeper is trusted; `closeToUSDT` waits, `exitInKind` always works; per-asset public delay now limits the reach) | Only a keeper can do it. |
| Deploy casts, preflight skips addAsset checks, deployer key owner, publicDelay bound, setDefaults vs preflight, post-maturity horizon, reenable checks, setDefaults vs fee, addAsset beacon / fee margin | FIXED | See (d) to (f). |
| `addAsset` maxTradeValue / multiplier getters / zero multiplier | FIXED earlier (FIX3), shared now | |
| Stock donation makes `closeToUSDT` revert; dust below one raw unit | FIXED (dust) / NOT-A-BUG (donation) | `dust >= 0.001 USDT` is now enforced, so a stray unit of stock is always below dust. A large donation needs more unwind sells; owner has `exitInKind`. |
| One wei of a stock with no TWAP stops `closeToUSDT`; 1 wei of disabled no-TWAP token stops CPPI sells | NOT-A-BUG | Needs a pool with a broken oracle, owner has `exitInKind`; sells stop only while the oracle is dead (fail closed on purpose, Pashov 02 #8). |
| Vault checks 200 slots, not the window | FIXED | `_minCardinality()` in the vault uses ceil(window*4/3) like the factory. `test_lead_vaultChecksSlotsForItsOwnWindow`. |
| Cardinality assumes 0.75 s blocks | NOT-A-BUG (conservative: over-requires slots if Pancake writes per second) | |
| A trade of one token resets public delay for every token; keeper keeps public closed for others | FIXED | Public delay is per asset (from `lastTradeAt[asset]` or the start). `test_lead_publicDelayIsPerAsset`. Handler for I10 updated. |
| Public delay counts from last trade, not drift start | ACCEPT-NEEDS-LEAD (Low) | Needs a drift timestamp (more storage). The keeper path is the main path; the public path is a fallback and is already capped by band 2x, `tolDirect` and caps. |
| `valuation()` returns low V where the interface says it reverts | NOT-A-BUG (doc) | CONTRACTS.md documents the understated V. |
| Disabled/enabled churn makes vaults sell and buy back | NOT-A-BUG | Guardian or owner action, costs only fees, bounded by caps. |
| Frequent multiplier change blocks trading | NOT-A-BUG | Fail-closed by design (T-multiplier). |
| Weights below 50 bps: public band equals keeper band | NOT-A-BUG | Both bands now scale by weight, floor of 1 bp. |
| Spot push blocks buys of all tokens / blocks sells of one stock | NOT-A-BUG (known F-04 / T-lag, accepted) | Costs the attacker pool fees; retry and `rebalancePublic`. |
| Extreme tick prices to 0 | NOT-A-BUG | Needs a held pool at +-414k ticks. Treated as "no TWAP" and fails closed. |
| Rounding of USDT-token0 price | NOT-A-BUG | Under 1 bp, dust. |
| Initialise by any contract / USDT hook | NOT-A-BUG | A fake vault is not registered in the factory; BSC USDT has no hook. |
| USDT sent directly to a vault skips caps; unclosed position holds the cap; positions[] growth; deposits while halted | NOT-A-BUG / same as #1 (launch caps) / halted fixed in FIX3 | |
| Longer TWAP window not checked on listed pools | FIXED in FIX3 (`createPosition` re-checks) and now in the vault | |
| `_capTransfer` no-code, `_readBalance` low gas, `_load` balanceOf revert, price self-call gas | FIXED earlier or NOT-A-BUG | Exit paths are gas-capped and reverting on low gas is deliberate (A12 F-09). A `balanceOf` revert in `_load` fails closed (no trade) and exits do not use it. |
| `_reportClosed` low gas | NOT-A-BUG | Same as the cap lead (#1 accepted). |
| Multiplier change of one token mis-sizes another; guard stops full unwind; pending flag never clears; pokeMultiplier anyone | NOT-A-BUG | Fail-closed; unwind is not affected for tokens that are not changing; exits never read it. |
| TWAP raised by own buys; thin-pool manipulation sells low and buys high | ACCEPT-NEEDS-LEAD (Low), covered by T-manip and `maxTradeValue`, tolerance, launch caps | Already in the accepted threat list. |
| Keeper pays only TWAP minimum; keeper gets wide tolerance via any Pancake router; allowlisted aggregator can change logic; keeper cannot split large sell; trade-rate limit slow in a crash | NOT-A-BUG (trusted keeper, SwapGuard balance-delta checks, router allowlist 24 h delay) | |
| One vault's sell blocks the next vault's sell | ACCEPT-NEEDS-LEAD (Low) | Same cause as accepted F-04; fallback exists. |
| Isopen after early close | NOT-A-BUG (documented, guardian can mark the day closed) | |
| `SwapGuard.exec` tokenOut balance falls with minOut 0 | NOT-A-BUG | `minOut` is never 0 for a non-dust trade, and the token-in delta is checked. |
| No function moves a token to a new pool | NOT-A-BUG (documented design: a token is listed once so live vaults cannot be re-priced) | |
| TakerProbe, spikes | OUT OF SCOPE (ops/spikes, not deployed) | Hardened in FIX3. |

## Needs the team lead in writing

- #1 TVL squatting and #6 public sandwich (already recommended, Low).
- The cash lock is permanent for the term (a behaviour the product copy already states). Recommend accept.
- Public delay counts from the last trade, not from drift start (Low). Recommend accept.
- Behaviour changes in new vaults only: 1-USDT / sub-50-USDT positions are rejected; `publicDelay` max is 24 h of open time.

The audit must be re-run on the final commit.
