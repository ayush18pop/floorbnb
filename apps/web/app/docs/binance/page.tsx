import { Callout, DocPage, L } from "@/components/docs/doc-page";
import { StatusTable } from "@/components/binance/status-table";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/docs/binance", "Binance Web3 integration");

export default function Page() {
  return (
    <DocPage
      slug="binance"
      lead={<p>{BRAND.name} integrates the Binance Web3 RWA Data, Market, Transaction and Trading APIs, and settles paid MCP tools over Binance b402. This page shows the Binance calls the server makes and how often.</p>}
      toc={[["live", "What the server calls"], ["why", "Why it is used"], ["modules", "Integration modules"]]}
    >
      <h2 id="live" style={{ marginTop: 0 }}>What the server calls</h2>
      <p>This table is read live from the {BRAND.name} server. Counts are for the current server process and reset when it restarts.</p>
      <div className="mt-4"><StatusTable /></div>

      <h2 id="why">Why it is used</h2>
      <p>The app shows, for each stock a vault holds, the token price next to the real stock price and the gap between them. The keeper uses the same gap: it skips buying a stock when its token trades far from the real stock price. Selling is never blocked. The data also gives company details and a 90-day price history. It is information, not advice, and past prices are not a prediction.</p>

      <h2 id="modules">Integration modules</h2>
      <ul>
        <li><strong>RWA Data and Market APIs.</strong> Token prices, underlying market data, company profiles and daily candles for the app, the API and the keeper.</li>
        <li><strong>Transaction API.</strong> The keeper reads gas price and simulates each transaction before sending.</li>
        <li><strong>Trading API.</strong> Aggregator quotes are shown in the builder; the swap route is available to the keeper alongside PancakeSwap.</li>
        <li><strong>b402.</strong> Binance&apos;s x402-compatible payment rail. Paid MCP tools settle over b402.</li>
        <li><strong>Agentic Wallet.</strong> Floor supports signing with Binance Agentic Wallet. Agents call {BRAND.name} through its MCP tools and Developer Mode contract calls; see <L href="/docs/agents">Agents</L>.</li>
      </ul>
      <Callout label="Note">
        <p>Binance may return no market status for a stock token. When it does, the app says &quot;not reported by Binance&quot; and does not guess.</p>
      </Callout>
    </DocPage>
  );
}
