// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";

/// @dev Exposes the vault's own `_plan` so the SDK mirror (`cppi.planSwap`) is tested against the real contract code.
contract PlanHarness is FloorVault {
    struct In {
        uint256 Ei;
        uint256 Ti;
        uint256 V;
        uint256 estar;
        bool active;
        uint256 usdtBal;
        uint256 price;
        uint256 bal;
        uint256 sb;
        uint256 bb;
        uint256 mul;
        uint256 mt;
        uint256 dust_;
        uint256 mx;
        bool anyFailed;
        uint256 w; // weight bps of the asset (sell band is scaled by it)
        bool noPrice;
        bool closing; // vault status Closing (lifecycle unwind)
    }

    function plan(In memory x) external returns (bool buy, uint256 value, uint256 amountIn) {
        sellBandBps = uint16(x.sb);
        buyBandBps = uint16(x.bb);
        minTrade = x.mt;
        dust = x.dust_;
        State memory st;
        st.V = x.V;
        st.usdtBal = x.usdtBal;
        st.estar = x.estar;
        st.bal[0] = x.bal;
        st.price[0] = x.price;
        st.anyFailed = x.anyFailed;
        st.noPrice = x.noPrice;
        weightBps[0] = uint16(x.w);
        maturity = type(uint40).max;
        status = x.closing ? Status.Closing : Status.Active;
        st.value[0] = x.Ei;
        st.target[0] = x.Ti;
        st.cfg[0].active = x.active;
        st.cfg[0].maxTradeValue = x.mx;
        return _plan(st, 0, x.mul);
    }
}

/// @notice Differential vectors for `packages/sdk/src/cppi.ts planSwap`. Run with `GEN_PLAN_VECTORS=1 forge test
///         --match-test test_genPlanVectors -vv` and copy the JSON line into packages/sdk/test/plan-vectors.json.
contract PlanVectorsTest is Test {
    PlanHarness h = new PlanHarness();

    function _r(uint256 seed, uint256 lo, uint256 hi) internal pure returns (uint256) {
        return lo + (uint256(keccak256(abi.encode(seed))) % (hi - lo + 1));
    }

    function _in(uint256 i) internal pure returns (PlanHarness.In memory x) {
        uint256 s = i * 100;
        x.price = _r(s + 1, 50e18, 900e18);
        x.dust_ = _r(s + 2, 1e17, 5e18);
        x.mt = _r(s + 3, 1e18, 60e18);
        x.mx = _r(s + 4, 100e18, 5000e18);
        x.sb = _r(s + 5, 10, 500);
        x.bb = _r(s + 6, 10, 500);
        x.mul = 1 + (i % 2);
        x.V = _r(s + 7, 100e18, 50_000e18);
        x.active = (i % 5) != 0;
        // every third vector is a full unwind, with stock biased toward the dust..minTrade band
        bool unwind = i % 3 == 0;
        x.estar = unwind ? 0 : _r(s + 8, 1e18, x.V);
        x.Ei = (i % 4 == 0) ? _r(s + 9, x.dust_ / 2, x.mt + 2e18) : _r(s + 9, 0, x.V);
        x.Ti = x.estar == 0 ? 0 : _r(s + 10, 0, x.estar);
        x.bal = x.Ei * 1e18 / x.price;
        x.usdtBal = _r(s + 11, 0, 20_000e18);
        x.anyFailed = (i % 7) == 0;
        x.w = _r(s + 12, 1000, 10_000);
        x.noPrice = (i % 11) == 0;
        x.closing = (i % 13) == 0;
        // every sixth vector is a small CPPI sell (gap between the band and minTrade, Pashov 02 #4)
        if (i % 6 == 1 && !unwind) {
            x.V = _r(s + 13, 100e18, 1500e18);
            x.sb = 20;
            x.w = 10_000;
            x.estar = _r(s + 14, 50e18, x.V);
            x.Ti = _r(s + 15, 0, x.estar);
            x.Ei = x.Ti + _r(s + 16, 4e18, x.mt);
            x.bal = x.Ei * 1e18 / x.price;
            x.active = true;
            x.noPrice = false;
            x.closing = false;
            x.mul = 1;
        }
    }

    /// Sanity on the pinned rule itself (no JSON): a full-unwind residue between dust and minTrade IS sold.
    function test_unwind_residueAboveDustIsSold_belowIsNot() public {
        PlanHarness.In memory x;
        x.price = 100e18;
        x.dust_ = 1e18;
        x.mt = 20e18;
        x.mx = 1000e18;
        x.sb = 100;
        x.bb = 200;
        x.mul = 1;
        x.w = 10_000;
        x.V = 1000e18;
        x.active = true;
        x.estar = 0;
        x.Ei = 15e18;
        x.bal = 0.15e18;
        (bool buy, uint256 v,) = h.plan(x);
        assertTrue(!buy && v == 15e18, "15 USDT residue (dust 1, minTrade 20) is sold");
        x.Ei = 1e18; // == dust: not sold
        x.bal = 0.01e18;
        (buy, v,) = h.plan(x);
        assertEq(v, 0, "residue == dust stays");
    }

    function test_genPlanVectors() public {
        if (!vm.envOr("GEN_PLAN_VECTORS", false)) return;
        string memory out = "[";
        for (uint256 i; i < 120; ++i) {
            PlanHarness.In memory x = _in(i);
            (bool buy, uint256 value, uint256 amountIn) = h.plan(x);
            out = string.concat(out, i == 0 ? "" : ",", _j(x, buy, value, amountIn));
        }
        console2.log(string.concat("PLANVECTORS", out, "]"));
    }

    function _j(PlanHarness.In memory x, bool buy, uint256 value, uint256 amountIn)
        internal
        pure
        returns (string memory)
    {
        string memory a = string.concat(
            '{"Ei":"', vm.toString(x.Ei), '","Ti":"', vm.toString(x.Ti), '","V":"', vm.toString(x.V), '"'
        );
        a = string.concat(a, ',"estar":"', vm.toString(x.estar), '","active":', x.active ? "true" : "false");
        a = string.concat(a, ',"usdtBal":"', vm.toString(x.usdtBal), '","price":"', vm.toString(x.price), '"');
        a = string.concat(a, ',"bal":"', vm.toString(x.bal), '","sb":"', vm.toString(x.sb), '"');
        a = string.concat(a, ',"bb":"', vm.toString(x.bb), '","mul":"', vm.toString(x.mul), '"');
        a = string.concat(a, ',"mt":"', vm.toString(x.mt), '","dust":"', vm.toString(x.dust_), '"');
        a = string.concat(a, ',"mx":"', vm.toString(x.mx), '","anyFailed":', x.anyFailed ? "true" : "false");
        a = string.concat(a, ',"w":"', vm.toString(x.w), '","noPrice":', x.noPrice ? "true" : "false");
        return string.concat(
            a,
            ',"buy":',
            buy ? "true" : "false",
            ',"value":"',
            vm.toString(value),
            '","amountIn":"',
            vm.toString(amountIn),
            '"}'
        );
    }
}
