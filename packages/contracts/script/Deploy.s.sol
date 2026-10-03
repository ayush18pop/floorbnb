// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {FloorVault} from "../src/FloorVault.sol";
import {FloorFactory} from "../src/FloorFactory.sol";
import {FloorLens} from "../src/FloorLens.sol";
import {IFloorFactory} from "../src/interfaces/IFloorFactory.sol";
import {IBeacon} from "../src/interfaces/IBeacon.sol";
import {IPancakeV3Factory} from "../src/interfaces/IPancakeV3Factory.sol";
import {IPancakeV3Pool} from "../src/interfaces/IPancakeV3Pool.sol";
import {ISecuritiesToken} from "../src/interfaces/ISecuritiesToken.sol";

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
        _preflight(p); // read-only checks against the target chain; nothing is sent before they pass

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

    /// @dev Pashov F-06/F-07 and A12 deploy checks. Pure reads (run with `--fork-url` or `--rpc-url`); any failed check
    ///      aborts the script before `startBroadcast`, so nothing is ever sent with a bad parameter file.
    function _preflight(Params memory p) internal view {
        // --- shapes and casts (F-07: no silent truncation)
        uint256 n = p.assetTokens.length;
        require(n >= 1 && n <= 16, "Deploy: need 1..16 assets");
        require(p.assetMinLiquidity.length == n && p.assetMaxTradeValue.length == n, "Deploy: asset array length");
        require(p.routerTargets.length > 0, "Deploy: router allowlist empty");
        require(p.routerTargets.length == p.routerApproveTargets.length, "Deploy: router array length");
        bool pancakeListed;
        for (uint256 i; i < p.routerTargets.length; ++i) {
            require(p.routerTargets[i] != address(0) && p.routerApproveTargets[i] != address(0), "Deploy: zero router");
            if (p.routerTargets[i] == p.v3SwapRouter) pancakeListed = true;
        }
        require(pancakeListed, "Deploy: v3SwapRouter must be allowlisted");
        require(p.keepers.length > 0, "Deploy: no keeper");
        for (uint256 i; i < p.keepers.length; ++i) {
            require(p.keepers[i] != address(0), "Deploy: zero keeper");
        }

        // --- USDT (immutable in the factory, 18 decimals assumed by TwapOracle and CPPIMath)
        require(p.usdt.code.length > 0, "Deploy: usdt has no code");
        require(IERC20Metadata(p.usdt).decimals() == 18, "Deploy: usdt decimals != 18");
        require(p.v3Factory.code.length > 0 && p.v3SwapRouter.code.length > 0, "Deploy: pancake address has no code");

        // --- token beacon (zero only on chains without one; then the buy guard is off)
        if (block.chainid == 56) require(p.tokenBeacon != address(0), "Deploy: beacon required on BSC");
        if (p.tokenBeacon != address(0)) {
            require(p.approvedTokenImpl != address(0), "Deploy: approvedTokenImpl zero");
            require(IBeacon(p.tokenBeacon).implementation() == p.approvedTokenImpl, "Deploy: beacon impl != approved");
        }

        // --- limits and defaults
        require(p.maxDeposit >= 1e18, "Deploy: maxDeposit below MIN_DEPOSIT");
        require(p.maxDeposit <= p.maxTotalTvl, "Deploy: maxDeposit > maxTotalTvl");
        require(p.maxTotalTvl <= 100_000e18, "Deploy: maxTotalTvl above 100k USDT launch ceiling");
        IFloorFactory.Defaults memory d = p.defaults;
        require(d.sellBandBps > 0 && d.sellBandBps <= 1000, "Deploy: sellBand");
        require(d.buyBandBps >= d.sellBandBps && d.buyBandBps <= 2000, "Deploy: buyBand");
        require(d.tolAggBps > 0 && d.tolAggBps <= 200 && d.tolDirectBps > 0 && d.tolDirectBps <= 300, "Deploy: tol");
        require(d.twapWindow >= 300 && d.twapWindow <= 3600, "Deploy: twapWindow");
        require(d.maxTickDev > 0 && d.maxTickDev <= 1000, "Deploy: maxTickDev");
        require(d.minInterval >= 60 && d.publicDelay >= d.minInterval, "Deploy: intervals");
        require(d.dust > 0 && d.dust <= d.minTrade && d.minTrade <= 1000e18, "Deploy: minTrade/dust");

        // --- each asset: token order, decimals, pool identity, liquidity, history
        for (uint256 i; i < n; ++i) {
            require(p.assetFees[i] > 0 && p.assetFees[i] <= type(uint24).max, "Deploy: fee out of range");
            require(p.assetMinLiquidity[i] > 0 && p.assetMinLiquidity[i] <= type(uint128).max, "Deploy: minLiq range");
            require(p.assetMaxTradeValue[i] >= d.minTrade, "Deploy: maxTradeValue < minTrade");
            require(p.assetMaxTradeValue[i] <= p.maxTotalTvl * 10, "Deploy: maxTradeValue absurd");
            _preflightAsset(p, i);
            for (uint256 j; j < i; ++j) {
                require(p.assetTokens[j] != p.assetTokens[i], "Deploy: duplicate asset");
            }
        }

        // --- holidays file present and covers the launch horizon
        require(bytes(p.holidaysFile).length != 0, "Deploy: holidaysFile required");
        uint256[] memory raw =
            vm.readFile(string.concat(vm.projectRoot(), "/", p.holidaysFile)).readUintArray(".unixDays");
        require(raw.length > 0, "Deploy: empty holiday table");
        for (uint256 i = 1; i < raw.length; ++i) {
            require(raw[i] > raw[i - 1], "Deploy: holidays not sorted");
        }
        require(raw[raw.length - 1] >= 21_176, "Deploy: holiday table must reach 2027-12-24");
    }

    function _preflightAsset(Params memory p, uint256 i) internal view {
        address token = p.assetTokens[i];
        address pool = p.assetPools[i];
        require(token.code.length > 0 && pool.code.length > 0, "Deploy: asset or pool has no code");
        require(IERC20Metadata(token).decimals() == 18, "Deploy: asset decimals != 18");
        // reading the multiplier must work, it is the listing baseline (A12 F-02)
        require(ISecuritiesToken(token).uiMultiplier() > 0, "Deploy: uiMultiplier unreadable");
        // 18-decimal pair means raw ratio == price, so token order is the only thing the oracle needs
        // forge-lint: disable-next-line(unsafe-typecast)
        require(
            IPancakeV3Factory(p.v3Factory).getPool(token, p.usdt, uint24(p.assetFees[i])) == pool,
            "Deploy: pool != factory"
        );
        IPancakeV3Pool pl = IPancakeV3Pool(pool);
        address t0 = pl.token0();
        address t1 = pl.token1();
        require((t0 == p.usdt && t1 == token) || (t0 == token && t1 == p.usdt), "Deploy: pool token order");
        require(pl.liquidity() >= p.assetMinLiquidity[i], "Deploy: pool liquidity below minLiquidity");
        (,,, uint16 cardinality,,,) = pl.slot0();
        require(cardinality >= 200, "Deploy: TWAP cardinality < 200");
        uint32[] memory ago = new uint32[](2);
        ago[0] = p.defaults.twapWindow;
        pl.observe(ago); // reverts when the pool history is shorter than the window
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
