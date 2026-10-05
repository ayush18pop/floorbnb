import { ArrowRight } from "lucide-react";
import { DocPage, L } from "@/components/docs/doc-page";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/docs/spot-only", "Spot only");

const nots = [
  { t: "No perps.", b: "No bets on future prices." },
  { t: "No options.", b: "No contracts that expire." },
  { t: "No leverage.", b: "Your stock exposure never goes above your vault's current value." },
  { t: "No borrowing.", b: `${BRAND.name} owes no one anything.` },
];

export default function Page() {
  return (
    <DocPage slug="spot-only" lead={<p>{BRAND.name} buys and sells tokens. That is all.</p>} toc={[["nots", "What we do not use"], ["swaps", "How swaps work"]]}>
      <h2 id="nots" style={{ marginTop: 0 }}>What we do not use</h2>
      <div className="mt-4 grid border-l border-t border-grid sm:grid-cols-2">
        {nots.map((n) => (
          <div key={n.t} className="border-b border-r border-grid bg-surface p-4 md:p-6">
            <p className="mono text-[15px] font-medium" style={{ textDecoration: "line-through", textDecorationThickness: 1 }}>
              <span className="sr-only">Not used: </span>{n.t.replace(".", "").toUpperCase()}
            </p>
            <p className="mt-2 !text-[15px]"><span className="sr-only">{n.t} </span>{n.b}</p>
          </div>
        ))}
      </div>
      <p>Stock exposure is capped at your vault&apos;s current value, so there is no leverage. The vault borrows nothing and owes nothing. The rule behind this is on <L href="/docs/how-it-works#rule">How it works</L>.</p>

      <h2 id="swaps">How swaps work</h2>
      <p className="mono mt-4 inline-flex items-center gap-3 border border-grid-strong bg-surface px-4 py-2 text-[13px]" aria-hidden="true" style={{ color: "var(--text)" }}>
        STOCK TOKEN <ArrowRight size={16} strokeWidth={1.5} /> USDT
      </p>
      <p>When prices fall, the vault swaps stock tokens for USDT on {BRAND.chain} (PancakeSwap and other liquidity). When prices rise, it swaps back. You can check every trade on-chain.</p>
      <p>The vault checks each swap itself: direction, size, router and a minimum amount out against an on-chain price. See <L href="/docs/contracts">Contracts</L>. Trading costs per swap are on the <L href="/docs/backtest#costs">backtest page</L>.</p>
      <p>Next: <L href="/docs/agents">Agents</L>.</p>
    </DocPage>
  );
}
