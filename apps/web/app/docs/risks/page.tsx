import { DocPage, L } from "@/components/docs/doc-page";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Risks" };

const limits: [string, React.ReactNode][] = [
  [`${BRAND.name} is not a guarantee.`, <>It holds unless prices gap more than about 24% before the vault can rebalance. Past drops since 2018 were smaller (worst: NVDA −19.3%; SPCX has only 76 days of history. See <L href="/docs/backtest#gaps">worst gaps</L>). A future drop could be larger. Over 98 years of the S&amp;P 500 the floor was never broken, but single stocks have fallen 30% to 61% in a day (AIG 2008, Apple 2000), and no setting survives that. See <L href="/docs/evidence">Evidence</L>.</>],
  ["It can miss the recovery.", <>If value reaches the floor, the vault goes to USDT until the term ends (<L href="/docs/how-it-works#cash-lock">cash lock</L>).</>],
  ["You give up upside.", <>About 42% of a basket&apos;s gain was kept in up years. See <L href="/docs/trade-off">The trade-off</L>.</>],
  ["Some stocks suit it badly.", "TSLA's choppy moves made the vault lose in a median year."],
  ["Weekends.", `${BRAND.name} does not trade on weekends. We assume the full weekend gap hits. Weekend trading cost is not measured yet.`],
  ["The vault trades in a set window.", <>The contract trades Monday to Friday, 15:30 to 19:30 UTC. We re-ran the backtest with one rebalance a day to match: the floor still held in all 93 windows of the 2018 to 2026 sample at m = 4. At m = 5 it broke in 3.2% of TSLA windows. See the <L href="/docs/backtest#trading-window">trading-window check</L>.</>],
  ["Costs rise in a crash.", "We measured trading costs in calm markets only. Costs in a crash are not tested."],
  ["A sell can be delayed in a fast crash.", "The vault only sells when the current price and the 10-minute average price agree closely. In a fast fall they can differ, so a sell can wait until they agree. While it waits, your value can fall below the floor. The keeper retries, and anyone can trigger the sell after 4 hours without a trade. Launch caps limit the exposure."],
  ["Token issuer risk.", "The issuer of a tokenized stock can pause the token, block an address or apply a sanctions list. If that happens, the vault cannot swap that token. You can always exit: the vault sends you your USDT and any tokens that can still move, and the rest can be recovered once the restriction is lifted. A tokenized stock can also move differently from the real stock. Not yet tested."],
  ["Contract risk.", <>The vault is new code, not yet on mainnet. No audit is published yet. Launch caps limit the damage: 1,000 USDT per position, 5,000 USDT in total. See <L href="/docs/contracts">Contracts</L>.</>],
  ["Limited stocks.", "Today: NVDAB, SPCXB, QQQB, with SPYB optional. No Apple token exists yet."],
  ["Agent keeper.", <>The Agentic Wallet keeper depends on Developer Mode, which is still being tested. A plain wallet is the main keeper. See <L href="/docs/agents#keeper">Agents</L>.</>],
  ["Not financial advice.", "Backtests use past prices and do not predict the future."],
];

export default function Page() {
  return (
    <DocPage slug="risks" lead={<p>What we don&apos;t claim.</p>}>
      <ul className="list" style={{ marginTop: 0, maxWidth: "none" }}>
        {limits.map(([h, b]) => (
          <li key={h}>
            <strong>{h}</strong>
            <span className="block max-w-[64ch]">{b}</span>
          </li>
        ))}
      </ul>
      <p>Next: <L href="/docs/faq">FAQ</L>.</p>
    </DocPage>
  );
}
