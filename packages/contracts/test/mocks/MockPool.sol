// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Settable stand-in for a Pancake v3 pool: `observe`, `slot0`, `liquidity`, `token0`, `token1`, `fee`.
/// @dev Cumulatives are built so that the average tick over any window equals `twapTick`.
///      `setRawCumulatives` overrides them to test rounding of negative averages.
contract MockPool {
    address public token0;
    address public token1;
    uint24 public fee;
    uint128 public liquidity = 1e24;
    int24 public twapTick;
    int24 public spot;
    uint16 public cardinality = 3000;
    bool public revertObserve;
    bool public useRaw;
    int56 public rawOld;
    int56 public rawNew;

    constructor(address token0_, address token1_, uint24 fee_) {
        token0 = token0_;
        token1 = token1_;
        fee = fee_;
    }

    function setTick(int24 twap_, int24 spot_) external {
        twapTick = twap_;
        spot = spot_;
        useRaw = false;
    }

    function setLiquidity(uint128 l) external {
        liquidity = l;
    }

    function setCardinality(uint16 c) external {
        cardinality = c;
    }

    function setRevertObserve(bool on) external {
        revertObserve = on;
    }

    function setRawCumulatives(int56 older, int56 newer) external {
        useRaw = true;
        rawOld = older;
        rawNew = newer;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint32, bool) {
        return (0, spot, 0, cardinality, cardinality, 0, true);
    }

    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory cum, uint160[] memory spl) {
        require(!revertObserve, "OLD");
        cum = new int56[](secondsAgos.length);
        spl = new uint160[](secondsAgos.length);
        if (useRaw && secondsAgos.length == 2) {
            cum[0] = rawOld;
            cum[1] = rawNew;
            return (cum, spl);
        }
        for (uint256 i; i < secondsAgos.length; i++) {
            cum[i] = -int56(twapTick) * int56(uint56(secondsAgos[i]));
        }
    }
}
