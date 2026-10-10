import { Callout, DocPage, L } from "@/components/docs/doc-page";
import { StatusTable } from "@/components/binance/status-table";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/docs/binance", "Binance Web3 integration");

export default function Page() {
  return (
    <DocPage
      slug="binance"
      lead={<p>{BRAND.name} reads market data from the Binance Web3 RWA Data API. This page shows which Binance calls the server makes, how often, and which Binance products {BRAND.name} does not use.</p>}
      toc={[["live", "What the server calls"], ["why", "Why it is used"], ["not-used", "What we do not use"]]}
    >
      <h2 id="live" style={{ marginTop: 0 }}>What the server calls</h2>
      <p>This table is read live from the {BRAND.name} server. Counts are for the current server process and reset when it restarts. Notes are shown exactly as the server reports them.</p>
      <div className="mt-4"><StatusTable /></div>

      <h2 id="why">Why it is used</h2>
      <p>The app shows, for each stock a vault holds, the token price next to the real stock price and the gap between them. The keeper uses the same gap: it skips buying a stock when its token trades far from the real stock price. Selling is never blocked. The data also gives company details and a 90-day price history. It is information, not advice, and past prices are not a prediction.</p>

      <h2 id="not-used">What we do not use</h2>
      <p>These are the Binance Web3 products {BRAND.name} does not use in its live path, and why.</p>
      <ul>
        <li><strong>Trading API swap.</strong> Live trades go directly through PancakeSwap. The aggregator route was verified on a fork only, not on mainnet.</li>
        <li><strong>b402.</strong> The client is built. The supported and verify calls were tested live on 2026-10-05. Settle was not run live. Paid calls use {BRAND.name}&apos;s own x402 facilitator.</li>
        <li><strong>Agentic Wallet.</strong> Agents use {BRAND.name} through its MCP tools and Agentic Wallet Developer Mode contract calls. This is documented on <L href="/docs/agents">Agents</L>; {BRAND.name} does not run an Agentic Wallet itself.</li>
      </ul>
      <Callout label="Honest note">
        <p>Binance may return no market status for a stock token. When it does, the app says &quot;not reported by Binance&quot; and does not guess.</p>
      </Callout>
    </DocPage>
  );
}
