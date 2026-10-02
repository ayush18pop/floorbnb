// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IFloorVault} from "../interfaces/IFloorVault.sol";

/// @title SwapGuard
/// @notice Runs one router call and proves from balance deltas that the vault was not cheated.
///         Spec: docs/CONTRACTS.md section 8 ("Vault execution procedure"), invariants I1, I2, I11.
/// @dev Library functions are `internal`, so everything runs in the vault's context (the vault is the token holder).
library SwapGuard {
    using SafeERC20 for IERC20;

    struct Call {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minOut;
        address router; // address that receives `data` (value = 0)
        address approveTarget; // address that gets the exact allowance (usually == router)
        bytes data;
    }

    /// @notice Execute `c`. `tracked` = every token the vault holds that counts (USDT and each asset), which must
    ///         contain `c.tokenIn` and `c.tokenOut`.
    /// @return spent tokenIn actually taken (<= amountIn)
    /// @return received tokenOut actually received (>= minOut)
    function exec(Call memory c, address[] memory tracked) internal returns (uint256 spent, uint256 received) {
        uint256 n = tracked.length;
        // 1. router must not be one of the tokens we hold (calldata is keeper-chosen, a token call would be a transfer).
        for (uint256 i; i < n; ++i) {
            if (tracked[i] == c.router) revert IFloorVault.RouterNotAllowed();
        }

        // 2. snapshot
        uint256[] memory before_ = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            before_[i] = IERC20(tracked[i]).balanceOf(address(this));
        }

        // 3. exact approve, never unlimited
        IERC20(c.tokenIn).forceApprove(c.approveTarget, c.amountIn);

        // 4. call with value 0, revert on failure
        (bool ok,) = c.router.call(c.data);
        if (!ok) revert IFloorVault.SwapFailed();

        // 5. approval back to zero (I11)
        IERC20(c.tokenIn).forceApprove(c.approveTarget, 0);

        // 6. balance deltas on EVERY tracked token
        for (uint256 i; i < n; ++i) {
            address t = tracked[i];
            uint256 afterBal = IERC20(t).balanceOf(address(this));
            uint256 b = before_[i];
            if (t == c.tokenIn) {
                if (afterBal > b) revert IFloorVault.TokenInSpentTooMuch(); // tokenIn must not grow
                spent = b - afterBal;
                if (spent > c.amountIn) revert IFloorVault.TokenInSpentTooMuch();
            } else if (t == c.tokenOut) {
                received = afterBal > b ? afterBal - b : 0;
                if (received < c.minOut) revert IFloorVault.MinOutNotMet(received, c.minOut);
            } else if (afterBal < b) {
                revert IFloorVault.OtherBalanceDecreased(t);
            }
        }
    }
}
