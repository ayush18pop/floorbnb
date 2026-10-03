import { ChartPanel } from "@/components/charts/panel";
import { ValueChart } from "@/components/charts/value-chart";
import { DocPage, L } from "@/components/docs/doc-page";
import { proofData } from "@/lib/docs-data";
import { BadYearsPanel, BreachTable, CostsPanel, GapsPanel, UpsidePanel, WindowsStat } from "@/components/docs/proof-panels";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Backtest" };

export default function Page() {
  const { bad, upside, breach, ms, worst, w } = proofData();
  return (
    <DocPage
      slug="backtest"
      lead={<p>We ran the {BRAND.name} rule over every one-year window from 2018 to October 2026 on real daily prices. Backtest, past data, not a prediction.</p>}
      toc={[["method", "Method"], ["windows", "93 of 93"], ["worst-year", "Worst window"], ["bad-years", "Bad years"], ["upside", "Upside kept"], ["gaps", "Worst gaps"], ["multiplier", "Why 4×"], ["trading-window", "Trading-window check"], ["costs", "Costs"]]}
    >
      <h2 id="method" style={{ marginTop: 0 }}>Method and assumptions</h2>
      <p>We ran the {BRAND.name} rule over every one-year window from 2018 to October 2026 on real daily prices of NVDA, QQQ, SPY, TSLA and baskets of them. The floor held in 93 of 93 windows.</p>
      <p>We made the test harder on purpose: weekend price gaps hit in full ({BRAND.name} does not trade on weekends), stablecoins earn 0%, and trading costs are as measured in calm markets. The rule is explained on <L href="/docs/how-it-works">How it works</L>.</p>

      <h2 id="windows">One-year windows where the floor held</h2>
      <div className="block"><WindowsStat /></div>

      <h2 id="worst-year">The single worst window</h2>
      <p>NVDA&apos;s worst one-year window since 2018, 4 Jan 2022 to 4 Jan 2023. Holding: −{Math.abs(w.holdingPct).toFixed(1)}% (down 62.7% at the low). With {BRAND.name}: −{Math.abs(w.vaultPct).toFixed(1)}%. For the NVDA + TSLA + QQQ basket in the same window, holding lost 53.0% and the vault lost 9.9%.</p>
      <div className="block">
        <ChartPanel fig="FIG. 01 / BACKTEST" title="NVDA, 4 Jan 2022 to 4 Jan 2023" source="docs/data/vault_path_nvda_worst.csv. Floor 90%, m = 4, full weekend gaps, 0% stablecoin yield." note="NVDA's worst one-year window since 2018. Hold: −51.0% (−62.7% at the low). With Floor: −10.0%.">
          <ValueChart data={worst} height={360} label="NVDA 2022 backtest: holding the stock versus the Floor vault" />
        </ChartPanel>
      </div>

      <h2 id="bad-years">Bad years</h2>
      <p>These are medians of the windows where holding lost more than 10%. They are not the single worst year.</p>
      <div className="block"><BadYearsPanel bad={bad} /></div>

      <h2 id="upside">Upside kept</h2>
      <p>What you give up in up years is covered on <L href="/docs/trade-off">The trade-off</L>.</p>
      <div className="block"><UpsidePanel upside={upside} /></div>

      <h2 id="gaps">Worst one-night and weekend gaps</h2>
      <p>The floor holds unless prices gap more than 25% before the vault can rebalance. The biggest drops since 2018 were smaller.</p>
      <div className="block"><GapsPanel /></div>

      <h2 id="multiplier">Why we use 4×</h2>
      <div className="block"><BreachTable breach={breach} ms={ms} /></div>

      <h2 id="trading-window">Trading-window check</h2>
      <p>The contract trades only Monday to Friday, 15:30 to 19:30 UTC, not at the open and close (<L href="/docs/contracts#window">details</L>). We re-ran the backtest with one rebalance a day to match. At m = 4 the floor still held in 93 of 93 windows on every asset and basket. At m = 5 it broke in 3.2% of TSLA windows. So the public claim is &ldquo;at m = 4&rdquo;, not &ldquo;at m = 5 or below&rdquo;. The worst-window path charts above use open and close rebalancing, not the contract&apos;s window. An hourly re-run (about two years of 1-hour bars exist) would be more exact.</p>

      <h2 id="costs">What each rebalance costs</h2>
      <div className="block"><CostsPanel /></div>
      <p>Next: <L href="/docs/spot-only">Spot only</L>.</p>
    </DocPage>
  );
}
