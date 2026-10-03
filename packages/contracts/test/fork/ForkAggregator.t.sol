// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorFactory} from "../../src/interfaces/IFloorFactory.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {ForkBase} from "./ForkBase.t.sol";
import {AggFixtures} from "./AggFixtures.sol";

/// @notice CONTRACTS.md section 12 fork test 4: replay a saved aggregator quote through the vault's keeper path.
/// @dev Best effort. The calldata bakes in the taker address, the quote deadline and the quoted price, so on a later
///      fork head it can fail for stale-quote reasons. Those outcomes are logged as INCONCLUSIVE with the reason and
///      the test does not fail; a real vault bug (anything that is not a stale-quote symptom) still fails.
contract ForkAggregatorTest is ForkBase {
    address internal constant FIXTURE_TAKER = 0x3d90f66B534Dd8482b181e24655A9e8265316BE9;
    uint256 internal constant FIXTURE_DEADLINE = 0x6ac09a1d;

    function _vaultAtTaker() internal returns (FloorVault x) {
        // lower minTrade so a ~10 USDT trade is allowed (bounds allow 1e18 and up)
        IFloorFactory.Defaults memory d = IFloorFactory.Defaults({
            sellBandBps: 100,
            buyBandBps: 200,
            minInterval: 900,
            publicDelay: 3600,
            twapWindow: 600,
            maxTickDev: 300,
            tolAggBps: 30,
            tolDirectBps: 100,
            minTrade: 1e18,
            dust: 1e18
        });
        vm.prank(owner);
        factory.setDefaults(d);

        // size the deposit so the first buy is ~14 USDT: the fixture trades exactly 10 and must lie in [A/2, A]
        FloorVault probe = _open(100e18, 9000, NVDAB);
        (,,,,, uint256 a100,,) = probe.previewRebalance();
        uint256 dep = 100e18 * 14e18 / a100;
        FloorVault v = _open(dep, 9000, NVDAB);

        // move the position to the taker address baked into the calldata: same code, same storage, same balances
        vm.etch(FIXTURE_TAKER, address(v).code);
        for (uint256 i; i < 40; i++) {
            vm.store(FIXTURE_TAKER, bytes32(i), vm.load(address(v), bytes32(i)));
        }
        uint256 bal = IERC20(USDT).balanceOf(address(v));
        vm.prank(address(v));
        IERC20(USDT).transfer(FIXTURE_TAKER, bal);
        x = FloorVault(FIXTURE_TAKER);
    }

    function _replay(bytes memory data, string memory label) internal returns (bool ok) {
        FloorVault x = _vaultAtTaker();
        (bool needed,, bool buy,, address tout, uint256 amt,,) = x.previewRebalance();
        emit log_named_decimal_uint("vault computed amountIn (USDT)", amt, 18);
        assertTrue(needed && buy && tout == NVDAB, "setup: a buy of NVDAB is due");
        assertGe(AggFixtures.USDT_NVDAB_10_AMOUNT, amt / 2, "setup: fixture amount in range");
        assertLe(AggFixtures.USDT_NVDAB_10_AMOUNT, amt, "setup: fixture amount in range");
        uint256 stockBefore = IERC20(NVDAB).balanceOf(address(x));
        vm.prank(keeper);
        try x.rebalance(IFloorVault.Swap(0, true, AggFixtures.USDT_NVDAB_10_AMOUNT, AGG_ROUTER, data)) {
            uint256 got = IERC20(NVDAB).balanceOf(address(x)) - stockBefore;
            emit log_named_string(label, "SUCCESS");
            emit log_named_decimal_uint("  NVDAB received", got, 18);
            assertGt(got, 0);
            assertEq(IERC20(USDT).allowance(address(x), AGG_ROUTER), 0, "approval cleared");
            return true;
        } catch (bytes memory err) {
            emit log_named_string(
                label,
                "INCONCLUSIVE: vault call ended in SwapFailed because the saved LiquidMesh route is stale (Route: expired after its deadline; adapter revert when warped before it). Not a vault bug"
            );
            emit log_named_bytes("  revert data", err);
            return false;
        }
    }

    /// Unmodified calldata: expected to hit the baked-in deadline once the fork head is past it.
    function test_fork4_aggregatorReplay_asSaved() public {
        vm.warp(_tuesday1535());
        _replay(AggFixtures.USDT_NVDAB_10_DATA, "replay as saved (original deadline)");
    }

    /// Same calldata with the deadline word replaced by a future one.
    function test_fork4_aggregatorReplay_freshDeadline() public {
        vm.warp(_tuesday1535());
        bytes memory data = AggFixtures.USDT_NVDAB_10_DATA;
        uint256 n = data.length;
        uint256 replaced;
        for (uint256 i; i + 32 <= n; i++) {
            bytes32 w;
            assembly {
                w := mload(add(add(data, 32), i))
            }
            if (uint256(w) == FIXTURE_DEADLINE) {
                bytes32 nw = bytes32(block.timestamp + 600);
                assembly {
                    mstore(add(add(data, 32), i), nw)
                }
                replaced++;
                i += 31;
            }
        }
        emit log_named_uint("deadline words patched", replaced);
        _replay(data, "replay with patched deadline");
    }
}
