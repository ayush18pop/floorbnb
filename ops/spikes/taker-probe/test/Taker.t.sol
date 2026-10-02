// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {TakerProbe, IERC20} from "../src/TakerProbe.sol";

contract TakerTest is Test {
    address constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address constant ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14; // Pancake v3 SwapRouter
    address constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address constant SPCXB = 0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1;
    address constant QQQB = 0x205812CdBed920aFf76C6580abD681a46D11efc7;
    address constant POOL_NVDAB = 0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C; // 0.25%
    address constant POOL_SPCXB = 0x977DaFFC095b33872E2741c19568925015C35b4d; // 0.25%
    address constant POOL_QQQB = 0xe531fcb1F5a195de7608B9F4f9518544C2cdB693; // 0.01%

    TakerProbe probe;

    function setUp() public {
        vm.createSelectFork(vm.envString("BSC_FORK_RPC_URL"));
        probe = new TakerProbe();
    }

    function _roundTrip(string memory name, address stock, uint24 fee, uint256 usdtIn) internal {
        deal(USDT, address(probe), usdtIn);
        uint256 got = probe.execPancake(ROUTER, USDT, stock, fee, usdtIn, 1);
        assertGt(got, 0);
        // Q10: a contract holds the bStock
        assertEq(IERC20(stock).balanceOf(address(probe)), got);
        uint256 back = probe.execPancake(ROUTER, stock, USDT, fee, got, 1);
        uint256 costBps = (usdtIn - back) * 10_000 / usdtIn;
        console2.log(string.concat("RESULT direct ", name, " usdtIn(1e18)/stock(1e18)/usdtBack(1e18)/costBps"));
        console2.log(usdtIn / 1e18, got, back);
        console2.log(costBps);
        assertLt(costBps, 200);
    }

    function test_direct_NVDAB() public {
        _roundTrip("NVDAB", NVDAB, 2500, 100e18);
    }

    function test_direct_SPCXB() public {
        _roundTrip("SPCXB", SPCXB, 2500, 100e18);
    }

    function test_direct_QQQB() public {
        _roundTrip("QQQB", QQQB, 100, 100e18);
    }

    /// Q10: contract can also forward bStock to another address (move, not only hold), using a pool as the source.
    function test_Q10_contractHoldsAndMovesBStock() public {
        for (uint256 i; i < 3; i++) {
            (address t, address pool) = i == 0 ? (NVDAB, POOL_NVDAB) : i == 1 ? (SPCXB, POOL_SPCXB) : (QQQB, POOL_QQQB);
            vm.prank(pool);
            IERC20(t).transfer(address(probe), 1e18);
            assertEq(IERC20(t).balanceOf(address(probe)), 1e18);
            probe.send(t, address(0xBEEF), 1e18);
            assertEq(IERC20(t).balanceOf(address(0xBEEF)), 1e18);
        }
    }

    /// Replays a saved aggregator /swap response. Needs fixtures (Binance keys). Skips when TAKER_FIXTURE is unset.
    /// Fixture JSON: {from,to,data,approveTarget,fromToken,toToken,amount}. `from` (X) gets the probe code etched.
    function test_aggregator_replay() public {
        string memory path = vm.envOr("TAKER_FIXTURE", string(""));
        if (bytes(path).length == 0) {
            vm.skip(true);
        }
        string memory j = vm.readFile(path);
        address x = vm.parseJsonAddress(j, ".from");
        address tokenIn = vm.parseJsonAddress(j, ".fromToken");
        address tokenOut = vm.parseJsonAddress(j, ".toToken");
        address router = vm.parseJsonAddress(j, ".to");
        address approveTarget = vm.parseJsonAddress(j, ".approveTarget");
        uint256 amount = vm.parseJsonUint(j, ".amount");
        bytes memory data = vm.parseJsonBytes(j, ".data");
        vm.etch(x, address(probe).code);
        if (tokenIn == USDT) {
            deal(USDT, x, amount);
        } else {
            // sells: move the bStock in from its pool
            address pool = tokenIn == NVDAB ? POOL_NVDAB : tokenIn == SPCXB ? POOL_SPCXB : POOL_QQQB;
            vm.prank(pool);
            IERC20(tokenIn).transfer(x, amount);
        }
        (uint256 spent, uint256 got) = TakerProbe(x).execAggregator(tokenIn, tokenOut, approveTarget, router, amount, data);
        console2.log("RESULT aggregator spent/got", spent, got);
        assertLe(spent, amount);
        assertGt(got, 0);
    }
}
