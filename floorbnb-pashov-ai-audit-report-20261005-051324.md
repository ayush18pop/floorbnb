# 🔐 Security Review — floorbnb

---

## Scope

|  |  |
| --- | --- |
| **Mode** | default |
| **Files reviewed** | `./ops/spikes/taker-probe/src/TakerProbe.sol` · `./packages/contracts/src/libs/CPPIMath.sol` · `./packages/contracts/src/libs/DefaultsCheck.sol`<br>`./packages/contracts/src/libs/TwapOracle.sol` · `./packages/contracts/src/libs/SwapGuard.sol` · `./packages/contracts/src/libs/vendor/TickMath.sol`<br>`./packages/contracts/src/libs/vendor/FullMath.sol` · `./packages/contracts/src/libs/vendor/BitMath.sol` · `./packages/contracts/src/libs/vendor/CustomRevert.sol`<br>`./packages/contracts/src/libs/MarketHours.sol` · `./packages/contracts/src/FloorVault.sol` · `./packages/contracts/src/FloorFactory.sol`<br>`./packages/contracts/src/FloorLens.sol` · `./packages/contracts/script/Deploy.s.sol` · `./packages/contracts/script/SetHolidays.s.sol` |
| **Confidence threshold (1-100)** | 75 |

---

## Findings

[85] **1. One caller fills the TVL cap and blocks every other deposit**

`FloorFactory.createPosition` · Confidence: 85

**Description**
An attacker with 5000 USDT opens five positions at `maxDeposit` and never closes them, so every later `createPosition` call reverts with `TvlCapReached`.

**Fix**

```diff
+    mapping(address => uint256) public ownerLive;
...
         if (totalTvl + amount > maxTotalTvl) revert TvlCapReached();
+        if (ownerLive[msg.sender] + amount > maxDeposit) revert DepositTooLarge();
...
         totalTvl += amount;
+        ownerLive[msg.sender] += amount;
```

---

Findings List

| # | Confidence | Title |
|---|---|---|
| 1 | [85] | One caller fills the TVL cap and blocks every other deposit |

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. These are not false positives — they are high-signal leads for manual review. Not scored._

- **Fee check divides before it multiplies** — `DefaultsCheck.feeFits` — Code smells: `uint256(fee) / 100 * 2` — A fee that is not a multiple of 100, such as 150, passes with a tolerance below twice the fee. Standard Pancake tiers are multiples of 100, so this needs a non-standard tier.
- **Closed positions stay in the positions array forever** — `FloorFactory.createPosition` — Code smells: `positions[]` and `_byOwner` only grow, and a create and exit cycle costs only gas — Any caller can make the keeper scan and `FloorLens.scan` read more vaults. We did not measure a gas limit.
- **Any caller can store a zero multiplier baseline** — `FloorFactory.pokeMultiplier` — Code smells: `addAsset` rejects a zero `uiMultiplier`, but `pokeMultiplier` has no `m != 0` check — A zero in `lastMultiplier` may block trades or weaken the guard. We did not prove either.
- **Exit can report a transfer that moved no tokens** — `FloorVault._capTransfer` — Code smells: `good` accepts a return of more than 32 bytes with a false first word, and a no-op fallback that returns nothing — A broken bStock can make `exitInKind` hide a token from the `skipped` list. No real bStock has this behavior.
- **One failed pool guard blocks buys of every asset** — `FloorVault._load` — Code smells: `st.anyFailed` is set for any active asset, even one with a zero balance, and `_plan` then refuses every buy — An attacker who moves one pool price past `maxTickDev`, or pulls its liquidity below `minLiquidity`, stops all buys in each vault that lists that asset. We did not price the attacker's cost per block.
- **A stale pending multiplier can block a token forever** — `FloorVault._multiplierSettle` — Code smells: the `effectiveAt() <= block.timestamp + PENDING_LEAD` check has no lower bound — If `hasPendingMultiplier()` stays true after `effectiveAt`, every sale and the cash lock revert. We did not verify how the live token clears the flag.
- **Low-weight assets get a one bps sell band** — `FloorVault._plan` — Code smells: a band of zero is raised to 1, and only `sellMin` limits the trade size — A keeper can force many small sales that each pay a pool fee of about 25 bps. We did not check whether the minimum-target limits make this too costly.
- **Short return data from a token makes every price read revert** — `FloorVault._tokenPaused` — Code smells: a `try` call that succeeds with return data too short to decode reverts in the vault, and `catch` does not catch it — A bStock upgrade could stop `rebalance` and `lockIfBelowFloor` for each vault that holds it. We did not test this against the live token.
- **A router can read `claimValue` in the middle of a swap** — `FloorVault.claimValue` — Code smells: the views are not under the reentrancy lock — A router that the vault calls can read a value taken while balances change. We found no consumer in this repository.
- **A donation of stock blocks the close to USDT** — `FloorVault.closeToUSDT` — Code smells: `valueOf(bal, p) > dust` reverts `StockNotUnwound`, and `dust` is 1 USDT — An attacker who donates more than `dust` of a bStock delays the close until a sale lands. `exitInKind` stays open. We did not measure the delay.
- **Any caller can lock a vault in cash for good** — `FloorVault.lockIfBelowFloor` — Code smells: `cashLocked` is never cleared, and the TWAP window can be as short as 300 s — An attacker who holds a thin pool price low for one TWAP window can set the lock. We did not size the cost of that push against the `maxTickDev` guard.
- **Public delay counts idle time, not drift age** — `FloorVault.rebalancePublic` — Code smells: `since = max(lastTradeAt[idx], start)` — After a long quiet period, a sudden price jump past 2x band opens the public path at once, so the keeper never gets its `publicDelay` window. We did not check whether the spec accepts this.
- **Public swap lets an attacker sandwich each trade** — `FloorVault.rebalancePublic` — Code smells: `sqrtPriceLimitX96` is 0, `minOut` is only as tight as `tolDirectBps` (up to 300 bps), and the spot guard allows a gap of `maxTickDev` (up to 1000 ticks) — An attacker who moves the pool price inside `maxTickDev`, calls the function and moves it back can keep up to `tolDirectBps` of the trade. We did not model the profit after the pool fee.
- **Keeper picks the router and so picks its own slippage limit** — `FloorVault.rebalance` — Code smells: `tol = s.router == v3SwapRouter ? tolDirectBps : tolAggBps`, the keeper sets `data`, and `SwapGuard` checks only balance deltas — A keeper can name `v3SwapRouter` to get the wider limit and keep up to 2% or 3% of a trade. This needs the keeper role, so it is a trust question.
- **Multiplier check covers only the traded token** — `FloorVault.rebalance` — Code smells: `_multiplierSettle` runs for the traded asset, while `_load` values every held asset at its TWAP, and only `_lockCheck` checks all tokens — A multiplier change on another held token can give a stale value `V` and a wrong trade size. We did not confirm that the pool price moves at a multiplier change.
- **Sale limits may slow an unwind below the floor** — `FloorVault.rebalance` — Code smells: `maxTradeValue` per sale, `minInterval` per asset, and a 4-hour market window per weekday — A fast price fall can need more sales than the limits allow. We did not model the numbers.
- **Many closed days can make the public path run out of gas** — `MarketHours.hasOpenSeconds` — Code smells: the loop reads one storage slot per closed day — If the guardian lists many consecutive closed days, `rebalancePublic` can fail. We found no trigger without the guardian.
- **Vault trades after the stock market closes on early-close days** — `MarketHours.inWindow` — Code smells: the window is fixed at 15:30 to 19:30 UTC, and only full-day holidays close it — On early-close days the vault trades up to 2.5 hours after the market closes, with a TWAP that may be old. We did not check whether the guardian lists those days.
- **Tick rounding makes the price too high when USDT is token0** — `TwapOracle.priceWad` — Code smells: `twapTick` rounds toward negative infinity, and a lower tick gives a higher stock price — `V` can be about 0.01% too high for these pools, against the rule that `V` rounds down. We did not find a way to turn this into a loss.

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended. For a consultation regarding your projects' security, visit [https://www.pashov.com](https://www.pashov.com)
