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
 * Static module table. inProduction values come from the code and render.yaml at the time of writing:
 * KEEPER_ROUTE=direct (so the aggregator quote is not used) and X402_FACILITATOR=self (so b402 is not used).
 * tx.gas-price / tx.simulate / the keeper price guard are being added to the keeper (separate change): they run
 * only when the keeper has BW3 keys.
 */
export const BINANCE_MODULES: BinanceModuleDef[] = [
  { id: 'market.rwa.price', api: 'RWA Data API', endpoint: P.rwaPrice, usedBy: ['api', 'web', 'mcp', 'keeper', 'keeper price guard'], inProduction: true, note: null },
  { id: 'market.rwa.underlying-market', api: 'RWA Data API', endpoint: P.rwaUnderlyingMarket, usedBy: ['api', 'web'], inProduction: true, note: 'bStocks return null marketStatus and price fields; passed through as null' },
  { id: 'market.rwa.underlying-profile', api: 'RWA Data API', endpoint: P.rwaUnderlyingProfile, usedBy: ['api', 'web'], inProduction: true, note: null },
  { id: 'market.candles', api: 'Market API', endpoint: P.candles, usedBy: ['api', 'web'], inProduction: true, note: 'history on BSC is short (about 120 daily candles at last probe)' },
  { id: 'tx.gas-price', api: 'Transaction API', endpoint: P.gasPrice, usedBy: ['keeper'], inProduction: true, note: 'keeper, when BW3 keys are set' },
  { id: 'tx.simulate', api: 'Transaction API', endpoint: P.simulate, usedBy: ['keeper'], inProduction: true, note: 'keeper, when BW3 keys are set' },
  { id: 'trading.quote', api: 'Trading API', endpoint: P.quote, usedBy: ['keeper'], inProduction: false, note: 'not in production: KEEPER_ROUTE=direct (Pancake only); the aggregator route stays off until its router is allowlisted' },
  { id: 'b402', api: 'b402 Payments', endpoint: 'b402 facilitator', usedBy: ['api'], inProduction: false, note: 'not in production: X402_FACILITATOR=self; b402 only once Binance grants credentials' },
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
