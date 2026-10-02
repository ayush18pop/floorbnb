// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorFactory} from "../../src/FloorFactory.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {MockRouter} from "../mocks/MockRouter.sol";
import {System} from "../invariant/handlers/System.sol";

/// @notice I7 (trading window over random timestamps), I8 and I13 (the owner can always leave), as stateless fuzz.
contract ExitsFuzzTest is Test {
    uint256 internal constant T0 = 20_000 days + 16 hours;

    System internal sys;
    FloorFactory internal fac;
    FloorVault internal v;
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
        address[] memory a = new address[](2);
        a[0] = address(sys.stock1());
        a[1] = address(sys.stock2());
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        sys.usdt().mint(userA, 1000e18);
        vm.startPrank(userA);
        IERC20(address(sys.usdt())).approve(address(fac), 1000e18);
        v = FloorVault(fac.createPosition(1000e18, 9000, 365 days, a, w));
        vm.stopPrank();
    }

    function _independentOpen(uint256 ts) internal pure returns (bool) {
        if (((ts / 1 days) + 3) % 7 >= 5) return false;
        uint256 s = ts % 1 days;
        return s >= 15 hours + 30 minutes && s < 19 hours + 30 minutes;
    }

    /// I7: the factory window equals an independent recomputation for any timestamp, and the vault refuses to trade
    /// whenever it is closed.
    function testFuzz_I7_window(uint256 ts) public {
        ts = bound(ts, 1 days, 4_000_000_000);
        assertEq(fac.isTradingOpen(ts), _independentOpen(ts));
        vm.warp(ts);
        (bool needed, uint8 idx, bool buy, address tin, address tout, uint256 amt,,) = _preview();
        if (!needed) return;
        bytes memory data = abi.encodeCall(MockRouter.swapExact, (tin, tout, amt, amt, address(v)));
        IFloorVault.Swap memory sw = IFloorVault.Swap(idx, buy, amt, address(sys.aggregator()), data);
        vm.prank(keeper);
        try v.rebalance(sw) {
            assertTrue(_independentOpen(ts), "traded outside the window");
        } catch {}
        vm.prank(address(0xBEEF));
        try v.rebalancePublic(0) {
            assertTrue(_independentOpen(ts), "public trade outside the window");
        } catch {}
    }

    function _preview() internal view returns (bool, uint8, bool, address, address, uint256, uint256, uint256) {
        try v.previewRebalance() returns (
            bool n, uint8 i, bool b, address a, address o, uint256 x, uint256 y, uint256 z
        ) {
            return (n, i, b, a, o, x, y, z);
        } catch {
            return (false, 0, false, address(0), address(0), 0, 0, 0);
        }
    }

    /// I8 / I13: whatever the factory, tokens, oracle and clock look like, the owner can exit and gets the USDT.
    function testFuzz_I8_I13_exitAlwaysWorks(uint16 faults, uint256 warpSeed, bool toOther) public {
        // first give the vault a stock position
        (bool needed, uint8 idx, bool buy, address tin, address tout, uint256 amt,,) = _preview();
        if (needed) {
            uint256 p = sys.price(sys.pool1());
            uint256 out = buy ? amt * 1e18 / p : amt * p / 1e18;
            bytes memory data = abi.encodeCall(MockRouter.swapExact, (tin, tout, amt, out, address(v)));
            IFloorVault.Swap memory sw = IFloorVault.Swap(idx, buy, amt, address(sys.aggregator()), data);
            vm.prank(keeper);
            v.rebalance(sw);
        }
        vm.warp(block.timestamp + bound(warpSeed, 0, 800 days));

        if (faults & 1 != 0) {
            vm.prank(guardian);
            fac.pause();
        }
        if (faults & 2 != 0) {
            vm.prank(guardian);
            fac.setHalted(true);
        }
        if (faults & 4 != 0) {
            vm.startPrank(guardian);
            fac.removeRouter(address(sys.aggregator()));
            fac.removeRouter(address(sys.pancake()));
            vm.stopPrank();
        }
        if (faults & 8 != 0) sys.pool1().setRevertObserve(true);
        if (faults & 16 != 0) sys.pool2().setLiquidity(0);
        if (faults & 32 != 0) sys.stock1().setPaused(true);
        if (faults & 64 != 0) sys.stock2().setBlocked(address(v), true);
        if (faults & 128 != 0) sys.stock1().setBlocked(userA, true);
        if (faults & 256 != 0) sys.beacon().set(address(0xBAD));
        if (faults & 512 != 0) sys.stock1().setUiMultiplier(5e18);
        if (faults & 1024 != 0) {
            address s1 = address(sys.stock1());
            vm.prank(guardian);
            fac.disableAsset(s1);
        }
        if (faults & 2048 != 0) {
            vm.prank(userA);
            v.requestClose();
        }

        uint256 usdtBefore = sys.usdt().balanceOf(address(v));
        address to = toOther ? address(0xC1EA2) : userA;
        uint256 toBefore = sys.usdt().balanceOf(to);
        vm.prank(userA);
        v.exitInKind(to); // must not revert
        assertEq(sys.usdt().balanceOf(address(v)), 0);
        assertEq(sys.usdt().balanceOf(to) - toBefore, usdtBefore, "all USDT leaves");
        assertEq(uint8(v.status()), uint8(IFloorVault.Status.Closed));

        // rescue still works after Closed, whatever the factory state
        address usdtAddr = address(sys.usdt());
        vm.prank(userA);
        v.rescue(usdtAddr, userA);
    }

    /// I13: closeToUSDT and rescue are not blocked by factory pause / halt / router removal.
    function testFuzz_I13_closeNotBlockedByFactory(bool pause, bool halt, bool removeRouters) public {
        if (pause) {
            vm.prank(guardian);
            fac.pause();
        }
        if (halt) {
            vm.prank(guardian);
            fac.setHalted(true);
        }
        if (removeRouters) {
            vm.startPrank(guardian);
            fac.removeRouter(address(sys.aggregator()));
            fac.removeRouter(address(sys.pancake()));
            vm.stopPrank();
        }
        vm.prank(userA);
        v.closeToUSDT(); // nothing was bought, so stock <= dust
        assertEq(sys.usdt().balanceOf(userA), 1000e18);
        address usdtAddr = address(sys.usdt());
        vm.prank(userA);
        v.rescue(usdtAddr, userA);
    }
}
