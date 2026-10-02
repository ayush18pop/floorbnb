import type { PathPoint } from "@/lib/data";
import { exposureTarget } from "@/lib/cppi";

/**
 * Turns a backtest path into the mock position fields the app would read from chain.
 * Deposit is a hypothetical 10,000 USDT (the CONTEXT.md example). Rebalance events are
 * derived with the contract's bands (sell at 1% of V, buy at 2% of V). Not on-chain data.
 */
export const MOCK_DEPOSIT = 10_000;

export type ReplayRow = {
  date: string;
  V: number;
  floor: number;
  cushion: number;
  exposure: number;
  target: number;
  stockPct: number;
  usdtPct: number;
  cashLock: boolean;
};

export type RebalanceEvent = {
  i: number;
  date: string;
  side: "buy" | "sell";
  /** USDT value traded. */
  value: number;
  V: number;
  exposureTarget: number;
};

export function replay(path: PathPoint[]) {
  const k = MOCK_DEPOSIT / 100;
  const rows: ReplayRow[] = path.map((p) => {
    const V = p.vault * k;
    const F = p.floor * k;
    return {
      date: p.date,
      V,
      floor: F,
      cushion: Math.max(V - F, 0),
      exposure: (p.stockWeight / 100) * V,
      target: exposureTarget(V, F),
      stockPct: p.stockWeight,
      usdtPct: p.usdtWeight,
      cashLock: p.stockWeight < 1,
    };
  });
  const events: RebalanceEvent[] = [];
  for (let i = 1; i < path.length; i++) {
    const before = rows[i - 1].exposure * (path[i].stock / path[i - 1].stock);
    const after = rows[i].exposure;
    const trade = after - before;
    const V = rows[i].V;
    const sell = trade < 0 && -trade >= 0.01 * V;
    const buy = trade > 0 && trade >= 0.02 * V;
    if (i === 0 || sell || buy)
      events.push({ i, date: path[i].date, side: trade > 0 ? "buy" : "sell", value: Math.abs(trade), V, exposureTarget: rows[i].target });
  }
  // first rebalance at deposit
  events.unshift({ i: 0, date: path[0].date, side: "buy", value: rows[0].exposure, V: rows[0].V, exposureTarget: rows[0].target });
  return { rows, events };
}
