// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IFloorFactory} from "./interfaces/IFloorFactory.sol";
import {IFloorVault} from "./interfaces/IFloorVault.sol";
import {IPancakeV3Factory} from "./interfaces/IPancakeV3Factory.sol";
import {IPancakeV3Pool} from "./interfaces/IPancakeV3Pool.sol";
import {ISecuritiesToken} from "./interfaces/ISecuritiesToken.sol";
import {CPPIMath} from "./libs/CPPIMath.sol";
import {MarketHours} from "./libs/MarketHours.sol";
import {DefaultsCheck} from "./libs/DefaultsCheck.sol";

/// @title FloorFactory
/// @notice Roles, config, allowlists and EIP-1167 clone creation for Floor positions. Holds no funds.
/// @dev Spec: docs/CONTRACTS.md sections 6, 7 and 11.1, plus EXECUTION_PLAN P2 (constructor routers), P5 (launch
///      caps) and P6 (`minTrade` bounds allow 1e18 and up). Economic parameters are copied into each clone at
///      creation (`abi.encode(defaults)`), so later `setDefaults` calls never touch existing positions.
contract FloorFactory is IFloorFactory {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------- constants

    /// @dev Smallest position (A12 F-07): 1 USDT, so 1-wei positions cannot bloat `positions[]` and keeper scans.
    uint256 internal constant MIN_DEPOSIT = 1e18;
    /// @dev CONTRACTS.md section 11.1 `createPosition`: floorBps in [5000, 9800].
    uint16 internal constant MIN_FLOOR_BPS = 5000;
    uint16 internal constant MAX_FLOOR_BPS = 9800;
    /// @dev CONTRACTS.md section 11.1: term 7..400 days.
    uint32 internal constant MIN_TERM = 7 days;
    uint32 internal constant MAX_TERM = 400 days;
    /// @dev CONTRACTS.md section 3: oracle history guard.
    uint16 internal constant MIN_CARDINALITY = 200;
    /// @dev Pancake writes at most one observation per block and BSC blocks are 0.75 s, so a window of `w` seconds can
    ///      need ceil(w * 4 / 3) slots when somebody swaps in every block (Pashov 02 #13).
    uint256 internal constant SLOTS_PER_4_SECONDS = 4;
    /// @dev CONTRACTS.md section 7: routers added after deploy are active after 24 h.
    uint40 internal constant ROUTER_DELAY = 24 hours;
    /// @dev EXECUTION_PLAN P5 launch caps (USDT, 18 decimals).
    uint256 internal constant LAUNCH_MAX_DEPOSIT = 1000e18;
    uint256 internal constant LAUNCH_MAX_TOTAL_TVL = 5000e18;
    /// @dev A position must mature this long before the holiday table ends: the post-maturity unwind trades too
    ///      (Pashov 03 lead).
    uint256 internal constant UNWIND_BUFFER = 14 days;

    /// @dev Local errors (not in the frozen interface).
    error BadAmount();
    error BadDefaults();
    error LengthMismatch();
    error BadLimits();
    error NotPendingOwner();
    error NotOwnerOrGuardian();
    /// @dev Deposit too small for the basket: no token target would ever reach `minTrade` (Pashov 03 lead).
    error PositionTooSmall();
    error BeaconAlreadySet();
    event HolidayHorizonSet(uint32 day);

    // --------------------------------------------------------------- storage

    address public override owner;
    address public override pendingOwner;
    address public override guardian;
    mapping(address => bool) public override isKeeper;
    bool public override paused;
    bool public override halted;
    mapping(uint32 => bool) public override nonTradingDay;
    address public immutable override vaultImplementation;
    address public immutable override usdt;
    address public immutable override v3Factory;
    address public immutable override v3SwapRouter;
    address public override tokenBeacon;
    address public override approvedTokenImpl;
    mapping(address => Asset) public override assets;
    mapping(address => Router) public override routers;
    Defaults public override defaults;
    uint256 public override maxDeposit;
    uint256 public override maxTotalTvl;
    /// @dev USDT deposited into positions that are still open. A vault reports its close once through
    ///      `onPositionClosed` (from `closeToUSDT` / `exitInKind`), which releases its deposit from this counter.
    uint256 public override totalTvl;
    /// @dev Deposit still counted in `totalTvl` per vault; zero for unknown or already released vaults.
    mapping(address => uint256) public liveDeposit;
    mapping(address => uint256) public override lastMultiplier;
    mapping(address => uint40) public override lastMultiplierChange;
    address[] public override positions;
    mapping(address => address[]) internal _byOwner;
    /// @dev Last unix day the holiday table is known to cover (0 = unchecked). A position cannot mature after it.
    uint32 public holidayHorizonDay;
    /// @dev Every listed token, so `setDefaults` can check the new tolerance against the listed pool fees.
    address[] internal _assetList;
    /// @notice Last time trading was switched back on (unpause or un-halt). The vault's public delay never counts time
    ///         before it, so a halt or pause cannot be waited out (Pashov 03 #5).
    uint40 public tradingResumedAt;

    // ------------------------------------------------------------- modifiers

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    modifier onlyGuardianOrOwner() {
        if (msg.sender != guardian && msg.sender != owner) revert NotOwnerOrGuardian();
        _;
    }

    // ----------------------------------------------------------- constructor

    /// @dev Signature fixed by IFloorFactory NatSpec (P2). `initialRouters` are active at deploy.
    constructor(
        address owner_,
        address guardian_,
        address usdt_,
        address v3Factory_,
        address v3SwapRouter_,
        address vaultImplementation_,
        Defaults memory defaults_,
        address[] memory initialRouters,
        address[] memory initialApproveTargets
    ) {
        if (
            owner_ == address(0) || guardian_ == address(0) || usdt_ == address(0) || v3Factory_ == address(0)
                || v3SwapRouter_ == address(0) || vaultImplementation_ == address(0)
        ) revert ZeroAddress();
        if (initialRouters.length != initialApproveTargets.length) revert LengthMismatch();
        owner = owner_;
        guardian = guardian_;
        usdt = usdt_;
        v3Factory = v3Factory_;
        v3SwapRouter = v3SwapRouter_;
        vaultImplementation = vaultImplementation_;
        _checkDefaults(defaults_);
        defaults = defaults_;
        maxDeposit = LAUNCH_MAX_DEPOSIT;
        maxTotalTvl = LAUNCH_MAX_TOTAL_TVL;

        bool pancakeListed;
        for (uint256 i; i < initialRouters.length; ++i) {
            address r = initialRouters[i];
            if (r == address(0) || initialApproveTargets[i] == address(0)) revert ZeroAddress();
            routers[r] = Router(r, initialApproveTargets[i], uint40(block.timestamp), false);
            if (r == v3SwapRouter_) pancakeListed = true;
            emit RouterAdded(r, initialApproveTargets[i], uint40(block.timestamp));
        }
        // P2: the Pancake SwapRouter must be among the initial routers.
        if (!pancakeListed) revert RouterNotActive();
        emit OwnershipTransferred(address(0), owner_);
        emit GuardianSet(guardian_);
        emit DefaultsSet(defaults_);
        emit LimitsSet(LAUNCH_MAX_DEPOSIT, LAUNCH_MAX_TOTAL_TVL);
    }

    // =====================================================================
    // user
    // =====================================================================

    /// @inheritdoc IFloorFactory
    /// @dev Pulls exactly `amount` USDT from the caller straight into the new vault, then initialises it. The vault
    ///      address is the position id.
    function createPosition(
        uint256 amount,
        uint16 floorBps,
        uint32 termSeconds,
        address[] calldata assets_,
        uint16[] calldata weightsBps
    ) external override returns (address vault) {
        // Halted too: a deposit would only wait in USDT, but a guardian halt is an incident (Pashov 02 lead).
        if (paused || halted) revert PausedErr();
        if (amount < MIN_DEPOSIT) revert BadAmount();
        if (amount > maxDeposit) revert DepositTooLarge();
        if (totalTvl + amount > maxTotalTvl) revert TvlCapReached();
        if (floorBps < MIN_FLOOR_BPS || floorBps > MAX_FLOOR_BPS) revert BadFloor();
        if (termSeconds < MIN_TERM || termSeconds > MAX_TERM) revert BadTerm();
        // The holiday table must cover the whole term (Pashov 02 lead): no vault may trade on an unlisted holiday.
        if (holidayHorizonDay != 0 && (block.timestamp + termSeconds + UNWIND_BUFFER) / 1 days > holidayHorizonDay) {
            revert BadTerm();
        }
        _checkBasket(assets_, weightsBps);

        uint256 floor_ = CPPIMath.floorFor(amount, floorBps);
        _checkNotTooSmall(amount, floor_, weightsBps);
        totalTvl += amount;
        uint40 maturity = uint40(block.timestamp + termSeconds);

        vault = Clones.clone(vaultImplementation);
        positions.push(vault);
        liveDeposit[vault] = amount;
        _byOwner[msg.sender].push(vault);

        IERC20 u = IERC20(usdt);
        uint256 balBefore = u.balanceOf(vault);
        u.safeTransferFrom(msg.sender, vault, amount);
        if (u.balanceOf(vault) - balBefore != amount) revert BadAmount();

        IFloorVault(vault).initialize(msg.sender, amount, floor_, maturity, assets_, weightsBps, abi.encode(defaults));
        emit PositionCreated(vault, msg.sender, amount, floor_, uint32(maturity), assets_, weightsBps);
    }

    /// @dev At the start E* = min(M * (D - F), D). If no token's target reaches `minTrade` the vault could never buy and the
    ///      deposit would sit in USDT for the whole term: reject it with a clear error instead (Pashov 03 lead).
    function _checkNotTooSmall(uint256 amount, uint256 floor_, uint16[] calldata w) internal view {
        uint256 estar = CPPIMath.exposureTarget(CPPIMath.cushion(amount, floor_), amount);
        uint256 minTrade = defaults.minTrade;
        for (uint256 i; i < w.length; ++i) {
            if (CPPIMath.assetTarget(estar, w[i]) >= minTrade) return;
        }
        revert PositionTooSmall();
    }

    /// @dev The pool must hold enough observation slots for the CURRENT `twapWindow` (Pashov 02 #13 and lead).
    function _requireHistory(address pool) internal view {
        (,,, uint16 cardinality,,,) = IPancakeV3Pool(pool).slot0();
        if (cardinality < _minCardinality(defaults.twapWindow)) revert OracleHistoryTooShort();
    }

    function _minCardinality(uint32 window) internal pure returns (uint256) {
        uint256 need = (uint256(window) * SLOTS_PER_4_SECONDS + 2) / 3; // ceil(window * 4 / 3)
        return need > MIN_CARDINALITY ? need : MIN_CARDINALITY;
    }

    function _checkBasket(address[] calldata a, uint16[] calldata w) internal view {
        uint256 n = a.length;
        if (n == 0 || n > 3) revert BadAssets();
        if (w.length != n) revert BadWeights();
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            if (!assets[a[i]].active) revert AssetNotActive(a[i]);
            _requireHistory(assets[a[i]].pool);
            for (uint256 j; j < i; ++j) {
                if (a[j] == a[i]) revert BadAssets();
            }
            if (w[i] == 0) revert BadWeights();
            sum += w[i];
        }
        if (sum != 10_000) revert BadWeights();
    }

    // =====================================================================
    // anyone
    // =====================================================================

    /// @inheritdoc IFloorFactory
    /// @dev Called by a vault when it closes. Releases that vault's deposit from `totalTvl` exactly once. Anyone else
    ///      (not a registered, unreleased vault) is a no-op, so this can never be used to lower the counter.
    function onPositionClosed() external override {
        uint256 d = liveDeposit[msg.sender];
        if (d == 0) return;
        liveDeposit[msg.sender] = 0;
        totalTvl -= d;
    }

    /// @inheritdoc IFloorFactory
    function pokeMultiplier(address token) external override {
        if (assets[token].pool == address(0)) revert AssetNotActive(token);
        uint256 m = ISecuritiesToken(token).uiMultiplier();
        uint256 old = lastMultiplier[token];
        if (m != old) {
            lastMultiplier[token] = m;
            lastMultiplierChange[token] = uint40(block.timestamp);
            emit MultiplierChanged(token, old, m);
        }
    }

    function positionsOf(address user) external view override returns (address[] memory) {
        return _byOwner[user];
    }

    function positionsCount() external view override returns (uint256) {
        return positions.length;
    }

    /// @inheritdoc IFloorFactory
    function isTradingOpen(uint256 ts) external view override returns (bool) {
        if (paused || halted) return false;
        return MarketHours.isOpen(ts, nonTradingDay);
    }

    /// @inheritdoc IFloorFactory
    function hasOpenSeconds(uint256 from, uint256 to, uint256 needed) external view override returns (bool) {
        if (from < tradingResumedAt) from = tradingResumedAt;
        return MarketHours.hasOpenSeconds(from, to, needed, nonTradingDay);
    }

    /// @inheritdoc IFloorFactory
    function routerOk(address router) external view override returns (bool ok, address approveTarget) {
        Router memory r = routers[router];
        ok = r.target != address(0) && !r.removed && block.timestamp >= r.activeAt;
        approveTarget = r.approveTarget;
    }

    // =====================================================================
    // keeper registry (owner)
    // =====================================================================

    function setKeeper(address who, bool on) external override onlyOwner {
        if (who == address(0)) revert ZeroAddress();
        isKeeper[who] = on;
        emit KeeperSet(who, on);
    }

    // =====================================================================
    // guardian (or owner where noted)
    // =====================================================================

    function pause() external override onlyGuardianOrOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external override onlyGuardianOrOwner {
        paused = false;
        tradingResumedAt = uint40(block.timestamp);
        emit Unpaused(msg.sender);
    }

    function setHalted(bool on) external override onlyGuardianOrOwner {
        halted = on;
        if (!on) tradingResumedAt = uint40(block.timestamp);
        emit Halted(on);
    }

    function setNonTradingDay(uint32 day, bool closed) external override onlyGuardian {
        nonTradingDay[day] = closed;
        emit NonTradingDaySet(day, closed);
    }

    /// @notice Declares how far the holiday table reaches. `createPosition` rejects a term that matures after it.
    function setHolidayHorizon(uint32 day) external onlyGuardian {
        holidayHorizonDay = day;
        emit HolidayHorizonSet(day);
    }

    function setNonTradingDays(uint32[] calldata days_, bool closed) external override onlyGuardian {
        for (uint256 i; i < days_.length; ++i) {
            nonTradingDay[days_[i]] = closed;
            emit NonTradingDaySet(days_[i], closed);
        }
    }

    /// @dev Removal is instant; a removed router is re-enabled only by a fresh `addRouter` with the 24 h delay.
    function removeRouter(address router) external override onlyGuardianOrOwner {
        if (routers[router].target == address(0)) revert RouterNotActive();
        routers[router].removed = true;
        emit RouterRemoved(router);
    }

    function disableAsset(address token) external override onlyGuardianOrOwner {
        if (assets[token].pool == address(0)) revert AssetNotActive(token);
        assets[token].active = false;
        emit AssetDisabled(token);
    }

    function approveTokenImpl(address impl) external override onlyGuardian {
        if (impl == address(0)) revert ZeroAddress();
        approvedTokenImpl = impl;
        emit TokenImplApproved(impl);
    }

    // =====================================================================
    // owner
    // =====================================================================

    /// @inheritdoc IFloorFactory
    /// @dev Checks (CONTRACTS.md section 11.1): 18 decimals, `getPool` matches, cardinality >= 200, `observe` works,
    ///      `uiMultiplier()` readable. A token can be listed ONCE: live vaults read pool, fee, `minLiquidity` and
    ///      `maxTradeValue` from here, so they can never be overwritten (A12 F-02, Pashov F-03). A disabled asset is
    ///      switched back on with `reenableAsset`, which keeps the stored parameters.
    function addAsset(address token, address pool, uint24 fee, uint128 minLiquidity, uint256 maxTradeValue)
        external
        override
        onlyOwner
    {
        if (token != address(0) && assets[token].pool != address(0)) revert AssetExists(token);
        bool usdtIsToken0 = _checkPool(token, pool, fee);
        _checkListing(fee, maxTradeValue);

        assets[token] = Asset(pool, fee, true, minLiquidity, maxTradeValue, usdtIsToken0);
        _assetList.push(token);
        // The baseline must be non-zero: a zero `lastMultiplier` would block the token forever.
        lastMultiplier[token] = _checkMultiplierGetters(token);
        emit AssetAdded(token, pool, fee);
    }

    /// @notice Switch a previously disabled asset back on with its ORIGINAL pool and limits, re-running the pool checks.
    ///         The multiplier is not touched (an unpoked change is still blocked and armed by `pokeMultiplier`).
    function reenableAsset(address token) external onlyOwner {
        Asset memory a = assets[token];
        if (a.pool == address(0) || a.active) revert AssetNotActive(token);
        _checkPool(token, a.pool, a.fee);
        _checkListing(a.fee, a.maxTradeValue);
        _checkMultiplierGetters(token);
        assets[token].active = true;
        emit AssetAdded(token, a.pool, a.fee);
    }

    /// @dev Listing checks shared by `addAsset` and `reenableAsset`, against the CURRENT defaults: a trade cap below
    ///      `minTrade` would make buys impossible, and a pool fee that the public tolerance cannot absorb would make
    ///      `rebalancePublic` swaps revert (Pashov 02 and 03 leads). NOTE: that the token is a beacon proxy of
    ///      `tokenBeacon` cannot be read on chain; the deploy preflight checks the EIP-1967 beacon slot of each token.
    function _checkListing(uint24 fee, uint256 maxTradeValue) internal view {
        if (maxTradeValue < defaults.minTrade || !DefaultsCheck.feeFits(fee, defaults.tolDirectBps)) revert BadPool();
    }

    /// @dev Every multiplier function the vault calls must be readable, and the multiplier non-zero.
    function _checkMultiplierGetters(address token) internal view returns (uint256 m) {
        ISecuritiesToken t = ISecuritiesToken(token);
        try t.uiMultiplier() returns (uint256 r) {
            if (r == 0) revert BadPool();
            m = r;
        } catch {
            revert BadPool();
        }
        try t.hasPendingMultiplier() returns (bool) {}
        catch {
            revert BadPool();
        }
        try t.effectiveAt() returns (uint256) {}
        catch {
            revert BadPool();
        }
    }

    function _checkPool(address token, address pool, uint24 fee) internal view returns (bool usdtIsToken0) {
        if (token == address(0) || pool == address(0)) revert ZeroAddress();
        if (IERC20Metadata(token).decimals() != 18) revert BadDecimals();
        if (IPancakeV3Factory(v3Factory).getPool(token, usdt, fee) != pool) revert BadPool();
        IPancakeV3Pool p = IPancakeV3Pool(pool);
        address t0 = p.token0();
        address t1 = p.token1();
        usdtIsToken0 = t0 == usdt;
        if (!((usdtIsToken0 && t1 == token) || (t0 == token && t1 == usdt))) revert BadPool();
        (,,, uint16 cardinality,,,) = p.slot0();
        if (cardinality < _minCardinality(defaults.twapWindow)) revert OracleHistoryTooShort();
        uint32[] memory ago = new uint32[](2);
        ago[0] = defaults.twapWindow;
        try p.observe(ago) returns (int56[] memory, uint160[] memory) {}
        catch {
            revert OracleHistoryTooShort();
        }
    }

    /// @dev Active after 24 h (CONTRACTS.md section 7). Constructor routers are the P2 exception.
    function addRouter(address target, address approveTarget) external override onlyOwner {
        if (target == address(0) || approveTarget == address(0)) revert ZeroAddress();
        // An existing (active or still pending) router cannot be overwritten: that would switch it off for 24 h.
        // A removed router can be re-added; the 24 h delay applies again.
        Router memory old = routers[target];
        if (old.target != address(0) && !old.removed) revert RouterExists(target);
        uint40 at = uint40(block.timestamp) + ROUTER_DELAY;
        routers[target] = Router(target, approveTarget, at, false);
        emit RouterAdded(target, approveTarget, at);
    }

    function setGuardian(address g) external override onlyOwner {
        if (g == address(0)) revert ZeroAddress();
        guardian = g;
        emit GuardianSet(g);
    }

    /// @dev New positions only (CONTRACTS.md section 9: economic parameters are copied at creation).
    function setDefaults(Defaults calldata d) external override onlyOwner {
        _checkDefaults(d);
        defaults = d;
        emit DefaultsSet(d);
    }

    function setLimits(uint256 maxDeposit_, uint256 maxTotalTvl_) external override onlyOwner {
        if (maxDeposit_ == 0 || maxDeposit_ > maxTotalTvl_) revert BadLimits();
        maxDeposit = maxDeposit_;
        maxTotalTvl = maxTotalTvl_;
        emit LimitsSet(maxDeposit_, maxTotalTvl_);
    }

    /// @notice One-shot. Sets the shared bStock beacon and the approved implementation (CONTRACTS.md section 9).
    /// @dev DEVIATION: the frozen constructor has no beacon parameters, so the deploy script calls this once.
    ///      The guardian can later re-approve a new implementation with `approveTokenImpl`.
    function setTokenBeacon(address beacon, address impl) external onlyOwner {
        if (tokenBeacon != address(0)) revert BeaconAlreadySet();
        if (beacon == address(0) || impl == address(0)) revert ZeroAddress();
        tokenBeacon = beacon;
        approvedTokenImpl = impl;
        emit TokenImplApproved(impl);
    }

    function transferOwnership(address newOwner) external override onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external override {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // =====================================================================
    // internals
    // =====================================================================

    /// @dev Bounds on every economic default (`DefaultsCheck`, shared with the deploy preflight), plus: the new tolerance
    ///      must absorb every LISTED pool fee and the new `minTrade` must not exceed any listed trade cap.
    function _checkDefaults(Defaults memory d) internal view {
        if (bytes(DefaultsCheck.reason(d)).length != 0) revert BadDefaults();
        uint256 n = _assetList.length;
        for (uint256 i; i < n; ++i) {
            Asset storage a = assets[_assetList[i]];
            if (!DefaultsCheck.feeFits(a.fee, d.tolDirectBps) || a.maxTradeValue < d.minTrade) revert BadDefaults();
        }
    }
}
