// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MockToken} from "../MockToken.sol";

/// @dev Mock bStock that anyone can pull from any holder (models a hidden transfer hook or a rebasing bug).
contract LeakyMockToken is MockToken {
    constructor(string memory n, string memory s) MockToken(n, s) {}

    function steal(address from, address to, uint256 a) external {
        // bypass pause and blocklist on purpose
        ERC20._update(from, to, a);
    }
}

interface IVaultLike {
    function exitInKind(address to) external;
    function rebalancePublic(uint8 i) external;
    function closeToUSDT() external;
}

/// @notice Hostile router. The vault calls `execute` with a `mode`; every mode tries to hurt the vault.
/// @dev Spec: CONTRACTS.md section 12 SwapGuard list (a) to (f). Fund it with both tokens before use.
contract EvilRouter {
    enum Mode {
        TakeMore, // 0: pull amountIn + 1 (more than approved)
        ShortChange, // 1: pay 90% of fair
        PayThird, // 2: pay fair output to a third address
        StealOther, // 3: honest swap, then steal a LeakyMockToken from the vault
        ReenterExit, // 4: call vault.exitInKind mid-swap
        ReenterPublic, // 5: call vault.rebalancePublic mid-swap
        WithinTolerance, // 6: pay 99.8% of fair (inside the 30 bps tolerance)
        Honest, // 7: pay fair
        PullOtherToken, // 8: try to pull the whole balance of an unrelated token
        HalfFill, // 9: take half, pay half of fair
        NoPay, // 10: take amountIn, pay nothing
        UnderPull // 11: take only half of the approved amount but pay full fair output (leaves allowance behind)
    }

    uint256 internal constant N_MODES = 12;
    address public leaky;

    function setLeaky(address t) external {
        leaky = t;
    }

    function modes() external pure returns (uint256) {
        return N_MODES;
    }

    function execute(uint8 mode, address tin, address tout, uint256 amountIn, uint256 fairOut, address third) external {
        Mode m = Mode(mode % uint8(N_MODES));
        if (m == Mode.TakeMore) {
            IERC20(tin).transferFrom(msg.sender, address(this), amountIn + 1);
            IERC20(tout).transfer(msg.sender, fairOut);
        } else if (m == Mode.ShortChange) {
            _pull(tin, amountIn);
            IERC20(tout).transfer(msg.sender, fairOut * 90 / 100);
        } else if (m == Mode.PayThird) {
            _pull(tin, amountIn);
            IERC20(tout).transfer(third, fairOut);
        } else if (m == Mode.StealOther) {
            _pull(tin, amountIn);
            IERC20(tout).transfer(msg.sender, fairOut);
            if (leaky != address(0)) {
                uint256 b = IERC20(leaky).balanceOf(msg.sender);
                if (b > 0) LeakyMockToken(leaky).steal(msg.sender, address(this), b > 1 ? b / 2 : b);
            }
        } else if (m == Mode.ReenterExit) {
            IVaultLike(msg.sender).exitInKind(address(this));
        } else if (m == Mode.ReenterPublic) {
            IVaultLike(msg.sender).rebalancePublic(0);
        } else if (m == Mode.WithinTolerance) {
            _pull(tin, amountIn);
            IERC20(tout).transfer(msg.sender, fairOut * 9980 / 10_000);
        } else if (m == Mode.Honest) {
            _pull(tin, amountIn);
            IERC20(tout).transfer(msg.sender, fairOut);
        } else if (m == Mode.PullOtherToken) {
            address other = tin == leaky ? tout : leaky;
            if (other != address(0)) {
                IERC20(other).transferFrom(msg.sender, address(this), IERC20(other).balanceOf(msg.sender));
            }
            _pull(tin, amountIn);
            IERC20(tout).transfer(msg.sender, fairOut);
        } else if (m == Mode.HalfFill) {
            _pull(tin, amountIn / 2);
            IERC20(tout).transfer(msg.sender, fairOut / 2);
        } else if (m == Mode.UnderPull) {
            _pull(tin, amountIn / 2);
            IERC20(tout).transfer(msg.sender, fairOut);
        } else {
            _pull(tin, amountIn);
        }
    }

    function _pull(address t, uint256 a) internal {
        IERC20(t).transferFrom(msg.sender, address(this), a);
    }
}
