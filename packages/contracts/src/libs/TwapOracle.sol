// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPancakeV3Pool} from "../interfaces/IPancakeV3Pool.sol";
import {FullMath} from "./vendor/FullMath.sol";
import {TickMath} from "./vendor/TickMath.sol";

/// @title TwapOracle
/// @notice Pancake v3 time-weighted average tick and tick-to-price conversion. Spec: docs/CONTRACTS.md section 3.
/// @dev Prices are USDT per 1e18 raw units of the stock, WAD. Both tokens have 18 decimals (asserted at registration),
///      so no decimal scaling is needed. Token order is read from the pool by the caller (`usdtIsToken0`).
library TwapOracle {
    uint256 internal constant WAD = 1e18;

    /// @dev Same selectors as IFloorFactory / IFloorVault errors of the same name.
    error OracleHistoryTooShort();
    error PriceDeviation();
    error PoolIlliquid();

    /// @notice Average tick over `window` seconds. Rounds toward negative infinity, as Uniswap's OracleLibrary does.
    /// @dev Reverts `OracleHistoryTooShort` when `observe` reverts (history shorter than `window`).
    function twapTick(address pool, uint32 window) internal view returns (int24 tick) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = window;
        ago[1] = 0;
        try IPancakeV3Pool(pool).observe(ago) returns (int56[] memory cum, uint160[] memory) {
            int56 delta = cum[1] - cum[0];
            int56 w = int56(uint56(window));
            int56 t = delta / w;
            // Solidity division truncates toward zero; round negative non-exact results down.
            if (delta < 0 && (delta % w != 0)) t--;
            tick = int24(t);
        } catch {
            revert OracleHistoryTooShort();
        }
    }

    /// @notice Current tick from `slot0`.
    function spotTick(address pool) internal view returns (int24 tick) {
        (, tick,,,,,) = IPancakeV3Pool(pool).slot0();
    }

    /// @notice USDT per 1e18 raw stock units at `tick`, WAD, rounded down.
    /// @param usdtIsToken0 true when USDT is the pool's token0 (SPCXB, QQQB); false when the stock is token0 (NVDAB).
    /// @dev 1.0001^tick is the price of token0 in token1. Stock is token0: price = 1.0001^tick. USDT is token0:
    ///      price = 1 / 1.0001^tick.
    function priceWad(int24 tick, bool usdtIsToken0) internal pure returns (uint256) {
        uint160 sqrtP = TickMath.getSqrtPriceAtTick(tick);
        uint256 ratioX128 = FullMath.mulDiv(sqrtP, sqrtP, 1 << 64); // token1 per token0, Q128
        if (usdtIsToken0) {
            return FullMath.mulDiv(WAD, 1 << 128, ratioX128);
        }
        return FullMath.mulDiv(ratioX128, WAD, 1 << 128);
    }

    /// @notice Pool guards used by the vault before it trusts a price. CONTRACTS.md sections 3 and 11.2.
    /// @dev PriceDeviation if |spot - avg| > maxTickDev; PoolIlliquid if active liquidity < minLiquidity.
    function check(address pool, int24 avgTick, uint16 maxTickDev, uint128 minLiquidity) internal view {
        int256 d = int256(spotTick(pool)) - int256(avgTick);
        if (d < 0) d = -d;
        if (uint256(d) > maxTickDev) revert PriceDeviation();
        if (IPancakeV3Pool(pool).liquidity() < minLiquidity) revert PoolIlliquid();
    }

    /// @notice twapTick plus the guards, then the price.
    function price(address pool, uint32 window, uint16 maxTickDev, uint128 minLiquidity, bool usdtIsToken0)
        internal
        view
        returns (uint256)
    {
        int24 avg = twapTick(pool, window);
        check(pool, avg, maxTickDev, minLiquidity);
        return priceWad(avg, usdtIsToken0);
    }
}
