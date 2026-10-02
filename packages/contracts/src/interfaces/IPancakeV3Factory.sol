// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The subset of the PancakeSwap v3 factory that Floor reads (`addAsset` pool check).
interface IPancakeV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}
