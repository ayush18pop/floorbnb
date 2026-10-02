// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 18-decimal mintable ERC-20 that can imitate a bStock: pausable, per-address blocklist, settable uiMultiplier.
contract MockToken is ERC20 {
    bool public paused;
    mapping(address => bool) public blocked;
    uint256 public uiMultiplier = 1e18;
    uint256 public pendingMultiplier;
    bool public hasPendingMultiplier;
    uint256 public effectiveAt;

    error TokenPaused();
    error Blocked(address who);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setPaused(bool on) external {
        paused = on;
    }

    function setBlocked(address who, bool on) external {
        blocked[who] = on;
    }

    function setUiMultiplier(uint256 m) external {
        uiMultiplier = m;
    }

    function setPending(uint256 m, uint256 at) external {
        pendingMultiplier = m;
        hasPendingMultiplier = m != 0;
        effectiveAt = at;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert TokenPaused();
        if (blocked[from]) revert Blocked(from);
        if (blocked[to]) revert Blocked(to);
        super._update(from, to, value);
    }
}
