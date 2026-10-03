import { BPS, M, WAD } from './constants';

/**
 * Exact bigint mirror of packages/contracts/src/libs/CPPIMath.sol (CONTRACTS.md section 5).
 * Rounding: F rounds up; V, E*, T_i, amounts round down.
 */

export function mulDiv(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error('mulDiv: division by zero');
  return (a * b) / d;
}

export function mulDivUp(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error('mulDiv: division by zero');
  const p = a * b;
  return p / d + (p % d === 0n ? 0n : 1n);
}

/** F = ceilDiv(D * floorBps, BPS). */
export function floorFor(deposit: bigint, floorBps: bigint | number): bigint {
  return mulDivUp(deposit, BigInt(floorBps), BPS);
}

/** USDT value of `bal` raw units at `price` (USDT per 1e18 raw, WAD). Rounds down. */
export function valueOf(bal: bigint, price: bigint): bigint {
  return mulDiv(bal, price, WAD);
}

/** C = V > F ? V - F : 0. */
export function cushion(V: bigint, F: bigint): bigint {
  return V > F ? V - F : 0n;
}

/** E* = min(floor(C * M / WAD), V). */
export function exposureTarget(C: bigint, V: bigint): bigint {
  const e = mulDiv(C, M, WAD);
  return e < V ? e : V;
}

/** T_i = floor(E* * w_i / BPS). */
export function assetTarget(estar: bigint, weightBps: bigint | number): bigint {
  return mulDiv(estar, BigInt(weightBps), BPS);
}

export function sellAmount(
  Ei: bigint,
  Ti: bigint,
  V: bigint,
  estar: bigint,
  sellBandBps: bigint,
  minTrade: bigint,
  maxTradeValue: bigint,
): bigint {
  let amount: bigint;
  if (estar === 0n) {
    if (Ei < minTrade) return 0n;
    amount = Ei;
  } else {
    if (Ei <= Ti) return 0n;
    amount = Ei - Ti;
    if (amount * BPS < sellBandBps * V) return 0n;
    if (amount < minTrade) return 0n;
  }
  return amount > maxTradeValue ? maxTradeValue : amount;
}

export function buyAmount(
  Ei: bigint,
  Ti: bigint,
  V: bigint,
  usdtBal: bigint,
  buyBandBps: bigint,
  minTrade: bigint,
  maxTradeValue: bigint,
): bigint {
  if (Ti <= Ei) return 0n;
  const gap = Ti - Ei;
  if (gap * BPS < buyBandBps * V) return 0n;
  let amount = gap < usdtBal ? gap : usdtBal;
  if (amount < minTrade) return 0n;
  if (amount > maxTradeValue) amount = maxTradeValue;
  return amount;
}

/** Sell input in raw stock units: floor(amountValue * WAD / price), capped at `bal`. */
export function sellAmountIn(amountValue: bigint, price: bigint, bal: bigint): bigint {
  const a = mulDiv(amountValue, WAD, price);
  return a > bal ? bal : a;
}

/** Minimum output, rounded down. buy: stock units out. sell: USDT out. */
export function minOut(amountIn: bigint, price: bigint, tolBps: bigint | number, buy: boolean): bigint {
  const fair = buy ? mulDiv(amountIn, WAD, price) : mulDiv(amountIn, price, WAD);
  return mulDiv(fair, BPS - BigInt(tolBps), BPS);
}

/** The keeper's amountIn must lie in [computed / 2, computed]. */
export function amountInOk(amountIn: bigint, computed: bigint): boolean {
  return amountIn <= computed && amountIn >= computed / 2n;
}

export interface CppiState {
  V: bigint;
  C: bigint;
  /** E*, total exposure target. */
  estar: bigint;
}

/** One-shot V, C, E* from balances and prices. `bals[i]` and `prices[i]` per asset (raw 18-dec, WAD price). */
export function computeState(usdtBal: bigint, bals: readonly bigint[], prices: readonly bigint[], F: bigint): CppiState {
  if (bals.length !== prices.length) throw new Error('bals and prices length mismatch');
  let V = usdtBal;
  bals.forEach((b, i) => {
    V += valueOf(b, prices[i] as bigint);
  });
  const C = cushion(V, F);
  return { V, C, estar: exposureTarget(C, V) };
}

/** Floating point version for charts only (m = 4 unless given). Never use for on-chain amounts. */
export function cppiFloat(V: number, F: number, m = 4) {
  const C = Math.max(V - F, 0);
  const E = Math.min(m * C, V);
  return { C, E, cash: V - E };
}
