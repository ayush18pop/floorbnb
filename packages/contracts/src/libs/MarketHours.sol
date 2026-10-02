// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MarketHours
/// @notice On-chain trading window: Monday to Friday, [15:30, 19:30) UTC, minus guardian-set non-trading days.
///         Spec: docs/CONTRACTS.md section 6. No daylight-saving logic by design.
/// @dev The guardian halt flag and the factory pause flag are applied by the factory (`isTradingOpen`), not here.
library MarketHours {
    uint256 internal constant WINDOW_START = 15 hours + 30 minutes; // 15:30:00
    uint256 internal constant WINDOW_END = 19 hours + 30 minutes; // 19:30:00, exclusive

    /// @notice Unix day number.
    function dayOf(uint256 ts) internal pure returns (uint256) {
        return ts / 1 days;
    }

    /// @notice 0 = Monday ... 6 = Sunday. `(day + 3) % 7`; day 20000 is a Friday (CONTRACTS.md section 6).
    function weekday(uint256 ts) internal pure returns (uint256) {
        return (dayOf(ts) + 3) % 7;
    }

    /// @notice True on Monday to Friday inside [15:30, 19:30) UTC. Ignores holidays.
    function inWindow(uint256 ts) internal pure returns (bool) {
        if (weekday(ts) >= 5) return false;
        uint256 s = ts % 1 days;
        return s >= WINDOW_START && s < WINDOW_END;
    }

    /// @notice `inWindow(ts)` and not a guardian-set non-trading day (factory storage, keyed by unix day).
    function isOpen(uint256 ts, mapping(uint32 => bool) storage nonTradingDay) internal view returns (bool) {
        if (!inWindow(ts)) return false;
        return !nonTradingDay[uint32(dayOf(ts))];
    }
}
