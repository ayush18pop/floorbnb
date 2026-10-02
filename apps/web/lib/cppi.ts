/**
 * CPPI maths, mirroring docs/CONTRACTS.md section 5 (fixed point there, floats here).
 * Display only. The contract is the authority.
 *   F  = ceil(D * floorBps / 10000)
 *   C  = max(V - F, 0)
 *   E* = min(m * C, V)
 */
export const M = 4;
export const BPS = 10_000;

export const FLOOR_BPS_MIN = 5000;
export const FLOOR_BPS_MAX = 9800;
export const TERM_SECONDS = 365 * 24 * 60 * 60;

export function floorFor(deposit: number, floorBps: number) {
  return Math.ceil((deposit * floorBps) / BPS);
}
export function cushion(v: number, floor: number) {
  return v > floor ? v - floor : 0;
}
export function exposureTarget(v: number, floor: number, m = M) {
  return Math.min(m * cushion(v, floor), v);
}

/** Largest single fall in the stock leg that keeps V >= F, given current exposure. */
export function maxGap(v: number, floor: number, m = M) {
  const e = exposureTarget(v, floor, m);
  if (e === 0) return Infinity;
  return cushion(v, floor) / e;
}

export type Step = {
  id: string;
  event: string;
  /** Holdings after the price move, before the vault trades. */
  stock: number;
  usdt: number;
  v: number;
  cushion: number;
  target: number;
  /** Positive = buy stock with USDT, negative = sell stock for USDT. */
  trade: number;
};

/**
 * Worked example in the style of CONTRACTS.md section 5, one asset at 100% weight:
 * deposit, stock -10%, -10% again, then a gap of -25% before any trade; and a +10% branch from step 0.
 * Bands and trading costs are ignored (the contract adds both). Values are before each trade.
 */
export function worked(deposit: number, floorBps: number): Step[] {
  const F = floorFor(deposit, floorBps);
  const run = (id: string, event: string, from: { stock: number; usdt: number }, g: number) => {
    const stock = from.stock * (1 + g);
    const v = stock + from.usdt;
    const c = cushion(v, F);
    const target = exposureTarget(v, F);
    const trade = target - stock;
    const step: Step = { id, event, stock, usdt: from.usdt, v, cushion: c, target, trade };
    return { step, next: { stock: target, usdt: from.usdt - trade } };
  };
  const s0 = run("0", "Deposit, first rebalance", { stock: 0, usdt: deposit }, 0);
  const s1 = run("1", "Stock falls 10%", s0.next, -0.1);
  const s2 = run("2", "Falls 10% again", s1.next, -0.1);
  const s3 = run("3", "Gap of 25% before any trade", s2.next, -0.25);
  const up = run("0b", "From step 0, stock rises 10%", s0.next, 0.1);
  return [s0.step, s1.step, s2.step, s3.step, up.step];
}
