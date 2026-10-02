import { DocPage, L } from "@/components/docs/doc-page";

export const metadata = { title: "FAQ" };

const faqs: [string, React.ReactNode][] = [
  ["Can I lose money?", <>Yes. You set the floor, for example 90%, so your worst case is about a 10% loss. A loss can be larger if prices gap more than 25% before the vault can rebalance. And your money is still in the market, so it can fall to the floor. See <L href="/docs/risks">Risks</L>.</>],
  ["What happens if my value hits the floor?", <>The vault holds only USDT until your one-year term ends. You keep your floor value. You miss any recovery in that term. This is the <L href="/docs/how-it-works#cash-lock">cash lock</L>.</>],
  ["How much upside do I give up?", <>In our backtest, about 42% of the gain was kept in up years for a three-stock basket. So you gave up about 58%. It was 45% kept for NVDA and 32% for QQQ. See <L href="/docs/trade-off">The trade-off</L>.</>],
  ["Is this insurance? Is anyone paying me if I lose?", "No. No one pays you. It is a rule the vault follows: sell stock as prices fall, buy as they rise."],
  ["Do you use leverage, options or borrowing?", <>No. Spot trades only: swaps between stock tokens and USDT on BNB Chain. See <L href="/docs/spot-only">Spot only</L>.</>],
  ["Who holds my money?", <>Your own vault contract holds it, one per position. Not Floor and not the keeper wallet. The contract is public. No audit is published yet. See <L href="/docs/contracts">Contracts</L>.</>],
  ["Why not just sell my stocks if I'm scared?", "You can. Then you miss any rise. Floor keeps you in the market, with a limit on how far you can fall, and you keep part of the gain."],
  ["What does it cost?", <>There is no protocol fee in v1. The cost is the upside you give up, plus small trading costs: on a $10k round trip, 0.7 to 6.6 basis points for QQQB, NVDAB, SPCXB and SPYB, measured on 2026-10-02. See <L href="/docs/backtest#costs">costs</L>.</>],
  ["What happens on weekends?", "The vault does not rebalance on weekends. We assume the full weekend gap hits your value. The biggest one-night or weekend drop since 2018 was NVDA's −19.3%."],
  ["Do I need to know crypto?", "You need a BNB Chain wallet and USDT. Deposit USDT, pick a basket, then pick one number."],
];

export default function Page() {
  return (
    <DocPage slug="faq" lead={<p>Questions you should ask.</p>}>
      <div className="faq" style={{ marginTop: 0 }}>
        {faqs.map(([q, a], i) => (
          <details key={q}>
            <summary><span><span className="mono mr-3 text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>{q}</span><span className="plus" aria-hidden="true">+</span></summary>
            <div><p style={{ marginTop: 0 }}>{a}</p></div>
          </details>
        ))}
      </div>
    </DocPage>
  );
}
