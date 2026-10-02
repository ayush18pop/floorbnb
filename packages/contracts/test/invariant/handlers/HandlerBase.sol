// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorVault} from "../../../src/FloorVault.sol";
import {System} from "./System.sol";

/// @dev Shared helpers and ghost state for the three handlers. Written from CONTRACTS.md section 12, not from the
///      vault code: window, guards and bounds are recomputed here independently.
abstract contract HandlerBase is Test {
    System public sys;
    address internal constant THIEF = address(0x7417F);

    /// @dev Any non-zero entry means an invariant was observed broken during a handler call.
    mapping(bytes32 => uint256) public violations;
    bytes32[] public violationKeys;
    mapping(bytes32 => uint256) public counts;

    constructor(System s) {
        sys = s;
    }

    function _violate(bytes32 key) internal {
        if (violations[key]++ == 0) violationKeys.push(key);
    }

    function _count(bytes32 key) internal {
        counts[key]++;
    }

    function vaultAt(uint256 i) public view returns (FloorVault) {
        return i % 2 == 0 ? sys.vaultA() : sys.vaultB();
    }

    function otherVault(FloorVault v) public view returns (FloorVault) {
        return address(v) == address(sys.vaultA()) ? sys.vaultB() : sys.vaultA();
    }

    function tokens() public view returns (IERC20[3] memory t) {
        t[0] = IERC20(address(sys.usdt()));
        t[1] = IERC20(address(sys.stock1()));
        t[2] = IERC20(address(sys.stock2()));
    }

    struct Snap {
        uint256[3] bal;
    }

    function _snap(address who) internal view returns (Snap memory s) {
        IERC20[3] memory t = tokens();
        for (uint256 i; i < 3; ++i) {
            s.bal[i] = t[i].balanceOf(who);
        }
    }

    function _same(Snap memory a, Snap memory b) internal pure returns (bool) {
        return a.bal[0] == b.bal[0] && a.bal[1] == b.bal[1] && a.bal[2] == b.bal[2];
    }

    /// @dev Independent recomputation of CONTRACTS.md section 6 (not calling MarketHours or the factory view).
    function _windowOpen(uint256 ts) internal view returns (bool) {
        if (((ts / 1 days) + 3) % 7 >= 5) return false;
        uint256 s = ts % 1 days;
        if (s < 15 hours + 30 minutes || s >= 19 hours + 30 minutes) return false;
        if (sys.factory().nonTradingDay(uint32(ts / 1 days))) return false;
        if (sys.factory().paused() || sys.factory().halted()) return false;
        return true;
    }

    function _thiefBalance() internal view returns (uint256 total) {
        IERC20[3] memory t = tokens();
        for (uint256 i; i < 3; ++i) {
            total += t[i].balanceOf(THIEF);
        }
    }
}
