// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TwapOracle} from "../../src/libs/TwapOracle.sol";
import {MockPool} from "../mocks/MockPool.sol";

contract TwapHarness {
    function twapTick(address pool, uint32 w) external view returns (int24) {
        return TwapOracle.twapTick(pool, w);
    }

    function check(address pool, int24 avg, uint16 dev, uint128 minLiq) external view {
        TwapOracle.check(pool, avg, dev, minLiq);
    }
}

contract TwapOracleTest is Test {
    TwapHarness h = new TwapHarness();
    address constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436; // token0 (below USDT)
    address constant USDT = 0x55d398326f99059fF775485246999027B3197955;

    /// CONTRACTS.md section 2: tick 54,624 with token0 = NVDAB gives 235.6 USDT per NVDAB (+-0.1%).
    function test_nvdab_tick54624() public pure {
        uint256 p = TwapOracle.priceWad(54_624, false);
        assertApproxEqRel(p, 235.6e18, 0.001e18);
    }

    /// Token order flips the direction: with USDT as token0 the same stock price is the inverse ratio.
    function test_tokenOrderBothWays() public pure {
        // tick -54,624 with USDT token0 is the mirror of tick 54,624 with the stock token0
        uint256 a = TwapOracle.priceWad(54_624, false);
        uint256 b = TwapOracle.priceWad(-54_624, true);
        assertApproxEqRel(a, b, 1e12); // 1e-6, rounding only
        // price at tick 0 is exactly 1.0 either way
        assertEq(TwapOracle.priceWad(0, false), 1e18);
        assertEq(TwapOracle.priceWad(0, true), 1e18);
        // USDT token0 and a positive tick means the stock is cheap in USDT: below 1
        assertLt(TwapOracle.priceWad(1000, true), 1e18);
        assertGt(TwapOracle.priceWad(1000, false), 1e18);
    }

    function test_twapTick_average() public {
        MockPool pool = new MockPool(NVDAB, USDT, 2500);
        pool.setTick(54_613, 54_624);
        assertEq(h.twapTick(address(pool), 600), 54_613);
        pool.setTick(-123, -120);
        assertEq(h.twapTick(address(pool), 600), -123);
    }

    /// Uniswap rounds the average tick toward negative infinity when the delta is negative and inexact.
    function test_twapTick_negativeRoundsDown() public {
        MockPool pool = new MockPool(NVDAB, USDT, 2500);
        // delta = newer - older = -601 over 600 s: -1.0017 -> -2 (truncation would give -1)
        pool.setRawCumulatives(1000, 399);
        assertEq(h.twapTick(address(pool), 600), -2);
        // exact negative: -600 / 600 = -1, no adjustment
        pool.setRawCumulatives(1000, 400);
        assertEq(h.twapTick(address(pool), 600), -1);
        // positive inexact truncates down as usual: 601 / 600 = 1
        pool.setRawCumulatives(0, 601);
        assertEq(h.twapTick(address(pool), 600), 1);
    }

    function test_observeRevert_isHistoryTooShort() public {
        MockPool pool = new MockPool(NVDAB, USDT, 2500);
        pool.setRevertObserve(true);
        vm.expectRevert(TwapOracle.OracleHistoryTooShort.selector);
        h.twapTick(address(pool), 600);
    }

    function test_check_priceDeviationAndLiquidity() public {
        MockPool pool = new MockPool(NVDAB, USDT, 2500);
        pool.setTick(1000, 1300);
        h.check(address(pool), 1000, 300, 1); // exactly at the limit passes
        pool.setTick(1000, 1301);
        vm.expectRevert(TwapOracle.PriceDeviation.selector);
        h.check(address(pool), 1000, 300, 1);
        pool.setTick(1000, 700);
        h.check(address(pool), 1000, 300, 1); // -300 passes
        pool.setLiquidity(5);
        vm.expectRevert(TwapOracle.PoolIlliquid.selector);
        h.check(address(pool), 1000, 300, 10);
    }
}
