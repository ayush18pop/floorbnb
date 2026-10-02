import "server-only";
import { gapRow, loadGap, loadPath, pathSummary } from "@/lib/data";
import type { BadYear, BreachRow, Upside } from "@/components/docs/proof-panels";

export function proofData() {
  const gap = loadGap();
  const bad: BadYear[] = [
    ["NVDA", "NVDA"],
    ["NVDA+TSLA+QQQ", "NVDA + TSLA + QQQ BASKET"],
    ["QQQ", "QQQ"],
    ["TSLA", "TSLA"],
  ].map(([k, name]) => {
    const r = gapRow(gap, k, 4);
    return { name, sub: `${r.nBad} OF ${r.windows} WINDOWS`, hold: r.badYrHold, vault: r.badYrVault };
  });
  const upside: Upside[] = [
    { name: "NVDA", key: "NVDA" },
    { name: "NVDA + TSLA + QQQ BASKET", key: "NVDA+TSLA+QQQ" },
    { name: "QQQ", key: "QQQ" },
    { name: "TSLA (WHIPSAW)", key: "TSLA" },
  ].map(({ name, key }) => ({ name, value: Math.round(gapRow(gap, key, 4).captureUp) }));
  const ms = [2, 3, 4, 5, 6, 8];
  const breach: BreachRow[] = ["NVDA", "TSLA", "QQQ", "SPY", "AAPL", "NVDA+TSLA+QQQ", "NVDA+AAPL+QQQ"].map((k) => ({
    name: k.replaceAll("+", " + "),
    cells: ms.map((m) => {
      const r = gapRow(gap, k, m);
      return { m, windows: r.windows, held: r.windows - Math.round((r.windows * r.breachPct) / 100) };
    }),
  }));
  const worst = loadPath("nvda_worst");
  const best = loadPath("nvda_best");
  return { bad, upside, breach, ms, worst, best, w: pathSummary(worst), b: pathSummary(best) };
}
