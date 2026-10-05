import { AgentFlow } from "@/components/charts/agent-flow";
import { Callout, DocPage, L } from "@/components/docs/doc-page";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Agents" };

const snippet = `// Example only. The endpoint is a placeholder until the server is live.
POST https://mcp.<domain>/mcp
{
  "method": "tools/call",
  "params": {
    "name": "quote_protection",
    "arguments": {
      "assets": [{ "symbol": "NVDAB", "weightBps": 10000 }],
      "depositUsd": 10000,
      "floorPct": 90,
      "termDays": 365
    }
  }
}
// First reply: HTTP 402 with the price.
// Sign it with your wallet, retry, get the quote.`;

export default function Page() {
  return (
    <DocPage
      slug="agents"
      lead={<p>More money is now managed by AI agents. {BRAND.name} lets an agent buy protection for the person it works for.</p>}
      toc={[["flow", "How an agent uses Floor"], ["keeper", "Keeper"], ["mcp", "MCP server"], ["b402", "Pay per call with b402"], ["skill", "Agent skill"]]}
    >
      <h2 id="flow" style={{ marginTop: 0 }}>How an agent uses {BRAND.name}</h2>
      <div className="block border border-grid bg-surface p-4 md:p-6">
        <p className="label mb-5">FIG. 10 / HOW AN AGENT USES {BRAND.name.toUpperCase()}</p>
        <AgentFlow />
      </div>

      <h2 id="keeper">Keeper <span className="badge b-acc align-middle">Binance Agentic Wallet</span></h2>
      <p>An automated keeper triggers rebalances; a Binance Agentic Wallet holds the same role. Neither can move your funds. Your funds stay in your own vault contract. Your own Agentic Wallet can sign deposits and pay b402. Roles are described on <L href="/docs/contracts#roles">Contracts</L>.</p>
      <Callout>
        <p>The Agentic Wallet keeper depends on Developer Mode, which is still being tested. A plain wallet is the main keeper, so rebalances do not stop if the Agentic Wallet is blocked.</p>
      </Callout>

      <h2 id="mcp">MCP server <span className="badge b-pos align-middle">verified live: supported + verify</span></h2>
      <p>{BRAND.name} exposes its actions as MCP tools: quote_protection, build_create_position_tx, build_exit_tx, get_status, backtest. Any MCP-capable agent can use them. Tools that change state return an unsigned transaction. {BRAND.name} never signs.</p>
      <p>The full tool list, inputs, prices, connection examples and a sample keeper log are on the <L href="/agents">agent reference page</L>.</p>
      <div className="block border border-grid bg-surface">
        <div className="flex items-center justify-between border-b border-grid px-4 py-3 md:px-6">
          <span className="label">An MCP call</span>
          <span className="badge">Example</span>
        </div>
        <pre className="code !border-0 !bg-transparent !p-4 md:!p-6" tabIndex={0} aria-label="Example MCP call to quote_protection">{snippet}</pre>
      </div>

      <h2 id="b402">Pay per call with b402 <span className="badge b-warn align-middle">building</span></h2>
      <p>The agent pays a small fee for each paid call in stablecoins, through b402, Binance&apos;s x402 facilitator on BSC. Buyers need no account. Our server calls b402 with a Binance Web3 API key that has the B402 Payments permission. Gas is sponsored. b402 does not pay for LLM inference. The supported and verify calls have been run live and passed. Settle has not been run live yet, so the demo settles through our own self facilitator: our server verifies the signed payment and sends the transfer itself. That path is tested end to end on a local fork with a test token. More on the <L href="/agents#b402">reference page</L>.</p>

      <h2 id="skill">Agent skill <span className="badge b-warn align-middle">building</span></h2>
      <p>A {BRAND.name} skill so a user&apos;s own agent can deposit and withdraw with the user&apos;s own wallet. It tells the agent to read the factory address from get_floor_info and check every unsigned transaction against it before signing.</p>
      <p>Next: <L href="/docs/contracts">Contracts</L>.</p>
    </DocPage>
  );
}
