// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FloorVault} from "../../../src/FloorVault.sol";
import {IFloorVault} from "../../../src/interfaces/IFloorVault.sol";
import {HandlerBase} from "./HandlerBase.sol";
import {System} from "./System.sol";

/// @notice Position owners exiting at any time, under any market, pause, token or oracle state.
///         I8 / I13: `exitInKind` by the owner to a non-zero address must NEVER revert.
contract UserHandler is HandlerBase {
    constructor(System s) HandlerBase(s) {}

    function _ownerOf(FloorVault v) internal view returns (address) {
        return v.owner();
    }

    function requestClose(uint256 vSel) external {
        if ((vSel / 2) % 6 != 0) return; // exits are rare so trading keeps running
        FloorVault v = vaultAt(vSel);
        vm.prank(_ownerOf(v));
        try v.requestClose() {
            _count("requestClose_ok");
        } catch {}
    }

    function closeToUSDT(uint256 vSel) external {
        if ((vSel / 2) % 6 != 0) return; // exits are rare so trading keeps running
        FloorVault v = vaultAt(vSel);
        vm.prank(_ownerOf(v));
        try v.closeToUSDT() {
            _count("closeToUSDT_ok");
            if (IERC20(address(sys.usdt())).balanceOf(address(v)) != 0) _violate("close_usdtLeft");
            if (v.status() != IFloorVault.Status.Closed) _violate("close_status");
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            // allowed: stock not unwound, wrong status, or the oracle refusing to price remaining stock
            if (
                sel != FloorVault.BadStatus.selector && sel != IFloorVault.StockNotUnwound.selector
                    && sel != IFloorVault.PriceDeviation.selector && sel != IFloorVault.OracleHistoryTooShort.selector
                    && sel != IFloorVault.PoolIlliquid.selector
            ) _violate("I13_closeToUSDT_otherRevert");
        }
    }

    function exitInKind(uint256 vSel, bool toOther) external {
        if ((vSel / 2) % 8 != 0) return;
        FloorVault v = vaultAt(vSel);
        address owner = _ownerOf(v);
        address to = toOther ? address(0xC1EA2) : owner;
        Snap memory other = _snap(address(otherVault(v)));
        vm.prank(owner);
        try v.exitInKind(to) {
            _count("exitInKind_ok");
            if (IERC20(address(sys.usdt())).balanceOf(address(v)) != 0) _violate("exit_usdtLeft");
            if (v.status() != IFloorVault.Status.Closed) _violate("exit_status");
        } catch {
            // I8 / I13
            _violate("I8_exitInKind_reverted");
        }
        if (!_same(other, _snap(address(otherVault(v))))) _violate("I9_otherVaultMoved");
    }

    function rescue(uint256 vSel, uint256 tokenSel) external {
        FloorVault v = vaultAt(vSel);
        IERC20 t = tokens()[tokenSel % 3];
        bool closed = v.status() == IFloorVault.Status.Closed;
        vm.prank(_ownerOf(v));
        try v.rescue(address(t), address(0xC1EA2)) {
            _count("rescue_ok");
            if (!closed) _violate("rescue_whileOpen");
        } catch {}
    }

    /// @dev Strangers must never be able to use owner functions.
    function strangerCalls(uint256 vSel, address who) external {
        FloorVault v = vaultAt(vSel);
        if (who == _ownerOf(v) || who == address(sys.factory()) || who == address(0)) return;
        Snap memory before_ = _snap(address(v));
        vm.startPrank(who);
        try v.exitInKind(who) {
            _violate("auth_exitInKind");
        } catch {}
        try v.closeToUSDT() {
            _violate("auth_closeToUSDT");
        } catch {}
        try v.requestClose() {
            _violate("auth_requestClose");
        } catch {}
        try v.rescue(address(sys.usdt()), who) {
            _violate("auth_rescue");
        } catch {}
        vm.stopPrank();
        if (!_same(before_, _snap(address(v)))) _violate("auth_balanceMoved");
    }
}
