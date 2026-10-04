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
  /** Slider range, in percent. Equal to the contract bounds. */
  min: MIN_FLOOR_BPS / 100,
  max: MAX_FLOOR_BPS / 100,
  step: 1,
  default: 90,
  /** Floors with a backtest behind them (one-year terms only). */
  testedMin: 80,
  testedMax: 95,
  /** Quick-select chips. */
  presets: [80, 85, 90, 95] as readonly number[],
} as const;

export type TermPreset = { id: string; days: number; label: string; tested: boolean };

export const TERM_CONFIG = {
  presets: [
    { id: "1w", days: 7, label: "1 week", tested: false },
    { id: "1m", days: 30, label: "1 month", tested: false },
    { id: "3m", days: 90, label: "3 months", tested: false },
    { id: "6m", days: 180, label: "6 months", tested: false },
    { id: "1y", days: 365, label: "1 year", tested: true },
  ] as readonly TermPreset[],
  defaultDays: 365,
  /** Custom days input range. The contract allows up to 400 days; the app stops at 365 (the longest term studied). */
  minDays: MIN_TERM_SECONDS / DAY,
  maxDays: 365,
  contractMaxDays: MAX_TERM_SECONDS / DAY,
} as const;

export const termSecondsOf = (days: number) => days * DAY;

/** Integer floor percent in range, else the default. */
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
export const termIsTested = (days: number) => TERM_CONFIG.presets.some((p) => p.days === days && p.tested);

export type Evidence = { backtested: boolean; note: string };

/** Honest label for a floor and term pair. Never claims numbers for untested pairs. */
export function evidenceFor(floorPct: number, days: number): Evidence {
  const f = floorIsTested(floorPct);
  const t = termIsTested(days);
  if (f && t) return { backtested: true, note: `Backtested: floors ${FLOOR_CONFIG.testedMin}% to ${FLOOR_CONFIG.testedMax}% over one-year terms. A backtest on past prices does not predict the future.` };
  if (f) return { backtested: false, note: "Not backtested yet: we only have one-year backtests. The floor works the same way, but we show no history for this term." };
  if (t) return { backtested: false, note: `Not backtested yet: our backtests cover floors ${FLOOR_CONFIG.testedMin}% to ${FLOOR_CONFIG.testedMax}%. The contract allows this floor, but we show no history for it.` };
  return { backtested: false, note: "Not backtested yet: this floor and term are outside what we have tested. The contract allows it, but we show no history for it." };
}

/** "1 week", "3 months", "45 days". */
export function termLabel(days: number): string {
  const p = TERM_CONFIG.presets.find((x) => x.days === days);
  return p ? p.label : `${days} days`;
}

/** Plain words for what happens at the end of the term. `end` is a formatted date. */
export function termEndText(end: string): string {
  return `On ${end} the floor protection ends. The vault unwinds to USDT and you withdraw. You can leave earlier at any time with Close to USDT or Exit in kind; then the floor no longer applies to that position.`;
}
