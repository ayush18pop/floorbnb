// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Honest swap router for tests. Pulls `tokenIn` from the caller, pays `tokenOut` to `recipient` from its own
///         inventory (fund it with `MockToken.mint`). Adversarial variants live in test/mocks/evil (A07).
contract MockRouter {
    /// @dev rate[tokenIn][tokenOut]: tokenOut per 1e18 tokenIn, WAD.
    mapping(address => mapping(address => uint256)) public rate;
    uint256 public feeBps;

    function setRate(address tokenIn, address tokenOut, uint256 rateWad) external {
        rate[tokenIn][tokenOut] = rateWad;
    }

    function setFeeBps(uint256 bps) external {
        feeBps = bps;
    }

    /// @notice Exact amounts: take `amountIn`, pay `amountOut`.
    function swapExact(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address recipient)
        external
    {
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "IN");
        require(IERC20(tokenOut).transfer(recipient, amountOut), "OUT");
    }

    /// @notice Priced by `rate` minus `feeBps`.
    function swap(address tokenIn, address tokenOut, uint256 amountIn, address recipient)
        external
        returns (uint256 amountOut)
    {
        amountOut = (amountIn * rate[tokenIn][tokenOut] / 1e18) * (10_000 - feeBps) / 10_000;
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "IN");
        require(IERC20(tokenOut).transfer(recipient, amountOut), "OUT");
    }
}
