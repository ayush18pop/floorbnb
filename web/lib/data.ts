import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Backtest data. CSVs are copies of /floor/docs/data/*.csv (kept in web/data so the
 * app builds on its own). Parsed at build time on the server; never edited by hand.
 */

export type PathPoint = {
  date: string;
  stock: number; // holding, 100 = deposit
  vault: number; // Floor vault value, 100 = deposit
  floor: number; // floor line, 90
  stockWeight: number; // % of vault value in stock
  usdtWeight: number;
};

function readCsv(name: string): Record<string, string>[] {
  const raw = readFileSync(path.join(process.cwd(), "data", name), "utf8").trim();
  const [head, ...rows] = raw.split(/\r?\n/);
  const cols = head.split(",");
  return rows.map((r) => {
    const v = r.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}

export type PathKey = "nvda_worst" | "nvda_best" | "basket_worst" | "basket_best";

export function loadPath(key: PathKey): PathPoint[] {
  return readCsv(`vault_path_${key}.csv`).map((r) => ({
    date: r.date,
    stock: Number(r.stock_index),
    vault: Number(r.vault_value),
    floor: Number(r.floor),
    stockWeight: Number(r.stock_weight_pct),
    usdtWeight: Number(r.usdt_weight_pct),
  }));
}

export type GapRow = {
  basket: string;
  mode: string;
  m: number;
  windows: number;
  breachPct: number;
  worstPct: number;
  medRet: number;
  medHold: number;
  captureUp: number;
  badYrVault: number;
  badYrHold: number;
  nBad: number;
  turnover: number;
};

export function loadGap(): GapRow[] {
  return readCsv("gap_backtest.csv").map((r) => ({
    basket: r.basket,
    mode: r.mode,
    m: Number(r.m),
    windows: Number(r.windows),
    breachPct: Number(r.breach_pct),
    worstPct: Number(r.worst_pct),
    medRet: Number(r.med_ret),
    medHold: Number(r.med_hold),
    captureUp: Number(r.capture_up),
    badYrVault: Number(r.bad_yr_vault),
    badYrHold: Number(r.bad_yr_hold),
    nBad: Number(r.n_bad),
    turnover: Number(r.turnover),
  }));
}

/** Pick one row. We use the open_close mode, the harder one in the README of the data. */
export function gapRow(rows: GapRow[], basket: string, m: number, mode = "open_close") {
  const r = rows.find((x) => x.basket === basket && x.m === m && x.mode === mode);
  if (!r) throw new Error(`missing gap row ${basket} m=${m} ${mode}`);
  return r;
}

export function pathSummary(p: PathPoint[]) {
  const last = p[p.length - 1];
  const lowStock = Math.min(...p.map((x) => x.stock));
  return {
    start: p[0].date,
    end: last.date,
    holdingPct: last.stock - 100,
    vaultPct: last.vault - 100,
    holdingLowPct: lowStock - 100,
  };
}
