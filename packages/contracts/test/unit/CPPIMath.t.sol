// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CPPIMath} from "../../src/libs/CPPIMath.sol";

/// @dev Harness so library reverts can be caught with vm.expectRevert.
contract CPPIHarness {
    function floorFor(uint256 d, uint256 b) external pure returns (uint256) {
        return CPPIMath.floorFor(d, b);
    }
}

contract CPPIMathTest is Test {
    uint256 constant P = 100e18; // stock price, USDT per share
    uint256 constant SELL_BAND = 100;
    uint256 constant BUY_BAND = 200;
    uint256 constant MIN_TRADE = 20e18;
    uint256 constant MAX = type(uint256).max;

    function _targets(uint256 stock, uint256 usdt, uint256 F)
        internal
        pure
        returns (uint256 V, uint256 C, uint256 E, uint256 T)
    {
        V = usdt + CPPIMath.valueOf(stock, P);
        C = CPPIMath.cushion(V, F);
        E = CPPIMath.exposureTarget(C, V);
        T = CPPIMath.assetTarget(E, 10_000);
    }

    /// CONTRACTS.md section 5, step 0: D = 10,000, F = 9,000. V 10,000, C 1,000, E* 4,000.
    function test_step0_deposit() public pure {
        uint256 D = 10_000e18;
        uint256 F = CPPIMath.floorFor(D, 9000);
        assertEq(F, 9000e18);
        (uint256 V, uint256 C, uint256 E, uint256 T) = _targets(0, D, F);
        assertEq(V, 10_000e18);
        assertEq(C, 1000e18);
        assertEq(E, 4000e18);
        assertEq(T, 4000e18);
        assertEq(CPPIMath.buyAmount(0, T, V, D, BUY_BAND, MIN_TRADE, MAX), 4000e18); // buy 4,000
        assertEq(CPPIMath.sellAmount(0, T, V, E, SELL_BAND, MIN_TRADE, MAX), 0);
    }

    /// Step 1: stock -10% -> stock 3,600, USDT 6,000. V 9,600, C 600, E* 2,400, sell 1,200.
    function test_step1_down10() public pure {
        uint256 F = 9000e18;
        uint256 stock = 36e18; // 3,600 USDT at P = 100
        (uint256 V, uint256 C, uint256 E, uint256 T) = _targets(stock, 6000e18, F);
        assertEq(V, 9600e18);
        assertEq(C, 600e18);
        assertEq(E, 2400e18);
        uint256 Ei = CPPIMath.valueOf(stock, P);
        uint256 sellValue = CPPIMath.sellAmount(Ei, T, V, E, SELL_BAND, MIN_TRADE, MAX);
        assertEq(sellValue, 1200e18);
        assertEq(CPPIMath.sellAmountIn(sellValue, P, stock), 12e18); // 12 shares
    }

    /// Step 2: stock -10% again -> stock 2,160, USDT 7,200. V 9,360, C 360, E* 1,440, sell 720.
    function test_step2_down10Again() public pure {
        uint256 F = 9000e18;
        uint256 stock = 21.6e18;
        (uint256 V, uint256 C, uint256 E, uint256 T) = _targets(stock, 7200e18, F);
        assertEq(V, 9360e18);
        assertEq(C, 360e18);
        assertEq(E, 1440e18);
        assertEq(CPPIMath.sellAmount(CPPIMath.valueOf(stock, P), T, V, E, SELL_BAND, MIN_TRADE, MAX), 720e18);
    }

    /// Step 3: from stock 1,440 / USDT 7,920 a -25% gap -> stock 1,080. V = 9,000 = F, C 0, E* 0, sell all 1,080.
    function test_step3_gap25_cashLock() public pure {
        uint256 F = 9000e18;
        uint256 stock = 10.8e18;
        (uint256 V, uint256 C, uint256 E, uint256 T) = _targets(stock, 7920e18, F);
        assertEq(V, 9000e18);
        assertEq(C, 0);
        assertEq(E, 0);
        assertEq(T, 0);
        assertEq(CPPIMath.sellAmount(CPPIMath.valueOf(stock, P), T, V, E, SELL_BAND, MIN_TRADE, MAX), 1080e18);
        // below floor still gives zero cushion, never underflows
        assertEq(CPPIMath.cushion(8000e18, F), 0);
    }

    /// Step 0': from step 0, stock +10% -> stock 4,400, USDT 6,000. V 10,400, C 1,400, E* 5,600, buy 1,200.
    function test_step0prime_up10() public pure {
        uint256 F = 9000e18;
        uint256 stock = 44e18;
        (uint256 V, uint256 C, uint256 E, uint256 T) = _targets(stock, 6000e18, F);
        assertEq(V, 10_400e18);
        assertEq(C, 1400e18);
        assertEq(E, 5600e18);
        assertEq(CPPIMath.buyAmount(CPPIMath.valueOf(stock, P), T, V, 6000e18, BUY_BAND, MIN_TRADE, MAX), 1200e18);
    }

    function test_clampExposureToV_whenFloorSmall() public pure {
        // F tiny: 4 * C > V, so E* = V
        assertEq(CPPIMath.exposureTarget(900e18, 1000e18), 1000e18);
    }

    function test_bands_blockSmallTrades() public pure {
        uint256 V = 10_000e18;
        // sell: 0.5% of V is under the 1% band
        assertEq(CPPIMath.sellAmount(1050e18, 1000e18, V, 4000e18, SELL_BAND, MIN_TRADE, MAX), 0);
        // exactly 1% of V triggers
        assertEq(CPPIMath.sellAmount(1100e18, 1000e18, V, 4000e18, SELL_BAND, MIN_TRADE, MAX), 100e18);
        // buy: 1.9% under the 2% band, 2% triggers
        assertEq(CPPIMath.buyAmount(0, 190e18, V, V, BUY_BAND, MIN_TRADE, MAX), 0);
        assertEq(CPPIMath.buyAmount(0, 200e18, V, V, BUY_BAND, MIN_TRADE, MAX), 200e18);
    }

    function test_minTrade_andFullUnwind() public pure {
        // below minTrade: ignored
        assertEq(CPPIMath.buyAmount(0, 10e18, 100e18, 100e18, 0, MIN_TRADE, MAX), 0);
        // full unwind sells even above-band-less dust >= minTrade, ignores below minTrade
        assertEq(CPPIMath.sellAmount(25e18, 0, 100e18, 0, SELL_BAND, MIN_TRADE, MAX), 25e18);
        assertEq(CPPIMath.sellAmount(19e18, 0, 100e18, 0, SELL_BAND, MIN_TRADE, MAX), 0);
    }

    function test_buyCappedByUsdtBalance_andMaxTrade() public pure {
        assertEq(CPPIMath.buyAmount(0, 500e18, 1000e18, 300e18, BUY_BAND, MIN_TRADE, MAX), 300e18);
        assertEq(CPPIMath.buyAmount(0, 500e18, 1000e18, 1000e18, BUY_BAND, MIN_TRADE, 100e18), 100e18);
        assertEq(CPPIMath.sellAmount(500e18, 0, 1000e18, 0, SELL_BAND, MIN_TRADE, 100e18), 100e18);
    }

    function test_floorRoundsUp_edges() public {
        assertEq(CPPIMath.floorFor(1, 5000), 1); // ceil(0.5)
        assertEq(CPPIMath.floorFor(1, 9800), 1); // ceil(0.98)
        assertEq(CPPIMath.floorFor(3, 5000), 2); // ceil(1.5)
        assertEq(CPPIMath.floorFor(1e30, 9800), 9.8e29);
        assertEq(CPPIMath.floorFor(1e30, 5000), 5e29);
        assertEq(CPPIMath.floorFor(0, 9000), 0);
        // I6: floorFor >= D * bps / BPS
        assertGe(CPPIMath.floorFor(12_345_678_901_234_567, 9137) * 10_000, uint256(12_345_678_901_234_567) * 9137);
        CPPIHarness h = new CPPIHarness();
        assertEq(h.floorFor(10_000e18, 9000), 9000e18);
    }

    function test_minOut_roundsDown_bothDirections() public pure {
        // sell 12 shares at 100, tol 30 bps: 1200 * 0.997 = 1196.4
        assertEq(CPPIMath.minOut(12e18, P, 30, false), 1196.4e18);
        // buy with 1000 USDT at 100, tol 100 bps: 10 * 0.99 = 9.9 shares
        assertEq(CPPIMath.minOut(1000e18, P, 100, true), 9.9e18);
        // odd values round down
        assertEq(CPPIMath.minOut(1, 3e18, 30, false), 2); // floor(3 * 0.997) = 2
    }

    function test_amountInWindow() public pure {
        assertTrue(CPPIMath.amountInOk(100, 100));
        assertTrue(CPPIMath.amountInOk(50, 100));
        assertFalse(CPPIMath.amountInOk(49, 100));
        assertFalse(CPPIMath.amountInOk(101, 100));
    }

    /// I6 as a fuzz: exposure never exceeds the exact M * C and never exceeds V; floor never below the exact value.
    function testFuzz_rounding(uint128 D, uint16 bps, uint128 V) public pure {
        bps = uint16(bound(bps, 5000, 9800));
        uint256 F = CPPIMath.floorFor(D, bps);
        assertGe(F * 10_000, uint256(D) * bps);
        uint256 C = CPPIMath.cushion(V, F);
        uint256 E = CPPIMath.exposureTarget(C, V);
        assertLe(E, uint256(V));
        assertLe(E * 1e18, C * 4e18);
    }
}
