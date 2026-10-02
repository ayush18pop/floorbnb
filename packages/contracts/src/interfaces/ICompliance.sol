// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The bStock compliance contract (`0x53dBa7AaBDe774787A1F57236B235567dA8e14F4`): per-token blocklist and a
///         sanctions list. Fork tests prank its admin to answer CONTRACTS.md Q3. `checkIsCompliant` reverts for
///         non-token callers (CONTRACTS.md section 4), so it is not a vault dependency.
interface ICompliance {
    function addToBlocklist(address token, address[] calldata accounts) external;
    function removeFromBlocklist(address token, address[] calldata accounts) external;
    function addToSanctionsList(address[] calldata accounts) external;
    function sanctionedAddresses(address who) external view returns (bool);
    function checkIsCompliant(address from, address to) external view returns (bool);
}
