// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FullMath} from "./vendor/FullMath.sol";

/// @title CPPIMath
/// @notice Pure fixed-point CPPI maths. Spec: docs/CONTRACTS.md section 5 (WAD = 1e18, BPS = 1e4, M = 4e18).
/// @dev Rounding rules (CONTRACTS.md section 5, invariant I6): the floor F rounds UP, value V and exposure target E*
///      round DOWN, so rounding never favours the user's claim. All token amounts have 18 decimals.
library CPPIMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    /// @dev Multiplier m = 4 (CONTRACTS.md section 5 constants).
    uint256 internal constant M = 4e18;

    /// @notice F = ceilDiv(D * floorBps, BPS). Rounds up: the floor is never understated (CONTRACTS.md section 5).
    function floorFor(uint256 deposit, uint256 floorBps) internal pure returns (uint256) {
        return FullMath.mulDivRoundingUp(deposit, floorBps, BPS);
    }

    /// @notice USDT value of `bal` raw units at `price` (USDT per 1e18 raw, WAD). Rounds down.
    function valueOf(uint256 bal, uint256 price) internal pure returns (uint256) {
        return FullMath.mulDiv(bal, price, WAD);
    }

    /// @notice C = V > F ? V - F : 0.
    function cushion(uint256 V, uint256 F) internal pure returns (uint256) {
        return V > F ? V - F : 0;
    }

    /// @notice E* = min(floor(C * M / WAD), V). Rounds down (CONTRACTS.md section 5, invariant I6).
    function exposureTarget(uint256 C, uint256 V) internal pure returns (uint256) {
        uint256 e = FullMath.mulDiv(C, M, WAD);
        return e < V ? e : V;
    }

    /// @notice T_i = floor(E* * w_i / BPS).
    function assetTarget(uint256 estar, uint256 weightBps) internal pure returns (uint256) {
        return FullMath.mulDiv(estar, weightBps, BPS);
    }

    /// @notice USDT value to sell for asset i (0 means no trade). CONTRACTS.md section 5 trade rule.
    /// @dev Sell if E_i > T_i and (E_i - T_i) * BPS >= sellBandBps * V, or if E* == 0 and E_i >= minTrade (full unwind).
    ///      Ignore if value < minTrade except full unwind. Cap at maxTradeValue.
    function sellAmount(
        uint256 Ei,
        uint256 Ti,
        uint256 V,
        uint256 estar,
        uint256 sellBandBps,
        uint256 minTrade,
        uint256 maxTradeValue
    ) internal pure returns (uint256 amountValue) {
        if (estar == 0) {
            // full unwind: sell all of E_i if it is at least minTrade
            if (Ei < minTrade) return 0;
            amountValue = Ei;
        } else {
            if (Ei <= Ti) return 0;
            amountValue = Ei - Ti;
            if (amountValue * BPS < sellBandBps * V) return 0;
            if (amountValue < minTrade) return 0;
        }
        if (amountValue > maxTradeValue) amountValue = maxTradeValue;
    }

    /// @notice USDT value to buy for asset i (0 means no trade). CONTRACTS.md section 5 trade rule.
    /// @dev Buy if T_i > E_i and (T_i - E_i) * BPS >= buyBandBps * V. amountValue = min(T_i - E_i, usdtBal).
    ///      Ignore if value < minTrade. Cap at maxTradeValue.
    function buyAmount(
        uint256 Ei,
        uint256 Ti,
        uint256 V,
        uint256 usdtBal,
        uint256 buyBandBps,
        uint256 minTrade,
        uint256 maxTradeValue
    ) internal pure returns (uint256 amountValue) {
        if (Ti <= Ei) return 0;
        uint256 gap = Ti - Ei;
        if (gap * BPS < buyBandBps * V) return 0;
        amountValue = gap < usdtBal ? gap : usdtBal;
        if (amountValue < minTrade) return 0;
        if (amountValue > maxTradeValue) amountValue = maxTradeValue;
    }

    /// @notice Sell input in raw stock units: floor(amountValue * WAD / price), capped at `bal`.
    function sellAmountIn(uint256 amountValue, uint256 price, uint256 bal) internal pure returns (uint256 amountIn) {
        amountIn = FullMath.mulDiv(amountValue, WAD, price);
        if (amountIn > bal) amountIn = bal;
    }

    /// @notice Minimum output for a swap, rounded down (CONTRACTS.md section 5).
    /// @dev Sell: floor(amountIn * p / WAD * (BPS - tol) / BPS) in USDT.
    ///      Buy: floor(amountIn * WAD / p * (BPS - tol) / BPS) in stock units.
    function minOut(uint256 amountIn, uint256 price, uint256 tolBps, bool buy) internal pure returns (uint256) {
        uint256 fair = buy ? FullMath.mulDiv(amountIn, WAD, price) : FullMath.mulDiv(amountIn, price, WAD);
        return FullMath.mulDiv(fair, BPS - tolBps, BPS);
    }

    /// @notice The keeper's `amountIn` must lie in [computed / 2, computed] (CONTRACTS.md section 5).
    function amountInOk(uint256 amountIn, uint256 computed) internal pure returns (bool) {
        return amountIn <= computed && amountIn >= computed / 2;
    }
}
