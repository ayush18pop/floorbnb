// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

interface IPancakeRouter {
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

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256);
}

/// @notice Spike only. Stands in for the vault as a swap taker: approve exactly amountIn, call router, record deltas.
/// @dev OUT OF DEPLOY SCOPE: throwaway research contract, never deployed to mainnet (docs/AUDIT.md scope is
///      packages/contracts only). Hardened anyway after Pashov 02 findings 1-3: owner-only, no zero minOut, and the
///      call target cannot be one of the swapped tokens.
contract TakerProbe {
    event Result(uint256 inSpent, uint256 outGot);

    address public immutable owner = msg.sender;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function execAggregator(address tokenIn, address tokenOut, address approveTarget, address router, uint256 amountIn, bytes calldata data)
        external
        onlyOwner
        returns (uint256 inSpent, uint256 outGot)
    {
        require(router != tokenIn && router != tokenOut, "bad router");
        uint256 i0 = IERC20(tokenIn).balanceOf(address(this));
        uint256 o0 = IERC20(tokenOut).balanceOf(address(this));
        IERC20(tokenIn).approve(approveTarget, amountIn);
        (bool ok, bytes memory ret) = router.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        IERC20(tokenIn).approve(approveTarget, 0);
        inSpent = i0 - IERC20(tokenIn).balanceOf(address(this));
        outGot = IERC20(tokenOut).balanceOf(address(this)) - o0;
        emit Result(inSpent, outGot);
    }

    function execPancake(address router, address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 minOut)
        external
        onlyOwner
        returns (uint256 outGot)
    {
        require(minOut > 0, "minOut");
        IERC20(tokenIn).approve(router, amountIn);
        outGot = IPancakeRouter(router).exactInputSingle(
            IPancakeRouter.ExactInputSingleParams(tokenIn, tokenOut, fee, address(this), block.timestamp, amountIn, minOut, 0)
        );
        IERC20(tokenIn).approve(router, 0);
    }

    function send(address token, address to, uint256 amt) external onlyOwner {
        IERC20(token).transfer(to, amt);
    }
}
