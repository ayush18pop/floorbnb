// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AuditBase} from "../audit/AuditBase.sol";
import {FloorFactory} from "../../src/FloorFactory.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";

/// @notice FIX5 regression tests for the real Pashov run reviews/audit-pashov-04-real.md (findings 2-4 and leads).
///         Triage and decisions: reviews/audit-pashov-04-triage.md.
contract PashovFix5Test is AuditBase {
    function _hold1(FloorVault v, uint256 stockUsdt, uint256 usdtBal) internal {
        deal(address(stock1), address(v), stockUsdt * 1e16);
        deal(address(usdt), address(v), usdtBal * 1e18);
    }

    function _oneVault() internal returns (FloorVault v) {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        v = _create(user, 1000e18, 9000, a, w); // F = 900
    }

    // ------------------------------------------------------------------ #3: the lock needs a guarded price

    function test_F3_spotGuardFailure_cannotSetTheLock() public {
        FloorVault v = _oneVault();
        _hold1(v, 400, 600);
        // TWAP is crashed 30% (V = 880 < F) but the spot is far from it: the deviation guard fails
        pool1.setTick(TICK_100 - 3567, TICK_100);
        (uint256 V,,) = v.valuation();
        assertLt(V, 891e18);
        v.lockIfBelowFloor();
        assertFalse(v.cashLocked(), "a price that failed the spot guard never locks");
    }

    function test_F3_liquidityGuardFailure_cannotSetTheLock() public {
        FloorVault v = _oneVault();
        _hold1(v, 400, 600);
        pool1.setTick(TICK_100 - 3567, TICK_100 - 3567);
        pool1.setLiquidity(0); // below minLiquidity: the guard fails
        v.lockIfBelowFloor();
        assertFalse(v.cashLocked(), "a thin pool never locks");
        pool1.setLiquidity(type(uint128).max / 2);
        v.lockIfBelowFloor();
        assertTrue(v.cashLocked(), "control: the same crash with every guard passing locks");
    }

    function test_F3_keeperRebalance_withFailedGuard_doesNotLock() public {
        FloorVault v = _oneVault();
        _hold1(v, 400, 600);
        pool1.setTick(TICK_100 - 3567, TICK_100);
        vm.prank(keeper);
        vm.expectRevert(); // the traded asset must be priceable
        v.rebalance(IFloorVault.Swap(0, false, 1e18, address(agg), ""));
        assertFalse(v.cashLocked());
    }

    function test_lead_lock_skipsAnUnsettledMultiplier() public {
        FloorVault v = _oneVault();
        _hold1(v, 400, 600);
        pool1.setTick(TICK_100 - 3567, TICK_100 - 3567);
        stock1.setUiMultiplier(2e18); // the stored multiplier is stale: the price is not trusted yet
        v.lockIfBelowFloor();
        assertFalse(v.cashLocked(), "stale multiplier: no lock");
        factory.pokeMultiplier(address(stock1));
        v.lockIfBelowFloor();
        assertFalse(v.cashLocked(), "multiplier just changed: still inside the transition window");
        vm.warp(block.timestamp + 601);
        pool1.setTick(TICK_100 - 3567, TICK_100 - 3567);
        v.lockIfBelowFloor();
        assertTrue(v.cashLocked(), "settled");
    }

    // ------------------------------------------------------------------ #4: preconditions and margin

    function test_F4_lockIfBelowFloor_needsAnOpenMarket() public {
        FloorVault v = _oneVault();
        _hold1(v, 400, 600);
        pool1.setTick(TICK_100 - 3567, TICK_100 - 3567);
        vm.warp(20_001 days + 12 hours); // Saturday
        vm.expectRevert(IFloorVault.TradingClosed.selector);
        v.lockIfBelowFloor();
        vm.warp(T0);
        vm.prank(guardian);
        factory.setHalted(true);
        vm.expectRevert(IFloorVault.TradingClosed.selector);
        v.lockIfBelowFloor();
        vm.prank(guardian);
        factory.setHalted(false);
        vm.prank(guardian);
        factory.pause();
        vm.expectRevert(IFloorVault.TradingClosed.selector);
        v.lockIfBelowFloor();
        vm.prank(guardian);
        factory.unpause();
        v.lockIfBelowFloor();
        assertTrue(v.cashLocked());
    }

    /// @dev The lead: a 1% fill loss near the floor (V 902 -> 897/899) must not trip the lock; a real fall does. The
    ///      margin is `tolDirectBps` of V (here 100 bps): V * 1.01 <= F, i.e. V <= 891.08 for F = 900.
    function test_F4_marginMeansASandwichFillLossCannotTripTheLock() public {
        FloorVault v = _oneVault();
        _hold1(v, 0, 897); // V was 902 with 500 of stock; the sell lost 1% of 500 (5 USDT): V = 897
        v.lockIfBelowFloor();
        assertFalse(v.cashLocked(), "V 897 is below F but inside the margin: no lock");
    }

    function test_F4_marginBoundary_locksOnlyBelowFloorMinusTolerance() public {
        FloorVault v = _oneVault();
        _hold1(v, 0, 892);
        v.lockIfBelowFloor();
        assertFalse(v.cashLocked(), "892 * 1.01 = 900.92 > 900");
        deal(address(usdt), address(v), 891e18);
        v.lockIfBelowFloor();
        assertTrue(v.cashLocked(), "891 * 1.01 = 899.91 <= 900");
    }

    // ------------------------------------------------------------------ lead: the lock survives a reverting call

    function test_lead_lockSurvivesAKeeperCallThatCannotTrade() public {
        FloorVault v = _oneVault();
        _hold1(v, 400, 600);
        pool1.setTick(TICK_100 - 3567, TICK_100 - 3567);
        vm.prank(keeper);
        v.rebalance(IFloorVault.Swap(0, true, 1e18, address(agg), "")); // wrong direction: ends, does not revert
        assertTrue(v.cashLocked(), "the lock persisted");
    }

    function test_lead_lockSurvivesAPublicCallThatCannotTrade() public {
        FloorVault v = _oneVault();
        _hold1(v, 0, 600);
        deal(address(stock1), address(v), 1e16); // 0.7 USDT of stock at the crashed price: under the sell minimum
        pool1.setTick(TICK_100 - 3567, TICK_100 - 3567);
        vm.warp(20_004 days + 16 hours);
        v.rebalancePublic(0); // locks, then has nothing to trade: ends instead of reverting NoTradeNeeded
        assertTrue(v.cashLocked(), "the lock persisted");
    }

    function test_lead_lockedVault_unpricedTokenDoesNotBlockSellsOfOthers() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        deal(address(stock1), address(v), 2e18);
        deal(address(stock2), address(v), 1e18);
        deal(address(usdt), address(v), 480e18);
        pool1.setTick(TICK_100 - 3567, TICK_100 - 3567);
        pool2.setTick(TICK_100 - 3567, TICK_100 - 3567);
        v.lockIfBelowFloor();
        assertTrue(v.cashLocked());
        pool2.setRevertObserve(true); // stock2 has no TWAP any more
        (bool needed, uint8 idx, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && !buy && idx == 0, "stock1 is still sold");
    }

    // ------------------------------------------------------------------ #2: disabled token spot push

    function test_F2_disabledTokenSpotPush_doesNotMakeTheVaultSellActiveTokens() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w); // F = 900
        vm.prank(owner);
        factory.disableAsset(address(stock2));
        // V = 1000: E* = 400, T1 = 240 (60%), stock2 is disabled with 50 USDT of stock
        deal(address(stock1), address(v), 2.4e18);
        deal(address(stock2), address(v), 0.5e18);
        deal(address(usdt), address(v), 710e18);
        (bool needed, uint8 idx,,,,,,) = v.previewRebalance();
        assertFalse(needed && idx == 0, "control: on target");
        // the attacker pushes the disabled pool's SPOT (not the TWAP): the guard fails
        pool2.setTick(TICK_100, TICK_100 + 2000);
        (uint256 V,,) = v.valuation();
        assertApproxEqAbs(V, 1000e18, 1e17, "the disabled token keeps its last good TWAP value in V");
        (needed, idx,,,,,,) = v.previewRebalance();
        assertFalse(needed, "no sale of the active token and no buy");
    }

    // ------------------------------------------------------------------ leads: zero price

    function test_lead_zeroTwap_isNotAPriceAndBlocksCloseToUSDT() public {
        FloorVault v = _oneVault();
        deal(address(stock1), address(v), 5e18);
        pool1.setTick(-430_000, -430_000); // WAD price rounds to 0
        (, bool ok) = _tryTwap(v);
        assertFalse(ok, "twapOf rejects a zero price");
        vm.prank(user);
        vm.expectRevert(IFloorVault.StockNotUnwound.selector);
        v.closeToUSDT();
    }

    function _tryTwap(FloorVault v) internal view returns (uint256 p, bool ok) {
        try v.twapOf(address(pool1), false) returns (uint256 r) {
            return (r, true);
        } catch {
            return (0, false);
        }
    }

    // ------------------------------------------------------------------ leads: restart of the public delay

    function test_lead_noStateChange_doesNotRestartPublicDelay() public {
        assertEq(factory.tradingResumedAt(), 0);
        vm.startPrank(guardian);
        factory.unpause();
        factory.setHalted(false);
        factory.setNonTradingDay(20_100, false);
        vm.stopPrank();
        assertEq(factory.tradingResumedAt(), 0, "nothing changed, nothing restarted");
        vm.prank(guardian);
        factory.pause();
        vm.warp(block.timestamp + 5);
        vm.prank(guardian);
        factory.unpause();
        assertEq(factory.tradingResumedAt(), block.timestamp, "a real unpause restarts it");
    }

    function test_lead_clearingARealHoliday_restartsThePublicDelay() public {
        vm.prank(guardian);
        factory.setNonTradingDay(20_000, true);
        vm.warp(block.timestamp + 7);
        vm.prank(guardian);
        factory.setNonTradingDay(20_000, false);
        assertEq(factory.tradingResumedAt(), block.timestamp);
    }

    function test_lead_haltOnOffRestartsOnlyOnTheRealChange() public {
        vm.prank(guardian);
        factory.setHalted(true);
        vm.warp(block.timestamp + 3);
        vm.prank(guardian);
        factory.setHalted(true); // already halted
        assertEq(factory.tradingResumedAt(), 0);
        vm.prank(guardian);
        factory.setHalted(false);
        assertEq(factory.tradingResumedAt(), block.timestamp);
    }

    // ------------------------------------------------------------------ leads: createPosition checks

    function test_lead_everyBasketTargetMustReachMinTrade() public {
        (address[] memory a, uint16[] memory w) = _two();
        w[0] = 9500;
        w[1] = 500; // 5% of E* = 40 is 2 USDT: this token would never be bought
        usdt.mint(user, 100e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 100e18);
        vm.expectRevert(FloorFactory.PositionTooSmall.selector);
        factory.createPosition(100e18, 9000, 30 days, a, w);
        vm.stopPrank();
    }

    function test_lead_floorTooHighForTheFirstBuyBand_isRejected() public {
        IFloorFactory.Defaults memory d = _defaults();
        d.buyBandBps = 1000;
        vm.prank(owner);
        factory.setDefaults(d);
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        usdt.mint(user, 1000e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 1000e18);
        // floor 98%: E* = 80 = 8% of V, under the 10% buy band: the vault could never buy
        vm.expectRevert(IFloorFactory.BadFloor.selector);
        factory.createPosition(1000e18, 9800, 30 days, a, w);
        factory.createPosition(1000e18, 9500, 30 days, a, w); // E* = 200 = 20%: fine
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ leads: exitInKind with long return data

    function test_lead_exitInKind_longReturnDataIsNotASkip() public {
        FloorVault v = _oneVault();
        deal(address(stock1), address(v), 3e18);
        vm.mockCall(
            address(stock1),
            abi.encodeCall(IERC20.transfer, (user, 3e18)),
            abi.encode(uint256(1), uint256(2)) // 64 bytes
        );
        vm.recordLogs();
        vm.prank(user);
        v.exitInKind(user);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (, address[] memory skipped) = abi.decode(logs[logs.length - 1].data, (uint256, address[]));
        assertEq(skipped.length, 0, "a successful call with long return data is not skipped");
    }
}
