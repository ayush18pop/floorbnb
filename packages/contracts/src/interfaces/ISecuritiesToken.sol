// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The bStock token surface Floor reads (ERC-8056 scaled UI amount plus pause and compliance hooks).
///         Balances stay raw and fixed; `uiMultiplier` only scales the UI amount. Spec: CONTRACTS.md section 4.
/// @dev Selectors are from a bytecode scan and live `eth_call`s (2026-10-02). `effectiveAt` and the
///      `setUIMultiplier` arguments are partly **unverified**.
interface ISecuritiesToken {
    function decimals() external view returns (uint8);
    function balanceOf(address who) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);

    function uiMultiplier() external view returns (uint256);
    function pendingMultiplier() external view returns (uint256);
    function hasPendingMultiplier() external view returns (bool);
    function effectiveAt() external view returns (uint256);
    function balanceOfUI(address who) external view returns (uint256);
    function toUIAmount(uint256 rawAmount) external view returns (uint256);

    /// @notice The shared pause manager (`0x9fc7...700a` today).
    function pauseManager() external view returns (address);
    /// @notice The shared compliance contract (`0x53dB...4F4` today).
    function compliance() external view returns (address);
    function isTokenPaused(address token) external view returns (bool);
}
