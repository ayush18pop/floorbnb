// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IFloorFactory
/// @notice Roles, config, allowlists, clone creation and global limits. Holds no funds.
/// @dev Spec: docs/CONTRACTS.md section 11.1, plus EXECUTION_PLAN P2.
///
/// CONSTRUCTOR (cannot be declared in an interface; the implementation must match this signature, EXECUTION_PLAN P2):
///
///     constructor(
///         address owner_, address guardian_, address usdt_, address v3Factory_, address v3SwapRouter_,
///         address vaultImplementation_, Defaults memory defaults_,
///         address[] memory initialRouters, address[] memory initialApproveTargets
///     )
///
/// `initialRouters[i]` is allowlisted with `initialApproveTargets[i]` and is ACTIVE AT DEPLOY (activeAt = block.timestamp).
/// The lengths must match. Routers added later with `addRouter` keep the 24 h delay.
/// The Pancake v3 SwapRouter (`v3SwapRouter`) must be among the initial routers (P2).
interface IFloorFactory {
    // ------------------------------------------------------------------ types

    /// @notice Economic parameters copied into each new position's vault (abi.encode(Defaults) is the `cfg` blob
    ///         passed to `IFloorVault.initialize`).
    struct Defaults {
        uint16 sellBandBps; // default 100
        uint16 buyBandBps; // default 200
        uint32 minInterval; // seconds, default 900
        uint32 publicDelay; // seconds, default 14400
        uint32 twapWindow; // seconds, default 600
        uint16 maxTickDev; // default 300
        uint16 tolAggBps; // default 30
        uint16 tolDirectBps; // default 100
        uint256 minTrade; // USDT WAD, bounds-checked; allows 1e18 and up
        uint256 dust; // USDT WAD
    }

    /// @notice Per-bStock configuration (getter tuple order of `assets(address)`).
    struct Asset {
        address pool;
        uint24 fee;
        bool active;
        uint128 minLiquidity;
        uint256 maxTradeValue;
        bool usdtIsToken0;
    }

    /// @notice Router allowlist entry (getter tuple order of `routers(address)`).
    struct Router {
        address target;
        address approveTarget;
        uint40 activeAt;
        bool removed;
    }

    // ----------------------------------------------------------------- events

    event PositionCreated(
        address indexed vault,
        address indexed owner,
        uint256 deposit,
        uint256 floor,
        uint32 maturity,
        address[] assets,
        uint16[] weights
    );
    event KeeperSet(address indexed who, bool on);
    event Paused(address by);
    event Unpaused(address by);
    event Halted(bool on);
    event NonTradingDaySet(uint32 indexed day, bool closed);
    event AssetAdded(address indexed token, address pool, uint24 fee);
    event AssetDisabled(address indexed token);
    event RouterAdded(address indexed target, address approveTarget, uint40 activeAt);
    event RouterRemoved(address indexed target);
    event TokenImplApproved(address indexed impl);
    event MultiplierChanged(address indexed token, uint256 oldM, uint256 newM);
    event DefaultsSet(Defaults d);
    event LimitsSet(uint256 maxDeposit, uint256 maxTotalTvl);
    event GuardianSet(address indexed guardian);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ----------------------------------------------------------------- errors

    error NotOwner();
    error NotGuardian();
    error PausedErr();
    error DepositTooLarge();
    error TvlCapReached();
    error BadFloor();
    error BadTerm();
    error BadAssets();
    error BadWeights();
    error AssetNotActive(address token);
    error RouterNotActive();
    error RouterDelayTooShort();
    error BadPool();
    error BadDecimals();
    error OracleHistoryTooShort();
    error ZeroAddress();
    error AssetExists(address token);
    error RouterExists(address router);

    // ------------------------------------------------------------------- user

    /// @notice Pull `amount` USDT from msg.sender, clone a vault, initialise it. msg.sender owns the position.
    /// @param amount USDT (18 decimals). The caller approves the factory beforehand, for exactly this amount.
    /// @param floorBps floor as bps of deposit, range [5000, 9800]
    /// @param termSeconds 7..400 days (launch: 365 days)
    /// @param assets_ 1..3 allowlisted bStocks, no duplicates
    /// @param weightsBps same length as `assets_`, sum == 10_000
    /// @return vault the new vault clone. The vault address is the position id.
    function createPosition(
        uint256 amount,
        uint16 floorBps,
        uint32 termSeconds,
        address[] calldata assets_,
        uint16[] calldata weightsBps
    ) external returns (address vault);

    // ----------------------------------------------------------------- anyone

    /// @notice Records a `uiMultiplier` change for `token` (CONTRACTS.md section 4, MultiplierWatch).
    function pokeMultiplier(address token) external;
    /// @notice Called by a vault when it closes; releases its deposit from `totalTvl` once. No-op for anyone else.
    function onPositionClosed() external;
    function positionsOf(address user) external view returns (address[] memory);
    function positionsCount() external view returns (uint256);
    /// @notice MarketHours.isOpen(ts) and not paused and not halted.
    function isTradingOpen(uint256 ts) external view returns (bool);
    /// @notice Whether `router` is allowlisted, active and not removed, and the address to approve for it.
    function routerOk(address router) external view returns (bool ok, address approveTarget);

    // ----------------------------------------------------------- keeper registry

    function setKeeper(address who, bool on) external; // owner

    // --------------------------------------------------------------- guardian

    function pause() external; // guardian or owner
    function unpause() external; // guardian or owner
    function setHalted(bool on) external; // guardian or owner
    function setNonTradingDay(uint32 day, bool closed) external; // guardian
    function setNonTradingDays(uint32[] calldata days_, bool closed) external; // guardian
    function removeRouter(address router) external; // guardian or owner
    function disableAsset(address token) external; // guardian or owner
    function approveTokenImpl(address impl) external; // guardian

    // ------------------------------------------------------------------ owner

    function addAsset(address token, address pool, uint24 fee, uint128 minLiquidity, uint256 maxTradeValue) external;
    /// @notice Active after 24 h.
    function addRouter(address target, address approveTarget) external;
    function setGuardian(address g) external;
    /// @notice New positions only; bounds-checked.
    function setDefaults(Defaults calldata d) external;
    function setLimits(uint256 maxDeposit_, uint256 maxTotalTvl_) external;
    function transferOwnership(address newOwner) external;
    function acceptOwnership() external;

    // ------------------------------------------------- public storage getters

    function owner() external view returns (address);
    function pendingOwner() external view returns (address);
    function guardian() external view returns (address);
    function isKeeper(address who) external view returns (bool);
    function paused() external view returns (bool);
    function halted() external view returns (bool);
    /// @param day unix timestamp / 86400
    function nonTradingDay(uint32 day) external view returns (bool);
    function vaultImplementation() external view returns (address);
    function usdt() external view returns (address);
    function v3Factory() external view returns (address);
    function v3SwapRouter() external view returns (address);
    function tokenBeacon() external view returns (address);
    function approvedTokenImpl() external view returns (address);
    function assets(address token)
        external
        view
        returns (address pool, uint24 fee, bool active, uint128 minLiquidity, uint256 maxTradeValue, bool usdtIsToken0);
    function routers(address router)
        external
        view
        returns (address target, address approveTarget, uint40 activeAt, bool removed);
    function defaults()
        external
        view
        returns (
            uint16 sellBandBps,
            uint16 buyBandBps,
            uint32 minInterval,
            uint32 publicDelay,
            uint32 twapWindow,
            uint16 maxTickDev,
            uint16 tolAggBps,
            uint16 tolDirectBps,
            uint256 minTrade,
            uint256 dust
        );
    function maxDeposit() external view returns (uint256);
    function maxTotalTvl() external view returns (uint256);
    function totalTvl() external view returns (uint256);
    function lastMultiplier(address token) external view returns (uint256);
    function lastMultiplierChange(address token) external view returns (uint40);
    function positions(uint256 index) external view returns (address);
}
