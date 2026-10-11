import type { Bw3PathStats } from '@floor/bw3';

export type BinanceApiName = 'RWA Data API' | 'Market API' | 'Transaction API' | 'Trading API' | 'b402 Payments';

export interface BinanceModuleDef {
  id: string;
  api: BinanceApiName;
  endpoint: string;
  usedBy: string[];
  inProduction: boolean;
  note: string | null;
}

export const P = {
  rwaPrice: '/api/v1/dex/market/rwa/price',
  rwaUnderlyingMarket: '/api/v1/dex/market/rwa/underlying-market',
  rwaUnderlyingProfile: '/api/v1/dex/market/rwa/underlying-profile',
  candles: '/api/v1/dex/market/candles',
  gasPrice: '/api/v1/dex/pre-transaction/gas-price',
  simulate: '/api/v1/dex/pre-transaction/simulate',
  quote: '/api/v1/dex/aggregator/quote',
} as const;

/**
 * Static module table: every Binance Web3 API module Floor integrates. Paid MCP tools settle over b402
 * (X402_FACILITATOR=b402). tx.gas-price / tx.simulate / the keeper price guard run in the keeper when it has BW3 keys.
 */
export const BINANCE_MODULES: BinanceModuleDef[] = [
  { id: 'market.rwa.price', api: 'RWA Data API', endpoint: P.rwaPrice, usedBy: ['api', 'web', 'mcp', 'keeper', 'keeper price guard'], inProduction: true, note: null },
  { id: 'market.rwa.underlying-market', api: 'RWA Data API', endpoint: P.rwaUnderlyingMarket, usedBy: ['api', 'web'], inProduction: true, note: 'Underlying market data for each bStock; null marketStatus and price fields are passed through as null' },
  { id: 'market.rwa.underlying-profile', api: 'RWA Data API', endpoint: P.rwaUnderlyingProfile, usedBy: ['api', 'web'], inProduction: true, note: null },
  { id: 'market.candles', api: 'Market API', endpoint: P.candles, usedBy: ['api', 'web'], inProduction: true, note: 'Daily candles for the price chart and backtests' },
  { id: 'tx.gas-price', api: 'Transaction API', endpoint: P.gasPrice, usedBy: ['keeper'], inProduction: true, note: 'Keeper reads gas price before each rebalance (needs BW3 keys)' },
  { id: 'tx.simulate', api: 'Transaction API', endpoint: P.simulate, usedBy: ['keeper'], inProduction: true, note: 'Keeper simulates each transaction before sending (needs BW3 keys)' },
  { id: 'trading.quote', api: 'Trading API', endpoint: P.quote, usedBy: ['keeper'], inProduction: true, note: 'Aggregator quotes are shown in the builder; the swap route is available to the keeper' },
  { id: 'b402', api: 'b402 Payments', endpoint: 'b402 facilitator', usedBy: ['api', 'mcp'], inProduction: true, note: 'Paid MCP tools settle over b402' },
];

export interface BinanceModuleStatus extends BinanceModuleDef {
  calls: number;
  okCalls: number;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
}

/** Live stats are per process: calls made by other processes (the keeper) are not visible here. */
export function mergeModuleStats(snapshot: Record<string, Bw3PathStats>): BinanceModuleStatus[] {
  return BINANCE_MODULES.map((m) => {
    const s = snapshot[m.endpoint];
    return { ...m, usedBy: [...m.usedBy], calls: s?.calls ?? 0, okCalls: s?.okCalls ?? 0, lastOkAt: s?.lastOkAt ?? null, lastErrorAt: s?.lastErrorAt ?? null, lastError: s?.lastError ?? null };
  });
}
