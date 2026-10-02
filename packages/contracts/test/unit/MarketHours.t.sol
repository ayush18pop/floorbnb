// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MarketHours} from "../../src/libs/MarketHours.sol";

contract MarketHoursHarness {
    mapping(uint32 => bool) public nonTradingDay;

    function set(uint32 day, bool on) external {
        nonTradingDay[day] = on;
    }

    function isOpen(uint256 ts) external view returns (bool) {
        return MarketHours.isOpen(ts, nonTradingDay);
    }
}

contract MarketHoursTest is Test {
    MarketHoursHarness h;
    // Day 20000 is a Friday (CONTRACTS.md section 6): 2024-10-04.
    uint256 constant FRI = 20_000 days;

    function setUp() public {
        h = new MarketHoursHarness();
    }

    function test_day20000_isFriday() public pure {
        assertEq(MarketHours.weekday(FRI), 4);
        assertEq(MarketHours.weekday(FRI + 1 days), 5); // Saturday
        assertEq(MarketHours.weekday(FRI + 2 days), 6); // Sunday
        assertEq(MarketHours.weekday(FRI + 3 days), 0); // Monday
        assertEq(MarketHours.weekday(0), 3); // 1970-01-01 was a Thursday
    }

    function test_windowBoundarySeconds() public view {
        assertFalse(h.isOpen(FRI + 15 hours + 29 minutes + 59));
        assertTrue(h.isOpen(FRI + 15 hours + 30 minutes));
        assertTrue(h.isOpen(FRI + 19 hours + 29 minutes + 59));
        assertFalse(h.isOpen(FRI + 19 hours + 30 minutes));
        assertFalse(h.isOpen(FRI));
        assertFalse(h.isOpen(FRI + 23 hours + 59 minutes + 59));
    }

    function test_weekendClosed() public view {
        assertFalse(h.isOpen(FRI + 1 days + 16 hours)); // Saturday
        assertFalse(h.isOpen(FRI + 2 days + 16 hours)); // Sunday
        assertTrue(h.isOpen(FRI + 3 days + 16 hours)); // Monday
    }

    function test_holidayClosed_andReopen() public {
        uint256 ts = FRI + 16 hours;
        assertTrue(h.isOpen(ts));
        h.set(uint32(FRI / 1 days), true);
        assertFalse(h.isOpen(ts));
        // only that day
        assertTrue(h.isOpen(ts + 3 days));
        h.set(uint32(FRI / 1 days), false);
        assertTrue(h.isOpen(ts));
    }

    /// DST changes on 2026-03-08 and 2026-11-01 do not move the window: UTC only.
    function test_noDstLogic() public view {
        // 2026-03-09 (Monday) and 2026-11-02 (Monday) at 15:30 and 19:29:59 UTC
        uint256 mar9 = 1_773_014_400; // 2026-03-09 00:00:00 UTC
        uint256 nov2 = 1_793_577_600; // 2026-11-02 00:00:00 UTC
        assertEq(MarketHours.weekday(mar9), 0);
        assertEq(MarketHours.weekday(nov2), 0);
        assertTrue(h.isOpen(mar9 + 15 hours + 30 minutes));
        assertFalse(h.isOpen(mar9 + 15 hours + 29 minutes + 59));
        assertTrue(h.isOpen(nov2 + 19 hours + 29 minutes + 59));
        assertFalse(h.isOpen(nov2 + 19 hours + 30 minutes));
    }

    function testFuzz_neverOpenOnWeekend(uint256 ts) public pure {
        ts = bound(ts, 0, 100_000 days);
        if (MarketHours.weekday(ts) >= 5) assertFalse(MarketHours.inWindow(ts));
    }
}
