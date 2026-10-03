Commit: 1477289c3a0769cf6a44c6ff01e3f9c9600fd0a9 (branch agent/A12b, equal to main at run time)

> AI-assisted audit by Pashov Audit Group skills, not a formal audit. Pashov Audit Group did not review Floor. Their open-source skill was followed by a Claude Sonnet 5.5 agent. No guarantee of security.

## How this run differed from the designed skill run

- Manual, not via the Skill tool: `solidity-auditor` returned "Unknown skill" (skills added mid-session are not registered). SKILL.md and its references were followed by hand.
- Sequential, single agent: the 12 parallel attacker-lens agents were NOT spawned. One agent applied the lenses (access control, execution trace, math/precision, economic security, invariants, asymmetry, boundary, periphery incl. deploy scripts, first principles) and the gap hunters (trust, flow, numerical gaps, seeded by the A12a x-ray gaps) in sequence over the whole in-scope code. Coverage is therefore shallower than a 12-agent run; no multi-pass loop and no ledger/memory.
- Not run: model picker, version check, bundle files, assemble.sh. This report is written by hand in the findings format below.
- Scope: `packages/contracts/src` (FloorVault, FloorFactory, FloorLens, CPPIMath, SwapGuard, TwapOracle, MarketHours, interfaces) and `packages/contracts/script` (Deploy, SetHolidays, SmokeTest). Vendored libs (TickMath, FullMath, BitMath, CustomRevert) and `lib/` were not audited. About 1,900 in-scope lines read in full.
- PoCs: Foundry tests in `packages/contracts/test/audit-pashov/PashovPoC.t.sol`. Each PASSES while the issue exists (they assert the undesirable behaviour). No fork tests, no mainnet transactions.
- Confidence is a judgement score (1-100) on whether the issue is real as described, not a probability of exploit.

## Findings

### F-01 Residue between `dust` and `minTrade` cannot be sold or closed to USDT
- Severity: Low. Confidence: 95. File: FloorVault.sol:266 with CPPIMath.sol:56 (also FloorFactory.sol:392-393 bounds).
- Scenario: in Closing, after maturity, or cash-lock, the full-unwind path sells only if `E_i >= minTrade` (default 20 USDT). `closeToUSDT` needs total stock value `<= dust` (default 1 USDT). Stock worth between 1 and 20 USDT (rounding leftovers, capped last sell, donation of 0.15 stock) is stuck: keeper reverts `NoTradeNeeded`, `closeToUSDT` reverts `StockNotUnwound`. The owner still exits via `exitInKind` (receives the stock in kind), so funds are not lost, but the "close to USDT" promise fails for the common residue case.
- PoC: test_PoC_F01_residueBetweenDustAndMinTradeBlocksCloseToUSDT (passes).
- Fix: in a Closing/matured/estar==0 state let the unwind sell any balance (skip `minTrade` when `estar == 0`), or require `dust >= minTrade` in `_checkDefaults`, or let `closeToUSDT` accept residue and leave it for `rescue`.

### F-02 One unpriceable active pool freezes de-risking of the whole vault
- Severity: Medium. Confidence: 80. File: FloorVault.sol:404-416 (`_load`), 389-394 (`_price`).
- Scenario: `_load` prices every asset that is active or held. If any one pool trips `PoolIlliquid` (in-range `liquidity()` below `minLiquidity`, which moves with the price leaving LP ranges), `PriceDeviation` or `OracleHistoryTooShort`, every `rebalance`/`rebalancePublic` reverts, including the sell of a different, healthy and falling asset. A crash that dries one pool freezes the floor mechanism for the other holdings (T9/T12). PoC: a 2-asset vault needs a sell on asset A, B has no balance but is active, B liquidity set to 1: the sell reverts; with B restored the same sell succeeds. Exits still work (I8), so this is a floor-protection failure, not a fund loss.
- PoC: test_PoC_F02_oneDeadPoolFreezesDeRisking (passes).
- Fix: price lazily. Price only the traded asset plus held assets; treat an empty, unpriceable asset as value 0 (skip it, do not revert). For sells, tolerate a failed price on assets with zero balance. Document the residual risk for held assets.

### F-03 `addAsset` re-points or re-parameterises an asset that live vaults read
- Severity: Medium. Confidence: 80. File: FloorFactory.sol:300-328, read live at FloorVault.sol:382.
- Scenario: `addAsset` overwrites `assets[token]` (pool, fee, `minLiquidity`, `maxTradeValue`) instantly and re-activates a disabled asset, with no timelock and no check against open positions. Existing vaults use the new pool for TWAP, `minOut` and size caps. A compromised owner key plus a keeper can point the asset at another real fee-tier pool of the same pair with `minLiquidity = 0`, then manipulate that thin pool's TWAP and extract value through keeper trades bounded only by `tol` and `maxTradeValue` per `minInterval`. This contradicts threat T15 ("cannot take funds or edit positions"). Loss is bounded by the launch caps ($1k per position, $5k total).
- PoC: test_PoC_F03_addAssetRepointsLiveAsset (shows the overwrite, `minLiquidity` 0 and active stay set).
- Fix: make `addAsset` revert if `assets[token].pool != address(0)` (separate `updateAsset` with 24h delay and event, or snapshot pool/fee/minLiquidity into the vault at creation). Accept in writing otherwise (owner is a Safe in the plan) and fix T15 wording.

### F-04 `addRouter` on an active router disables it for 24h
- Severity: Low. Confidence: 90. File: FloorFactory.sol:331-336.
- Scenario: `routers[target]` is replaced wholesale with `activeAt = now + 24h`. Calling it for the Pancake router (the only path for `rebalancePublic`) or the main aggregator removes it from `routerOk` for 24 hours, and silently re-enables a guardian-removed router after the delay. Owner foot-gun or compromised-owner grief of the permissionless fallback.
- PoC: test_PoC_F04_addRouterDeactivatesActiveRouter (passes).
- Fix: revert if the router already exists and is not removed; keep an explicit `replaceRouter` if needed.

### F-05 Re-running `addAsset` absorbs an unpoked multiplier change without a settle window
- Severity: Low. Confidence: 85. File: FloorFactory.sol:323-326.
- Scenario: `addAsset` sets `lastMultiplier = uiMultiplier()` but never sets `lastMultiplierChange`. After a split that nobody has poked, an owner re-add makes the guard see "no change" and trading resumes at once, skipping the `twapWindow` wait that `pokeMultiplier` would arm. Also, if `uiMultiplier()` reverts at registration the `catch {}` leaves `lastMultiplier = 0`, which makes the vault guard (which calls it without try/catch) revert or block forever.
- PoC: test_PoC_F05_addAssetHidesUnpokedMultiplierChange (passes).
- Fix: also set `lastMultiplierChange = block.timestamp` when the stored multiplier differs; revert if `uiMultiplier()` fails at registration.

### F-06 Deploy script does not check the beacon implementation against `approvedTokenImpl`
- Severity: Low. Confidence: 70. File: script/Deploy.s.sol:304 (and FloorFactory.sol:361).
- Scenario: a wrong `approvedTokenImpl` in `56.json` (a typo, or an upgrade between research and deploy) makes `_beaconChanged()` true from block one, so all buys revert `TokenImplChanged` until the guardian calls `approveTokenImpl`. Fails closed but would be found only on the first live rebalance. Conversely, a zero-beacon deployment disables the check silently.
- PoC: none (config issue).
- Fix: `require(IBeacon(p.tokenBeacon).implementation() == p.approvedTokenImpl)` in the script, and consider reading the implementation in `setTokenBeacon` instead of taking it as a parameter.

### F-07 Deploy script silently truncates parameters and the factory does not check USDT decimals
- Severity: Low. Confidence: 75. File: script/Deploy.s.sol:309-310, FloorFactory.sol:98-139.
- Scenario: `uint24(assetFees)` and `uint128(assetMinLiquidity)` are unchecked downcasts; a bad JSON value wraps. The factory constructor never asserts `IERC20Metadata(usdt).decimals() == 18` although TwapOracle and CPPIMath assume it (TwapOracle.sol:475). BSC-USDT is 18, so no impact on the intended chain; a mis-set `usdt` is unrecoverable (immutable).
- PoC: none.
- Fix: `require` bounds on the casts; check USDT decimals in the constructor.

### F-08 `totalTvl` is a lifetime counter, so the launch cap exhausts permanently
- Severity: Low. Confidence: 90. File: FloorFactory.sol:70-72, 158, 163.
- Scenario: closed positions never decrease `totalTvl`. After 5,000 USDT of cumulative deposits (default cap) `createPosition` reverts `TvlCapReached` even if all positions are closed, until the owner raises `setLimits`. Documented in a comment, but it is a self-DoS of new deposits, not a TVL cap.
- PoC: none.
- Fix: rename to `cumulativeDeposited` and document, or let a closing vault report back, or accept as a launch-phase control (owner can raise the cap).

### F-09 Guardian or owner `pause`/`setHalted` and `removeRouter` freeze floor protection for all vaults
- Severity: Info. Confidence: 90. File: FloorFactory.sol:221-224, 247-260, 275.
- Scenario: `isTradingOpen` returns false while paused/halted, and the vault does not distinguish sells from buys, so de-risking sells are blocked for every position at once. By design (T15) and exits remain open, but a halt during a crash exposes users to the gap. Consider allowing sells while halted (halt buys only) for defensive state.
- PoC: none.

### F-10 `initialize` caller check is weak but atomically safe
- Severity: Info. Confidence: 60. File: FloorVault.sol:125-127.
- Scenario: any contract can initialise an uninitialised clone (`msg.sender.code.length != 0` only). The factory creates and initialises in one transaction, so no window exists; the implementation is parked on `0xdead`. Safe today; a future code path that clones without initialising in the same tx would be exposed. USDT is read from the caller (`IFloorFactory(msg.sender).usdt()`), so a hostile initialiser could set any USDT.
- Fix: none needed, or pass the factory address from a CREATE2-derived check.

### F-11 `exitInKind` copies up to 500k gas of returndata
- Severity: Info. Confidence: 50. File: FloorVault.sol:291.
- Scenario: a hostile bStock returns about 500 KB of returndata; the copy into `bytes memory ret` costs roughly the same again in the vault's gas. The call still completes in one transaction (a gas bomb test exists), so USDT is not trapped; the owner pays more gas.
- Fix: use assembly with a 32-byte returndata limit.

## Checked and found sound (no finding)
SwapGuard: tracked-token router check, snapshot, exact approve, zero after, tokenIn must not grow, tokenOut and other-token deltas; nonReentrant transient guard blocks callback re-entry; keeper amount window (computed/2..computed) and direction check; Pancake struct layout with deadline; weekday formula (day 20000 = Friday); TWAP floor rounding for negative ticks; price inversion at extreme ticks (no zero/overflow); rounding directions (floor up, V and E* down); multiplier guard ordering; exits independent of factory state; clone init atomic; ownership 2-step; Deploy ordering (deployer holds roles until the end, no key read from env).
Residual trust (not findings): keeper plus allowlisted router can lose up to `tol` per trade (T1, bounded); TWAP depends on thin Pancake pools (x-ray E-1/X-7); beacon owner can change token logic at the same address (T7).

## Overlap with reviews/audit-pashov-xray.md
F-02 = x-ray I-9; F-03 = X-1 and X-3; F-05 = X-2 (and the failed-read case); F-06 = temporal risk "setTokenBeacon" gap; F-07 = USDT decimals token assumption; F-08 = noted lifetime counter; F-10 = I-5; F-11 = exitInKind low-level transfer lead. New versus the x-ray: F-01, F-04, and the PoCs for F-02/F-03/F-05.

## Counts by severity
Critical 0, High 0, Medium 2 (F-02, F-03), Low 6 (F-01, F-04, F-05, F-06, F-07, F-08), Info 3 (F-09, F-10, F-11).

## Go / no-go for G3
NO-GO until the two Medium findings are fixed or accepted in writing by the team lead (AUDIT.md triage), and a re-run is done on the frozen commit. No Critical or High were found, but this was a sequential single-agent manual run, so absence of High is weaker evidence than a full 12-agent run; the final re-run (A12b, frozen commit) should be done with the Skill tool or the parallel lenses if available. Cheap Lows (F-01, F-04, F-05, F-06) are worth fixing in the same batch.

AI-assisted audit by Pashov Audit Group skills, not a formal audit.
