// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FloorVault} from "../../src/FloorVault.sol";
import {FloorFactory} from "../../src/FloorFactory.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {TwapOracle} from "../../src/libs/TwapOracle.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {MockPool} from "../mocks/MockPool.sol";
import {VaultBase} from "../unit/Vault.t.sol";
import {FactoryBase} from "../unit/Factory.t.sol";

/// @dev AI-assisted audit PoCs (A12b), FLIPPED by FIX1: each test now asserts the FIXED behaviour.
contract PashovVaultPoC is VaultBase {
    /// F-01 (fixed): stock residue between `dust` and `minTrade` is sold in the full unwind, then `closeToUSDT` works.
    function test_PoC_F01_residueBetweenDustAndMinTradeBlocksCloseToUSDT() public {
        stock.mint(address(vault), 0.15e18); // 15 USDT at price 100: dust (1) < 15 < minTrade (20)
        vm.prank(user);
        vault.requestClose();
        (bool needed,, bool buy,,, uint256 amt,,) = vault.previewRebalance();
        assertTrue(needed && !buy, "final sell below minTrade is allowed");
        bytes memory d = _swapData(false, amt, address(vault));
        vm.prank(keeper);
        vault.rebalance(IFloorVault.Swap(0, false, amt, address(router), d));
        vm.prank(user);
        vault.closeToUSDT();
        assertEq(uint8(vault.status()), uint8(IFloorVault.Status.Closed));
    }

    /// Control: residue at or below dust needs no sell and closes.
    function test_PoC_F01_control_residueBelowDustCloses() public {
        stock.mint(address(vault), 0.005e18); // 0.5 USDT <= dust
        vm.prank(user);
        vault.requestClose();
        (bool needed,,,,,,,) = vault.previewRebalance();
        assertFalse(needed);
        vm.prank(user);
        vault.closeToUSDT();
    }

    /// F-02: one unpriceable active pool freezes every sell in a multi-asset vault.
    function test_PoC_F02_oneDeadPoolDoesNotFreezeDeRisking() public {
        MockToken stockB = new MockToken("QQQB", "QQQB");
        MockPool poolB = new MockPool(address(stockB), address(usdt), 2500);
        poolB.setTick(TICK_100, TICK_100);
        factory.setAsset(address(stockB), address(poolB), 2500, true, 1e20, 25_000e18, false);
        factory.setMultiplier(address(stockB), 1e18, 0);

        address[] memory a = new address[](2);
        a[0] = address(stock);
        a[1] = address(stockB);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        usdt.mint(user, 10_000e18);
        vm.prank(user);
        usdt.approve(address(factory), 10_000e18);
        FloorVault v2 = FloorVault(factory.create(user, 10_000e18, 9000, uint40(T0 + 365 days), a, w, _defaults()));

        // vault buys asset A
        (bool needed,, bool buy,,, uint256 amt,,) = v2.previewRebalance();
        assertTrue(needed && buy);
        bytes memory d1 = _swapData(true, amt, address(v2));
        vm.prank(keeper);
        v2.rebalance(IFloorVault.Swap(0, true, amt, address(router), d1));

        // asset A drops 10%: an honest sell is now required
        vm.warp(block.timestamp + 1 hours);
        _setTick(TICK_100 - 1053);
        (needed,, buy,,, amt,,) = v2.previewRebalance();
        assertTrue(needed && !buy, "sell needed");

        // pool B's in-range liquidity falls under minLiquidity (B holds nothing, is merely active)
        poolB.setLiquidity(1);
        bytes memory d2 = _swapData(false, amt, address(v2));
        // fixed (A12 F-03 / Pashov F-02): B is valued at 0 and the sell of A goes through
        uint256 balBefore = stock.balanceOf(address(v2));
        vm.prank(keeper);
        v2.rebalance(IFloorVault.Swap(0, false, amt, address(router), d2));
        assertLt(stock.balanceOf(address(v2)), balBefore, "A sold while B is dead");
    }
}

contract PashovFactoryPoC is FactoryBase {
    /// F-04 (fixed): addRouter on an existing router reverts; the active router stays active.
    function test_PoC_F04_addRouterCannotDeactivateActiveRouter() public {
        (bool ok,) = factory.routerOk(pancake);
        assertTrue(ok);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IFloorFactory.RouterExists.selector, pancake));
        factory.addRouter(pancake, pancake);
        (ok,) = factory.routerOk(pancake);
        assertTrue(ok, "public fallback router stays alive");
    }

    /// F-05 (fixed): addAsset can no longer be re-run on a listed token, so an unpoked multiplier change cannot be
    /// absorbed without the settle window.
    function test_PoC_F05_addAssetCannotHideUnpokedMultiplierChange() public {
        nvdab.setUiMultiplier(2e18);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IFloorFactory.AssetExists.selector, address(nvdab)));
        factory.addAsset(address(nvdab), address(nvdaPool), 2500, 1e20, 25_000e18);
        assertTrue(factory.lastMultiplier(address(nvdab)) != nvdab.uiMultiplier(), "still needs a poke");
    }

    /// F-03 (fixed): addAsset cannot re-point a live asset; the stored pool and minLiquidity are unchanged.
    function test_PoC_F03_addAssetCannotRepointLiveAsset() public {
        MockPool other = new MockPool(address(nvdab), address(usdt), 500);
        v3f.set(address(nvdab), address(usdt), 500, address(other));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IFloorFactory.AssetExists.selector, address(nvdab)));
        factory.addAsset(address(nvdab), address(other), 500, 0, 25_000e18);
        (address pool,, bool active, uint128 minLiq,,) = factory.assets(address(nvdab));
        assertEq(pool, address(nvdaPool));
        assertEq(minLiq, 1e20);
        assertTrue(active);
    }
}
