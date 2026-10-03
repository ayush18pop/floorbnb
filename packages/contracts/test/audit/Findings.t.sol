// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AuditBase} from "./AuditBase.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {FloorFactory} from "../../src/FloorFactory.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {MockPool} from "../mocks/MockPool.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

/// @notice A12 (reviews/security-01.md) proof-of-concept tests. Each test asserts the SECURE behaviour, so each one
///         FAILED on the reviewed commit; FIX1 fixed them (F-04 is accepted-needs-lead and pinned as KNOWN).
///         No finding reached High, so these are the Medium and Low items; they are kept so the re-check is mechanical.
contract AuditFindingsTest is AuditBase {
    // ---------------------------------------------------------------------------------------------------------
    // F-01 (Medium): `totalTvl` never decreases, so anyone can burn the launch cap for free and block all deposits.
    // ---------------------------------------------------------------------------------------------------------
    function test_audit_F01_launchCapCannotBeExhaustedForFree() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        // Attacker owns 1,000 USDT once. Open, exit, repeat: capital is returned each time.
        usdt.mint(attacker, 1000e18);
        for (uint256 i; i < 5; ++i) {
            vm.startPrank(attacker);
            usdt.approve(address(factory), 1000e18);
            FloorVault v = FloorVault(factory.createPosition(1000e18, 9000, 365 days, a, w));
            v.exitInKind(attacker);
            vm.stopPrank();
        }
        assertEq(usdt.balanceOf(attacker), 1000e18, "attacker lost nothing");
        // An honest user now tries to open a 100 USDT position. Secure behaviour: it works, nothing is locked.
        usdt.mint(user, 100e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 100e18);
        factory.createPosition(100e18, 9000, 365 days, a, w);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------------------------------------------
    // F-02 (Medium): the owner can re-run `addAsset` on a live asset and swap the oracle pool, fee, minLiquidity and
    // maxTradeValue under every existing position (docs say the owner cannot change existing positions).
    // ---------------------------------------------------------------------------------------------------------
    function test_audit_F02_addAssetCannotRepointALiveAsset() public {
        MockPool other = new MockPool(address(stock1), address(usdt), 500);
        other.setTick(TICK_100 - 2000, TICK_100 - 2000); // a pool quoting about 18% below the real one
        v3f.set(address(stock1), address(usdt), 500, address(other));
        vm.prank(owner);
        vm.expectRevert(); // secure behaviour: an active asset's pool is immutable (disable, then list a new token id)
        factory.addAsset(address(stock1), address(other), 500, 0, type(uint256).max);
    }

    // ---------------------------------------------------------------------------------------------------------
    // F-03 (Medium): one unhealthy pool in a basket freezes SELLS of the other assets (V needs every price).
    // ---------------------------------------------------------------------------------------------------------
    function test_audit_F03_unrelatedPoolCannotBlockASell() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        // Give the vault 3 stock1 (300 USDT at 100) as if a past buy filled; owner asks to close.
        stock1.mint(address(v), 3e18);
        vm.prank(user);
        v.requestClose();
        // Pool2 (stock2, which the vault holds none of) is pushed 4% (400 ticks) away from its TWAP.
        pool2.setTick(TICK_100, TICK_100 + 400);
        vm.warp(block.timestamp + 1 hours);
        uint256 p = _price(pool1);
        // The sell of stock1 only depends on pool1, which is healthy. Secure behaviour: it succeeds.
        _keeperSwap(v, 0, false, address(stock1), 3e18, p);
        assertEq(stock1.balanceOf(address(v)), 0, "stock1 unwound");
    }

    // ---------------------------------------------------------------------------------------------------------
    // F-04 (Medium): ACCEPTED-NEEDS-LEAD, NOT FIXED. minOut is anchored to a lagging 10-minute TWAP with a symmetric
    // tolerance (30 bps aggregator, 100 bps Pancake), so a SELL reverts whenever spot is more than the tolerance under
    // the TWAP. Widening the SELL tolerance would loosen invariant I1 / threat T1 (compromised keeper loss bound), which
    // FIX1 is not allowed to do. This test pins the current behaviour; if the lead decides on an asymmetric tolerance,
    // flip it to assertLt(...) as the original PoC did (git history: A12 `test_audit_F04_...`).
    // ---------------------------------------------------------------------------------------------------------
    function test_audit_F04_KNOWN_sellRevertsWhenSpotLagsBelowTwapByOnePercent() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        deal(address(usdt), address(v), 600e18);
        stock1.mint(address(v), 4e18);
        int24 twap = TICK_100 - 1054;
        pool1.setTick(twap, twap - 100);
        vm.warp(block.timestamp + 1 hours);
        (bool needed,, bool buy,,, uint256 amountIn,,) = v.previewRebalance();
        assertTrue(needed && !buy, "a sell is due");
        uint256 execPrice = 89.1e18;
        bytes memory data = abi.encodeCall(
            MockRouter.swapExact, (address(stock1), address(usdt), amountIn, amountIn * execPrice / 1e18, address(v))
        );
        vm.prank(keeper);
        vm.expectRevert(); // MinOutNotMet: documented limitation, see CONTRACTS.md section 15 (T-lag)
        v.rebalance(IFloorVault.Swap({assetIdx: 0, buy: false, amountIn: amountIn, router: address(agg), data: data}));
    }

    // ---------------------------------------------------------------------------------------------------------
    // F-06 (Low, fixed): a stock residue between `dust` (1 USDT) and `minTrade` (20 USDT) is sold in the unwind, so
    // `closeToUSDT` can finish. A third party can still donate it, but it no longer blocks anything.
    // ---------------------------------------------------------------------------------------------------------
    function test_audit_F06_closeToUsdtWorksWithResidueBelowMinTrade() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 500e18, 9000, a, w);
        stock1.mint(attacker, 1e17); // 0.1 stock = 10 USDT, between dust (1) and minTrade (20)
        vm.prank(attacker);
        stock1.transfer(address(v), 1e17);
        vm.prank(user);
        v.requestClose();
        vm.warp(block.timestamp + 1 hours);
        (bool needed,, bool buy,,, uint256 amountIn,,) = v.previewRebalance();
        assertTrue(needed && !buy, "residue sell is allowed");
        _keeperSwap(v, 0, false, address(stock1), amountIn, _price(pool1));
        vm.prank(user);
        v.closeToUSDT();
    }

    // ---------------------------------------------------------------------------------------------------------
    // F-07 (Low): no minimum deposit, so 1-wei positions can spam `positions[]` and every keeper scan.
    // ---------------------------------------------------------------------------------------------------------
    function test_audit_F07_dustPositionsAreRejected() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        usdt.mint(attacker, 1);
        vm.startPrank(attacker);
        usdt.approve(address(factory), 1);
        vm.expectRevert();
        factory.createPosition(1, 9000, 7 days, a, w);
        vm.stopPrank();
    }
}
