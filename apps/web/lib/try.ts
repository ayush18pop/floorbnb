/**
 * Pure logic for the public /try simulator. No new numbers: every figure comes from lib/backtest.ts (the live backtest on
 * data/closes.json). Episodes are fixed calendar windows (peak to trough, or the calendar year) inside the data range.
 */
import { SERIES, basketReturns, buildChart, simulate, stepsForDays, type ChartRun, type Series } from "@/lib/backtest";
import type { PathPoint } from "@/lib/data";

export type TryAsset = { id: string; label: string; symbols: string[] };
/** SPCXB has no price history, so it is not here. SPYB has history in data/closes.json but is not enabled in Floor, so it is not offered. */
export const TRY_ASSETS: readonly TryAsset[] = [
  { id: "nvda", label: "NVDA", symbols: ["NVDAB"] },
  { id: "qqq", label: "QQQ", symbols: ["QQQB"] },
  { id: "basket", label: "NVDA + QQQ", symbols: ["NVDAB", "QQQB"] },
];

export type Episode = { id: string; label: string; from: string; to: string; blurb: string };
/** Windows are snapped to the trading days on or after `from` and on or before `to`. */
export const EPISODES: readonly Episode[] = [
  { id: "covid", label: "COVID crash", from: "2020-02-19", to: "2020-03-23", blurb: "19 Feb to 23 Mar 2020" },
  { id: "bear22", label: "2022 bear market", from: "2022-01-03", to: "2022-12-30", blurb: "3 Jan to 30 Dec 2022" },
  { id: "vol24", label: "Aug 2024 vol spike", from: "2024-07-10", to: "2024-08-07", blurb: "10 Jul to 7 Aug 2024" },
  { id: "tariff25", label: "Apr 2025 tariff drop", from: "2025-02-19", to: "2025-04-08", blurb: "19 Feb to 8 Apr 2025" },
];

export type TryRun = {
  mode: "worst" | "episode";
  title: string;
  startDate: string;
  endDate: string;
  points: PathPoint[];
  holdPct: number;
  vaultPct: number;
  lockedDays: number;
};

/** Index range [i, j] of trading days: first date >= from, last date <= to. null if outside the data. */
export function episodeIndexes(ep: Pick<Episode, "from" | "to">, s: Series = SERIES): [number, number] | null {
  const i = s.dates.findIndex((d) => d >= ep.from);
  let j = -1;
  for (let k = s.dates.length - 1; k >= 0; k--) if (s.dates[k] <= ep.to) { j = k; break; }
  if (i < 0 || j <= i) return null;
  return [i, j];
}

/** Hold vs vault over exactly the episode's dates, same simulate() as the live backtest. */
export function runEpisode(symbols: string[], floorPct: number, ep: Episode, s: Series = SERIES): TryRun | null {
  const ix = episodeIndexes(ep, s);
  if (!ix) return null;
  const [i, j] = ix;
  const r = basketReturns(symbols, s).slice(i, j);
  const run = simulate(r, floorPct / 100, true);
  const points: PathPoint[] = run.value.map((v, k) => ({
    date: s.dates[i + k], stock: run.stock[k], vault: v, floor: floorPct, stockWeight: run.stockWeight[k], usdtWeight: 100 - run.stockWeight[k],
  }));
  return { mode: "episode", title: ep.label, startDate: s.dates[i], endDate: s.dates[j], points, holdPct: (run.hold - 1) * 100, vaultPct: (run.vault - 1) * 100, lockedDays: run.lockedDays };
}

export function runWorst(symbols: string[], floorPct: number, termDays: number): TryRun | null {
  const c: ChartRun | null = buildChart({ assets: symbols, floorPct, termDays, mode: "worst" });
  if (!c) return null;
  return { mode: "worst", title: c.title, startDate: c.startDate, endDate: c.endDate, points: c.points, holdPct: c.holdPct, vaultPct: c.vaultPct, lockedDays: c.lockedDays };
}

export { stepsForDays };
