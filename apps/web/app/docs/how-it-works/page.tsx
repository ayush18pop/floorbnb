import { ChartPanel } from "@/components/charts/panel";
import { ExposureChart } from "@/components/charts/exposure-chart";
import { StackDiagram } from "@/components/charts/stack-diagram";
import { DocPage, L } from "@/components/docs/doc-page";
import { loadPath } from "@/lib/data";
import { worked } from "@/lib/cppi";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "How it works" };

export default function Page() {
  const worst = loadPath("nvda_worst");
  const steps = worked(10000, 9000);
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  return (
    <DocPage
      slug="how-it-works"
      lead={<p>You choose one number. {BRAND.name} does the rest.</p>}
      toc={[["steps", "The four steps"], ["cushion", "Floor and cushion"], ["rule", "The 4× rule"], ["cash-lock", "Cash lock"], ["origin", "Where it comes from"]]}
    >
      <h2 id="steps" style={{ marginTop: 0 }}>The four steps</h2>
      <ul className="list">
        <li><strong>1. Deposit.</strong> Deposit USDT only and pick a basket: NVDAB, SPCXB, QQQB. Launch caps: 1,000 USDT per position, 5,000 USDT in total.</li>
        <li><strong>2. Pick your floor.</strong> Choose the lowest value you accept, for example 90% of your deposit, for a one-year term. At 90%, your loss is about 10% or less, unless prices gap more than 25% before the vault can rebalance.</li>
        <li><strong>3. The vault keeps you above the line.</strong> The gap between your value and your floor is a cushion. The vault holds more stock when the cushion is big, and less when it is small. When prices fall, it sells some stock for USDT. When prices rise, it buys some back. Each move is a normal <L href="/docs/spot-only">swap on BNB Chain</L>.</li>
        <li><strong>4. Withdraw when you like.</strong> Your money stays in your own vault contract, one per position. You can exit at any time with <code>exitInKind</code>, or take it all out as USDT at the end of the term. See <L href="/docs/contracts#exits">exits</L>.</li>
      </ul>

      <h2 id="cushion">The floor and the cushion</h2>
      <p>Think of the gap between your value and your floor as a cushion. {`${BRAND.name} holds four times your cushion in stock, and the rest in USDT.`} If the cushion shrinks, the vault sells stock for USDT. If it grows, the vault buys stock back.</p>
      <div className="block">
        <ChartPanel fig="FIG. 02 / THE FLOOR AND THE CUSHION" title="At deposit" caption={null}>
          <StackDiagram />
        </ChartPanel>
      </div>

      <h2 id="rule">The 4× rule</h2>
      <p>The rule is called constant proportion portfolio insurance (CPPI). The vault holds 4 times your cushion in stocks (never more than your whole value), and the rest in USDT. In symbols: stock = min(4 × (value − floor), value).</p>
      <p>The 4 is why the floor survives a sudden drop: if stock falls by less than about 25% in one jump, the cushion absorbs it, because 4 × 25% = 100% of the cushion. Trading costs and the vault&apos;s sell band eat a little of that, so the real limit is slightly below 25%. This is the &ldquo;gap limit&rdquo;. Why 4 and not higher is shown on the <L href="/docs/backtest#multiplier">backtest page</L>: at higher multipliers the floor was breached in some windows.</p>
      <div className="block">
        <ChartPanel fig="FIG. 03 / STOCK HELD AS THE PRICE FALLS" title="NVDA 2022" source="docs/data/vault_path_nvda_worst.csv">
          <ExposureChart data={worst} />
        </ChartPanel>
      </div>

      <h2 id="trades">Step by step: a $10,000 deposit</h2>
      <p>With a 90% floor, the floor is $9,000 and the cushion is $1,000. The vault holds 4 × $1,000 = $4,000 in stock and $6,000 in USDT. Then the stock moves. Schematic, not backtest data.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="sr-only">Worked example of the rebalancing rule for a 10,000 USDT deposit and a 90% floor</caption>
          <thead><tr><th scope="col">Step</th><th scope="col">Event</th><th scope="col" className="r">Stock</th><th scope="col" className="r">USDT</th><th scope="col" className="r">Value</th><th scope="col" className="r">Cushion</th><th scope="col" className="r">Stock target</th><th scope="col" className="r">Trade</th></tr></thead>
          <tbody>
            {steps.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.id}</td><td className="min-w-[200px]">{r.event}</td>
                <td className="r">{usd(r.stock)}</td><td className="r">{usd(r.usdt)}</td><td className="r">{usd(r.v)}</td><td className="r">{usd(r.cushion)}</td><td className="r">{usd(r.target)}</td>
                <td className={`r ${r.trade > 0.5 ? "pos" : r.trade < -0.5 ? "neg" : ""}`}>{Math.abs(r.trade) < 0.5 ? "none" : `${r.trade > 0 ? "buy" : "sell"} ${usd(Math.abs(r.trade))}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>The <L href="/app">prototype</L> shows the same steps for any basket and floor you pick. Nothing is sent.</p>

      <h2 id="cash-lock">What if value reaches the floor?</h2>
      <p>The vault moves fully into USDT and stays there until the term ends. This protects your floor. It also means you miss any recovery during that term. We call this the cash lock. The one-year term resets it.</p>

      <h2 id="origin">Where the rule comes from</h2>
      <p>CPPI is not new. André Perold described the idea in 1986. Fischer Black and Robert Jones published it as &ldquo;Simplifying Portfolio Insurance&rdquo; in 1987 (from memory, not yet checked against the paper). Banks have used it for decades inside principal-protected notes. {BRAND.name} runs the same rule with public contracts and plain spot swaps.</p>
      <p>Next: what it costs you, on <L href="/docs/trade-off">The trade-off</L>.</p>
    </DocPage>
  );
}
