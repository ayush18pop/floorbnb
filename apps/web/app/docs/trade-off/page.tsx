import { ChartPanel } from "@/components/charts/panel";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Callout, DocPage, L } from "@/components/docs/doc-page";
import { proofData } from "@/lib/docs-data";
import { UpsidePanel } from "@/components/docs/proof-panels";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "The trade-off" };

const rows: [string, string][] = [
  ["About 58% of the gain in an up year. The vault kept about 42% of a three-stock basket's gain.", "Bad years cut to −8.6% where holding lost 17.2% (NVDA + TSLA + QQQ basket, typical bad year)."],
  ["NVDA: kept about 45% of the gain. QQQ: about 32%.", "NVDA: −9.9% where holding lost 36.5% (typical bad year). QQQ: −7.4% where holding lost 19.4%."],
  ["Trading costs on each rebalance. Live aggregator quotes on a $10k round trip were 0.7 to 6.6 basis points for QQQB, NVDAB, SPCXB and SPYB (Thursday, 2026-10-02), if the vault uses the aggregator route.", "A floor you chose, written in a public contract you can read."],
];

export default function Page() {
  const { upside, b } = proofData();
  return (
    <DocPage
      slug="trade-off"
      lead={<p>Protection is not free. {BRAND.name} charges for it in upside, not in fees we hide. We measured the trade.</p>}
      toc={[["give-get", "You give, you get"], ["upside", "Upside kept"], ["best", "Best window"], ["whipsaw", "TSLA whipsaw"], ["costs", "Costs"]]}
    >
      <h2 id="give-get" style={{ marginTop: 0 }}>You give, you get</h2>
      <div className="block tbl-wrap" style={{ border: "1px solid var(--grid)" }}>
        <table className="tbl">
          <caption className="sr-only">What you give up and what you get</caption>
          <thead><tr><th scope="col">You give</th><th scope="col">You get</th></tr></thead>
          <tbody>
            {rows.map(([g, t]) => <tr key={g}><td className="min-w-[240px]">{g}</td><td className="min-w-[240px]">{t}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="small">&ldquo;Typical bad year&rdquo; is the median of the windows where holding lost more than 10%. It is not the single worst year. Details on the <L href="/docs/backtest#bad-years">backtest page</L>. Past data, not a prediction.</p>

      <h2 id="upside">Upside kept</h2>
      <div className="block">
        <ChartPanel fig="FIG. 04 / UPSIDE KEPT IN UP YEARS" title="Basket, m = 4" caption="Backtest, past data, not a prediction." source="docs/data/gap_backtest.csv (NVDA+TSLA+QQQ, open_close, m = 4, capture_up)">
          <p className="stat-label">Share of the gain you keep</p>
          <p className="num-xl mt-2"><NumberTicker value={42} suffix="%" /></p>
          <div className="mt-4 flex h-4 w-full" style={{ background: "var(--surface-sunken)" }} role="img" aria-label="You keep about 42 percent of the gain and give up about 58 percent.">
            <div className="h-4" style={{ width: "42%", background: "var(--accent)" }} />
          </div>
          <div className="mt-2 flex justify-between mono text-[12px]" style={{ color: "var(--text-muted)" }}>
            <span>KEPT ~42%</span><span>GIVEN UP ~58%</span>
          </div>
        </ChartPanel>
      </div>
      <div className="block"><UpsidePanel upside={upside} /></div>

      <h2 id="best">Best window, same rule</h2>
      <p>Strong trends keep more of the gain than the typical 42%. NVDA, 8 Mar 2023 to 7 Mar 2024: holding <span className="mono-i">+{b.holdingPct.toFixed(1)}%</span>, with {BRAND.name} <span className="mono-i">+{b.vaultPct.toFixed(1)}%</span>. Past data, not a prediction.</p>

      <h2 id="whipsaw">Choppy stocks cost more</h2>
      <Callout label="Warning">
        <p>For TSLA, the vault&apos;s median year was −6.8%, where holding returned +22.4%. We tell you this before you deposit. Choppy price swings make the vault sell low and buy back high: whipsaw.</p>
      </Callout>

      <h2 id="costs">Costs</h2>
      <p>There is no protocol fee in v1. The cost is the upside you give up, plus small trading costs on each rebalance. 1 basis point (bp) = 0.01%. So 0.7 bps = 0.007%, and 100 bps = 1%. The full cost table is on the <L href="/docs/backtest#costs">backtest page</L>. The vault may route directly through PancakeSwap, where we measured about 49 bps for NVDAB and SPCXB at 100 USDT. Weekend and crash-time costs are not yet measured.</p>
      <p>Next: how we tested it, on <L href="/docs/backtest">Backtest</L>.</p>
    </DocPage>
  );
}
