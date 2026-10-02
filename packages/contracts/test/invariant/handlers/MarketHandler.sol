// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FloorFactory} from "../../../src/FloorFactory.sol";
import {FloorVault} from "../../../src/FloorVault.sol";
import {MockPool} from "../../mocks/MockPool.sol";
import {HandlerBase} from "./HandlerBase.sol";
import {System} from "./System.sol";

/// @notice The world: price paths (including gaps beyond 1/m), time, pauses, halts, holidays, issuer actions on the
///         tokens, router removal, oracle faults, multiplier changes. None of these may change a vault's balances (I4).
contract MarketHandler is HandlerBase {
    int24 public minTick;
    int24 public maxTick;

    constructor(System s) HandlerBase(s) {
        int24 t0 = s.TICK0();
        minTick = t0 - 9000; // about -60%
        maxTick = t0 + 9000;
    }

    modifier balancesUnchanged() {
        Snap memory a = _snap(address(sys.vaultA()));
        Snap memory b = _snap(address(sys.vaultB()));
        _;
        if (!_same(a, _snap(address(sys.vaultA()))) || !_same(b, _snap(address(sys.vaultB())))) {
            _violate("I4_balanceMovedByMarketAction");
        }
    }

    function _clamp(int256 t) internal view returns (int24) {
        if (t < minTick) t = minTick;
        if (t > maxTick) t = maxTick;
        return int24(t);
    }

    /// @dev Moves the TWAP and spot together by up to +-3000 ticks (about +-35%), so single-step gaps beyond 25% occur.
    function movePrice(uint256 which, int256 step) external balancesUnchanged {
        step = bound(step, -3000, 3000);
        MockPool p = which % 3 == 0 ? sys.pool1() : which % 3 == 1 ? sys.pool2() : sys.pool1();
        int24 t = _clamp(int256(p.twapTick()) + step);
        p.setTick(t, t);
        if (which % 3 == 2) {
            sys.pool2().setTick(t, t);
        }
        sys.syncRates();
    }

    /// @dev Small moves (about +-1.5%), so the CPPI loop trades without constantly cash-locking.
    function drift(uint256 which, int256 step) external balancesUnchanged {
        step = bound(step, -150, 150);
        MockPool p = which % 2 == 0 ? sys.pool1() : sys.pool2();
        int24 t = _clamp(int256(p.twapTick()) + step);
        p.setTick(t, t);
        sys.syncRates();
    }

    function deviateSpot(uint256 which, int256 off) external balancesUnchanged {
        MockPool p = which % 2 == 0 ? sys.pool1() : sys.pool2();
        off = bound(off, -800, 800);
        p.setTick(p.twapTick(), int24(int256(p.twapTick()) + off));
    }

    function warpToWindow(uint256 seed) external balancesUnchanged {
        uint256 day = block.timestamp / 1 days + 1 + (seed % 4);
        vm.warp(day * 1 days + 15 hours + 31 minutes + (seed / 7) % (3 hours + 50 minutes));
    }

    function warpShort(uint256 seed) external balancesUnchanged {
        vm.warp(block.timestamp + bound(seed, 1, 6 hours));
    }

    function warpLong(uint256 seed) external balancesUnchanged {
        vm.warp(block.timestamp + bound(seed, 30 days, 200 days));
    }

    function togglePause(uint256 seed) external balancesUnchanged {
        bool on = seed % 6 == 0; // faults are the rare case so trading paths keep running
        FloorFactory f = sys.factory();
        vm.prank(sys.guardian());
        if (on) f.pause();
        else f.unpause();
    }

    function toggleHalt(uint256 seed) external balancesUnchanged {
        bool on = seed % 6 == 0;
        FloorFactory f = sys.factory();
        vm.prank(sys.guardian());
        f.setHalted(on);
    }

    function toggleHolidayToday(uint256 seed) external balancesUnchanged {
        bool on = seed % 8 == 0;
        FloorFactory f = sys.factory();
        vm.prank(sys.guardian());
        f.setNonTradingDay(uint32(block.timestamp / 1 days), on);
    }

    function tokenPause(uint256 which, uint256 seed) external balancesUnchanged {
        bool on = seed % 6 == 0;
        (which % 2 == 0 ? sys.stock1() : sys.stock2()).setPaused(on);
    }

    function blocklistVault(uint256 which, uint256 vSel, uint256 seed) external balancesUnchanged {
        bool on = seed % 6 == 0;
        (which % 2 == 0 ? sys.stock1() : sys.stock2()).setBlocked(address(vaultAt(vSel)), on);
    }

    function removeRouter(uint256 sel) external balancesUnchanged {
        if (sel % 6 != 0) return;
        address r = sys.routerAt(sel % 3);
        FloorFactory f = sys.factory();
        vm.prank(sys.guardian());
        try f.removeRouter(r) {} catch {}
    }

    function readdRouter(uint256 sel) external balancesUnchanged {
        address r = sys.routerAt(sel % 3);
        FloorFactory f = sys.factory();
        (bool ok,) = f.routerOk(r);
        if (ok) return; // re-adding an active router would restart its 24 h delay
        vm.prank(sys.owner_());
        f.addRouter(r, r);
    }

    function disableAsset(uint256 which, uint256 seed) external balancesUnchanged {
        bool on = seed % 6 == 0;
        address t = address(which % 2 == 0 ? sys.stock1() : sys.stock2());
        FloorFactory f = sys.factory();
        address pool = address(t == address(sys.stock1()) ? sys.pool1() : sys.pool2());
        if (on) {
            vm.prank(sys.guardian());
            f.disableAsset(t);
        } else {
            vm.prank(sys.owner_());
            try f.addAsset(t, pool, 2500, 1e20, 25_000e18) {} catch {}
        }
    }

    function breakOracle(uint256 which, uint256 mode) external balancesUnchanged {
        MockPool p = which % 2 == 0 ? sys.pool1() : sys.pool2();
        uint256 m = mode % 12; // faults (0, 2, 4) are 1 in 4
        if (m == 0) p.setRevertObserve(true);
        else if (m == 1) p.setRevertObserve(false);
        else if (m == 2) p.setLiquidity(0);
        else if (m == 3) p.setLiquidity(1e24);
        else if (m == 4) p.setCardinality(100);
        else if (m % 2 == 1) p.setCardinality(3000);
        else p.setLiquidity(1e24);
    }

    function changeBeacon(uint256 seed) external balancesUnchanged {
        sys.beacon().set(seed % 6 == 0 ? address(0xBAD) : address(0xA11CE));
    }

    function changeMultiplier(uint256 which, uint256 m, bool poke) external balancesUnchanged {
        if (m % 6 != 0) return; // multiplier changes are rare
        (which % 2 == 0 ? sys.stock1() : sys.stock2()).setUiMultiplier(bound(m, 0.9e18, 1.1e18));
        if (poke) {
            try sys.factory().pokeMultiplier(address(which % 2 == 0 ? sys.stock1() : sys.stock2())) {} catch {}
        }
    }

    /// @dev Restores a clean market so the trading paths keep being exercised.
    function healAll() external balancesUnchanged {
        sys.pool1().setRevertObserve(false);
        sys.pool2().setRevertObserve(false);
        sys.pool1().setLiquidity(1e24);
        sys.pool2().setLiquidity(1e24);
        sys.pool1().setCardinality(3000);
        sys.pool2().setCardinality(3000);
        int24 t1 = sys.pool1().twapTick();
        int24 t2 = sys.pool2().twapTick();
        sys.pool1().setTick(t1, t1);
        sys.pool2().setTick(t2, t2);
        sys.stock1().setPaused(false);
        sys.stock2().setPaused(false);
        sys.beacon().set(address(0xA11CE));
        FloorFactory f = sys.factory();
        vm.startPrank(sys.guardian());
        f.unpause();
        f.setHalted(false);
        f.setNonTradingDay(uint32(block.timestamp / 1 days), false);
        vm.stopPrank();
        try sys.factory().pokeMultiplier(address(sys.stock1())) {} catch {}
        try sys.factory().pokeMultiplier(address(sys.stock2())) {} catch {}
        sys.syncRates();
        vm.warp(block.timestamp + 11 minutes); // let any multiplier window pass
    }
}
