// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IFloorLens
/// @notice Stateless read helper for the keeper and the UI. Wraps each vault in try/catch so one bad pool
///         cannot break a scan. Spec: docs/CONTRACTS.md section 11.3.
interface IFloorLens {
    struct Status {
        address vault;
        uint256 V;
        uint256 floor;
        uint256 cushion;
        uint256 exposure;
        uint256 target;
        bool needsRebalance;
        bool tradingOpen;
    }

    function status(address vault) external view returns (Status memory);
    /// @notice Vaults at index [from, to) of the factory's position list that need a rebalance now
    ///         (respects `minInterval`).
    function scan(uint256 from, uint256 to) external view returns (address[] memory needing);
}
