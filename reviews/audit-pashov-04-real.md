<!-- Real /solidity-auditor run by the team lead, 2026-10-04 00:44, commit 453356a. AI-assisted audit by Pashov Audit Group skills, not a formal audit. -->
# 🔐 Security Review — floor

---

## Scope

|  |  |
| --- | --- |
| **Mode** | default |
| **Files reviewed** | `./ops/spikes/taker-probe/src/TakerProbe.sol` · `./packages/contracts/src/FloorFactory.sol` · `./packages/contracts/src/FloorLens.sol`<br>`./packages/contracts/src/FloorVault.sol` · `./packages/contracts/script/SetHolidays.s.sol` · `./packages/contracts/script/Deploy.s.sol`<br>`./packages/contracts/src/libs/DefaultsCheck.sol` · `./packages/contracts/src/libs/MarketHours.sol` · `./packages/contracts/src/libs/TwapOracle.sol`<br>`./packages/contracts/src/libs/CPPIMath.sol` · `./packages/contracts/src/libs/SwapGuard.sol` · `./packages/contracts/src/libs/vendor/BitMath.sol`<br>`./packages/contracts/src/libs/vendor/TickMath.sol` · `./packages/contracts/src/libs/vendor/CustomRevert.sol` · `./packages/contracts/src/libs/vendor/FullMath.sol` |
| **Confidence threshold (1-100)** | 75 |
| **Passes** | 3 |
| **Memory** | 99 records before this scan · 116 after · `453356a` |

---

## Findings

[75] **1. One user fills the TVL cap and blocks all other users**

`FloorFactory.createPosition` · Confidence: 75 · seen in 3/3 runs · KNOWN (5 scans)

**Description**
One user opens five positions of 1000 USDT and fills `maxTotalTvl`, so `createPosition` reverts for every other user while that user can exit at any time.

**Fix**

```diff
+        if (ownerTvl[msg.sender] + amount > maxDeposit) revert DepositTooLarge();
+        ownerTvl[msg.sender] += amount;
         if (totalTvl + amount > maxTotalTvl) revert TvlCapReached();
```

---

[75] **2. A spot push on a disabled token makes the vault sell the active tokens**

`FloorVault._load` · Confidence: 75 · seen in 3/3 runs · KNOWN (3 scans)

**Description**
An attacker pushes a held disabled token's spot past `maxTickDev`, so `_load` leaves the token out of V without `noPrice`, and `rebalancePublic` sells active tokens into the attacker's sandwich.

**Fix (Option A — validate in `_load`)**

```diff
                     if (p == 0 || CPPIMath.valueOf(bal, p) > dust) {
                         st.anyFailed = true;
                         st.understated = true;
+                        if (bal != 0) st.noPrice = true;
                     }
-                    if (p == 0) st.noPrice = true;
```

**Fix (Option B — restrict in `_plan`)**

```diff
-        if (unwinding || !st.noPrice) {
+        if (unwinding || !st.understated) {
```

---

[75] **3. The cash lock trusts a price that failed its spot or liquidity guard**

`FloorVault._lockCheck` · Confidence: 75 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
An attacker moves a pool below `minLiquidity` or past `maxTickDev`, so `_load` values the token at the unguarded `twapOf` without `understated`, and `_lockCheck` sets the permanent lock.

**Fix (Option A — validate in `_lockCheck`)**

```diff
-        if (st.understated || st.V > floor) return;
+        if (st.understated || st.anyFailed || st.V > floor) return;
```

**Fix (Option B — validate in `_load`)**

```diff
                 st.anyFailed = true;
+                // A held asset valued by the unguarded TWAP must never set the permanent lock.
+                if (bal != 0) st.understated = true;
                 if (p == 0) {
```

---

[75] **4. Any caller sets the permanent cash lock while trading is closed or halted**

`FloorVault.lockIfBelowFloor` · Confidence: 75 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
Any caller holds a thin pool's TWAP 25% low for one window while the market is closed and calls `lockIfBelowFloor`, so every vault that holds the token keeps only USDT until maturity.

**Fix (Option A — restrict)**

```diff
     function lockIfBelowFloor() external override nonReentrant {
+        if (!IFloorFactory(factory).isTradingOpen(block.timestamp)) revert TradingClosed();
         _lockCheck(_load());
     }
```

**Fix (Option B — validate)**

```diff
-        if (st.understated || st.V > floor) return;
+        if (st.understated || st.anyFailed || st.V > floor) return;
```

---

[75] **5. A caller of `rebalancePublic` trades around the vault swap for profit**

`FloorVault.rebalancePublic` · Confidence: 75 · seen in 3/3 runs · KNOWN (5 scans)

**Description**
The caller moves the spot price inside `maxTickDev`, calls `rebalancePublic` on one or more vaults and trades back, so the caller keeps up to `tolDirectBps` of each trade.

**Fix**

```diff
-        uint256 minOut_ = CPPIMath.minOut(amountIn, st.price[assetIdx], tolDirectBps, buy);
+        // Use the price that is better for the vault in this direction, so a spot-TWAP gap cannot be taken.
+        uint256 ref = buy ? Math.min(st.price[assetIdx], spotPrice) : Math.max(st.price[assetIdx], spotPrice);
+        uint256 minOut_ = CPPIMath.minOut(amountIn, ref, tolDirectBps, buy);
```

---

Findings List

| # | Confidence | Title |
|---|---|---|
| 1 | [75] | One user fills the TVL cap and blocks all other users |
| 2 | [75] | A spot push on a disabled token makes the vault sell the active tokens |
| 3 | [75] | The cash lock trusts a price that failed its spot or liquidity guard |
| 4 | [75] | Any caller sets the permanent cash lock while trading is closed or halted |
| 5 | [75] | A caller of `rebalancePublic` trades around the vault swap for profit |

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. These are not false positives — they are high-signal leads for manual review. Not scored._

- **A keeper can always trade half of the computed amount** — `CPPIMath.amountInOk` · seen in 1/3 runs · KNOWN (3 scans) — The accepted range is half to all of the amount, so an unwind can take twice as many trades. Only a keeper can do this.
- **The preflight does not check that the router uses the listed Pancake factory** — `Deploy._preflight` · seen in 1/3 runs · NEW — No code compares `v3SwapRouter.factory()` with `v3Factory`. We did not find a parameter file where they differ.
- **A listing leaves the multiplier change time at zero** — `FloorFactory.addAsset` · seen in 1/3 runs · NEW — A multiplier change just before `addAsset` does not block trades while the TWAP settles. Only the owner lists tokens, and we did not prove that the change moves the pool price.
- **Disabled tokens still limit the defaults** — `FloorFactory._checkDefaults` · seen in 1/3 runs · NEW — The loop checks every listed token, so `setDefaults` cannot move `tolDirectBps` or `minTrade` past a disabled token's limits. We found no loss of user funds.
- **The deploy does not check the Pancake router's `approveTarget`** — `FloorFactory.constructor` · seen in 1/3 runs · NEW — A wrong `approveTarget` makes every `rebalancePublic` swap revert. We did not confirm this with a real parameter file.
- **The factory accepts a deposit into a basket that the vault cannot buy** — `FloorFactory.createPosition` · seen in 1/3 runs · NEW — `_checkBasket` does not read the token implementation, the issuer pause or the multiplier guard, so the deposit stays in USDT. The owner can always exit.
- **The factory accepts a floor so high that the first buy never passes the buy band** — `FloorFactory.createPosition` · seen in 1/3 runs · KNOWN (2 scans) — With `buyBandBps` 1000 and `floorBps` 9800 the gap is 8% of V, below the 10% band, so the vault never buys. Only an owner `setDefaults` opens this.
- **The 14-day unwind buffer can be too short for the holiday table** — `FloorFactory.createPosition` · seen in 1/3 runs · KNOWN (3 scans) — A large position with a small `maxTradeValue` needs more trades than 14 days allow, so sells run on unlisted holidays. We did not prove a loss on those days.
- **USDT sent straight to a vault skips the deposit caps** — `FloorFactory.createPosition` · seen in 1/3 runs · KNOWN (2 scans) — `totalTvl` counts only the amount at creation, so a donation raises V and E* past `maxDeposit`. We did not measure what harm the extra exposure causes.
- **The factory checks only one basket target against `minTrade`** — `FloorFactory.createPosition` · seen in 1/3 runs · KNOWN (2 scans) — `_checkNotTooSmall` returns when one target passes, so a token with a target below `minTrade` is never bought. We did not check whether the UI warns the user.
- **A token disable forces a full public sale in every vault** — `FloorFactory.disableAsset` · seen in 1/3 runs · KNOWN (2 scans) — The target goes to 0 at once, so after `publicDelay` any caller sells the position at `tolDirectBps`. Only the guardian or the owner can disable.
- **Clearing a non-trading day counts its closed hours as open time** — `FloorFactory.hasOpenSeconds` · seen in 1/3 runs · NEW — `setNonTradingDay(day, false)` does not set `tradingResumedAt`, so `rebalancePublic` opens early. We did not confirm that the guardian uses this flag during a session.
- **The cardinality bound assumes a fixed block time** — `FloorFactory._minCardinality` · seen in 1/3 runs · KNOWN (2 scans) — The slot count assumes 0.75 s blocks, but Pancake writes at most one observation per second, which keeps the bound safe. We did not find a path that makes `observe` fail.
- **A `setHalted(false)` with no halt restarts the public delay of every vault** — `FloorFactory.setHalted` · seen in 1/3 runs · NEW — `tradingResumedAt` is written even when `halted` is already false, so `rebalancePublic` stays closed. Only the guardian or the owner can do this.
- **The owner grants a keeper with no delay, unlike a router** — `FloorFactory.setKeeper` · seen in 1/3 runs · NEW — `setKeeper`, `disableAsset` and `reenableAsset` have no delay, so an owner keeper can take `tolDirectBps` from every cushion in a loop. Only the owner can do this.
- **The guardian can cancel an owner pause or halt at once** — `FloorFactory.unpause` · seen in 1/3 runs · NEW — `unpause` and `setHalted(false)` use `onlyGuardianOrOwner`. This needs a compromised guardian key.
- **An `unpause` with no pause restarts the public delay of every vault** — `FloorFactory.unpause` · seen in 2/3 runs · NEW — `tradingResumedAt` is written even when `paused` is already false. Only the guardian or the owner can do this.
- **`exitInKind` reports a successful transfer as skipped** — `FloorVault._capTransfer` · seen in 1/3 runs · KNOWN (2 scans) — A token that returns more than 32 bytes gets `good = false` after a real transfer. We found no bStock that does this.
- **A held stock with no readable TWAP makes `closeToUSDT` revert** — `FloorVault.closeToUSDT` · seen in 2/3 runs · KNOWN (5 scans) — The dust test reverts with `StockNotUnwound` when `twapOf` fails. The owner can still use `exitInKind`.
- **A zero TWAP price lets a held stock pass the dust test** — `FloorVault.closeToUSDT` · seen in 1/3 runs · NEW — `twapOf` does not reject 0, so at an extreme tick the vault closes with the stock inside and the owner must use `rescue`. We found no real pool at such a tick.
- **A disabled token's weight stays in USDT** — `FloorVault._load` · seen in 1/3 runs · NEW — The other targets keep their original weights, so a vault holds only part of E* in stock after a disable. We found no loss below the floor.
- **A disabled token valued at or below `dust` leaves V without `understated`** — `FloorVault._load` · seen in 1/3 runs · KNOWN (2 scans) — An attacker who trips the guard of a disabled token removes up to `dust` from V, so `lockIfBelowFloor` can lock a vault just above F. The gap is 1 USDT with the live params.
- **The cash lock skips the multiplier guard** — `FloorVault.lockIfBelowFloor` · seen in 2/3 runs · KNOWN (2 scans) — `lockIfBelowFloor` does not call `_multiplierSettle`, so a lagging TWAP after a raw-price step can set the lock. We did not confirm that bStock raw prices step.
- **A multiplier poke while the market is closed ends the guard before the session** — `FloorVault._multiplierSettle` · seen in 1/3 runs · NEW — The guard lasts `twapWindow` wall-clock seconds, so the first Monday trade can use the old pool price. We did not verify that the raw pool price steps.
- **A sell band sized on V hides the drift when the cushion is small** — `FloorVault._plan` · seen in 1/3 runs · KNOWN (2 scans) — With C at 0.25% of V, a 13% fall puts V below F, not the disclosed 24%. No attacker controls the market path.
- **For weights below 100 bps the public sell band equals the keeper band** — `FloorVault._plan` · seen in 1/3 runs · KNOWN (2 scans) — The band truncates to 1 bp before the doubling has an effect. We did not prove a profit beyond the public delay.
- **A held token with no TWAP blocks all sells after the cash lock** — `FloorVault._plan` · seen in 1/3 runs · KNOWN (2 scans) — `unwinding` does not include `cashLocked`, so `st.noPrice` stops the sale of the other tokens. We did not trace a full loss.
- **The vault sells small drifts but buys back only at `minTrade`** — `FloorVault._plan` · seen in 1/3 runs · KNOWN (2 scans) — Sells start at about 3.3 USDT but buys need 20 USDT, so a small position stays under target. We did not measure the lost upside over a term.
- **The public path accepts sells as small as `dust` plus one wei** — `FloorVault._plan` · seen in 1/3 runs · NEW — With a small V the band floor is 1 bps, so a caller makes the vault pay the pool fee for tiny trades. We did not prove a caller profit.
- **A failed swap of the first token hides the sells of the other tokens** — `FloorVault.previewRebalance` · seen in 1/3 runs · KNOWN (5 scans) — The preview returns only the first eligible index, and the keeper skips the vault when that swap fails. We did not measure how long a real fall keeps it failing.
- **The vault copies the fixed block-time slot count** — `FloorVault._price` · seen in 1/3 runs · KNOWN (2 scans) — `_minCardinality` uses 4 slots per 3 seconds, the same as the factory. We did not confirm a chain where this is too short.
- **A rebalance revert removes the cash lock it set** — `FloorVault.rebalance` · seen in 3/3 runs · NEW — `_lockCheck` writes the lock before checks that can revert. Only `lockIfBelowFloor` keeps the lock.
- **A rebalance that pokes an old multiplier returns before the lock check** — `FloorVault.rebalance` · seen in 1/3 runs · NEW — `_multiplierSettle` returns before `_load` and `_lockCheck`, so that keeper call does not set the lock while V is at or below F. A later call still sets it.
- **The public path ignores the doubled band when E* is 0** — `FloorVault.rebalancePublic` · seen in 1/3 runs · KNOWN (2 scans) — `sellAmount` skips the band at `estar == 0`, so `PUBLIC_BAND_MULT` does not protect an understated or locked vault. We did not check other paths to `estar == 0`.
- **After maturity or `requestClose` any caller sells the whole position first** — `FloorVault.rebalancePublic` · seen in 3/3 runs · KNOWN (2 scans) — The delay counts from the last trade, so an idle vault opens the public unwind at once. We did not measure the profit per chunk.
- **The public delay counts time when the keeper cannot trade the token** — `FloorVault.rebalancePublic` · seen in 1/3 runs · KNOWN (4 scans) — `hasOpenSeconds` counts an issuer pause and a multiplier transition as open time. We did not measure how long such a block lasts.
- **A sandwich loss on a public sell pushes V under F for the lock** — `FloorVault.rebalancePublic` · seen in 1/3 runs · NEW — Near the floor, a 1% fill loss on the sell moves V from 902 to 899, and `lockIfBelowFloor` then locks the vault. We did not measure how often a vault sits that close to F.
- **A keeper gets the wide tolerance on any path through the Pancake router** — `FloorVault.rebalance` · seen in 1/3 runs · KNOWN (4 scans) — The tolerance depends only on the router address, so a keeper's multi-hop call gets `tolDirectBps`. Only a keeper can do this.
- **A keeper pays the vault only the TWAP minimum output** — `FloorVault.rebalance` · seen in 2/3 runs · KNOWN (4 scans) — `minOut` comes from the TWAP, so the keeper can route the gap to its own pool or executor. Only a keeper can do this.
- **A low-gas close can leave the deposit in `totalTvl`** — `FloorVault._reportClosed` · seen in 1/3 runs · KNOWN (2 scans) — The capped report call is ignored on failure. The owner can retry with `exitInKind`.
- **One vault's sell makes the other vaults' sells revert on `minOut`** — `FloorVault._swap` · seen in 1/3 runs · KNOWN (3 scans) — All vaults sell into the same pool against the same TWAP, so later sells fail in a fast fall. We did not model the pool depth.
- **`_tokenPaused` misses the global pause and the blocklist** — `FloorVault._tokenPaused` · seen in 2/3 runs · KNOWN (2 scans) — It reads only `isTokenPaused(token)`, so a frozen token keeps its last price in V. We did not confirm whether `isTokenPaused` includes `allTokensPaused`.
- **Badly encoded pause data makes `_load` revert** — `FloorVault._tokenPaused` · seen in 1/3 runs · KNOWN (2 scans) — try/catch does not catch an ABI decode failure, so short return data stops every rebalance. We did not find a live bStock that returns such data.
- **`exec` accepts a fall in the `tokenOut` balance when `minOut` is 0** — `SwapGuard.exec` · seen in 2/3 runs · KNOWN (2 scans) — A decrease of `tokenOut` is clamped to 0, not reverted. The vault always passes a `minOut` above 0.
- **The tick rounding raises the stock price for USDT-token0 pools** — `TwapOracle.priceWad` · seen in 2/3 runs · KNOWN (4 scans) — `twapTick` rounds down, so V can be up to 1 bp high. We found no input that turns this into a loss.

---

## Known from earlier scans

_Recorded by earlier scans of this repo, not raised again by this one. Not re-checked — a record here may be fixed, or may still be live and missed. `.solidity-auditor/memory.tsv`._

| Scans | Kind | Location | Title |
|---|---|---|---|
| 1 | LEAD | `DefaultsCheck.feeFits` | `feeFits` rounds the pool fee down before it doubles it |
| 2 | LEAD | `Deploy._load` | The deploy script cuts large default values to a smaller type before it checks t |
| 3 | LEAD | `Deploy._preflight` | The preflight skips two `addAsset` checks |
| 1 | LEAD | `Deploy.run` | The deployer key keeps owner powers until the new owner accepts |
| 2 | LEAD | `Deploy.run` | The deploy script reverts when the token beacon is zero |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` does not check that the token uses `tokenBeacon` |
| 2 | LEAD | `FloorFactory.addAsset` | `addAsset` accepts a pool fee only 1 bps below `tolDirectBps` |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` accepts a `maxTradeValue` below `minTrade` |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` does not check the multiplier functions the vault calls |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` stores a zero multiplier that its comment calls unsafe |
| 1 | LEAD | `FloorFactory._checkDefaults` | The `publicDelay` bound counts calendar days, but the vault counts open seconds |
| 2 | LEAD | `FloorFactory._checkDefaults` | `setDefaults` accepts values that the deploy preflight rejects |
| 1 | LEAD | `FloorFactory._checkDefaults` | The defaults allow a `maxTickDev` wider than the swap tolerance |
| 1 | LEAD | `FloorFactory.createPosition` | `createPosition` takes deposits while trading is halted |
| 1 | LEAD | `FloorFactory.createPosition` | A longer TWAP window is not checked against listed pools |
| 1 | LEAD | `FloorFactory.createPosition` | A user can grow `positions[]` without limit |
| 1 | LEAD | `FloorFactory.onPositionClosed` | A position that the owner never closes holds its deposit in the cap |
| 2 | LEAD | `FloorFactory.pokeMultiplier` | Any caller arms the multiplier block for every vault |
| 1 | LEAD | `FloorFactory.reenableAsset` | No function can move a token to a new pool |
| 1 | LEAD | `FloorFactory.reenableAsset` | `reenableAsset` skips the listing checks of `addAsset` |
| 1 | LEAD | `FloorFactory.setDefaults` | `setDefaults` can set `tolDirectBps` below a listed pool fee |
| 1 | LEAD | `FloorVault._capTransfer` | `_capTransfer` treats a call to an address with no code as success |
| 3 | LEAD | `FloorVault.closeToUSDT` | A stock donation above `dust` blocks `closeToUSDT` |
| 3 | LEAD | `FloorVault.initialize` | A USDT with a transfer hook can call `initialize` first |
| 3 | LEAD | `FloorVault.initialize` | Any contract can initialise its own clone of the vault |
| 1 | LEAD | `FloorVault._load` | The vault buys stock again after the cash lock |
| 2 | LEAD | `FloorVault._load` | One wei of a disabled token with no TWAP stops every CPPI sell |
| 1 | LEAD | `FloorVault._load` | A revert in one stock's `balanceOf` stops every rebalance |
| 1 | LEAD | `FloorVault._load` | One wei of a paused token stops every buy |
| 2 | LEAD | `FloorVault._load` | A paused bStock keeps its frozen pool price in V |
| 1 | LEAD | `FloorVault._load` | The vault values its stock at a TWAP that its own buys raise |
| 2 | LEAD | `FloorVault._load` | A spot push on one pool stops all buys in the basket |
| 1 | LEAD | `FloorVault._load` | A caller may set gas so that a price self-call fails |
| 1 | LEAD | `FloorVault._load` | A TWAP at an extreme tick rounds the price to zero |
| 1 | LEAD | `FloorVault._load` | V rounds up for pools that hold USDT as token0 |
| 3 | LEAD | `FloorVault._load` | A raised TWAP on a thin active pool blocks the sells of the other tokens |
| 2 | LEAD | `FloorVault._multiplierSettle` | A broken multiplier getter blocks the unwind of the token |
| 2 | LEAD | `FloorVault._multiplierSettle` | A multiplier change of one token makes the vault sell another token |
| 1 | LEAD | `FloorVault._multiplierSettle` | A pending multiplier flag that never clears blocks every rebalance of the token |
| 1 | LEAD | `FloorVault._multiplierSettle` | A frequently changing multiplier blocks every trade of the token |
| 2 | FINDING | `FloorVault._plan` | A fixed `minTrade` stops small positions from selling until the cushion is zero |
| 1 | LEAD | `FloorVault._plan` | `_plan` blocks buys even when the TWAP value is correct |
| 2 | FINDING | `FloorVault._plan` | The buy band is not scaled by the token weight, so low-weight tokens stay unboug |
| 1 | LEAD | `FloorVault._plan` | The trade rate limit can be too slow for a large fall |
| 1 | LEAD | `FloorVault._plan` | An attacker moves a thin pool's TWAP so the vault sells low and buys high |
| 3 | LEAD | `FloorVault._plan` | A `dust` below one raw unit of stock leaves stock that no swap can sell |
| 3 | LEAD | `FloorVault._price` | Low in-range liquidity in a fall stops every sell |
| 1 | LEAD | `FloorVault._readBalance` | A low-gas balance read skips a stock in the exit paths |
| 1 | LEAD | `FloorVault.rebalance` | A multiplier change of one token mis-sizes the trade of another token |
| 4 | LEAD | `FloorVault.rebalance` | Small keeper trades restart the public delay |
| 1 | LEAD | `FloorVault.rebalancePublic` | A keeper that trades one token keeps the public path closed for the others |
| 1 | LEAD | `FloorVault.rebalancePublic` | The public fallback pays the caller nothing |
| 1 | LEAD | `FloorVault.rebalancePublic` | Each public trade resets the public delay for the whole vault |
| 1 | LEAD | `FloorVault.rebalance` | A keeper cannot split a sell that is too large for a thin pool |
| 2 | LEAD | `FloorVault.rebalance` | A fast fall makes every sell revert on `minOut` |
| 1 | LEAD | `FloorVault.rebalance` | The allowlisted aggregator can change its logic at any time |
| 1 | LEAD | `FloorVault._swap` | A trade of one token resets the public delay for every token |
| 1 | LEAD | `FloorVault.valuation` | `valuation` returns a low V where the interface says it reverts |
| 2 | LEAD | `MarketHours.inWindow` | The trading window stays open after the stock market closes early |
| 1 | LEAD | `MarketHours.isOpen` | `isOpen` returns true after an early market close |
| 2 | LEAD | `SetHolidays.run` | The holiday script accepts any `coversThroughDay` value |
| 2 | FINDING | `TakerProbe.execAggregator` | Any caller can make the probe run any call |
| 2 | FINDING | `TakerProbe.execPancake` | Any caller can make the probe swap with no minimum output |
| 2 | FINDING | `TakerProbe.send` | Any caller can take all tokens that the probe holds |
| 2 | LEAD | `TwapOracle.priceWad` | `priceWad` reverts at ticks near `MAX_TICK` |
| 2 | FINDING | `TwapOracle.twapTick` | A pool with 200 observation slots cannot cover the TWAP window |

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended. For a consultation regarding your projects' security, visit [https://www.pashov.com](https://www.pashov.com)
