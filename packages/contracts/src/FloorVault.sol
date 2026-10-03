// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IFloorVault} from "./interfaces/IFloorVault.sol";
import {IFloorFactory} from "./interfaces/IFloorFactory.sol";
import {IPancakeV3Pool} from "./interfaces/IPancakeV3Pool.sol";
import {IPancakeV3SwapRouter} from "./interfaces/IPancakeV3SwapRouter.sol";
import {ISecuritiesToken} from "./interfaces/ISecuritiesToken.sol";
import {IBeacon} from "./interfaces/IBeacon.sol";
import {CPPIMath} from "./libs/CPPIMath.sol";
import {TwapOracle} from "./libs/TwapOracle.sol";
import {SwapGuard} from "./libs/SwapGuard.sol";

/// @title FloorVault
/// @notice One Floor position (EIP-1167 clone). Holds the owner's USDT and bStocks, recomputes the CPPI target from a
///         Pancake v3 TWAP, and executes only rule-valid, balance-delta-checked swaps.
/// @dev Spec: docs/CONTRACTS.md sections 5 (maths), 7 (roles), 8 (swaps), 9 (emergency), 11.2 (interface).
///      The only functions that move assets out are the guarded swap paths (router and back, vault as receiver) and
///      the owner's `closeToUSDT`, `exitInKind` and `rescue` (section 9, "No privileged party can move user funds").
contract FloorVault is IFloorVault, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------- constants

    /// @dev CONTRACTS.md section 5: m = 4.
    uint256 public constant M = CPPIMath.M;
    /// @dev CONTRACTS.md section 3: oracle history guard, `observationCardinality >= 200`.
    uint16 internal constant MIN_CARDINALITY = 200;
    /// @dev CONTRACTS.md section 4: a scheduled multiplier change blocks trading from 1 hour before it takes effect.
    uint256 internal constant PENDING_LEAD = 1 hours;
    /// @dev Gas cap per token transfer inside `exitInKind` so one hostile or broken token cannot trap the USDT.
    uint256 internal constant EXIT_TRANSFER_GAS = 500_000;
    /// @dev Gas cap on every `balanceOf` read of a bStock in the exit paths (A12 F-00): a hostile token cannot burn the
    ///      gas that the USDT transfer needs, and bad return data is treated as a zero balance.
    uint256 internal constant EXIT_READ_GAS = 100_000;
    /// @dev Gas cap on the best-effort `onPositionClosed` report to the factory.
    uint256 internal constant REPORT_GAS = 100_000;
    /// @dev CONTRACTS.md section 7: the public path only fires at 2x the normal band.
    uint256 internal constant PUBLIC_BAND_MULT = 2;

    /// @dev Vault-local error (not in the frozen interface): wrong lifecycle state for the call.
    error BadStatus();
    /// @dev Vault-local error: initialisation parameters invalid.
    error BadInit();

    // ------------------------------------------------- storage (set once in initialize)

    address public factory;
    address public owner;
    address public usdt;
    uint256 public deposit;
    uint256 public floor;
    uint40 public start;
    uint40 public maturity;
    uint8 public nAssets;
    address[3] public assetAt;
    uint16[3] public weightBps;
    uint16 public sellBandBps;
    uint16 public buyBandBps;
    uint32 public minInterval;
    uint32 public publicDelay;
    uint32 public twapWindow;
    uint16 public maxTickDev;
    uint16 public tolAggBps;
    uint16 public tolDirectBps;
    uint256 public minTrade;
    uint256 public dust;

    // ------------------------------------------------------------ mutable state

    Status public status;
    uint40 public lastRebalance;
    mapping(uint8 => uint40) public lastTradeAt;

    // ------------------------------------------------------------ memory types

    struct State {
        uint256 V; // total value, USDT WAD, rounded down
        uint256 usdtBal;
        uint256 cushion;
        uint256 estar; // exposure target E*
        uint256[3] bal; // raw balances
        uint256[3] price; // USDT per 1e18 raw (WAD); 0 when not priced (inactive and empty, or pricing failed)
        bool[3] failed; // pricing reverted (guard tripped): value counted as 0, buys suppressed, see `_load`
        bool anyFailed;
        uint256[3] value; // E_i
        uint256[3] target; // T_i
        IFloorFactory.Asset[3] cfg;
    }

    /// @dev Swap request bundle (keeps `_swap` under the stack limit).
    struct Req {
        uint8 idx;
        bool buy;
        uint16 tol;
        uint256 amountIn;
        address router;
        address approveTarget;
        bytes data;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev The implementation contract can never be initialised: `factory` is parked on a dead address.
    constructor() {
        factory = address(0xdead);
    }

    // =====================================================================
    // initialise
    // =====================================================================

    /// @inheritdoc IFloorVault
    /// @dev The factory calls this in the same transaction as the clone creation, so `msg.sender` is the factory.
    ///      Callable once (`factory` is set); disabled on the implementation (constructor parks `factory`).
    function initialize(
        address owner_,
        uint256 deposit_,
        uint256 floor_,
        uint40 maturity_,
        address[] calldata assets_,
        uint16[] calldata weightsBps_,
        bytes calldata cfg
    ) external {
        if (factory != address(0)) revert AlreadyInitialized();
        if (msg.sender.code.length == 0) revert NotFactory();
        factory = msg.sender;

        uint256 n = assets_.length;
        if (owner_ == address(0) || deposit_ == 0 || floor_ > deposit_ || n == 0 || n > 3 || weightsBps_.length != n) {
            revert BadInit();
        }
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            if (assets_[i] == address(0)) revert BadInit();
            for (uint256 j; j < i; ++j) {
                if (assets_[j] == assets_[i]) revert BadInit();
            }
            assetAt[i] = assets_[i];
            weightBps[i] = weightsBps_[i];
            sum += weightsBps_[i];
        }
        if (sum != 10_000) revert BadInit();

        owner = owner_;
        usdt = IFloorFactory(msg.sender).usdt();
        deposit = deposit_;
        floor = floor_;
        start = uint40(block.timestamp);
        maturity = maturity_;
        nAssets = uint8(n);
        lastRebalance = uint40(block.timestamp);

        IFloorFactory.Defaults memory d = abi.decode(cfg, (IFloorFactory.Defaults));
        sellBandBps = d.sellBandBps;
        buyBandBps = d.buyBandBps;
        minInterval = d.minInterval;
        publicDelay = d.publicDelay;
        twapWindow = d.twapWindow;
        maxTickDev = d.maxTickDev;
        tolAggBps = d.tolAggBps;
        tolDirectBps = d.tolDirectBps;
        minTrade = d.minTrade;
        dust = d.dust;
        if (d.tolAggBps >= 10_000 || d.tolDirectBps >= 10_000 || d.twapWindow == 0) revert BadInit();

        emit Initialized(owner_, deposit_, floor_, maturity_);
    }

    // =====================================================================
    // keeper path (aggregator or any allowlisted router)
    // =====================================================================

    /// @inheritdoc IFloorVault
    /// @dev Check order (EXECUTION_PLAN A05): keeper, trading open, status, minInterval, multiplier guard, beacon
    ///      (buys), router allowed, then oracle guards inside the valuation, direction and size window.
    function rebalance(Swap calldata s) external nonReentrant {
        if (!IFloorFactory(factory).isKeeper(msg.sender)) revert NotKeeper();
        _requireTradable(s.assetIdx);
        if (uint256(lastTradeAt[s.assetIdx]) + minInterval > block.timestamp) revert TooSoon();
        address token = assetAt[s.assetIdx];
        if (_multiplierSettle(token)) return;
        if (s.buy) _beaconGuard();

        (bool routerOk, address approveTarget) = IFloorFactory(factory).routerOk(s.router);
        if (!routerOk) revert RouterNotAllowed();

        State memory st = _load();
        if (st.failed[s.assetIdx]) _price(st.cfg[s.assetIdx]); // traded asset must be priceable: surface its error
        (bool buy, uint256 value, uint256 amountIn) = _plan(st, s.assetIdx, 1);
        if (value == 0 || amountIn == 0) revert NoTradeNeeded();
        if (buy != s.buy) revert WrongDirection();
        if (!CPPIMath.amountInOk(s.amountIn, amountIn)) revert AmountOutOfRange();

        // Direct Pancake router uses the wider tolerance (fee 25 bps), the aggregator path the tight one.
        uint16 tol = s.router == IFloorFactory(factory).v3SwapRouter() ? tolDirectBps : tolAggBps;
        _swap(st, Req(s.assetIdx, buy, tol, s.amountIn, s.router, approveTarget, s.data));
    }

    // =====================================================================
    // permissionless fallback (direct Pancake v3)
    // =====================================================================

    /// @inheritdoc IFloorVault
    /// @dev CONTRACTS.md section 7: after `publicDelay` idle, drift at 2x the band, Pancake SwapRouter only, `tolDirectBps`.
    ///      The caller chooses only the asset; direction, amount and recipient are fixed by the vault.
    function rebalancePublic(uint8 assetIdx) external nonReentrant {
        _requireTradable(assetIdx);
        if (uint256(lastRebalance) + publicDelay > block.timestamp) revert PublicTooEarly();
        if (uint256(lastTradeAt[assetIdx]) + minInterval > block.timestamp) revert TooSoon();
        address token = assetAt[assetIdx];
        if (_multiplierSettle(token)) return;

        address router = IFloorFactory(factory).v3SwapRouter();
        (bool routerOk, address approveTarget) = IFloorFactory(factory).routerOk(router);
        if (!routerOk) revert RouterNotAllowed();

        State memory st = _load();
        if (st.failed[assetIdx]) _price(st.cfg[assetIdx]);
        (bool buy, uint256 value, uint256 amountIn) = _plan(st, assetIdx, PUBLIC_BAND_MULT);
        if (value == 0 || amountIn == 0) revert NoTradeNeeded();
        if (buy) _beaconGuard();

        uint256 minOut_ = CPPIMath.minOut(amountIn, st.price[assetIdx], tolDirectBps, buy);
        bytes memory data = abi.encodeCall(
            IPancakeV3SwapRouter.exactInputSingle,
            (IPancakeV3SwapRouter.ExactInputSingleParams({
                    tokenIn: buy ? usdt : token,
                    tokenOut: buy ? token : usdt,
                    fee: st.cfg[assetIdx].fee,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: amountIn,
                    amountOutMinimum: minOut_,
                    sqrtPriceLimitX96: 0
                }))
        );
        _swap(st, Req(assetIdx, buy, tolDirectBps, amountIn, router, approveTarget, data));
    }

    // =====================================================================
    // owner: exits (CONTRACTS.md section 9). None of these read factory state, so factory pause, halt, router
    // removal or a broken oracle cannot stop them (I8, I13).
    // =====================================================================

    /// @inheritdoc IFloorVault
    function requestClose() external onlyOwner nonReentrant {
        if (status != Status.Active) revert BadStatus();
        status = Status.Closing;
        emit CloseRequested();
    }

    /// @inheritdoc IFloorVault
    /// @dev Needs total stock value <= `dust` at the TWAP. Skips pricing for empty assets so a dead pool cannot block
    ///      closing a fully unwound position. A bStock whose `balanceOf` fails or returns garbage counts as empty
    ///      (A12 F-00); use `rescue` afterwards.
    function closeToUSDT() external onlyOwner nonReentrant {
        if (status == Status.Closed) revert BadStatus();
        uint256 stockValue;
        uint256 n = nAssets;
        for (uint256 i; i < n; ++i) {
            address token = assetAt[i];
            (, uint256 bal) = _readBalance(token);
            if (bal == 0) continue;
            IFloorFactory.Asset memory a = _asset(token);
            uint256 p = _price(a);
            stockValue += CPPIMath.valueOf(bal, p);
        }
        if (stockValue > dust) revert StockNotUnwound();
        status = Status.Closed;
        uint256 out = IERC20(usdt).balanceOf(address(this));
        if (out > 0) IERC20(usdt).safeTransfer(owner, out);
        _reportClosed();
        emit Closed(owner, out);
    }

    /// @inheritdoc IFloorVault
    /// @dev Always callable by the owner. USDT goes out FIRST (nothing a bStock does can then affect it). Each bStock
    ///      is read and moved with a gas-capped low-level call and a 32-byte return-data limit: a revert, a gas burn,
    ///      empty or oversized return data, or a false return skips that token, never reverts the exit (A12 F-00).
    ///      Skipped tokens stay in the vault and can be moved with `rescue`. The caller must supply enough gas for
    ///      the capped calls; a low-gas transaction reverts instead of silently skipping a token (A12 F-09).
    function exitInKind(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert BadInit();
        status = Status.Closed;
        uint256 out = IERC20(usdt).balanceOf(address(this));
        if (out > 0) IERC20(usdt).safeTransfer(to, out);
        _reportClosed();

        uint256 n = nAssets;
        address[] memory skippedAll = new address[](n);
        uint256 skippedN;
        for (uint256 i; i < n; ++i) {
            address token = assetAt[i];
            (bool readOk, uint256 bal) = _readBalance(token);
            if (!readOk) {
                skippedAll[skippedN++] = token;
                continue;
            }
            if (bal == 0) continue;
            if (!_capTransfer(token, to, bal)) skippedAll[skippedN++] = token;
        }
        address[] memory skipped = new address[](skippedN);
        for (uint256 i; i < skippedN; ++i) {
            skipped[i] = skippedAll[i];
        }
        emit ExitInKind(to, out, skipped);
    }

    /// @dev Gas-capped `balanceOf`. `ok` is false when the call fails or does not return exactly 32 bytes; `bal` is
    ///      then 0. Never reverts and never copies more than 32 bytes of return data.
    function _readBalance(address token) internal view returns (bool ok, uint256 bal) {
        bytes memory data = abi.encodeCall(IERC20.balanceOf, (address(this)));
        uint256 size;
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            ok := staticcall(EXIT_READ_GAS, token, add(data, 0x20), mload(data), ptr, 0x20)
            size := returndatasize()
            if and(ok, eq(size, 0x20)) { bal := mload(ptr) }
        }
        if (size != 32) {
            ok = false;
            bal = 0;
        }
    }

    /// @dev Gas-capped `transfer` with a 32-byte return-data limit. True when the token reports success (true, or no
    ///      return data). Reverts only if the caller gave too little gas for the cap (see `exitInKind`).
    function _capTransfer(address token, address to, uint256 amount) internal returns (bool good) {
        if (gasleft() < EXIT_TRANSFER_GAS * 64 / 63 + 50_000) revert BadStatus();
        bytes memory data = abi.encodeCall(IERC20.transfer, (to, amount));
        bool ok;
        uint256 size;
        uint256 word;
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            ok := call(EXIT_TRANSFER_GAS, token, 0, add(data, 0x20), mload(data), ptr, 0x20)
            size := returndatasize()
            if gt(size, 0x1f) { word := mload(ptr) }
        }
        good = ok && (size == 0 || (size == 32 && word == 1));
    }

    /// @dev Best-effort, gas-capped report to the factory so the deposit stops counting against `maxTotalTvl`. The
    ///      factory is trusted but the exits must not depend on it (I8, I13): the result is ignored.
    function _reportClosed() internal {
        address f = factory;
        bytes memory data = abi.encodeCall(IFloorFactory.onPositionClosed, ());
        assembly ("memory-safe") {
            pop(call(REPORT_GAS, f, 0, add(data, 0x20), mload(data), 0, 0))
        }
    }

    /// @inheritdoc IFloorVault
    function rescue(address token, address to) external onlyOwner nonReentrant {
        if (status != Status.Closed) revert NotClosed();
        if (to == address(0)) revert BadInit();
        uint256 bal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, bal);
        emit Rescued(token, to, bal);
    }

    // =====================================================================
    // views
    // =====================================================================

    /// @inheritdoc IFloorVault
    function valuation() external view returns (uint256 V, uint256 usdtBal, uint256[3] memory stockValue) {
        State memory st = _load();
        return (st.V, st.usdtBal, st.value);
    }

    /// @inheritdoc IFloorVault
    function targets() external view returns (uint256 cushion, uint256 exposureTarget, uint256[3] memory target) {
        State memory st = _load();
        return (st.cushion, st.estar, st.target);
    }

    /// @inheritdoc IFloorVault
    /// @dev First asset (by index) that is rule-valid to trade now, skipping assets inside `minInterval`. Does not look
    ///      at market hours or keeper rights; `FloorLens` adds `tradingOpen`. Buys are suppressed while the token
    ///      implementation differs from the approved one.
    function previewRebalance()
        external
        view
        returns (
            bool needed,
            uint8 assetIdx,
            bool buy,
            address tokenIn,
            address tokenOut,
            uint256 amountIn,
            uint256 minOutAgg,
            uint256 minOutDirect
        )
    {
        if (status == Status.Closed) return (false, 0, false, address(0), address(0), 0, 0, 0);
        State memory st = _load();
        bool beaconBad = _beaconChanged();
        uint256 n = nAssets;
        for (uint8 i; i < n; ++i) {
            if (uint256(lastTradeAt[i]) + minInterval > block.timestamp) continue;
            (bool b, uint256 value, uint256 amt) = _plan(st, i, 1);
            if (value == 0 || amt == 0) continue;
            if (b && beaconBad) continue;
            (tokenIn, tokenOut) = b ? (usdt, assetAt[i]) : (assetAt[i], usdt);
            minOutAgg = CPPIMath.minOut(amt, st.price[i], tolAggBps, b);
            minOutDirect = CPPIMath.minOut(amt, st.price[i], tolDirectBps, b);
            return (true, i, b, tokenIn, tokenOut, amt, minOutAgg, minOutDirect);
        }
    }

    /// @inheritdoc IFloorVault
    function claimValue() external view returns (uint256) {
        return _load().V;
    }

    // =====================================================================
    // internals
    // =====================================================================

    /// @dev Shared gate for both rebalance paths. Trading window, pause and halt live in the factory
    ///      (CONTRACTS.md section 6).
    function _requireTradable(uint8 assetIdx) internal view {
        if (!IFloorFactory(factory).isTradingOpen(block.timestamp)) revert TradingClosed();
        if (status == Status.Closed) revert BadStatus();
        if (assetIdx >= nAssets) revert NoTradeNeeded();
    }

    function _asset(address token) internal view returns (IFloorFactory.Asset memory a) {
        (a.pool, a.fee, a.active, a.minLiquidity, a.maxTradeValue, a.usdtIsToken0) =
            IFloorFactory(factory).assets(token);
        if (a.pool == address(0)) revert PoolIlliquid();
    }

    /// @dev TWAP price with all guards (CONTRACTS.md section 3): history, deviation, liquidity. Fails closed.
    function _price(IFloorFactory.Asset memory a) internal view returns (uint256 p) {
        (,,, uint16 cardinality,,,) = IPancakeV3Pool(a.pool).slot0();
        if (cardinality < MIN_CARDINALITY) revert OracleHistoryTooShort();
        p = TwapOracle.price(a.pool, twapWindow, maxTickDev, a.minLiquidity, a.usdtIsToken0);
        if (p == 0) revert PoolIlliquid();
    }

    /// @dev Price or 0 when any oracle guard fails. Runs `_price` through an external self-call so a revert can be
    ///      caught; `priceOf` is a view with no state access beyond the pool reads.
    function _tryPrice(IFloorFactory.Asset memory a) internal view returns (uint256 p) {
        try this.priceOf(a.pool, a.minLiquidity, a.usdtIsToken0) returns (uint256 r) {
            p = r;
        } catch {}
    }

    /// @notice Guarded TWAP price for a pool (same checks as `_price`). Reverts when a guard fails. Exposed only so
    ///         `_load` can catch failures; reads no vault state except `twapWindow` and `maxTickDev`.
    function priceOf(address pool, uint128 minLiquidity, bool usdtIsToken0) external view returns (uint256) {
        return _price(IFloorFactory.Asset(pool, 0, true, minLiquidity, 0, usdtIsToken0));
    }

    /// @dev Values the position and derives targets. CONTRACTS.md section 5: V rounds down, F is stored rounded up,
    ///      E* = min(C*M, V) rounded down, E* = 0 after maturity or once closing. A disabled asset is priced if held
    ///      (so it can be sold) but gets target 0.
    function _load() internal view returns (State memory st) {
        address u = usdt;
        st.usdtBal = IERC20(u).balanceOf(address(this));
        uint256 V = st.usdtBal;
        uint256 n = nAssets;
        for (uint256 i; i < n; ++i) {
            address token = assetAt[i];
            IFloorFactory.Asset memory a = _asset(token);
            st.cfg[i] = a;
            uint256 bal = IERC20(token).balanceOf(address(this));
            st.bal[i] = bal;
            if (bal == 0 && !a.active) continue;
            uint256 p = _tryPrice(a);
            if (p == 0) {
                // Fail soft (A12 F-03, Pashov F-02): an unpriceable asset counts as 0 (V is understated, so the vault
                // only ever sells more, never buys more) and cannot block the other assets.
                st.failed[i] = true;
                st.anyFailed = true;
                continue;
            }
            st.price[i] = p;
            uint256 v = CPPIMath.valueOf(bal, p);
            st.value[i] = v;
            V += v;
        }
        st.V = V;
        st.cushion = CPPIMath.cushion(V, floor);
        if (status == Status.Active && block.timestamp < maturity) {
            st.estar = CPPIMath.exposureTarget(st.cushion, V);
        }
        for (uint256 i; i < n; ++i) {
            if (st.cfg[i].active) st.target[i] = CPPIMath.assetTarget(st.estar, weightBps[i]);
        }
    }

    /// @dev One swap decision for asset `i` (CONTRACTS.md section 5 trade rule). `bandMul` scales both bands
    ///      (2 on the public path). Returns value 0 when nothing should happen.
    function _plan(State memory st, uint8 i, uint256 bandMul)
        internal
        view
        returns (bool buy, uint256 value, uint256 amountIn)
    {
        uint256 maxTrade = st.cfg[i].maxTradeValue;
        // A disabled asset is fully unwound, so it is treated as E* == 0.
        uint256 estarI = st.cfg[i].active ? st.estar : 0;
        // Full unwind (E* == 0): the last chunk may be below `minTrade`, any stock worth more than `dust` is sold, so
        // `closeToUSDT` can always finish (Pashov F-01).
        uint256 sellMin = minTrade;
        if (estarI == 0 && dust + 1 < sellMin) sellMin = dust + 1;
        value = CPPIMath.sellAmount(
            st.value[i], st.target[i], st.V, estarI, uint256(sellBandBps) * bandMul, sellMin, maxTrade
        );
        if (value > 0) {
            amountIn = CPPIMath.sellAmountIn(value, st.price[i], st.bal[i]);
            return (false, value, amountIn);
        }
        value = CPPIMath.buyAmount(
            st.value[i], st.target[i], st.V, st.usdtBal, uint256(buyBandBps) * bandMul, minTrade, maxTrade
        );
        // Buys need every asset priced: a failed price understates V, which is safe for sells only.
        if (value > 0 && !st.anyFailed) return (true, value, value);
        value = 0;
    }

    /// @dev Runs the guarded swap and emits. State (`lastTradeAt`) is written before the external call.
    function _swap(State memory st, Req memory r) internal {
        address token = assetAt[r.idx];
        lastTradeAt[r.idx] = uint40(block.timestamp);
        lastRebalance = uint40(block.timestamp);

        uint256 n = nAssets;
        address[] memory tracked = new address[](n + 1);
        tracked[0] = usdt;
        for (uint256 i; i < n; ++i) {
            tracked[i + 1] = assetAt[i];
        }
        SwapGuard.Call memory c = SwapGuard.Call({
            tokenIn: r.buy ? usdt : token,
            tokenOut: r.buy ? token : usdt,
            amountIn: r.amountIn,
            minOut: CPPIMath.minOut(r.amountIn, st.price[r.idx], r.tol, r.buy),
            router: r.router,
            approveTarget: r.approveTarget,
            data: r.data
        });
        (uint256 spent, uint256 received) = SwapGuard.exec(c, tracked);
        emit Rebalanced(r.idx, r.buy, spent, received, st.V, st.estar, r.router, msg.sender);
    }

    /// @dev CONTRACTS.md section 4, MultiplierWatch. Returns true when the stored multiplier was stale: the vault
    ///      then arms the guard itself (`pokeMultiplier`, permissionless) and the call ends as a no-op instead of
    ///      reverting, so the update persists without a separate keeper poke (A12 F-05). Reverts while the multiplier
    ///      recently changed or is about to change.
    function _multiplierSettle(address token) internal returns (bool poked) {
        IFloorFactory f = IFloorFactory(factory);
        ISecuritiesToken t = ISecuritiesToken(token);
        if (t.uiMultiplier() != f.lastMultiplier(token)) {
            f.pokeMultiplier(token);
            return true;
        }
        if (block.timestamp < uint256(f.lastMultiplierChange(token)) + twapWindow) revert MultiplierTransition();
        if (t.hasPendingMultiplier() && t.effectiveAt() <= block.timestamp + PENDING_LEAD) {
            revert MultiplierTransition();
        }
    }

    /// @dev CONTRACTS.md section 9: if the shared token implementation differs from the approved one, buys are blocked.
    ///      A zero beacon on the factory disables the check (non-BSC test deployments).
    function _beaconChanged() internal view returns (bool) {
        address beacon = IFloorFactory(factory).tokenBeacon();
        if (beacon == address(0)) return false;
        return IBeacon(beacon).implementation() != IFloorFactory(factory).approvedTokenImpl();
    }

    function _beaconGuard() internal view {
        if (_beaconChanged()) revert TokenImplChanged();
    }
}
