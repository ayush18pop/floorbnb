/**
 * Live backtest of the Floor vault for the user's own choices (floor, term, basket), in the browser.
 * A TypeScript port of research/m_study/sim.py (itself a mirror of docs/CONTRACTS.md section 5), using the SDK's
 * float CPPI (E* = min(m * (V - F), V)). Daily closes only, so every overnight and weekend gap is inside the day's return.
 *
 * Simplifications versus the real vault (also stated in the chart caption):
 *  - windows start every 21 trading days (monthly) from 2018-01-02, as in the study; the worst window of a term is the lowest held-stock return among them;
 *  - one trade per day at the close; the vault trades only inside its window on weekdays;
 *  - a multi-stock basket is treated as one asset rebalanced daily to equal weight (as in the study);
 *  - minTrade is 0.2% of the deposit (20 USDT on 10,000), bands 1% (sell) and 2% (buy), cost 6 bps per trade, 0% on USDT;
 *  - the token is assumed to track its stock (no token-vs-stock gap, no pool depth limits);
 *  - the final unwind to USDT is charged 6 bps on the stock still held.
 */
import { cppi } from "@floor/sdk";
import closes from "@/data/closes.json";
import type { PathPoint } from "@/lib/data";

export const M = 4;
export const SELL_BAND = 0.01;
export const BUY_BAND = 0.02;
export const MIN_TRADE = 0.002;
export const COST = 0.0006;
/** Trading days per calendar day, as 252 / 365. */
export const stepsForDays = (days: number) => Math.max(1, Math.round((days * 252) / 365));

export type Mode = "worst" | "median" | "best";
export type Series = { dates: string[]; closes: Record<string, number[]>; from: string; to: string };
export const SERIES: Series = closes as unknown as Series;
/** Symbols with price history. SPCXB listed in June 2026 (about 76 days) and has no proxy in the repo, so it is not simulated. */
export const HISTORY_SYMBOLS = Object.keys(SERIES.closes);

/** Daily gross returns of an equal-weight basket (rebalanced daily). r[t] is the move from dates[t] to dates[t+1]. */
export function basketReturns(symbols: string[], s: Series = SERIES): number[] {
  const n = s.dates.length;
  const out: number[] = [];
  for (let t = 0; t < n - 1; t++) {
    let sum = 0;
    for (const sym of symbols) sum += s.closes[sym][t + 1] / s.closes[sym][t];
    out.push(sum / symbols.length);
  }
  return out;
}

export type SimOut = { value: number[]; stock: number[]; stockWeight: number[]; vault: number; hold: number; lockedDays: number };

/** One vault run over daily returns r (length = steps). Deposit = 1, floor fraction f. Records the path when `record`. */
export function simulate(r: ArrayLike<number>, f: number, record = false, cost = COST): SimOut {
  let E = 0, S = 1, V = 1, locked = 0, hold = 1;
  const value = [1], stock = [1], weight: number[] = [];
  const rebalance = (first: boolean) => {
    const dead = V <= f + 1e-12;
    let tgt = dead ? 0 : cppi.cppiFloat(V, f, M).E;
    tgt = Math.min(tgt, V);
    const d = tgt - E;
    let trade = 0;
    if (first) trade = d;
    else if (d <= -SELL_BAND * V || d >= BUY_BAND * V) trade = Math.abs(d) < MIN_TRADE ? 0 : d;
    if (dead && E > 1e-9) trade = -E;
    if (trade > 0) trade = Math.min(trade, S); else trade = Math.max(trade, -E);
    E += trade > 0 ? trade * (1 - cost) : trade;
    S += trade > 0 ? -trade : -trade * (1 - cost);
  };
  rebalance(true); V = E + S;
  weight.push(V > 0 ? (100 * E) / V : 0);
  for (let t = 0; t < r.length; t++) {
    E *= r[t]; V = E + S; hold *= r[t];
    if (t < r.length - 1) { rebalance(false); V = E + S; }
    if (V <= f + 1e-12) locked++;
    if (record) { value.push(V * 100); stock.push(hold * 100); weight.push(V > 0 ? (100 * E) / V : 0); }
  }
  const final = V - E * cost;
  if (record) { value[0] = 100; stock[0] = 100; value[value.length - 1] = final * 100; }
  return { value, stock, stockWeight: weight, vault: final, hold, lockedDays: locked };
}

export type WindowStats = { start: number; hold: number; vault: number };

/** Windows start every min(21, steps) trading days from the first close (2018-01-02), the grid the study used. */
export const strideFor = (steps: number) => Math.min(21, steps);

/** Hold and vault return for each window of `steps` days on that grid. */
export function allWindows(r: number[], steps: number, f: number): WindowStats[] {
  const out: WindowStats[] = [];
  for (let i = 0; i + steps <= r.length; i += strideFor(steps)) {
    const w = r.slice(i, i + steps);
    const s = simulate(w, f);
    out.push({ start: i, hold: s.hold, vault: s.vault });
  }
  return out;
}

/** Pick the window by held-stock return (as the study's worst-window chart does). */
export function pickWindow(ws: WindowStats[], mode: Mode): WindowStats {
  const sorted = [...ws].sort((a, b) => a.hold - b.hold || a.start - b.start);
  if (mode === "worst") return sorted[0];
  if (mode === "best") return sorted[sorted.length - 1];
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export type ChartRun = {
  symbols: string[];
  floorPct: number;
  termDays: number;
  steps: number;
  mode: Mode;
  startDate: string;
  endDate: string;
  points: PathPoint[];
  holdPct: number;
  vaultPct: number;
  lockedDays: number;
  windows: number;
  /** Median of (vault gain / hold gain) over windows with a gain; null if there are none. */
  upsideKept: number | null;
  /** Share of windows ending below the floor, percent. */
  belowFloorPct: number;
  title: string;
  /** Assets asked for but without price history. */
  missing: string[];
};

const NAME: Record<string, string> = { NVDAB: "NVDA", QQQB: "QQQ", SPYB: "SPY", /* history only; SPYB is not enabled in Floor and is not selectable */ SPCXB: "SPCX" };

/** Everything the chart and its caption show, from one computation. Returns null if no selected asset has history. */
export function buildChart(i: { assets: string[]; floorPct: number; termDays: number; mode: Mode }, s: Series = SERIES): ChartRun | null {
  const symbols = i.assets.filter((a) => a in s.closes);
  const missing = i.assets.filter((a) => !(a in s.closes));
  if (!symbols.length) return null;
  const f = i.floorPct / 100;
  const steps = stepsForDays(i.termDays);
  const r = basketReturns(symbols, s);
  const ws = allWindows(r, steps, f);
  if (!ws.length) return null;
  const pick = pickWindow(ws, i.mode);
  const run = simulate(r.slice(pick.start, pick.start + steps), f, true);
  const points: PathPoint[] = run.value.map((v, k) => ({
    date: s.dates[pick.start + k], stock: run.stock[k], vault: v, floor: i.floorPct, stockWeight: run.stockWeight[k], usdtWeight: 100 - run.stockWeight[k],
  }));
  const gains = ws.filter((w) => w.hold > 1).map((w) => (w.vault - 1) / (w.hold - 1)).sort((a, b) => a - b);
  const label = symbols.map((x) => NAME[x] ?? x).join(" + ");
  return {
    symbols, floorPct: i.floorPct, termDays: i.termDays, steps, mode: i.mode,
    startDate: points[0].date, endDate: points[points.length - 1].date, points,
    holdPct: (run.hold - 1) * 100, vaultPct: (run.vault - 1) * 100, lockedDays: run.lockedDays, windows: ws.length,
    upsideKept: gains.length ? gains[Math.floor((gains.length - 1) / 2)] : null,
    belowFloorPct: (100 * ws.filter((w) => w.vault < f - 1e-9).length) / ws.length,
    title: `What a ${i.floorPct}% floor did · ${label} · ${i.mode} ${termWord(i.termDays)} window`,
    missing,
  };
}

export function termWord(days: number): string {
  if (days === 7) return "1-week";
  if (days === 30) return "1-month";
  if (days === 90) return "3-month";
  if (days === 180) return "6-month";
  if (days === 365) return "1-year";
  return `${days}-day`;
}
