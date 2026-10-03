# Security review 01: Floor contracts (A12)

Reviewer: A12 (Sonnet 5.5, independent of the authors A05/A06/A07). Commit reviewed: `76fbae8` (branch `agent/A12`, from `main`).
Scope: every line of `packages/contracts/src/**` (FloorVault, FloorFactory, FloorLens, CPPIMath, TwapOracle, MarketHours, SwapGuard, interfaces; vendored TickMath/FullMath/BitMath/CustomRevert spot-checked), `script/Deploy.s.sol`, `script/params/56.json`, `holidays/nyse_2026_2027.json`, and the tests/mocks. Spec: CONTRACTS.md §4-§9, §12, §15, DECISIONS.md, EXECUTION_PLAN §6.4 plus P2, P5, P6.
Method: line-by-line read, threat/invariant walk (tables below), Slither, empirical probes on a BSC fork (read-only, local), and Foundry PoCs in `packages/contracts/test/audit/`.

## Verdict for gate G3

**NO-GO on the current commit. Conditional GO after F-00 is fixed and re-checked** (one High: the exit path can be locked by a third-party token upgrade). Also fix before deploy: F-01, F-02 and F-05 (small changes). F-03 and F-04 are design weaknesses in the core promise (selling in a fast fall). They can ship with the $1k/$5k launch caps and honest disclosure, but the team lead should decide that knowingly. No Critical finding. I found no way for a keeper, router, guardian or another user to take funds beyond the stated tolerances.

## Counts by severity

| Critical | High | Medium | Low | Info |
|---|---|---|---|---|
| 0 | 1 | 5 | 8 | 7 |

## Findings

Confidence: H = I reproduced it or the code path is unambiguous; M = reasoned from code and docs, plausible but depends on an external behaviour; L = speculative.
PoC column: file in `packages/contracts/test/audit/`. Every PoC asserts the SECURE behaviour, so it FAILS on the reviewed commit and should PASS after the fix. Each has a passing control test (same set-up, hostile condition removed) in `Controls.t.sol` or beside it.

| ID | Sev | Location | Exploit scenario | Fix suggestion | Conf | PoC |
|---|---|---|---|---|---|---|
| **F-00** | **High** | `FloorVault.sol:284-289` (`exitInKind` balanceOf try), `:260` (`closeToUSDT`), `:310` (`rescue`) | **A hostile or buggy bStock upgrade locks all USDT.** `exitInKind` calls `try IERC20(token).balanceOf(this)` with **all gas** and a Solidity `try` that decodes the return data. (a) If `balanceOf` succeeds but returns fewer than 32 bytes (a beacon implementation set to an address with no code, a selfdestructed implementation, or a fallback that accepts any call), the decode fails and the revert is raised **in the caller; `catch` does not absorb it**. `exitInKind` reverts, so does `closeToUSDT`, and `rescue` needs `Closed`, so there is no exit. (b) If `balanceOf` burns all gas, each burn leaves 1/64, so with 2 or 3 assets (all bStocks share one beacon) the vault cannot pay for the USDT transfer even with 100M gas. The three bStocks share one beacon whose owner is a single EOA (CONTRACTS.md §2, T7), so one transaction can lock every Floor vault. This breaks I8 ("owner can always exitInKind regardless of token reverting") and the stated promise "USDT is never subject to bStock restrictions". The author capped the gas of `transfer` (500k) but not of `balanceOf`. | Replace the `try` with a gas-capped low-level read: `(bool ok, bytes memory r) = token.staticcall{gas: 100_000}(abi.encodeCall(IERC20.balanceOf,(address(this))));` and treat `!ok \|\| r.length != 32` as "skipped". Do the same in `closeToUSDT` (skip a token whose read fails when the owner chooses to exit in kind) and cap the returndata copy in the transfer call. Add `require(gasleft() > 64 * EXIT_TRANSFER_GAS / 63 + 100_000)` before each capped call so a low-gas tx reverts instead of silently skipping (see F-09). Add a fuzz/unit test with a token whose `balanceOf` returns empty data and one that burns gas. | H | `ExitGasLock.t.sol`: `test_audit_F00b_exitInKindStillReturnsUsdtWhenBalanceOfReturnsNothing` (single asset, default gas) and `test_audit_F00_exitInKindStillReturnsUsdtWhenBalanceOfBurnsGas` (2 assets, 100M gas). Control: `test_audit_control_F00_exitInKindWorksWhenTokensBehave` passes. |
| F-01 | Medium | `FloorFactory.sol:72,163` | **Launch cap can be burned for free (DoS).** `totalTvl` counts cumulative deposits and never decreases (the NatSpec admits it). Anyone with 1,000 USDT opens a position, calls `exitInKind` (USDT comes back), and repeats 5 times: `maxTotalTvl` (5,000) is used up at zero cost, and every honest `createPosition` reverts `TvlCapReached` until the owner raises the cap. Honest use also drains it: the plan's own smoke tests and demo positions that are closed and reopened consume cap. Owner can recover with `setLimits`, so no funds are at risk, but the demo can be blocked. | Make the cap concurrent: vaults call `factory.onClosed(deposit)` once from `closeToUSDT`/`exitInKind` (guard: `msg.sender` is a registered position and not yet released), or measure TVL as the sum of position balances off-chain and drop the on-chain total. Cheaper: keep the lifetime counter but set `maxTotalTvl` far above what you are willing to risk and rely on `maxDeposit` (per position) plus a per-address cap. | H | `Findings.t.sol::test_audit_F01_launchCapCannotBeExhaustedForFree`; control passes. |
| F-02 | Medium | `FloorFactory.sol:300-328` | **Owner can re-point a live asset's oracle.** `addAsset` has no "already listed" check. Calling it again for an active token replaces `pool`, `fee`, `minLiquidity` and `maxTradeValue`, and every existing vault reads these live. It also silently resets `lastMultiplier` to the current value without setting `lastMultiplierChange`, which skips the multiplier guard. An owner key plus a keeper key (or a router) can point NVDAB at a thin or stale 0.05%/1% pool whose TWAP is far below the real price, set `maxTradeValue = uint256.max`, and sell through a router that pays the real price minus the gap, once per `minInterval`. The docs say the owner "cannot change params of existing positions" (§7, T15). It is the one place where that is not true. Not exploitable by the owner alone. | Revert in `addAsset` if `assets[token].pool != address(0)`. Add `setAssetLimits(token, minLiquidity, maxTradeValue)` with hard bounds if tuning is needed. Never touch `lastMultiplier` in `addAsset` after the first listing. | H | `Findings.t.sol::test_audit_F02_addAssetCannotRepointALiveAsset`. |
| F-03 | Medium | `FloorVault.sol:399-425` (`_load`), `:389-394` (`_price`) | **One unhealthy pool freezes the whole basket, sells included.** `_load` prices every asset (and any asset with a leftover wei) and any guard failure (`PriceDeviation` 3%, `PoolIlliquid`, history) reverts the whole call. In a basket (NVDAB/SPCXB/QQQB), pushing the cheap QQQB pool more than 300 ticks from its TWAP (about $40k per 1%, recoverable in the same block with a flash loan) blocks `rebalance`, `rebalancePublic` and `closeToUSDT` for **all three** assets, including the sell that protects the floor. Sells are the safe direction, yet they fail on the same guard as buys. A single-asset position has the same weakness for its own pool. | Fail soft for the safe direction: if an asset's price fails a guard, value it at 0 (conservative: V is understated, so the vault sells more), allow only sells in that call, and let the traded asset use its own checks. | M | `Findings.t.sol::test_audit_F03_unrelatedPoolCannotBlockASell`; control `test_audit_control_F03_sellWorksWithHealthyPool2` passes. |
| F-04 | Medium | `FloorVault.sol:194-196`, `CPPIMath.sol:162-168`, `TwapOracle.sol:58-65` | **Sells revert in a fast fall.** `minOut` is TWAP × (1 − 30 bps) for the aggregator (100 bps direct), symmetric for buys and sells, and the TWAP lags spot by about rate × 5 min. In a sustained fall of roughly 0.2%/min (about 10% in 50 minutes, a crash day) spot is more than 0.3% under the TWAP, every honest sell returns `MinOutNotMet`, and the 3% `PriceDeviation` guard adds a second fail-closed stop. The vault can only sell after the market stops falling and the TWAP catches up, which is the opposite of what a floor needs. Reproduced with a 1% lag. The documented 10-minute delay is the best case; here it can be unbounded while the move continues. | Asymmetric tolerance: a wider `tolSellBps` (for example 300 bps) because a late or slightly worse sell costs far less than not selling. Or take `minOut` from `min(TWAP, spot)` for sells with a hard floor of TWAP × 0.97. Keep buys tight. Re-run the backtest assumption (m = 4 survives gaps under 25%) with this lag. | M | `Findings.t.sol::test_audit_F04_sellSucceedsWhenSpotLagsBelowTwapByOnePercent`; control `..._sellWorksWhenSpotEqualsTwap` passes. |
| F-05 | Medium | `FloorVault.sol:477-485`, `FloorFactory.sol:201-210`; keeper in `/keeper` | **Trading freezes after any multiplier change because nobody pokes.** The vault requires `token.uiMultiplier() == factory.lastMultiplier(token)`. After a split or dividend change the values differ until someone calls `pokeMultiplier`, then trading is blocked a further `twapWindow`. A grep of the repo shows the keeper never calls `pokeMultiplier` (only the SDK ABI mentions it), and `previewRebalance`/Lens give no hint. Result: rebalances and `rebalancePublic` revert `MultiplierTransition` indefinitely, sells included, until a human notices. I verified on a fork that a scheduled change applies lazily: after `effectiveAt`, `hasPendingMultiplier()` goes false and `uiMultiplier()` returns the new value, so the guard behaves as designed and does need the poke. NVDAB (1.000778) and QQQB (1.000725) have already changed once. | Keeper: call `pokeMultiplier(token)` for each asset in every cycle when `uiMultiplier() != lastMultiplier`. Lens: expose `multiplierBlocked`. Consider letting the vault read the multiplier directly with its own snapshot taken at `initialize`/first poke so the guard does not depend on an external actor. | H (keeper gap), M (frequency) | none (cross-component). Check by grep: no `pokeMultiplier` call in `/keeper`. |
| F-06 | Low | `CPPIMath.sol:56`, `FloorVault.sol:266` | **Residue between `dust` and `minTrade` can never be sold.** At full unwind (`E* = 0`) `sellAmount` returns 0 if `E_i < minTrade` (20 USDT default, 6 in P6 demo), while `closeToUSDT` needs stock value ≤ `dust` (1 USDT). Stock worth 1-20 USDT stays forever, and the owner cannot close to USDT (must `exitInKind`, receiving the stock). A griefer can create it by donating 10 USDT of bStock to a victim vault. Also arises naturally from the last chunk after a `maxTradeValue` cap. No loss beyond the residue; UX and the "close to USDT" promise. | In the unwind branch sell whenever `E_i > dust` (ignore `minTrade`), or have `closeToUSDT` compare against `max(dust, minTrade)`. | H | `Findings.t.sol::test_audit_F06_closeToUsdtWorksWithResidueBelowMinTrade`; control passes. |
| F-07 | Low | `FloorFactory.sol:156` | **No minimum deposit.** `amount == 0` is the only lower bound. A 1-wei position costs about $0.01 of gas, so an attacker can bloat `positions[]` and every keeper scan (each position costs several external calls per tick). Cap math is unaffected (1 wei). | Add `minDeposit` (for example 10 USDT, owner-settable within bounds). Keeper should also filter by deposit. | H | `Findings.t.sol::test_audit_F07_dustPositionsAreRejected`. |
| F-08 | Low | `FloorVault.sol:195`, CONTRACTS.md §7/§15 T1, I1 | **The compromised-keeper loss bound is 100 bps, not 30.** The keeper may pick the Pancake SwapRouter (P2 allowlists it) and arbitrary calldata; the vault then applies `tolDirectBps` (100). I1 and T1 state `tolBps` = 30. Loss per trade is bounded (≤ 1% of ≤ `maxTradeValue`, once per `minInterval` and asset), so this is a documentation/threat-model mismatch plus a looser bound than advertised. | Document 100 bps for T1/I1, or require the keeper path to use `tolAggBps` unless the calldata decodes to a single `exactInputSingle` on the registered pool. | H | none. |
| F-09 | Low | `FloorVault.sol:291` | **Capped transfer silently skips on low gas.** `token.call{gas: 500_000}` is clipped by the 63/64 rule. If the caller (a Safe, a relayer, a wallet with a tight estimate) supplies less, the transfer fails inside the sub-call, the token is "skipped", `status` becomes `Closed`, and the stock is left in the vault. It is recoverable with `rescue`, so no loss, but the plan says "gives the try enough gas". | `require(gasleft() >= EXIT_TRANSFER_GAS * 64 / 63 + 50_000)` before each capped call (revert instead of skip). | H | none (recoverable). |
| F-10 | Low | `holidays/nyse_2026_2027.json` | **Holiday table ends 2027-07-05.** Terms run up to 400 days (launch: 365 days). NYSE closures on 2027-09-06 (Labor Day) and 2027-11-25 (Thanksgiving; 2027-11-26 early close) are missing, so the vault may trade on a closed day (T11). I checked all 12 listed dates against weekdays: they are correct and match the `day = ts / 86400` indexing. | Add the remaining 2027 dates (and verify against nyse.com as the file says). | H | none. |
| F-11 | Low | `FloorVault.sol:182,211` | **Multiplier guard covers only the traded asset.** In a basket, a pending or just-applied multiplier change on asset B is ignored while trading asset A, but B's TWAP feeds V and so A's size. Bounded by `tolBps` per trade and the pool deviation guard. | Run `_multiplierGuard` for every held or active asset, or at least treat a blocked asset as value 0 (fits the F-03 fix). | M | none. |
| F-12 | Low | `FloorFactory.sol:262-291` | **Guardian powers are larger than T15 says.** A compromised hot guardian can `disableAsset` (every position is forced to sell that asset: lost upside and fees, no theft), `pause`/`setHalted` (no rebalances: floor not defended), `approveTokenImpl(any)` (silences the beacon guard) and unmark holidays. No fund movement. | Document in T15. Consider guardian-only `pause`/`halt` with an auto-expiry, and owner-only `approveTokenImpl`. | H | none. |
| F-13 | Low | `FloorVault.sol:206-237` | **Public path is sandwichable up to 100 bps; keeper can hold it closed.** Anyone can time `rebalancePublic` and sandwich inside `tolDirectBps` (QQQB is cheapest to move). Any successful keeper trade also resets `lastRebalance`, so a malicious keeper can keep `publicDelay` from expiring with one small valid trade per 4 h while ignoring other assets. Bounded (T1/T4). | Track `lastRebalance` per asset. | M | none. |
| F-14 | Info | `FloorVault.sol:116-168`, `FloorFactory.sol:167-176` | **Clone `initialize` front-running: not exploitable.** `initialize` accepts any contract caller as "factory" on an uninitialised clone, but `createPosition` clones and initialises in one transaction (the only external call in between is the trusted BSC-USD `transferFrom`), CREATE addresses are not injectable, and the implementation is parked on `0xdead`. Anyone can still clone the implementation themselves and initialise it with a fake factory; that vault is not in `positions[]`, but a UI that identifies vaults by code hash would be fooled. | Treat the factory's `positions`/`PositionCreated` as the only source of truth in UI/keeper. Optional hardening: make the implementation hold the factory as an immutable and require `msg.sender == IMPL.factory()`. | H | none. |
| F-15 | Info | `FloorFactory.sol:387-395` (`setDefaults` bounds) | **Bounds are loose for new positions.** `sellBandBps`/`buyBandBps` up to 10%, `tol*` up to 5%, `maxTickDev` up to 10%, `minInterval` 0, `dust` up to 100 USDT, `publicDelay` min 1 h. A compromised owner plus keeper can open the door for new positions only (existing ones are unaffected). | Tighten (for example bands ≤ 300, tol ≤ 150, maxTickDev ≤ 400, minInterval ≥ 300, dust ≤ 5e18). | H | none. |
| F-16 | Info | `script/params/56.json`, `FloorFactory.sol:129` | **Aggregator `approveTarget` is assumed equal to the router.** The A02 fixtures show `approveTarget` = `0xB444…` for both directions, so the assumption holds today. If the aggregator changes its spender, swaps fail closed (`SwapFailed`). Constructor routers (P2) are active at once and `routers[]` entries are not checked against tracked tokens (the vault's SwapGuard does check at call time). | Re-read `approveTarget` from the live `/swap` response at G4. | H | none. |
| F-17 | Info | CONTRACTS.md §9, T5-T7 | **Accepted, undetectable or unfixable on-chain:** same-address token upgrade (beacon guard only sees implementation changes), a blocklisted vault (sells revert; USDT still exits via `exitInKind`, once F-00 is fixed), issuer pause, and the shared EOA beacon owner. | Keep the disclosure on the landing page. | H | none. |
| F-18 | Info | `FloorFactory.sol:70-72` | **Docs mismatch:** CONTRACTS.md calls `maxTotalTvl` a TVL cap; the code enforces cumulative lifetime deposits. P5 says caps "cannot be lowered for positions that already exist", which is true, but the number reads as concurrent TVL. | Fix text or code (see F-01). | H | none. |
| F-19 | Info | `FloorVault.sol:284` | A high-level `try` on an address without code reverts in the caller before `catch`. Not reachable with the real beacon proxies (they have code) but covered by the same fix as F-00. | Same as F-00. | M | none. |
| F-20 | Info | Slither | 57 results, all triaged as informational or false positive (see below). | none | H | none. |

## Slither (installed through `uvx --from slither-analyzer slither .`, 31 contracts, 102 detectors, 57 results)

Run from `packages/contracts` with `--filter-paths "lib|test|script|vendor"`. Detector types seen: calls-loop, uninitialized-local, unused-return, incorrect-equality, timestamp, reentrancy-benign, reentrancy-events, low-level-calls, naming-convention, unindexed-event-address. Triage:
- `reentrancy-benign` on `exitInKind` (`status` written after the token call) and `reentrancy-events` on `createPosition`: guarded by `ReentrancyGuardTransient` on the vault; `createPosition` calls only trusted BSC-USD and the fresh clone. Benign.
- `incorrect-equality` (`bal == 0`, `value == 0`): intentional zero checks.
- `uninitialized-local` (`sum`, `stockValue`, `skippedN`): default zero is intended.
- `unused-return` (`slot0`, `observe`, Lens tuples): intentionally ignored fields.
- `calls-loop`, `timestamp`, `low-level-calls`, `naming-convention`, `unindexed-event-address`: informational.
Slither did **not** find F-00 (the unsafe `try` decode and the uncapped `balanceOf` gas); it was found by reading. `aderyn` is not installed and was not run.

## Threat model walk (CONTRACTS.md §15)

| # | Result | Notes |
|---|---|---|
| T1 keeper key | Holds, with F-08 | Bound is 100 bps (Pancake route), not 30. No withdrawal path: there is no function that sends assets to a keeper-chosen address. |
| T2 malicious router | Holds | Exact approve (`forceApprove`), reset to 0 after the call, `received >= minOut`, `spent <= amountIn`, no other tracked balance may fall, router must not be a tracked token. I read every branch of `SwapGuard.exec`. A router cannot take more than `amountIn` or leave a standing allowance. |
| T3 TWAP manipulation | Holds, with F-03/F-04 | `observe([window,0])` extrapolates with the pre-swap tick, so same-block pushes do not enter the average; spot deviation is capped at 300 ticks; fixed by `minOut`. Cost is liveness, not funds. |
| T4 sandwich | Holds (bounded) | See F-13. |
| T5/T6 issuer pause/blocklist | **Broken by F-00 for the exit promise** | `exitInKind` skips a reverting `transfer`, but not a reverting or malformed `balanceOf`. |
| T7 token upgrade | **F-00** | Beacon guard detects an implementation change for buys only; the exit path is the weak point. |
| T8 multiplier | F-05, F-11 | Raw accounting is correct. The freeze depends on pokes. |
| T9/T10 gap, weekend | Holds | `E* = 0` once `V <= F`; no trading when closed. |
| T11 missed holiday | F-10 | Table ends 2027-07-05. |
| T12 liquidity | F-04, F-06 | Capped sells chunk across calls; residue stuck below `minTrade`. |
| T13 bugs | Reviewed | Rounding directions match §5: F rounds up, V and E* round down. |
| T14 reentrancy | Holds | Every state-changing vault function is `nonReentrant` (transient); the EvilRouter modes 4 and 5 are covered by tests; state (`lastTradeAt`, `lastRebalance`) is written before the external call. |
| T15 owner/guardian | Mostly | F-02 (owner), F-12 (guardian). |
| T16 router stale | Holds | `routerOk` is read each call. |
| T17 RFQ from contract | Evidence in `ops/spikes/taker-probe` (A02 fixtures pass from a contract taker). Not re-run. |
| T18 USDT depeg | Out of scope | Disclosed. |
| T19 key loss | Holds | No owner transfer in the vault; by design. |
| T20 legal | Out of scope | |

## Invariants (CONTRACTS.md §12)

| ID | Result | Evidence |
|---|---|---|
| I1 | Holds with bound 100 bps | F-08. |
| I2 | Holds | Only `safeTransfer(owner/to)` in `closeToUSDT`/`exitInKind`/`rescue`, and the router leg. |
| I3 | Holds | `E* <= V`, `E* <= 4C`; band drift per §5. |
| I4/I9 | Holds | One vault per position; shared only config. F-02 is the one config path that changes behaviour of all positions. |
| I5 | Holds | `E* = 0` when `V <= F`; `buyAmount` returns 0 for `T_i = 0`. |
| I6 | Holds | `floorFor` rounds up (`mulDivRoundingUp`), `valueOf`/`exposureTarget` round down. |
| I7 | Holds | `_requireTradable` reads `factory.isTradingOpen(block.timestamp)`; weekday `(day+3)%7` with day 0 = Thursday is correct (I checked 20000 = Friday 2024-10-04 and all holiday weekdays). |
| I8 | **Fails (F-00)** | Exit reverts when a token's `balanceOf` returns empty data or burns gas. |
| I10 | Holds | Direction, `[computed/2, computed]`, `minInterval`, router allowlist all checked in `rebalance`. |
| I11 | Holds | Approval reset to 0 before the delta checks; a revert undoes everything. |
| I12 | Holds | `status == Active && now < maturity` gate in `_load`. |
| I13 | Holds | Exit functions read no factory state. |

## Items from the brief, checked and found fine (no finding)

- **Balance-delta completeness:** tracked = USDT + every vault asset (`_swap`); `tokenIn` may not grow and may shrink by at most `amountIn`; `tokenOut` must rise by `minOut`; any other tracked token may not fall. Donations into the vault only help the owner.
- **approve/approveTarget:** the vault approves `approveTarget` and calls `router`, as designed; mismatch fails closed.
- **Reentrancy through router/token:** guarded (see T14). Read-only reentrancy has no value to extract (views only).
- **TWAP tick rounding and token order:** negative averages round down; `priceWad` is right for both orders (stock-token0 = tick price, USDT-token0 = inverse); `usdtIsToken0` is read from the pool in `addAsset`, so QQQB (token0) is correct. TickMath matches a 120-digit reference at 58 ticks including both extremes (`TickMathVectors.t.sol`, passes).
- **Weekday formula, holiday indexing:** verified above; `Deploy`/`SetHolidays` pass unix days (not YYYYMMDD).
- **`amountIn` bounds rounding:** `computed = floor(value*WAD/price)` capped at balance; `computed/2` floors; consistent. Full-unwind leaves at most a few wei.
- **`minInterval` bypass via `rebalancePublic`:** none; both paths check per-asset `lastTradeAt` and write it. (F-13 is a different issue.)
- **Maturity/closing:** `E* = 0` after maturity or when not Active; `requestClose` Active-only; `closeToUSDT` any non-Closed state; `rescue` only when Closed.
- **Constructor routers (P2):** Pancake router must be in the list (reverts otherwise); later `addRouter` has the 24 h delay; `removeRouter` is instant. Re-adding a removed router resets it after 24 h.
- **`setDefaults`:** bounds exist; `minTrade >= 1e18` allows the P6 value 6e18. Values are copied into each clone. See F-15.
- **Launch caps (P5):** 1,000/5,000 enforced; see F-01.
- **Fee-on-transfer/deposit accounting:** `createPosition` checks the vault's received delta.
- **Blocklisted/paused tokens:** sells revert (fail closed); `exitInKind` skips a reverting `transfer` (but see F-00 for `balanceOf`).
- **Fork:** the 8 existing fork tests pass against live BSC (read-only fork). I additionally confirmed on a fork that `setUIMultiplier(value, effectiveAt)` applies lazily and `hasPendingMultiplier()` returns false after `effectiveAt`.

## What I could not check

- Real Binance aggregator behaviour with arbitrary calldata beyond the A02 fixtures.
- The issuer's real response to `transfer` when the vault is blocklisted on the compliance contract (needs the live compliance admin on a fork; not run).
- Mainnet gas for a 3-asset exit (the 500k transfer cap is unverified against real compliance-hook cost; the fork exit test passes, so it is at least enough for one asset).

## How to run the PoCs

```
cd packages/contracts
forge test --match-path 'test/audit/*'
```
Today: 1 TickMath guard, 6 controls and 1 exit control pass; 8 PoCs fail (F-00, F-00b, F-01 to F-04, F-06, F-07). After the fixes all should pass. Findings without a PoC (F-05 keeper gap, F-08 to F-20) are documentation, config or off-chain issues.
