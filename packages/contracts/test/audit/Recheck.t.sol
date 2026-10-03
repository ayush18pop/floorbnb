// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AuditBase} from "./AuditBase.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {MockPool} from "../mocks/MockPool.sol";

/// @dev bStock whose balanceOf and transfer both burn all gas, and which can re-enter the vault from transfer.
contract BurnToken is MockToken {
    bool public burnRead = true;
    address public target;
    bytes public payload;

    constructor(string memory n, string memory s) MockToken(n, s) {}

    function setReenter(address t, bytes calldata p) external {
        target = t;
        payload = p;
        burnRead = false;
    }

    function balanceOf(address a) public view override returns (uint256) {
        if (burnRead) {
            assembly {
                invalid()
            }
        }
        return super.balanceOf(a);
    }

    function transfer(address to, uint256 v) public override returns (bool) {
        if (burnRead) {
            assembly {
                invalid()
            }
        }
        if (target != address(0)) {
            (bool ok,) = target.call(payload);
            require(!ok, "reentered");
        }
        return super.transfer(to, v);
    }
}

contract RevertingBeacon {
    function implementation() external pure returns (address) {
        revert("beacon down");
    }
}

/// @notice A12r re-check: adversarial tests against the FIX1 code. Tests named `_KNOWN_` or `_M0x_` PASS while the
///         weakness exists (they pin the behaviour); there is no High finding, so no failing PoC is required.
contract RecheckTest is AuditBase {
    // --------------------------------------------------------------- exit hardening (A12 F-00 / F-09)
    function _evil3() internal returns (BurnToken[3] memory e, address[] memory a, uint16[] memory w) {
        a = new address[](3);
        w = new uint16[](3);
        for (uint256 i; i < 3; ++i) {
            e[i] = new BurnToken("E", "E");
            MockPool p = new MockPool(address(e[i]), address(usdt), 2500);
            p.setTick(TICK_100, TICK_100);
            v3f.set(address(e[i]), address(usdt), 2500, address(p));
            vm.prank(owner);
            factory.addAsset(address(e[i]), address(p), 2500, 1e20, 25_000e18);
            a[i] = address(e[i]);
        }
        w[0] = 4000;
        w[1] = 3000;
        w[2] = 3000;
    }

    function test_r2_exit_threeGasBurningTokens_usdtStillReturned() public {
        (BurnToken[3] memory e, address[] memory a, uint16[] memory w) = _evil3();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        for (uint256 i; i < 3; ++i) {
            e[i].mint(address(v), 1e18);
        }
        uint256 g = gasleft();
        vm.prank(user);
        (bool ok,) = address(v).call{gas: 3_000_000}(abi.encodeCall(IFloorVault.exitInKind, (user)));
        emit log_named_uint("gas used, 3 burning tokens", g - gasleft());
        assertTrue(ok, "exit must not revert");
        assertEq(usdt.balanceOf(user), 1000e18);
    }

    function test_r2_exit_threeBurningReads_closeToUsdt() public {
        (, address[] memory a, uint16[] memory w) = _evil3();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        vm.prank(user);
        (bool ok,) = address(v).call{gas: 3_000_000}(abi.encodeCall(IFloorVault.closeToUSDT, ()));
        assertTrue(ok);
        assertEq(usdt.balanceOf(user), 1000e18);
    }

    function test_r2_exit_reentrantTokenCannotDoubleSpendOrBreakExit() public {
        (BurnToken[3] memory e, address[] memory a, uint16[] memory w) = _evil3();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        e[0].mint(address(v), 1e18);
        e[0].setReenter(address(v), abi.encodeCall(IFloorVault.exitInKind, (address(e[0]))));
        e[1].setReenter(address(v), "");
        e[2].setReenter(address(v), "");
        vm.prank(user);
        v.exitInKind(user);
        assertEq(usdt.balanceOf(user), 1000e18);
        assertEq(e[0].balanceOf(user), 1e18, "re-entry blocked, token moved exactly once");
        assertEq(e[0].balanceOf(address(v)), 0);
        assertEq(factory.totalTvl(), 0);
    }

    function test_r2_exit_zeroBalancesAndTwice() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        vm.startPrank(user);
        v.exitInKind(user);
        v.exitInKind(user); // second call: nothing left, no revert, no double TVL release
        vm.expectRevert(FloorVault.BadStatus.selector);
        v.closeToUSDT();
        vm.stopPrank();
        assertEq(factory.totalTvl(), 0);
    }

    // --------------------------------------------------------------- TVL accounting (F-01)
    function test_r2_tvl_noDoubleDecrement_twoVaults() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v1 = _create(user, 1000e18, 9000, a, w);
        FloorVault v2 = _create(attacker, 500e18, 9000, a, w);
        vm.startPrank(user);
        v1.exitInKind(user);
        v1.exitInKind(user);
        v1.exitInKind(user);
        vm.stopPrank();
        assertEq(factory.totalTvl(), 500e18, "v2 deposit must still count");
        assertEq(factory.liveDeposit(address(v2)), 500e18);
    }

    function test_r2_tvl_fakeVaultCannotReleaseOthers() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        _create(user, 1000e18, 9000, a, w);
        // an attacker clones the implementation and initialises it with a fake "factory" contract
        FakeFactory ff = new FakeFactory(address(usdt), factory);
        FloorVault fake = FloorVault(_clone(address(impl)));
        ff.initFake(fake, attacker, a, w);
        vm.prank(attacker);
        fake.exitInKind(attacker); // reports to the REAL? no: reports to ff, never to the real factory
        vm.prank(address(fake));
        factory.onPositionClosed(); // direct call from a non-registered address
        assertEq(factory.totalTvl(), 1000e18);
    }

    function _clone(address i) internal returns (address inst) {
        bytes memory code =
            abi.encodePacked(hex"3d602d80600a3d3981f3363d3d373d3d3d363d73", i, hex"5af43d82803e903d91602b57fd5bf3");
        assembly {
            inst := create(0, add(code, 0x20), mload(code))
        }
    }

    // --------------------------------------------------------------- fail-soft pricing (F-03)
    function _fundHeld(FloorVault v, uint256 e1, uint256 e2) internal {
        // 1000 USDT deposit, floor 900. Put e1/e2 USDT of stock at price 100 into the vault, take the USDT out.
        stock1.mint(address(v), e1 / 100);
        stock2.mint(address(v), e2 / 100);
        vm.prank(address(v));
        usdt.transfer(address(0xbeef), e1 + e2); // keeps V == 1000e18 once the amounts are in 18 decimals
    }

    /// M-01 (FIXED in FIX2): a failed spot guard on one held pool no longer understates V (valuation uses the TWAP),
    /// so pushing pool 2 for a block cannot force a sale of healthy asset 1.
    function test_fix2_M01_pushedHeldPoolDoesNotForceUnwind() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        _fundHeld(v, 240e18, 160e18); // exactly on target
        (uint256 V0,,) = v.valuation();
        pool2.setTick(TICK_100, TICK_100 + 400); // spot pushed 400 ticks: PriceDeviation guard fails for pool2
        (uint256 V1,,) = v.valuation();
        assertEq(V1, V0, "valuation unchanged by the spot push");
        (bool needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed, "no sale forced");
    }

    function test_fix2_M01_rebalancePublicCannotBeForced() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        _fundHeld(v, 240e18, 160e18);
        vm.warp(T0 + 3 days);
        pool2.setTick(TICK_100, TICK_100 + 400);
        vm.prank(attacker);
        vm.expectRevert(IFloorVault.NoTradeNeeded.selector);
        v.rebalancePublic(0);
    }

    /// A held asset with no TWAP at all (history too short) still values 0 and cannot be traded.
    function test_fix2_M01_noTwapAtAll_valuedZero() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        _fundHeld(v, 240e18, 160e18);
        (uint256 V0,,) = v.valuation();
        pool2.setRevertObserve(true);
        (uint256 V1,,) = v.valuation();
        assertLt(V1, V0, "asset with no TWAP counts as 0");
    }

    function test_r2_failedHeldPool_buysSuppressed_keeperCannotBuy() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        pool2.setTick(TICK_100, TICK_100 + 400);
        vm.warp(block.timestamp + 1 hours);
        bytes memory data = abi.encodeWithSignature("x()");
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.NoTradeNeeded.selector);
        v.rebalance(IFloorVault.Swap({assetIdx: 0, buy: true, amountIn: 1e18, router: address(agg), data: data}));
    }

    // --------------------------------------------------------------- unwind residue (F-06)
    /// L-01 (FIXED in FIX2): closeToUSDT compares each asset to dust, so leftovers of several assets cannot block it.
    function test_fix2_L01_residueOfSeveralAssetsDoesNotBlockCloseToUsdt() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        stock1.mint(address(v), 0.009e18); // 0.9 USDT
        stock2.mint(address(v), 0.009e18); // 0.9 USDT
        vm.prank(user);
        v.requestClose();
        (bool needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed, "keeper has nothing to sell");
        vm.prank(user);
        v.closeToUSDT();
        assertEq(usdt.balanceOf(user), 1000e18);
    }

    function test_fix2_L01_assetAboveDustStillBlocksClose() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        stock1.mint(address(v), 0.02e18); // 2 USDT > dust 1
        vm.prank(user);
        vm.expectRevert(IFloorVault.StockNotUnwound.selector);
        v.closeToUSDT();
    }

    function test_r2_residueSingleAssetBetweenDustAndMinTrade_unwinds() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        stock1.mint(address(v), 0.15e18); // 15 USDT, between dust (1) and minTrade (20)
        vm.prank(user);
        v.requestClose();
        (bool needed,, bool buy,,, uint256 amountIn,,) = v.previewRebalance();
        assertTrue(needed && !buy);
        _keeperSwap(v, 0, false, address(stock1), amountIn, _price(pool1));
        vm.prank(user);
        v.closeToUSDT();
    }

    // --------------------------------------------------------------- multiplier poke (F-05)
    function test_r2_poke_noopWhenUnchanged_cannotExtendWindow() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        _create(user, 1000e18, 9000, a, w);
        uint40 t0 = factory.lastMultiplierChange(address(stock1));
        vm.warp(block.timestamp + 5 minutes);
        vm.prank(attacker);
        factory.pokeMultiplier(address(stock1));
        assertEq(factory.lastMultiplierChange(address(stock1)), t0, "poke without change must not re-arm the window");
    }

    function test_r2_poke_publicPathPokesToo_andSettles() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        vm.warp(T0 + 3 days);
        stock1.setUiMultiplier(1.002e18);
        vm.prank(attacker);
        v.rebalancePublic(0); // pokes, returns
        assertEq(factory.lastMultiplier(address(stock1)), 1.002e18);
        vm.prank(attacker);
        vm.expectRevert(IFloorVault.MultiplierTransition.selector);
        v.rebalancePublic(0);
    }

    /// I-03 (Info): the balance READ leg of the F-09 fix. Scan gas limits: any limit where the exit succeeds but the
    /// stock was silently left behind is the residual (recoverable by `rescue`). Pins the observation either way.
    function test_r2_lowGasScan_noSilentSkipOnReadLeg_mockToken() public {
        uint256 silent;
        for (uint256 g = 60_000; g <= 700_000; g += 2500) {
            uint256 snap = vm.snapshotState();
            (address[] memory a, uint16[] memory w) = _one(address(stock1));
            FloorVault v = _create(user, 1000e18, 9000, a, w);
            stock1.mint(address(v), 3e18);
            vm.prank(user);
            (bool ok,) = address(v).call{gas: g}(abi.encodeCall(IFloorVault.exitInKind, (user)));
            if (ok && stock1.balanceOf(user) == 0) {
                ++silent;
                emit log_named_uint("silent skip at gas", g);
            }
            vm.revertToState(snap);
        }
        assertEq(silent, 0, "no silent skip with a plain token (proxy tokens cost more: unverified)");
    }

    // --------------------------------------------------------------- beacon read (pre-existing, Low)
    /// L-02 (FIXED in FIX2): a reverting beacon hides buys only; previewRebalance does not revert and still shows sells.
    function test_fix2_L02_revertingBeaconDoesNotBlindPreview() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        RevertingBeacon b = new RevertingBeacon();
        vm.prank(owner);
        factory.setTokenBeacon(address(b), address(0x1234));
        stock1.mint(address(v), 5e18); // 500 USDT of stock, above E* after close request
        vm.prank(user);
        v.requestClose();
        (bool needed,, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && !buy, "sell still previewed");
    }
}

contract FakeFactory {
    address public usdt;
    IFloorFactory public real;

    constructor(address u, IFloorFactory r) {
        usdt = u;
        real = r;
    }

    function initFake(FloorVault v, address owner_, address[] calldata a, uint16[] calldata w) external {
        v.initialize(
            owner_,
            1e18,
            0.9e18,
            uint40(block.timestamp + 30 days),
            a,
            w,
            abi.encode(IFloorFactory.Defaults(100, 200, 900, 14_400, 600, 300, 30, 100, 20e18, 1e18))
        );
    }
}
