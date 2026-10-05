import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DocPage, L } from "@/components/docs/doc-page";
import { DOCS } from "@/lib/docs-nav";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/docs", "Overview");

export default function DocsHome() {
  return (
    <DocPage slug="" lead={<p>{BRAND.name} protects tokenized stocks on {BRAND.chain} with a line you choose. This is where the detail lives.</p>}>
      <h2 style={{ marginTop: 0 }}>What {BRAND.name} is</h2>
      <p>You can now hold stocks like NVIDIA and the Nasdaq-100 as tokens on BNB Chain. A bad year can cut the value by a third. In NVDA&apos;s worst year since 2018 (2022), holding lost 51%.</p>
      <p>Today you have two choices. Sell and miss the upside. Or hold and hope. {BRAND.name} adds a third: <strong>hold, with a floor.</strong></p>
      <p>You deposit USDT only, pick a basket and choose the lowest value you accept, for example 90% of your deposit, for a one-year term. A vault contract then holds stock when your cushion is big and moves into USDT when it is small. Each move is a normal swap on {BRAND.chain}. The rule is described on <L href="/docs/how-it-works">How it works</L>.</p>
      <p>Protection is not free. You keep part of the gain: roughly 4 × (100 − floor)%, so about 40% at a 90% floor. See <L href="/docs/trade-off">The trade-off</L>. The floor holds unless prices gap more than about {BRAND.gapLimitPct}% before the vault can rebalance; it is not a guarantee. At a 90% floor, 0.44% of historical one-year windows ended more than 1 point below it. See <L href="/docs/risks">Risks</L> and <L href="/docs/open-items">Known open items</L>.</p>
      <p>{BRAND.name} uses <L href="/docs/spot-only">spot trades only</L>: no perps, options, leverage or borrowing.</p>

      <h2>Every page</h2>
      <ul className="mt-4 border-t border-grid">
        {DOCS.filter((d) => d.slug).map((d) => (
          <li key={d.href} className="border-b border-grid">
            <Link href={d.href} className="group flex items-center justify-between gap-4 py-4 no-underline">
              <span>
                <span className="block text-[16px] font-medium group-hover:text-accent">{d.title}</span>
                <span className="small block">{d.blurb}</span>
              </span>
              <ArrowRight size={16} strokeWidth={1.5} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="small">The app is behind a launch lock (default locked) until mainnet; these docs are always public. {BRAND.name} is not on mainnet yet. Backtest numbers anywhere on this site are past data, not a prediction. Not financial advice.</p>
    </DocPage>
  );
}
