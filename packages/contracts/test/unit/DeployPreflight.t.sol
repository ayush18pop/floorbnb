// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../../script/Deploy.s.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {MockPool} from "../mocks/MockPool.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

contract PfV3Factory {
    mapping(bytes32 => address) public pools;

    function set(address a, address b, uint24 fee, address pool) external {
        pools[keccak256(abi.encode(a, b, fee))] = pool;
        pools[keccak256(abi.encode(b, a, fee))] = pool;
    }

    function getPool(address a, address b, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encode(a, b, fee))];
    }
}

contract PfBeacon {
    address public implementation;

    constructor(address i) {
        implementation = i;
    }
}

contract Dec6 is MockToken {
    constructor() MockToken("U", "U") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract DeployHarness is Deploy {
    function check(Params memory p) external view {
        _preflight(p);
    }
}

/// @notice Deploy-script preflight (Pashov F-06/F-07, A12 deploy checks). Nothing is broadcast.
contract DeployPreflightTest is Test {
    DeployHarness h;
    MockToken usdt;
    MockToken stock;
    MockPool pool;
    PfV3Factory v3f;
    MockRouter router;
    PfBeacon beacon;
    Deploy.Params p;

    function setUp() public {
        h = new DeployHarness();
        usdt = new MockToken("USDT", "USDT");
        stock = new MockToken("S", "S");
        pool = new MockPool(address(usdt), address(stock), 2500);
        v3f = new PfV3Factory();
        v3f.set(address(stock), address(usdt), 2500, address(pool));
        router = new MockRouter();
        beacon = new PfBeacon(address(0xBEEF));
        _fill();
    }

    function _fill() internal {
        p.owner = address(1);
        p.guardian = address(2);
        p.usdt = address(usdt);
        p.v3Factory = address(v3f);
        p.v3SwapRouter = address(router);
        p.tokenBeacon = address(beacon);
        p.approvedTokenImpl = address(0xBEEF);
        p.keepers = [address(3)];
        p.routerTargets = [address(router)];
        p.routerApproveTargets = [address(router)];
        p.assetTokens = [address(stock)];
        p.assetPools = [address(pool)];
        p.assetFees = [uint256(2500)];
        p.assetMinLiquidity = [uint256(1000e18)];
        p.assetMaxTradeValue = [uint256(25_000e18)];
        p.maxDeposit = 1000e18;
        p.maxTotalTvl = 5000e18;
        p.defaults = IFloorFactory.Defaults(100, 200, 900, 14_400, 600, 300, 30, 100, 20e18, 1e18);
        p.holidaysFile = "holidays/nyse_2026_2027.json";
    }

    /// Pashov 02 lead: the preflight bound must equal the factory bound (1000), not a looser 2000.
    function test_buyBand_above_factory_bound_reverts() public {
        p.defaults.buyBandBps = 1001;
        vm.expectRevert("Deploy: buyBand");
        h.check(p);
    }

    /// Pashov 02 #13: 600 s window on 0.75 s blocks needs 800 observation slots.
    function test_cardinality_below_window_need_reverts() public {
        pool.setCardinality(799);
        vm.expectRevert("Deploy: TWAP cardinality");
        h.check(p);
        pool.setCardinality(800);
        h.check(p);
    }

    function test_good_params_pass() public view {
        h.check(p);
    }

    function test_usdt_wrong_decimals_reverts() public {
        Dec6 d = new Dec6();
        p.usdt = address(d);
        vm.expectRevert("Deploy: usdt decimals != 18");
        h.check(p);
    }

    function test_beacon_impl_mismatch_reverts() public {
        p.approvedTokenImpl = address(0xDEAD);
        vm.expectRevert("Deploy: beacon impl != approved");
        h.check(p);
    }

    function test_fee_downcast_wrap_reverts() public {
        p.assetFees = [uint256(2500) + (1 << 24)];
        vm.expectRevert("Deploy: fee out of range");
        h.check(p);
    }

    function test_minLiquidity_downcast_wrap_reverts() public {
        p.assetMinLiquidity = [uint256(1000e18) + (1 << 128)];
        vm.expectRevert("Deploy: minLiq range");
        h.check(p);
    }

    function test_pool_not_from_factory_reverts() public {
        MockPool other = new MockPool(address(usdt), address(stock), 2500);
        p.assetPools = [address(other)];
        vm.expectRevert("Deploy: pool != factory");
        h.check(p);
    }

    function test_pool_token_order_wrong_reverts() public {
        MockPool bad = new MockPool(address(stock), address(0xABCD), 2500);
        v3f.set(address(stock), address(usdt), 2500, address(bad));
        p.assetPools = [address(bad)];
        vm.expectRevert("Deploy: pool token order");
        h.check(p);
    }

    function test_pool_liquidity_low_reverts() public {
        pool.setLiquidity(1);
        vm.expectRevert("Deploy: pool liquidity below minLiquidity");
        h.check(p);
    }

    function test_cardinality_low_reverts() public {
        pool.setCardinality(50);
        vm.expectRevert("Deploy: TWAP cardinality");
        h.check(p);
    }

    function test_twap_history_short_reverts() public {
        pool.setRevertObserve(true);
        vm.expectRevert();
        h.check(p);
    }

    function test_router_allowlist_empty_reverts() public {
        p.routerTargets = new address[](0);
        p.routerApproveTargets = new address[](0);
        vm.expectRevert("Deploy: router allowlist empty");
        h.check(p);
    }

    function test_pancake_router_must_be_listed() public {
        p.routerTargets = [address(0x1234)];
        p.routerApproveTargets = [address(0x1234)];
        vm.expectRevert("Deploy: v3SwapRouter must be allowlisted");
        h.check(p);
    }

    function test_caps_sane() public {
        p.maxDeposit = 6000e18;
        vm.expectRevert("Deploy: maxDeposit > maxTotalTvl");
        h.check(p);
        p.maxDeposit = 1000e18;
        p.maxTotalTvl = 1_000_000e18;
        vm.expectRevert("Deploy: maxTotalTvl above 100k USDT launch ceiling");
        h.check(p);
    }

    function test_no_keeper_reverts() public {
        p.keepers = new address[](0);
        vm.expectRevert("Deploy: no keeper");
        h.check(p);
    }
}
