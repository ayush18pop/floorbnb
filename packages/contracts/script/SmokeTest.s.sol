// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFloorFactory} from "../src/interfaces/IFloorFactory.sol";

/// @title SmokeTest
/// @notice Team-lead smoke test (CONTRACTS.md section 14): approve exactly `AMOUNT` USDT and open one position.
/// @dev   FLOOR_FACTORY=<addr> ASSET=<bStock> AMOUNT=50000000000000000000 FLOOR_BPS=9000 TERM=7776000 \
///            forge script script/SmokeTest.s.sol --rpc-url $BSC_RPC_URL --ledger --broadcast
///        Do not run against mainnet except by the team lead. No private key from the environment.
contract SmokeTest is Script {
    function run() external {
        IFloorFactory factory = IFloorFactory(vm.envAddress("FLOOR_FACTORY"));
        address asset = vm.envAddress("ASSET");
        uint256 amount = vm.envOr("AMOUNT", uint256(50e18));
        uint16 floorBps = uint16(vm.envOr("FLOOR_BPS", uint256(9000)));
        uint32 term = uint32(vm.envOr("TERM", uint256(90 days)));

        address[] memory a = new address[](1);
        a[0] = asset;
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;

        vm.startBroadcast();
        IERC20(factory.usdt()).approve(address(factory), amount);
        address vault = factory.createPosition(amount, floorBps, term, a, w);
        vm.stopBroadcast();

        console2.log("position (vault):", vault);
        console2.log("deposit:", amount);
    }
}
