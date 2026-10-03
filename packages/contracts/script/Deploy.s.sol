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
import {IPancakeV3SwapRouter} from "../src/interfaces/IPancakeV3SwapRouter.sol";
import {IPancakeV3Pool} from "../src/interfaces/IPancakeV3Pool.sol";
import {ISecuritiesToken} from "../src/interfaces/ISecuritiesToken.sol";
import {DefaultsCheck} from "../src/libs/DefaultsCheck.sol";

/// @title Deploy
/// @notice Deploys FloorVault (implementation), FloorFactory and FloorLens, then configures the factory.
///         Spec: docs/CONTRACTS.md section 14, EXECUTION_PLAN P2, P5.
/// @dev NO private key is read from the environment. Choose the signer on the command line:
///        simulation:  forge script script/Deploy.s.sol --fork-url $BSC_FORK_RPC_URL
///        real run:    forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --ledger --broadcast
///                     (or `--account <keystore-name> --sender <addr>`)
///      The broadcaster deploys with itself as owner AND guardian so it can configure everything, then hands
///      guardian to `params.guardian` and starts the 2-step ownership transfer to `params.owner` (the new owner must
///      call `acceptOwnership()`). RUNBOOK: until the new owner has called `acceptOwnership()`, the hot deployer key IS
///      still the factory owner (it can list assets, change defaults, set keepers, set limits). Do the handover in
///      the same session, confirm `owner()` on chain, then discard the deployer key (Pashov 03 lead). Parameters come from `script/params/<chainId>.json`; the output is written to
///      `deployments/<chainId>.json` (only when FLOOR_WRITE_DEPLOYMENT=true, so a plain simulation never writes files).
contract Deploy is Script {
    using stdJson for string;

    /// @dev EIP-1967 beacon slot: bytes32(uint256(keccak256("eip1967.proxy.beacon")) - 1).
    bytes32 internal constant BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;

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

        // Zero beacon = a chain without the bStock beacon (the buy guard is then off); `setTokenBeacon` rejects zero.
        if (p.tokenBeacon != address(0)) factory.setTokenBeacon(p.tokenBeacon, p.approvedTokenImpl);
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
            factory.setHolidayHorizon(uint32(h.readUint(".coversThroughDay")));
        }

        if (p.guardian != deployer) factory.setGuardian(p.guardian);
        if (p.owner != deployer) factory.transferOwnership(p.owner);
        vm.stopBroadcast();

        console2.log("chainId           ", block.chainid);
        console2.log("deployer          ", deployer);
        console2.log("FloorVault (impl) ", address(impl));
        console2.log("FloorFactory      ", address(factory));
        console2.log("FloorLens         ", address(lens));
        console2.log("pending owner     ", p.owner, "(deployer stays OWNER until it calls acceptOwnership)");
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
            if (p.routerTargets[i] == p.v3SwapRouter) {
                pancakeListed = true;
                // The Pancake SwapRouter pulls tokens as msg.sender, so it is its own approve target (Pashov 04 lead).
                require(p.routerApproveTargets[i] == p.v3SwapRouter, "Deploy: pancake approveTarget != router");
            }
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
        // the router must swap in the pools of the listed factory (Pashov 04 lead)
        require(IPancakeV3SwapRouter(p.v3SwapRouter).factory() == p.v3Factory, "Deploy: router.factory != v3Factory");

        // --- token beacon (zero only on chains without one; then the buy guard is off)
        if (block.chainid == 56) require(p.tokenBeacon != address(0), "Deploy: beacon required on BSC");
        if (p.tokenBeacon != address(0)) {
            require(p.approvedTokenImpl != address(0), "Deploy: approvedTokenImpl zero");
            require(IBeacon(p.tokenBeacon).implementation() == p.approvedTokenImpl, "Deploy: beacon impl != approved");
        }

        // --- limits and defaults (the same bounds the factory enforces: `DefaultsCheck`)
        require(p.maxDeposit >= 1e18, "Deploy: maxDeposit below MIN_DEPOSIT");
        require(p.maxDeposit <= p.maxTotalTvl, "Deploy: maxDeposit > maxTotalTvl");
        require(p.maxTotalTvl <= 100_000e18, "Deploy: maxTotalTvl above 100k USDT launch ceiling");
        IFloorFactory.Defaults memory d = p.defaults;
        {
            string memory why = DefaultsCheck.reason(d);
            require(bytes(why).length == 0, string.concat("Deploy: defaults.", why));
        }

        // --- each asset: token order, decimals, pool identity, liquidity, history
        for (uint256 i; i < n; ++i) {
            require(p.assetFees[i] > 0 && p.assetFees[i] <= type(uint24).max, "Deploy: fee out of range");
            require(p.assetMinLiquidity[i] > 0 && p.assetMinLiquidity[i] <= type(uint128).max, "Deploy: minLiq range");
            require(p.assetMaxTradeValue[i] >= d.minTrade, "Deploy: maxTradeValue < minTrade");
            require(p.assetMaxTradeValue[i] <= p.maxTotalTvl * 10, "Deploy: maxTradeValue absurd");
            require(DefaultsCheck.feeFits(uint24(p.assetFees[i]), d.tolDirectBps), "Deploy: pool fee vs tolDirectBps");
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
        require(raw[raw.length - 1] <= 30_000, "Deploy: holidays look like unix seconds, not days");
        uint256 horizon =
            vm.readFile(string.concat(vm.projectRoot(), "/", p.holidaysFile)).readUint(".coversThroughDay");
        require(horizon >= raw[raw.length - 1] && horizon <= 30_000, "Deploy: coversThroughDay");
    }

    function _preflightAsset(Params memory p, uint256 i) internal view {
        address token = p.assetTokens[i];
        address pool = p.assetPools[i];
        require(token.code.length > 0 && pool.code.length > 0, "Deploy: asset or pool has no code");
        require(IERC20Metadata(token).decimals() == 18, "Deploy: asset decimals != 18");
        // reading the multiplier must work, it is the listing baseline (A12 F-02)
        require(ISecuritiesToken(token).uiMultiplier() > 0, "Deploy: uiMultiplier unreadable");
        // the two other multiplier getters the vault calls must be readable too (`addAsset` checks them and would revert)
        try ISecuritiesToken(token).hasPendingMultiplier() returns (bool) {}
        catch {
            revert("Deploy: hasPendingMultiplier unreadable");
        }
        try ISecuritiesToken(token).effectiveAt() returns (uint256) {}
        catch {
            revert("Deploy: effectiveAt unreadable");
        }
        // the token must be a beacon proxy of `tokenBeacon` (EIP-1967 beacon slot): the vault's buy guard watches that
        // beacon's implementation, so a token outside it would never trip the guard (Pashov 03 lead)
        if (p.tokenBeacon != address(0)) {
            require(
                address(uint160(uint256(vm.load(token, BEACON_SLOT)))) == p.tokenBeacon,
                "Deploy: token is not a proxy of tokenBeacon"
            );
        }
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
        // BSC blocks are 0.75 s and a pool writes one observation per block: ceil(window * 4 / 3) slots (Pashov 02 #13)
        require(
            cardinality >= 200 && uint256(cardinality) * 3 >= uint256(p.defaults.twapWindow) * 4,
            "Deploy: TWAP cardinality"
        );
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
            sellBandBps: _u16(j, ".defaults.sellBandBps"),
            buyBandBps: _u16(j, ".defaults.buyBandBps"),
            minInterval: _u32(j, ".defaults.minInterval"),
            publicDelay: _u32(j, ".defaults.publicDelay"),
            twapWindow: _u32(j, ".defaults.twapWindow"),
            maxTickDev: _u16(j, ".defaults.maxTickDev"),
            tolAggBps: _u16(j, ".defaults.tolAggBps"),
            tolDirectBps: _u16(j, ".defaults.tolDirectBps"),
            minTrade: _uint(j, ".defaults.minTrade"),
            dust: _uint(j, ".defaults.dust")
        });
        p.holidaysFile = j.readString(".holidaysFile");
    }

    /// @dev Checked narrowing: a value that does not fit aborts the script instead of being cut (Pashov 03 lead).
    function _u16(string memory j, string memory key) internal pure returns (uint16) {
        uint256 v = j.readUint(key);
        require(v <= type(uint16).max, string.concat("Deploy: ", key, " exceeds uint16"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint16(v);
    }

    function _u32(string memory j, string memory key) internal pure returns (uint32) {
        uint256 v = j.readUint(key);
        require(v <= type(uint32).max, string.concat("Deploy: ", key, " exceeds uint32"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint32(v);
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
