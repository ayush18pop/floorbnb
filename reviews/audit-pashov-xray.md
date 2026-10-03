Commit: 76fbae835023716adb824317ed86fa5293f6f5be (branch agent/A12a, equal to main at run time)

> AI-assisted pre-audit by the Pashov Audit Group x-ray skill, not a formal audit. Pashov Audit Group did not review Floor. Their open-source skill (upstream commit 8ce544c) was run on `packages/contracts`. This is a readiness map, not a finding list, and gives no guarantee of security.
>
> Run notes: the `Skill` tool in this session did not list `x-ray` ("Unknown skill"), so the skill was followed manually from `.claude/skills/x-ray/SKILL.md` (same scripts: `enumerate.sh`, `analyze_git_security.py`; same templates). Differences from the designed run: no TodoWrite phases, no spec-doc subagent, `architecture.svg` not generated, `entry-points.md` folded into the appendix below, coverage run with `forge coverage --ir-minimum` directly (not plain `forge coverage` first). Fork tests need a BSC RPC and were not run, so coverage numbers exclude them.

# X-Ray Report

> Floor (CPPI floor-protected stock vaults) | 1,567 nSLOC (all `.sol`, incl. vendored; see scope table) | 76fbae8 (`agent/A12a`) | Foundry | 03/10/26

---

## 1. Protocol Overview

**What it does:** Each user gets a clone vault that holds USDT and up to 3 tokenized stocks (bStocks) and rebalances toward a CPPI exposure target (E* = min(4 x cushion, V)) using a Pancake v3 TWAP, with every swap checked by balance deltas.

- **Users**: Position owners (deposit USDT, exit any time); keepers (rebalance); anyone (public fallback rebalance, multiplier poke).
- **Core flow**: `FloorFactory.createPosition` clones `FloorVault`, moves USDT straight into it, then calls `initialize`.
- **Key mechanism**: TWAP valuation (spot-vs-TWAP deviation, liquidity and cardinality guards) -> band rule -> keeper or public swap through an allowlisted router -> `SwapGuard` balance-delta proof.
- **Token model**: USDT (assumed 18 decimals) and 18-decimal bStocks with a `uiMultiplier` and a shared beacon implementation that can change.
- **Admin model**: Factory `owner` (2-step transfer), `guardian` (pause, halt, calendar), keeper set. Vaults have only a position `owner`.

Architecture diagram: not generated (manual run).

### Contracts in Scope

| Subsystem | Key Contracts | nSLOC | Role |
|-----------|--------------|------:|------|
| Position | FloorVault | 368 | Per-position clone: valuation, rebalance, exits |
| Control plane | FloorFactory | 291 | Roles, config, allowlists, clone creation, launch caps |
| Read helper | FloorLens | 50 | Stateless try/catch views for keeper and web |
| Math and guards | CPPIMath, SwapGuard, TwapOracle, MarketHours | 185 | CPPI maths, swap delta proof, TWAP price, trading window |
| Vendored (not scored) | TickMath, FullMath, BitMath, CustomRevert (Uniswap v4 copies) | 331 | Tick/price maths |

`script/` (Deploy, SetHolidays, SmokeTest) is outside this x-ray's `src` scope; it is in scope for the solidity-auditor (A12b).

### Backwards-Compatibility Code

None found. `IPauseManager` and `ICompliance` interfaces exist in `src/interfaces/` but nothing in `src/` imports them (could not confirm intent; likely reserved for bStock integration).

### How It Fits Together

The core trick: the vault never trusts the router. It computes the trade itself from a TWAP, approves exactly `amountIn`, and reverts unless every tracked balance moved the right way.

### Open a position

```
FloorFactory.createPosition(amount, floorBps, term, assets, weights)
  ├─ checks: !paused, amount <= maxDeposit, totalTvl+amount <= maxTotalTvl, basket active & weights sum 10000
  ├─ totalTvl += amount; Clones.clone(vaultImplementation); positions/_byOwner push
  ├─ IERC20(usdt).safeTransferFrom(user -> vault)   *balance-delta checked == amount*
  └─ FloorVault.initialize(owner, amount, floor, maturity, assets, weights, abi.encode(defaults))
       *copies economic params; floor stored rounded up*
```

### Keeper rebalance

```
FloorVault.rebalance(Swap)                        *nonReentrant*
  ├─ FloorFactory.isKeeper / isTradingOpen / routerOk
  ├─ _multiplierGuard (uiMultiplier == lastMultiplier, settle window, pending change lead 1h)
  ├─ _load -> TwapOracle.price (cardinality, TWAP, spot deviation, liquidity)   *prices ALL held/active assets*
  ├─ _plan: CPPIMath.sellAmount / buyAmount; keeper amountIn must be in [computed/2, computed]
  └─ _swap -> lastTradeAt written -> SwapGuard.exec
        ├─ router != any tracked token; snapshot balances; forceApprove(approveTarget, amountIn)
        ├─ router.call(data) (value 0); approve back to 0
        └─ tokenIn not grown & spent <= amountIn; tokenOut >= minOut; every other tracked token not decreased
```

### Public fallback and exits

```
FloorVault.rebalancePublic(assetIdx)   *after publicDelay idle, band x2, factory.v3SwapRouter only, tolDirectBps*
  └─ vault builds exactInputSingle(recipient = vault) -> _swap (same SwapGuard path)

FloorVault.exitInKind(to) / closeToUSDT() / rescue(token,to)   *owner only; read no factory state except closeToUSDT pricing*
  └─ exitInKind: per-token gas-capped low-level transfer (500k), failures skipped, then all USDT to `to`
```

---

## 2. Threat & Trust Model

### Protocol Threat Profile

> Protocol classified as: **Yield Aggregator / Vault** with **DEX/AMM integrator** (oracle consumer, router caller) characteristics

Per-user vault clones hold funds and execute strategy trades; no shared pool, no shares, no lending. Risk concentrates in the oracle, the keeper/router trust boundary, and factory-held configuration that vaults read live.

### Actors & Adversary Model

| Actor | Trust Level | Capabilities |
|-------|-------------|-------------|
| Position owner (vault) | Trusted for own funds | `requestClose`, `closeToUSDT` (needs stock value <= dust), `exitInKind(to)`, `rescue` (after Closed). No timelock; unaffected by factory pause/halt. |
| Keeper (`isKeeper`) | Bounded (tol, band, size, interval, router allowlist, balance-delta proof) | `rebalance` with own router and calldata. Not subject to a pause beyond `isTradingOpen`. |
| Anyone | Bounded (vault fixes direction, amount, recipient) | `rebalancePublic` (after publicDelay, 2x band), `pokeMultiplier`, `createPosition`. |
| Factory owner | Trusted (instant ops, 2-step ownership only) | Instant: `setKeeper`, `addAsset` (can overwrite pool/limits of an existing asset), `setLimits`, `setGuardian`, `setDefaults` (new positions only), one-shot `setTokenBeacon`. `addRouter` is delayed 24h. |
| Guardian | Trusted (instant) | `pause`, `setHalted`, `removeRouter`, `disableAsset` (shared with owner); guardian-only `setNonTradingDay(s)` and `approveTokenImpl`. |

**Adversary Ranking:**

1. **Malicious or compromised keeper plus router** — controls calldata and counterparty; bounded only by `SwapGuard` and `tol`.
2. **Oracle manipulator** — Pancake v3 pool TWAP/spot/liquidity are the sole price source for minOut and targets.
3. **Compromised factory owner or guardian** — hold instant config that every vault reads live.
4. **Hostile or upgraded bStock** — beacon-upgradable token with pause/blocklist and multiplier changes.
5. **MEV searcher** — sandwiches keeper and public swaps inside the `tol` window.

See the entry-point map in Appendix A for the full permissionless list.

### Trust Boundaries

- **Vault -> Factory (live reads)** — `isKeeper`, `routerOk`, `assets`, `lastMultiplier`, `tokenBeacon` are read at call time with no per-vault snapshot (FloorVault:178,185,382,480,490); owner/guardian can change them instantly except router add (24h).
- **Keeper -> Router** — keeper-chosen calldata runs with exact allowance; protection is the post-call delta proof (SwapGuard:182-206), not calldata inspection.
- **Owner exits -> Factory** — `exitInKind`, `rescue` and `requestClose` read no factory state (FloorVault:245-313); `closeToUSDT` still prices through the oracle (FloorVault:262-264).
- **Factory owner -> shared config** — no timelock on `addAsset`/`setKeeper`/`setLimits`; only router addition and ownership transfer have a delay or two-step.

### Key Attack Surfaces

- **Factory-held asset config used live by existing vaults** &nbsp;&#91;[X-1](#x-1), [X-3](#x-3)&#93; — `addAsset` (FloorFactory:323) overwrites `assets[token]` with no check against open positions, and `_asset` (FloorVault:382) reads it each call. Worth tracing what an owner re-point does to price, `minOut` and `maxTradeValue` for live vaults.

- **TWAP price as the only slippage reference** &nbsp;&#91;[E-1](#e-1), [X-7](#x-7)&#93; — TwapOracle:230-282 with `twapWindow` allowed down to 60s and `maxTickDev` as low as 10 ticks (FloorFactory:389-391). Worth checking how cheap a window-length drift plus spot return inside `maxTickDev` is on these pools, and what `liquidity()` (in-range only) really bounds.

- **Keeper plus router calldata trust** &nbsp;&#91;[E-1](#e-1)&#93; — SwapGuard:185 `c.router.call(c.data)` with approval to `approveTarget`; `minInterval` can be 0 (FloorFactory:390). Worth confirming per-trade and cumulative loss bounds with repeated in-band trades and a router that is also an `approveTarget` spender.

- **Fail-closed oracle blocks the whole vault** &nbsp;&#91;[I-9](#i-9)&#93; — `_load` prices every held or active asset (FloorVault:404-416), so one dead pool stops rebalancing of the others, including de-risking sells. Worth checking whether a multi-asset vault can be pinned risky.

- **Admin operational powers without timelock** &nbsp;&#91;[X-1](#x-1), [X-4](#x-4)&#93; — instant `setKeeper`, `approveTokenImpl` (FloorFactory:287), `setLimits`, `disableAsset`, `setHalted`; `approveTokenImpl` is guardian-set after the owner's one-shot beacon setup. Worth checking what each instant action changes for existing vaults.

- **Multiplier watch depends on a permissionless poke** &nbsp;&#91;[X-2](#x-2)&#93; — `_multiplierGuard` (FloorVault:477-485) compares the token against `lastMultiplier` that only `pokeMultiplier`/`addAsset` write (FloorFactory:201-210, 324-326). `addAsset` swallows a failing `uiMultiplier()` (326). Worth tracing the unpoked and failed-read cases.

- **`exitInKind` low-level transfer** — FloorVault:291 captures return data from an untrusted-ish token into memory inside a 500k gas cap. Worth checking a large-returndata token against the cap and the "USDT can never be trapped" claim.

- **Lifecycle states** &nbsp;&#91;[I-4](#i-4)&#93; — `exitInKind` writes `Closed` with no status guard (FloorVault:296) and `closeToUSDT` has no `Closing` requirement (255). Worth confirming all orderings of the four exits leave no stranded or double-counted asset.

- **Clone initialization** &nbsp;&#91;[I-5](#i-5), [X-3](#x-3)&#93; — `initialize` only requires `msg.sender` be a contract (FloorVault:126) and re-checks a subset of the factory's default bounds (165). Worth confirming the clone is always initialised atomically and what the vault trusts in `cfg`.

### Protocol-Type Concerns

**As a Yield Aggregator / Vault:**
- `claimValue()`/`valuation()` are live TWAP reads (FloorVault:320-368); worth checking read-only reentrancy exposure for integrators during `_swap`.
- No share accounting; `deposit` and `floor` are stored once and never updated (no top-up path), so `totalTvl` is a lifetime counter (FloorFactory:70-72).

**As a DEX/AMM integrator:**
- `priceWad` rounds down and inverts for the USDT-token0 case (TwapOracle:255-262); worth checking extreme ticks revert (fail closed) rather than return 0.
- `sqrtPriceLimitX96: 0` on the public path (FloorVault:233); only `amountOutMinimum` protects.

### Temporal Risk Profile

**Deployment & Initialization:**
- `setTokenBeacon` is a separate one-shot post-deploy call (FloorFactory:361); until it runs `_beaconChanged` returns false (FloorVault:491), so buys run unchecked.
- Constructor routers are active at once, no 24h delay (FloorFactory:126-132); the Pancake router must be one of them.

**Market Stress:**
- Weekday 15:30-19:30 UTC window only (MarketHours:114-131); holidays rely on guardian-set days. Gap risk outside the window is unhedged by design.

### Composability & Dependency Risks

> **Pancake v3 pool** — via `TwapOracle`, `FloorFactory.addAsset`
> - Assumes: `observe`, `slot0`, `liquidity` honest; pool at `getPool(token, usdt, fee)`
> - Validates: cardinality >= 200, deviation, `minLiquidity`, `observe` works at registration
> - Mutability: immutable pool, config governed by factory owner
> - On failure: reverts (fail closed)

> **bStock token (SecuritiesToken, beacon)** — via `_multiplierGuard`, `_beaconGuard`, exits
> - Assumes: 18 decimals, `uiMultiplier`/`hasPendingMultiplier`/`effectiveAt`, standard ERC20
> - Validates: decimals at `addAsset`, multiplier equality, beacon implementation equality
> - Mutability: upgradeable by token issuer; pause and blocklist exist
> - On failure: trading blocked; exits skip failing tokens

> **Routers (Pancake SwapRouter, aggregators)** — via `SwapGuard.exec`
> - Assumes: nothing about behavior
> - Validates: allowlist (24h add delay), router not a tracked token, balance deltas
> - Mutability: external contracts, allowlist owned by factory
> - On failure: `SwapFailed` revert

**Token Assumptions** *(unvalidated only)*:
- USDT: assumes 18 decimals (TwapOracle:218 says "asserted at registration"); the factory constructor takes `usdt_` with no decimals check and `addAsset` checks only the stock token (FloorFactory:307). Impact: mispriced value, targets and `minOut` if wrong.
- USDT/bStock: assumes no fee-on-transfer for swaps; `createPosition` checks delta equals `amount` (FloorFactory:174), swaps are covered by `SwapGuard`.

**Shared State Exposure:** vaults share Pancake pools and one bStock beacon across all positions; one pool or implementation event affects every position at once.

---

## 3. Invariants

> ### Full invariant map: see [Appendix B](#appendix-b-invariants)
>
> - **26 Enforced Guards** (`G-1` .. `G-26`) — per-call preconditions (key ones listed)
> - **12 Single-Contract Invariants** (`I-1` .. `I-12`)
> - **7 Cross-Contract Invariants** (`X-1` .. `X-7`)
> - **3 Economic Invariants** (`E-1` .. `E-3`)
>
> The On-chain=No blocks are the high-signal ones: **I-9, I-10, X-1, X-3 (partial), X-4, E-2, E-3**. Appendix B is condensed compared with the skill's standalone `invariants.md` layout (manual run).

---

## 4. Documentation Quality

| Aspect | Status | Notes |
|--------|--------|-------|
| README | Present, boilerplate | `packages/contracts/README.md` is the stock Foundry README (cites a non-existent `script/Counter.s.sol`). No Floor-specific build, test or deploy instructions. |
| NatSpec | ~21 annotation-bearing items per scan | Contracts, public functions and library functions carry `@notice`/`@dev` with CONTRACTS.md section refs. Interfaces carry the error and event docs. |
| Spec/Whitepaper | Present outside the package | `docs/CONTRACTS.md` (sections 3-9, 11, 12; invariants I1-I13) (per spec). Not found by the in-package glob; read as the referenced spec. |
| Inline Comments | Adequate | Ordering (check order, state-before-call) is commented. Deviations are flagged (`setTokenBeacon` "DEVIATION"). |

---

## 5. Test Analysis

| Metric | Value | Source |
|--------|-------|--------|
| Test files | 21 | File scan |
| Test functions | 119 | File scan |
| Line coverage (non-vendored `src/`) | Vault 97.2%, Factory 98.9%, Lens 100%, CPPIMath 97.1%, SwapGuard 100%, TwapOracle 100%, MarketHours 100% | `forge coverage --ir-minimum` |
| Branch coverage (non-vendored `src/`) | Vault 75.5%, Factory 75.6%, CPPIMath 91.7%, SwapGuard 80.0%, others 100% | `forge coverage --ir-minimum` |
| Total (incl. vendored) | 78.5% lines, 59.7% branches | vendored TickMath/BitMath/CustomRevert show 0 to 32% lines because fork tests did not run (no RPC) |

Coverage ran with the IR-minimum pipeline; source mappings can be inexact.

### Test Depth

| Category | Count | Contracts Covered |
|----------|-------|-------------------|
| Unit | 103 (unit dirs) | broad: all contracts |
| Fork | 8 (`ForkFloor.t.sol`, not run here) | Vault, Factory against BSC |
| Stateless Fuzz | 12 | CPPIMath, Vault exits, price paths |
| Stateful Fuzz (Foundry invariant) | 9 | Vault + Factory, 3 handlers (keeper, user, market), hostile router |
| Stateful Fuzz (Echidna / Medusa) | 0 | none |
| Formal Verification (Certora / Halmos / HEVM) | 0 | none |

### Gaps

- No formal verification or Echidna/Medusa for the CPPI maths and the SwapGuard delta proof (math-heavy, value-holding logic).
- Branch coverage about 75% on `FloorVault` and `FloorFactory`; the uncovered branches were not enumerated here.
- Fork tests (BSC) were not exercised in this run; vendored TickMath is covered only by them.
- Spec invariants I1, I4, I9 are checked through handler-recorded `violations` flags, not as named per-property invariants; a handler that silently stops reaching a path would not show as failure.
- No test found that re-points an existing asset via `addAsset` while a position is open, nor one for USDT decimals other than 18.

---

## 6. Developer & Git History

> Repo shape: normal_dev (when scoped from the repo root) — 4 source-touching commits of 39, all on 02-03 Oct 2026. The analyzer run from `packages/contracts` reported `squashed_import` / 0 source commits because `--src-dir src` did not resolve against the repo root; it was re-run from the root with `packages/contracts/src`. (Odd behaviour of the skill's script, see end.)

### Contributors

| Author | Commits | Source Lines (+/-) | % of Source Changes |
|--------|--------:|--------------------|--------------------:|
| ayush18pop | 39 | +2261 / -0 | 100% |

### Review & Process Signals

| Signal | Value | Assessment |
|--------|-------|------------|
| Unique contributors | 1 | Single-dev (agent commits under one author) |
| Merge commits | not computed | Review process not visible in history |
| Repo age | 2026-10-02 -> 2026-10-03 | 1 day |
| Recent source activity (30d) | 4 commits | Late burst; all source is new |
| Test co-change rate | 100% | Source commits also touch tests (co-modification only) |

### File Hotspots

| File | Modifications | Note |
|------|-------------:|------|
| src/FloorFactory.sol, FloorVault.sol, SwapGuard.sol, libs | 1 each | No churn history; every line is first-draft |

### Security-Relevant Commits

No fix-scored commits touch `src/` (the two fix-scored commits are non-contract). Not applicable.

### Dangerous Area Evolution

| Security Area | Commits | Key Files |
|--------------|--------:|-----------|
| access_control | 2 | FloorFactory.sol, FloorVault.sol |
| fund_flows | 3 | FloorFactory.sol, FloorVault.sol, SwapGuard.sol |
| oracle_price | 4 | FloorVault.sol, FloorFactory.sol, TwapOracle |

### Forked Dependencies

| Library | Path | Upstream | Status | Notes |
|---------|------|----------|--------|-------|
| openzeppelin-contracts | lib/ | OpenZeppelin 5.4.0 | Internalized (not a submodule) | Analyzer flags pragma mix and cannot prove it is unmodified; compare to the 5.4.0 tag. |
| v4 TickMath, FullMath, BitMath, CustomRevert | src/libs/vendor/ | Uniswap v4 core | Vendored copies | `fmt.ignore` covers them; confirm byte equality with upstream and the 0.8.28 pragma. |

### Technical Debt Markers

None (0 TODO/FIXME/HACK).

### Security Observations

- **Single author, 1 day** — all contract code arrived in 4 commits (a23bcae, 33989c6, 69fa828, 32d05f9), no external review visible.
- **No merge commits counted** — peer review not evidenced by history.
- **Tests written alongside** — 100% of source commits touch tests (not a coverage measure).
- **Vendored and OZ code unverified** — OZ is not a submodule and vendored v4 files are copies.

### Cross-Reference Synthesis

- **FloorVault is both the largest file and every top attack surface** — fund flows, oracle and access control all point at it and FloorFactory's live config -> start with `_load`, `_swap`, `exitInKind`, `FloorFactory.addAsset`.
- **Fresh code + 12 stateless and 9 invariant tests, no formal methods** — first-draft maths guarded only by fuzz -> SwapGuard and CPPIMath are the best candidates for extra properties.

---

## X-Ray Verdict

**ADEQUATE** — unit, stateless fuzz and Foundry invariant tests exist and NatSpec plus an external spec are present; access control has clear roles and a 2-step transfer but few timelocks, and no formal verification exists.

Tier: Tests HARDENED (unit + fuzz + invariant, no formal), Docs ADEQUATE (NatSpec + spec outside package; package README is boilerplate), Access Control ADEQUATE (roles and boundaries clear, router 24h delay, pause present, multisig unknown).

**Structural facts:**
1. 1,567 nSLOC in 21 files (about 1,100 protocol-authored across 3 contracts and 4 libraries).
2. 21 test files, 119 test functions; 12 stateless fuzz, 9 Foundry invariants, 8 fork tests.
3. One developer, 4 source-touching commits over one day.
4. Non-vendored `src/` line coverage 97 to 100% (Vault 97.2%, Factory 98.9%); branch coverage 75% on the two main contracts.
5. Factory-held config is read live by every vault; only router addition has an operational delay.

---

# Appendix A: Entry points (condensed)

**Permissionless:** `FloorFactory.createPosition` (USDT in -> new clone; caps; paused check), `FloorFactory.pokeMultiplier`, `FloorVault.rebalancePublic` (nonReentrant; after publicDelay, 2x band, Pancake router only), `FloorVault.initialize` (clone only; reverts if `factory != 0` or caller is an EOA). Views: `valuation`, `targets`, `previewRebalance`, `claimValue`, `FloorLens.status/scan`, `FloorFactory.routerOk/isTradingOpen/positionsOf/positionsCount`.

**Role-gated (keeper):** `FloorVault.rebalance` (`isKeeper`, nonReentrant).

**Role-gated (position owner):** `requestClose`, `closeToUSDT`, `exitInKind(to)`, `rescue(token,to)` (all nonReentrant, none read pause/halt).

**Role-gated (factory pending owner):** `FloorFactory.acceptOwnership`.

**Guardian or owner:** `pause`, `unpause`, `setHalted`, `removeRouter`, `disableAsset`. **Guardian only:** `setNonTradingDay`, `setNonTradingDays`, `approveTokenImpl`.

**Owner only:** `setKeeper`, `addAsset`, `addRouter` (24h), `setGuardian`, `setDefaults` (new positions only), `setLimits`, `setTokenBeacon` (one-shot), `transferOwnership`.

**Flow:** `[deploy: constructor routers incl. Pancake] -> setTokenBeacon -> addAsset -> setKeeper -> createPosition -> [market window, drift beyond band, minInterval] -> rebalance | [publicDelay idle, 2x band] -> rebalancePublic -> requestClose -> rebalance (unwind) -> closeToUSDT | exitInKind -> rescue`.

# Appendix B: Invariants

## 1. Enforced Guards (key per-call preconditions)

- G-1 `if (factory != address(0)) revert AlreadyInitialized()` · FloorVault:125 · one-shot initialisation; implementation parked at 0xdead (105-107).
- G-2 `if (msg.sender.code.length == 0) revert NotFactory()` · FloorVault:126 · caller must be a contract (does not prove it is the intended factory).
- G-3 `floor_ > deposit_ ... n > 3 ... weightsBps_.length != n` · FloorVault:130 · bounds floor and basket size.
- G-4 `if (sum != 10_000) revert BadInit()` · FloorVault:143 · weights are a full allocation.
- G-5 `d.tolAggBps >= 10_000 || d.tolDirectBps >= 10_000 || d.twapWindow == 0` · FloorVault:165 · keeps `minOut` and the TWAP window valid.
- G-6 `if (!IFloorFactory(factory).isKeeper(msg.sender)) revert NotKeeper()` · FloorVault:178 · keeper gate.
- G-7 `uint256(lastTradeAt[idx]) + minInterval > block.timestamp` · FloorVault:180,209 · rate limit per asset.
- G-8 `if (!CPPIMath.amountInOk(s.amountIn, amountIn))` · FloorVault:192 · keeper amount in [computed/2, computed].
- G-9 `if (buy != s.buy) revert WrongDirection()` · FloorVault:191 · keeper cannot flip direction.
- G-10 `uint256(lastRebalance) + publicDelay > block.timestamp` · FloorVault:208 · public path only after idle.
- G-11 `if (status != Status.Active) revert BadStatus()` · FloorVault:246 · `requestClose` only from Active.
- G-12 `if (stockValue > dust) revert StockNotUnwound()` · FloorVault:266 · `closeToUSDT` only when stock is unwound.
- G-13 `if (status != Status.Closed) revert NotClosed()` · FloorVault:308 · `rescue` only after Closed.
- G-14 `if (cardinality < MIN_CARDINALITY) revert OracleHistoryTooShort()` · FloorVault:391 · history depth before trusting TWAP.
- G-15 `if (d > maxTickDev) revert PriceDeviation()` · TwapOracle:269 · spot-vs-TWAP manipulation guard.
- G-16 `liquidity() < minLiquidity` · TwapOracle:270 · thin-pool guard.
- G-17 `if (tracked[i] == c.router) revert RouterNotAllowed()` · SwapGuard:172 · router cannot be a held token.
- G-18 `afterBal > b` / `spent > c.amountIn` / `received < c.minOut` / `afterBal < b` · SwapGuard:197-204 · delta proof (I1, I2).
- G-19 `if (totalTvl + amount > maxTotalTvl) revert TvlCapReached()` · FloorFactory:158 · launch cap.
- G-20 `if (u.balanceOf(vault) - balBefore != amount) revert BadAmount()` · FloorFactory:174 · rejects fee-on-transfer USDT.
- G-21 `if (!assets[a[i]].active) revert AssetNotActive` · FloorFactory:186 · only active assets in new baskets.
- G-22 `if (IERC20Metadata(token).decimals() != 18) revert BadDecimals()` · FloorFactory:307 · 18-decimal maths for the stock.
- G-23 `if (cardinality < MIN_CARDINALITY) revert OracleHistoryTooShort()` · FloorFactory:315 · registration-time oracle depth.
- G-24 `if (tokenBeacon != address(0)) revert BeaconAlreadySet()` · FloorFactory:362 · one-shot beacon.
- G-25 `if (maxDeposit_ == 0 || maxDeposit_ > maxTotalTvl_) revert BadLimits()` · FloorFactory:352 · cap ordering.
- G-26 `_checkDefaults` bounds (bands <= 1000, interval <= 1 day, publicDelay 1h..7d, twapWindow 60..3600, maxTickDev 10..1000, tol <= 500, minTrade 1e18..1000e18, dust <= 100e18) · FloorFactory:387-394 · economic parameter envelope.

## 2. Inferred Invariants (Single-Contract)

#### I-1
Bound · On-chain: **Yes**
> floor <= deposit for every vault.

**Derivation** — guard-lift `floor_ > deposit_` (FloorVault:130); `floor` has one write site (148); factory computes `floorFor(amount, floorBps <= 9800)` (FloorFactory:164).
**If violated** — cushion maths start from a floor above the deposit.

#### I-2
Bound · On-chain: **Yes**
> Sum of `weightBps` == 10,000 and no duplicate asset.

**Derivation** — guard-lift FloorVault:143 and 137; `weightBps` and `assetAt` written only in `initialize` (139-140).
**If violated** — targets over- or under-allocate E*.

#### I-3
Bound · On-chain: **Yes**
> Sum of per-asset targets <= E* <= min(4 x C, V).

**Derivation** — CPPIMath:33-39 rounds down; weights sum to 10,000 (I-2). Ratio snapshot: `st.estar` and `st.target` are computed in one `_load` before any external call (FloorVault:419-424).
**If violated** — exposure above the CPPI bound.

#### I-4
StateMachine · On-chain: **Yes**
> Status moves Active -> Closing -> Closed or Active|Closing -> Closed; no path out of Closed.

**Derivation** — edge `Active@246 -> Closing@247`; `!=Closed@255 -> Closed@261`; `exitInKind` writes Closed at 296 with no guard (re-callable, no other effect found). No write to `status` that reverses Closed.
**If violated** — rebalance resumes on a closed position.

#### I-5
StateMachine · On-chain: **Yes**
> One-shot latches: `FloorVault.factory` (0 -> caller), `FloorFactory.tokenBeacon` (0 -> beacon).

**Derivation** — edge `factory==0@125 -> msg.sender@127`; `tokenBeacon==0@362 -> beacon@364`.
**If violated** — re-initialisation of a vault, or beacon swap.

#### I-6
Bound · On-chain: **Yes**
> `defaults` always within `_checkDefaults` bounds.

**Derivation** — guard-lift: writers of `defaults` are the constructor (121) and `setDefaults` (347), both call `_checkDefaults`.
**If violated** — out-of-envelope parameters copied into new vaults.

#### I-7
Temporal · On-chain: **Yes**
> Per-asset trade spacing: a swap on asset i never happens within `minInterval` of the previous one on i.

**Derivation** — temporal check `lastTradeAt + minInterval > block.timestamp` (FloorVault:180,209); `lastTradeAt` written only in `_swap` (453). `minInterval` may be 0 (FloorFactory:390).
**If violated** — rate limit bypassed.

#### I-8
Temporal · On-chain: **Yes**
> After maturity or once not Active, E* == 0 (full unwind of active assets).

**Derivation** — `if (status == Active && block.timestamp < maturity)` (FloorVault:419); `estar` is 0 otherwise.
**If violated** — exposure after maturity.

#### I-9
Bound · On-chain: **No**
> A vault can always price all its assets (so it can always de-risk).

**Derivation** — `_load` calls `_price` for each held or active asset (FloorVault:404-416) and `_price` reverts on short history, deviation or low liquidity (391-393). No path sells one asset while another asset's oracle fails.
**If violated** — vault stuck holding exposure while one oracle guard trips (exits still work).

#### I-10
Bound · On-chain: **No**
> USDT has 18 decimals (assumed by `valueOf`, `priceWad`, caps).

**Derivation** — guard-lift of `decimals() != 18` (FloorFactory:307) applies only to stock tokens; constructor stores `usdt_` unchecked (FloorFactory:117). TwapOracle:218 says both tokens are asserted.
**If violated** — wrong V, targets and `minOut`.

#### I-11
Conservation (negative) · On-chain: **Yes**
> `totalTvl` only increases; it is a lifetime-deposit cap, not live TVL.

**Derivation** — `Δ(totalTvl) = +amount` (FloorFactory:163), no decrement anywhere (grep of `totalTvl`). NatSpec: FloorFactory:70-72.
**If violated** — n/a (documented).

#### I-12
Conservation · On-chain: **Yes**
> USDT credited to the vault in `createPosition` equals `amount` and equals `deposit` set in `initialize`.

**Derivation** — Δ-pair FloorFactory:173-174 (delta check) and FloorVault:147 (`deposit = deposit_`).
**If violated** — floor computed from a deposit the vault did not receive.

## 3. Inferred Invariants (Cross-Contract)

#### X-1
On-chain: **No**
> Vault behaviour is determined by factory state it does not snapshot.

**Caller side** — FloorVault:178,185,377,382,480,490 read `isKeeper`, `routerOk`, `isTradingOpen`, `assets`, `lastMultiplier`, `tokenBeacon` live.
**Callee side** — FloorFactory:239 `setKeeper`, 334 `addRouter`, 277 `removeRouter`, 323 `addAsset` (overwrites existing asset), 285 `disableAsset`, 259 `setHalted`, all instant (router add 24h).
**If violated** — behaviour of live vaults changes without any owner action on the vault.

#### X-2
On-chain: **Yes**
> Trading is blocked while the token multiplier differs from `lastMultiplier`.

**Caller side** — FloorVault:480-484.
**Callee side** — `lastMultiplier` written in `pokeMultiplier` (206) and `addAsset` (325).
**If violated** — trades at a stale price basis.

#### X-3
On-chain: **No** (partial)
> The vault's copy of `defaults` satisfies the factory's bounds.

**Caller side** — FloorVault:154-165 decodes `cfg` and re-checks only `tolAgg`, `tolDirect`, `twapWindow`.
**Callee side** — FloorFactory:176 passes `abi.encode(defaults)` of a bounds-checked struct (I-6); `initialize` can be called by any contract on an uninitialised address.
**If violated** — out-of-envelope parameters in a vault if a non-factory contract ever initialises a clone.

#### X-4
On-chain: **No**
> `approvedTokenImpl` reflects the audited bStock implementation.

**Caller side** — FloorVault:490-492 compares `IBeacon.implementation()` to `approvedTokenImpl`.
**Callee side** — FloorFactory:287-291 (`approveTokenImpl`, guardian, instant, any non-zero address) and 361-367 (`setTokenBeacon`, owner one-shot).
**If violated** — buy-blocking check disabled or forced.

#### X-5
On-chain: **Yes**
> The router never holds or spends any tracked token beyond `amountIn`; allowance is zero after the call.

**Caller side** — FloorVault:462-471; **Callee side** — SwapGuard:172-206.
**If violated** — I2 / I11 break.

#### X-6
On-chain: **Yes**
> Exits cannot be blocked by factory pause, halt, router removal or oracle failure.

**Caller side** — FloorVault:245-313 (no factory reads in `requestClose`, `exitInKind`, `rescue`); `closeToUSDT` prices through the oracle but only for non-zero balances (259-261).
**Callee side** — pause/halt/removeRouter write factory storage only (FloorFactory:247-279).
**If violated** — user funds trapped (I8, I13).

#### X-7
On-chain: **Yes**
> The price used for `minOut` agrees with spot within `maxTickDev` ticks.

**Caller side** — FloorVault:392; **Callee side** — TwapOracle:266-271 (`slot0` tick vs `observe`).
**If violated** — oracle manipulation window widens.

## 4. Economic Invariants

#### E-1
On-chain: **Yes** (against the TWAP) / **No** (against an external fair price)
> One rebalance loses at most `tol` of its notional relative to the TWAP.

**Follows from** — I-7 + X-5 + X-7 (CPPIMath:96-99 `minOut`, SwapGuard:202).
**If violated** — keeper plus router extract more than `tol` per trade.

#### E-2
On-chain: **No**
> No privileged party can move user funds beyond tolerance-bounded trades.

**Follows from** — X-1 + X-4 + X-5 + X-6. The chain has a gap at X-1 (factory-held pool, router and keeper config is live and instantly changeable).
**If violated** — price reference and counterparty both set by the same privileged role.

#### E-3
On-chain: **No**
> Vault value V stays >= floor F.

**Follows from** — I-3 + I-8. CPPI is a strategy bound (I5 cash lock), not an on-chain guarantee; a gap past the floor between trading windows loses it (`CPPIPath.t.sol` tests the loss stays inside under big gaps).
**If violated** — floor claim not met.

---

# Appendix C: Gaps named by the x-ray (for routing)

## To A07 (tests)

1. Add a test and invariant for re-pointing an existing asset with `FloorFactory.addAsset` while a position is open (X-1, E-2).
2. Add a test with USDT decimals != 18 at deploy (I-10), and an `exitInKind` test with a token returning very large returndata under the 500k gas cap.
3. Promote I1, I4 and I9 from handler-recorded `violations` strings to named invariant functions, and add a canary that handlers actually reach rebalance, exit and swap-failure paths.
4. Raise branch coverage on `FloorVault` and `FloorFactory` (about 75%); enumerate the uncovered branches from `forge coverage --report lcov`.
5. Add tests for `closeToUSDT` / `exitInKind` / `rescue` ordering across Active, Closing and Closed, including `exitInKind` called twice and when status is already Closed (I-4).
6. Add a multi-asset case where one pool trips `PriceDeviation` or `PoolIlliquid` while another asset needs a sell (I-9).
7. Add a case with `minInterval == 0` and repeated in-band keeper trades to bound cumulative loss (E-1).
8. Consider Halmos or Echidna for `CPPIMath` and `SwapGuard.exec`; none exists today.
9. Run the fork suite (ForkFloor, 8 tests, needs BSC RPC) and include it in coverage before G3.

## To A05 (vault) and A06 (factory, lens, scripts)

1. A06: decide and document whether `addAsset` may overwrite an asset that has open positions; either block it or add a delay, or record it as an accepted owner power (X-1).
2. A06: assert USDT `decimals() == 18` in the factory constructor, or fix the comment at TwapOracle:218 (I-10).
3. A05/A06: document or snapshot the factory values a vault reads live (keeper set, router, pool config, `approvedTokenImpl`); `approveTokenImpl` accepts any non-zero address from the guardian (X-4).
4. A05: decide whether a vault with a failing oracle on one asset should still be able to sell the others (I-9), or document the fail-closed choice.
5. A05: `initialize` only requires a contract caller (G-2); consider documenting the atomic-clone assumption or checking against an expected factory (X-3).
6. A05: confirm `exitInKind` return-data handling (FloorVault:291) with a returndata-bomb token and the gas cap.
7. A06: `setTokenBeacon` is a post-deploy call; until it runs the beacon check is off. Put it in the deploy script order and the dry-run (A14).
8. A06: package README is the stock Foundry text (cites `script/Counter.s.sol`, which does not exist); replace with Floor build, test and deploy notes or point to docs.
9. A06: `IPauseManager` and `ICompliance` are unused in `src/`; remove or document.
10. A06/A05: confirm OZ 5.4.0 and the vendored Uniswap v4 files are byte-identical to upstream (OZ is not a submodule).
11. Manager: ownership of the factory owner and guardian (EOA or multisig) is not recorded in code; record it in the runbook for G4.
