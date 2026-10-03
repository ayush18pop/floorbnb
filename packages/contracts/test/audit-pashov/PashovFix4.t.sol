// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AuditBase, AuditV3Factory} from "../audit/AuditBase.sol";
import {FloorFactory} from "../../src/FloorFactory.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {MarketHours} from "../../src/libs/MarketHours.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {MockPool} from "../mocks/MockPool.sol";

/// @dev Exposes the library walk with its own holiday map.
contract HoursHarness {
    mapping(uint32 => bool) public ntd;

    function set(uint32 d, bool on) external {
        ntd[d] = on;
    }

    function has(uint256 from, uint256 to, uint256 needed) external view returns (bool) {
        return MarketHours.hasOpenSeconds(from, to, needed, ntd);
    }
}

/// @notice FIX4 regression tests for the real Pashov run reviews/audit-pashov-03-real.md (findings 2-5 and leads).
///         Triage and decisions: reviews/audit-pashov-03-triage.md.
contract PashovFix4Test is AuditBase {
    MockToken internal stock3;
    MockPool internal pool3;

    function setUp() public override {
        super.setUp();
        stock3 = new MockToken("TSLAB", "TSLAB");
        pool3 = new MockPool(address(stock3), address(usdt), 2500);
        pool3.setTick(TICK_100, TICK_100);
        v3f.set(address(stock3), address(usdt), 2500, address(pool3));
        vm.prank(owner);
        factory.addAsset(address(stock3), address(pool3), 2500, 1e20, 25_000e18);
        stock3.mint(address(agg), 1e30);
    }

    function _two2() internal returns (FloorVault v) {
        (address[] memory a, uint16[] memory w) = _two();
        v = _create(user, 1000e18, 9000, a, w);
    }

    function _three(uint256 minTrade) internal returns (FloorVault v) {
        IFloorFactory.Defaults memory d = _defaults();
        d.minTrade = minTrade;
        d.dust = 1e18;
        vm.prank(owner);
        factory.setDefaults(d);
        address[] memory a = new address[](3);
        a[0] = address(stock1);
        a[1] = address(stock2);
        a[2] = address(stock3);
        uint16[] memory w = new uint16[](3);
        w[0] = 5000;
        w[1] = 3000;
        w[2] = 2000;
        v = _create(user, 1000e18, 9000, a, w); // F = 900
    }

    /// @dev Put the vault in the state s1/s2/s3 USDT of stock at price 100 and USDT so that V is exactly 1000.
    function _hold(FloorVault v, uint256 s1, uint256 s2, uint256 s3) internal {
        deal(address(stock1), address(v), s1 * 1e16);
        deal(address(stock2), address(v), s2 * 1e16);
        deal(address(stock3), address(v), s3 * 1e16);
        deal(address(usdt), address(v), 1000e18 - (s1 + s2 + s3) * 1e18);
    }

    // ---------------------------------------------------------------- #2 disabled token, raised thin-pool TWAP

    function test_F2_disabledRaisedTwapDoesNotDriveBuys() public {
        FloorVault v = _two2();
        vm.prank(owner);
        factory.disableAsset(address(stock2));
        // V is exactly F (900 + 50 + 50 of stock at spot 100 = 1000? no: 850 USDT + 50 + 50 = 950 = F)
        deal(address(usdt), address(v), 850e18);
        stock1.mint(address(v), 0.5e18);
        stock2.mint(address(v), 0.5e18);
        (uint256 V0,,) = v.valuation();
        assertApproxEqAbs(V0, 950e18, 1e14, "true value is the floor (the mock tick is 99.9999)");
        // the attacker raises the thin disabled pool's TWAP to 200 and the spot is not at the TWAP: the guard fails
        pool2.setTick(TICK_100 + 6932, TICK_100); // price about x2
        (uint256 V,,) = v.valuation();
        assertLt(V, 951e18, "the raised TWAP of a disabled token does not inflate V");
        (bool needed,, bool buy,,,,,) = v.previewRebalance();
        assertTrue(!needed || !buy, "no buy against an inflated V");
    }

    function test_F2_control_disabledDustWithBrokenPoolStillAllowsBuys() public {
        FloorVault v = _two2();
        vm.prank(owner);
        factory.disableAsset(address(stock2));
        stock2.mint(address(v), 1); // 1 wei
        pool2.setLiquidity(0);
        (bool needed, uint8 idx, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && buy && idx == 0);
    }

    // ---------------------------------------------------------------- #3 buy band scaled by weight

    function test_F3_threeTokenBasket_smallOvershootNotSold_largeOneSold() public {
        FloorVault v = _three(2e18); // targets 200 / 120 / 80, V = 1000, sell bands 5 / 3 / 2 USDT
        _hold(v, 200, 120, 81); // stock3 over by 1 (< its 2 band, and < dust+1 anyway)
        (bool needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed, "1 USDT over a 20% token is noise");
        _hold(v, 200, 120, 83); // over by 3: above its scaled band 2
        uint8 idx;
        bool buy;
        (needed, idx, buy,,,,,) = v.previewRebalance();
        assertTrue(needed && !buy && idx == 2, "3 USDT over the 20% token is sold");
    }

    function test_F3_threeTokenBasket_smallShortfallNotBought_largeOneBought() public {
        FloorVault v = _three(2e18);
        _hold(v, 200, 120, 77); // stock3 under by 3, buy band 2% * 20% of V = 4
        (bool needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed, "shortfall below the scaled band");
        _hold(v, 200, 120, 75); // under by 5: bought (old code needed 20 = a full 2% of V)
        uint8 idx;
        bool buy;
        (needed, idx, buy,,,,,) = v.previewRebalance();
        assertTrue(needed && buy && idx == 2, "5 USDT under the 20% token is bought");
    }

    function test_F3_heavyToken_bandsScaleToo() public {
        FloorVault v = _three(2e18);
        _hold(v, 192, 120, 80); // stock1 under by 8, buy band 2% * 50% of V = 10
        (bool needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed);
        _hold(v, 188, 120, 80); // under by 12
        (bool n2, uint8 idx, bool buy,,,,,) = v.previewRebalance();
        assertTrue(n2 && buy && idx == 0);
    }

    function test_F3_hysteresis_sellBandBelowBuyBand() public {
        FloorVault v = _three(2e18);
        // the 20% token: sold from 2 USDT over, bought from 4 USDT under (the buy side stays the lazier one)
        _hold(v, 200, 120, 84);
        (bool needed,, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && !buy);
        _hold(v, 200, 120, 75); // 5 under: above the buy band 4
        (needed,, buy,,,,,) = v.previewRebalance();
        assertTrue(needed && buy);
    }

    // ---------------------------------------------------------------- #4 paused token skipped in preview

    function test_F4_previewSkipsPausedToken() public {
        FloorVault v = _two2();
        stock1.setPaused(true);
        (bool needed, uint8 idx, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && buy);
        assertEq(idx, 1, "the next token, not the paused one");
        stock1.setPaused(false);
        (, idx,,,,,,) = v.previewRebalance();
        assertEq(idx, 0, "control: unpaused token comes first");
    }

    // ---------------------------------------------------------------- lead (c) paused held token

    function test_lead_pausedHeldTokenSuppressesBuys() public {
        FloorVault v = _two2();
        stock1.mint(address(v), 0.1e18); // held, still at its old price in V
        (bool needed,,,,,,,) = v.previewRebalance();
        assertTrue(needed, "control: the vault wants to buy");
        stock1.setPaused(true);
        (needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed, "no buys while a held bStock is paused (V at a frozen price)");
    }

    // ---------------------------------------------------------------- #5 holidays and halts are not open time

    function test_F5_holidaysDoNotCountForPublicDelay() public {
        FloorVault v = _two2(); // Fri 16:00, start = now
        uint32 monday = 20_003;
        vm.startPrank(guardian);
        factory.setNonTradingDay(monday, true);
        factory.setNonTradingDay(monday + 1, true);
        vm.stopPrank();
        // Wed 15:45: Fri 3.5 h + Wed 15 min = 3.75 h of REAL open time (old code counted Mon and Tue: 11.75 h)
        vm.warp(uint256(monday + 2) * 1 days + 15.75 hours);
        vm.expectRevert(IFloorVault.PublicTooEarly.selector);
        v.rebalancePublic(0);
        // Wed 16:00: exactly 4 h, the delay passes (a later step may revert: the pancake stand-in has no code)
        vm.warp(uint256(monday + 2) * 1 days + 16 hours);
        (bool ok, bytes memory ret) = address(v).call(abi.encodeCall(v.rebalancePublic, (0)));
        assertFalse(ok);
        assertTrue(bytes4(ret) != IFloorVault.PublicTooEarly.selector, "delay passed");
    }

    function test_F5_haltDoesNotCountForPublicDelay() public {
        FloorVault v = _two2();
        vm.prank(guardian);
        factory.setHalted(true);
        vm.warp(20_003 days + 15.5 hours + 5 minutes); // Monday, the halt is lifted at 15:35
        vm.prank(guardian);
        factory.setHalted(false);
        // Mon 17:00: Fri 3.5 h + Mon 1.5 h of wall-clock open time (5 h), but only 1.42 h since the halt ended
        vm.warp(20_003 days + 17 hours);
        vm.expectRevert(IFloorVault.PublicTooEarly.selector);
        v.rebalancePublic(0);
        // Tue 17:00 is 1.42 h + 1.5 h + ... = Mon 17:00-19:30 (2.5) -> 3.92 h at Mon close; Tue 15:35 is past 4 h
        vm.warp(20_004 days + 16 hours);
        (bool ok, bytes memory ret) = address(v).call(abi.encodeCall(v.rebalancePublic, (0)));
        assertFalse(ok);
        assertTrue(bytes4(ret) != IFloorVault.PublicTooEarly.selector, "delay passed after real sessions");
    }

    function test_F5_pauseResetsPublicDelay() public {
        FloorVault v = _two2();
        vm.prank(guardian);
        factory.pause();
        vm.warp(20_003 days + 15.5 hours);
        vm.prank(guardian);
        factory.unpause();
        assertEq(factory.tradingResumedAt(), 20_003 days + 15.5 hours);
        vm.warp(20_003 days + 17 hours);
        vm.expectRevert(IFloorVault.PublicTooEarly.selector);
        v.rebalancePublic(0);
    }

    function test_lead_publicDelayIsPerAsset() public {
        FloorVault v = _two2();
        vm.warp(20_003 days + 16 hours); // Mon 16:00: exactly 4 h of open time since the start
        (,,,,, uint256 amt,,) = v.previewRebalance();
        _keeperSwap(v, 0, true, address(stock1), amt, _price(pool1)); // keeper trades token 0 (resets lastRebalance)
        // token 0 just traded: its own public delay restarts
        vm.expectRevert(IFloorVault.PublicTooEarly.selector);
        v.rebalancePublic(0);
        // token 1 was not traded: its delay (from the start) has passed, the call goes on (stand-in router has no code)
        (bool ok, bytes memory ret) = address(v).call(abi.encodeCall(v.rebalancePublic, (1)));
        assertFalse(ok);
        assertTrue(bytes4(ret) != IFloorVault.PublicTooEarly.selector);
    }

    function testFuzz_hasOpenSeconds_matchesOpenSecondsWithoutHolidays(uint256 from, uint256 span, uint16 pick) public {
        HoursHarness h = new HoursHarness();
        from = bound(from, 19_000 days, 21_000 days);
        span = bound(span, 1, 30 days);
        uint256 to = from + span;
        uint256 total = MarketHours.openSeconds(from, to);
        if (total == 0) {
            assertFalse(h.has(from, to, 1));
            return;
        }
        uint256 need = bound(pick, 1, total);
        assertTrue(h.has(from, to, need));
        assertFalse(h.has(from, to, total + 1));
    }

    function test_hasOpenSeconds_holidayRemovesItsSession() public {
        HoursHarness h = new HoursHarness();
        uint256 from = 20_000 days + 16 hours; // Fri
        uint256 to = 20_003 days + 16 hours; // Mon 16:00: 3.5 h + 0.5 h
        assertTrue(h.has(from, to, 4 hours));
        h.set(20_003, true);
        assertFalse(h.has(from, to, 4 hours));
        assertTrue(h.has(from, to, 3.5 hours));
    }

    function test_hasOpenSeconds_gasBoundedOverLongHolidayRun() public {
        HoursHarness h = new HoursHarness();
        for (uint32 d = 20_000; d < 20_030; ++d) {
            h.set(d, true);
        }
        uint256 g = gasleft();
        assertFalse(h.has(20_000 days, 20_030 days, 1 hours));
        assertLt(g - gasleft(), 400_000, "thirty closed days");
    }

    // ---------------------------------------------------------------- lead (a): cash lock

    function _crashAndSellAll() internal returns (FloorVault v) {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        v = _create(user, 1000e18, 9000, a, w); // F = 900, E* = 400
        (,,,,, uint256 amt,,) = v.previewRebalance();
        _keeperSwap(v, 0, true, address(stock1), amt, _price(pool1));
        vm.warp(block.timestamp + 901);
        pool1.setTick(TICK_100 - 3567, TICK_100 - 3567); // price x0.70: V = 880 < F
        (, uint8 idx, bool buy,,, uint256 sellIn,,) = v.previewRebalance();
        assertTrue(!buy && idx == 0);
        _keeperSwap(v, 0, false, address(stock1), sellIn, _price(pool1));
    }

    function test_lead_cashLock_noRebuyAfterRecoveryAndDonation() public {
        FloorVault v = _crashAndSellAll();
        assertTrue(v.cashLocked(), "the sale at V <= F locked the position");
        // everything recovers and somebody donates USDT: V is far above F again
        vm.warp(block.timestamp + 901);
        pool1.setTick(TICK_100, TICK_100);
        deal(address(usdt), address(v), usdt.balanceOf(address(v)) + 500e18);
        (uint256 V,,) = v.valuation();
        assertGt(V, 1000e18);
        (uint256 c, uint256 e,) = v.targets();
        assertGt(c, 0, "the cushion is positive again");
        assertEq(e, 0, "but the exposure target stays 0 for the rest of the term (I5)");
        (bool needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed, "no buy");
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.NoTradeNeeded.selector);
        v.rebalance(IFloorVault.Swap(0, true, 1e18, address(agg), ""));
    }

    function test_lead_cashLock_control_withoutHittingFloorTheVaultKeepsTrading() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        (,,,,, uint256 amt,,) = v.previewRebalance();
        _keeperSwap(v, 0, true, address(stock1), amt, _price(pool1));
        vm.warp(block.timestamp + 901);
        pool1.setTick(TICK_100 + 953, TICK_100 + 953); // price +10%: more risk is bought, no lock
        (bool needed,, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && buy);
        assertFalse(v.cashLocked());
    }

    function test_lead_lockIfBelowFloor_persistsWithoutATrade() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        (,,,,, uint256 amt,,) = v.previewRebalance();
        _keeperSwap(v, 0, true, address(stock1), amt, _price(pool1));
        v.lockIfBelowFloor();
        assertFalse(v.cashLocked(), "V = 1000 > F");
        vm.warp(block.timestamp + 901);
        pool1.setTick(TICK_100 - 3567, TICK_100 - 3567);
        v.lockIfBelowFloor(); // anyone
        assertTrue(v.cashLocked());
        pool1.setTick(TICK_100, TICK_100); // recovery
        vm.warp(block.timestamp + 901);
        (uint256 c, uint256 e,) = v.targets();
        assertGt(c, 0);
        assertEq(e, 0);
    }

    function test_lead_lockIfBelowFloor_notFromAnUnderstatedV() public {
        FloorVault v = _two2();
        deal(address(usdt), address(v), 100e18);
        stock1.mint(address(v), 5e18); // real value 600, but...
        pool1.setRevertObserve(true); // ...no TWAP at all: V reads 100 <= F
        v.lockIfBelowFloor();
        assertFalse(v.cashLocked(), "an unpriced held asset must never lock a healthy position");
    }

    // ---------------------------------------------------------------- lead (b): small positions

    function test_lead_smallPositionRejected() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        usdt.mint(user, 1000e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 1000e18);
        // D = 50, floor 90%: C = 5, E* = 20 -> a single token target of 20 reaches minTrade (20): accepted
        factory.createPosition(50e18, 9000, 30 days, a, w);
        // D = 49: E* = 19.6 < 20: rejected with a clear error
        vm.expectRevert(FloorFactory.PositionTooSmall.selector);
        factory.createPosition(49e18, 9000, 30 days, a, w);
        // 1 USDT, the old minimum
        vm.expectRevert(FloorFactory.PositionTooSmall.selector);
        factory.createPosition(1e18, 9000, 30 days, a, w);
        // a high floor leaves a thin cushion: D = 500, floor 98% -> E* = 40: fine; D = 400 -> E* = 32: fine; 200 -> 16
        factory.createPosition(500e18, 9800, 30 days, a, w);
        vm.expectRevert(FloorFactory.PositionTooSmall.selector);
        factory.createPosition(200e18, 9800, 30 days, a, w);
        vm.stopPrank();
    }

    function test_lead_smallPositionBasket_oneTokenReachingMinTradeIsEnough() public {
        (address[] memory a, uint16[] memory w) = _two(); // 60 / 40
        usdt.mint(user, 100e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 100e18);
        factory.createPosition(100e18, 9000, 30 days, a, w); // E* = 40: targets 24 and 16, the 60% token trades
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- lead (d): listing and defaults checks

    function _newPool(uint24 fee) internal returns (MockToken t, MockPool p) {
        t = new MockToken("X", "X");
        p = new MockPool(address(t), address(usdt), fee);
        p.setTick(TICK_100, TICK_100);
        v3f.set(address(t), address(usdt), fee, address(p));
    }

    function test_lead_addAsset_feeMustFitTolerance() public {
        (MockToken t, MockPool p) = _newPool(5000); // 50 bps: 2 x 50 = 100 <= tolDirect 100
        vm.prank(owner);
        factory.addAsset(address(t), address(p), 5000, 1e20, 25_000e18);
        (MockToken t2, MockPool p2) = _newPool(5100); // 51 bps: 102 > 100
        vm.prank(owner);
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(address(t2), address(p2), 5100, 1e20, 25_000e18);
    }

    function test_lead_addAsset_maxTradeBelowMinTrade() public {
        (MockToken t, MockPool p) = _newPool(2500);
        vm.prank(owner);
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(address(t), address(p), 2500, 1e20, 19e18);
    }

    function test_lead_addAsset_multiplierGettersMustWork() public {
        (MockToken t, MockPool p) = _newPool(2500);
        vm.mockCallRevert(address(t), abi.encodeWithSignature("hasPendingMultiplier()"), "x");
        vm.prank(owner);
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(address(t), address(p), 2500, 1e20, 25_000e18);
    }

    function test_lead_reenableRepeatsListingChecks() public {
        vm.prank(owner);
        factory.disableAsset(address(stock1));
        vm.mockCallRevert(address(stock1), abi.encodeWithSignature("effectiveAt()"), "x");
        vm.prank(owner);
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.reenableAsset(address(stock1));
        vm.clearMockedCalls();
        vm.prank(owner);
        factory.reenableAsset(address(stock1));
    }

    function test_lead_setDefaults_checksListedFeesAndOrder() public {
        IFloorFactory.Defaults memory d = _defaults();
        d.tolDirectBps = 49; // listed pools charge 25 bps: needs >= 50
        vm.startPrank(owner);
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        d.tolDirectBps = 50;
        factory.setDefaults(d);

        d = _defaults();
        d.minTrade = 30_000e18; // above every listed maxTradeValue (25,000) and the 1,000 bound
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);

        d = _defaults();
        d.buyBandBps = 99; // below the sell band
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        d = _defaults();
        d.twapWindow = 60;
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        d = _defaults();
        d.dust = 1;
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        d = _defaults();
        d.publicDelay = 24 hours + 1; // open-seconds bound
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        d.publicDelay = 24 hours;
        factory.setDefaults(d);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- lead (f): unwind horizon

    function test_lead_termMustLeaveRoomForTheUnwind() public {
        vm.prank(guardian);
        factory.setHolidayHorizon(uint32(T0 / 1 days) + 100);
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        usdt.mint(user, 400e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 400e18);
        factory.createPosition(200e18, 9000, 85 days, a, w); // matures day 85, unwind to day 99
        vm.expectRevert(IFloorFactory.BadTerm.selector);
        factory.createPosition(200e18, 9000, 87 days, a, w); // the unwind would pass the table end
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- lead: cardinality for the vault's own window

    function test_lead_vaultChecksSlotsForItsOwnWindow() public {
        FloorVault v = _two2(); // window 600 s: 800 slots, the mock pools have 3000
        (uint256 V,,) = v.valuation();
        assertEq(V, 1000e18);
        pool1.setCardinality(500); // shrinks below ceil(600*4/3) = 800 but stays above the old fixed 200
        (bool needed,,,,,,,) = v.previewRebalance();
        // pool1 fails its guarded price (history), so token 0 is skipped and buys are suppressed
        assertFalse(needed);
    }
}
