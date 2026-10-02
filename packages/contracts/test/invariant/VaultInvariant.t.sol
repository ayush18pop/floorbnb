// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorFactory} from "../../src/FloorFactory.sol";
import {FloorVault} from "../../src/FloorVault.sol";
import {System} from "./handlers/System.sol";
import {HandlerBase} from "./handlers/HandlerBase.sol";
import {KeeperHandler} from "./handlers/KeeperHandler.sol";
import {UserHandler} from "./handlers/UserHandler.sol";
import {MarketHandler} from "./handlers/MarketHandler.sol";

/// @notice Stateful invariants I1 to I13 (docs/CONTRACTS.md section 12) against the real FloorFactory and two real
///         FloorVault clones. Written from the spec. Handlers record breaches of the per-call invariants (I1, I3, I5,
///         I7, I9, I10) in `violations`; the functions below check the state invariants after every call sequence.
contract VaultInvariantTest is Test {
    uint256 internal constant T0 = 20_000 days + 16 hours; // Friday 16:00 UTC

    System internal sys;
    KeeperHandler internal keeperH;
    UserHandler internal userH;
    MarketHandler internal marketH;
    FloorVault internal vaultA;
    FloorVault internal vaultB;

    address internal keeper = makeAddr("keeper");
    address internal guardian = makeAddr("guardian");
    address internal owner = makeAddr("owner");
    address internal userA = makeAddr("userA");
    address internal userB = makeAddr("userB");

    function setUp() public {
        vm.warp(T0);
        sys = new System(keeper, guardian, owner, userA, userB);
        FloorFactory fac = sys.factory();
        vm.prank(owner);
        fac.acceptOwnership();

        IERC20 usdt = IERC20(address(sys.usdt()));
        address[] memory a = new address[](1);
        a[0] = address(sys.stock1());
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        sys.usdt().mint(userA, 1000e18);
        vm.startPrank(userA);
        usdt.approve(address(fac), 1000e18);
        vaultA = FloorVault(fac.createPosition(1000e18, 9000, 365 days, a, w));
        vm.stopPrank();

        address[] memory b = new address[](2);
        b[0] = address(sys.stock1());
        b[1] = address(sys.stock2());
        uint16[] memory wb = new uint16[](2);
        wb[0] = 6000;
        wb[1] = 4000;
        sys.usdt().mint(userB, 1000e18);
        vm.startPrank(userB);
        usdt.approve(address(fac), 1000e18);
        vaultB = FloorVault(fac.createPosition(1000e18, 9500, 365 days, b, wb));
        vm.stopPrank();
        sys.setVaults(address(vaultA), address(vaultB));
        // an airdrop of the leaky token into vault B, so a router can try to steal an untraded tracked balance
        sys.stock2().mint(address(vaultB), 0.5e18);

        keeperH = new KeeperHandler(sys);
        userH = new UserHandler(sys);
        marketH = new MarketHandler(sys);

        targetContract(address(keeperH));
        targetContract(address(userH));
        targetContract(address(marketH));
        // weighted: the keeper path is the main target
        bytes4[] memory ks = new bytes4[](14);
        for (uint256 i = 10; i < 14; ++i) {
            ks[i] = KeeperHandler.rebalanceEvil.selector;
        }
        for (uint256 i; i < 8; ++i) {
            ks[i] = KeeperHandler.rebalance.selector;
        }
        ks[8] = KeeperHandler.rebalancePublic.selector;
        ks[9] = KeeperHandler.rebalancePublic.selector;
        targetSelector(FuzzSelector(address(keeperH), ks));
        bytes4[] memory us = new bytes4[](5);
        us[0] = UserHandler.requestClose.selector;
        us[1] = UserHandler.closeToUSDT.selector;
        us[2] = UserHandler.exitInKind.selector;
        us[3] = UserHandler.rescue.selector;
        us[4] = UserHandler.strangerCalls.selector;
        targetSelector(FuzzSelector(address(userH), us));
        bytes4[] memory ms = new bytes4[](20);
        ms[18] = MarketHandler.drift.selector;
        ms[19] = MarketHandler.warpToWindow.selector;
        ms[0] = MarketHandler.movePrice.selector;
        ms[1] = MarketHandler.drift.selector;
        ms[2] = MarketHandler.deviateSpot.selector;
        ms[3] = MarketHandler.warpToWindow.selector;
        ms[4] = MarketHandler.warpShort.selector;
        ms[5] = MarketHandler.warpLong.selector;
        ms[6] = MarketHandler.togglePause.selector;
        ms[7] = MarketHandler.toggleHalt.selector;
        ms[8] = MarketHandler.toggleHolidayToday.selector;
        ms[9] = MarketHandler.tokenPause.selector;
        ms[10] = MarketHandler.blocklistVault.selector;
        ms[11] = MarketHandler.removeRouter.selector;
        ms[12] = MarketHandler.readdRouter.selector;
        ms[13] = MarketHandler.disableAsset.selector;
        ms[14] = MarketHandler.breakOracle.selector;
        ms[15] = MarketHandler.changeBeacon.selector;
        ms[16] = MarketHandler.changeMultiplier.selector;
        ms[17] = MarketHandler.healAll.selector;
        targetSelector(FuzzSelector(address(marketH), ms));
    }

    function _v(uint256 i) internal view returns (FloorVault) {
        return i == 0 ? vaultA : vaultB;
    }

    // ---------------------------------------------------- per-call invariants

    function _noViolations(HandlerBase h, string memory name) internal view {
        uint256 n = 0;
        for (uint256 i; i < 40; ++i) {
            try h.violationKeys(i) returns (bytes32 k) {
                n++;
                assertEq(h.violations(k), 0, string.concat(name, ": ", _str(k)));
            } catch {
                break;
            }
        }
        n;
    }

    function _str(bytes32 b) internal pure returns (string memory) {
        uint256 len;
        while (len < 32 && b[len] != 0) len++;
        bytes memory o = new bytes(len);
        for (uint256 i; i < len; ++i) {
            o[i] = b[i];
        }
        return string(o);
    }

    /// I1, I3, I5, I7, I9, I10, price guards, T7, T8, I2 (thief) as recorded by the keeper handler.
    function invariant_keeperHandlerNoViolations() public view {
        _noViolations(keeperH, "keeper");
    }

    /// I8, I13, I9 and owner-only authority as recorded by the user handler.
    function invariant_userHandlerNoViolations() public view {
        _noViolations(userH, "user");
    }

    /// I4: market actions never move vault balances.
    function invariant_marketHandlerNoViolations() public view {
        _noViolations(marketH, "market");
    }

    // ----------------------------------------------------- state invariants

    /// I2: the third-party address that hostile routers try to pay never holds anything.
    function invariant_I2_thiefHoldsNothing() public view {
        assertEq(sys.usdt().balanceOf(address(0x7417F)), 0);
        assertEq(sys.stock1().balanceOf(address(0x7417F)), 0);
        assertEq(sys.stock2().balanceOf(address(0x7417F)), 0);
    }

    /// I11: approvals from a vault to every router are zero after every call.
    function invariant_I11_allowancesZero() public view {
        address[5] memory spenders = [
            address(sys.aggregator()),
            address(sys.pancake()),
            address(sys.evil()),
            address(sys.unlisted()),
            address(sys.factory())
        ];
        IERC20[3] memory t = [IERC20(address(sys.usdt())), IERC20(address(sys.stock1())), IERC20(address(sys.stock2()))];
        for (uint256 v; v < 2; ++v) {
            for (uint256 s; s < spenders.length; ++s) {
                for (uint256 k; k < 3; ++k) {
                    assertEq(t[k].allowance(address(_v(v)), spenders[s]), 0, "I11 allowance not zero");
                }
            }
        }
    }

    /// I5 and I3 (view form): when V <= F the exposure target is 0; the target never exceeds V or m * cushion.
    function invariant_I5_I3_targets() public view {
        for (uint256 i; i < 2; ++i) {
            FloorVault v = _v(i);
            try v.valuation() returns (uint256 V, uint256, uint256[3] memory) {
                (uint256 c, uint256 e, uint256[3] memory t) = v.targets();
                if (V <= v.floor()) assertEq(e, 0, "I5: exposure target above 0 at or below the floor");
                assertLe(e, V, "I3: E* <= V");
                assertLe(e, 4 * c, "I3: E* <= m * C");
                assertLe(t[0] + t[1] + t[2], e, "sum T_i <= E*");
            } catch {}
        }
    }

    /// I12: after maturity the exposure target is 0.
    function invariant_I12_maturityZeroTarget() public view {
        for (uint256 i; i < 2; ++i) {
            FloorVault v = _v(i);
            if (block.timestamp >= v.maturity()) {
                try v.targets() returns (uint256, uint256 e, uint256[3] memory) {
                    assertEq(e, 0, "I12");
                } catch {}
            }
        }
    }

    /// The factory never holds funds.
    function invariant_factoryHoldsNothing() public view {
        address f = address(sys.factory());
        assertEq(sys.usdt().balanceOf(f), 0);
        assertEq(sys.stock1().balanceOf(f), 0);
        assertEq(sys.stock2().balanceOf(f), 0);
    }

    /// Both positions keep their parameters (economic params are immutable after creation).
    function invariant_paramsImmutable() public view {
        assertEq(vaultA.floor(), 900e18);
        assertEq(vaultB.floor(), 950e18);
        assertEq(vaultA.deposit(), 1000e18);
        assertEq(vaultA.owner(), userA);
        assertEq(vaultB.owner(), userB);
        assertEq(vaultA.sellBandBps(), 100);
        assertEq(vaultB.tolAggBps(), 30);
    }

    function afterInvariant() public view {
        console2.log("rebalance_ok", keeperH.counts("rebalance_ok"));
        console2.log("rebalance_ok_evil", keeperH.counts("rebalance_ok_evil"));
        console2.log("rebalance_revert", keeperH.counts("rebalance_revert"));
        console2.log("public_ok", keeperH.counts("public_ok"));
        console2.log("exitInKind_ok", userH.counts("exitInKind_ok"));
        console2.log("closeToUSDT_ok", userH.counts("closeToUSDT_ok"));
    }
}
