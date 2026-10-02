// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FloorVault} from "../../../src/FloorVault.sol";
import {IFloorVault} from "../../../src/interfaces/IFloorVault.sol";
import {IPancakeV3SwapRouter} from "../../../src/interfaces/IPancakeV3SwapRouter.sol";
import {MockToken} from "../../mocks/MockToken.sol";
import {MockRouter} from "../../mocks/MockRouter.sol";
import {MockPool} from "../../mocks/MockPool.sol";
import {EvilRouter} from "../../mocks/evil/EvilRouter.sol";
import {HandlerBase} from "./HandlerBase.sol";
import {System} from "./System.sol";

/// @notice Hostile keeper. Every call picks a vault, an asset, a direction, an amount, a router and a swap payload,
///         most of them wrong on purpose. Successful calls are checked against CONTRACTS.md section 12 (I1, I3,
///         I5, I7, I9, I10) and the section 3 price guards. A violation is recorded in `violations`.
contract KeeperHandler is HandlerBase {
    constructor(System s) HandlerBase(s) {}

    struct Ctx {
        FloorVault v;
        bool needed;
        uint8 pIdx;
        bool pBuy;
        uint256 computed;
        uint8 idx;
        bool buy;
        uint256 amountIn;
        address router;
        uint256 haircut;
        uint256 pct;
        bool routerOk;
        bool tooSoon;
        bool beaconBad;
        bool multBad;
        bool closed;
        bool haveV;
        uint256 vBefore;
        uint256 eBefore;
        uint256 floor;
        Snap other;
        Snap self;
        bool[3] priced; // asset is priced by the vault (active, or still held)
    }

    // ------------------------------------------------------------- keeper path

    function rebalance(
        uint256 vSel,
        uint256 pct,
        uint256 haircut,
        uint256 routerSel,
        uint256 modeSel,
        uint256 assetSel,
        bool flip,
        uint256 randAmt
    ) external {
        _rebalance(vSel, pct, haircut, routerSel, modeSel, assetSel, flip, randAmt);
    }

    /// @dev Directed attack: hostile router on the two-asset vault (which holds a leaky token), no flip.
    function rebalanceEvil(uint256 pct, uint256 modeSel) external {
        _rebalance(1, pct, 0, 4, modeSel, 0, false, 0);
    }

    function _rebalance(
        uint256 vSel,
        uint256 pct,
        uint256 haircut,
        uint256 routerSel,
        uint256 modeSel,
        uint256 assetSel,
        bool flip,
        uint256 randAmt
    ) internal {
        Ctx memory c;
        c.v = vaultAt(vSel);
        (c.needed, c.pIdx, c.pBuy,,, c.computed,,) = _preview(c.v);

        uint256 r = routerSel % 8;
        c.router = sys.routerAt(r == 3 || r == 7 ? 1 : r == 4 ? 2 : r == 6 ? 3 : 0);

        c.haircut = haircut % 3 == 0 ? 0 : bound(haircut, 0, 80);
        pct = pct % 5 < 2 ? 100 : bound(pct, 0, 160);
        c.pct = pct;
        if (c.needed) {
            c.idx = c.pIdx;
            c.buy = flip ? !c.pBuy : c.pBuy;
            c.amountIn = c.computed * pct / 100;
        } else {
            c.idx = uint8(assetSel % c.v.nAssets());
            c.buy = flip;
            c.amountIn = bound(randAmt, 0, 500e18);
        }
        _pre(c);

        bytes memory data = _data(c, modeSel);
        IFloorVault.Swap memory sw = IFloorVault.Swap(c.idx, c.buy, c.amountIn, c.router, data);
        vm.prank(sys.keeper());
        try c.v.rebalance(sw) {
            _count("rebalance_ok");
            if (c.router == address(sys.evil())) _count("rebalance_ok_evil");
            _post(c, false);
        } catch {
            _count("rebalance_revert");
        }
    }

    // --------------------------------------------------------- permissionless path

    function rebalancePublic(uint256 vSel, uint256 assetSel) external {
        Ctx memory c;
        c.v = vaultAt(vSel);
        c.idx = uint8(assetSel % c.v.nAssets());
        _pre(c);
        bool tooEarly = uint256(c.v.lastRebalance()) + c.v.publicDelay() > block.timestamp;
        vm.prank(address(0xBEEF));
        try c.v.rebalancePublic(c.idx) {
            _count("public_ok");
            if (tooEarly) _violate("I10_publicEarly");
            _post(c, true);
        } catch {
            _count("public_revert");
        }
    }

    // ------------------------------------------------------------------ helpers

    function _preview(FloorVault v)
        internal
        view
        returns (bool needed, uint8 idx, bool buy, address tin, address tout, uint256 amt, uint256 mAgg, uint256 mDir)
    {
        try v.previewRebalance() returns (
            bool n, uint8 i, bool b, address a, address o, uint256 am, uint256 x, uint256 y
        ) {
            return (n, i, b, a, o, am, x, y);
        } catch {}
    }

    function _pool(address token) internal view returns (MockPool) {
        return token == address(sys.stock1()) ? sys.pool1() : sys.pool2();
    }

    function _pre(Ctx memory c) internal {
        address token = c.v.assetAt(c.idx);
        (c.routerOk,) = sys.factory().routerOk(c.router);
        c.tooSoon = uint256(c.v.lastTradeAt(c.idx)) + c.v.minInterval() > block.timestamp;
        c.beaconBad = sys.beacon().implementation() != sys.factory().approvedTokenImpl();
        c.multBad = MockToken(token).uiMultiplier() != sys.factory().lastMultiplier(token); // traded asset only
        c.closed = c.v.status() == IFloorVault.Status.Closed;
        c.floor = c.v.floor();
        c.other = _snap(address(otherVault(c.v)));
        c.self = _snap(address(c.v));
        for (uint256 i; i < c.v.nAssets(); ++i) {
            address t = c.v.assetAt(i);
            (,, bool active,,,) = sys.factory().assets(t);
            c.priced[i] = active || IERC20(t).balanceOf(address(c.v)) > 0;
        }
        try c.v.valuation() returns (uint256 V, uint256, uint256[3] memory sv) {
            c.haveV = true;
            c.vBefore = V;
            c.eBefore = sv[0] + sv[1] + sv[2];
        } catch {}
    }

    function _data(Ctx memory c, uint256 modeSel) internal view returns (bytes memory) {
        address token = c.v.assetAt(c.idx);
        (address tin, address tout) = c.buy ? (address(sys.usdt()), token) : (token, address(sys.usdt()));
        uint256 p = sys.price(_pool(token));
        uint256 fair = c.buy ? c.amountIn * 1e18 / p : c.amountIn * p / 1e18;
        uint256 out = fair * (10_000 - c.haircut) / 10_000;
        if (c.router == address(sys.pancake())) {
            return abi.encodeCall(
                IPancakeV3SwapRouter.exactInputSingle,
                (IPancakeV3SwapRouter.ExactInputSingleParams(
                        tin, tout, 2500, address(c.v), type(uint256).max, c.amountIn, 0, 0
                    ))
            );
        }
        if (c.router == address(sys.evil())) {
            return abi.encodeCall(EvilRouter.execute, (uint8(modeSel), tin, tout, c.amountIn, fair, THIEF));
        }
        return abi.encodeCall(MockRouter.swapExact, (tin, tout, c.amountIn, out, address(c.v)));
    }

    /// @dev Checks that run after a call that SUCCEEDED. Pre-state facts are in `c`.
    function _post(Ctx memory c, bool isPublic) internal {
        FloorVault v = c.v;
        // I7: no trade outside the window / on pause / halt / holiday (recomputed independently)
        if (!_windowOpen(block.timestamp)) _violate("I7_window");
        if (c.closed) _violate("I10_closedStatus");
        if (c.tooSoon) _violate("I10_tooSoon");
        if (!isPublic) {
            if (!c.routerOk) _violate("I10_router");
            if (!c.needed) _violate("I10_noTrade");
            if (c.needed && c.idx == c.pIdx) {
                if (c.buy != c.pBuy) _violate("I10_direction");
                if (c.amountIn > c.computed || c.amountIn < c.computed / 2) _violate("I10_size");
            }
            // tolerance bound on the router's payout (I1 input): haircut above the tolerance must not pass
            uint256 tol = c.router == address(sys.pancake()) ? 100 : 30;
            if (c.router == address(sys.aggregator()) && c.haircut > tol) _violate("I1_haircut");
        }
        if (c.buy && c.beaconBad) _violate("T7_buyWithChangedImpl");
        if (c.multBad) _violate("T8_multiplier");

        // section 3 guards on every pool the vault prices
        for (uint256 i; i < v.nAssets(); ++i) {
            if (!c.priced[i]) continue; // a disabled, empty asset is not priced (and need not be guarded)
            MockPool pl = _pool(v.assetAt(i));
            int256 d = int256(pl.spot()) - int256(pl.twapTick());
            if (d < 0) d = -d;
            if (d > 300) _violate("GUARD_deviation");
            if (pl.liquidity() < 1e20) _violate("GUARD_liquidity");
            if (pl.revertObserve()) _violate("GUARD_history");
            if (pl.cardinality() < 200) _violate("GUARD_cardinality");
        }

        // I5: no buy while V <= F
        if (c.haveV && c.vBefore <= c.floor && c.buy && !isPublic) _violate("I5_buyAtFloor");

        // I1 and I3 on the valuation after the swap (same tick, so a pure comparison)
        if (c.haveV) {
            (uint256 vAfter,, uint256[3] memory sv) = v.valuation();
            uint256 eAfter = sv[0] + sv[1] + sv[2];
            uint256 tolBps = isPublic || c.router == address(sys.pancake()) ? 100 : 30;
            uint256 tradeValue = isPublic ? c.vBefore : _tradeValue(c);
            uint256 allowedLoss = tradeValue * tolBps / 10_000 + 1e6;
            if (c.vBefore > vAfter && c.vBefore - vAfter > allowedLoss) _violate("I1_loss");
            if (eAfter > vAfter) _violate("I3_exposureAboveV");
            if (!isPublic && !c.buy && eAfter > c.eBefore) _violate("I3_sellRaisedExposure");
            // strict band form: single-asset vault, full-size trade
            if (!isPublic && address(v) == address(sys.vaultA()) && c.pct == 100 && c.needed && c.buy == c.pBuy) {
                uint256 cushion = vAfter > c.floor ? vAfter - c.floor : 0;
                uint256 slack = 4 * allowedLoss + vAfter * v.sellBandBps() / 10_000 + 1e6;
                if (eAfter > 4 * cushion + slack) _violate("I3_bandForm");
            }
        }
        if (isPublic && c.haveV && c.vBefore <= c.floor) {
            // public path may only sell below the floor
            (, uint256 eT,) = v.targets();
            if (eT != 0) _violate("I5_targetAtFloor");
        }

        // I2 / I9
        if (_thiefBalance() != 0) _violate("I2_thief");
        if (!_same(c.other, _snap(address(otherVault(v))))) _violate("I9_otherVaultMoved");
    }

    function _tradeValue(Ctx memory c) internal view returns (uint256) {
        if (c.buy) return c.amountIn;
        uint256 p = sys.price(_pool(c.v.assetAt(c.idx)));
        return c.amountIn * p / 1e18;
    }
}
