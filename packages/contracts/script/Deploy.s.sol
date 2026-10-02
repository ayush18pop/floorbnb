// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {FloorVault} from "../src/FloorVault.sol";
import {FloorFactory} from "../src/FloorFactory.sol";
import {FloorLens} from "../src/FloorLens.sol";
import {IFloorFactory} from "../src/interfaces/IFloorFactory.sol";

/// @title Deploy
/// @notice Deploys FloorVault (implementation), FloorFactory and FloorLens, then configures the factory.
///         Spec: docs/CONTRACTS.md section 14, EXECUTION_PLAN P2, P5.
/// @dev NO private key is read from the environment. Choose the signer on the command line:
///        simulation:  forge script script/Deploy.s.sol --fork-url $BSC_FORK_RPC_URL
///        real run:    forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --ledger --broadcast
///                     (or `--account <keystore-name> --sender <addr>`)
///      The broadcaster deploys with itself as owner AND guardian so it can configure everything, then hands
///      guardian to `params.guardian` and starts the 2-step ownership transfer to `params.owner` (the new owner must
///      call `acceptOwnership()`). Parameters come from `script/params/<chainId>.json`; the output is written to
///      `deployments/<chainId>.json` (only when FLOOR_WRITE_DEPLOYMENT=true, so a plain simulation never writes files).
contract Deploy is Script {
    using stdJson for string;

    struct Params {
        address owner;
        address guardian;
        address usdt;
        address v3Factory;
        address v3SwapRouter;
        address tokenBeacon;
        address approvedTokenImpl;
        address[] keepers;
        address[] routerTargets;
        address[] routerApproveTargets;
        address[] assetTokens;
        address[] assetPools;
        uint256[] assetFees;
        uint256[] assetMinLiquidity;
        uint256[] assetMaxTradeValue;
        uint256 maxDeposit;
        uint256 maxTotalTvl;
        IFloorFactory.Defaults defaults;
        string holidaysFile;
    }

    function run() external {
        string memory path = string.concat(vm.projectRoot(), "/script/params/", vm.toString(block.chainid), ".json");
        Params memory p = _load(vm.readFile(path));
        require(p.owner != address(0) && p.guardian != address(0), "Deploy: owner and guardian must be set");
        require(p.assetTokens.length == p.assetPools.length, "Deploy: asset array length");
        require(p.assetTokens.length == p.assetFees.length, "Deploy: asset array length");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        FloorVault impl = new FloorVault();
        FloorFactory factory = new FloorFactory(
            deployer,
            deployer,
            p.usdt,
            p.v3Factory,
            p.v3SwapRouter,
            address(impl),
            p.defaults,
            p.routerTargets,
            p.routerApproveTargets
        );
        FloorLens lens = new FloorLens(address(factory));

        factory.setTokenBeacon(p.tokenBeacon, p.approvedTokenImpl);
        for (uint256 i; i < p.assetTokens.length; ++i) {
            factory.addAsset(
                p.assetTokens[i],
                p.assetPools[i],
                uint24(p.assetFees[i]),
                uint128(p.assetMinLiquidity[i]),
                p.assetMaxTradeValue[i]
            );
        }
        for (uint256 i; i < p.keepers.length; ++i) {
            factory.setKeeper(p.keepers[i], true);
        }
        factory.setLimits(p.maxDeposit, p.maxTotalTvl);

        // Holidays (guardian role is still the deployer here).
        if (bytes(p.holidaysFile).length != 0) {
            string memory h = vm.readFile(string.concat(vm.projectRoot(), "/", p.holidaysFile));
            uint256[] memory raw = h.readUintArray(".unixDays");
            uint32[] memory days_ = new uint32[](raw.length);
            for (uint256 i; i < raw.length; ++i) {
                days_[i] = uint32(raw[i]);
            }
            factory.setNonTradingDays(days_, true);
        }

        if (p.guardian != deployer) factory.setGuardian(p.guardian);
        if (p.owner != deployer) factory.transferOwnership(p.owner);
        vm.stopBroadcast();

        console2.log("chainId           ", block.chainid);
        console2.log("deployer          ", deployer);
        console2.log("FloorVault (impl) ", address(impl));
        console2.log("FloorFactory      ", address(factory));
        console2.log("FloorLens         ", address(lens));
        console2.log("pending owner     ", p.owner);
        console2.log("guardian          ", p.guardian);
        console2.log("keepers           ", p.keepers.length);
        console2.log("assets            ", p.assetTokens.length);
        console2.log("maxDeposit / maxTotalTvl", p.maxDeposit, p.maxTotalTvl);

        if (vm.envOr("FLOOR_WRITE_DEPLOYMENT", false)) {
            _write(p, address(impl), address(factory), address(lens), deployer);
        }
    }

    function _load(string memory j) internal pure returns (Params memory p) {
        p.owner = j.readAddress(".owner");
        p.guardian = j.readAddress(".guardian");
        p.usdt = j.readAddress(".usdt");
        p.v3Factory = j.readAddress(".v3Factory");
        p.v3SwapRouter = j.readAddress(".v3SwapRouter");
        p.tokenBeacon = j.readAddress(".tokenBeacon");
        p.approvedTokenImpl = j.readAddress(".approvedTokenImpl");
        p.keepers = j.readAddressArray(".keepers");
        p.routerTargets = j.readAddressArray(".routerTargets");
        p.routerApproveTargets = j.readAddressArray(".routerApproveTargets");
        p.assetTokens = j.readAddressArray(".assetTokens");
        p.assetPools = j.readAddressArray(".assetPools");
        p.assetFees = j.readUintArray(".assetFees");
        p.assetMinLiquidity = _uints(j, ".assetMinLiquidity");
        p.assetMaxTradeValue = _uints(j, ".assetMaxTradeValue");
        p.maxDeposit = _uint(j, ".maxDeposit");
        p.maxTotalTvl = _uint(j, ".maxTotalTvl");
        p.defaults = IFloorFactory.Defaults({
            sellBandBps: uint16(j.readUint(".defaults.sellBandBps")),
            buyBandBps: uint16(j.readUint(".defaults.buyBandBps")),
            minInterval: uint32(j.readUint(".defaults.minInterval")),
            publicDelay: uint32(j.readUint(".defaults.publicDelay")),
            twapWindow: uint32(j.readUint(".defaults.twapWindow")),
            maxTickDev: uint16(j.readUint(".defaults.maxTickDev")),
            tolAggBps: uint16(j.readUint(".defaults.tolAggBps")),
            tolDirectBps: uint16(j.readUint(".defaults.tolDirectBps")),
            minTrade: _uint(j, ".defaults.minTrade"),
            dust: _uint(j, ".defaults.dust")
        });
        p.holidaysFile = j.readString(".holidaysFile");
    }

    /// @dev Big numbers are JSON strings (a JSON number above 2^53 would lose precision in most tools).
    function _uint(string memory j, string memory key) internal pure returns (uint256) {
        return vm.parseUint(j.readString(key));
    }

    function _uints(string memory j, string memory key) internal pure returns (uint256[] memory out) {
        string[] memory s = j.readStringArray(key);
        out = new uint256[](s.length);
        for (uint256 i; i < s.length; ++i) {
            out[i] = vm.parseUint(s[i]);
        }
    }

    function _write(Params memory p, address impl, address factory, address lens, address deployer) internal {
        string memory k = "dep";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "block", block.number);
        vm.serializeAddress(k, "deployer", deployer);
        vm.serializeAddress(k, "FloorVault", impl);
        vm.serializeAddress(k, "FloorFactory", factory);
        vm.serializeAddress(k, "FloorLens", lens);
        vm.serializeAddress(k, "pendingOwner", p.owner);
        vm.serializeAddress(k, "guardian", p.guardian);
        // constructor args of FloorFactory (the deployer is the temporary owner and guardian)
        vm.serializeAddress(k, "ctor_usdt", p.usdt);
        vm.serializeAddress(k, "ctor_v3Factory", p.v3Factory);
        vm.serializeAddress(k, "ctor_v3SwapRouter", p.v3SwapRouter);
        string memory out = vm.serializeAddress(k, "ctor_vaultImplementation", impl);
        vm.writeJson(out, string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json"));
    }
}
