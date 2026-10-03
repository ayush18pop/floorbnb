import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Stored research only. Nothing here is computed from a model: it reads docs/data and research/m_study/results. */

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const split = (l: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0] ?? '');
  return lines.slice(1).map((l) => {
    const c = split(l);
    return Object.fromEntries(head.map((h, i) => [h, c[i] ?? '']));
  });
}

const num = (s: string | undefined): number | null => (s === undefined || s === '' || Number.isNaN(Number(s)) ? null : Number(s));

export const BASKETS = ['NVDA', 'TSLA', 'QQQ', 'SPY', 'AAPL', 'NVDA+AAPL+QQQ', 'NVDA+TSLA+QQQ'] as const;
export type Basket = (typeof BASKETS)[number];
export const MODES = ['close_only', 'open_close'] as const;
export type Mode = (typeof MODES)[number];

const PATH_FILES: Partial<Record<Basket, { worst: string; best: string }>> = {
  NVDA: { worst: 'vault_path_nvda_worst.csv', best: 'vault_path_nvda_best.csv' },
  'NVDA+TSLA+QQQ': { worst: 'vault_path_basket_worst.csv', best: 'vault_path_basket_best.csv' },
};

export class DataError extends Error {}

function readCsv(root: string, rel: string): Record<string, string>[] {
  try {
    return parseCsv(readFileSync(join(root, rel), 'utf8'));
  } catch {
    throw new DataError(`stored data file missing: ${rel}`);
  }
}

function pathSummary(rows: Record<string, string>[]) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;
  const idx0 = Number(first.stock_index);
  const pct = (a: string | undefined, b: string | undefined) => (Number(a) / Number(b) - 1) * 100;
  const minHold = Math.min(...rows.map((r) => pct(r.stock_index, first.stock_index)));
  return {
    start: first.date,
    end: last.date,
    holdingReturnPct: round(pct(last.stock_index, first.stock_index)),
    holdingLowPct: round(minHold),
    vaultReturnPct: round(pct(last.vault_value, first.vault_value)),
    floorPct: round(pct(last.floor, first.vault_value)),
    days: rows.length,
    startIndex: idx0,
  };
}
const round = (x: number) => Math.round(x * 100) / 100;

export function readBacktest(root: string, basket: Basket, mode: Mode) {
  const gap = readCsv(root, 'docs/data/gap_backtest.csv').find((r) => r.basket === basket && r.mode === mode && Number(r.m) === 4);
  if (!gap) throw new DataError(`no stored m=4 row for ${basket} / ${mode}`);
  const stored = Object.fromEntries(Object.entries(gap).map(([k, v]) => [k, k === 'basket' || k === 'mode' ? v : num(v)]));
  const files = PATH_FILES[basket];
  const paths = files
    ? {
        worstWindow: pathSummary(readCsv(root, `docs/data/${files.worst}`)),
        bestWindow: pathSummary(readCsv(root, `docs/data/${files.best}`)),
      }
    : null;
  return { stored, paths };
}

/** Long-history study at m = 4 (research/m_study, 90% floor, 6 bps one way, daily rebalance at the close). */
export function readLongHistory(root: string) {
  const base = 'research/m_study/results';
  const t1 = readCsv(root, `${base}/T1_pooled_floor90_cost6_close.csv`)
    .filter((r) => Number(r.m) === 4)
    .map((r) => ({
      group: r.group,
      windows: num(r.n),
      breachAnyPct: num(r.breach_any),
      breachMaterialPct: num(r.breach_material),
      worstReturnPct: num(r.worst_ret),
      medianVaultReturnPct: num(r.median_ret),
      medianHoldReturnPct: num(r.median_hold),
      upsideKeptPct: num(r.capture_up),
    }));
  const t5 = readCsv(root, `${base}/T5_one_over_m_rule.csv`)
    .filter((r) => Number(r.m) === 4)
    .map((r) => ({
      windowHadOneDayDropOver25Pct: r.over === 'True',
      windows: num(r.n),
      materialBreaches: num(r.material_breaches),
      rate: num(r.rate),
    }));
  return {
    source: 'research/m_study/results (T1, T5); summary in research/m_study/REPORT.md',
    setup: 'm = 4, 90% floor, 6 bps one-way cost, daily rebalance at the close, non-overlapping one-year windows, 1928 to 2026 across 38 series',
    pooledByGroup: t1,
    oneOverMRule: t5,
    caveats: [
      'Daily closes only; no intraday or trading-halt gaps.',
      'Survivorship bias: delisted names are not included.',
      '"Material breach" means the vault ended more than 1 point below its floor; "any" means any shortfall.',
      'The series are the underlying stocks and indices, not bStocks. bStocks launched 2026-06-10 and have little history.',
    ],
  };
}
