// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The subset of a PancakeSwap v3 pool that Floor reads. Spec: docs/CONTRACTS.md sections 2 and 3.
/// @dev Pancake's `slot0` has the same seven fields as the cast signature in CONTRACTS.md section 2.
interface IPancakeV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function liquidity() external view returns (uint128);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint32 feeProtocol,
            bool unlocked
        );
    /// @notice Reverts (`OLD`) when the requested history is longer than the pool's oracle history.
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
}
