// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The bStock pause manager (`0x9fc74Be63f3589485B2423984a7a0557e0CF700a`). Used by fork tests (which prank
///         the real admin) and as an optional pre-check. Spec: CONTRACTS.md section 4.
interface IPauseManager {
    function isTokenPaused(address token) external view returns (bool);
    function pausedTokens(address token) external view returns (bool);
    function allTokensPaused() external view returns (bool);
    function pauseToken(address token) external;
    function unpauseToken(address token) external;
    function pauseAllTokens() external;
    function unpauseAllTokens() external;
}
