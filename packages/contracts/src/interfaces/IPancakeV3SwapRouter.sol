// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice PancakeSwap v3 SwapRouter (BSC `0x1b81D678ffb9C0263b24A97847620C99d213eB14`), the direct route.
/// @dev The struct below is the OLD SwapRouter layout WITH `deadline` (CONTRACTS.md section 13). That it matches the
///      deployed code is **unverified until the A02 spike answers Q9** (`cast sig` against the live router).
///      If A02 finds a different layout, change this file with the manager's sign-off (interfaces are frozen).
interface IPancakeV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
    function factory() external view returns (address);
}
