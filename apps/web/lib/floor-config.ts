/**
 * One place for the floor slider and term choices: ranges, presets, defaults and the evidence flags.
 * The contract accepts floors 50% to 98% and terms 7 to 400 days (packages/sdk/src/constants.ts). The app only
 * encourages what we have evidence for. Evidence today (docs/data, CONTEXT.md): floors 80% to 95%, ONE-YEAR terms.
 * Update `tested*` and the `tested` flags from the MSTUDY2 report (research/m_study2/REPORT.md, RECOMMENDATION) and
 * use numbers from that report only.
 */
import { MAX_FLOOR_BPS, MAX_TERM_SECONDS, MIN_FLOOR_BPS, MIN_TERM_SECONDS } from "@floor/sdk";

export const DAY = 86_400;

export const FLOOR_CONFIG = {
  /** Slider range, in percent. Per the MSTUDY2 report (RECOMMENDATION): 80 to 95. The contract accepts 50 to 98. */
  min: 80,
  max: 95,
  step: 1,
  default: 90,
  /** Backtested range (report: 80% to 98%, all terms 1 week to 1 year). 96 to 98 is tested but not offered: mostly cash. */
  testedMin: 80,
  testedMax: 98,
  contractMin: MIN_FLOOR_BPS / 100,
  contractMax: MAX_FLOOR_BPS / 100,
  /** Quick-select chips. */
  presets: [80, 85, 90, 95] as readonly number[],
} as const;

export type TermPreset = { id: string; days: number; label: string; tested: boolean };

export const TERM_CONFIG = {
  presets: [
    { id: "1m", days: 30, label: "1 month", tested: true },
    { id: "3m", days: 90, label: "3 months", tested: true },
    { id: "6m", days: 180, label: "6 months", tested: true },
    { id: "1y", days: 365, label: "1 year", tested: true },
  ] as readonly TermPreset[],
  defaultDays: 365,
  /** Custom days: 30 to 365 (report: not under 30, not 366 to 400). The contract allows 7 to 400. */
  minDays: 30,
  maxDays: 365,
  contractMinDays: MIN_TERM_SECONDS / DAY,
  contractMaxDays: MAX_TERM_SECONDS / DAY,
} as const;

/**
 * Last day (unix day number) the factory's holiday table covers: 31 Dec 2027 (packages/contracts/holidays/nyse_2026_2027.json).
 * The factory's `holidayHorizonDay` is not in the SDK ABI, so this is a constant: update it when ops call setHolidayHorizon.
 * The factory rejects a term if (now + term + UNWIND_BUFFER) / 1 day is later than this day.
 */
export const HOLIDAY_HORIZON_DAY = Math.floor(Date.UTC(2027, 11, 31) / 86_400_000);
export const UNWIND_BUFFER_SECONDS = 14 * DAY;

export const termSecondsOf = (days: number) => days * DAY;

/** Integer floor percent on the slider, else the default. */
export function parseFloorPct(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return FLOOR_CONFIG.default;
  const r = Math.round(n);
  return r < FLOOR_CONFIG.min || r > FLOOR_CONFIG.max ? FLOOR_CONFIG.default : r;
}

/** Whole days in [minDays, maxDays], else the default (1 year). */
export function parseTermDays(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return TERM_CONFIG.defaultDays;
  const n = Number(v);
  if (!Number.isFinite(n)) return TERM_CONFIG.defaultDays;
  const r = Math.round(n);
  return r < TERM_CONFIG.minDays || r > TERM_CONFIG.maxDays ? TERM_CONFIG.defaultDays : r;
}

export const floorIsTested = (floorPct: number) => floorPct >= FLOOR_CONFIG.testedMin && floorPct <= FLOOR_CONFIG.testedMax;
export const termIsTested = (days: number) => days >= TERM_CONFIG.minDays && days <= TERM_CONFIG.maxDays;

export type Evidence = { backtested: boolean; note: string };

/** Honest label for a floor and term pair. */
export function evidenceFor(floorPct: number, days: number): Evidence {
  if (floorIsTested(floorPct) && termIsTested(days))
    return { backtested: true, note: `Backtested: floors ${FLOOR_CONFIG.testedMin}% to ${FLOOR_CONFIG.testedMax}%, terms 1 month to 1 year. A backtest on past prices does not predict the future.` };
  return { backtested: false, note: "Not backtested yet: this floor and term are outside what we have tested. The contract allows it, but we show no history for it." };
}

/** Share of the rise kept, in percent: about 4 x the cushion (report section 2: 38% to 42% at a 90% floor for every term). */
export const upsideKeptPct = (floorPct: number) => Math.min(100, 4 * (100 - floorPct));

/**
 * Historical rates from the MSTUDY2 report (research/m_study2/REPORT.md, T1 and T4), m = 4, daily rebalance, 6 bps one-way,
 * 38 indices, ETFs and large-cap stocks, 1928 to 2026, non-overlapping windows. Only these floor and term cells are published.
 *  breach   = final value ended more than 1 point of the deposit below the floor (T1).
 *  cashLock = value reached the floor during the term, so the vault held only USDT to the end (T4).
 */
export const REPORT_STATS: Record<number, Record<number, { breach: number; cashLock: number }>> = {
  80: { 30: { breach: 0.10, cashLock: 0.17 }, 90: { breach: 0.25, cashLock: 0.55 }, 180: { breach: 0.41, cashLock: 1.10 }, 365: { breach: 0.51, cashLock: 2.09 } },
  85: { 30: { breach: 0.10, cashLock: 0.17 }, 90: { breach: 0.25, cashLock: 0.55 }, 180: { breach: 0.35, cashLock: 1.19 }, 365: { breach: 0.51, cashLock: 2.47 } },
  90: { 30: { breach: 0.09, cashLock: 0.17 }, 90: { breach: 0.20, cashLock: 0.53 }, 180: { breach: 0.25, cashLock: 1.22 }, 365: { breach: 0.44, cashLock: 2.85 } },
  95: { 30: { breach: 0.05, cashLock: 0.16 }, 90: { breach: 0.14, cashLock: 0.66 }, 180: { breach: 0.19, cashLock: 1.63 }, 365: { breach: 0.25, cashLock: 4.36 } },
};
export const reportStats = (floorPct: number, days: number) => REPORT_STATS[floorPct]?.[days] ?? null;

/** "1 week", "3 months", "45 days". */
export function termLabel(days: number): string {
  const p = TERM_CONFIG.presets.find((x) => x.days === days);
  return p ? p.label : `${days} days`;
}

/** Plain words for what happens at the end of the term. `end` is a formatted date. */
export function termEndText(end: string): string {
  return `On ${end} the floor protection ends. The vault unwinds to USDT and you withdraw. You can leave earlier at any time with Close to USDT or Exit in kind; then the floor no longer applies to that position.`;
}
