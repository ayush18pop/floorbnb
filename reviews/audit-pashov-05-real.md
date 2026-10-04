# 🔐 Security Review — floor

---

## Scope

|  |  |
| --- | --- |
| **Mode** | default |
| **Files reviewed** | `./packages/contracts/src/FloorFactory.sol` · `./packages/contracts/src/FloorLens.sol` · `./packages/contracts/src/FloorVault.sol`<br>`./packages/contracts/script/SetHolidays.s.sol` · `./packages/contracts/script/Deploy.s.sol` · `./ops/spikes/taker-probe/src/TakerProbe.sol`<br>`./packages/contracts/src/libs/DefaultsCheck.sol` · `./packages/contracts/src/libs/MarketHours.sol` · `./packages/contracts/src/libs/TwapOracle.sol`<br>`./packages/contracts/src/libs/CPPIMath.sol` · `./packages/contracts/src/libs/SwapGuard.sol` · `./packages/contracts/src/libs/vendor/BitMath.sol`<br>`./packages/contracts/src/libs/vendor/TickMath.sol` · `./packages/contracts/src/libs/vendor/CustomRevert.sol` · `./packages/contracts/src/libs/vendor/FullMath.sol` |
| **Confidence threshold (1-100)** | 75 |
| **Passes** | 3 |
| **Memory** | 116 records before this scan · 129 after · `27581fc` |

---

## Findings

[85] **1. One address fills the TVL cap and blocks all other users**

`FloorFactory.createPosition` · Confidence: 85 · seen in 3/3 runs · KNOWN (6 scans)

**Description**
One address opens five positions of the maximum deposit, fills `maxTotalTvl`, and every other user then reverts with `TvlCapReached`, while the attacker can close each position for the cost of gas.

**Fix (Option A — restrict per owner)**:

```diff
  if (totalTvl + amount > maxTotalTvl) revert TvlCapReached();
+ if (ownerLiveDeposit[msg.sender] + amount > maxOwnerDeposit) revert OwnerCapReached();
+ ownerLiveDeposit[msg.sender] += amount; // release in onPositionClosed
```

**Fix (Option B — ban instant release)**:

```diff
- function onPositionClosed(uint256 deposit) external {
+ function onPositionClosed(uint256 deposit) external {
+     if (block.timestamp < openedAt[msg.sender] + MIN_HOLD) return; // cap stays used until the minimum hold ends
```

---

[75] **2. The factory checks the first buy against a band that the public path doubles**

`FloorFactory.createPosition` · Confidence: 75 · seen in 3/3 runs · KNOWN (3 scans)

**Description**
`_checkNotTooSmall` tests each target against the keeper buy band, but `rebalancePublic` uses `PUBLIC_BAND_MULT` times that band, so for some baskets only the keeper can buy.

**Fix (Option A — check the doubled band)**:

```diff
- uint256 band = buyBand * w[i] / CPPIMath.BPS;
+ uint256 band = 2 * buyBand * w[i] / CPPIMath.BPS; // PUBLIC_BAND_MULT in FloorVault
```

**Fix (Option B — cap the band in the defaults)**:

```diff
- if (d.buyBandBps > 1000) return "buyBand";
+ if (d.buyBandBps > 400) return "buyBand"; // 2x band must fit the smallest allowed E*
```

---

[75] **3. An attacker who holds a thin pool TWAP low sets the permanent cash lock**

`FloorVault.lockIfBelowFloor` · Confidence: 75 · seen in 3/3 runs · KNOWN (3 scans)

**Description**
Any caller can set the permanent `cashLocked` flag during open hours when the TWAP value is at the floor margin, so an attacker who holds a thin pool TWAP low locks the owner into USDT.

**Fix**

```diff
-        cashLocked = true;
-        emit CashLocked(st.V, floor);
-        return true;
+        // lock only after the condition holds at two reads that are one TWAP window apart
+        if (lockArmedAt == 0 || block.timestamp < lockArmedAt + twapWindow) { lockArmedAt = uint40(block.timestamp); return false; }
+        cashLocked = true;
+        emit CashLocked(st.V, floor);
+        return true;
```

---

[75] **4. A caller of `rebalancePublic` trades around the vault swap for profit**

`FloorVault.rebalancePublic` · Confidence: 75 · seen in 3/3 runs · KNOWN (6 scans)

**Description**
The caller moves the pool price inside `maxTickDev`, runs `rebalancePublic`, and keeps up to `tolDirectBps` of the trade value because `minOut` comes from the TWAP.

**Fix (Option A — restrict the spot distance)**:

```diff
  State memory st = _load();
+ // public trades need the spot close to the TWAP, not only inside maxTickDev
+ if (TwapOracle.tickGap(pool, twapWindow) > PUBLIC_MAX_TICK_GAP) revert PriceMoved();
  (bool go, bool buy, uint256 amountIn) = _publicPlan(st, assetIdx);
```

**Fix (Option B — limit the loss per call)**:

```diff
  (buy, value, amountIn) = _plan(st, assetIdx, PUBLIC_BAND_MULT);
+ if (amountIn > st.V / PUBLIC_MAX_CHUNK_DIV) amountIn = st.V / PUBLIC_MAX_CHUNK_DIV;
```

---

Findings List

| # | Confidence | Title |
|---|---|---|
| 1 | [85] | One address fills the TVL cap and blocks all other users |
| 2 | [75] | The factory checks the first buy against a band that the public path doubles |
| 3 | [75] | An attacker who holds a thin pool TWAP low sets the permanent cash lock |
| 4 | [75] | A caller of `rebalancePublic` trades around the vault swap for profit |

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. These are not false positives — they are high-signal leads for manual review. Not scored._

- **`tolAggBps` can be below the pool fee** — `FloorFactory._checkDefaults` · seen in 1/3 runs · NEW — Code smells: `feeFits` links the pool fee to `tolDirectBps` only. — An aggregator swap through a 25 bps pool can revert on `minOut`, so the keeper path stalls. We did not check this on a fork.
- **The factory does not check the `approveTarget` of the Pancake router** — `FloorFactory.constructor` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: the constructor and `addRouter` accept any nonzero `approveTarget`; only the deploy script checks it. — A wrong entry gives another address an allowance while the router runs.
- **The factory does not check the decimals of the USDT address** — `FloorFactory.constructor` · seen in 1/3 runs · NEW — Code smells: the constructor never reads `usdt_.decimals()`, and `CPPIMath`, `TwapOracle.priceWad` and `MIN_DEPOSIT` assume 18 decimals. — Only `Deploy._preflight` checks it. A deploy outside the script with a 6-decimal token makes every value wrong by 1e12.
- **A zero holiday horizon lets a position mature past the holiday table** — `FloorFactory.createPosition` · seen in 2/3 runs · KNOWN (4 scans) — Code smells: the horizon check is skipped when `holidayHorizonDay == 0`. — A factory deployed without a horizon accepts any term, so vaults may trade on unlisted holidays.
- **USDT sent to a predicted vault address skips the deposit caps** — `FloorFactory.createPosition` · seen in 2/3 runs · KNOWN (3 scans) — Code smells: the clone address follows from the factory nonce, and the caps count only `amount`. — We found no profit for the donor.
- **The factory checks targets against `minTrade` before the first buy loses value** — `FloorFactory.createPosition` · seen in 1/3 runs · KNOWN (3 scans) — Code smells: `_checkNotTooSmall` tests each target at the lossless start value; the swap fee lowers E* after the first buy. — A target that equals `minTrade` passes the check, then falls below it after the first buy, so `buyAmount` returns 0 and that weight stays in USDT. This affects only the position owner, so it stays a lead.
- **`createPosition` checks observation slots but not the filled history** — `FloorFactory.createPosition` · seen in 2/3 runs · KNOWN (2 scans) — Code smells: `_requireHistory` reads `slot0` cardinality only, while `addAsset` also calls `observe(twapWindow)`. — A deposit can enter a basket whose TWAP reverts, and the vault cannot trade.
- **A user can grow `positions[]` at the cost of gas only** — `FloorFactory.createPosition` · seen in 2/3 runs · KNOWN (2 scans) — Code smells: a 1e18 deposit, close and reopen cycle adds one entry each time. — Keepers read `FloorLens.scan` in pages, so a full scan is optional.
- **A token disable forces a full public sale in every vault** — `FloorFactory.disableAsset` · seen in 1/3 runs · KNOWN (3 scans) — Code smells: the guardian disables a token at once; only the owner re-enables it. — Each vault sells the token and pays slippage. Only a trusted role can trigger it.
- **Clearing a non-trading day counts its closed hours as open time** — `FloorFactory.hasOpenSeconds` · seen in 3/3 runs · KNOWN (2 scans) — Code smells: `hasOpenSeconds` reads `nonTradingDay` at call time, so a guardian write on a past day changes the open seconds that every vault already counted. — Only the guardian can trigger it.
- **The cardinality bound assumes a fixed block time** — `FloorFactory._minCardinality` · seen in 2/3 runs · KNOWN (3 scans) — Code smells: the formula assumes 0.75 s per block. — If blocks are shorter, a busy pool can pass listing and still lack history, so `_price` reverts.
- **A position that the owner never closes holds its deposit in the cap** — `FloorFactory.onPositionClosed` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: `liveDeposit` is released only when the owner closes the position. — Matured positions that stay open slowly use up the cap.
- **Any caller arms the multiplier block for every vault** — `FloorFactory.pokeMultiplier` · seen in 1/3 runs · KNOWN (3 scans) — Code smells: each real change of `uiMultiplier` blocks every trade of that token for `twapWindow` seconds. — A token with a frequent change keeps the guard armed. We did not check the real change rate.
- **Any caller can store a zero multiplier through `pokeMultiplier`** — `FloorFactory.pokeMultiplier` · seen in 2/3 runs · NEW — Code smells: `addAsset` rejects 0, but the poke path stores any value. — We did not check whether a real token returns 0.
- **A `setHalted(false)` during a pause restarts the public delay of every vault** — `FloorFactory.setHalted` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: `setHalted(false)` sets `tradingResumedAt` while `paused` can still be true. — Vaults lose their open-time credit although trading stays closed. Only a trusted role can trigger it.
- **The owner sets the token beacon once and cannot change it** — `FloorFactory.setTokenBeacon` · seen in 1/3 runs · NEW — Code smells: no function resets `tokenBeacon`; `_beaconChanged` has no try/catch on the buy paths. — A beacon that reverts or is replaced stops every buy in every vault. We did not prove it.
- **The guardian can cancel an owner pause or halt at once** — `FloorFactory.unpause` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: `unpause` and `setHalted` accept the guardian or the owner, with no priority. — The guardian can end a pause that the owner set.
- **An `unpause` during a halt restarts the public delay of every vault** — `FloorFactory.unpause` · seen in 3/3 runs · KNOWN (2 scans) — Code smells: `unpause` sets `tradingResumedAt` while `halted` is still true. — The guardian or owner can restart the public delay of every vault. Only a trusted role can trigger it.
- **One vault can use too much gas in a `scan` call** — `FloorLens.scan` · seen in 1/3 runs · NEW — Code smells: each `previewRebalance` try/catch makes about 10 external calls per vault. — A vault that reaches the gas limit can make one `scan` call fail for the whole range. We found no hostile token that causes it.
- **`_capTransfer` counts a failed transfer as good when the token returns more than 32 bytes** — `FloorVault._capTransfer` · seen in 2/3 runs · KNOWN (3 scans) — Code smells: `size > 32` passes whatever the first word says. — `exitInKind` omits a stuck token from `skipped`, and `rescue` recovers it. We did not check a real bStock.
- **A stock donation above `dust` blocks `closeToUSDT`** — `FloorVault.closeToUSDT` · seen in 2/3 runs · KNOWN (4 scans) — Code smells: the close accepts only up to `dust` of stock value per asset. — A donor can make the close revert with `StockNotUnwound`. The owner needs `exitInKind` or a keeper sale.
- **A held stock with no readable TWAP makes `closeToUSDT` revert** — `FloorVault.closeToUSDT` · seen in 1/3 runs · KNOWN (6 scans) — Code smells: `twapOf` reverts for a short history or an extreme tick. — `exitInKind` still works, so the owner keeps access to the funds.
- **A failed `balanceOf` read makes `closeToUSDT` treat a stock as empty** — `FloorVault.closeToUSDT` · seen in 2/3 runs · NEW — Code smells: the loop ignores the `ok` flag of `_readBalance`, which has no gas check. — The owner can close with a held stock unchecked, and `rescue` recovers it.
- **`exitInKind` can send the close report again and again** — `FloorVault.exitInKind` · seen in 1/3 runs · NEW — Code smells: `exitInKind` has no check for `Closed` status, unlike `closeToUSDT`. — A failed report stays in `totalTvl` until the owner repeats the call. We found no loss of funds.
- **A USDT with a transfer hook can call `initialize` first** — `FloorVault.initialize` · seen in 1/3 runs · KNOWN (4 scans) — Code smells: `createPosition` sends USDT to the clone before it calls `initialize`. — A token that calls back the sender during `transferFrom` lets the sender initialise the clone and own the deposit. Plain BSC USDT has no such hook.
- **Any contract can initialise its own clone of the vault** — `FloorVault.initialize` · seen in 2/3 runs · KNOWN (4 scans) — Code smells: `initialize` checks only that `msg.sender` has code, so a contract can name itself as the factory. — A fake factory answers `isKeeper`, `routerOk` and `assets` for that vault. A front end that trusts any vault address would show it.
- **V rounds up for pools that hold USDT as token0** — `FloorVault._load` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: `twapTick` rounds the tick down, and `priceWad` rounds the price up for USDT-token0 pools. — The vault values the stock up to 1 bp too high. We did not find a decision that flips.
- **A V inside the `tolDirectBps` margin sells all stock without the lock** — `FloorVault._lockCheck` · seen in 1/3 runs · NEW — Code smells: the lock needs `V*(BPS+tolDirectBps) <= floor*BPS`, while the cushion is already 0 below F. — A price rebound can make the vault buy stock again, which contradicts the floor rule. We did not check whether this is the intended CPPI behavior.
- **A multiplier change of one token makes the vault trade another token on a wrong V** — `FloorVault._multiplierSettle` · seen in 1/3 runs · KNOWN (3 scans) — Code smells: the guard covers only the traded token, while `_load` prices every token at the TWAP. — We did not build a profitable trade from it.
- **The multiplier block window starts at the poke time** — `FloorVault._multiplierSettle` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: the window is `lastMultiplierChange + twapWindow`, set when someone calls `pokeMultiplier`. — Any caller can shift the time when the vault can trade the token.
- **For small token weights the public sell band equals the keeper band** — `FloorVault._plan` · seen in 2/3 runs · KNOWN (3 scans) — Code smells: `band` rounds down and the code then raises a zero value to 1 bp. — A token under 1 percent weight can get equal buy and sell bands on both paths. We found no loss path.
- **The vault sells small drifts but buys back only at `minTrade`** — `FloorVault._plan` · seen in 1/3 runs · KNOWN (3 scans) — Code smells: `sellMin` is `min(dust+1, minTrade)`; buys use `minTrade`. — With `dust` near `minTrade`, `closeToUSDT` can leave stock that only `rescue` moves. This needs an owner-set `dust`.
- **A gap over a closed market can leave V below the floor with no trade possible** — `FloorVault._plan` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: both rebalance paths revert `TradingClosed` outside open hours. — A price gap of 50 percent or more over a weekend is not covered. This may be accepted CPPI gap risk.
- **The vault copies the fixed block-time slot count** — `FloorVault._price` · seen in 1/3 runs · KNOWN (3 scans) — Code smells: the check uses `(twapWindow*4+2)/3` slots. — `observe` can still revert when the pool has no recent writes; the code then reports `OracleHistoryTooShort`. We did not check the age of the history.
- **A revert after `_lockCheck` removes the cash lock it set** — `FloorVault.rebalance` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: `_swap` or `_beaconGuard` can revert after the lock is set. — The vault can buy again until a call ends without a revert. We did not trace it end to end.
- **A multiplier change of one token mis-sizes the trade of another token** — `FloorVault.rebalance` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: `_multiplierSettle` guards only the traded token, but `_load` prices every token. — We did not check whether a bStock pool price jumps at a multiplier change.
- **A failed public swap removes the cash lock that `_lockCheck` set** — `FloorVault.rebalancePublic` · seen in 1/3 runs · NEW — Code smells: `_publicPlan` sets `cashLocked`, and a `SwapFailed` revert rolls it back. — We found no loss from the lost lock.
- **A caller of `rebalancePublic` can pick a paused token with zero balance** — `FloorVault.rebalancePublic` · seen in 1/3 runs · NEW — Code smells: `_load` sets `anyFailed` for a paused token only when its balance is more than zero, and `rebalancePublic` has no `paused` check. — The vault plans a buy that reverts at the swap. We found no loss of funds.
- **The public path ignores the doubled band when E* is 0** — `FloorVault.rebalancePublic` · seen in 1/3 runs · KNOWN (3 scans) — Code smells: after `requestClose`, after maturity or after the cash lock, `sellAmount` returns the full stock value. — Any caller can start full public sales after `publicDelay`, which makes the sandwich loss larger.
- **A keeper gets the wide tolerance on any path through the Pancake router** — `FloorVault.rebalance` · seen in 1/3 runs · KNOWN (5 scans) — Code smells: `tol` depends only on `s.router == v3SwapRouter`, and `s.data` is free calldata. — A keeper can take up to `tolDirectBps` of each trade at the `minInterval` rate.
- **A keeper pays the vault only the TWAP minimum output** — `FloorVault.rebalance` · seen in 1/3 runs · KNOWN (5 scans) — Code smells: `minOut` comes from the TWAP at `tolAggBps` or `tolDirectBps`; the keeper picks the route. — A keeper can fill each swap at the lowest accepted price. We did not check how much a real route loses.
- **A low-gas close can leave the deposit in `totalTvl`** — `FloorVault._reportClosed` · seen in 2/3 runs · KNOWN (3 scans) — Code smells: the `onPositionClosed` call gets 100,000 gas and the result is ignored. — A later `exitInKind` call can send the report again. We did not run this on a fork.
- **A keeper trade resets the public delay of that token** — `FloorVault._swap` · seen in 1/3 runs · KNOWN (2 scans) — Code smells: `_swap` writes `lastTradeAt`; `amountInOk` lets a keeper trade half of the computed amount. — A hostile keeper can trade small amounts to keep the public path closed. We did not prove it.
- **A failed pause read makes the vault treat a paused token as tradable** — `FloorVault._tokenPaused` · seen in 1/3 runs · NEW — Code smells: both reads use a 100,000 gas cap inside try/catch, and a failure returns false. — We did not show that a caller can fail only that read.
- **A long closed span makes the open-seconds walk use much gas** — `MarketHours.hasOpenSeconds` · seen in 1/3 runs · NEW — Code smells: the loop walks back one day at a time with one storage read per day, up to 400 days. — We did not measure the gas.
- **A swap that spends no `tokenIn` passes `SwapGuard.exec`** — `SwapGuard.exec` · seen in 1/3 runs · NEW — Code smells: the `tokenIn` check requires only that the balance does not grow and that spent is at most `amountIn`. — A keeper swap with zero spend resets `lastTradeAt`. We did not check whether the router can deliver `tokenOut` without a spend.

---

## Known from earlier scans

_Recorded by earlier scans of this repo, not raised again by this one. Not re-checked — a record here may be fixed, or may still be live and missed. `.solidity-auditor/memory.tsv`._

| Scans | Kind | Location | Title |
|---|---|---|---|
| 3 | LEAD | `CPPIMath.amountInOk` | A keeper can always trade half of the computed amount |
| 1 | LEAD | `DefaultsCheck.feeFits` | `feeFits` rounds the pool fee down before it doubles it |
| 2 | LEAD | `Deploy._load` | The deploy script cuts large default values to a smaller type before it checks t |
| 3 | LEAD | `Deploy._preflight` | The preflight skips two `addAsset` checks |
| 1 | LEAD | `Deploy._preflight` | The preflight does not check that the router uses the listed Pancake factory |
| 1 | LEAD | `Deploy.run` | The deployer key keeps owner powers until the new owner accepts |
| 2 | LEAD | `Deploy.run` | The deploy script reverts when the token beacon is zero |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` does not check that the token uses `tokenBeacon` |
| 2 | LEAD | `FloorFactory.addAsset` | `addAsset` accepts a pool fee only 1 bps below `tolDirectBps` |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` accepts a `maxTradeValue` below `minTrade` |
| 1 | LEAD | `FloorFactory.addAsset` | A listing leaves the multiplier change time at zero |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` does not check the multiplier functions the vault calls |
| 1 | LEAD | `FloorFactory.addAsset` | `addAsset` stores a zero multiplier that its comment calls unsafe |
| 1 | LEAD | `FloorFactory._checkDefaults` | Disabled tokens still limit the defaults |
| 1 | LEAD | `FloorFactory._checkDefaults` | The `publicDelay` bound counts calendar days, but the vault counts open seconds |
| 2 | LEAD | `FloorFactory._checkDefaults` | `setDefaults` accepts values that the deploy preflight rejects |
| 1 | LEAD | `FloorFactory._checkDefaults` | The defaults allow a `maxTickDev` wider than the swap tolerance |
| 1 | LEAD | `FloorFactory.createPosition` | The factory accepts a deposit into a basket that the vault cannot buy |
| 1 | LEAD | `FloorFactory.createPosition` | `createPosition` takes deposits while trading is halted |
| 1 | LEAD | `FloorFactory.reenableAsset` | No function can move a token to a new pool |
| 1 | LEAD | `FloorFactory.reenableAsset` | `reenableAsset` skips the listing checks of `addAsset` |
| 1 | LEAD | `FloorFactory.setDefaults` | `setDefaults` can set `tolDirectBps` below a listed pool fee |
| 1 | LEAD | `FloorFactory.setKeeper` | The owner grants a keeper with no delay, unlike a router |
| 1 | LEAD | `FloorVault._capTransfer` | `_capTransfer` treats a call to an address with no code as success |
| 1 | LEAD | `FloorVault.closeToUSDT` | A zero TWAP price lets a held stock pass the dust test |
| 1 | LEAD | `FloorVault._load` | The vault buys stock again after the cash lock |
| 2 | LEAD | `FloorVault._load` | One wei of a disabled token with no TWAP stops every CPPI sell |
| 1 | LEAD | `FloorVault._load` | A disabled token's weight stays in USDT |
| 2 | LEAD | `FloorVault._load` | A disabled token valued at or below `dust` leaves V without `understated` |
| 1 | LEAD | `FloorVault._load` | A revert in one stock's `balanceOf` stops every rebalance |
| 1 | LEAD | `FloorVault._load` | One wei of a paused token stops every buy |
| 2 | LEAD | `FloorVault._load` | A paused bStock keeps its frozen pool price in V |
| 1 | LEAD | `FloorVault._load` | The vault values its stock at a TWAP that its own buys raise |
| 2 | LEAD | `FloorVault._load` | A spot push on one pool stops all buys in the basket |
| 1 | LEAD | `FloorVault._load` | A caller may set gas so that a price self-call fails |
| 1 | LEAD | `FloorVault._load` | A TWAP at an extreme tick rounds the price to zero |
| 3 | LEAD | `FloorVault._load` | A raised TWAP on a thin active pool blocks the sells of the other tokens |
| 3 | FINDING | `FloorVault._load` | A spot push on a disabled token makes the vault sell the active tokens |
| 2 | FINDING | `FloorVault._lockCheck` | The cash lock trusts a price that failed its spot or liquidity guard |
| 2 | LEAD | `FloorVault.lockIfBelowFloor` | The cash lock skips the multiplier guard |
| 2 | LEAD | `FloorVault._multiplierSettle` | A broken multiplier getter blocks the unwind of the token |
| 1 | LEAD | `FloorVault._multiplierSettle` | A pending multiplier flag that never clears blocks every rebalance of the token |
| 1 | LEAD | `FloorVault._multiplierSettle` | A frequently changing multiplier blocks every trade of the token |
| 2 | FINDING | `FloorVault._plan` | A fixed `minTrade` stops small positions from selling until the cushion is zero |
| 2 | LEAD | `FloorVault._plan` | A sell band sized on V hides the drift when the cushion is small |
| 2 | LEAD | `FloorVault._plan` | A held token with no TWAP blocks all sells after the cash lock |
| 1 | LEAD | `FloorVault._plan` | `_plan` blocks buys even when the TWAP value is correct |
| 2 | FINDING | `FloorVault._plan` | The buy band is not scaled by the token weight, so low-weight tokens stay unboug |
| 1 | LEAD | `FloorVault._plan` | The public path accepts sells as small as `dust` plus one wei |
| 1 | LEAD | `FloorVault._plan` | An attacker moves a thin pool's TWAP so the vault sells low and buys high |
| 3 | LEAD | `FloorVault._plan` | A `dust` below one raw unit of stock leaves stock that no swap can sell |
| 5 | LEAD | `FloorVault.previewRebalance` | A failed swap of the first token hides the sells of the other tokens |
| 3 | LEAD | `FloorVault._price` | Low in-range liquidity in a fall stops every sell |
| 1 | LEAD | `FloorVault._readBalance` | A low-gas balance read skips a stock in the exit paths |
| 1 | LEAD | `FloorVault.rebalance` | A rebalance that pokes an old multiplier returns before the lock check |
| 4 | LEAD | `FloorVault.rebalance` | Small keeper trades restart the public delay |
| 2 | LEAD | `FloorVault.rebalancePublic` | After maturity or `requestClose` any caller sells the whole position first |
| 4 | LEAD | `FloorVault.rebalancePublic` | The public delay counts time when the keeper cannot trade the token |
| 1 | LEAD | `FloorVault.rebalancePublic` | A keeper that trades one token keeps the public path closed for the others |
| 1 | LEAD | `FloorVault.rebalancePublic` | The public fallback pays the caller nothing |
| 1 | LEAD | `FloorVault.rebalancePublic` | Each public trade resets the public delay for the whole vault |
| 1 | LEAD | `FloorVault.rebalancePublic` | A sandwich loss on a public sell pushes V under F for the lock |
| 1 | LEAD | `FloorVault.rebalance` | A keeper cannot split a sell that is too large for a thin pool |
| 2 | LEAD | `FloorVault.rebalance` | A fast fall makes every sell revert on `minOut` |
| 1 | LEAD | `FloorVault.rebalance` | The allowlisted aggregator can change its logic at any time |
| 3 | LEAD | `FloorVault._swap` | One vault's sell makes the other vaults' sells revert on `minOut` |
| 2 | LEAD | `FloorVault._tokenPaused` | `_tokenPaused` misses the global pause and the blocklist |
| 2 | LEAD | `FloorVault._tokenPaused` | Badly encoded pause data makes `_load` revert |
| 1 | LEAD | `FloorVault.valuation` | `valuation` returns a low V where the interface says it reverts |
| 2 | LEAD | `MarketHours.inWindow` | The trading window stays open after the stock market closes early |
| 1 | LEAD | `MarketHours.isOpen` | `isOpen` returns true after an early market close |
| 2 | LEAD | `SetHolidays.run` | The holiday script accepts any `coversThroughDay` value |
| 2 | LEAD | `SwapGuard.exec` | `exec` accepts a fall in the `tokenOut` balance when `minOut` is 0 |
| 2 | FINDING | `TakerProbe.execAggregator` | Any caller can make the probe run any call |
| 2 | FINDING | `TakerProbe.execPancake` | Any caller can make the probe swap with no minimum output |
| 2 | FINDING | `TakerProbe.send` | Any caller can take all tokens that the probe holds |
| 4 | LEAD | `TwapOracle.priceWad` | The tick rounding raises the stock price for USDT-token0 pools |
| 2 | LEAD | `TwapOracle.priceWad` | `priceWad` reverts at ticks near `MAX_TICK` |
| 2 | FINDING | `TwapOracle.twapTick` | A pool with 200 observation slots cannot cover the TWAP window |

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended. For a consultation regarding your projects' security, visit [https://www.pashov.com](https://www.pashov.com)
