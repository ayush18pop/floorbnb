import { ChartPanel } from "@/components/charts/panel";
import { SingleBars } from "@/components/charts/bars";
import { Callout, DocPage, L } from "@/components/docs/doc-page";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Evidence" };

/**
 * Every number on this page comes from research/m_study/REPORT.md (agent MSTUDY, 2026-10-03),
 * sections 4 to 7 and 9, and is mirrored in CONTEXT.md ("Long-history study").
 * One-year (252 trading days) periods, 90% floor, m = 4 unless stated, daily rebalance at the close,
 * 6 bps one-way cost on every trade, full overnight and weekend gaps, 0% on stablecoins.
 * Non-overlapping windows. "Material breach" = ended more than 1 point below the floor.
 */
const BY_M: { m: number; any: string; material: string; mat: number; kept: number; bad: string; locked: string }[] = [
  { m: 2, any: "0.32%", material: "0.00%", mat: 0, kept: 22, bad: "−5.2%", locked: "0.1%" },
  { m: 3, any: "1.45%", material: "0.06%", mat: 0.06, kept: 34, bad: "−7.4%", locked: "0.7%" },
  { m: 4, any: "2.85%", material: "0.44%", mat: 0.44, kept: 42, bad: "−8.8%", locked: "1.2%" },
  { m: 5, any: "6.33%", material: "1.14%", mat: 1.14, kept: 47, bad: "−9.5%", locked: "2.7%" },
  { m: 6, any: "9.55%", material: "1.52%", mat: 1.52, kept: 51, bad: "−9.8%", locked: "4.7%" },
  { m: 8, any: "15.88%", material: "2.02%", mat: 2.02, kept: 53, bad: "−10.0%", locked: "8.6%" },
];

const GROUPS = [
  ["US index and ETF (10 series)", "390", "0%", "1.03%", "42%"],
  ["International index (5 series)", "207", "0.48%", "0.48%", "41%"],
  ["Single stocks (23 series)", "984", "0.61%", "4.07%", "42%"],
];

const DROPS = [
  ["AIG", "15 Sep 2008", "−60.8%"],
  ["Apple", "29 Sep 2000", "−51.9%"],
  ["Netflix", "15 Oct 2004", "−40.9%"],
  ["Citigroup", "2009", "−39.0%"],
  ["AMD", "1992", "−37.9%"],
  ["NVIDIA", "6 Aug 2004", "−35.2%"],
  ["Hang Seng index", "26 Oct 1987", "−33.3%"],
  ["Microsoft", "19 Oct 1987", "−30.1%"],
  ["S&P 500 (worst index day)", "19 Oct 1987", "−20.5%"],
];

const DIAL: [string, string, string, string, string][] = [
  ["Lose at most 5% (floor 95%)", "~11%, 0.0%", "~18%, 0.1%", "~23%, 0.3%", "~27%, 0.6%"],
  ["Lose at most 10% (floor 90%)", "~22%, 0.0%", "~34%, 0.1%", "~42%, 0.4%", "~47%, 1.1%"],
  ["Lose at most 15% (floor 85%)", "~33%, 0.0%", "~48%, 0.1%", "~59%, 0.5%", "~64%, 1.4%"],
  ["Lose at most 20% (floor 80%)", "~43%, 0.0%", "~62%, 0.1%", "~72%, 0.5%", "~76%, 1.1%"],
];

export default function Page() {
  return (
    <DocPage
      slug="evidence"
      lead={<p>How we tested the multiplier. We ran the {BRAND.name} rule on 98 years of prices. It mostly worked. Here is where it did not.</p>}
      toc={[["summary", "In short"], ["method", "Method"], ["results", "Results by multiplier"], ["one-over-m", "The one-over-m rule"], ["crashes", "Where it breaks"], ["groups", "Index or single stock"], ["tradeoff", "What you give up"], ["not-built", "What we did not build"], ["limits", "Limits of the test"]]}
    >
      <h2 id="summary" style={{ marginTop: 0 }}>In short</h2>
      <div className="block grid gap-px border border-grid bg-grid md:grid-cols-3">
        {[
          ["1,581", "one-year periods tested", "38 stock, ETF and index histories, 1928 to 2026"],
          ["0.44%", "ended clearly below the floor", "7 periods, 95% range 0.11% to 0.91%"],
          ["0 of 98", "S&P 500 years below the floor", "Worst final value −9.6% on a 90% floor"],
        ].map(([n, l, s]) => (
          <div key={l} className="bg-surface p-4 md:p-6">
            <p className="stat-label">{l}</p>
            <p className="mono mt-3 leading-none" style={{ fontSize: "clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)", letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{n}</p>
            <p className="stat-note mt-3">{s}</p>
          </div>
        ))}
      </div>
      <p>At m = 4 the vault ended more than 1 point below its 90% floor in 7 of 1,581 periods. All 7 came from the 29 periods that contained a one-day drop bigger than 25%. In the 1,552 periods without such a drop, none broke the floor. So the floor holds against a single-day drop smaller than about 24%. It does not hold against a bigger one, and single stocks have had bigger ones.</p>
      <Callout label="What this does not say">
        <p>The floor is not always held. The longer test replaces the earlier &ldquo;93 of 93 windows&rdquo; headline, which is true only for 2018 to 2026 (<L href="/docs/backtest">Backtest</L>). Backtests use past prices and do not predict the future.</p>
      </Callout>

      <h2 id="method">Method</h2>
      <ul className="list">
        <li><strong>Data.</strong> Daily closing prices from Yahoo Finance, adjusted for splits and dividends: S&amp;P 500 from 1927, Nasdaq, Dow, Russell 2000, Nikkei, FTSE, DAX, Hang Seng and KOSPI indices, SPY, QQQ and 23 single stocks, including crash-heavy names such as AIG, Citigroup, Bank of America, Ford and GE. Four equal-weight baskets, including the NVDA + TSLA + QQQ basket.</li>
        <li><strong>The rule.</strong> Floor 90% of the deposit, one-year term, stock held = min(4 × (value − floor), value), the rest in stablecoin at 0%. Sells and buys follow the contract&apos;s bands. Once value reaches the floor the vault goes to cash (cash lock).</li>
        <li><strong>Costs and gaps.</strong> 6 bps one-way on every trade (about 12 bps round trip). That is above the aggregator quotes we measured and below the direct PancakeSwap route we measured (about 49 bps for NVDAB at 100 USDT). Close-to-close returns, so every overnight and weekend gap hits in full.</li>
        <li><strong>Windows.</strong> One-year periods that do not overlap, starting at each history&apos;s first day. This avoids counting the same crash many times. We also checked overlapping windows and a block bootstrap of 6,000 synthetic years: same picture.</li>
        <li><strong>Counting a breach.</strong> &ldquo;Any shortfall&rdquo; means the final value is below the floor by any amount. Costs alone cause some. &ldquo;Clear breach&rdquo; means more than 1 point below, for example under 89% on a 90% floor. We lead with the clear breach, and show both.</li>
      </ul>

      <h2 id="results">Results by multiplier</h2>
      <p>Going from m = 4 to m = 6 buys 9 more points of upside and raises the clear-breach rate by about 3.5 times. That is why we keep m = 4.</p>
      <div className="block">
        <ChartPanel fig="FIG. 11 / CLEAR BREACH BY MULTIPLIER" title="Share of periods, 90% floor" source="research/m_study/REPORT.md section 4 (table T1). 1,581 non-overlapping one-year periods, 1928 to 2026, 6 bps one-way, daily at the close." caption="Backtest, past data, not a prediction.">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="label mb-4">Ended more than 1 point below the floor</p>
              <SingleBars max={2.5} rows={BY_M.map((r) => ({ name: `m = ${r.m}${r.m === 4 ? " (ours)" : ""}`, value: r.mat, kind: r.m === 4 ? "vault" : "ink", text: r.material }))} />
            </div>
            <div>
              <p className="label mb-4">Share of the gain kept, in up years</p>
              <SingleBars max={60} rows={BY_M.map((r) => ({ name: `m = ${r.m}${r.m === 4 ? " (ours)" : ""}`, value: r.kept, kind: r.m === 4 ? "vault" : "hold", text: `~${r.kept}%` }))} />
            </div>
          </div>
        </ChartPanel>
      </div>
      <div className="block">
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">Results by multiplier m, pooled equities, 90% floor</caption>
            <thead>
              <tr><th scope="col">m</th><th scope="col" className="r">Any shortfall</th><th scope="col" className="r">Clear breach</th><th scope="col" className="r">Gain kept</th><th scope="col" className="r">Bad-year result</th><th scope="col" className="r">Ended in cash</th></tr>
            </thead>
            <tbody>
              {BY_M.map((r) => (
                <tr key={r.m}>
                  <th scope="row" className="mono !text-ink">{r.m}{r.m === 4 ? " (ours)" : ""}</th>
                  <td className="r" style={r.m === 4 ? { background: "var(--accent-soft)" } : undefined}>{r.any}</td>
                  <td className="r" style={r.m === 4 ? { background: "var(--accent-soft)" } : undefined}>{r.material}</td>
                  <td className="r" style={r.m === 4 ? { background: "var(--accent-soft)" } : undefined}>~{r.kept}%</td>
                  <td className="r" style={r.m === 4 ? { background: "var(--accent-soft)" } : undefined}>{r.bad}</td>
                  <td className="r" style={r.m === 4 ? { background: "var(--accent-soft)" } : undefined}>{r.locked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small mt-3">Bad-year result: the median vault result in the 288 periods where holding lost more than 10% (holding: −24.0%). Ended in cash: share of periods where the floor was reached and the vault held only stablecoin to the end. At m = 4 the 95% range for clear breach is 0.11% to 0.91%, and for any shortfall 1.75% to 4.30%.</p>
      </div>

      <h2 id="one-over-m">The one-over-m rule</h2>
      <p>What m really sets is the size of a one-day drop the floor can survive: about 1 ÷ m. At m = 4 that is 25%, and about 24% once costs and the sell band are counted. We tested this two ways.</p>
      <ul className="list">
        <li><strong>Real data.</strong> At m = 4, none of the 1,552 periods without a one-day drop bigger than 25% ended more than 1 point below the floor. Of the 29 periods with such a drop, 7 did (24%). The same split held at m = 3, 5, 6 and 8.</li>
        <li><strong>Simulation.</strong> We injected one gap into 8,000 simulated years (18% yearly volatility). At m = 4 a clear breach happened in 0.1% of years for gaps up to 20%, 1.0% at 25% and 90.6% at 30%. At m = 5 it was 1.8% at 20% and 88.8% at 25%. At m = 3 it was 0% up to 30% and 94% at 40%. The cliff sits at 1 ÷ m.</li>
      </ul>
      <p>This rule says when the floor breaks. It does not say how often a drop that big happens. That is the next section.</p>

      <h2 id="crashes">Where it breaks</h2>
      <p>Real one-day drops bigger than 24% exist, mostly in single stocks. At m = 4 the vault cannot survive these.</p>
      <div className="block">
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">Largest one-day closing drops in the test data</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Date</th><th scope="col" className="r">One-day drop</th></tr></thead>
            <tbody>{DROPS.map(([n, d, v]) => <tr key={n}><th scope="row">{n}</th><td>{d}</td><td className="r" style={{ color: "var(--negative)" }}>{v}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small mt-3">The test data has no delisted companies, so real single-stock risk is higher than shown. A fraud or bankruptcy can take a stock down 80% to 100% in a day, and then no multiplier helps.</p>
      </div>

      <h2 id="groups">Index or single stock</h2>
      <div className="block">
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">Results at m = 4 by type of asset</caption>
            <thead><tr><th scope="col">Group</th><th scope="col" className="r">Periods</th><th scope="col" className="r">Clear breach</th><th scope="col" className="r">Any shortfall</th><th scope="col" className="r">Gain kept</th></tr></thead>
            <tbody>{GROUPS.map(([g, n, a, b, c]) => <tr key={g}><th scope="row">{g}</th><td className="r">{n}</td><td className="r">{a}</td><td className="r">{b}</td><td className="r">{c}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small mt-3">The international index group includes the 1987 Hong Kong crash (−33.3% in one day). Baskets (NVDA + TSLA + QQQ, MAG6 + TSLA, SPY + QQQ + NVDA) had no clear breach; the financial-crash basket (Citigroup, Bank of America, AIG, GE, Ford) had none in 49 periods.</p>
      </div>
      <p>Index and ETF baskets are where the rule is strongest. At launch, {BRAND.name} offers NVDAB, SPCXB and QQQB: one index fund and two single names. That is why the risk page says what it says.</p>

      <h2 id="tradeoff">What you give up</h2>
      <p>The figure we quote, about 42% of the gain kept, is a pooled average over the 1,105 periods where holding gained. A typical year is less kind: across all 1,581 periods the vault&apos;s median year was +1.6% against +13.7% for holding. In a normal year the vault gives away most of the return. That is the price of the floor, and the reason the 2022 NVDA chart is a worst case, not a typical case.</p>
      <p>Trading costs: at 6 bps one-way the vault gave up 0.22% a year at m = 4 (it trades about 3.7 times the deposit a year). At 50 bps one-way the cost is 1.75% a year and the share of gain kept falls from 42% to 34%.</p>
      <p>The floor you choose moves the upside much more than m does:</p>
      <div className="block">
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">Share of the gain kept and clear-breach rate by floor and multiplier</caption>
            <thead><tr><th scope="col">If you accept</th><th scope="col" className="r">m = 2</th><th scope="col" className="r">m = 3</th><th scope="col" className="r">m = 4 (ours)</th><th scope="col" className="r">m = 5</th></tr></thead>
            <tbody>{DIAL.map(([a, ...rest]) => <tr key={a}><th scope="row">{a}</th>{rest.map((c, i) => <td key={i} className="r" style={i === 2 ? { background: "var(--accent-soft)" } : undefined}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p className="small mt-3">Each cell: share of the gain kept in up years, then clear-breach rate. Pooled equities, 6 bps one-way, daily. This is a reading aid, not a setting in the app.</p>
      </div>

      <h2 id="not-built">What we did not build</h2>
      <ul className="list">
        <li><strong>A risk dial for m.</strong> The floor is already your dial. Higher m adds little upside and more breaches, and we found no case for tiers above 4.</li>
        <li><strong>A changing m.</strong> Rules that raise or lower m from recent volatility or recent worst drops did not beat a fixed m on later data.</li>
        <li><strong>A machine-learning model.</strong> It forecast the size of the worst one-day drop a little better than simple rules (rank correlation about 0.5 against 0.3 to 0.4). It did not give better returns at the same breach risk on later data. Every difference was within noise.</li>
        <li><strong>Stepped floors.</strong> Two floors in one position matched a plain single floor with a smaller m, and added complexity.</li>
      </ul>
      <p>One more result: choosing m from only the 2018 to 2026 data picks a more aggressive m (5.5), and that choice failed on earlier years (1.28% clear breach, worst −21%). Choosing from data before 2015 picked m = 4 to 4.5, and held up after 2015. Short samples flatter high multipliers.</p>

      <h2 id="limits">Limits of the test</h2>
      <ul className="list">
        <li>Daily closing prices only. No intraday paths, no trading halts, no gap between a token and its stock.</li>
        <li>Survivorship bias: mostly companies that still trade. Real single-stock results are worse.</li>
        <li>Costs are flat. We did not model thin liquidity in a crash, oracle lag, keeper outages, issuer pauses, or the 15:30 to 19:30 UTC trading window (we rebalance once a day at the close instead).</li>
        <li>0% on stablecoins, no stablecoin depeg.</li>
        <li>Mostly US and large-company stocks. Confidence ranges cover sampling error only, not model error.</li>
        <li>Weekly rebalancing was worse (1.27% clear breach against 0.44%). Do not read it as how the product behaves.</li>
      </ul>
      <p className="small">Full report, tables and code: <code>research/m_study/REPORT.md</code>. Next: <L href="/docs/spot-only">Spot only</L>.</p>
    </DocPage>
  );
}
