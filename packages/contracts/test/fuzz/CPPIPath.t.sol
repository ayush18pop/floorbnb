// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorFactory} from "../../src/FloorFactory.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {CPPIMath} from "../../src/libs/CPPIMath.sol";
import {FullMath} from "../../src/libs/vendor/FullMath.sol";
import {MockRouter} from "../mocks/MockRouter.sol";
import {System} from "../invariant/handlers/System.sol";

/// @notice Fuzz tests from docs/CONTRACTS.md section 12: random price paths, rounding (I6), hostile keeper amounts
///         (I10), random weights and floors. Uses the real factory and vault through the invariant `System`.
contract CPPIPathFuzzTest is Test {
    uint256 internal constant T0 = 20_000 days + 16 hours; // Friday 16:00 UTC

    System internal sys;
    FloorFactory internal fac;
    address internal keeper = makeAddr("keeper");
    address internal guardian = makeAddr("guardian");
    address internal owner = makeAddr("owner");
    address internal userA = makeAddr("userA");
    address internal userB = makeAddr("userB");

    function setUp() public {
        vm.warp(T0);
        sys = new System(keeper, guardian, owner, userA, userB);
        fac = sys.factory();
        vm.prank(owner);
        fac.acceptOwnership();
    }

    // ---------------------------------------------------------------- helpers

    function _open(address user, uint256 amt, uint16 floorBps, address[] memory a, uint16[] memory w)
        internal
        returns (FloorVault v)
    {
        sys.usdt().mint(user, amt);
        vm.startPrank(user);
        IERC20(address(sys.usdt())).approve(address(fac), amt);
        v = FloorVault(fac.createPosition(amt, floorBps, 365 days, a, w));
        vm.stopPrank();
    }

    function _one(address token) internal pure returns (address[] memory a, uint16[] memory w) {
        a = new address[](1);
        a[0] = token;
        w = new uint16[](1);
        w[0] = 10_000;
    }

    function _setTick(int24 t) internal {
        sys.pool1().setTick(t, t);
        sys.pool2().setTick(t, t);
        sys.syncRates();
    }

    function _nextWindow() internal {
        uint256 day = block.timestamp / 1 days + 1;
        while ((day + 3) % 7 >= 5) day++;
        vm.warp(day * 1 days + 16 hours);
    }

    /// @dev One honest keeper trade through the aggregator mock at the exact oracle price. Returns false if none needed.
    function _trade(FloorVault v) internal returns (bool) {
        (bool needed, uint8 idx, bool buy, address tin, address tout, uint256 amt,,) = v.previewRebalance();
        if (!needed) return false;
        address token = v.assetAt(idx);
        uint256 p = sys.price(token == address(sys.stock1()) ? sys.pool1() : sys.pool2());
        uint256 out = buy ? amt * 1e18 / p : amt * p / 1e18;
        bytes memory data = abi.encodeCall(MockRouter.swapExact, (tin, tout, amt, out, address(v)));
        IFloorVault.Swap memory sw = IFloorVault.Swap(idx, buy, amt, address(sys.aggregator()), data);
        vm.prank(keeper);
        v.rebalance(sw);
        return true;
    }

    function _settle(FloorVault v) internal {
        for (uint256 i; i < 6; ++i) {
            if (!_trade(v)) return;
            vm.warp(block.timestamp + 901);
            if (!fac.isTradingOpen(block.timestamp)) return;
        }
    }

    // ------------------------------------------------------- random price path

    /// @notice Gaps up to 1/m (25%) cannot push V below F by more than the band excess times the gap.
    /// Derivation: loss = E * g, E <= 4 C + slack, so V' >= F + C (1 - 4 g) - slack * g >= F - slack * g for g <= 25%.
    function testFuzz_pricePath_floorHoldsUnderGaps(int16[8] memory raw) public {
        FloorVault v = _open(userA, 1000e18, 9000, _oneArr(address(sys.stock1())), _oneW());
        int24 tick = sys.TICK0();
        for (uint256 i; i < 8; ++i) {
            // step in [-2800, +3000] ticks: worst drop 1 - 1.0001^-2800 = 24.4% (< 25%)
            int24 step = int24(int256(bound(int256(raw[i]), -2800, 3000)));
            _nextWindow();
            _settle(v);
            (uint256 vPrev,, uint256[3] memory sv) = v.valuation();
            uint256 ePrev = sv[0];
            uint256 floor_ = v.floor();

            tick = int24(int256(tick) + step);
            if (tick < sys.TICK0() - 9000) tick = sys.TICK0() - 9000;
            if (tick > sys.TICK0() + 9000) tick = sys.TICK0() + 9000;
            _setTick(tick);
            (uint256 vMove,,) = v.valuation();

            if (vPrev >= floor_ && vMove < vPrev) {
                uint256 slack = vPrev * v.sellBandBps() / 10_000;
                if (v.minTrade() > slack) slack = v.minTrade();
                // gap as a fraction of E: g = (vPrev - vMove) / ePrev <= 25%
                if (ePrev > 0) assertLe((vPrev - vMove) * 4, ePrev + 1e6, "single-step drop above 25% of exposure");
                // E_prev <= 4 C_prev + slack
                uint256 cPrev = vPrev - floor_;
                assertLe(ePrev, 4 * cPrev + slack + 1e6, "exposure above M*C + slack before the gap");
                // floor holds up to slack * g (g <= 25%)
                assertGe(vMove + slack / 4 + 1e6, floor_, "floor broken by a sub-25% gap");
            }
            assertLe(sv[0], vPrev, "exposure above V");
        }
    }

    /// @notice Larger gaps: only the position's own loss, nothing leaks, balances conserved across the system.
    function testFuzz_pricePath_bigGapsLossStaysInside(int16[4] memory raw) public {
        FloorVault v = _open(userA, 1000e18, 9000, _oneArr(address(sys.stock1())), _oneW());
        FloorVault w = _open(userB, 1000e18, 9000, _oneArr(address(sys.stock1())), _oneW());
        int24 tick = sys.TICK0();
        for (uint256 i; i < 4; ++i) {
            _nextWindow();
            _settle(v);
            uint256 wUsdt = sys.usdt().balanceOf(address(w));
            uint256 wStock = sys.stock1().balanceOf(address(w));
            tick = int24(int256(tick) + int256(bound(int256(raw[i]), -6000, 6000)));
            if (tick < sys.TICK0() - 9000) tick = sys.TICK0() - 9000;
            if (tick > sys.TICK0() + 9000) tick = sys.TICK0() + 9000;
            _setTick(tick);
            _settle(v);
            // vault w was never touched by the keeper: its balances are unchanged (I9)
            assertEq(sys.usdt().balanceOf(address(w)), wUsdt);
            assertEq(sys.stock1().balanceOf(address(w)), wStock);
            // I5: below the floor the target is zero
            (uint256 V,,) = v.valuation();
            (, uint256 e,) = v.targets();
            if (V <= v.floor()) assertEq(e, 0);
        }
    }

    /// @notice Random floors, weights and deposits: targets are consistent and the first rebalance lands on target.
    function testFuzz_randomBasketAndFloor(uint16 floorBps, uint16 w0, uint16 w1, uint96 dep) public {
        floorBps = uint16(bound(floorBps, 5000, 9800));
        uint256 amt = bound(dep, 500e18, 1000e18); // C >= 10: E* >= 40, so the larger weight reaches minTrade
        w0 = uint16(bound(w0, 1, 9998));
        w1 = uint16(bound(w1, 1, 9999 - w0));
        uint16 w2 = 10_000 - w0 - w1;
        address[] memory a = new address[](2);
        uint16[] memory w = new uint16[](2);
        a[0] = address(sys.stock1());
        a[1] = address(sys.stock2());
        w[0] = w0;
        w[1] = 10_000 - w0;
        w2;
        FloorVault v = _open(userA, amt, floorBps, a, w);

        (uint256 c, uint256 e, uint256[3] memory t) = v.targets();
        uint256 floor_ = FullMath.mulDivRoundingUp(amt, floorBps, 10_000);
        assertEq(v.floor(), floor_);
        assertEq(c, amt - floor_);
        assertEq(e, amt < 4 * c ? amt : 4 * c, "E* = min(4C, V)");
        assertLe(t[0] + t[1], e);
        _settle(v);
        (uint256 V,, uint256[3] memory sv) = v.valuation();
        assertApproxEqAbs(V, amt, 1e9, "no cost: V unchanged by honest trades");
        assertLe(sv[0] + sv[1], e + 1e9);
    }

    // ------------------------------------------------------------ rounding I6

    function testFuzz_I6_rounding(uint256 deposit, uint16 bps, uint256 stock, uint256 price, uint256 usdt) public pure {
        deposit = bound(deposit, 1, 1e30);
        bps = uint16(bound(bps, 5000, 9800));
        stock = bound(stock, 0, 1e30);
        price = bound(price, 1, 1e24);
        usdt = bound(usdt, 0, 1e30);

        // F rounds up
        uint256 F = CPPIMath.floorFor(deposit, bps);
        assertGe(F * 10_000, deposit * bps, "F understated");
        assertLt(F * 10_000, deposit * bps + 10_000, "F overstated by more than one unit");

        // V rounds down
        uint256 val = CPPIMath.valueOf(stock, price);
        assertLe(val * 1e18, stock * price, "value overstated");
        assertGt((val + 1) * 1e18, stock * price, "value understated by more than one unit");

        // E* rounds down and is bounded by V and m*C
        uint256 V = usdt + val;
        uint256 C = CPPIMath.cushion(V, F);
        uint256 E = CPPIMath.exposureTarget(C, V);
        assertLe(E, V);
        assertLe(E * 1e18, C * 4e18, "E* overstated");
        // T_i sum never exceeds E*
        uint256 T0_ = CPPIMath.assetTarget(E, 3333);
        uint256 T1_ = CPPIMath.assetTarget(E, 3333);
        uint256 T2_ = CPPIMath.assetTarget(E, 3334);
        assertLe(T0_ + T1_ + T2_, E);
        // C is zero when V <= F: cash lock (I5)
        if (V <= F) {
            assertEq(C, 0);
            assertEq(E, 0);
        }
    }

    // ------------------------------------------------------ hostile amountIn I10

    function testFuzz_I10_hostileAmounts(uint256 amt, bool flip, uint8 idxRaw) public {
        FloorVault v = _open(userA, 1000e18, 9000, _oneArr(address(sys.stock1())), _oneW());
        (,, bool pBuy,,, uint256 computed,,) = v.previewRebalance();
        amt = bound(amt, 0, computed * 3);
        bool buy = flip ? !pBuy : pBuy;
        uint8 idx = idxRaw % 3;
        address tin = buy ? address(sys.usdt()) : address(sys.stock1());
        address tout = buy ? address(sys.stock1()) : address(sys.usdt());
        uint256 p = sys.price(sys.pool1());
        uint256 out = buy ? amt * 1e18 / p : amt * p / 1e18;
        bytes memory data = abi.encodeCall(MockRouter.swapExact, (tin, tout, amt, out, address(v)));
        IFloorVault.Swap memory sw = IFloorVault.Swap(idx, buy, amt, address(sys.aggregator()), data);
        vm.prank(keeper);
        try v.rebalance(sw) {
            assertEq(idx, 0);
            assertEq(buy, pBuy);
            assertGe(amt, computed / 2);
            assertLe(amt, computed);
        } catch {}
    }

    function _oneArr(address t) internal pure returns (address[] memory a) {
        a = new address[](1);
        a[0] = t;
    }

    function _oneW() internal pure returns (uint16[] memory w) {
        w = new uint16[](1);
        w[0] = 10_000;
    }
}
