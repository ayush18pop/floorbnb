// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorVault} from "../../../src/FloorVault.sol";
import {FloorFactory} from "../../../src/FloorFactory.sol";
import {FloorLens} from "../../../src/FloorLens.sol";
import {IFloorFactory} from "../../../src/interfaces/IFloorFactory.sol";
import {IPancakeV3SwapRouter} from "../../../src/interfaces/IPancakeV3SwapRouter.sol";
import {MockToken} from "../../mocks/MockToken.sol";
import {MockPool} from "../../mocks/MockPool.sol";
import {MockRouter} from "../../mocks/MockRouter.sol";
import {EvilRouter, LeakyMockToken} from "../../mocks/evil/EvilRouter.sol";

contract SysV3Factory {
    mapping(bytes32 => address) public pools;

    function set(address a, address b, uint24 fee, address pool) external {
        pools[keccak256(abi.encode(a, b, fee))] = pool;
        pools[keccak256(abi.encode(b, a, fee))] = pool;
    }

    function getPool(address a, address b, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encode(a, b, fee))];
    }
}

contract SysBeacon {
    address public implementation = address(0xA11CE);

    function set(address i) external {
        implementation = i;
    }
}

/// @dev Pancake SwapRouter stand-in (deadline layout, selector 0x414bf389). Fee 25 bps, per-pair rate.
contract SysPancake {
    mapping(address => mapping(address => uint256)) public rate;

    function setRate(address a, address b, uint256 r) external {
        rate[a][b] = r;
    }

    function exactInputSingle(IPancakeV3SwapRouter.ExactInputSingleParams calldata p) external returns (uint256 out) {
        out = (p.amountIn * rate[p.tokenIn][p.tokenOut] / 1e18) * 9975 / 10_000;
        require(out >= p.amountOutMinimum, "Too little received");
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        IERC20(p.tokenOut).transfer(p.recipient, out);
    }
}

/// @notice Full system under test: real FloorFactory + real FloorVault clones, mock tokens, pools and routers.
///         Deployed once by the invariant test. The System is the factory owner and guardian during construction and
///         hands both roles to the supplied addresses.
contract System {
    int24 public constant TICK0 = 46_054; // price about 100 USDT

    MockToken public usdt;
    MockToken public stock1;
    LeakyMockToken public stock2;
    MockPool public pool1;
    MockPool public pool2;
    SysV3Factory public v3f;
    SysBeacon public beacon;
    MockRouter public aggregator;
    SysPancake public pancake;
    EvilRouter public evil;
    MockRouter public unlisted;
    FloorVault public implementation;
    FloorFactory public factory;
    FloorLens public lens;

    FloorVault public vaultA; // stock1 only, floor 90%
    FloorVault public vaultB; // stock1 60% + stock2 40%, floor 95%

    address public immutable keeper;
    address public immutable guardian;
    address public immutable owner_;
    address public immutable userA;
    address public immutable userB;

    constructor(address keeper_, address guardian_, address owner__, address userA_, address userB_) {
        keeper = keeper_;
        guardian = guardian_;
        owner_ = owner__;
        userA = userA_;
        userB = userB_;

        usdt = new MockToken("USDT", "USDT");
        stock1 = new MockToken("S1", "S1");
        stock2 = new LeakyMockToken("S2", "S2");
        pool1 = new MockPool(address(stock1), address(usdt), 2500);
        pool2 = new MockPool(address(stock2), address(usdt), 2500);
        pool1.setTick(TICK0, TICK0);
        pool2.setTick(TICK0, TICK0);
        v3f = new SysV3Factory();
        v3f.set(address(stock1), address(usdt), 2500, address(pool1));
        v3f.set(address(stock2), address(usdt), 2500, address(pool2));
        beacon = new SysBeacon();
        aggregator = new MockRouter();
        pancake = new SysPancake();
        evil = new EvilRouter();
        evil.setLeaky(address(stock2));
        unlisted = new MockRouter();
        implementation = new FloorVault();

        address[] memory rs = new address[](3);
        rs[0] = address(aggregator);
        rs[1] = address(pancake);
        rs[2] = address(evil);
        IFloorFactory.Defaults memory d = IFloorFactory.Defaults({
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
        factory = new FloorFactory(
            address(this),
            address(this),
            address(usdt),
            address(v3f),
            address(pancake),
            address(implementation),
            d,
            rs,
            rs
        );
        factory.setTokenBeacon(address(beacon), address(0xA11CE));
        factory.addAsset(address(stock1), address(pool1), 2500, 1e20, 25_000e18);
        factory.addAsset(address(stock2), address(pool2), 2500, 1e20, 10_000e18);
        factory.setKeeper(keeper_, true);
        factory.setGuardian(guardian_);
        factory.transferOwnership(owner__); // owner__ must call acceptOwnership

        lens = new FloorLens(address(factory));

        // inventories for every router
        address[5] memory rts = [address(aggregator), address(pancake), address(evil), address(unlisted), address(0)];
        for (uint256 i; i < 4; ++i) {
            usdt.mint(rts[i], 1e30);
            stock1.mint(rts[i], 1e30);
            stock2.mint(rts[i], 1e30);
        }
        syncRates();
    }

    /// @dev Called by the test after `owner_` accepted ownership: opens the two positions.
    function openPositions() external {
        // users approve the factory themselves in the test (vm.prank); here we only create through the users
    }

    function price(MockPool p) public view returns (uint256) {
        // stock is token0, USDT per 1e18 raw = 1.0001^tick (computed with the vault's own library via a harness)
        return PriceLib.priceWad(p.twapTick());
    }

    function syncRates() public {
        uint256 p1 = price(pool1);
        uint256 p2 = price(pool2);
        pancake.setRate(address(usdt), address(stock1), 1e36 / p1);
        pancake.setRate(address(stock1), address(usdt), p1);
        pancake.setRate(address(usdt), address(stock2), 1e36 / p2);
        pancake.setRate(address(stock2), address(usdt), p2);
    }

    function setVaults(address a, address b) external {
        vaultA = FloorVault(a);
        vaultB = FloorVault(b);
    }

    function routerAt(uint256 i) external view returns (address) {
        if (i == 0) return address(aggregator);
        if (i == 1) return address(pancake);
        if (i == 2) return address(evil);
        return address(unlisted);
    }
}

import {TwapOracle} from "../../../src/libs/TwapOracle.sol";

library PriceLib {
    function priceWad(int24 tick) internal pure returns (uint256) {
        return TwapOracle.priceWad(tick, false);
    }
}
