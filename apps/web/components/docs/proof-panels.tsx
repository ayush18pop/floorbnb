import { ChartPanel } from "@/components/charts/panel";
import { PairedBars, SingleBars } from "@/components/charts/bars";
import { NumberTicker } from "@/components/ui/number-ticker";

export type BadYear = { name: string; sub: string; hold: number; vault: number };
export type Upside = { name: string; value: number; note?: string };
export type BreachRow = { name: string; cells: { m: number; held: number; windows: number }[] };

const GAPS = [
  { name: "NVDA", value: 19.3 },
  { name: "TSLA", value: 14.9 },
  { name: "AAPL", value: 13.0 },
  { name: "SPCX", value: 10.3, note: "76 DAYS OF HISTORY" },
  { name: "QQQ", value: 9.5 },
];

/** Aggregator quotes, 2026-10-02. SPYB is not enabled in Floor; kept as a historical comparison row. */
const COSTS = [
  { t: "QQQB", k1: "~0", k10: "0.7", k50: "no quote" },
  { t: "NVDAB", k1: "2.8", k10: "5.9", k50: "10.1" },
  { t: "SPCXB", k1: "3.1", k10: "6.0", k50: "7.7" },
  { t: "SPYB (not enabled in Floor)", k1: "1.1", k10: "6.6", k50: "13.6" },
];

export function WindowsStat() {
  return (
    <div className="border border-grid bg-surface p-4 md:p-6">
          <p className="stat-label">2018 to 2026 sample: one-year windows where the floor held</p>
          <p className="mono mt-4 leading-none tracking-tight" style={{ fontSize: "clamp(2.75rem, 2rem + 3vw, 3.75rem)", letterSpacing: "-0.04em", whiteSpace: "nowrap" }}>
            <NumberTicker value={93} /> <span className="text-muted" style={{ fontSize: "0.4em" }}>of</span> 93
          </p>
          <p className="stat-note mt-4">At m = 4 (also with one rebalance a day), on NVDA, QQQ, SPY, TSLA and baskets. This is the short sample. It had no 1987, 2000 or 2008. The 98-year test is on the Evidence page. Backtest on past prices. It does not predict the future.</p>
        </div>
  );
}

export function BadYearsPanel({ bad }: { bad: BadYear[] }) {
  return (
    <ChartPanel fig="FIG. 05 / TYPICAL BAD YEAR" title="Hold vs Floor" source="docs/data/gap_backtest.csv (open_close, m = 4, bad_yr_vault and bad_yr_hold)" note="Median one-year return in the windows where holding lost more than 10%.">
            <PairedBars rows={bad} max={40} />
          </ChartPanel>
  );
}

export function UpsidePanel({ upside }: { upside: Upside[] }) {
  return (
    <ChartPanel fig="FIG. 06 / UPSIDE KEPT AT 4X" title="Share of the gain in up years" source="docs/data/gap_backtest.csv (open_close, m = 4, capture_up)">
            <SingleBars rows={upside.map((u) => ({ ...u, kind: u.value < 0 ? "warn" : "vault", text: u.value < 0 ? `−${Math.abs(u.value)}%` : `${u.value}%` }))} max={100} />
            <p className="small mt-4">TSLA is shown on purpose. Choppy price swings made the vault give up the whole gain and lose a little: whipsaw.</p>
          </ChartPanel>
  );
}

export function GapsPanel() {
  return (
    <ChartPanel fig="FIG. 07 / BIGGEST ONE-NIGHT OR WEEKEND DROPS SINCE 2018" title="vs the 24% limit" source="docs/RESEARCH_RESULTS.md, via CONTEXT.md. SPCX has 76 days of history (listed June 2026).">
            <SingleBars rows={GAPS.map((g) => ({ ...g, kind: "ink" as const, text: `−${g.value.toFixed(1)}%` }))} max={30} refLine={{ at: 24, label: "ABOUT −24%: THE LIMIT AT m = 4 (1 ÷ m, MINUS COSTS)" }} />
          </ChartPanel>
  );
}

export function BreachTable({ breach, ms }: { breach: BreachRow[]; ms: number[] }) {
  return (
    <ChartPanel fig="FIG. 08 / WINDOWS WHERE THE FLOOR HELD, BY MULTIPLIER" title="Why we use 4x" source="docs/data/gap_backtest.csv (open_close). Held = 93 windows minus breach rate. 90% floor, full weekend gaps, 0% yield.">
            <p className="label mb-2 md:hidden">Scroll sideways to see every multiplier</p>
            <div className="tbl-wrap">
              <table className="tbl">
                <caption className="sr-only">Number of the 93 one-year windows in which the floor held, by asset and multiplier m</caption>
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    {ms.map((m) => <th scope="col" key={m} className="r" style={m === 4 ? { color: "var(--accent)" } : undefined}>m = {m}{m === 4 ? " (ours)" : ""}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {breach.map((r) => (
                    <tr key={r.name}>
                      <th scope="row" className="mono !text-ink !normal-case !tracking-normal" style={{ fontSize: 13, letterSpacing: 0 }}>{r.name}</th>
                      {r.cells.map((c) => (
                        <td key={c.m} className="r" style={{ background: c.m === 4 ? "var(--accent-soft)" : undefined, color: c.held < c.windows ? "var(--negative)" : undefined }}>
                          {c.held} / {c.windows}{c.held < c.windows ? " ▼" : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small mt-3">This is why we use 4x. At 6x, NVDA breached its floor in 11 windows. At 8x, NVDA in 19 and TSLA in 8. ▼ marks a miss.</p>
          </ChartPanel>
  );
}

export function CostsPanel() {
  return (
    <ChartPanel fig="FIG. 09 / WHAT EACH REBALANCE COSTS" title="Round trip, basis points" caption={null} source="Binance aggregator quotes, Thu 2026-10-02 12:06 UTC (US pre-market). Best case: the aggregator is built and fork-tested, not the live route." note="1 bp = 0.01%. The live route is direct PancakeSwap v3, measured on a fork at 100 USDT on 2026-10-02: NVDAB 49 bps, SPCXB 49 bps, QQQB 1 bp. Direct cost at $10k, weekend cost and crash-time cost are not measured.">
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <SingleBars rows={[
                  { name: "QQQB", value: 0.7, kind: "vault", text: "0.7 bps" },
                  { name: "NVDAB", value: 5.9, kind: "vault", text: "5.9 bps" },
                  { name: "SPCXB", value: 6.0, kind: "vault", text: "6.0 bps" },
                  { name: "SPYB (not enabled)", value: 6.6, kind: "vault", text: "6.6 bps" },
                ]} max={8} />
                <p className="label mt-4" style={{ textTransform: "none", letterSpacing: "0.02em" }}>$10k round trip, aggregator quotes (not the live route).</p>
              </div>
              <div className="tbl-wrap lg:col-span-7">
                <table className="tbl">
                  <caption className="sr-only">Round trip cost in basis points by token and trade size</caption>
                  <thead><tr><th scope="col">Token</th><th scope="col" className="r">$1k</th><th scope="col" className="r">$10k</th><th scope="col" className="r">$50k</th></tr></thead>
                  <tbody>
                    {COSTS.map((c) => (
                      <tr key={c.t}><th scope="row" className="mono !text-ink !normal-case !tracking-normal" style={{ fontSize: 13, letterSpacing: 0 }}>{c.t}</th><td className="r">{c.k1}</td><td className="r">{c.k10}</td><td className="r">{c.k50}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="small mt-3">TSLAB (46 bps at $10k) has borderline liquidity and is not in v1.</p>
              </div>
            </div>
          </ChartPanel>
  );
}
