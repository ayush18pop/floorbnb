import type { AssetInfo, AssetSymbol } from "./types";

/** Addresses: CONTEXT.md table (BSC, 18 decimals). Costs: CONTEXT.md, live quotes Thu 2026-10-02 12:06 UTC. */
export const ASSETS: AssetInfo[] = [
  { symbol: "NVDAB", name: "NVIDIA", token: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", roundTripBps: 5.9 },
  { symbol: "SPCXB", name: "SpaceX", token: "0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1", roundTripBps: 6.0 },
  { symbol: "QQQB", name: "Nasdaq-100", token: "0x205812cdbed920aff76c6580abd681a46d11efc7", roundTripBps: 0.7 },
  { symbol: "SPYB", name: "S&P 500", token: "0x7138b48df7d98d7e3cc221bfe7192d0a178182d8", roundTripBps: 6.6, optional: true },
];

export const assetBySymbol = (s: AssetSymbol) => ASSETS.find((a) => a.symbol === s)!;
