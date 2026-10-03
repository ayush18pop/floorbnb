// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IPancakeV3SwapRouter} from "../../src/interfaces/IPancakeV3SwapRouter.sol";
import {ISecuritiesToken} from "../../src/interfaces/ISecuritiesToken.sol";
import {TwapOracle} from "../../src/libs/TwapOracle.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {MockPool} from "../mocks/MockPool.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

/// @dev Minimal factory stand-in exposing exactly what the vault reads (CONTRACTS.md section 11.1 getters).
contract VaultTestFactory {
    address public usdt;
    address public v3SwapRouter;
    address public tokenBeacon;
    address public approvedTokenImpl;
    bool public paused;
    bool public halted;
    mapping(address => bool) public isKeeper;
    mapping(address => IFloorFactory.Asset) internal _assets;
    mapping(address => address) public routerApprove; // router => approveTarget
    mapping(address => bool) public routerActive;
    mapping(address => uint256) public lastMultiplier;
    mapping(address => uint40) public lastMultiplierChange;
    mapping(uint32 => bool) public nonTradingDay;
    address public impl;

    constructor(address usdt_, address impl_) {
        usdt = usdt_;
        impl = impl_;
    }

    function setKeeper(address k, bool on) external {
        isKeeper[k] = on;
    }

    function setPaused(bool on) external {
        paused = on;
    }

    function setHalted(bool on) external {
        halted = on;
    }

    function setV3Router(address r) external {
        v3SwapRouter = r;
    }

    function setBeacon(address b, address approved) external {
        tokenBeacon = b;
        approvedTokenImpl = approved;
    }

    function setAsset(address token, address pool, uint24 fee, bool active, uint128 minLiq, uint256 maxTrade, bool u0)
        external
    {
        _assets[token] = IFloorFactory.Asset(pool, fee, active, minLiq, maxTrade, u0);
    }

    function setRouter(address r, address approveTarget, bool active) external {
        routerApprove[r] = approveTarget;
        routerActive[r] = active;
    }

    function setMultiplier(address token, uint256 m, uint40 at) external {
        lastMultiplier[token] = m;
        lastMultiplierChange[token] = at;
    }

    uint256 public closedReports;

    function onPositionClosed() external {
        ++closedReports;
    }

    /// @dev Same behaviour as the real factory's `pokeMultiplier`.
    function pokeMultiplier(address token) external {
        uint256 m = ISecuritiesToken(token).uiMultiplier();
        if (m != lastMultiplier[token]) {
            lastMultiplier[token] = m;
            lastMultiplierChange[token] = uint40(block.timestamp);
        }
    }

    function assets(address token)
        external
        view
        returns (address pool, uint24 fee, bool active, uint128 minLiquidity, uint256 maxTradeValue, bool usdtIsToken0)
    {
        IFloorFactory.Asset memory a = _assets[token];
        return (a.pool, a.fee, a.active, a.minLiquidity, a.maxTradeValue, a.usdtIsToken0);
    }

    function routerOk(address r) external view returns (bool, address) {
        return (routerActive[r], routerApprove[r]);
    }

    function isTradingOpen(uint256 ts) external view returns (bool) {
        if (paused || halted) return false;
        uint256 wd = (ts / 1 days + 3) % 7;
        if (wd >= 5) return false;
        uint256 s = ts % 1 days;
        return s >= 15.5 hours && s < 19.5 hours;
    }

    function create(
        address owner,
        uint256 deposit,
        uint16 floorBps,
        uint40 maturity,
        address[] calldata assets_,
        uint16[] calldata w,
        IFloorFactory.Defaults calldata d
    ) external returns (address v) {
        v = Clones.clone(impl);
        uint256 floor_ = (deposit * floorBps + 9999) / 10_000;
        IERC20(usdt).transferFrom(owner, v, deposit);
        IFloorVault(v).initialize(owner, deposit, floor_, maturity, assets_, w, abi.encode(d));
    }
}

/// @dev Pancake SwapRouter stand-in (old layout with deadline). Pays at `rate` (tokenOut per 1e18 tokenIn) less 25 bps.
contract MockPancakeRouter {
    mapping(address => mapping(address => uint256)) public rate;
    uint256 public feeBps = 25;
    address public overrideRecipient;

    function setRate(address a, address b, uint256 r) external {
        rate[a][b] = r;
    }

    function setOverrideRecipient(address r) external {
        overrideRecipient = r;
    }

    function exactInputSingle(IPancakeV3SwapRouter.ExactInputSingleParams calldata p) external returns (uint256 out) {
        out = (p.amountIn * rate[p.tokenIn][p.tokenOut] / 1e18) * (10_000 - feeBps) / 10_000;
        require(out >= p.amountOutMinimum, "Too little received");
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        IERC20(p.tokenOut).transfer(overrideRecipient != address(0) ? overrideRecipient : p.recipient, out);
    }
}

contract MockBeacon {
    address public implementation;

    function set(address i) external {
        implementation = i;
    }
}

/// @notice Shared fixture: one NVDAB-like asset, price about 100 USDT, vault with D = 10,000, floor 90%.
abstract contract VaultBase is Test {
    uint256 internal constant T0 = 20_000 days + 16 hours; // Friday 16:00 UTC, inside the window
    int24 internal constant TICK_100 = 46_054; // 1.0001^46054 ~ 100

    address internal user = makeAddr("user");
    address internal keeper = makeAddr("keeper");
    address internal rando = makeAddr("rando");

    MockToken internal usdt;
    MockToken internal stock;
    MockPool internal pool;
    MockRouter internal router; // aggregator stand-in
    MockPancakeRouter internal pancake;
    VaultTestFactory internal factory;
    FloorVault internal impl;
    FloorVault internal vault;
    MockBeacon internal beacon;

    function setUp() public virtual {
        vm.warp(T0);
        usdt = new MockToken("Tether", "USDT");
        stock = new MockToken("NVDAB", "NVDAB");
        pool = new MockPool(address(stock), address(usdt), 2500);
        pool.setTick(TICK_100, TICK_100);
        router = new MockRouter();
        pancake = new MockPancakeRouter();
        beacon = new MockBeacon();
        beacon.set(address(0xA11CE));
        impl = new FloorVault();
        factory = new VaultTestFactory(address(usdt), address(impl));
        factory.setKeeper(keeper, true);
        factory.setV3Router(address(pancake));
        factory.setBeacon(address(beacon), address(0xA11CE));
        factory.setAsset(address(stock), address(pool), 2500, true, 1e20, 25_000e18, false);
        factory.setRouter(address(router), address(router), true);
        factory.setRouter(address(pancake), address(pancake), true);
        factory.setMultiplier(address(stock), 1e18, 0);

        uint256 p = _price();
        router.setRate(address(usdt), address(stock), 1e36 / p);
        router.setRate(address(stock), address(usdt), p);
        pancake.setRate(address(usdt), address(stock), 1e36 / p);
        pancake.setRate(address(stock), address(usdt), p);
        stock.mint(address(router), 1e30);
        usdt.mint(address(router), 1e30);
        stock.mint(address(pancake), 1e30);
        usdt.mint(address(pancake), 1e30);

        vault = _newVault(10_000e18, 9000);
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

    function _newVault(uint256 deposit, uint16 floorBps) internal returns (FloorVault v) {
        address[] memory a = new address[](1);
        a[0] = address(stock);
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        usdt.mint(user, deposit);
        vm.prank(user);
        usdt.approve(address(factory), deposit);
        // the mock factory pulls from `user` itself, so approve the factory from the user (done above)
        vm.prank(address(factory));
        v = FloorVault(_createAs(deposit, floorBps, uint40(T0 + 365 days), a, w));
    }

    function _createAs(uint256 deposit, uint16 floorBps, uint40 mat, address[] memory a, uint16[] memory w)
        internal
        returns (address)
    {
        return factory.create(user, deposit, floorBps, mat, a, w, _defaults());
    }

    function _price() internal view returns (uint256) {
        return TwapOracle.priceWad(pool.twapTick(), false);
    }

    function _setTick(int24 t) internal {
        pool.setTick(t, t);
        uint256 p = TwapOracle.priceWad(t, false);
        router.setRate(address(usdt), address(stock), 1e36 / p);
        router.setRate(address(stock), address(usdt), p);
        pancake.setRate(address(usdt), address(stock), 1e36 / p);
        pancake.setRate(address(stock), address(usdt), p);
    }

    function _swapData(bool buy, uint256 amountIn, address recipient) internal view returns (bytes memory) {
        uint256 p = _price();
        if (buy) {
            return abi.encodeCall(
                MockRouter.swapExact, (address(usdt), address(stock), amountIn, amountIn * 1e18 / p, recipient)
            );
        }
        return
            abi.encodeCall(
                MockRouter.swapExact, (address(stock), address(usdt), amountIn, amountIn * p / 1e18, recipient)
            );
    }

    function _keeperSwap(bool buy, uint256 amountIn) internal {
        IFloorVault.Swap memory s = IFloorVault.Swap({
            assetIdx: 0,
            buy: buy,
            amountIn: amountIn,
            router: address(router),
            data: _swapData(buy, amountIn, address(vault))
        });
        vm.prank(keeper);
        vault.rebalance(s);
    }

    /// @dev Executes the vault's own preview through the honest router.
    function _rebalanceOnce() internal returns (bool done, bool buy, uint256 amountIn) {
        bool needed;
        (needed,, buy,,, amountIn,,) = vault.previewRebalance();
        if (!needed) return (false, false, 0);
        _keeperSwap(buy, amountIn);
        return (true, buy, amountIn);
    }
}

contract VaultTest is VaultBase {
    // ---------------------------------------------------------- initialize

    function test_initialize_storesParams() public view {
        assertEq(vault.owner(), user);
        assertEq(vault.factory(), address(factory));
        assertEq(vault.deposit(), 10_000e18);
        assertEq(vault.floor(), 9000e18);
        assertEq(vault.nAssets(), 1);
        assertEq(vault.assetAt(0), address(stock));
        assertEq(vault.weightBps(0), 10_000);
        assertEq(vault.sellBandBps(), 100);
        assertEq(vault.tolAggBps(), 30);
        assertEq(vault.minTrade(), 20e18);
        assertEq(vault.M(), 4e18);
        assertEq(uint8(vault.status()), uint8(IFloorVault.Status.Active));
        assertEq(vault.maturity(), T0 + 365 days);
    }

    function test_initialize_onlyOnce() public {
        address[] memory a = new address[](1);
        a[0] = address(stock);
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        vm.prank(address(factory));
        vm.expectRevert(IFloorVault.AlreadyInitialized.selector);
        vault.initialize(user, 1e18, 1e18, 1, a, w, abi.encode(_defaults()));
    }

    function test_initialize_disabledOnImplementation() public {
        address[] memory a = new address[](1);
        a[0] = address(stock);
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        vm.prank(address(factory));
        vm.expectRevert(IFloorVault.AlreadyInitialized.selector);
        impl.initialize(user, 1e18, 1e18, 1, a, w, abi.encode(_defaults()));
    }

    function test_initialize_eoaCannotInitialiseFreshClone() public {
        address clone = Clones.clone(address(impl));
        address[] memory a = new address[](1);
        a[0] = address(stock);
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        vm.prank(rando);
        vm.expectRevert(IFloorVault.NotFactory.selector);
        FloorVault(clone).initialize(user, 1e18, 1e18, 1, a, w, abi.encode(_defaults()));
    }

    function test_initialize_badWeightsAndDuplicates() public {
        address clone = Clones.clone(address(impl));
        address[] memory a = new address[](2);
        a[0] = address(stock);
        a[1] = address(stock);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        vm.prank(address(factory));
        vm.expectRevert(FloorVault.BadInit.selector);
        FloorVault(clone).initialize(user, 1e18, 1e18, 1, a, w, abi.encode(_defaults()));
    }

    // ------------------------------------------------ CPPI worked example

    function test_step0_targets() public view {
        (uint256 V, uint256 usdtBal, uint256[3] memory sv) = vault.valuation();
        assertEq(V, 10_000e18);
        assertEq(usdtBal, 10_000e18);
        assertEq(sv[0], 0);
        (uint256 c, uint256 e, uint256[3] memory t) = vault.targets();
        assertEq(c, 1000e18);
        assertEq(e, 4000e18);
        assertEq(t[0], 4000e18);
        assertEq(vault.claimValue(), 10_000e18);
    }

    function test_step0_buyThenStep1_sellOnDrop() public {
        (bool needed, uint8 idx, bool buy, address tin, address tout, uint256 amt, uint256 mAgg, uint256 mDir) =
            vault.previewRebalance();
        assertTrue(needed);
        assertEq(idx, 0);
        assertTrue(buy);
        assertEq(tin, address(usdt));
        assertEq(tout, address(stock));
        assertEq(amt, 4000e18);
        assertEq(mAgg, (4000e18 * 1e18 / _price()) * 9970 / 10_000);
        assertEq(mDir, (4000e18 * 1e18 / _price()) * 9900 / 10_000);

        _keeperSwap(true, amt);
        (uint256 V,, uint256[3] memory sv) = vault.valuation();
        assertApproxEqAbs(sv[0], 4000e18, 1e12);
        assertApproxEqAbs(V, 10_000e18, 1e12);
        assertEq(usdt.allowance(address(vault), address(router)), 0, "approval zeroed (I11)");

        // price -10%: stock value 3,600, V 9,600, C 600, E* 2,400 -> sell 1,200
        vm.warp(block.timestamp + 901);
        _setTick(TICK_100 - 1054);
        (V,, sv) = vault.valuation();
        (uint256 c, uint256 e,) = vault.targets();
        assertApproxEqRel(V, 9600e18, 2e15);
        assertApproxEqRel(c, 600e18, 5e15);
        assertApproxEqRel(e, 2400e18, 5e15);
        (needed,, buy,,, amt,,) = vault.previewRebalance();
        assertTrue(needed);
        assertFalse(buy);
        assertApproxEqRel(amt * _price() / 1e18, 1200e18, 1e16);
        _keeperSwap(false, amt);
        (,, sv) = vault.valuation();
        (, e,) = vault.targets();
        assertApproxEqRel(sv[0], e, 1e14);
    }

    function test_cashLock_afterGapNoBuyEver() public {
        _rebalanceOnce();
        // 30% gap: V < F
        vm.warp(block.timestamp + 901);
        _setTick(TICK_100 - 3567); // ~ -30%
        (uint256 V,,) = vault.valuation();
        assertLt(V, 9000e18);
        (uint256 c, uint256 e,) = vault.targets();
        assertEq(c, 0);
        assertEq(e, 0, "I5: no exposure when V <= F");
        (bool needed,, bool buy,,,,,) = vault.previewRebalance();
        assertTrue(needed);
        assertFalse(buy, "only sells");
        // sell everything (possibly in several calls)
        for (uint256 i; i < 5; ++i) {
            vm.warp(block.timestamp + 901);
            (bool done,,) = _rebalanceOnce();
            if (!done) break;
        }
        (,, uint256[3] memory sv) = vault.valuation();
        assertLt(sv[0], 20e18);
        // recovery of price does not re-risk: after it recovers V might exceed F, but here V < F still
        vm.warp(block.timestamp + 901);
        (needed,, buy,,,,,) = vault.previewRebalance();
        assertFalse(needed && buy);
    }

    function test_maturity_targetsZeroAndSells() public {
        _rebalanceOnce();
        vm.warp(T0 + 365 days + 1 hours); // day number moves to a Saturday? keep to weekday below
        // move to the next weekday window if needed
        uint256 ts = block.timestamp;
        while (((ts / 1 days + 3) % 7) >= 5) ts += 1 days;
        vm.warp((ts / 1 days) * 1 days + 16 hours);
        (, uint256 e,) = vault.targets();
        assertEq(e, 0, "I12");
        (bool needed,, bool buy,,,,,) = vault.previewRebalance();
        assertTrue(needed);
        assertFalse(buy);
        _rebalanceOnce();
        (,, uint256[3] memory sv) = vault.valuation();
        assertLt(sv[0], 1e6); // fully sold, wei dust only
    }

    // ----------------------------------------------------- keeper reverts (I10)

    function _swapStruct(bool buy, uint256 amt, address r) internal view returns (IFloorVault.Swap memory) {
        return IFloorVault.Swap(0, buy, amt, r, _swapData(buy, amt, address(vault)));
    }

    function test_revert_notKeeper() public {
        IFloorVault.Swap memory s = _swapStruct(true, 4000e18, address(router));
        vm.prank(rando);
        vm.expectRevert(IFloorVault.NotKeeper.selector);
        vault.rebalance(s);
    }

    function test_revert_tradingClosed_weekend_paused_halted_offHours() public {
        IFloorVault.Swap memory s = _swapStruct(true, 4000e18, address(router));
        vm.startPrank(keeper);
        vm.warp(T0 + 1 days); // Saturday
        vm.expectRevert(IFloorVault.TradingClosed.selector);
        vault.rebalance(s);
        vm.warp(T0 - 2 hours); // 14:00 Friday
        vm.expectRevert(IFloorVault.TradingClosed.selector);
        vault.rebalance(s);
        vm.warp(T0);
        vm.stopPrank();
        factory.setPaused(true);
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.TradingClosed.selector);
        vault.rebalance(s);
        factory.setPaused(false);
        factory.setHalted(true);
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.TradingClosed.selector);
        vault.rebalance(s);
        vm.expectRevert(IFloorVault.TradingClosed.selector);
        vault.rebalancePublic(0);
    }

    function test_revert_tooSoon() public {
        _keeperSwap(true, 4000e18);
        _setTick(TICK_100 - 1054);
        IFloorVault.Swap memory s = _swapStruct(false, 1e18, address(router));
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.TooSoon.selector);
        vault.rebalance(s);
    }

    function test_revert_wrongDirection_realCase() public {
        _keeperSwap(true, 4000e18);
        vm.warp(block.timestamp + 901);
        _setTick(TICK_100 - 1054); // wants to sell
        IFloorVault.Swap memory s = _swapStruct(true, 100e18, address(router));
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.WrongDirection.selector);
        vault.rebalance(s);
    }

    function test_revert_amountOutOfRange() public {
        vm.startPrank(keeper);
        IFloorVault.Swap memory s = _swapStruct(true, 4000e18 + 1, address(router));
        vm.expectRevert(IFloorVault.AmountOutOfRange.selector);
        vault.rebalance(s);
        s = _swapStruct(true, 2000e18 - 1, address(router));
        vm.expectRevert(IFloorVault.AmountOutOfRange.selector);
        vault.rebalance(s);
        // boundaries pass
        s = _swapStruct(true, 2000e18, address(router));
        vault.rebalance(s);
        vm.stopPrank();
    }

    function test_revert_routerNotAllowed() public {
        MockRouter other = new MockRouter();
        IFloorVault.Swap memory s = _swapStruct(true, 4000e18, address(other));
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.RouterNotAllowed.selector);
        vault.rebalance(s);
        // removed router
        factory.setRouter(address(router), address(router), false);
        s = _swapStruct(true, 4000e18, address(router));
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.RouterNotAllowed.selector);
        vault.rebalance(s);
    }

    function test_revert_noTradeNeeded_whenBalanced() public {
        _rebalanceOnce();
        vm.warp(block.timestamp + 901);
        IFloorVault.Swap memory s = _swapStruct(true, 100e18, address(router));
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.NoTradeNeeded.selector);
        vault.rebalance(s);
    }

    function test_revert_minOutNotMet_routerShortChanges() public {
        // router pays 1% less than fair; tolerance is 0.3%
        uint256 p = _price();
        router.setRate(address(usdt), address(stock), (1e36 / p) * 99 / 100);
        uint256 amt = 4000e18;
        uint256 fair = amt * 1e18 / p;
        bytes memory data = abi.encodeCall(MockRouter.swap, (address(usdt), address(stock), amt, address(vault)));
        IFloorVault.Swap memory s = IFloorVault.Swap(0, true, amt, address(router), data);
        vm.prank(keeper);
        fair; // silence unused
        vm.expectPartialRevert(IFloorVault.MinOutNotMet.selector);
        vault.rebalance(s);
    }

    function test_priceGuards_failClosed() public {
        IFloorVault.Swap memory s = _swapStruct(true, 4000e18, address(router));
        // deviation: spot 5% above twap
        pool.setTick(TICK_100, TICK_100 + 500);
        vm.prank(keeper);
        vm.expectRevert(TwapOracle.PriceDeviation.selector);
        vault.rebalance(s);
        pool.setTick(TICK_100, TICK_100);
        // history
        pool.setRevertObserve(true);
        vm.prank(keeper);
        vm.expectRevert(TwapOracle.OracleHistoryTooShort.selector);
        vault.rebalance(s);
        pool.setRevertObserve(false);
        // low cardinality
        pool.setCardinality(199);
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.OracleHistoryTooShort.selector);
        vault.rebalance(s);
        pool.setCardinality(3000);
        // liquidity
        pool.setLiquidity(1);
        vm.prank(keeper);
        vm.expectRevert(TwapOracle.PoolIlliquid.selector);
        vault.rebalance(s);
    }

    function test_beaconChanged_buysBlocked_sellsAllowed() public {
        _keeperSwap(true, 4000e18);
        beacon.set(address(0xBAD));
        vm.warp(block.timestamp + 901);
        // price up 10%: wants to buy
        _setTick(TICK_100 + 953);
        (bool needed,,,,,,,) = vault.previewRebalance();
        assertFalse(needed, "preview suppresses buys");
        IFloorVault.Swap memory s = _swapStruct(true, 1e18, address(router));
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.TokenImplChanged.selector);
        vault.rebalance(s);
        vm.expectRevert(IFloorVault.TokenImplChanged.selector);
        vm.prank(keeper);
        vault.rebalance(s);
        // price crash: sells still work
        vm.warp(block.timestamp + 901);
        _setTick(TICK_100 - 1054);
        bool buy2;
        (needed,, buy2,,,,,) = vault.previewRebalance();
        assertTrue(needed);
        assertFalse(buy2);
        _rebalanceOnce();
    }

    function test_multiplierGuard() public {
        IFloorVault.Swap memory s = _swapStruct(true, 4000e18, address(router));
        // unpoked change (A12 F-05): the vault arms the guard itself and the call is a no-op that does NOT revert
        stock.setUiMultiplier(1.001e18);
        vm.prank(keeper);
        vault.rebalance(s);
        assertEq(factory.lastMultiplier(address(stock)), 1.001e18, "vault poked the factory");
        assertEq(stock.balanceOf(address(vault)), 0, "no trade happened");
        // poked just now: window not elapsed
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.MultiplierTransition.selector);
        vault.rebalance(s);
        // after the window: fine
        vm.warp(block.timestamp + 601);
        vm.prank(keeper);
        vault.rebalance(s);
    }

    function test_multiplierGuard_pending() public {
        stock.setPending(1.002e18, block.timestamp + 30 minutes);
        IFloorVault.Swap memory s = _swapStruct(true, 4000e18, address(router));
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.MultiplierTransition.selector);
        vault.rebalance(s);
        stock.setPending(1.002e18, block.timestamp + 3 hours);
        vm.prank(keeper);
        vault.rebalance(s);
    }

    function test_disabledAsset_isUnwound() public {
        _rebalanceOnce();
        factory.setAsset(address(stock), address(pool), 2500, false, 1e20, 25_000e18, false);
        vm.warp(block.timestamp + 901);
        (, uint256 e, uint256[3] memory t) = vault.targets();
        assertEq(t[0], 0);
        assertGt(e, 0);
        (bool needed,, bool buy,,,,,) = vault.previewRebalance();
        assertTrue(needed);
        assertFalse(buy);
        _rebalanceOnce();
        (,, uint256[3] memory sv) = vault.valuation();
        assertLt(sv[0], 1e6);
    }

    // ------------------------------------------------------ public fallback

    function test_public_tooEarly_thenWorks_andRecipientIsVault() public {
        vm.expectRevert(IFloorVault.PublicTooEarly.selector);
        vault.rebalancePublic(0);
        vm.warp(block.timestamp + 4 hours + 1); // T0+4h = 20:00, window closed
        vm.expectRevert(IFloorVault.TradingClosed.selector);
        vault.rebalancePublic(0);
        // next day (Saturday) closed; go to Monday 16:00
        vm.warp(T0 + 3 days);
        vault.rebalancePublic(0);
        (,, uint256[3] memory sv) = vault.valuation();
        assertApproxEqRel(sv[0], 4000e18, 5e15); // 25 bps pool fee in the mock
        assertEq(usdt.allowance(address(vault), address(pancake)), 0);
    }

    function test_public_hostileRouterRecipientFails() public {
        pancake.setOverrideRecipient(rando);
        vm.warp(T0 + 3 days);
        vm.expectPartialRevert(IFloorVault.MinOutNotMet.selector);
        vault.rebalancePublic(0);
    }

    function test_public_needs2xBand() public {
        _rebalanceOnce();
        // small drift: sell 1.5% of V needed -> above 1% band, below 2% band
        vm.warp(T0 + 3 days);
        // E = 4000 stock; V changes with price; choose tick -0.5% -> E-E* = 300 * 0.5% * 4000/... compute roughly
        _setTick(TICK_100 - 60); // ~ -0.6%: sell ~ 4000*0.006*... = 300*? ~ 72 USDT => 0.72% of V < 1% band
        (bool needed,,,,,,,) = vault.previewRebalance();
        assertFalse(needed);
        _setTick(TICK_100 - 130); // ~ -1.3% -> sell ~ 1.56%*? between 1x and 2x band
        (needed,,,,,,,) = vault.previewRebalance();
        if (needed) {
            vm.expectRevert(IFloorVault.NoTradeNeeded.selector);
            vault.rebalancePublic(0);
        }
        _setTick(TICK_100 - 400); // large drop: public path allowed
        vault.rebalancePublic(0);
    }

    function test_public_invalidAsset() public {
        vm.warp(T0 + 3 days);
        vm.expectRevert(IFloorVault.NoTradeNeeded.selector);
        vault.rebalancePublic(1);
    }

    // ------------------------------------------------------------- exits

    function test_exits_onlyOwner() public {
        vm.startPrank(rando);
        vm.expectRevert(IFloorVault.NotOwner.selector);
        vault.requestClose();
        vm.expectRevert(IFloorVault.NotOwner.selector);
        vault.closeToUSDT();
        vm.expectRevert(IFloorVault.NotOwner.selector);
        vault.exitInKind(rando);
        vm.expectRevert(IFloorVault.NotOwner.selector);
        vault.rescue(address(usdt), rando);
        vm.stopPrank();
    }

    function test_close_flow() public {
        _rebalanceOnce();
        vm.prank(user);
        vault.requestClose();
        assertEq(uint8(vault.status()), uint8(IFloorVault.Status.Closing));
        (, uint256 e,) = vault.targets();
        assertEq(e, 0);
        vm.prank(user);
        vm.expectRevert(IFloorVault.StockNotUnwound.selector);
        vault.closeToUSDT();
        vm.warp(block.timestamp + 901);
        _rebalanceOnce();
        uint256 before_ = usdt.balanceOf(user);
        vm.prank(user);
        vault.closeToUSDT();
        assertApproxEqAbs(usdt.balanceOf(user) - before_, 10_000e18, 20e18);
        assertEq(usdt.balanceOf(address(vault)), 0);
        assertEq(uint8(vault.status()), uint8(IFloorVault.Status.Closed));
        // Closed: no more trading, no second close
        IFloorVault.Swap memory s = _swapStruct(true, 1e18, address(router));
        vm.prank(keeper);
        vm.expectRevert(FloorVault.BadStatus.selector);
        vault.rebalance(s);
        vm.prank(user);
        vm.expectRevert(FloorVault.BadStatus.selector);
        vault.closeToUSDT();
    }

    function test_requestClose_twiceReverts() public {
        vm.startPrank(user);
        vault.requestClose();
        vm.expectRevert(FloorVault.BadStatus.selector);
        vault.requestClose();
        vm.stopPrank();
    }

    function test_closeToUSDT_noOracleNeededWhenEmpty() public {
        pool.setRevertObserve(true); // dead pool
        vm.prank(user);
        vault.closeToUSDT();
        assertEq(usdt.balanceOf(user), 10_000e18);
    }

    function test_exitInKind_returnsStockAndUsdt() public {
        _rebalanceOnce();
        uint256 st = stock.balanceOf(address(vault));
        uint256 us = usdt.balanceOf(address(vault));
        vm.prank(user);
        vault.exitInKind(user);
        assertEq(stock.balanceOf(user), st);
        assertEq(usdt.balanceOf(user), us);
        assertEq(stock.balanceOf(address(vault)), 0);
        assertEq(usdt.balanceOf(address(vault)), 0);
        assertEq(uint8(vault.status()), uint8(IFloorVault.Status.Closed));
    }

    function test_exitInKind_alwaysAllowed_I8_I13() public {
        _rebalanceOnce();
        factory.setPaused(true);
        factory.setHalted(true);
        factory.setRouter(address(router), address(router), false);
        factory.setRouter(address(pancake), address(pancake), false);
        pool.setRevertObserve(true);
        pool.setLiquidity(0);
        vm.warp(T0 + 1 days); // weekend
        stock.setPaused(true); // token reverts
        uint256 us = usdt.balanceOf(address(vault));
        uint256 st = stock.balanceOf(address(vault));
        vm.prank(user);
        vault.exitInKind(user);
        assertEq(usdt.balanceOf(user), us, "USDT leaves despite paused token");
        assertEq(stock.balanceOf(address(vault)), st, "paused token skipped");
        // rescue after the issuer unpauses
        stock.setPaused(false);
        vm.prank(user);
        vault.rescue(address(stock), user);
        assertEq(stock.balanceOf(user), st);
    }

    function test_exitInKind_blocklistedRecipient() public {
        _rebalanceOnce();
        stock.setBlocked(user, true);
        uint256 st = stock.balanceOf(address(vault));
        vm.prank(user);
        vault.exitInKind(user);
        assertEq(stock.balanceOf(address(vault)), st);
        // choose a clean address
        vm.prank(user);
        vault.exitInKind(rando);
        assertEq(stock.balanceOf(rando), st);
    }

    function test_exitInKind_gasBombTokenDoesNotTrapUsdt() public {
        GasBombToken bomb = new GasBombToken();
        factory.setAsset(address(bomb), address(pool), 2500, true, 1e20, 25_000e18, false);
        address[] memory a = new address[](1);
        a[0] = address(bomb);
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        usdt.mint(user, 100e18);
        vm.prank(user);
        usdt.approve(address(factory), 100e18);
        FloorVault v = FloorVault(_createAs(100e18, 9000, uint40(T0 + 100 days), a, w));
        vm.prank(user);
        v.exitInKind(user);
        assertEq(usdt.balanceOf(user), 100e18);
    }

    function test_rescue_onlyWhenClosed() public {
        usdt.mint(address(vault), 5e18);
        vm.prank(user);
        vm.expectRevert(IFloorVault.NotClosed.selector);
        vault.rescue(address(usdt), user);
        MockToken air = new MockToken("AIR", "AIR");
        air.mint(address(vault), 7e18);
        vm.startPrank(user);
        vault.exitInKind(user);
        vault.rescue(address(air), user);
        vm.stopPrank();
        assertEq(air.balanceOf(user), 7e18);
    }

    function test_exitInKind_zeroAddressReverts() public {
        vm.prank(user);
        vm.expectRevert(FloorVault.BadInit.selector);
        vault.exitInKind(address(0));
    }

    // ------------------------------------------------------- A -> B isolation

    function test_isolation_twoVaults() public {
        FloorVault v2 = _newVault(5000e18, 9500);
        uint256 before_ = usdt.balanceOf(address(v2));
        _rebalanceOnce();
        vm.prank(user);
        vault.exitInKind(user);
        assertEq(usdt.balanceOf(address(v2)), before_);
    }

    // --------------------------------------------------------------- fuzz

    /// I6 and I3 on the vault view: exposure target never above V and never above M * cushion.
    function testFuzz_targetsBounded(int24 dTick, uint96 usdtExtra) public {
        dTick = int24(bound(int256(dTick), -3000, 3000));
        usdt.mint(address(vault), bound(usdtExtra, 0, 1e24));
        _setTick(TICK_100 + dTick);
        (uint256 V,,) = vault.valuation();
        (uint256 c, uint256 e,) = vault.targets();
        assertLe(e, V);
        assertLe(e, c * 4);
        assertEq(c, V > 9000e18 ? V - 9000e18 : 0);
    }

    /// I10 hostile amountIn: either reverts or lands in [computed/2, computed].
    function testFuzz_hostileAmountIn(uint256 amt) public {
        (,,,,, uint256 computed,,) = vault.previewRebalance();
        amt = bound(amt, 0, computed * 3);
        IFloorVault.Swap memory s = _swapStruct(true, amt, address(router));
        vm.prank(keeper);
        try vault.rebalance(s) {
            assertTrue(amt <= computed && amt >= computed / 2);
        } catch {}
    }
}

/// @dev Token whose transfer burns all gas.
contract GasBombToken {
    function balanceOf(address) external pure returns (uint256) {
        return 1e18;
    }

    function transfer(address, uint256) external pure returns (bool) {
        while (true) {}
        return true;
    }
}
