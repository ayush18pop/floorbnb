// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AuditBase} from "./AuditBase.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {MockPool} from "../mocks/MockPool.sol";

/// @dev bStock after a hostile (or buggy) beacon upgrade: `balanceOf` burns every unit of gas it is given.
contract GasBurnerToken is MockToken {
    bool public burn;

    constructor(string memory n, string memory s) MockToken(n, s) {}

    function setBurn(bool on) external {
        burn = on;
    }

    function balanceOf(address a) public view override returns (uint256) {
        if (burn) {
            assembly {
                invalid()
            }
        }
        return super.balanceOf(a);
    }
}

/// @dev bStock whose beacon implementation was pointed at an address without code (or a contract with a catch-all
///      fallback): `balanceOf` succeeds and returns zero bytes. Solidity reverts in the CALLER when a `try` call's
///      return data cannot be decoded, and `catch` does not absorb that.
contract EmptyReturnToken is MockToken {
    bool public broken;

    constructor(string memory n, string memory s) MockToken(n, s) {}

    function setBroken(bool on) external {
        broken = on;
    }

    function balanceOf(address a) public view override returns (uint256) {
        if (broken) {
            assembly {
                return(0, 0)
            }
        }
        return super.balanceOf(a);
    }
}

/// @notice A12 finding F-00 (High). `exitInKind` caps the gas of each token `transfer` but NOT of the `balanceOf` read
///         that comes first. The three bStocks share one beacon owned by a single EOA, so one upgrade can make every
///         `balanceOf` burn all gas it is given. Each burn leaves only 1/64 of the gas, so after two burns the vault
///         cannot even pay for the USDT transfer and the whole call reverts: the USDT is locked (invariant I8, threat T7).
contract ExitGasLockTest is AuditBase {
    GasBurnerToken internal b1;
    GasBurnerToken internal b2;

    function test_audit_F00_exitInKindStillReturnsUsdtWhenBalanceOfBurnsGas() public {
        _run(true);
    }

    /// @dev Control: identical set-up with the burn switched off. PASSES today.
    function test_audit_control_F00_exitInKindWorksWhenTokensBehave() public {
        _run(false);
    }

    function _run(bool burn) internal {
        b1 = new GasBurnerToken("B1", "B1");
        b2 = new GasBurnerToken("B2", "B2");
        MockPool p1 = new MockPool(address(b1), address(usdt), 2500);
        MockPool p2 = new MockPool(address(b2), address(usdt), 2500);
        p1.setTick(TICK_100, TICK_100);
        p2.setTick(TICK_100, TICK_100);
        v3f.set(address(b1), address(usdt), 2500, address(p1));
        v3f.set(address(b2), address(usdt), 2500, address(p2));
        vm.startPrank(owner);
        factory.addAsset(address(b1), address(p1), 2500, 1e20, 25_000e18);
        factory.addAsset(address(b2), address(p2), 2500, 1e20, 25_000e18);
        vm.stopPrank();

        address[] memory a = new address[](2);
        a[0] = address(b1);
        a[1] = address(b2);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        FloorVault v = _create(user, 1000e18, 9000, a, w);

        // The issuer's beacon owner upgrades every bStock; `balanceOf` now burns all gas.
        b1.setBurn(burn);
        b2.setBurn(burn);

        // 100,000,000 gas is about the whole BSC block gas limit; far more than any wallet would send.
        vm.prank(user);
        v.exitInKind{gas: 100_000_000}(user);

        assertEq(usdt.balanceOf(user), 1000e18, "user got the USDT back");
    }

    /// @dev Cheaper trigger, one asset, default gas: `balanceOf` returns empty data, so `try ... returns (uint256)` cannot
    ///      decode and the revert is NOT caught. The USDT is locked.
    function test_audit_F00b_exitInKindStillReturnsUsdtWhenBalanceOfReturnsNothing() public {
        EmptyReturnToken e = new EmptyReturnToken("E", "E");
        MockPool p = new MockPool(address(e), address(usdt), 2500);
        p.setTick(TICK_100, TICK_100);
        v3f.set(address(e), address(usdt), 2500, address(p));
        vm.prank(owner);
        factory.addAsset(address(e), address(p), 2500, 1e20, 25_000e18);
        (address[] memory a, uint16[] memory w) = _one(address(e));
        FloorVault v = _create(user, 1000e18, 9000, a, w);

        e.setBroken(true);

        vm.prank(user);
        v.exitInKind(user);
        assertEq(usdt.balanceOf(user), 1000e18, "user got the USDT back");
    }
}
