// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorFactory} from "../../src/FloorFactory.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {TwapOracle} from "../../src/libs/TwapOracle.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {MockPool} from "../mocks/MockPool.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

contract AuditV3Factory {
    mapping(bytes32 => address) public pools;

    function set(address a, address b, uint24 fee, address pool) external {
        pools[keccak256(abi.encode(a, b, fee))] = pool;
        pools[keccak256(abi.encode(b, a, fee))] = pool;
    }

    function getPool(address a, address b, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encode(a, b, fee))];
    }
}

/// @notice A12 audit fixture: the REAL FloorFactory and REAL FloorVault clones, mock tokens, pools and routers.
///         Friday 16:00 UTC, price of stock1 and stock2 about 100 USDT (tick 46054, stock is token0).
abstract contract AuditBase is Test {
    uint256 internal constant T0 = 20_000 days + 16 hours; // Friday 16:00 UTC, inside the window
    int24 internal constant TICK_100 = 46_054;

    address internal owner = makeAddr("owner");
    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal user = makeAddr("user");
    address internal attacker = makeAddr("attacker");

    MockToken internal usdt;
    MockToken internal stock1;
    MockToken internal stock2;
    MockPool internal pool1;
    MockPool internal pool2;
    AuditV3Factory internal v3f;
    MockRouter internal agg; // aggregator stand-in
    address internal pancake = makeAddr("pancake");
    FloorVault internal impl;
    FloorFactory internal factory;

    function setUp() public virtual {
        vm.warp(T0);
        usdt = new MockToken("USDT", "USDT");
        stock1 = new MockToken("NVDAB", "NVDAB");
        stock2 = new MockToken("SPCXB", "SPCXB");
        pool1 = new MockPool(address(stock1), address(usdt), 2500);
        pool2 = new MockPool(address(stock2), address(usdt), 2500);
        pool1.setTick(TICK_100, TICK_100);
        pool2.setTick(TICK_100, TICK_100);
        v3f = new AuditV3Factory();
        v3f.set(address(stock1), address(usdt), 2500, address(pool1));
        v3f.set(address(stock2), address(usdt), 2500, address(pool2));
        agg = new MockRouter();
        impl = new FloorVault();

        address[] memory rs = new address[](2);
        rs[0] = address(agg);
        rs[1] = pancake;
        factory =
            new FloorFactory(owner, guardian, address(usdt), address(v3f), pancake, address(impl), _defaults(), rs, rs);
        vm.startPrank(owner);
        factory.addAsset(address(stock1), address(pool1), 2500, 1e20, 25_000e18);
        factory.addAsset(address(stock2), address(pool2), 2500, 1e20, 25_000e18);
        factory.setKeeper(keeper, true);
        factory.setLimits(1000e18, 5000e18); // P5 launch caps
        vm.stopPrank();

        stock1.mint(address(agg), 1e30);
        stock2.mint(address(agg), 1e30);
        usdt.mint(address(agg), 1e30);
    }

    function _defaults() internal pure returns (IFloorFactory.Defaults memory d) {
        d = IFloorFactory.Defaults({
            sellBandBps: 100,
            buyBandBps: 200,
            minInterval: 900,
            publicDelay: 14_400,
            twapWindow: 600,
            maxTickDev: 300,
            tolAggBps: 30,
            tolDirectBps: 100,
            minTrade: 20e18,
            dust: 1e18
        });
    }

    function _create(address who, uint256 amount, uint16 floorBps, address[] memory a, uint16[] memory w)
        internal
        returns (FloorVault v)
    {
        usdt.mint(who, amount);
        vm.startPrank(who);
        usdt.approve(address(factory), amount);
        v = FloorVault(factory.createPosition(amount, floorBps, 365 days, a, w));
        vm.stopPrank();
    }

    function _one(address s) internal pure returns (address[] memory a, uint16[] memory w) {
        a = new address[](1);
        a[0] = s;
        w = new uint16[](1);
        w[0] = 10_000;
    }

    function _two() internal view returns (address[] memory a, uint16[] memory w) {
        a = new address[](2);
        a[0] = address(stock1);
        a[1] = address(stock2);
        w = new uint16[](2);
        w[0] = 6000;
        w[1] = 4000;
    }

    function _price(MockPool p) internal view returns (uint256) {
        return TwapOracle.priceWad(p.twapTick(), false);
    }

    /// @dev Keeper swap through the honest aggregator mock at an explicit exchange price (USDT per stock, WAD).
    function _keeperSwap(FloorVault v, uint8 idx, bool buy, address stock, uint256 amountIn, uint256 execPrice)
        internal
    {
        bytes memory data = buy
            ? abi.encodeCall(
                MockRouter.swapExact, (address(usdt), stock, amountIn, amountIn * 1e18 / execPrice, address(v))
            )
            : abi.encodeCall(
                MockRouter.swapExact, (stock, address(usdt), amountIn, amountIn * execPrice / 1e18, address(v))
            );
        vm.prank(keeper);
        v.rebalance(IFloorVault.Swap({assetIdx: idx, buy: buy, amountIn: amountIn, router: address(agg), data: data}));
    }
}
