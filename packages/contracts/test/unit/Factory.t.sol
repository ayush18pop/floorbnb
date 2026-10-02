// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {FloorFactory} from "../../src/FloorFactory.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {MockPool} from "../mocks/MockPool.sol";

/// @dev Records `initialize` arguments so the factory can be tested without the real vault.
contract StubVault {
    address public factory;
    address public owner;
    uint256 public deposit;
    uint256 public floor;
    uint40 public maturity;
    address[] public assetsSeen;
    uint16[] public weightsSeen;
    bytes public cfg;
    bool internal _init;

    // views the Lens reads
    uint256 public stubV;
    uint256 public stubStock;
    uint256 public stubCushion;
    uint256 public stubTarget;
    bool public stubNeeded;
    bool public stubRevert;

    function initialize(
        address owner_,
        uint256 deposit_,
        uint256 floor_,
        uint40 maturity_,
        address[] calldata assets_,
        uint16[] calldata weights_,
        bytes calldata cfg_
    ) external {
        require(!_init, "init");
        _init = true;
        factory = msg.sender;
        owner = owner_;
        deposit = deposit_;
        floor = floor_;
        maturity = maturity_;
        for (uint256 i; i < assets_.length; ++i) {
            assetsSeen.push(assets_[i]);
            weightsSeen.push(weights_[i]);
        }
        cfg = cfg_;
    }

    function setStub(uint256 v, uint256 stock, uint256 c, uint256 t, bool needed, bool rev) external {
        stubV = v;
        stubStock = stock;
        stubCushion = c;
        stubTarget = t;
        stubNeeded = needed;
        stubRevert = rev;
    }

    function valuation() external view returns (uint256, uint256, uint256[3] memory sv) {
        require(!stubRevert, "oracle");
        sv[0] = stubStock;
        return (stubV, stubV - stubStock, sv);
    }

    function targets() external view returns (uint256, uint256, uint256[3] memory t) {
        require(!stubRevert, "oracle");
        t[0] = stubTarget;
        return (stubCushion, stubTarget, t);
    }

    function previewRebalance() external view returns (bool, uint8, bool, address, address, uint256, uint256, uint256) {
        require(!stubRevert, "oracle");
        return (stubNeeded, 0, true, address(0), address(0), 0, 0, 0);
    }
}

contract MockV3Factory {
    mapping(bytes32 => address) public pools;

    function set(address a, address b, uint24 fee, address pool) external {
        pools[keccak256(abi.encode(a, b, fee))] = pool;
        pools[keccak256(abi.encode(b, a, fee))] = pool;
    }

    function getPool(address a, address b, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encode(a, b, fee))];
    }
}

abstract contract FactoryBase is Test {
    uint256 internal constant T0 = 20_000 days + 16 hours; // Friday 16:00 UTC

    address internal owner = makeAddr("owner");
    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal user = makeAddr("user");
    address internal rando = makeAddr("rando");
    address internal aggregator = makeAddr("aggregator");
    address internal pancake = makeAddr("pancake");

    MockToken internal usdt;
    MockToken internal nvdab;
    MockToken internal qqqb;
    MockPool internal nvdaPool; // stock is token0
    MockPool internal qqqPool; // usdt is token0
    MockV3Factory internal v3f;
    StubVault internal stub;
    FloorFactory internal factory;

    function setUp() public virtual {
        vm.warp(T0);
        usdt = new MockToken("USDT", "USDT");
        nvdab = new MockToken("NVDAB", "NVDAB");
        qqqb = new MockToken("QQQB", "QQQB");
        nvdaPool = new MockPool(address(nvdab), address(usdt), 2500);
        qqqPool = new MockPool(address(usdt), address(qqqb), 100);
        v3f = new MockV3Factory();
        v3f.set(address(nvdab), address(usdt), 2500, address(nvdaPool));
        v3f.set(address(qqqb), address(usdt), 100, address(qqqPool));
        stub = new StubVault();

        address[] memory rs = new address[](2);
        rs[0] = aggregator;
        rs[1] = pancake;
        address[] memory ats = new address[](2);
        ats[0] = aggregator;
        ats[1] = pancake;
        factory = new FloorFactory(
            owner, guardian, address(usdt), address(v3f), pancake, address(stub), _defaults(), rs, ats
        );
        vm.startPrank(owner);
        factory.addAsset(address(nvdab), address(nvdaPool), 2500, 1e20, 25_000e18);
        factory.addAsset(address(qqqb), address(qqqPool), 100, 1e20, 5000e18);
        factory.setKeeper(keeper, true);
        vm.stopPrank();
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

    function _basket1() internal view returns (address[] memory a, uint16[] memory w) {
        a = new address[](1);
        a[0] = address(nvdab);
        w = new uint16[](1);
        w[0] = 10_000;
    }

    function _fund(address who, uint256 amt) internal {
        usdt.mint(who, amt);
        vm.prank(who);
        usdt.approve(address(factory), amt);
    }
}

contract FactoryTest is FactoryBase {
    // --------------------------------------------------------- constructor

    function test_constructor_state() public view {
        assertEq(factory.owner(), owner);
        assertEq(factory.guardian(), guardian);
        assertEq(factory.usdt(), address(usdt));
        assertEq(factory.v3SwapRouter(), pancake);
        assertEq(factory.vaultImplementation(), address(stub));
        assertEq(factory.maxDeposit(), 1000e18, "P5 launch cap");
        assertEq(factory.maxTotalTvl(), 5000e18, "P5 launch cap");
        (bool ok, address at) = factory.routerOk(aggregator);
        assertTrue(ok, "P2: constructor router active at deploy");
        assertEq(at, aggregator);
        (ok,) = factory.routerOk(pancake);
        assertTrue(ok);
    }

    function test_constructor_pancakeMustBeListed() public {
        address[] memory rs = new address[](1);
        rs[0] = aggregator;
        address[] memory ats = new address[](1);
        ats[0] = aggregator;
        IFloorFactory.Defaults memory d = _defaults();
        vm.expectRevert(IFloorFactory.RouterNotActive.selector);
        new FloorFactory(owner, guardian, address(usdt), address(v3f), pancake, address(stub), d, rs, ats);
    }

    function test_constructor_lengthMismatchAndZero() public {
        address[] memory rs = new address[](2);
        rs[0] = aggregator;
        rs[1] = pancake;
        address[] memory ats = new address[](1);
        ats[0] = aggregator;
        IFloorFactory.Defaults memory d = _defaults();
        vm.expectRevert(FloorFactory.LengthMismatch.selector);
        new FloorFactory(owner, guardian, address(usdt), address(v3f), pancake, address(stub), d, rs, ats);
        ats = new address[](2);
        vm.expectRevert(IFloorFactory.ZeroAddress.selector);
        new FloorFactory(owner, guardian, address(usdt), address(v3f), pancake, address(stub), d, rs, ats);
        vm.expectRevert(IFloorFactory.ZeroAddress.selector);
        new FloorFactory(address(0), guardian, address(usdt), address(v3f), pancake, address(stub), d, rs, ats);
    }

    // ------------------------------------------------------ createPosition

    function test_createPosition_pullsExactAndInitialises() public {
        _fund(user, 500e18);
        (address[] memory a, uint16[] memory w) = _basket1();
        vm.prank(user);
        address v = factory.createPosition(500e18, 9000, 365 days, a, w);
        assertEq(usdt.balanceOf(v), 500e18);
        assertEq(usdt.balanceOf(user), 0);
        assertEq(usdt.balanceOf(address(factory)), 0, "factory never holds funds");
        StubVault sv = StubVault(v);
        assertEq(sv.owner(), user);
        assertEq(sv.deposit(), 500e18);
        assertEq(sv.floor(), 450e18);
        assertEq(sv.maturity(), T0 + 365 days);
        assertEq(sv.assetsSeen(0), address(nvdab));
        assertEq(sv.factory(), address(factory));
        IFloorFactory.Defaults memory d = abi.decode(sv.cfg(), (IFloorFactory.Defaults));
        assertEq(d.minTrade, 20e18);
        assertEq(factory.positionsCount(), 1);
        assertEq(factory.positions(0), v);
        assertEq(factory.positionsOf(user)[0], v);
        assertEq(factory.totalTvl(), 500e18);
    }

    function test_createPosition_floorRoundsUp() public {
        _fund(user, 1000e18);
        (address[] memory a, uint16[] memory w) = _basket1();
        vm.prank(user);
        address v = factory.createPosition(333e18 + 1, 9001, 30 days, a, w);
        // ceil((333e18+1) * 9001 / 10000)
        uint256 dep = 333e18 + 1;
        uint256 expect = (dep * 9001 + 9999) / 10_000;
        assertEq(StubVault(v).floor(), expect);
    }

    function test_createPosition_copiesDefaultsAtCreation() public {
        _fund(user, 200e18);
        (address[] memory a, uint16[] memory w) = _basket1();
        vm.prank(user);
        address v1 = factory.createPosition(100e18, 9000, 30 days, a, w);
        IFloorFactory.Defaults memory d = _defaults();
        d.minTrade = 6e18; // P6
        vm.prank(owner);
        factory.setDefaults(d);
        vm.prank(user);
        address v2 = factory.createPosition(100e18, 9000, 30 days, a, w);
        assertEq(abi.decode(StubVault(v1).cfg(), (IFloorFactory.Defaults)).minTrade, 20e18, "existing untouched");
        assertEq(abi.decode(StubVault(v2).cfg(), (IFloorFactory.Defaults)).minTrade, 6e18);
    }

    function test_createPosition_reverts() public {
        _fund(user, 10_000e18);
        (address[] memory a, uint16[] memory w) = _basket1();
        vm.startPrank(user);
        vm.expectRevert(FloorFactory.BadAmount.selector);
        factory.createPosition(0, 9000, 30 days, a, w);
        vm.expectRevert(IFloorFactory.DepositTooLarge.selector);
        factory.createPosition(1000e18 + 1, 9000, 30 days, a, w);
        vm.expectRevert(IFloorFactory.BadFloor.selector);
        factory.createPosition(100e18, 4999, 30 days, a, w);
        vm.expectRevert(IFloorFactory.BadFloor.selector);
        factory.createPosition(100e18, 9801, 30 days, a, w);
        vm.expectRevert(IFloorFactory.BadTerm.selector);
        factory.createPosition(100e18, 9000, 7 days - 1, a, w);
        vm.expectRevert(IFloorFactory.BadTerm.selector);
        factory.createPosition(100e18, 9000, 400 days + 1, a, w);

        uint16[] memory w2 = new uint16[](1);
        w2[0] = 9999;
        vm.expectRevert(IFloorFactory.BadWeights.selector);
        factory.createPosition(100e18, 9000, 30 days, a, w2);

        address[] memory none = new address[](0);
        vm.expectRevert(IFloorFactory.BadAssets.selector);
        factory.createPosition(100e18, 9000, 30 days, none, new uint16[](0));

        address[] memory dup = new address[](2);
        dup[0] = address(nvdab);
        dup[1] = address(nvdab);
        uint16[] memory wd = new uint16[](2);
        wd[0] = 5000;
        wd[1] = 5000;
        vm.expectRevert(IFloorFactory.BadAssets.selector);
        factory.createPosition(100e18, 9000, 30 days, dup, wd);

        address[] memory unlisted = new address[](1);
        unlisted[0] = address(usdt);
        vm.expectRevert(abi.encodeWithSelector(IFloorFactory.AssetNotActive.selector, address(usdt)));
        factory.createPosition(100e18, 9000, 30 days, unlisted, w);

        address[] memory four = new address[](4);
        vm.expectRevert(IFloorFactory.BadAssets.selector);
        factory.createPosition(100e18, 9000, 30 days, four, new uint16[](4));
        vm.stopPrank();
    }

    function test_createPosition_totalTvlCap() public {
        _fund(user, 10_000e18);
        (address[] memory a, uint16[] memory w) = _basket1();
        vm.startPrank(user);
        for (uint256 i; i < 5; ++i) {
            factory.createPosition(1000e18, 9000, 30 days, a, w);
        }
        vm.expectRevert(IFloorFactory.TvlCapReached.selector);
        factory.createPosition(1e18, 9000, 30 days, a, w);
        vm.stopPrank();
    }

    function test_createPosition_pausedAndDisabledAsset() public {
        _fund(user, 100e18);
        (address[] memory a, uint16[] memory w) = _basket1();
        vm.prank(guardian);
        factory.pause();
        vm.prank(user);
        vm.expectRevert(IFloorFactory.PausedErr.selector);
        factory.createPosition(100e18, 9000, 30 days, a, w);
        vm.prank(guardian);
        factory.unpause();
        vm.prank(guardian);
        factory.disableAsset(address(nvdab));
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(IFloorFactory.AssetNotActive.selector, address(nvdab)));
        factory.createPosition(100e18, 9000, 30 days, a, w);
    }

    function test_createPosition_multiAsset() public {
        _fund(user, 300e18);
        address[] memory a = new address[](2);
        a[0] = address(nvdab);
        a[1] = address(qqqb);
        uint16[] memory w = new uint16[](2);
        w[0] = 6000;
        w[1] = 4000;
        vm.prank(user);
        address v = factory.createPosition(300e18, 9000, 30 days, a, w);
        assertEq(StubVault(v).weightsSeen(1), 4000);
    }

    function test_createPosition_noAllowanceReverts() public {
        usdt.mint(user, 100e18);
        (address[] memory a, uint16[] memory w) = _basket1();
        vm.prank(user);
        vm.expectRevert();
        factory.createPosition(100e18, 9000, 30 days, a, w);
    }

    // ------------------------------------------------------------- addAsset

    function test_addAsset_checks() public {
        MockToken tok = new MockToken("X", "X");
        MockPool p = new MockPool(address(tok), address(usdt), 2500);
        vm.startPrank(owner);
        // getPool mismatch
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(address(tok), address(p), 2500, 1, 1e18);
        v3f.set(address(tok), address(usdt), 2500, address(p));
        // cardinality
        p.setCardinality(199);
        vm.expectRevert(IFloorFactory.OracleHistoryTooShort.selector);
        factory.addAsset(address(tok), address(p), 2500, 1, 1e18);
        p.setCardinality(200);
        // observe reverts
        p.setRevertObserve(true);
        vm.expectRevert(IFloorFactory.OracleHistoryTooShort.selector);
        factory.addAsset(address(tok), address(p), 2500, 1, 1e18);
        p.setRevertObserve(false);
        // zero trade cap
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(address(tok), address(p), 2500, 1, 0);
        factory.addAsset(address(tok), address(p), 2500, 1, 1e18);
        (address pool,, bool active,,, bool u0) = factory.assets(address(tok));
        assertEq(pool, address(p));
        assertTrue(active);
        assertFalse(u0);
        vm.stopPrank();
        // usdtIsToken0 read from the pool
        (,,,,, bool q0) = factory.assets(address(qqqb));
        assertTrue(q0);
    }

    function test_addAsset_decimalsAndTokenOrder() public {
        Token6 t6 = new Token6();
        MockPool p = new MockPool(address(t6), address(usdt), 2500);
        v3f.set(address(t6), address(usdt), 2500, address(p));
        vm.prank(owner);
        vm.expectRevert(IFloorFactory.BadDecimals.selector);
        factory.addAsset(address(t6), address(p), 2500, 1, 1e18);

        // pool whose tokens are not (token, usdt)
        MockToken tok = new MockToken("Y", "Y");
        MockPool wrong = new MockPool(address(nvdab), address(usdt), 2500);
        v3f.set(address(tok), address(usdt), 2500, address(wrong));
        vm.prank(owner);
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(address(tok), address(wrong), 2500, 1, 1e18);
    }

    function test_addAsset_recordsMultiplier() public {
        assertEq(factory.lastMultiplier(address(nvdab)), 1e18);
    }

    function test_pokeMultiplier() public {
        vm.expectRevert(abi.encodeWithSelector(IFloorFactory.AssetNotActive.selector, address(usdt)));
        factory.pokeMultiplier(address(usdt));
        factory.pokeMultiplier(address(nvdab)); // unchanged: no-op
        assertEq(factory.lastMultiplierChange(address(nvdab)), 0);
        nvdab.setUiMultiplier(1.01e18);
        vm.expectEmit(true, false, false, true);
        emit IFloorFactory.MultiplierChanged(address(nvdab), 1e18, 1.01e18);
        vm.prank(rando);
        factory.pokeMultiplier(address(nvdab));
        assertEq(factory.lastMultiplier(address(nvdab)), 1.01e18);
        assertEq(factory.lastMultiplierChange(address(nvdab)), T0);
    }

    // ---------------------------------------------------------- role matrix

    function test_roles_ownerOnly() public {
        bytes[] memory calls = new bytes[](8);
        calls[0] = abi.encodeCall(factory.setKeeper, (rando, true));
        calls[1] = abi.encodeCall(factory.addAsset, (address(nvdab), address(nvdaPool), 2500, 1, 1));
        calls[2] = abi.encodeCall(factory.addRouter, (rando, rando));
        calls[3] = abi.encodeCall(factory.setGuardian, (rando));
        calls[4] = abi.encodeCall(factory.setDefaults, (_defaults()));
        calls[5] = abi.encodeCall(factory.setLimits, (1, 2));
        calls[6] = abi.encodeCall(factory.transferOwnership, (rando));
        calls[7] = abi.encodeCall(factory.setTokenBeacon, (rando, rando));
        address[3] memory bad = [rando, guardian, keeper];
        for (uint256 b; b < 3; ++b) {
            for (uint256 i; i < calls.length; ++i) {
                vm.prank(bad[b]);
                (bool ok, bytes memory ret) = address(factory).call(calls[i]);
                assertFalse(ok);
                assertEq(bytes4(ret), IFloorFactory.NotOwner.selector);
            }
        }
    }

    function test_roles_guardianOnly() public {
        vm.startPrank(owner);
        vm.expectRevert(IFloorFactory.NotGuardian.selector);
        factory.setNonTradingDay(1, true);
        vm.expectRevert(IFloorFactory.NotGuardian.selector);
        factory.approveTokenImpl(address(1));
        vm.stopPrank();
        vm.startPrank(rando);
        vm.expectRevert(IFloorFactory.NotGuardian.selector);
        factory.setNonTradingDay(1, true);
        uint32[] memory ds = new uint32[](1);
        vm.expectRevert(IFloorFactory.NotGuardian.selector);
        factory.setNonTradingDays(ds, true);
        vm.expectRevert(IFloorFactory.NotGuardian.selector);
        factory.approveTokenImpl(address(1));
        vm.stopPrank();
    }

    function test_roles_guardianOrOwner() public {
        vm.startPrank(rando);
        vm.expectRevert(FloorFactory.NotOwnerOrGuardian.selector);
        factory.pause();
        vm.expectRevert(FloorFactory.NotOwnerOrGuardian.selector);
        factory.unpause();
        vm.expectRevert(FloorFactory.NotOwnerOrGuardian.selector);
        factory.setHalted(true);
        vm.expectRevert(FloorFactory.NotOwnerOrGuardian.selector);
        factory.removeRouter(aggregator);
        vm.expectRevert(FloorFactory.NotOwnerOrGuardian.selector);
        factory.disableAsset(address(nvdab));
        vm.stopPrank();

        vm.prank(owner);
        factory.pause();
        assertTrue(factory.paused());
        vm.prank(guardian);
        factory.unpause();
        assertFalse(factory.paused());
        vm.prank(owner);
        factory.setHalted(true);
        assertTrue(factory.halted());
        vm.prank(guardian);
        factory.setHalted(false);
    }

    function test_guardianCannotAddRouterOrAsset() public {
        vm.prank(guardian);
        vm.expectRevert(IFloorFactory.NotOwner.selector);
        factory.addRouter(rando, rando);
    }

    // ------------------------------------------------------------- routers

    function test_router_24hDelay_andRemoval() public {
        address newR = makeAddr("newRouter");
        vm.prank(owner);
        factory.addRouter(newR, newR);
        (bool ok, address at) = factory.routerOk(newR);
        assertFalse(ok);
        assertEq(at, newR);
        vm.warp(block.timestamp + 24 hours - 1);
        (ok,) = factory.routerOk(newR);
        assertFalse(ok);
        vm.warp(block.timestamp + 1);
        (ok,) = factory.routerOk(newR);
        assertTrue(ok);
        // instant removal by guardian
        vm.prank(guardian);
        factory.removeRouter(newR);
        (ok,) = factory.routerOk(newR);
        assertFalse(ok);
        // re-adding restarts the delay
        vm.prank(owner);
        factory.addRouter(newR, newR);
        (ok,) = factory.routerOk(newR);
        assertFalse(ok);
        // unknown router
        vm.prank(guardian);
        vm.expectRevert(IFloorFactory.RouterNotActive.selector);
        factory.removeRouter(rando);
    }

    // ------------------------------------------------------------ ownership

    function test_twoStepOwnership() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        factory.transferOwnership(newOwner);
        assertEq(factory.owner(), owner, "unchanged until accepted");
        assertEq(factory.pendingOwner(), newOwner);
        vm.prank(rando);
        vm.expectRevert(FloorFactory.NotPendingOwner.selector);
        factory.acceptOwnership();
        vm.prank(newOwner);
        factory.acceptOwnership();
        assertEq(factory.owner(), newOwner);
        assertEq(factory.pendingOwner(), address(0));
        vm.prank(owner);
        vm.expectRevert(IFloorFactory.NotOwner.selector);
        factory.setKeeper(rando, true);
        vm.prank(newOwner);
        vm.expectRevert(IFloorFactory.ZeroAddress.selector);
        factory.transferOwnership(address(0));
    }

    // --------------------------------------------------------------- limits

    function test_setLimits_bounds() public {
        vm.startPrank(owner);
        vm.expectRevert(FloorFactory.BadLimits.selector);
        factory.setLimits(0, 10);
        vm.expectRevert(FloorFactory.BadLimits.selector);
        factory.setLimits(11, 10);
        factory.setLimits(5000e18, 50_000e18);
        vm.stopPrank();
        assertEq(factory.maxDeposit(), 5000e18);
    }

    function test_setDefaults_bounds() public {
        IFloorFactory.Defaults memory d = _defaults();
        vm.startPrank(owner);
        d.minTrade = 1e18 - 1;
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        d.minTrade = 1e18;
        factory.setDefaults(d); // allows 1e18 and up (P6 needs 6e18)
        d.minTrade = 6e18;
        factory.setDefaults(d);
        d.tolAggBps = 501;
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        d = _defaults();
        d.twapWindow = 59;
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        d = _defaults();
        d.sellBandBps = 0;
        vm.expectRevert(FloorFactory.BadDefaults.selector);
        factory.setDefaults(d);
        vm.stopPrank();
        (,,,,,,,, uint256 mt,) = factory.defaults();
        assertEq(mt, 6e18);
    }

    // -------------------------------------------------------------- beacon

    function test_setTokenBeacon_oneShot() public {
        vm.startPrank(owner);
        factory.setTokenBeacon(address(0xBEAC), address(0x1111));
        assertEq(factory.tokenBeacon(), address(0xBEAC));
        assertEq(factory.approvedTokenImpl(), address(0x1111));
        vm.expectRevert(FloorFactory.BeaconAlreadySet.selector);
        factory.setTokenBeacon(address(0xBEAD), address(0x2222));
        vm.stopPrank();
        vm.prank(guardian);
        factory.approveTokenImpl(address(0x3333));
        assertEq(factory.approvedTokenImpl(), address(0x3333));
    }

    // --------------------------------------------------------- trading open

    function test_isTradingOpen() public {
        assertTrue(factory.isTradingOpen(T0));
        assertFalse(factory.isTradingOpen(T0 + 1 days), "Saturday");
        assertFalse(factory.isTradingOpen(T0 - 2 hours), "14:00");
        vm.prank(guardian);
        factory.setHalted(true);
        assertFalse(factory.isTradingOpen(T0));
        vm.prank(guardian);
        factory.setHalted(false);
        vm.prank(guardian);
        factory.pause();
        assertFalse(factory.isTradingOpen(T0));
        vm.prank(guardian);
        factory.unpause();
        vm.prank(guardian);
        factory.setNonTradingDay(20_000, true);
        assertFalse(factory.isTradingOpen(T0), "holiday");
        assertTrue(factory.nonTradingDay(20_000));
        uint32[] memory ds = new uint32[](2);
        ds[0] = 20_000;
        ds[1] = 20_003;
        vm.prank(guardian);
        factory.setNonTradingDays(ds, false);
        assertTrue(factory.isTradingOpen(T0));
    }

    function test_noBnbAccepted() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        (bool ok,) = address(factory).call{value: 1 ether}("");
        assertFalse(ok);
    }
}

contract Token6 is MockToken {
    constructor() MockToken("T6", "T6") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
