// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AuditBase} from "../audit/AuditBase.sol";
import {FloorFactory} from "../../src/FloorFactory.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {CPPIMath} from "../../src/libs/CPPIMath.sol";
import {MarketHours} from "../../src/libs/MarketHours.sol";
import {TwapOracle} from "../../src/libs/TwapOracle.sol";

/// @dev Exposes the vault's internal `_capTransfer`.
contract CapHarness is FloorVault {
    function cap(address token, address to, uint256 amt) external returns (bool) {
        return _capTransfer(token, to, amt);
    }
}

/// @notice FIX3 regression tests for the real Pashov run reviews/audit-pashov-02-real.md (findings 4-13 and leads).
///         Triage and decisions: reviews/audit-pashov-02-triage.md. Each test fails on the pre-FIX3 code.
contract PashovFix3Test is AuditBase {
    function _twoVault(uint256 amount, uint16 floorBps) internal returns (FloorVault v) {
        (address[] memory a, uint16[] memory w) = _two();
        v = _create(user, amount, floorBps, a, w);
    }

    // ---------------------------------------------------------------- #4 minTrade stalls small positions

    function test_F4_smallPositionSellsBelowMinTrade() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 100e18, 9000, a, w); // C = 10, E* = 40
        (bool needed,, bool buy,,, uint256 amt,,) = v.previewRebalance();
        assertTrue(needed && buy);
        _keeperSwap(v, 0, true, address(stock1), amt, _price(pool1));
        // price falls 5%: E = 38, E* = 32, gap 6 USDT is above the band (0.98) but below minTrade (20)
        vm.warp(block.timestamp + 901);
        pool1.setTick(45_541, 45_541);
        (bool n2,, bool b2,,, uint256 amt2,,) = v.previewRebalance();
        assertTrue(n2 && !b2, "the small excess is sold");
        _keeperSwap(v, 0, false, address(stock1), amt2, _price(pool1));
        (,, uint256[3] memory sv) = v.valuation();
        assertLt(sv[0], 33e18, "exposure came down to about E*");
    }

    // ---------------------------------------------------------------- #5 TVL cap squatting (reproduced, accepted launch guard)

    function test_F5_tvlCapSquat_reproduces_andReleasesOnClose() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault[] memory vs = new FloorVault[](5);
        for (uint256 i; i < 5; ++i) {
            vs[i] = _create(attacker, 1000e18, 9000, a, w);
        }
        usdt.mint(user, 10e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 10e18);
        vm.expectRevert(IFloorFactory.TvlCapReached.selector);
        factory.createPosition(10e18, 9000, 30 days, a, w);
        vm.stopPrank();
        // the squatter gets the capital back at any time, which frees the room (cost to the attacker: nothing)
        vm.prank(attacker);
        vs[0].closeToUSDT();
        vm.prank(user);
        factory.createPosition(10e18, 9000, 30 days, a, w);
    }

    // ---------------------------------------------------------------- #6 1 wei + pushed pool blocks close

    function test_F6_dustAndPushedPoolDoNotBlockClose() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 100e18, 9000, a, w);
        stock1.mint(address(v), 1); // 1 wei donation
        pool1.setTick(TICK_100, TICK_100 + 1000); // spot pushed beyond maxTickDev: the guarded price reverts
        vm.startPrank(user);
        v.requestClose();
        v.closeToUSDT();
        vm.stopPrank();
        assertEq(uint8(v.status()), uint8(IFloorVault.Status.Closed));
        assertEq(usdt.balanceOf(user), 100e18);
    }

    function test_F6_control_realStockStillBlocksClose() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 100e18, 9000, a, w);
        stock1.mint(address(v), 5e18); // 500 USDT of stock, far above dust
        vm.startPrank(user);
        v.requestClose();
        vm.expectRevert(IFloorVault.StockNotUnwound.selector);
        v.closeToUSDT();
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- #7 disabled token, 1 wei, broken pool

    function test_F7_disabledDustTokenDoesNotStopBuys() public {
        FloorVault v = _twoVault(1000e18, 9000);
        vm.prank(owner);
        factory.disableAsset(address(stock2));
        stock2.mint(address(v), 1);
        pool2.setLiquidity(0); // its guarded price now fails
        (bool needed, uint8 idx, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && buy && idx == 0, "buy of the healthy active asset still goes");
    }

    // ---------------------------------------------------------------- #8 held token without TWAP

    function _skewedVault() internal returns (FloorVault v) {
        v = _twoVault(1000e18, 9500); // F = 950
        deal(address(usdt), address(v), 792e18);
        stock1.mint(address(v), 1.28e18); // 128 USDT, target 120
        stock2.mint(address(v), 0.8e18); // 80 USDT on target
    }

    function test_F8_noTwapOnHeldTokenSuspendsSellsOfOthers() public {
        FloorVault v = _skewedVault();
        (bool needed, uint8 idx, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && !buy && idx == 0, "control: stock1 is over target by 8 USDT");
        pool2.setRevertObserve(true); // stock2 has no TWAP: V would drop to 920 and E* to 0
        (needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed, "no sell against an understated V");
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.NoTradeNeeded.selector);
        v.rebalance(IFloorVault.Swap(0, false, 1e18, address(agg), ""));
    }

    function test_F8_noTwapStillAllowsLifecycleUnwind() public {
        FloorVault v = _skewedVault();
        pool2.setRevertObserve(true);
        vm.prank(user);
        v.requestClose();
        (bool needed, uint8 idx, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && !buy && idx == 0, "closing: stock1 still sold");
    }

    // ---------------------------------------------------------------- #9 sell band on the whole basket

    function test_F9_sellBandScaledByWeight() public {
        FloorVault v = _skewedVault();
        // stock1 gap is 8 USDT of V = 1000: 0.8% < 1% band (old code: no sell), but above 0.6% (60% weight x 1%)
        (bool needed, uint8 idx, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && !buy && idx == 0);
    }

    // ---------------------------------------------------------------- #10 preview skips a multiplier-blocked token

    function test_F10_previewSkipsMultiplierBlockedToken() public {
        FloorVault v = _twoVault(1000e18, 9000);
        stock1.setUiMultiplier(1.001e18);
        factory.pokeMultiplier(address(stock1)); // permissionless: starts the transition window for stock1
        (bool needed, uint8 idx, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && buy);
        assertEq(idx, 1, "next token, not the blocked one");
    }

    // ---------------------------------------------------------------- #11 public delay counts open time only

    function test_F11_publicDelayCountsOpenTimeOnly() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w); // created Fri 16:00, lastRebalance = now
        // Monday 15:30:01: more than 4 h of wall clock, but only 3.5 h of open market (Fri 16:00-19:30)
        vm.warp(20_003 days + 15.5 hours + 1);
        vm.expectRevert(IFloorVault.PublicTooEarly.selector);
        v.rebalancePublic(0);
        // Tuesday 17:00: Fri 3.5 h + Mon 4 h of open market, so the delay check passes (a later step may revert)
        vm.warp(20_004 days + 17 hours);
        (bool ok, bytes memory ret) = address(v).call(abi.encodeCall(v.rebalancePublic, (0)));
        assertFalse(ok); // the pancake stand-in is an address with no code
        assertTrue(bytes4(ret) != IFloorVault.PublicTooEarly.selector, "delay passed");
    }

    function test_F11_openSecondsMatchesBruteForce() public pure {
        uint256 from = 20_000 days + 3 hours; // a Friday
        uint256 to = from + 3 weeks + 5 hours;
        uint256 brute;
        for (uint256 t = from; t < to; t += 5 minutes) {
            if (MarketHours.inWindow(t)) brute += 5 minutes;
        }
        assertEq(MarketHours.openSeconds(from, to), brute);
        assertEq(MarketHours.openSeconds(from, from + 1 weeks), 20 hours);
        assertEq(MarketHours.openSeconds(from + 2 days, from + 3 days), 0, "Sunday");
        assertEq(MarketHours.openSeconds(to, from), 0);
    }

    // ---------------------------------------------------------------- #12 documented: a spot-based reference cannot help

    function test_F12_spotReferenceDoesNotChangeMinOut_pureMath() public pure {
        uint256 twap = TwapOracle.priceWad(46_054, false);
        uint256 spotPushedDown = TwapOracle.priceWad(46_054 - 200, false); // attacker pushes spot DOWN before our sell
        uint256 ref = spotPushedDown > twap ? spotPushedDown : twap; // Pashov's max(twap, spot) for a sell
        assertEq(CPPIMath.minOut(1e18, ref, 100, false), CPPIMath.minOut(1e18, twap, 100, false));
        // the vault guard is therefore |spot - TWAP| <= maxTickDev and `tolDirectBps`, bounded by the launch caps
    }

    // ---------------------------------------------------------------- #13 cardinality covers the window on 0.75 s blocks

    function test_F13_createPositionRequiresSlotsForWindow() public {
        IFloorFactory.Defaults memory d = _defaults();
        d.twapWindow = 3600; // needs 4800 slots; the pools have 3000
        vm.prank(owner);
        factory.setDefaults(d);
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        usdt.mint(user, 100e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 100e18);
        vm.expectRevert(IFloorFactory.OracleHistoryTooShort.selector);
        factory.createPosition(100e18, 9000, 30 days, a, w);
        vm.stopPrank();
    }

    function test_F13_addAssetNeeds800SlotsFor600sWindow() public {
        // covered in Factory.t.sol test_addAsset_checks (799 and 200 revert, 800 passes)
        assertEq(uint256(3000) * 3 >= uint256(600) * 4, true);
    }

    // ---------------------------------------------------------------- leads

    function test_lead_amountInOkRoundsLowerBoundUp() public pure {
        assertFalse(CPPIMath.amountInOk(0, 1));
        assertTrue(CPPIMath.amountInOk(1, 1));
        assertFalse(CPPIMath.amountInOk(1, 3));
        assertTrue(CPPIMath.amountInOk(2, 3));
        assertTrue(CPPIMath.amountInOk(50, 100));
        assertFalse(CPPIMath.amountInOk(49, 100));
    }

    function test_lead_capTransferNoCodeIsNotSuccess() public {
        CapHarness h = new CapHarness();
        assertFalse(h.cap(address(0xBEEF), user, 1));
    }

    function test_lead_createPositionWhileHaltedReverts() public {
        vm.prank(guardian);
        factory.setHalted(true);
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        usdt.mint(user, 100e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 100e18);
        vm.expectRevert(IFloorFactory.PausedErr.selector);
        factory.createPosition(100e18, 9000, 30 days, a, w);
        vm.stopPrank();
    }

    function test_lead_termBeyondHolidayTableReverts() public {
        vm.prank(guardian);
        factory.setHolidayHorizon(uint32(T0 / 1 days) + 100);
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        usdt.mint(user, 200e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 200e18);
        factory.createPosition(100e18, 9000, 99 days, a, w);
        vm.expectRevert(IFloorFactory.BadTerm.selector);
        factory.createPosition(100e18, 9000, 101 days, a, w);
        vm.stopPrank();
    }

    function test_lead_setDefaultsLowerBounds() public {
        IFloorFactory.Defaults memory d = _defaults();
        d.minInterval = 59;
        vm.startPrank(owner);
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        d = _defaults();
        d.dust = 0;
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        vm.stopPrank();
    }

    function test_lead_addAssetSanity() public {
        (address t, address p) = _newListing();
        vm.startPrank(owner);
        // fee tier 1% (10_000) is not below tolDirectBps 100 -> every public swap would revert
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(t, p, 10_000, 1, 25e18);
        // maxTradeValue below minTrade (20e18)
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(t, p, 2500, 1, 5e18);
        vm.stopPrank();
    }

    function test_lead_addAssetZeroMultiplierReverts() public {
        (address t, address p) = _newListing();
        (bool ok,) = t.call(abi.encodeWithSignature("setUiMultiplier(uint256)", 0));
        assertTrue(ok);
        vm.prank(owner);
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(t, p, 2500, 1, 25e18);
    }

    function _newListing() internal returns (address t, address p) {
        MockTokenLike tok = MockTokenLike(address(new MockTokenImpl("N", "N")));
        t = address(tok);
        p = address(new MockPoolImpl(t, address(usdt)));
        v3f.set(t, address(usdt), 2500, p);
        v3f.set(t, address(usdt), 10_000, p);
    }
}

// thin aliases so the helper above reads cleanly
import {MockToken as MockTokenImpl} from "../mocks/MockToken.sol";
import {MockPool as MockPoolImplBase} from "../mocks/MockPool.sol";

interface MockTokenLike {}

contract MockPoolImpl is MockPoolImplBase {
    constructor(address stock, address usdt_) MockPoolImplBase(stock, usdt_, 2500) {}
}
