<!-- Real /solidity-auditor run by the team lead, 2026-10-03 21:10, commit 41bc39f. AI-assisted audit by Pashov Audit Group skills, not a formal audit. -->
# 🔐 Security Review — floor

---

## Scope

|  |  |
| --- | --- |
| **Mode** | default |
| **Files reviewed** | `./packages/contracts/src/FloorFactory.sol` · `./packages/contracts/src/FloorLens.sol` · `./packages/contracts/src/FloorVault.sol`<br>`./packages/contracts/script/SetHolidays.s.sol` · `./packages/contracts/script/Deploy.s.sol` · `./packages/contracts/src/libs/MarketHours.sol`<br>`./packages/contracts/src/libs/TwapOracle.sol` · `./packages/contracts/src/libs/CPPIMath.sol` · `./packages/contracts/src/libs/SwapGuard.sol`<br>`./packages/contracts/src/libs/vendor/BitMath.sol` · `./packages/contracts/src/libs/vendor/TickMath.sol` · `./packages/contracts/src/libs/vendor/CustomRevert.sol`<br>`./packages/contracts/src/libs/vendor/FullMath.sol` · `./ops/spikes/taker-probe/src/TakerProbe.sol` |
| **Confidence threshold (1-100)** | 75 |
| **Passes** | 3 |
| **Memory** | 25 records before this scan · 63 after · `41bc39f` |

---

## Findings

[90] **1. Any caller can make the probe run any call**

`TakerProbe.execAggregator` · Confidence: 90 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
Any caller can make the probe call any contract with any calldata, so the caller takes every token that the probe holds.

**Fix**

```diff
     function execAggregator(...) external {
+        require(msg.sender == owner, "not owner");
+        require(router != tokenIn && router != tokenOut, "bad router");
```

---

[90] **2. Any caller can make the probe swap with no minimum output**

`TakerProbe.execPancake` · Confidence: 90 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
Any caller can pass a zero `minOut`, so an attacker who trades before and after the probe swap keeps most of the output.

**Fix**

```diff
     function execPancake(...) external {
+        require(msg.sender == owner, "not owner");
+        require(minOut > 0, "minOut");
```

---

[90] **3. Any caller can take all tokens that the probe holds**

`TakerProbe.send` · Confidence: 90 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
Any caller can call `send` and take every token that the probe holds, because the function checks no caller.

**Fix**

```diff
+    address public immutable owner = msg.sender;
+
     function send(address token, address to, uint256 amt) external {
+        require(msg.sender == owner, "not owner");
         IERC20(token).transfer(to, amt);
     }
```

---

[80] **4. A fixed `minTrade` stops small positions from selling until the cushion is zero**

`FloorVault._plan` · Confidence: 80 · seen in 2/3 runs · KNOWN (2 scans)

**Description**
`_plan` sells nothing while the per-token gap is below `minTrade`, so a small position keeps its stock and a later price gap breaks the floor.

**Fix (Option A — allow-and-handle)**

```diff
         uint256 sellMin = minTrade;
-        if (estarI == 0 && dust + 1 < sellMin) sellMin = dust + 1;
+        // A target below minTrade must still be able to sell down to it.
+        if ((estarI == 0 || st.target[i] < minTrade) && dust + 1 < sellMin) sellMin = dust + 1;
```

**Fix (Option B — validate)**

```diff
+        // in FloorFactory.createPosition
+        uint256 estar0 = 4 * (amount - floorFor(amount, floorBps));
+        if (estar0 * minWeightBps / BPS < defaults.minTrade) revert PositionTooSmall();
```

---

[75] **5. One user fills the TVL cap and blocks all other users**

`FloorFactory.createPosition` · Confidence: 75 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
One user opens five positions of 1000 USDT and fills `maxTotalTvl`, so `createPosition` reverts for every other user.

**Fix**

```diff
+        if (ownerTvl[msg.sender] + amount > maxDeposit) revert DepositTooLarge();
+        ownerTvl[msg.sender] += amount;
         if (totalTvl + amount > maxTotalTvl) revert TvlCapReached();
```

---

[75] **6. One wei of stock makes `closeToUSDT` need the guarded oracle**

`FloorVault.closeToUSDT` · Confidence: 75 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
An attacker sends 1 wei of a basket stock to the vault and moves its pool, so `_price` reverts and the owner cannot close to USDT.

**Fix**

```diff
             if (bal == 0) continue;
             IFloorFactory.Asset memory a = _asset(token);
-            uint256 p = _price(a);
+            // The dust test needs no spot or liquidity guard: use the plain TWAP.
+            uint256 p = this.twapOf(a.pool, a.usdtIsToken0);
             if (CPPIMath.valueOf(bal, p) > dust) revert StockNotUnwound();
```

---

[75] **7. One wei of a disabled stock stops every buy in the vault**

`FloorVault._load` · Confidence: 75 · seen in 1/3 runs · NEW

**Description**
Any holder sends 1 wei of a disabled stock with a broken pool, so `_load` sets `anyFailed` and the vault never buys any stock again.

**Fix**

```diff
                 st.failed[i] = true;
-                st.anyFailed = true;
+                // A disabled asset has target 0: its failed price must not stop buys of the other assets.
+                if (a.active) st.anyFailed = true;
```

---

[75] **8. The vault values a token with no TWAP at zero and sells the others**

`FloorVault._load` · Confidence: 75 · seen in 3/3 runs · NEW

**Description**
An attacker who breaks one pool's TWAP for about 200 swaps makes `_load` value that token at zero, so the vault sells every other token.

**Fix**

```diff
                 try this.twapOf(a.pool, a.usdtIsToken0) returns (uint256 r) {
                     p = r;
                 } catch {}
-                if (p == 0) continue;
+                // A held token with no TWAP must not lower V: stop every trade of this position instead.
+                if (p == 0) {
+                    if (bal != 0) st.noPrice = true; // checked in rebalance / rebalancePublic: revert, no sells
+                    continue;
+                }
```

---

[75] **9. The sell band is checked per token, so a basket drifts three bands**

`FloorVault._plan` · Confidence: 75 · seen in 1/3 runs · NEW

**Description**
`_plan` checks the sell band for each token alone, so a three-token basket holds extra exposure and a 15% gap takes it below the floor.

**Fix**

```diff
-            if (amountValue * BPS < sellBandBps * V) return 0;
+            // Scale the band by the token weight, so the basket as a whole stays inside one band.
+            if (amountValue * BPS * BPS < sellBandBps * V * weightBps) return 0;
```

---

[75] **10. The preview returns a blocked token, so the keeper trades no other token**

`FloorVault.previewRebalance` · Confidence: 75 · seen in 2/3 runs · KNOWN (2 scans)

**Description**
`previewRebalance` returns the first token by index without the multiplier or pause checks, so the keeper skips the whole vault and sells no other token.

**Fix**

```diff
         for (uint8 i; i < n; ++i) {
             if (uint256(lastTradeAt[i]) + minInterval > block.timestamp) continue;
             if (st.failed[i]) continue;
+            // Skip a token that rebalance would reject, so the keeper sees the next one.
+            if (_multiplierBlocked(assetAt[i])) continue;
```

---

[75] **11. The public delay counts closed and halted hours, so the public path opens every day**

`FloorVault.rebalancePublic` · Confidence: 75 · seen in 2/3 runs · NEW

**Description**
`publicDelay` counts closed-market and halted time as idle time, so an attacker calls `rebalancePublic` at each open or unhalt before the keeper can trade.

**Fix**

```diff
-        if (uint256(lastRebalance) + publicDelay > block.timestamp) revert PublicTooEarly();
+        // Idle time counts only from the start of the current trading session.
+        uint256 since = Math.max(uint256(lastRebalance), MarketHours.sessionStart(block.timestamp));
+        if (since + publicDelay > block.timestamp) revert PublicTooEarly();
```

---

[75] **12. A caller of `rebalancePublic` trades around the vault swap for profit**

`FloorVault.rebalancePublic` · Confidence: 75 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
The caller moves the spot price inside `maxTickDev`, calls `rebalancePublic`, then trades back, because `minOut` comes from the TWAP and not the spot price.

**Fix**

```diff
-        uint256 minOut_ = CPPIMath.minOut(amountIn, st.price[assetIdx], tolDirectBps, buy);
+        // Use the price that is better for the vault in this direction, so a spot-TWAP gap cannot be taken.
+        uint256 ref = buy ? Math.min(st.price[assetIdx], spotPrice) : Math.max(st.price[assetIdx], spotPrice);
+        uint256 minOut_ = CPPIMath.minOut(amountIn, ref, tolDirectBps, buy);
```

---

[75] **13. A pool with 200 observation slots cannot cover the TWAP window**

`TwapOracle.twapTick` · Confidence: 75 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
200 slots cover about 150 seconds of BSC blocks, so any caller who swaps in each block makes the 600-second TWAP read revert.

**Fix**

```diff
-        if (cardinality < MIN_CARDINALITY) revert OracleHistoryTooShort();
+        // Pancake writes at most one observation per block; BSC blocks are 0.75 s.
+        if (cardinality < MIN_CARDINALITY || uint256(cardinality) < 2 * uint256(twapWindow)) revert OracleHistoryTooShort();
```

---

Findings List

| # | Confidence | Title |
|---|---|---|
| 1 | [90] | Any caller can make the probe run any call |
| 2 | [90] | Any caller can make the probe swap with no minimum output |
| 3 | [90] | Any caller can take all tokens that the probe holds |
| 4 | [80] | A fixed `minTrade` stops small positions from selling until the cushion is zero |
| 5 | [75] | One user fills the TVL cap and blocks all other users |
| 6 | [75] | One wei of stock makes `closeToUSDT` need the guarded oracle |
| 7 | [75] | One wei of a disabled stock stops every buy in the vault |
| 8 | [75] | The vault values a token with no TWAP at zero and sells the others |
| 9 | [75] | The sell band is checked per token, so a basket drifts three bands |
| 10 | [75] | The preview returns a blocked token, so the keeper trades no other token |
| 11 | [75] | The public delay counts closed and halted hours, so the public path opens every day |
| 12 | [75] | A caller of `rebalancePublic` trades around the vault swap for profit |
| 13 | [75] | A pool with 200 observation slots cannot cover the TWAP window |

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. These are not false positives — they are high-signal leads for manual review. Not scored._

- **The keeper amount check rounds its lower bound down to zero** — `CPPIMath.amountInOk` · seen in 1/3 runs · NEW — `computed / 2` rounds down, so a keeper can pick a zero amount for very small sales. We did not find a profitable path.
- **The preflight accepts values that the factory constructor rejects** — `Deploy._preflight` · seen in 1/3 runs · KNOWN (2 scans) — The preflight allows `buyBandBps` up to 2000 while the factory allows 1000, so a parameter file can pass the preflight and revert in the constructor. We found no user loss.
- **The deploy script reverts when the token beacon is zero** — `Deploy.run` · seen in 1/3 runs · KNOWN (2 scans) — `_preflight` accepts a zero beacon off BSC, but `run` always calls `setTokenBeacon`, so the deployment reverts. No user funds are at risk.
- **A pool fee at or above `tolDirectBps` blocks every public swap** — `FloorFactory.addAsset` · seen in 1/3 runs · NEW — `addAsset` accepts any fee tier, so a 1% pool with `tolDirectBps` of 100 makes every `rebalancePublic` revert. Only the owner makes this choice.
- **`addAsset` accepts a `maxTradeValue` below `minTrade`** — `FloorFactory.addAsset` · seen in 1/3 runs · NEW — `addAsset` checks only that `maxTradeValue` is not zero, so the vault makes trades smaller than `minTrade`. We did not show a loss.
- **`addAsset` does not check the multiplier functions the vault calls** — `FloorFactory.addAsset` · seen in 1/3 runs · NEW — `addAsset` checks only `uiMultiplier`, so a revert in `hasPendingMultiplier` or `effectiveAt` blocks every trade of that stock. We did not verify the live token.
- **`addAsset` stores a zero multiplier that its comment calls unsafe** — `FloorFactory.addAsset` · seen in 1/3 runs · NEW — `addAsset` accepts a zero `uiMultiplier` and `reenableAsset` does not read it again. We did not find a path where a zero baseline blocks the guard.
- **`setDefaults` accepts a zero `minInterval` and a zero `dust`** — `FloorFactory._checkDefaults` · seen in 2/3 runs · NEW — `_checkDefaults` sets no lower bound on `minInterval` or `dust`, so a keeper can trade one asset many times in one block. Only the owner can set this.
- **`createPosition` takes deposits while trading is halted** — `FloorFactory.createPosition` · seen in 1/3 runs · NEW — `createPosition` checks `paused` only, so it accepts deposits while the guardian has set `halted`. We found no loss beyond positions that wait in USDT.
- **A position can outlive the holiday table** — `FloorFactory.createPosition` · seen in 1/3 runs · NEW — The factory accepts a term that ends after 2027-12-24, the last holiday in the table, so the vault can trade on an NYSE holiday. We did not prove a loss.
- **USDT sent to a vault skips the launch caps** — `FloorFactory.createPosition` · seen in 1/3 runs · NEW — A user can send USDT straight to a vault, so the vault trades more than `maxDeposit` and `maxTotalTvl` allow. We did not prove harm to any other user.
- **A longer TWAP window is not checked against listed pools** — `FloorFactory.createPosition` · seen in 2/3 runs · NEW — The owner can raise `twapWindow` after listing, so new vaults can get a window longer than the pool history. We did not test a live pool.
- **A disable and re-enable makes every vault sell and buy back** — `FloorFactory.disableAsset` · seen in 1/3 runs · NEW — The guardian and the owner can switch a stock off and on with no delay, so every vault sells and buys it again at a cost. We did not prove a profit for the admin.
- **`_capTransfer` treats a call to an address with no code as success** — `FloorVault._capTransfer` · seen in 1/3 runs · NEW — A call to an address with no code returns success with no data, so the function reports a transfer that did not happen. We found no listed token that can lose its code.
- **A stock donation above `dust` makes `closeToUSDT` revert** — `FloorVault.closeToUSDT` · seen in 1/3 runs · NEW — An attacker who sends stock worth more than `dust` before each owner call makes `closeToUSDT` revert. Each repeat costs the attacker the stock, and `exitInKind` stays open.
- **A USDT with a transfer hook can call `initialize` first** — `FloorVault.initialize` · seen in 3/3 runs · KNOWN (2 scans) — The factory moves USDT into the clone before `initialize`, so a hook token lets another contract initialise first and the creation reverts. BSC USDT has no hook.
- **Any contract can initialise its own clone of the vault** — `FloorVault.initialize` · seen in 2/3 runs · NEW — `initialize` accepts any contract as factory, so anyone can make a fake vault. We found no way for the clone to change the real factory.
- **A revert in one stock's `balanceOf` stops every rebalance** — `FloorVault._load` · seen in 1/3 runs · NEW — `_load` reads `balanceOf` of every stock with no try/catch, so one stock that reverts blocks sells of the healthy stocks. We did not prove that a real bStock upgrade reverts. Code smells: unguarded external read, disabled assets stay in the loop.
- **A spot push on one pool stops all buys in the basket** — `FloorVault._load` · seen in 2/3 runs · NEW — `_load` sets `anyFailed` even for a token with zero balance, so an attacker who moves one pool before a keeper buy stops all buys. We did not measure the cost per block.
- **A caller may set gas so that a price self-call fails** — `FloorVault._load` · seen in 2/3 runs · NEW — The price self-calls catch out-of-gas, so a public caller could try to make a token look unpriced. Both agents found that the 1/64 gas left cannot pay for the swap.
- **V rounds up for pools that hold USDT as token0** — `FloorVault._load` · seen in 1/3 runs · NEW — `twapTick` rounds the tick down and `priceWad` inverts it for USDT-token0 pools, so V rounds up by up to 1 bp. We did not find a trade where this crosses a band.
- **The fallback value trusts the TWAP of a thin pool** — `FloorVault._load` · seen in 1/3 runs · NEW — When the guarded price fails, `_load` uses `twapOf` with no liquidity check, so a thin pool's low TWAP lowers V and the vault sells other stock. We did not price the cost to hold the TWAP down.
- **The multiplier guard stops sales during a full unwind** — `FloorVault._multiplierSettle` · seen in 1/3 runs · NEW — `_multiplierSettle` reverts in both directions, so during `Closing` or after maturity a price fall in that time can take the vault below its floor. We did not measure the block length.
- **A multiplier change of one token makes the vault sell another token** — `FloorVault._multiplierSettle` · seen in 1/3 runs · KNOWN (2 scans) — The guard checks the multiplier of the traded token only, so a split of token B values B at its old TWAP and the vault sells token A too early. We did not measure the loss.
- **`_plan` blocks buys even when the TWAP value is correct** — `FloorVault._plan` · seen in 2/3 runs · NEW — `_plan` blocks every buy when any guard fails, but the `twapOf` fallback already values the position correctly. We did not prove a loss beyond missed exposure.
- **The trade rate limit can be too slow for a large fall** — `FloorVault._plan` · seen in 1/3 runs · NEW — The vault sells at most `maxTradeValue` per `minInterval` in a 4-hour window, so a large fall can take V below the floor. We did not prove a set of owner settings where this happens.
- **An attacker moves a thin pool's TWAP so the vault sells low and buys high** — `FloorVault._plan` · seen in 1/3 runs · NEW — The trade direction comes only from the TWAP, so an attacker who holds a thin pool's TWAP low and then high makes the vault sell low and buy back high. We did not compare the cost with the payoff.
- **A zero `dust` leaves stock that no swap can sell** — `FloorVault._plan` · seen in 3/3 runs · KNOWN (2 scans) — `setDefaults` accepts `dust` 0, so a 1-wei remainder blocks `closeToUSDT` forever for that vault. The owner can still use `exitInKind`.
- **A low-gas balance read skips a stock in the exit paths** — `FloorVault._readBalance` · seen in 1/3 runs · NEW — `_readBalance` has no `gasleft()` check, so a low-gas owner call skips a stock, against the A12 F-09 comment. Only the owner can call these paths.
- **A keeper can reset the public delay with a zero-size trade** — `FloorVault.rebalance` · seen in 3/3 runs · KNOWN (2 scans) — When the computed amount is 1, `amountInOk` accepts `amountIn` 0, so a keeper resets `lastRebalance` with no swap. We did not find a normal state with a computed amount of 1.
- **The public path ignores the doubled band during a full unwind** — `FloorVault.rebalancePublic` · seen in 1/3 runs · NEW — `sellAmount` returns early when E* is zero, so any caller can use the public path for small sells after maturity. We did not show a loss larger than about 1% of a small trade.
- **Each public trade resets the public delay for the whole vault** — `FloorVault.rebalancePublic` · seen in 1/3 runs · NEW — `_swap` writes `lastRebalance` on public trades too, so while keepers are offline the public path sells one capped trade per `publicDelay`. We did not trace a fall that breaks the floor in that time.
- **A keeper gets the wide tolerance on any path through the Pancake router** — `FloorVault.rebalance` · seen in 2/3 runs · NEW — The tolerance depends only on the router address, so a keeper who routes through its own pools or a `sweepTokenWithFee` multicall takes up to `tolDirectBps` of each trade. Only a keeper can do this.
- **A keeper cannot split a sell that is too large for a thin pool** — `FloorVault.rebalance` · seen in 1/3 runs · NEW — `amountInOk` forces at least half of the computed amount, so in a pool at `minLiquidity` each de-risk sell can exceed the tolerance and revert. We did not check the real depth of the listed pools.
- **A keeper pays the vault only the TWAP minimum output** — `FloorVault.rebalance` · seen in 3/3 runs · NEW — A keeper can use router `pull` and `sweepToken` calls to pay the vault only the TWAP minimum and keep the rest. Only a keeper can do this.
- **The allowlisted aggregator can change its logic at any time** — `FloorVault.rebalance` · seen in 1/3 runs · NEW — The aggregator is a proxy with an EOA owner, so that owner can change the logic and keep the spread above the TWAP minimum. We did not measure the spread.
- **A low-gas close can leave the deposit in `totalTvl`** — `FloorVault._reportClosed` · seen in 1/3 runs · NEW — `_reportClosed` ignores the result of a gas-capped call, so a tight-gas close could keep the deposit counted. Most agents found that the 63/64 rule stops this, and none tested it.
- **A real price fall makes keeper sells revert until the TWAP catches up** — `FloorVault._swap` · seen in 2/3 runs · NEW — `minOut` comes from the TWAP, so during a 2% fall each sell reverts `MinOutNotMet`. We did not measure how far V falls below the floor in a fast decline.
- **The holiday script accepts unix seconds as day numbers** — `SetHolidays.run` · seen in 1/3 runs · NEW — The script checks only a lower bound, so a file in unix seconds marks no real holiday and `isOpen` returns true on holidays. We did not check the real JSON file.
- **The tick rounding raises the stock price for USDT-token0 pools** — `TwapOracle.priceWad` · seen in 2/3 runs · NEW — The rounded-down tick gives a higher stock price for USDT-token0 pools, so V rounds up by up to 1 bp against rule I6. We found no input where this pays more than dust.

---

## Known from earlier scans

_Recorded by earlier scans of this repo, not raised again by this one. Not re-checked — a record here may be fixed, or may still be live and missed. `.solidity-auditor/memory.tsv`._

| Scans | Kind | Location | Title |
|---|---|---|---|
| 1 | LEAD | `Deploy._load` | The deploy script cuts large default values to a smaller type before it checks t |
| 1 | LEAD | `FloorFactory.createPosition` | A user can grow `positions[]` without limit |
| 1 | LEAD | `FloorFactory.onPositionClosed` | A position that the owner never closes holds its deposit in the cap |
| 1 | LEAD | `FloorFactory.pokeMultiplier` | Any caller can start the multiplier transition block |
| 1 | LEAD | `FloorVault._multiplierSettle` | A pending multiplier flag that never clears blocks every rebalance of the token |
| 1 | LEAD | `FloorVault._price` | After a price gap, the spot guard blocks every trade while the TWAP lags |
| 1 | LEAD | `FloorVault.rebalance` | A multiplier change of one token mis-sizes the trade of another token |
| 1 | LEAD | `FloorVault.rebalancePublic` | A keeper that trades one token keeps the public path closed for the others |
| 1 | LEAD | `MarketHours.inWindow` | The trading window stays open after the stock market closes early |
| 1 | LEAD | `MarketHours.isOpen` | `isOpen` returns true after an early market close |

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended. For a consultation regarding your projects' security, visit [https://www.pashov.com](https://www.pashov.com)
