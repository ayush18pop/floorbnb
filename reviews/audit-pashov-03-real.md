<!-- Real /solidity-auditor run by the team lead, 2026-10-03 23:12, commit 10a8575. AI-assisted audit by Pashov Audit Group skills, not a formal audit. -->
# 🔐 Security Review — floor

---

## Scope

|  |  |
| --- | --- |
| **Mode** | default |
| **Files reviewed** | `./packages/contracts/src/FloorFactory.sol` · `./packages/contracts/src/FloorLens.sol` · `./packages/contracts/src/FloorVault.sol`<br>`./packages/contracts/script/SetHolidays.s.sol` · `./packages/contracts/script/Deploy.s.sol` · `./ops/spikes/taker-probe/src/TakerProbe.sol`<br>`./packages/contracts/src/libs/MarketHours.sol` · `./packages/contracts/src/libs/TwapOracle.sol` · `./packages/contracts/src/libs/CPPIMath.sol`<br>`./packages/contracts/src/libs/SwapGuard.sol` · `./packages/contracts/src/libs/vendor/BitMath.sol` · `./packages/contracts/src/libs/vendor/TickMath.sol`<br>`./packages/contracts/src/libs/vendor/CustomRevert.sol` · `./packages/contracts/src/libs/vendor/FullMath.sol` |
| **Confidence threshold (1-100)** | 75 |
| **Passes** | 3 |
| **Memory** | 63 records before this scan · 84 after · `10a8575` |

---

## Findings

[75] **1. One user fills the TVL cap and blocks all other users**

`FloorFactory.createPosition` · Confidence: 75 · seen in 3/3 runs · KNOWN (3 scans)

**Description**
One user opens five positions of 1000 USDT and fills `maxTotalTvl`, so `createPosition` reverts for every other user while that user pays only gas.

**Fix**

```diff
+        if (ownerTvl[msg.sender] + amount > maxDeposit) revert DepositTooLarge();
+        ownerTvl[msg.sender] += amount;
         if (totalTvl + amount > maxTotalTvl) revert TvlCapReached();
```

---

[75] **2. A disabled token with a raised thin-pool TWAP makes the vault spend all its USDT**

`FloorVault._load` · Confidence: 75 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
The vault counts a disabled token at an unguarded TWAP that its sell path rejects, so the vault buys stock while its true value is below the floor.

**Fix**

```diff
                 st.failed[i] = true;
-                // A disabled asset (target 0) must not stop buys of the others, 1 wei of it is enough (Pashov 02 #7).
-                if (a.active) st.anyFailed = true;
+                // A held asset valued by the unguarded TWAP fallback must stop buys, active or not.
+                if (a.active || bal != 0) st.anyFailed = true;
```

---

[75] **3. The buy band is not scaled by the token weight, so low-weight tokens stay unbought**

`FloorVault._plan` · Confidence: 75 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
`_plan` scales the sell band by the token weight but tests the buy band against all of V, so the vault sells small overshoots and leaves large shortfalls unbought.

**Fix (Option A — allow-and-handle)**

```diff
+        uint256 bBand = uint256(buyBandBps) * bandMul * weightBps[i] / CPPIMath.BPS;
+        if (bBand == 0) bBand = 1;
         value = CPPIMath.buyAmount(
-            st.value[i], st.target[i], st.V, st.usdtBal, uint256(buyBandBps) * bandMul, minTrade, maxTrade
+            st.value[i], st.target[i], st.V, st.usdtBal, bBand, minTrade, maxTrade
         );
```

**Fix (Option B — validate)**

```diff
+        // in FloorFactory._checkBasket
+        if (w[i] < defaults.buyBandBps) revert BadBasket();
```

---

[75] **4. The preview returns a paused token, so the keeper trades no other token**

`FloorVault.previewRebalance` · Confidence: 75 · seen in 2/3 runs · KNOWN (3 scans)

**Description**
`previewRebalance` does not skip a paused or blocklisted bStock, so it returns that token first and the keeper sells no other token of the vault.

**Fix**

```diff
             if (_multiplierBlocked(assetAt[i])) continue;
+            // A paused token cannot swap: skip it so the keeper sees the next one.
+            try ISecuritiesToken(assetAt[i]).pauseManager().isTokenPaused(assetAt[i]) returns (bool p) {
+                if (p) continue;
+            } catch {}
```

---

[75] **5. The public delay counts holidays and halted sessions as open time**

`FloorVault.rebalancePublic` · Confidence: 75 · seen in 3/3 runs · KNOWN (2 scans)

**Description**
`MarketHours.openSeconds` counts `nonTradingDay` holidays and guardian halts as open time, so any caller runs `rebalancePublic` at the first second after them.

**Fix**

```diff
-        if (MarketHours.openSeconds(lastRebalance, block.timestamp) < publicDelay) revert PublicTooEarly();
+        // Closed days and halts must not count: the keeper gets a full real session first.
+        if (MarketHours.openSeconds(lastRebalance, block.timestamp) - factory.closedOpenSeconds(lastRebalance, block.timestamp) < publicDelay)
+            revert PublicTooEarly();
```

---

[75] **6. A caller of `rebalancePublic` trades around the vault swap for profit**

`FloorVault.rebalancePublic` · Confidence: 75 · seen in 3/3 runs · KNOWN (3 scans)

**Description**
The caller moves the spot price inside `maxTickDev` and trades back after the vault swap, because `minOut` comes from the TWAP and allows a 1% loss.

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
| 2 | [75] | A disabled token with a raised thin-pool TWAP makes the vault spend all its USDT |
| 3 | [75] | The buy band is not scaled by the token weight, so low-weight tokens stay unbought |
| 4 | [75] | The preview returns a paused token, so the keeper trades no other token |
| 5 | [75] | The public delay counts holidays and halted sessions as open time |
| 6 | [75] | A caller of `rebalancePublic` trades around the vault swap for profit |

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. These are not false positives — they are high-signal leads for manual review. Not scored._

- **A keeper can stretch the full unwind with half-size sells** — `CPPIMath.amountInOk` · seen in 1/3 runs · KNOWN (2 scans) — The half-size lower bound lets a keeper unwind in about ten intervals, so `closeToUSDT` reverts all that time. Only a keeper can do this.
- **The deploy script cuts large default values to a smaller type before it checks them** — `Deploy._load` · seen in 1/3 runs · KNOWN (2 scans) — `uint16` and `uint32` casts cut JSON values before `_preflight`, so 65736 becomes 200 and passes. We found no real parameter file with this error.
- **The preflight skips two `addAsset` checks** — `Deploy._preflight` · seen in 1/3 runs · KNOWN (3 scans) — `_preflightAsset` does not check the pool fee against `tolDirectBps` or the multiplier getters, so the deploy fails after preflight passes. We did not confirm a partial broadcast.
- **The deployer key keeps owner powers until the new owner accepts** — `Deploy.run` · seen in 1/3 runs · NEW — `run` calls only `transferOwnership`, so the hot deployer key stays owner until `acceptOwnership`. A leak of that key in this window gives full control.
- **`addAsset` does not check that the token uses `tokenBeacon`** — `FloorFactory.addAsset` · seen in 1/3 runs · NEW — A token outside the beacon gets no buy guard, so its issuer can change its code and vaults still buy it. We did not check the live tokens.
- **`addAsset` accepts a pool fee only 1 bps below `tolDirectBps`** — `FloorFactory.addAsset` · seen in 1/3 runs · KNOWN (2 scans) — The check rejects only fee at or above the tolerance, so most public swaps revert on price impact. We did not test the live trade sizes.
- **The `publicDelay` bound counts calendar days, but the vault counts open seconds** — `FloorFactory._checkDefaults` · seen in 1/3 runs · NEW — The 7-day upper bound allows 42 trading sessions, so the owner can close the public path for about eight weeks. Only the owner sets this value.
- **`setDefaults` accepts values that the deploy preflight rejects** — `FloorFactory._checkDefaults` · seen in 1/3 runs · KNOWN (2 scans) — `_checkDefaults` allows a 60-second `twapWindow` and skips the band, delay and dust order checks of `_preflight`. We did not prove a loss from these bounds.
- **The unwind after maturity can sell on a day after the holiday table** — `FloorFactory.createPosition` · seen in 1/3 runs · KNOWN (2 scans) — The horizon check covers only the maturity day, so the post-maturity unwind can trade on an unlisted holiday. We did not measure how long an unwind takes.
- **A small position gets no stock, because each target stays below `minTrade`** — `FloorFactory.createPosition` · seen in 2/3 runs · NEW — `createPosition` does not check that each token target reaches `minTrade`, so a small deposit stays in USDT for its whole term.
- **The cardinality check assumes a fixed 0.75 s block time** — `FloorFactory._minCardinality` · seen in 2/3 runs · NEW — The slot count uses 0.75 s blocks, and the agents disagree on whether Pancake writes one observation per block or per second. We did not check the Pancake source.
- **No function can move a token to a new pool** — `FloorFactory.reenableAsset` · seen in 1/3 runs · NEW — `reenableAsset` reuses the stored pool, so when liquidity moves to another fee tier every vault still prices on the old pool. We found no attacker gain.
- **`reenableAsset` skips the listing checks of `addAsset`** — `FloorFactory.reenableAsset` · seen in 3/3 runs · NEW — `reenableAsset` skips the `maxTradeValue`, fee and multiplier getter checks, so a token can return under defaults it fails. Only the owner can do this.
- **`setDefaults` can set `tolDirectBps` below a listed pool fee** — `FloorFactory.setDefaults` · seen in 3/3 runs · NEW — `_checkDefaults` does not compare `tolDirectBps` with listed pool fees, so direct swaps of new vaults revert. Only the owner can make this change.
- **A stock donation above `dust` makes `closeToUSDT` revert** — `FloorVault.closeToUSDT` · seen in 2/3 runs · KNOWN (2 scans) — Each donation above `dust` needs one more unwind sell and one more `minInterval` wait. We did not compare the attacker cost with the owner loss.
- **One wei of a stock with no readable TWAP makes `closeToUSDT` revert** — `FloorVault.closeToUSDT` · seen in 1/3 runs · KNOWN (3 scans) — `closeToUSDT` needs `twapOf` for every held token, so the owner must use `exitInKind`. We found no pool state that an attacker can cause.
- **A USDT with a transfer hook can call `initialize` first** — `FloorVault.initialize` · seen in 3/3 runs · KNOWN (3 scans) — The factory moves USDT into the clone before `initialize`, so a hook token lets another contract initialise first. BSC USDT has no hook.
- **Any contract can initialise its own clone of the vault** — `FloorVault.initialize` · seen in 3/3 runs · KNOWN (2 scans) — `initialize` accepts any caller with code as the factory, so anyone can make a fake vault. We found no on-chain path to a registered vault.
- **The vault buys stock again after the cash lock** — `FloorVault._load` · seen in 1/3 runs · NEW — `_load` computes E* from the current V and stores no lock, so a price recovery or a USDT donation makes the vault buy after V fell to F. We did not prove a loss beyond the broken spec rule.
- **One wei of a disabled token with no TWAP stops every CPPI sell** — `FloorVault._load` · seen in 2/3 runs · KNOWN (2 scans) — `_load` sets `noPrice` for any held token, so 1 wei of a disabled token whose TWAP reverts stops all sells. We did not prove such a live state.
- **A paused bStock keeps its last pool price in V** — `FloorVault._load` · seen in 1/3 runs · NEW — `_load` does not read `isTokenPaused`, so the vault trades the other tokens against a frozen value. We did not measure the real price move during a pause.
- **The vault values its stock at a TWAP that its own buys raise** — `FloorVault._load` · seen in 1/3 runs · NEW — The vaults' buys raise the pool TWAP, so V includes price impact that a sale cannot recover. We did not prove a floor breach with real pool depth.
- **A spot push on one pool stops all buys in the basket** — `FloorVault._load` · seen in 1/3 runs · KNOWN (2 scans) — Any active pool that fails its spot guard sets `anyFailed`, so an attacker who moves one pool stops every buy. We did not prove a cost below the pool fees.
- **A TWAP at an extreme tick rounds the price to zero** — `FloorVault._load` · seen in 1/3 runs · NEW — `priceWad` returns 0 beyond about ±414,486 ticks, and `_load` reads 0 as "no TWAP", so a held pool held at that tick stops all CPPI sells. We did not measure the cost to hold a real pool there.
- **A frequently changing multiplier blocks every trade of the token** — `FloorVault._multiplierSettle` · seen in 1/3 runs · NEW — Each change of `uiMultiplier()` stops trading of that token for `twapWindow`, so a multiplier that changes often stops it for good. We did not verify how often the live multiplier changes.
- **For weights below 50 bps the public band equals the keeper band** — `FloorVault._plan` · seen in 2/3 runs · NEW — The band rounds to 0 and then becomes 1, so both paths use a 1 bps band. We did not measure the fee loss over a term.
- **A `dust` below one raw unit of stock leaves stock that no swap can sell** — `FloorVault._plan` · seen in 2/3 runs · KNOWN (3 scans) — `setDefaults` accepts `dust` of 1 wei, so one donated raw unit blocks `closeToUSDT`. The owner can still use `exitInKind`.
- **The vault checks 200 slots, not the slots its TWAP window needs** — `FloorVault._price` · seen in 1/3 runs · NEW — A vault with a longer `twapWindow` never checks the pool again, so `observe` can revert and stop sells. We did not prove a live pool with too few slots.
- **A spot push beyond `maxTickDev` blocks every sell of that stock** — `FloorVault._price` · seen in 2/3 runs · KNOWN (2 scans) — The guard does not look at the trade direction, so an attacker who moves the spot before each keeper call stops de-risk sells. We did not prove an attacker profit.
- **A keeper can keep the public path closed with half-size trades** — `FloorVault.rebalance` · seen in 2/3 runs · KNOWN (3 scans) — `amountInOk` accepts half the computed amount, so the leftover stays below the band and each trade resets `lastRebalance`. Only a keeper can do this.
- **The public delay counts from the last trade, not from the start of drift** — `FloorVault.rebalancePublic` · seen in 1/3 runs · NEW — A drift that starts after a long idle time, or a `requestClose`, opens the public path at once, so the keeper gets no session for it. We did not measure the real sandwich profit against pool depth.
- **A keeper gets the wide tolerance on any path through the Pancake router** — `FloorVault.rebalance` · seen in 2/3 runs · KNOWN (2 scans) — The tolerance depends only on the router address, so a keeper gets 100 bps on any Pancake router call. Only a keeper can do this.
- **A spot price held below the TWAP makes every keeper sell revert** — `FloorVault.rebalance` · seen in 1/3 runs · NEW — The guard allows 300 ticks but `minOut` allows 1%, so a held spot makes each sell revert and the keeper skips the vault. We did not measure the arbitrage cost.
- **A keeper pays the vault only the TWAP minimum output** — `FloorVault.rebalance` · seen in 3/3 runs · KNOWN (2 scans) — A keeper can route each trade through its own pool and keep the gap above `minOut`. Only a keeper can do this.
- **A trade of one token resets the public delay for every token** — `FloorVault._swap` · seen in 1/3 runs · NEW — `_swap` writes the vault-wide `lastRebalance`, so a keeper that trades token 0 keeps `rebalancePublic` closed for the others. We did not show a keeper gain.
- **One vault's sell blocks the next vault's sell of the same stock** — `FloorVault._swap` · seen in 2/3 runs · KNOWN (2 scans) — The first sell moves the spot but not the TWAP, so later sells revert `MinOutNotMet` or `PriceDeviation` in a crash. We did not measure real pool depth.
- **`valuation` returns a low V where the interface says it reverts** — `FloorVault.valuation` · seen in 1/3 runs · NEW — `_load` counts a token with no TWAP as 0, so the UI shows a low value with no error. We found no on-chain loss.
- **The trading window stays open after the stock market closes early** — `MarketHours.inWindow` · seen in 1/3 runs · KNOWN (2 scans) — The fixed [15:30, 19:30) UTC window stays open after a 13:00 ET close unless the day is marked closed. We did not measure the loss.
- **The holiday script accepts any `coversThroughDay` value** — `SetHolidays.run` · seen in 1/3 runs · KNOWN (2 scans) — The script does not check the horizon against the last holiday or its unit, so a bad file turns off or breaks the term check in `createPosition`. Only the guardian runs it.
- **`exec` does not revert when the `tokenOut` balance falls** — `SwapGuard.exec` · seen in 1/3 runs · NEW — The `tokenOut` branch checks only `received < minOut`, so a fall of that balance passes when `minOut` is 0. We found no allowance today that allows it.
- **The tick rounding raises the stock price for USDT-token0 pools** — `TwapOracle.priceWad` · seen in 2/3 runs · KNOWN (2 scans) — The rounded-down tick raises the stock price by up to 1 bp, so V rounds up. We found no profit above dust.
- **`priceWad` reverts at ticks near `MAX_TICK`** — `TwapOracle.priceWad` · seen in 1/3 runs · NEW — `mulDiv` overflows near `MAX_TICK`, so the vault treats the token as unpriced and stops sells. No real pool reaches such a tick.

---

## Known from earlier scans

_Recorded by earlier scans of this repo, not raised again by this one. Not re-checked — a record here may be fixed, or may still be live and missed. `.solidity-auditor/memory.tsv`._

| Scans | Kind | Location | Title |
|---|---|---|---|
| 2 | LEAD | `Deploy.run` | The deploy script reverts when the token beacon is zero |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` accepts a `maxTradeValue` below `minTrade` |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` does not check the multiplier functions the vault calls |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` stores a zero multiplier that its comment calls unsafe |
| 1 | LEAD | `FloorFactory.createPosition` | `createPosition` takes deposits while trading is halted |
| 1 | LEAD | `FloorFactory.createPosition` | USDT sent to a vault skips the launch caps |
| 1 | LEAD | `FloorFactory.createPosition` | A longer TWAP window is not checked against listed pools |
| 1 | LEAD | `FloorFactory.createPosition` | A user can grow `positions[]` without limit |
| 1 | LEAD | `FloorFactory.disableAsset` | A disable and re-enable makes every vault sell and buy back |
| 1 | LEAD | `FloorFactory.onPositionClosed` | A position that the owner never closes holds its deposit in the cap |
| 1 | LEAD | `FloorFactory.pokeMultiplier` | Any caller can start the multiplier transition block |
| 1 | LEAD | `FloorVault._capTransfer` | `_capTransfer` treats a call to an address with no code as success |
| 1 | LEAD | `FloorVault._load` | A revert in one stock's `balanceOf` stops every rebalance |
| 1 | LEAD | `FloorVault._load` | A caller may set gas so that a price self-call fails |
| 1 | LEAD | `FloorVault._load` | V rounds up for pools that hold USDT as token0 |
| 1 | FINDING | `FloorVault._load` | The vault values a token with no TWAP at zero and sells the others |
| 1 | LEAD | `FloorVault._multiplierSettle` | The multiplier guard stops sales during a full unwind |
| 2 | LEAD | `FloorVault._multiplierSettle` | A multiplier change of one token makes the vault sell another token |
| 1 | LEAD | `FloorVault._multiplierSettle` | A pending multiplier flag that never clears blocks every rebalance of the token |
| 2 | FINDING | `FloorVault._plan` | A fixed `minTrade` stops small positions from selling until the cushion is zero |
| 1 | LEAD | `FloorVault._plan` | `_plan` blocks buys even when the TWAP value is correct |
| 1 | LEAD | `FloorVault._plan` | The trade rate limit can be too slow for a large fall |
| 1 | LEAD | `FloorVault._plan` | An attacker moves a thin pool's TWAP so the vault sells low and buys high |
| 1 | LEAD | `FloorVault._readBalance` | A low-gas balance read skips a stock in the exit paths |
| 1 | LEAD | `FloorVault.rebalance` | A multiplier change of one token mis-sizes the trade of another token |
| 1 | LEAD | `FloorVault.rebalancePublic` | The public path ignores the doubled band during a full unwind |
| 1 | LEAD | `FloorVault.rebalancePublic` | A keeper that trades one token keeps the public path closed for the others |
| 1 | LEAD | `FloorVault.rebalancePublic` | Each public trade resets the public delay for the whole vault |
| 1 | LEAD | `FloorVault.rebalance` | A keeper cannot split a sell that is too large for a thin pool |
| 1 | LEAD | `FloorVault.rebalance` | The allowlisted aggregator can change its logic at any time |
| 1 | LEAD | `FloorVault._reportClosed` | A low-gas close can leave the deposit in `totalTvl` |
| 1 | LEAD | `MarketHours.isOpen` | `isOpen` returns true after an early market close |
| 2 | FINDING | `TakerProbe.execAggregator` | Any caller can make the probe run any call |
| 2 | FINDING | `TakerProbe.execPancake` | Any caller can make the probe swap with no minimum output |
| 2 | FINDING | `TakerProbe.send` | Any caller can take all tokens that the probe holds |
| 2 | FINDING | `TwapOracle.twapTick` | A pool with 200 observation slots cannot cover the TWAP window |

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended. For a consultation regarding your projects' security, visit [https://www.pashov.com](https://www.pashov.com)
