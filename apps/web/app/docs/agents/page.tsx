import { B402Terminal } from "@/components/agents/b402-terminal";
import { AgentFlow } from "@/components/charts/agent-flow";
import { Callout, DocPage, L } from "@/components/docs/doc-page";
import { BRAND } from "@/lib/brand";
import { PAID_TOKENS, PAID_TOOL_PRICE_LABEL } from "@/lib/app-config";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/docs/agents", "Agents");

const snippet = `// Example request to the hosted MCP server (Streamable HTTP).
POST https://floor-server-tfc6.onrender.com/mcp
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

const agenticSnippet = `baw contract-call preview --binanceChainId 56 --from <agent wallet> --to <to> --value <wei> --inputData <data> --json
baw contract-call execute --requestId <id> --json`;

export default function Page() {
  return (
    <DocPage
      slug="agents"
      lead={<p>More money is now managed by AI agents. {BRAND.name} lets an agent buy protection for the person it works for.</p>}
      toc={[["flow", "How an agent uses Floor"], ["keeper", "Keeper"], ["mcp", "MCP server"], ["pay", "Pay per call with b402"], ["skill", "Agent skill"], ["agentic-wallet", "With Binance Agentic Wallet"]]}
    >
      <h2 id="flow" style={{ marginTop: 0 }}>How an agent uses {BRAND.name}</h2>
      <div className="block border border-grid bg-surface p-4 md:p-6">
        <p className="label mb-5">FIG. 10 / HOW AN AGENT USES {BRAND.name.toUpperCase()}</p>
        <AgentFlow />
      </div>

      <h2 id="keeper">Keeper <span className="badge b-acc align-middle">EOA primary</span></h2>
      <p>An automated keeper triggers rebalances. An EOA keeper is the primary one; a Binance Agentic Wallet is supported as an optional second keeper. Neither can move your funds. Your funds stay in your own vault contract. Your own Agentic Wallet can sign deposits and pay b402. Roles are described on <L href="/docs/contracts#roles">Contracts</L>.</p>
      <Callout>
        <p>The Agentic Wallet keeper runs through Developer Mode. A plain wallet is the main keeper, so rebalances never depend on it.</p>
      </Callout>

      <h2 id="mcp">MCP server <span className="badge b-pos align-middle">live</span></h2>
      <p>{BRAND.name} exposes its actions as MCP tools: quote_protection, build_create_position_tx, build_exit_tx, get_status, backtest. Any MCP-capable agent can use them. Tools that change state return an unsigned transaction. {BRAND.name} never signs.</p>
      <p>The full tool list, inputs, prices, connection examples and a sample keeper log are on the <L href="/agents">agent reference page</L>.</p>
      <div className="block border border-grid bg-surface">
        <div className="flex items-center justify-between border-b border-grid px-4 py-3 md:px-6">
          <span className="label">An MCP call</span>
          <span className="badge">Example</span>
        </div>
        <pre className="code !border-0 !bg-transparent !p-4 md:!p-6" tabIndex={0} aria-label="Example MCP call to quote_protection">{snippet}</pre>
      </div>

      <h2 id="pay">Pay per call with b402 <span className="badge b-pos align-middle">live</span></h2>
      <p>quote_protection, backtest and simulate_gap each cost {PAID_TOOL_PRICE_LABEL}, paid in {PAID_TOKENS}. The free tools stay free. Buyers need no account. Paid MCP tools settle over b402, Binance&apos;s x402-compatible payment rail on BSC: the agent signs an EIP-3009 authorization, our server verifies and settles it through b402, and Binance sponsors the gas.</p>
      <p>Our server calls b402 with a Binance Web3 API key that has the B402 Payments permission. Payments cover calls to {BRAND.name}&apos;s API, not LLM inference. More on the <L href="/agents">reference page</L>.</p>

      <div className="my-4"><B402Terminal /></div>

      <h2 id="skill">Agent skill <span className="badge align-middle">in the repo</span></h2>
      <p>A {BRAND.name} skill so a user&apos;s own agent can deposit and withdraw with the user&apos;s own wallet. It tells the agent to read the factory address from get_floor_info and check every unsigned transaction against it before signing.</p>
      <h2 id="agentic-wallet">With Binance Agentic Wallet <span className="badge b-pos align-middle">supported</span></h2>
      <p>An AI agent can use {BRAND.name} by calling the MCP tools build_create_position_tx and build_exit_tx, which return unsigned transactions, and executing them with Binance Agentic Wallet Developer Mode:</p>
      <pre className="code" tabIndex={0} aria-label="Agentic Wallet Developer Mode commands">{agenticSnippet}</pre>
      <p>Developer Mode is enabled in the Binance app and has its own daily limit and expiry. Contract calls and deposits are signed in Developer Mode; paid {BRAND.name} tools are paid with an EIP-3009 signature over b402. A browser page cannot connect an Agentic Wallet, so the agent runs this flow from its own environment. It follows Binance&apos;s <a href="https://web3.binance.com/en/dev-docs/products/agentic-wallet/use-cases/developer-mode.md" className="prose-link">Developer Mode guide</a>Install the Binance skill with <code>npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet</code>. See also <L href="/docs/binance">Binance</L>.</p>

      <p>Next: <L href="/docs/contracts">Contracts</L>.</p>
    </DocPage>
  );
}
