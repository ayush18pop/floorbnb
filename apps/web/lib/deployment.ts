/** Real BSC mainnet (chain 56) deployment transactions. Source: packages/contracts/broadcast/Deploy.s.sol/56/run-latest.json. */
export const DEPLOY_TXS: readonly (readonly [label: string, hash: string])[] = [
  ["Deploy FloorVault implementation", "0xebdc43df065cea34ce1fe8af90a871365cd6feb274a8b1d259f6ca54330d5146"],
  ["Deploy FloorFactory", "0x1185de0ae780680efdaeeb3d9b76a721e20293a47f019421e039d2adb07b78c5"],
  ["Deploy FloorLens", "0x7463e8327998bcbce0b12cb6b02a265d2a27fa7a3069fa8f5ea3793c94fd80d4"],
  ["setTokenBeacon", "0x5f7f9aee98f16bab2948467636abc7dd359a129781e3ef1aa295ad5a1f12ab69"],
  ["addAsset (1 of 3)", "0x15e80e07855b967e06e5a392e78ee113f156dac4c595a84c3a7be1624bb9a61a"],
  ["addAsset (2 of 3)", "0x67ffc136254db8a466c16a3301036e624987943b52b154ab5a82c1a8c2e3f6c8"],
  ["addAsset (3 of 3)", "0x3f07f2a2806cdb0613f83e29b52bbc0fa479a78011d377ef708fecf79a75589f"],
  ["setKeeper", "0x9a6c51f315e18e4d3256e131f7ef43f0ac409df96fd7c33b5572406482fe1b23"],
  ["setLimits", "0xfc320da16f8b960209c4aea270ac474b9297913a26c7c6f5eb93598ecf0ebf83"],
  ["setNonTradingDays", "0x02c5fd6924ef2b008ee7e4709be3df2b8f9317752d4b3eb72689dd190be28da4"],
  ["setHolidayHorizon", "0x51142f37d9f5ee9dc13866f55d1c8aa5e1d00a5266b83195cc156158e082f152"],
  ["setGuardian", "0xf016e7b097513a992e1ae5048f3f78c4a1443a8250123dd03c86b27a2921181f"],
  ["transferOwnership (proposed to the owner)", "0x9df551e3758233ac222db1fb15c24e64fbdbcc5ddbbd7741a3528eb89a67e66d"],
];
/** Owner accepted the ownership transfer (verified on-chain). */
export const OWNERSHIP_ACCEPTED_TX = "0xde058a1d27354de9534a7593a05ecd48d24e923661a8d1024521fd9ae8ccd1cc";
