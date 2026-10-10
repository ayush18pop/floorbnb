import { TOKENS } from "@floor/sdk";
import type { AssetInfo, AssetSymbol } from "./types";

/**
 * Addresses from @floor/sdk. Only the three assets enabled on-chain are listed (packages/contracts/deployments/56.json:
 * NVDAB, SPCXB, QQQB). SPYB and TSLAB are not enabled and must not be selectable.
 * directBps: direct PancakeSwap v3 round trip on a fork at 100 USDT, 2026-10-02 (ops/spikes/RESULTS-taker.md). This is the live
 * rebalance route (render.yaml KEEPER_ROUTE=direct). Cost at $10k on this route is not measured.
 * aggregatorBps: Binance aggregator quote, $10k round trip, Thu 2026-10-02 12:06 UTC. Best case only: that route is built and
 * fork-tested, not live.
 */
const meta: Record<AssetSymbol, { name: string; directBps: number; aggregatorBps: number }> = {
  NVDAB: { name: "NVIDIA", directBps: 49, aggregatorBps: 5.9 },
  SPCXB: { name: "SpaceX", directBps: 49, aggregatorBps: 6.0 },
  QQQB: { name: "Nasdaq-100", directBps: 1, aggregatorBps: 0.7 },
};

export const ASSETS: AssetInfo[] = (Object.keys(meta) as AssetSymbol[]).map((symbol) => ({
  symbol,
  name: meta[symbol].name,
  token: TOKENS[symbol].address,
  roundTripBps: meta[symbol].directBps,
  aggregatorBps: meta[symbol].aggregatorBps,
}));

export const assetBySymbol = (s: AssetSymbol) => ASSETS.find((a) => a.symbol === s)!;
export const symbolOf = (token: string): AssetSymbol | undefined => ASSETS.find((a) => a.token.toLowerCase() === token.toLowerCase())?.symbol;
