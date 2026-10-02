// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {IFloorFactory} from "../src/interfaces/IFloorFactory.sol";

/// @title SetHolidays
/// @notice Loads `unixDays` from a holidays JSON and sets them as non-trading days (guardian only).
/// @dev   FLOOR_FACTORY=<addr> HOLIDAYS=holidays/nyse_2026_2027.json forge script script/SetHolidays.s.sol \
///            --rpc-url $BSC_RPC_URL --ledger --broadcast     (the signer must be the guardian)
///        No private key from the environment.
contract SetHolidays is Script {
    using stdJson for string;

    function run() external {
        address factory = vm.envAddress("FLOOR_FACTORY");
        string memory file = vm.envOr("HOLIDAYS", string("holidays/nyse_2026_2027.json"));
        string memory h = vm.readFile(string.concat(vm.projectRoot(), "/", file));
        uint256[] memory raw = h.readUintArray(".unixDays");
        uint32[] memory days_ = new uint32[](raw.length);
        for (uint256 i; i < raw.length; ++i) {
            days_[i] = uint32(raw[i]);
        }
        vm.startBroadcast();
        IFloorFactory(factory).setNonTradingDays(days_, true);
        vm.stopBroadcast();
        console2.log("non-trading days set:", days_.length);
    }
}
