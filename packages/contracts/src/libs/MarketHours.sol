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

    /// @dev Open-window seconds from the epoch to `ts` (weekday windows only, holidays are NOT excluded).
    function _openUntil(uint256 ts) private pure returns (uint256) {
        uint256 d = ts / 1 days;
        // Weekdays among days [0, d): the epoch day 0 is a Thursday, so a 7-day block starts on Thursday.
        uint256 r = d % 7;
        uint256 extra = r == 0 ? 0 : r == 1 ? 1 : r == 2 ? 2 : r == 3 ? 2 : r == 4 ? 2 : r == 5 ? 3 : 4;
        uint256 total = ((d / 7) * 5 + extra) * (WINDOW_END - WINDOW_START);
        if (weekday(ts) < 5) {
            uint256 s = ts % 1 days;
            if (s > WINDOW_START) total += (s < WINDOW_END ? s : WINDOW_END) - WINDOW_START;
        }
        return total;
    }

    /// @notice Seconds of Monday to Friday trading window between `from` and `to` (0 when `to <= from`).
    /// @dev O(1). Holidays and the guardian halt are not subtracted, so this can only over-count open time, which is
    ///      the lenient direction for its one user (`FloorVault.rebalancePublic`).
    function openSeconds(uint256 from, uint256 to) internal pure returns (uint256) {
        if (to <= from) return 0;
        return _openUntil(to) - _openUntil(from);
    }
}
