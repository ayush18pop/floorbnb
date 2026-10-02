import { DocPage, L } from "@/components/docs/doc-page";

export const metadata = { title: "Risks" };

const limits: [string, React.ReactNode][] = [
  ["Floor is not a guarantee.", <>It holds unless prices gap more than 25% before the vault can rebalance. Past drops since 2018 were smaller (worst: NVDA −19.3%, see <L href="/docs/backtest#gaps">worst gaps</L>). A future drop could be larger.</>],
  ["It can miss the recovery.", <>If value reaches the floor, the vault goes to USDT until the term ends (<L href="/docs/how-it-works#cash-lock">cash lock</L>).</>],
  ["You give up upside.", <>About 42% of a basket&apos;s gain was kept in up years. See <L href="/docs/trade-off">The trade-off</L>.</>],
  ["Some stocks suit it badly.", "TSLA's choppy moves made the vault lose in a median year."],
  ["Weekends.", "Floor does not trade on weekends. We assume the full weekend gap hits. Weekend trading cost is not measured yet."],
  ["The vault trades in a set window.", <>The contract trades Monday to Friday, 15:30 to 19:30 UTC. We re-ran the backtest with one rebalance a day to match: the floor still held in 93 of 93 windows at 4x. At 5x it broke in 3.2% of TSLA windows. See the <L href="/docs/backtest#trading-window">trading-window check</L>.</>],
  ["Costs rise in a crash.", "We measured trading costs in calm markets only. Costs in a crash are not tested."],
  ["Token issuer risk.", "The issuer of a tokenized stock can pause the token, block an address or apply a sanctions list. If that happens, the vault cannot swap that token. You can always exit: the vault sends you your USDT and any tokens that can still move, and the rest can be recovered once the restriction is lifted. A tokenized stock can also move differently from the real stock. Not yet tested."],
  ["Contract risk.", <>The vault is new code. No audit is published yet. See <L href="/docs/contracts">Contracts</L>.</>],
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
