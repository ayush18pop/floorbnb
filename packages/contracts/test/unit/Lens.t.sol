// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FloorLens} from "../../src/FloorLens.sol";
import {IFloorLens} from "../../src/interfaces/IFloorLens.sol";
import {FactoryBase, StubVault} from "./Factory.t.sol";

contract LensTest is FactoryBase {
    FloorLens internal lens;

    function setUp() public override {
        super.setUp();
        lens = new FloorLens(address(factory));
    }

    function _make(uint256 amt) internal returns (StubVault v) {
        _fund(user, amt);
        (address[] memory a, uint16[] memory w) = _basket1();
        vm.prank(user);
        v = StubVault(factory.createPosition(amt, 9000, 30 days, a, w));
    }

    function test_status_readsVault() public {
        StubVault v = _make(100e18);
        v.setStub(100e18, 40e18, 10e18, 40e18, true, false);
        IFloorLens.Status memory s = lens.status(address(v));
        assertEq(s.vault, address(v));
        assertEq(s.V, 100e18);
        assertEq(s.floor, 90e18);
        assertEq(s.cushion, 10e18);
        assertEq(s.exposure, 40e18);
        assertEq(s.target, 40e18);
        assertTrue(s.needsRebalance);
        assertTrue(s.tradingOpen);
    }

    function test_status_brokenVaultDoesNotRevert() public {
        StubVault v = _make(100e18);
        v.setStub(0, 0, 0, 0, true, true);
        IFloorLens.Status memory s = lens.status(address(v));
        assertEq(s.V, 0);
        assertFalse(s.needsRebalance);
        assertEq(s.floor, 90e18);
        // an address that is not a vault at all
        s = lens.status(rando);
        assertEq(s.vault, rando);
    }

    function test_scan_returnsOnlyNeeding_andSurvivesBrokenVault() public {
        StubVault a = _make(100e18);
        StubVault b = _make(100e18);
        StubVault c = _make(100e18);
        a.setStub(100e18, 0, 10e18, 40e18, true, false);
        b.setStub(0, 0, 0, 0, true, true); // reverts
        c.setStub(100e18, 0, 10e18, 40e18, true, false);
        address[] memory r = lens.scan(0, 3);
        assertEq(r.length, 2);
        assertEq(r[0], address(a));
        assertEq(r[1], address(c));
        // ranges are clamped and half-open
        r = lens.scan(2, 100);
        assertEq(r.length, 1);
        assertEq(r[0], address(c));
        assertEq(lens.scan(3, 3).length, 0);
        assertEq(lens.scan(5, 2).length, 0);
    }

    function test_scan_emptyWhenTradingClosed() public {
        StubVault a = _make(100e18);
        a.setStub(100e18, 0, 10e18, 40e18, true, false);
        vm.warp(T0 + 1 days); // Saturday
        assertEq(lens.scan(0, 1).length, 0);
        IFloorLens.Status memory s = lens.status(address(a));
        assertFalse(s.tradingOpen);
    }
}
