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

export interface EvmTx { from: string; to: string; value?: string; data: string }
export interface SwapResult { to: string; data: string; minReceiveAmount: string; approveTarget: string; executionMode: string }
