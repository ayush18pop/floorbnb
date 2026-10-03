// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AuditBase} from "./AuditBase.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {MockPool} from "../mocks/MockPool.sol";

/// @dev bStock whose reads and transfers misbehave in a configurable way (mode 1 empty data, 2 garbage 64 bytes,
///      3 revert, 4 returns 1 MB, 5 transfer burns all gas).
contract EvilToken is MockToken {
    uint8 public mode;

    constructor(string memory n, string memory s) MockToken(n, s) {}

    function setMode(uint8 m) external {
        mode = m;
    }

    function balanceOf(address a) public view override returns (uint256) {
        uint8 m = mode;
        if (m == 0 || m == 5) return super.balanceOf(a);
        if (m == 1) {
            assembly {
                return(0, 0)
            }
        }
        if (m == 2) {
            assembly {
                mstore(0, 7)
                return(0, 64)
            }
        }
        if (m == 3) revert("nope");
        assembly {
            return(0, 1000000)
        }
    }

    function transfer(address to, uint256 v) public override returns (bool) {
        if (mode == 5) {
            assembly {
                invalid()
            }
        }
        return super.transfer(to, v);
    }
}

/// @notice FIX1 regression tests for the A12 / Pashov fixes (exit hardening, TVL release, listing immutability,
///         fail-soft pricing, router re-add).
contract FixesTest is AuditBase {
    EvilToken internal evil;
    MockPool internal evilPool;

    function _listEvil() internal {
        evil = new EvilToken("E", "E");
        evilPool = new MockPool(address(evil), address(usdt), 2500);
        evilPool.setTick(TICK_100, TICK_100);
        v3f.set(address(evil), address(usdt), 2500, address(evilPool));
        vm.prank(owner);
        factory.addAsset(address(evil), address(evilPool), 2500, 1e20, 25_000e18);
    }

    // ------------------------------------------------------------------ F-00 variants
    function _exitWithMode(uint8 mode, bool expectSkipped) internal {
        _listEvil();
        (address[] memory a, uint16[] memory w) = _one(address(evil));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        evil.mint(address(v), 5e18);
        evil.setMode(mode);
        vm.recordLogs();
        vm.prank(user);
        v.exitInKind(user);
        assertEq(usdt.balanceOf(user), 1000e18, "USDT returned");
        assertEq(uint8(v.status()), uint8(IFloorVault.Status.Closed));
        evil.setMode(0);
        if (expectSkipped) assertEq(evil.balanceOf(user), 0);
        if (expectSkipped) assertEq(evil.balanceOf(address(v)), 5e18, "stock stays for rescue");
    }

    function test_fix_F00_garbage64ByteBalance() public {
        _exitWithMode(2, true);
    }

    function test_fix_F00_revertingBalance() public {
        _exitWithMode(3, true);
    }

    function test_fix_F00_oneMegabyteReturnData() public {
        _exitWithMode(4, true);
    }

    function test_fix_F00_gasBurningTransfer() public {
        _exitWithMode(5, true);
    }

    function test_fix_F00_noCodeToken() public {
        // the token address becomes code-less (selfdestruct-like): staticcall succeeds with empty data
        _listEvil();
        (address[] memory a, uint16[] memory w) = _one(address(evil));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        vm.etch(address(evil), "");
        vm.prank(user);
        v.exitInKind(user);
        assertEq(usdt.balanceOf(user), 1000e18);
    }

    function test_fix_F00_closeToUsdtSurvivesBrokenBalanceOf() public {
        _listEvil();
        (address[] memory a, uint16[] memory w) = _one(address(evil));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        evil.setMode(1);
        vm.prank(user);
        v.closeToUSDT();
        assertEq(usdt.balanceOf(user), 1000e18);
    }

    function test_fix_F00_healthyTokensStillMoveInKind() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        stock1.mint(address(v), 3e18);
        vm.prank(user);
        v.exitInKind(user);
        assertEq(stock1.balanceOf(user), 3e18);
        assertEq(usdt.balanceOf(user), 1000e18);
    }

    function test_fix_F09_lowGasRevertsInsteadOfSkipping() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        stock1.mint(address(v), 3e18);
        vm.prank(user);
        (bool ok,) = address(v).call{gas: 400_000}(abi.encodeCall(IFloorVault.exitInKind, (user)));
        assertFalse(ok, "reverts, nothing skipped silently");
        assertEq(uint8(v.status()), uint8(IFloorVault.Status.Active), "whole call reverted");
    }

    // ------------------------------------------------------------------ TVL release
    function test_fix_tvl_releasedOnExitAndClose() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v1 = _create(user, 1000e18, 9000, a, w);
        FloorVault v2 = _create(attacker, 400e18, 9000, a, w);
        assertEq(factory.totalTvl(), 1400e18);
        vm.prank(user);
        v1.exitInKind(user);
        assertEq(factory.totalTvl(), 400e18);
        vm.prank(attacker);
        v2.closeToUSDT();
        assertEq(factory.totalTvl(), 0);
    }

    function test_fix_tvl_spoofedReportIsNoOp() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        _create(user, 1000e18, 9000, a, w);
        vm.prank(attacker);
        factory.onPositionClosed();
        assertEq(factory.totalTvl(), 1000e18);
    }

    function test_fix_tvl_capStillBindsConcurrentDeposits() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        for (uint256 i; i < 5; ++i) {
            _create(makeAddr(string(abi.encode("u", i))), 1000e18, 9000, a, w);
        }
        usdt.mint(user, 1e18);
        vm.startPrank(user);
        usdt.approve(address(factory), 1e18);
        vm.expectRevert(IFloorFactory.TvlCapReached.selector);
        factory.createPosition(1e18, 9000, 365 days, a, w);
        vm.stopPrank();
    }

    function test_fix_tvl_exitStillWorksIfFactoryReportReverts() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        vm.mockCallRevert(address(factory), abi.encodeCall(IFloorFactory.onPositionClosed, ()), "boom");
        vm.prank(user);
        v.exitInKind(user);
        assertEq(usdt.balanceOf(user), 1000e18);
    }

    // ------------------------------------------------------------------ listing immutability
    function test_fix_addAssetTwiceReverts_andReenableKeepsParams() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(IFloorFactory.AssetExists.selector, address(stock1)));
        factory.addAsset(address(stock1), address(pool1), 2500, 1e20, 25_000e18);
        factory.disableAsset(address(stock1));
        vm.expectRevert(abi.encodeWithSelector(IFloorFactory.AssetExists.selector, address(stock1)));
        factory.addAsset(address(stock1), address(pool1), 2500, 1e20, 25_000e18);
        factory.reenableAsset(address(stock1));
        vm.stopPrank();
        (address pool,, bool active, uint128 minLiq, uint256 maxTrade,) = factory.assets(address(stock1));
        assertEq(pool, address(pool1));
        assertTrue(active);
        assertEq(minLiq, 1e20);
        assertEq(maxTrade, 25_000e18);
    }

    function test_fix_reenableOnlyOwnerAndOnlyDisabled() public {
        vm.prank(attacker);
        vm.expectRevert(IFloorFactory.NotOwner.selector);
        factory.reenableAsset(address(stock1));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IFloorFactory.AssetNotActive.selector, address(stock1)));
        factory.reenableAsset(address(stock1)); // already active
    }

    function test_fix_addAssetRevertsWhenMultiplierUnreadable() public {
        MockToken plain = new MockToken("P", "P");
        MockPool p = new MockPool(address(plain), address(usdt), 2500);
        p.setTick(TICK_100, TICK_100);
        v3f.set(address(plain), address(usdt), 2500, address(p));
        vm.mockCallRevert(address(plain), abi.encodeWithSignature("uiMultiplier()"), "no");
        vm.prank(owner);
        vm.expectRevert(IFloorFactory.BadPool.selector);
        factory.addAsset(address(plain), address(p), 2500, 1e20, 25_000e18);
    }

    function test_fix_removedRouterCanBeReaddedWithDelay() public {
        vm.prank(guardian);
        factory.removeRouter(pancake);
        vm.prank(owner);
        factory.addRouter(pancake, pancake);
        (bool ok,) = factory.routerOk(pancake);
        assertFalse(ok);
        vm.warp(block.timestamp + 24 hours);
        (ok,) = factory.routerOk(pancake);
        assertTrue(ok);
    }

    // ------------------------------------------------------------------ fail-soft pricing
    function test_fix_failedOtherPoolSuppressesBuys_butValuationDoesNotRevert() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        (bool needed,, bool buy,,,,,) = v.previewRebalance();
        assertTrue(needed && buy, "healthy: first action is a buy");
        pool2.setTick(TICK_100, TICK_100 + 400); // pool2 fails the deviation guard
        (needed,,,,,,,) = v.previewRebalance(); // no revert, and no buy while pool2 is unpriceable
        assertFalse(needed, "buys suppressed");
        (uint256 V,,) = v.valuation();
        assertEq(V, 1000e18);
    }

    function test_fix_failedTradedPoolStillReverts() public {
        (address[] memory a, uint16[] memory w) = _two();
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        stock1.mint(address(v), 3e18);
        vm.prank(user);
        v.requestClose();
        pool1.setTick(TICK_100, TICK_100 + 400); // the asset being sold is itself unpriceable
        vm.warp(block.timestamp + 1 hours);
        bytes memory data = abi.encodeWithSignature("x()");
        vm.prank(keeper);
        vm.expectRevert(); // PriceDeviation of the traded asset: no price, no trade
        v.rebalance(IFloorVault.Swap({assetIdx: 0, buy: false, amountIn: 3e18, router: address(agg), data: data}));
    }

    // ------------------------------------------------------------------ multiplier auto-poke (F-05)
    function test_fix_F05_staleMultiplierIsPokedByTheVaultCall() public {
        (address[] memory a, uint16[] memory w) = _one(address(stock1));
        FloorVault v = _create(user, 1000e18, 9000, a, w);
        stock1.setUiMultiplier(1.001e18);
        vm.warp(block.timestamp + 1 hours);
        (bool needed,,,,, uint256 amountIn,,) = v.previewRebalance();
        assertTrue(needed);
        bytes memory data = abi.encodeWithSignature("x()");
        vm.prank(keeper);
        v.rebalance(IFloorVault.Swap({assetIdx: 0, buy: true, amountIn: amountIn, router: address(agg), data: data}));
        assertEq(factory.lastMultiplier(address(stock1)), 1.001e18, "poked");
        // inside the settle window it still reverts, after it the normal path resumes
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.MultiplierTransition.selector);
        v.rebalance(IFloorVault.Swap({assetIdx: 0, buy: true, amountIn: amountIn, router: address(agg), data: data}));
        vm.warp(block.timestamp + 601);
        _keeperSwap(v, 0, true, address(stock1), amountIn, _price(pool1));
        assertGt(stock1.balanceOf(address(v)), 0);
    }
}
