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
        // Table must be sorted and reach the end of 2027 (NYSE source in the JSON note); a stale file aborts here.
        for (uint256 i = 1; i < raw.length; ++i) {
            require(raw[i] > raw[i - 1], "SetHolidays: not sorted");
        }
        require(raw.length > 0 && raw[raw.length - 1] >= 21_176, "SetHolidays: table must reach 2027-12-24");
        vm.startBroadcast();
        IFloorFactory(factory).setNonTradingDays(days_, true);
        vm.stopBroadcast();
        console2.log("non-trading days set:", days_.length);
    }
}
