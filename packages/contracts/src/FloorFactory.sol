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

/// @title FloorFactory
/// @notice Roles, config, allowlists and EIP-1167 clone creation for Floor positions. Holds no funds.
/// @dev Spec: docs/CONTRACTS.md sections 6, 7 and 11.1, plus EXECUTION_PLAN P2 (constructor routers), P5 (launch
///      caps) and P6 (`minTrade` bounds allow 1e18 and up). Economic parameters are copied into each clone at
///      creation (`abi.encode(defaults)`), so later `setDefaults` calls never touch existing positions.
contract FloorFactory is IFloorFactory {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------- constants

    /// @dev CONTRACTS.md section 11.1 `createPosition`: floorBps in [5000, 9800].
    uint16 internal constant MIN_FLOOR_BPS = 5000;
    uint16 internal constant MAX_FLOOR_BPS = 9800;
    /// @dev CONTRACTS.md section 11.1: term 7..400 days.
    uint32 internal constant MIN_TERM = 7 days;
    uint32 internal constant MAX_TERM = 400 days;
    /// @dev CONTRACTS.md section 3: oracle history guard.
    uint16 internal constant MIN_CARDINALITY = 200;
    /// @dev CONTRACTS.md section 7: routers added after deploy are active after 24 h.
    uint40 internal constant ROUTER_DELAY = 24 hours;
    /// @dev EXECUTION_PLAN P5 launch caps (USDT, 18 decimals).
    uint256 internal constant LAUNCH_MAX_DEPOSIT = 1000e18;
    uint256 internal constant LAUNCH_MAX_TOTAL_TVL = 5000e18;

    /// @dev Local errors (not in the frozen interface).
    error BadAmount();
    error BadDefaults();
    error LengthMismatch();
    error BadLimits();
    error NotPendingOwner();
    error NotOwnerOrGuardian();
    error BeaconAlreadySet();

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
    /// @dev Cumulative USDT deposited into positions (a launch cap on lifetime deposits; it does not decrease when a
    ///      position closes because vaults have no callback into the factory).
    uint256 public override totalTvl;
    mapping(address => uint256) public override lastMultiplier;
    mapping(address => uint40) public override lastMultiplierChange;
    address[] public override positions;
    mapping(address => address[]) internal _byOwner;

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
        if (paused) revert PausedErr();
        if (amount == 0) revert BadAmount();
        if (amount > maxDeposit) revert DepositTooLarge();
        if (totalTvl + amount > maxTotalTvl) revert TvlCapReached();
        if (floorBps < MIN_FLOOR_BPS || floorBps > MAX_FLOOR_BPS) revert BadFloor();
        if (termSeconds < MIN_TERM || termSeconds > MAX_TERM) revert BadTerm();
        _checkBasket(assets_, weightsBps);

        totalTvl += amount;
        uint256 floor_ = CPPIMath.floorFor(amount, floorBps);
        uint40 maturity = uint40(block.timestamp + termSeconds);

        vault = Clones.clone(vaultImplementation);
        positions.push(vault);
        _byOwner[msg.sender].push(vault);

        IERC20 u = IERC20(usdt);
        uint256 balBefore = u.balanceOf(vault);
        u.safeTransferFrom(msg.sender, vault, amount);
        if (u.balanceOf(vault) - balBefore != amount) revert BadAmount();

        IFloorVault(vault).initialize(msg.sender, amount, floor_, maturity, assets_, weightsBps, abi.encode(defaults));
        emit PositionCreated(vault, msg.sender, amount, floor_, uint32(maturity), assets_, weightsBps);
    }

    function _checkBasket(address[] calldata a, uint16[] calldata w) internal view {
        uint256 n = a.length;
        if (n == 0 || n > 3) revert BadAssets();
        if (w.length != n) revert BadWeights();
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            if (!assets[a[i]].active) revert AssetNotActive(a[i]);
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
        emit Unpaused(msg.sender);
    }

    function setHalted(bool on) external override onlyGuardianOrOwner {
        halted = on;
        emit Halted(on);
    }

    function setNonTradingDay(uint32 day, bool closed) external override onlyGuardian {
        nonTradingDay[day] = closed;
        emit NonTradingDaySet(day, closed);
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
    /// @dev Checks (CONTRACTS.md section 11.1): 18 decimals, `getPool` matches, cardinality >= 200, `observe` works.
    ///      Re-adding a disabled asset re-runs every check.
    function addAsset(address token, address pool, uint24 fee, uint128 minLiquidity, uint256 maxTradeValue)
        external
        override
        onlyOwner
    {
        if (token == address(0) || pool == address(0)) revert ZeroAddress();
        if (maxTradeValue == 0) revert BadPool();
        if (IERC20Metadata(token).decimals() != 18) revert BadDecimals();
        if (IPancakeV3Factory(v3Factory).getPool(token, usdt, fee) != pool) revert BadPool();
        IPancakeV3Pool p = IPancakeV3Pool(pool);
        address t0 = p.token0();
        address t1 = p.token1();
        bool usdtIsToken0 = t0 == usdt;
        if (!((usdtIsToken0 && t1 == token) || (t0 == token && t1 == usdt))) revert BadPool();
        (,,, uint16 cardinality,,,) = p.slot0();
        if (cardinality < MIN_CARDINALITY) revert OracleHistoryTooShort();
        uint32[] memory ago = new uint32[](2);
        ago[0] = defaults.twapWindow;
        try p.observe(ago) returns (int56[] memory, uint160[] memory) {}
        catch {
            revert OracleHistoryTooShort();
        }

        assets[token] = Asset(pool, fee, true, minLiquidity, maxTradeValue, usdtIsToken0);
        try ISecuritiesToken(token).uiMultiplier() returns (uint256 m) {
            lastMultiplier[token] = m;
        } catch {}
        emit AssetAdded(token, pool, fee);
    }

    /// @dev Active after 24 h (CONTRACTS.md section 7). Constructor routers are the P2 exception.
    function addRouter(address target, address approveTarget) external override onlyOwner {
        if (target == address(0) || approveTarget == address(0)) revert ZeroAddress();
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

    /// @dev Bounds on every economic default. `minTrade` allows 1e18 and up (P6 demo needs 6e18).
    function _checkDefaults(Defaults memory d) internal pure {
        if (
            d.sellBandBps == 0 || d.sellBandBps > 1000 || d.buyBandBps == 0 || d.buyBandBps > 1000
                || d.minInterval > 1 days || d.publicDelay < 1 hours || d.publicDelay > 7 days || d.twapWindow < 60
                || d.twapWindow > 1 hours || d.maxTickDev < 10 || d.maxTickDev > 1000 || d.tolAggBps == 0
                || d.tolAggBps > 500 || d.tolDirectBps == 0 || d.tolDirectBps > 500 || d.minTrade < 1e18
                || d.minTrade > 1000e18 || d.dust > 100e18
        ) revert BadDefaults();
    }
}
