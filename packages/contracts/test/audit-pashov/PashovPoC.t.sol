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

/// @dev AI-assisted audit PoCs (A12b). Each test PASSES while the issue exists and documents the behaviour.
contract PashovVaultPoC is VaultBase {
    /// F-01: stock residue between `dust` and `minTrade` can be neither sold nor closed to USDT.
    function test_PoC_F01_residueBetweenDustAndMinTradeBlocksCloseToUSDT() public {
        stock.mint(address(vault), 0.15e18); // 15 USDT at price 100: dust (1) < 15 < minTrade (20)
        vm.prank(user);
        vault.requestClose();
        // keeper cannot unwind it (E_i < minTrade)
        IFloorVault.Swap memory s = IFloorVault.Swap(0, false, 0.075e18, address(router), "");
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.NoTradeNeeded.selector);
        vault.rebalance(s);
        // owner cannot close to USDT
        vm.prank(user);
        vm.expectRevert(IFloorVault.StockNotUnwound.selector);
        vault.closeToUSDT();
    }

    /// F-02: one unpriceable active pool freezes every sell in a multi-asset vault.
    function test_PoC_F02_oneDeadPoolFreezesDeRisking() public {
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
        vm.prank(keeper);
        vm.expectRevert(); // PoolIlliquid from _load pricing B
        v2.rebalance(IFloorVault.Swap(0, false, amt, address(router), d2));
        // control: with B healthy the same sell succeeds
        poolB.setLiquidity(1e24);
        vm.prank(keeper);
        v2.rebalance(IFloorVault.Swap(0, false, amt, address(router), d2));
    }
}

contract PashovFactoryPoC is FactoryBase {
    /// F-04: addRouter on an already active router (e.g. the Pancake router) deactivates it for 24h.
    function test_PoC_F04_addRouterDeactivatesActiveRouter() public {
        (bool ok,) = factory.routerOk(pancake);
        assertTrue(ok);
        vm.prank(owner);
        factory.addRouter(pancake, pancake);
        (ok,) = factory.routerOk(pancake);
        assertFalse(ok, "public fallback router dead for 24h");
    }

    /// F-05: re-running addAsset overwrites lastMultiplier without updating lastMultiplierChange,
    /// so an unpoked multiplier change is absorbed with no settle window.
    function test_PoC_F05_addAssetHidesUnpokedMultiplierChange() public {
        nvdab.setUiMultiplier(2e18); // split happened, nobody poked: vaults would be blocked
        assertTrue(factory.lastMultiplier(address(nvdab)) != nvdab.uiMultiplier());
        vm.prank(owner);
        factory.addAsset(address(nvdab), address(nvdaPool), 2500, 1e20, 25_000e18);
        assertEq(factory.lastMultiplier(address(nvdab)), 2e18);
        assertEq(factory.lastMultiplierChange(address(nvdab)), 0, "no settle window armed");
    }

    /// F-03: addAsset silently re-points an asset that live vaults read (no open-position check).
    function test_PoC_F03_addAssetRepointsLiveAsset() public {
        MockPool other = new MockPool(address(nvdab), address(usdt), 500);
        v3f.set(address(nvdab), address(usdt), 500, address(other));
        vm.prank(owner);
        factory.addAsset(address(nvdab), address(other), 500, 0, 25_000e18); // minLiquidity = 0
        (address pool,, bool active, uint128 minLiq,,) = factory.assets(address(nvdab));
        assertEq(pool, address(other));
        assertEq(minLiq, 0);
        assertTrue(active);
    }
}
