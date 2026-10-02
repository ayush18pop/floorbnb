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
        vm.mockCall(BEACON, abi.encodeWithSignature("implementation()"), abi.encode(copy));
        (bool needed,,,,,,,) = v.previewRebalance();
        assertFalse(needed, "preview suppresses buys while the implementation differs");
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.TokenImplChanged.selector);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));
        vm.clearMockedCalls();

        // buy normally, then change the beacon and sell
        vm.prank(keeper);
        v.rebalance(IFloorVault.Swap(0, true, amt, PANCAKE_ROUTER, data));
        vm.prank(user);
        v.requestClose();
        vm.mockCall(BEACON, abi.encodeWithSignature("implementation()"), abi.encode(copy));
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
}
