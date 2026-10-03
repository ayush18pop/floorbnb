import { TOKENS } from "@floor/sdk";
import type { AssetInfo, AssetSymbol } from "./types";

/** Addresses from @floor/sdk (CONTEXT.md table). Costs: CONTEXT.md, live quotes Thu 2026-10-02 12:06 UTC. TSLAB is not offered. */
const meta: Record<AssetSymbol, { name: string; bps: number }> = {
  NVDAB: { name: "NVIDIA", bps: 5.9 },
  SPCXB: { name: "SpaceX", bps: 6.0 },
  QQQB: { name: "Nasdaq-100", bps: 0.7 },
  SPYB: { name: "S&P 500", bps: 6.6 },
};

export const ASSETS: AssetInfo[] = (Object.keys(meta) as AssetSymbol[]).map((symbol) => ({
  symbol,
  name: meta[symbol].name,
  token: TOKENS[symbol].address,
  roundTripBps: meta[symbol].bps,
  optional: TOKENS[symbol].tier === "optional",
}));

export const assetBySymbol = (s: AssetSymbol) => ASSETS.find((a) => a.symbol === s)!;
export const symbolOf = (token: string): AssetSymbol | undefined => ASSETS.find((a) => a.token.toLowerCase() === token.toLowerCase())?.symbol;
