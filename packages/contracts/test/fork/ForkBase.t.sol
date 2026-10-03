// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorFactory} from "../../src/FloorFactory.sol";
import {FloorLens} from "../../src/FloorLens.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IBeacon} from "../../src/interfaces/IBeacon.sol";

/// @notice Shared BSC mainnet fork fixture. Addresses: docs/CONTRACTS.md section 2 and CONTEXT.md.
/// @dev Fork tests run only when `FLOOR_FORK=1` (or `BSC_FORK_RPC_URL` / `BSC_RPC_URL` is set), so a plain
///      `forge test` stays offline. RPC: `BSC_FORK_RPC_URL`, else `BSC_RPC_URL`, else a public node. Never put a key
///      in this file. Reads only; nothing is ever sent to chain 56.
abstract contract ForkBase is Test {
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address internal constant V3_FACTORY = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;
    address internal constant PANCAKE_ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address internal constant QUOTER = 0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997;
    address internal constant AGG_ROUTER = 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5;
    address internal constant BEACON = 0x156D6dce9a4f6139a3406F1f021F1A4880De93a3;
    address internal constant VENUS_ORACLE = 0x6592b5DE802159F3E74B2486b091D11a8256ab8A;
    address internal constant PAUSE_MANAGER = 0x9fc74Be63f3589485B2423984a7a0557e0CF700a;
    address internal constant PAUSE_ADMIN = 0xF3eFf082d1b859C75cdE44871E96968E543EA491;
    address internal constant COMPLIANCE = 0x53dBa7AaBDe774787A1F57236B235567dA8e14F4;
    address internal constant COMPLIANCE_ADMIN = 0x6f64F80B50efbf0f5f13D72d16eC17a59abBe5C6;
    address internal constant TOKEN_ADMIN = 0x45e35Fe982F3869221b222Abea372fA97AA7679d;
    address internal constant BEACON_OWNER = 0x4333DAf4481F281F3D3d2B8735cE80bc00028d0C;

    address internal constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address internal constant SPCXB = 0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1;
    address internal constant QQQB = 0x205812CdBed920aFf76C6580abD681a46D11efc7;
    address internal constant POOL_NVDAB = 0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C;
    address internal constant POOL_SPCXB = 0x977DaFFC095b33872E2741c19568925015C35b4d;
    address internal constant POOL_QQQB = 0xe531fcb1F5a195de7608B9F4f9518544C2cdB693;

    address internal owner = makeAddr("owner");
    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal user = makeAddr("user");

    FloorFactory internal factory;
    FloorLens internal lens;
    bool internal forkOn;

    function setUp() public virtual {
        string memory url = vm.envOr("BSC_FORK_RPC_URL", vm.envOr("BSC_RPC_URL", string("")));
        if (bytes(url).length == 0) {
            if (!vm.envOr("FLOOR_FORK", false)) {
                vm.skip(true);
            }
            url = "https://bsc-rpc.publicnode.com"; // public fallback, read-only
        }
        vm.createSelectFork(url);
        forkOn = true;

        FloorVault impl = new FloorVault();
        address[] memory rs = new address[](2);
        rs[0] = AGG_ROUTER;
        rs[1] = PANCAKE_ROUTER;
        IFloorFactory.Defaults memory d = IFloorFactory.Defaults({
            sellBandBps: 100,
            buyBandBps: 200,
            minInterval: 900,
            publicDelay: 3600, // lowest allowed, so a position can use the public path inside one trading window
            twapWindow: 600,
            maxTickDev: 300,
            tolAggBps: 30,
            tolDirectBps: 100,
            minTrade: 20e18,
            dust: 1e18
        });
        factory = new FloorFactory(owner, guardian, USDT, V3_FACTORY, PANCAKE_ROUTER, address(impl), d, rs, rs);
        lens = new FloorLens(address(factory));

        vm.startPrank(owner);
        factory.setTokenBeacon(BEACON, IBeacon(BEACON).implementation());
        factory.addAsset(NVDAB, POOL_NVDAB, 2500, 1e21, 25_000e18);
        factory.addAsset(SPCXB, POOL_SPCXB, 2500, 1e21, 10_000e18);
        factory.addAsset(QQQB, POOL_QQQB, 100, 1e21, 5000e18);
        factory.setKeeper(keeper, true);
        vm.stopPrank();
    }

    /// @dev Next Tuesday 15:35 UTC strictly after the fork head (inside the window with 4 h of room).
    function _tuesday1535() internal view returns (uint256) {
        uint256 day = block.timestamp / 1 days + 1;
        while ((day + 3) % 7 != 1) day++; // 1 = Tuesday
        return day * 1 days + 15 hours + 35 minutes;
    }

    function _open(uint256 amt, uint16 floorBps, address token) internal returns (FloorVault v) {
        deal(USDT, user, amt);
        address[] memory a = new address[](1);
        a[0] = token;
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        vm.startPrank(user);
        IERC20(USDT).approve(address(factory), amt);
        v = FloorVault(factory.createPosition(amt, floorBps, 90 days, a, w));
        vm.stopPrank();
    }
}
