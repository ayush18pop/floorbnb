import type { Address, Hex } from 'viem';

/** The slice of Bw3Client the keeper uses. Tests pass a fake. */
export interface AggClient {
  quote(p: { from: string; to: string; amount: string; userWalletAddress: string; vendor?: string }): Promise<
    { quoteId: string; toTokenAmount: string; executionMode?: string }[]
  >;
  swap(p: {
    from: string;
    to: string;
    amount: string;
    userWalletAddress: string;
    quoteId: string;
    slippagePercent: string;
  }): Promise<{ to: string; data: string; minReceiveAmount: string; approveTarget: string; executionMode: string }>;
}

/** The API's documented minimum order is 5 USD; the vault's minTrade (6 USDT at launch) normally sits above it. */
export const MIN_AGG_ORDER_USD = 5n * 10n ** 18n;

/**
 * Amount unit (verified live 2026-10-03, packages/bw3 scripts/amount-probe.ts): `amount` is the token's SMALLEST unit (wei for an 18-decimal
 * token). `10` is 10 wei (InsufficientLiquidity), `10.0` is rejected as non-integer. BSC USDT and every bStock have 18 decimals, so
 * `amountIn.toString()` is exactly right.
 */
export interface AggInput {
  vault: Address;
  /** true: USDT -> bStock (amountIn is USDT); false: bStock -> USDT (the quoted output is USDT) */
  buy?: boolean;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minOutAgg: bigint;
  /** `factory.routerOk(address)`; the keeper rejects any router the factory does not allow */
  routerOk: (router: Address) => Promise<{ ok: boolean; approveTarget: Address }>;
}

export class AggRejected extends Error {
  constructor(public reason: string) {
    super(`aggregator route rejected: ${reason}`);
  }
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** CONTRACTS.md section 8 / EXECUTION_PLAN 6.5. Throws AggRejected; the caller falls back to the direct route. */
export async function buildAggSwap(c: AggClient, i: AggInput): Promise<{ router: Address; data: Hex; minReceive: bigint }> {
  try {
    return await buildOnce(c, i);
  } catch (e) {
    // quote TTL is between 20 and 40 s (measured). If the quoteId expired between quote and swap, re-quote once.
    if (e instanceof Error && /not found or expired/i.test(e.message)) return buildOnce(c, i);
    throw e;
  }
}

async function buildOnce(c: AggClient, i: AggInput): Promise<{ router: Address; data: Hex; minReceive: bigint }> {
  const routes = await c.quote({ from: i.tokenIn, to: i.tokenOut, amount: i.amountIn.toString(), userWalletAddress: i.vault });
  const best = routes.find((r) => (r.executionMode ?? 'SWAP').toUpperCase() !== 'RFQ');
  if (!best) throw new AggRejected('no non-RFQ route');
  const quoted = BigInt(best.toTokenAmount);
  const usd = i.buy === false ? quoted : i.amountIn; // USDT has 18 decimals on BSC
  if (usd < MIN_AGG_ORDER_USD) throw new AggRejected(`order ~${usd} is under the API minimum of 5 USD`);
  if (quoted < i.minOutAgg) throw new AggRejected(`quote ${quoted} is under minOutAgg ${i.minOutAgg}`);

  // slippage such that minReceive >= minOutAgg, with 10% margin kept inside the allowed gap (percent, 2 decimals, rounded down)
  const gapBps = ((quoted - i.minOutAgg) * 10_000n) / quoted;
  const slipBps = (gapBps * 9n) / 10n;
  if (slipBps < 1n) throw new AggRejected('quote leaves no slippage room above minOutAgg');
  const slippagePercent = (Number(slipBps) / 100).toFixed(2);

  const sw = await c.swap({
    from: i.tokenIn,
    to: i.tokenOut,
    amount: i.amountIn.toString(),
    userWalletAddress: i.vault,
    quoteId: best.quoteId,
    slippagePercent,
  });
  if (sw.executionMode.toUpperCase() === 'RFQ') throw new AggRejected('executionMode RFQ');
  const ok = await i.routerOk(sw.to as Address);
  if (!ok.ok) throw new AggRejected(`tx.to ${sw.to} is not an allowed router`);
  if (!eq(ok.approveTarget, sw.approveTarget)) throw new AggRejected('approveTarget differs from factory allowlist');
  const minReceive = BigInt(sw.minReceiveAmount);
  if (minReceive < i.minOutAgg) throw new AggRejected(`minReceiveAmount ${minReceive} is under minOutAgg ${i.minOutAgg}`);
  return { router: sw.to as Address, data: sw.data as Hex, minReceive };
}
