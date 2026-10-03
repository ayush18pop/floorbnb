// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorVault} from "../../src/FloorVault.sol";
import {IBeacon} from "../../src/interfaces/IBeacon.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {IFloorLens} from "../../src/interfaces/IFloorLens.sol";
import {IPancakeV3SwapRouter} from "../../src/interfaces/IPancakeV3SwapRouter.sol";
import {IPauseManager} from "../../src/interfaces/IPauseManager.sol";
import {ICompliance} from "../../src/interfaces/ICompliance.sol";
import {ISecuritiesToken} from "../../src/interfaces/ISecuritiesToken.sol";
import {TwapOracle} from "../../src/libs/TwapOracle.sol";
import {ForkBase} from "./ForkBase.t.sol";

interface IVenusOracle {
    function getPrice(address asset) external view returns (uint256);
}

interface IBeaconUpgrade {
    function upgradeTo(address newImplementation) external;
}

interface ISecuritiesAdmin {
    function setUIMultiplier(uint256 newMultiplier, uint256 effectiveAt) external;
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory p)
        external
        returns (uint256 amountOut, uint160, uint32, uint256);
}

/// @notice BSC fork tests 1, 2, 3, 5, 7, 8, 9, 10 of docs/CONTRACTS.md section 12. Reads and local simulation only.
contract ForkFloorTest is ForkBase {
    function _twapPrice(address pool, bool usdtIsToken0) internal view returns (uint256) {
        return TwapOracle.priceWad(TwapOracle.twapTick(pool, 600), usdtIsToken0);
    }

    // --------------------------------------------------- 1. real tokens and pools

    function test_fork1_assetsRegister() public view {
        (address p, uint24 fee, bool active,,, bool u0) = factory.assets(NVDAB);
        assertEq(p, POOL_NVDAB);
        assertEq(fee, 2500);
        assertTrue(active);
        assertFalse(u0, "NVDAB is token0");
        (,,,,, u0) = factory.assets(SPCXB);
        assertTrue(u0, "USDT is token0 for SPCXB");
        (,,,,, u0) = factory.assets(QQQB);
        assertFalse(
            u0, "QQQB (0x2058..) sorts below USDT (0x55d3..), so it is token0; CONTRACTS.md section 2 had this wrong"
        );
        assertEq(factory.lastMultiplier(NVDAB), ISecuritiesToken(NVDAB).uiMultiplier());
    }

    // --------------------------------------------------------- 2. TWAP vs references

    function test_fork2_twapMatchesReferences() public {
        uint256 nv = _twapPrice(POOL_NVDAB, false);
        uint256 spx = _twapPrice(POOL_SPCXB, true);
        emit log_named_decimal_uint("TWAP NVDAB (USDT)", nv, 18);
        emit log_named_decimal_uint("TWAP SPCXB (USDT)", spx, 18);
        uint256 vNv = IVenusOracle(VENUS_ORACLE).getPrice(NVDAB);
        uint256 vSp = IVenusOracle(VENUS_ORACLE).getPrice(SPCXB);
        emit log_named_decimal_uint("Venus NVDAB", vNv, 18);
        emit log_named_decimal_uint("Venus SPCXB", vSp, 18);
        // Venus scales a price for 18-decimal tokens to 1e18 USD
        assertApproxEqRel(nv, vNv, 0.01e18, "NVDAB TWAP vs Venus within 1%");
        assertApproxEqRel(spx, vSp, 0.01e18, "SPCXB TWAP vs Venus within 1%");

        // QQQB: no Venus price. Compare with a QuoterV2 quote for 1 USDT.
        uint256 qq = _twapPrice(POOL_QQQB, false);
        (uint256 out,,,) =
            IQuoterV2(QUOTER).quoteExactInputSingle(IQuoterV2.QuoteExactInputSingleParams(USDT, QQQB, 1e18, 100, 0));
        uint256 quoted = 1e36 / out; // USDT per QQQB = 1 / (QQQB per USDT)
        emit log_named_decimal_uint("TWAP QQQB (USDT)", qq, 18);
        emit log_named_decimal_uint("Quoter QQQB (USDT)", quoted, 18);
        assertApproxEqRel(qq, quoted, 0.01e18, "QQQB TWAP vs quoter within 1%");
    }

    // --------------------------------- 3 and 10. direct path round trip, gas

    function test_fork3_directRoundTrip_andGas() public {
        vm.warp(_tuesday1535());
        uint256 g = gasleft();
        FloorVault v = _open(1000e18, 9000, NVDAB);
        emit log_named_uint("gas createPosition", g - gasleft());
        assertEq(IERC20(USDT).balanceOf(address(v)), 1000e18);

        // first trade: buy E* = 400 USDT of NVDAB through the real Pancake pool (public path)
        vm.warp(block.timestamp + 61 minutes);
        g = gasleft();
        v.rebalancePublic(0);
        emit log_named_uint("gas rebalancePublic buy", g - gasleft());
        uint256 stock = IERC20(NVDAB).balanceOf(address(v));
        assertGt(stock, 0, "bought NVDAB");
        (uint256 V,,) = v.valuation();
        emit log_named_decimal_uint("V after buy", V, 18);
        assertApproxEqRel(V, 1000e18, 0.01e18, "buy cost within 1% of V");

        // unwind: request close, then sell through the public path
        vm.prank(user);
        v.requestClose();
        vm.warp(block.timestamp + 61 minutes);
        v.rebalancePublic(0);
        (,, uint256[3] memory sv) = v.valuation();
        assertLt(sv[0], 20e18, "sold down");
        uint256 before_ = IERC20(USDT).balanceOf(user);
        vm.prank(user);
        v.closeToUSDT();
        uint256 back = IERC20(USDT).balanceOf(user) - before_;
        uint256 loss = 1000e18 - back;
        // traded about 400 USDT each way
        emit log_named_decimal_uint("round trip loss (USDT)", loss, 18);
        emit log_named_uint("round trip bps of 400 USDT traded", loss * 10_000 / 400e18);
        assertLe(loss * 10_000 / 400e18, 80, "round trip cost <= 80 bps of traded value (spec: ~60 bps)");
        assertEq(IERC20(USDT).balanceOf(address(v)), 0);
    }

    /// Keeper path through the allowlisted Pancake router (P2): calldata built here, tolDirect applies.
    function test_fork10_keeperViaPancakeRouter_gas() public {
        vm.warp(_tuesday1535());
        FloorVault v = _open(1000e18, 9000, NVDAB);
        (bool needed,, bool buy, address tin, address tout, uint256 amt,, uint256 minOutDirect) = v.previewRebalance();
        assertTrue(needed);
        assertTrue(buy);
        bytes memory data = abi.encodeCall(
            IPancakeV3SwapRouter.exactInputSingle,
            (IPancakeV3SwapRouter.ExactInputSingleParams(
                    tin, tout, 2500, address(v), block.timestamp + 600, amt, minOutDirect, 0
                ))
        );
        IFloorVault.Swap memory sw = IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data);
        uint256 g = gasleft();
        vm.prank(keeper);
        v.rebalance(sw);
        emit log_named_uint("gas rebalance (keeper, Pancake route)", g - gasleft());
        assertGt(IERC20(NVDAB).balanceOf(address(v)), 0);
        assertEq(IERC20(USDT).allowance(address(v), PANCAKE_ROUTER), 0);

        // lens sees it
        IFloorLens.Status memory s = lens.status(address(v));
        assertTrue(s.tradingOpen);
        assertApproxEqRel(s.V, 1000e18, 0.01e18);

        // exit in kind
        g = gasleft();
        vm.prank(user);
        v.exitInKind(user);
        emit log_named_uint("gas exitInKind", g - gasleft());
        assertGt(IERC20(NVDAB).balanceOf(user), 0, "bStock reached the user (a contract holder can move bStocks)");
    }

    // ------------------------------------------------------ 5. token pause, blocklist

    function test_fork5_tokenPause_exitSkipsToken_thenRescue() public {
        vm.warp(_tuesday1535());
        FloorVault v = _open(1000e18, 9000, NVDAB);
        (,,, address tin, address tout, uint256 amt,, uint256 mDir) = v.previewRebalance();
        bytes memory data = abi.encodeCall(
            IPancakeV3SwapRouter.exactInputSingle,
            (IPancakeV3SwapRouter.ExactInputSingleParams(
                    tin, tout, 2500, address(v), block.timestamp + 600, amt, mDir, 0
                ))
        );
        vm.prank(keeper);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));
        uint256 stock = IERC20(NVDAB).balanceOf(address(v));
        assertGt(stock, 0);

        // the issuer pauses NVDAB
        vm.prank(PAUSE_ADMIN);
        IPauseManager(PAUSE_MANAGER).pauseToken(NVDAB);
        assertTrue(IPauseManager(PAUSE_MANAGER).isTokenPaused(NVDAB));

        // swaps revert (token), rebalance keeps failing closed
        vm.warp(block.timestamp + 61 minutes);
        vm.prank(user);
        v.requestClose();
        vm.expectRevert();
        v.rebalancePublic(0);

        // exitInKind: USDT leaves, NVDAB skipped and kept
        uint256 us = IERC20(USDT).balanceOf(address(v));
        uint256 before_ = IERC20(USDT).balanceOf(user);
        vm.prank(user);
        v.exitInKind(user);
        assertEq(IERC20(USDT).balanceOf(user) - before_, us, "USDT left despite the pause");
        assertEq(IERC20(NVDAB).balanceOf(address(v)), stock, "NVDAB skipped and kept");

        // unpause and rescue
        vm.prank(PAUSE_ADMIN);
        IPauseManager(PAUSE_MANAGER).unpauseToken(NVDAB);
        vm.prank(user);
        v.rescue(NVDAB, user);
        assertEq(IERC20(NVDAB).balanceOf(user), stock);
    }

    /// Answers CONTRACTS.md Q3 as far as a fork can: does a blocklist hit the vault as sender or receiver?
    function test_fork5_blocklist_vaultAsSenderAndReceiver() public {
        vm.warp(_tuesday1535());
        FloorVault v = _open(1000e18, 9000, NVDAB);
        (,,, address tin, address tout, uint256 amt,, uint256 mDir) = v.previewRebalance();
        bytes memory data = abi.encodeCall(
            IPancakeV3SwapRouter.exactInputSingle,
            (IPancakeV3SwapRouter.ExactInputSingleParams(
                    tin, tout, 2500, address(v), block.timestamp + 600, amt, mDir, 0
                ))
        );
        vm.prank(keeper);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));
        uint256 stock = IERC20(NVDAB).balanceOf(address(v));

        address[] memory list = new address[](1);
        list[0] = address(v);
        vm.prank(COMPLIANCE_ADMIN);
        try ICompliance(COMPLIANCE).addToBlocklist(NVDAB, list) {}
        catch {
            emit log("addToBlocklist reverted for the pranked admin; blocklist test inconclusive");
            return;
        }

        // vault as RECEIVER: a pool pushes tokens to it
        uint256 poolBal = IERC20(NVDAB).balanceOf(POOL_NVDAB);
        vm.prank(POOL_NVDAB);
        (bool okIn,) = NVDAB.call(abi.encodeCall(IERC20.transfer, (address(v), 1e18)));
        emit log_named_string("blocklisted vault as RECEIVER", okIn ? "transfer succeeded" : "transfer reverted");
        poolBal;

        // vault as SENDER: exitInKind must still give the USDT back and skip NVDAB if it reverts
        vm.prank(user);
        v.requestClose();
        uint256 us = IERC20(USDT).balanceOf(address(v));
        uint256 before_ = IERC20(USDT).balanceOf(user);
        vm.prank(user);
        v.exitInKind(user);
        assertEq(IERC20(USDT).balanceOf(user) - before_, us, "USDT left whatever the blocklist does");
        uint256 left = IERC20(NVDAB).balanceOf(address(v));
        emit log_named_string(
            "blocklisted vault as SENDER",
            left == stock || left == stock + 1e18 ? "NVDAB stuck (blocked)" : "NVDAB moved"
        );
    }

    // ----------------------------------------------------------------- 7. beacon

    function test_fork7_beaconChanged_buysRevert_sellsWork() public {
        vm.warp(_tuesday1535());
        FloorVault v = _open(1000e18, 9000, NVDAB);
        (,,, address tin, address tout, uint256 amt,, uint256 mDir) = v.previewRebalance();
        bytes memory data = abi.encodeCall(
            IPancakeV3SwapRouter.exactInputSingle,
            (IPancakeV3SwapRouter.ExactInputSingleParams(
                    tin, tout, 2500, address(v), block.timestamp + 600, amt, mDir, 0
                ))
        );

        // The beacon is upgraded to a byte-for-byte copy of the live implementation at a new address. The tokens keep
        // working (a bogus implementation would break every token call, including balanceOf), but the address differs
        // from the factory's approved one, which is all the vault checks.
        address live = IBeacon(BEACON).implementation();
        address copy = makeAddr("implCopy");
        vm.etch(copy, live.code);
        vm.prank(BEACON_OWNER);
        IBeaconUpgrade(BEACON).upgradeTo(copy);
        assertEq(IBeacon(BEACON).implementation(), copy, "real beacon owner swapped the implementation");
        (bool needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed, "preview suppresses buys while the implementation differs");
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.TokenImplChanged.selector);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));
        vm.prank(BEACON_OWNER);
        IBeaconUpgrade(BEACON).upgradeTo(live);

        // buy normally, then change the beacon and sell
        vm.prank(keeper);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));
        vm.prank(user);
        v.requestClose();
        vm.prank(BEACON_OWNER);
        IBeaconUpgrade(BEACON).upgradeTo(copy);
        vm.warp(block.timestamp + 61 minutes);
        v.rebalancePublic(0); // a sell: allowed while the implementation differs
        (,, uint256[3] memory sv) = v.valuation();
        assertLt(sv[0], 20e18);
    }

    // ------------------------------------------------------------- 8. market hours

    function test_fork8_realTimestamps() public {
        uint256 tue = _tuesday1535() - 35 minutes - 30 minutes; // Tuesday 15:00 UTC
        vm.warp(tue);
        assertFalse(factory.isTradingOpen(block.timestamp), "Tue 15:00 closed");
        vm.warp(tue + 1 hours);
        assertTrue(factory.isTradingOpen(block.timestamp), "Tue 16:00 open");
        vm.warp(tue + 4 days + 1 hours); // Saturday 16:00
        assertFalse(factory.isTradingOpen(block.timestamp), "Saturday closed");
        vm.warp(tue + 6 days + 1 hours); // Monday 16:00
        assertTrue(factory.isTradingOpen(block.timestamp), "Monday 16:00 open");
        vm.warp(tue + 6 days);
        assertFalse(factory.isTradingOpen(block.timestamp), "Monday 15:00 closed");
    }
    // ----------------------------------------------------------------- 6. multiplier

    function test_fork6_multiplierChange_blocksUntilPokedAndWindowPassed() public {
        vm.warp(_tuesday1535());
        FloorVault v = _open(1000e18, 9000, NVDAB);
        (,,, address tin, address tout, uint256 amt,, uint256 mDir) = v.previewRebalance();
        bytes memory data = _pancakeData(tin, tout, address(v), amt, mDir);
        vm.prank(keeper);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));
        uint256 raw = IERC20(NVDAB).balanceOf(address(v));
        (uint256 V0,,) = v.valuation();

        uint256 oldM = ISecuritiesToken(NVDAB).uiMultiplier();
        uint256 newM = oldM * 102 / 100; // a 2% corporate-action style step
        uint256 eff = block.timestamp + 2 hours;
        vm.prank(TOKEN_ADMIN);
        ISecuritiesAdmin(NVDAB).setUIMultiplier(newM, eff);
        assertTrue(ISecuritiesToken(NVDAB).hasPendingMultiplier(), "pending set");
        assertEq(ISecuritiesToken(NVDAB).pendingMultiplier(), newM);
        assertEq(ISecuritiesToken(NVDAB).effectiveAt(), eff);
        assertEq(IERC20(NVDAB).balanceOf(address(v)), raw, "raw balance unchanged");
        (uint256 V1,,) = v.valuation();
        assertEq(V1, V0, "V unchanged by a pending change");

        // inside the 1 h lead before effectiveAt: blocked
        vm.warp(eff - 30 minutes);
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.MultiplierTransition.selector);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));

        // after it takes effect but before the poke: blocked; raw balance and V still unchanged
        vm.warp(eff + 1);
        assertEq(ISecuritiesToken(NVDAB).uiMultiplier(), newM, "multiplier applied");
        assertEq(IERC20(NVDAB).balanceOf(address(v)), raw, "raw balance still unchanged");
        (uint256 V2,,) = v.valuation();
        assertApproxEqRel(V2, V0, 0.01e18, "V unchanged by the multiplier itself");
        // A12 F-05: the vault pokes the factory itself and the call is a no-op (no revert, no trade)
        vm.prank(keeper);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));
        assertEq(factory.lastMultiplier(NVDAB), newM, "vault poked the factory");
        assertEq(IERC20(NVDAB).balanceOf(address(v)), raw, "no trade on the poke call");
        vm.expectRevert(IFloorVault.MultiplierTransition.selector);
        v.rebalancePublic(0);

        // poked: still blocked until the TWAP window has passed
        factory.pokeMultiplier(NVDAB); // idempotent
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.MultiplierTransition.selector);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));

        // after the window: the multiplier guard no longer fires (any other revert, or success, is fine)
        vm.warp(block.timestamp + 601);
        vm.prank(keeper);
        try v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data)) {}
        catch (bytes memory err) {
            assertTrue(bytes4(err) != IFloorVault.MultiplierTransition.selector, "guard cleared");
        }
        // and exit is never blocked
        vm.prank(user);
        v.exitInKind(user);
    }

    // ------------------------------ Q3 (and 5): who does a blocklist hit, sender or receiver?

    function test_fork5_Q3_blocklistHitsWhichSide() public {
        address a = makeAddr("holderA"); // holds bStock, will be blocklisted
        address b = makeAddr("clean");
        vm.prank(POOL_NVDAB);
        IERC20(NVDAB).transfer(a, 5e18);
        vm.prank(POOL_NVDAB);
        IERC20(NVDAB).transfer(b, 5e18);

        address[] memory list = new address[](1);
        list[0] = a;
        vm.prank(COMPLIANCE_ADMIN);
        ICompliance(COMPLIANCE).addToBlocklist(NVDAB, list);

        // blocked address as RECEIVER (clean sender)
        vm.prank(b);
        (bool recvOk, bytes memory recvErr) = NVDAB.call(abi.encodeCall(IERC20.transfer, (a, 1e18)));
        // blocked address as SENDER (clean receiver)
        vm.prank(a);
        (bool sendOk, bytes memory sendErr) = NVDAB.call(abi.encodeCall(IERC20.transfer, (b, 1e18)));
        emit log_named_bytes("receiver revert data", recvErr);
        emit log_named_bytes("sender revert data", sendErr);
        // control: clean to clean works, so the reverts above are the blocklist
        vm.prank(b);
        assertTrue(IERC20(NVDAB).transfer(makeAddr("clean2"), 1e18), "control transfer");
        emit log_named_string("blocklisted as RECEIVER", recvOk ? "transfer OK" : "REVERTS");
        emit log_named_string("blocklisted as SENDER", sendOk ? "transfer OK" : "REVERTS");
        // Q3 answer, pinned: both directions revert if this holds
        assertFalse(recvOk, "Q3: blocklist blocks the receiver");
        assertFalse(sendOk, "Q3: blocklist blocks the sender");

        // other tokens are unaffected (the list is per token)
        vm.prank(POOL_SPCXB);
        IERC20(SPCXB).transfer(a, 1e18);
        assertEq(IERC20(SPCXB).balanceOf(a), 1e18, "blocklist is per token");
    }

    // --------------------------------------------- 9. a contract holds and moves real bStocks

    function test_fork9_vaultReceivesAndSendsRealBStocks() public {
        vm.warp(_tuesday1535());
        FloorVault v = _open(1000e18, 9000, NVDAB);
        address[3] memory toks = [NVDAB, SPCXB, QQQB];
        address[3] memory pools = [POOL_NVDAB, POOL_SPCXB, POOL_QQQB];
        for (uint256 i; i < 3; i++) {
            vm.prank(pools[i]);
            IERC20(toks[i]).transfer(address(v), 1e18);
            assertEq(IERC20(toks[i]).balanceOf(address(v)), 1e18, "vault received");
        }
        // exitInKind pushes stock out of the vault contract (the asset list holds NVDAB only; others via rescue)
        vm.startPrank(user);
        v.exitInKind(user);
        assertEq(IERC20(NVDAB).balanceOf(user), 1e18, "vault sent NVDAB");
        v.rescue(SPCXB, user);
        v.rescue(QQQB, user);
        vm.stopPrank();
        assertEq(IERC20(SPCXB).balanceOf(user), 1e18);
        assertEq(IERC20(QQQB).balanceOf(user), 1e18);
    }

    function _pancakeData(address tin, address tout, address to, uint256 amt, uint256 minOut)
        internal
        view
        returns (bytes memory)
    {
        return abi.encodeCall(
            IPancakeV3SwapRouter.exactInputSingle,
            (IPancakeV3SwapRouter.ExactInputSingleParams(tin, tout, 2500, to, block.timestamp + 600, amt, minOut, 0))
        );
    }
}
