// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IFloorFactory} from "./interfaces/IFloorFactory.sol";
import {IFloorVault} from "./interfaces/IFloorVault.sol";
import {IFloorLens} from "./interfaces/IFloorLens.sol";

/// @title FloorLens
/// @notice Stateless read helper for the keeper and the web app. Every vault call is wrapped in try/catch, so one
///         vault with a broken pool or token cannot break a scan. Spec: docs/CONTRACTS.md section 11.3.
contract FloorLens is IFloorLens {
    IFloorFactory public immutable factory;

    constructor(address factory_) {
        factory = IFloorFactory(factory_);
    }

    /// @inheritdoc IFloorLens
    /// @dev Fields that cannot be read (oracle failure) are left at 0 and `needsRebalance` is false.
    ///      `exposure` is the stock value at the TWAP, `target` is E*.
    function status(address vault) public view returns (Status memory s) {
        s.vault = vault;
        s.tradingOpen = factory.isTradingOpen(block.timestamp);
        if (vault.code.length == 0) return s; // not a contract: a high-level try/catch cannot absorb that revert
        try IFloorVault(vault).floor() returns (uint256 f) {
            s.floor = f;
        } catch {}
        try IFloorVault(vault).valuation() returns (uint256 V, uint256, uint256[3] memory stockValue) {
            s.V = V;
            s.exposure = stockValue[0] + stockValue[1] + stockValue[2];
        } catch {}
        try IFloorVault(vault).targets() returns (uint256 cushion, uint256 exposureTarget, uint256[3] memory) {
            s.cushion = cushion;
            s.target = exposureTarget;
        } catch {}
        try IFloorVault(vault).previewRebalance() returns (
            bool needed, uint8, bool, address, address, uint256, uint256, uint256
        ) {
            s.needsRebalance = needed;
        } catch {}
    }

    /// @inheritdoc IFloorLens
    /// @dev `previewRebalance` already skips assets inside `minInterval`, so this respects the rate limit. Returns
    ///      an empty list when trading is closed (no vault could trade now).
    function scan(uint256 from, uint256 to) external view returns (address[] memory needing) {
        uint256 total = factory.positionsCount();
        if (to > total) to = total;
        if (from >= to || !factory.isTradingOpen(block.timestamp)) return new address[](0);
        address[] memory tmp = new address[](to - from);
        uint256 n;
        for (uint256 i = from; i < to; ++i) {
            address v = factory.positions(i);
            try IFloorVault(v).previewRebalance() returns (
                bool needed, uint8, bool, address, address, uint256, uint256, uint256
            ) {
                if (needed) tmp[n++] = v;
            } catch {}
        }
        needing = new address[](n);
        for (uint256 i; i < n; ++i) {
            needing[i] = tmp[i];
        }
    }
}
