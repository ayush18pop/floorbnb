import { z } from 'zod';

const loose = z.looseObject;

export const envelope = loose({ code: z.union([z.string(), z.number()]).optional(), msg: z.string().nullish(), data: z.unknown() });

export const quoteRoute = loose({
  quoteId: z.string(),
  vendorName: z.string().optional(),
  toTokenAmount: z.string(),
  fromTokenAmount: z.string().optional(),
  priceImpactPercent: z.string().optional(),
  executionMode: z.string().optional(),
  approveTarget: z.string().optional(),
  router: z.string().optional(),
  isBest: z.boolean().optional(),
});
export const quoteData = z.array(quoteRoute);
export type QuoteRoute = z.infer<typeof quoteRoute>;

export const swapTx = loose({
  from: z.string().optional(),
  to: z.string(),
  data: z.string(),
  value: z.string().optional(),
  gas: z.string().optional(),
  gasPrice: z.string().optional(),
  minReceiveAmount: z.string(),
  slippagePercent: z.string().optional(),
  // documented as string[]; real responses hold ONE JSON-encoded string (DX_LOG finding, EXECUTION.md section 7.4)
  signatureData: z.array(z.string()).optional(),
});
export const swapData = loose({ tx: swapTx, executionMode: z.string().optional() });

export const simulateData = loose({
  status: z.string(),
  failReason: z.string().nullish(),
  balanceChanges: z.array(z.unknown()).optional(),
  allowanceChanges: z.array(z.unknown()).optional(),
});

export const gasPriceData = loose({
  evmLegacyGasPrice: loose({ lowGasPrice: z.string(), mediumGasPrice: z.string(), highGasPrice: z.string() }).nullish(),
  eip1559GasPrice: z.unknown().nullish(),
});

export const broadcastData = loose({ orderId: z.string().optional(), txHash: z.string().optional() });

/** RWA price rows. Field names beyond the address are unverified; kept loose. */
export const rwaPriceRow = loose({}).and(z.record(z.string(), z.unknown()));
export const rwaPriceData = z.array(z.record(z.string(), z.unknown()));

const str = z.string().nullish();

/** Shapes below come from live recordings on 2026-10-10 (fixtures/live-2026-10-10). Everything optional: bStocks return many nulls. */
export const rwaUnderlyingMarketData = loose({
  binanceChainId: str,
  tokenContractAddress: str,
  platformId: str,
  assetType: z.number().nullish(),
  statusInfo: loose({ openState: z.boolean().nullish(), marketStatus: str, reasonCode: str, reasonMsg: str, nextOpenTime: z.union([z.string(), z.number()]).nullish(), nextCloseTime: z.union([z.string(), z.number()]).nullish() }).nullish(),
  marketData: loose({ referencePrice: str, high52W: str, low52W: str, volumeShares24H: str, marketCap: str, dividendYield: str, peRatioTTM: str, pbRatio: str }).nullish(),
});

export const rwaUnderlyingProfileData = loose({
  binanceChainId: str,
  tokenContractAddress: str,
  platformId: str,
  underlyingTicker: str,
  underlyingFullName: str,
  assetType: z.number().nullish(),
  tokenToShareRatio: str,
  companyInfo: loose({ ceo: str, website: str, industry: str, description: str }).nullish(),
});

export const rwaTokenRow = loose({
  binanceChainId: str,
  tokenContractAddress: z.string(),
  platformId: str,
  assetType: z.number().nullish(),
  tokenName: str,
  tokenSymbol: str,
  tokenLogoUrl: str,
  decimals: str,
  underlyingTicker: str,
  underlyingName: str,
  tokenToShareRatio: str,
});
export const rwaTokensData = z.array(rwaTokenRow);

export const rwaSearchData = z.array(loose({
  ticker: str,
  companyName: str,
  assets: z.array(loose({ platformId: str, binanceChainId: str, tokenContractAddress: str, tokenSymbol: str, assetType: z.number().nullish() })).nullish(),
}));

export const rwaPlatformsData = z.array(loose({
  platformId: z.string(),
  tickerCount: z.number().nullish(),
  chainDistribution: z.array(loose({ binanceChainId: str, tokenCount: z.number().nullish() })).nullish(),
  website: str,
  logoUrl: str,
}));

/** Row: [open, high, low, close, volume, openTimeMs, trades]; numbers (strings tolerated). Order inferred from data (undocumented). */
export const candleRow = z.array(z.union([z.number(), z.string()])).min(6);
export const candlesData = z.array(candleRow);
export type Candle = z.infer<typeof candleRow>;

export interface EvmTx { from: string; to: string; value?: string; data: string }
export interface SwapResult { to: string; data: string; minReceiveAmount: string; approveTarget: string; executionMode: string }
