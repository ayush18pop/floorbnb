// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IFloorVault
/// @notice One position: custody, CPPI, guarded swaps, exit. Deployed as an EIP-1167 clone by the factory.
/// @dev Spec: docs/CONTRACTS.md sections 5, 7, 8, 9 and 11.2. Amounts are 18-decimal WAD (USDT and bStocks).
interface IFloorVault {
    // ------------------------------------------------------------------ types

    enum Status {
        Active,
        Closing,
        Closed
    }

    /// @notice One swap per call. The keeper chooses only these five fields; the vault re-validates all of them.
    struct Swap {
        uint8 assetIdx;
        bool buy;
        uint256 amountIn;
        address router;
        bytes data;
    }

    // ----------------------------------------------------------------- events

    event Initialized(address indexed owner, uint256 deposit, uint256 floor, uint40 maturity);
    event Rebalanced(
        uint8 indexed assetIdx,
        bool buy,
        uint256 amountIn,
        uint256 amountOut,
        uint256 V,
        uint256 exposureTarget,
        address indexed router,
        address caller
    );
    event CloseRequested();
    event Closed(address indexed to, uint256 usdtOut);
    event ExitInKind(address indexed to, uint256 usdtOut, address[] skipped);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    // ----------------------------------------------------------------- errors

    error NotKeeper();
    error NotOwner();
    error NotFactory();
    error AlreadyInitialized();
    error TradingClosed();
    error NoTradeNeeded();
    error WrongDirection();
    error AmountOutOfRange();
    error TooSoon();
    error PublicTooEarly();
    error RouterNotAllowed();
    error SwapFailed();
    error MinOutNotMet(uint256 got, uint256 min);
    error TokenInSpentTooMuch();
    error OtherBalanceDecreased(address token);
    error PriceDeviation();
    error OracleHistoryTooShort();
    error PoolIlliquid();
    error TokenImplChanged();
    error MultiplierTransition();
    error StockNotUnwound();
    error NotClosed();

    // ------------------------------------------------------------- initialise

    /// @notice Factory only, once. Disabled on the implementation contract.
    /// @param cfg abi.encode(IFloorFactory.Defaults), the economic parameters at creation time.
    function initialize(
        address owner_,
        uint256 deposit_,
        uint256 floor_,
        uint40 maturity_,
        address[] calldata assets_,
        uint16[] calldata weightsBps_,
        bytes calldata cfg
    ) external;

    // ------------------------------------------- keeper path (aggregator calldata)

    /// @notice Only `factory.isKeeper(msg.sender)`. Reverts unless the trade is rule-valid, in the trading window,
    ///         and the balance deltas hold.
    function rebalance(Swap calldata s) external;

    // ----------------------------- permissionless fallback (direct Pancake v3)

    /// @notice Anyone, no calldata. Direct pool route via the factory's `v3SwapRouter`, after `publicDelay` idle time.
    function rebalancePublic(uint8 assetIdx) external;

    // ------------------------------------------------------------------- user

    /// @notice Owner: sets Closing.
    function requestClose() external;
    /// @notice Owner: needs stock value <= dust. Sends all USDT to the owner.
    function closeToUSDT() external;
    /// @notice Owner: always allowed. Sends USDT and every movable bStock to `to`; a paused token is skipped.
    function exitInKind(address to) external;
    /// @notice Owner: only when Closed. Recovers any token left behind.
    function rescue(address token, address to) external;

    // ------------------------------------------------------------------ views

    /// @notice TWAP valuation. Reverts if oracle checks fail.
    function valuation() external view returns (uint256 V, uint256 usdtBal, uint256[3] memory stockValue);
    function targets() external view returns (uint256 cushion, uint256 exposureTarget, uint256[3] memory target);
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
        );
    /// @notice V at TWAP; informational.
    function claimValue() external view returns (uint256);

    // ------------------------------------------------- public storage getters

    function factory() external view returns (address);
    function owner() external view returns (address);
    function deposit() external view returns (uint256);
    /// @notice F in USDT WAD, rounded up.
    function floor() external view returns (uint256);
    function start() external view returns (uint40);
    function maturity() external view returns (uint40);
    function nAssets() external view returns (uint8);
    function assetAt(uint256 i) external view returns (address);
    function weightBps(uint256 i) external view returns (uint16);
    function sellBandBps() external view returns (uint16);
    function buyBandBps() external view returns (uint16);
    function minInterval() external view returns (uint32);
    function publicDelay() external view returns (uint32);
    function twapWindow() external view returns (uint32);
    function maxTickDev() external view returns (uint16);
    function tolAggBps() external view returns (uint16);
    function tolDirectBps() external view returns (uint16);
    function minTrade() external view returns (uint256);
    function dust() external view returns (uint256);
    function M() external view returns (uint256);
    function status() external view returns (Status);
    function lastRebalance() external view returns (uint40);
    function lastTradeAt(uint8 assetIdx) external view returns (uint40);
}
