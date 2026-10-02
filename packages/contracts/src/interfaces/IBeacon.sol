// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The shared bStock beacon (`0x156d6dce9a4f6139a3406f1f021f1a4880de93a3`). The vault compares
///         `implementation()` with the factory's `approvedTokenImpl` before every buy (`TokenImplChanged`).
interface IBeacon {
    function implementation() external view returns (address);
    function owner() external view returns (address);
}
