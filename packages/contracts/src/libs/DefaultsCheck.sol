// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IFloorFactory} from "../interfaces/IFloorFactory.sol";

/// @title DefaultsCheck
/// @notice The ONE set of bounds for `IFloorFactory.Defaults`, used by the factory constructor, `setDefaults` and the
///         deploy preflight, so the three can never disagree (Pashov 03 lead). Returns an empty string when valid.
library DefaultsCheck {
    /// @dev `publicDelay` counts OPEN-market seconds (Pashov 03): 24 h of open time is six sessions, at most about a week
    ///      and a half of calendar time, not the 42 sessions a 7-day bound would allow.
    uint256 internal constant MAX_PUBLIC_DELAY = 24 hours;

    function reason(IFloorFactory.Defaults memory d) internal pure returns (string memory) {
        if (d.sellBandBps == 0 || d.sellBandBps > 1000) return "sellBand";
        if (d.buyBandBps < d.sellBandBps || d.buyBandBps > 1000) return "buyBand";
        if (d.tolAggBps == 0 || d.tolAggBps > 200) return "tolAgg";
        if (d.tolDirectBps == 0 || d.tolDirectBps > 300) return "tolDirect";
        if (d.twapWindow < 300 || d.twapWindow > 1 hours) return "twapWindow";
        if (d.maxTickDev < 10 || d.maxTickDev > 1000) return "maxTickDev";
        if (d.minInterval < 60 || d.minInterval > 1 days) return "minInterval";
        if (d.publicDelay < 1 hours || d.publicDelay < d.minInterval || d.publicDelay > MAX_PUBLIC_DELAY) {
            return "publicDelay";
        }
        // `dust` of 1 raw unit of stock is below 1e15 USDT-wei at any realistic price, so a stray unit never blocks close.
        if (d.minTrade < 1e18 || d.minTrade > 1000e18) return "minTrade";
        if (d.dust < 1e15 || d.dust > d.minTrade) return "dust";
        return "";
    }

    /// @notice A direct public swap pays the pool fee on top of price impact: the tolerance must be at least twice the fee.
    function feeFits(uint24 fee, uint16 tolDirectBps) internal pure returns (bool) {
        return uint256(fee) / 100 * 2 <= tolDirectBps;
    }
}
