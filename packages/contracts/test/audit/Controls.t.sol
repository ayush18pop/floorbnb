// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AuditBase} from "./AuditBase.sol";
import {FloorVault} from "../../src/FloorVault.sol";

/// @notice A12 control tests: the same set-ups as Findings.t.sol with the single hostile condition removed.
///         They PASS today and prove the failing PoCs fail because of the finding, not because of a broken fixture.
contract AuditControlsTest is AuditBase {
    function test_audit_control_F01_fourthPositionIsFine() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        usdt.mint(attacker, 1000e18);
        for (uint256 i; i < 4; ++i) {
            vm.startPrank(attacker);
            usdt.approve(address(factory), 1000e18);
            FloorVault v = FloorVault(factory.createPosition(1000e18, 9000, 365 days, a, w));
            v.exitInKind(attacker);
            vm.stopPrank();
        }
        usdt.mint(user, 100e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 100e18);
        factory.createPosition(100e18, 9000, 365 days, a, w);
        vm.stopPrank();
    }

    function test_audit_control_F03_sellWorksWithHealthyPool2() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        stock1.mint(address(v), 3e18);
        vm.prank(user);
        v.requestClose();
        vm.warp(block.timestamp + 1 hours);
        _keeperSwap(v, 0, false, address(stock1), 3e18, _price(pool1));
        assertEq(stock1.balanceOf(address(v)), 0);
    }

    function test_audit_control_F04_sellWorksWhenSpotEqualsTwap() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        deal(address(usdt), address(v), 600e18);
        stock1.mint(address(v), 4e18);
        int24 twap = TICK_100 - 1054;
        pool1.setTick(twap, twap);
        vm.warp(block.timestamp + 1 hours);
        (bool needed,, bool buy,,, uint256 amountIn,,) = v.previewRebalance();
        assertTrue(needed && !buy);
        _keeperSwap(v, 0, false, address(stock1), amountIn, _price(pool1));
        assertLt(stock1.balanceOf(address(v)), 4e18);
    }

    function test_audit_control_F06_residueAboveMinTradeIsSoldThenClosable() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 500e18, 9000, a, w);
        stock1.mint(address(v), 3e17); // 30 USDT >= minTrade
        vm.prank(user);
        v.requestClose();
        vm.warp(block.timestamp + 1 hours);
        (bool needed,, bool buy,,, uint256 amountIn,,) = v.previewRebalance();
        assertTrue(needed && !buy);
        _keeperSwap(v, 0, false, address(stock1), amountIn, _price(pool1));
        vm.prank(user);
        v.closeToUSDT();
    }

    function test_audit_control_F07_oneUsdtPositionWorks() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        // Pashov 03: below the size where a target can reach `minTrade` the factory rejects the deposit (see
        // PashovFix4.t.sol); 100 USDT at floor 90% (E* = 40) is the small position that still works.
        _create(attacker, 100e18, 9000, a, w);
    }
}
