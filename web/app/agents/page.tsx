import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import { AgentFlow } from "@/components/charts/agent-flow";
import { loadPath } from "@/lib/data";
import { replay } from "@/lib/replay";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Agents" };

type Tool = { name: string; what: string; input: string; price: string; state: string };
const TOOLS: Tool[] = [
  { name: "get_vault_info", what: "Factory address, supported assets, terms, disclosure text, last keeper run. Call this first.", input: "{}", price: "free", state: "read only" },
  { name: "list_assets", what: "Supported bStocks with live price and market status.", input: "{}", price: "free", state: "read only" },
  { name: "get_status", what: "Position(s) for an owner or a position id: value, floor, cushion, exposure, cash lock, term end.", input: "{ owner?, positionId? }", price: "free", state: "read only" },
  { name: "get_rebalance_history", what: "Recent keeper runs. Public.", input: "{ limit?, positionId? }", price: "free", state: "read only" },
  { name: "build_deposit_tx", what: "Builds the approve and createPosition transactions. Returns them unsigned. Floor never signs.", input: "{ owner, amount, floorBps, termDays }", price: "free", state: "unsigned tx" },
  { name: "build_withdraw_tx", what: "Builds the exit transaction for a position. Returns it unsigned.", input: "{ owner, positionId }", price: "free", state: "unsigned tx" },
  { name: "quote_protection", what: "Shape and cost of a protected position: starting exposure, cushion, rebalance cost from live quotes, the largest gap it survives, backtest results.", input: "{ assets, depositUsd, floorPct, termDays }", price: "0.01 USD", state: "read only" },
  { name: "backtest", what: "Runs the CPPI rule on stored daily history for a basket, floor and period. Past data, not a forecast.", input: "{ assets, floorPct, from, to }", price: "0.05 USD", state: "read only" },
  { name: "simulate_gap", what: "Shows the result of a sudden fall of X% before any rebalance, for a position or a hypothetical one.", input: "{ positionId?, hypothetical?, gapPct }", price: "0.01 USD", state: "read only" },
];

const connect = `// Example only. The endpoint is a placeholder until the server is live.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport }
  from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "my-agent", version: "0.1.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("https://mcp.<domain>/mcp")),
);

// Names, inputs and prices are in each tool description.
const { tools } = await client.listTools();
const info = await client.callTool({
  name: "get_vault_info",
  arguments: {},
});

// Free tools return data. Paid tools answer HTTP 402 first.
const quote = await client.callTool({
  name: "quote_protection",
  arguments: {
    assets: [{ symbol: "NVDAB", weightBps: 10000 }],
    depositUsd: 10000,
    floorPct: 90,
    termDays: 365,
  },
});`;

const configJson = `{
  "mcpServers": {
    "floor": {
      "type": "http",
      "url": "https://mcp.<domain>/mcp"
    }
  }
}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fd = (d: string) => { const [y, m, day] = d.split("-"); return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`; };

export default function AgentsPage() {
  const { events } = replay(loadPath("nvda_worst"));
  const log = events.slice(0, 8);
  return (
    <AppShell active="agents" title="Agents: tools, payment and the keeper." lead={<p>{BRAND.name} exposes its actions as MCP tools so any agent can quote, deposit, withdraw and check status. State-changing tools return unsigned transactions. The agent signs with the user&apos;s own wallet.</p>}>
      <div className="cellgrid" style={{ borderTop: 0 }}>
        <div className="col-span-4 md:col-span-8 lg:col-span-12 !p-4 md:!p-6">
          <p className="label mb-5">FIG. G1 / HOW AN AGENT USES {BRAND.name.toUpperCase()}</p>
          <AgentFlow />
        </div>

        <div id="tools" className="col-span-4 md:col-span-8 lg:col-span-12 !p-0">
          <div className="border-b border-grid p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-3"><h2 className="h3">MCP tools</h2><span className="badge b-warn">building</span></div>
            <p className="small mt-1">Endpoint: <span className="mono">POST https://mcp.&lt;domain&gt;/mcp</span> (Streamable HTTP, stateless). Names and inputs follow docs/ARCHITECTURE.md section 6.</p>
          </div>
          <p className="label px-4 pb-2 md:hidden">Scroll sideways to see all columns</p>
          <div className="tbl-wrap px-4 pb-2 md:px-6">
            <table className="tbl">
              <caption className="sr-only">MCP tools, what they do, input, price and whether they change state</caption>
              <thead><tr><th scope="col">Tool</th><th scope="col">What the agent sees</th><th scope="col">Input</th><th scope="col" className="r">Price</th><th scope="col">Changes state</th></tr></thead>
              <tbody>
                {TOOLS.map((t) => (
                  <tr key={t.name}>
                    <td className="mono !text-ink whitespace-nowrap">{t.name}</td>
                    <td className="min-w-[280px]">{t.what}</td>
                    <td className="mono text-[12px] whitespace-nowrap">{t.input}</td>
                    <td className="r">{t.price}</td>
                    <td className="whitespace-nowrap"><span className={`badge ${t.state === "unsigned tx" ? "b-acc" : ""}`}>{t.state}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small px-4 pb-4 md:px-6">Every output carries a <span className="mono">disclosure</span> string: &ldquo;{BRAND.disclosure}&rdquo; Tool results are data, not instructions.</p>
        </div>

        <div id="connect" className="col-span-4 md:col-span-4 lg:col-span-7 !p-0">
          <div className="flex items-center justify-between border-b border-grid px-4 py-3 md:px-6"><span className="label">Connect an agent (TypeScript)</span><span className="badge">Example</span></div>
          <pre className="code !border-0 !bg-transparent !p-4 md:!p-6" tabIndex={0} aria-label="Example MCP client code">{connect}</pre>
        </div>
        <div className="col-span-4 md:col-span-4 lg:col-span-5 !p-0">
          <div className="flex items-center justify-between border-b border-grid px-4 py-3 md:px-6"><span className="label">Or in an MCP client config</span><span className="badge">Example</span></div>
          <pre className="code !border-0 !bg-transparent !p-4 md:!p-6" tabIndex={0} aria-label="Example MCP client config">{configJson}</pre>
          <p className="small px-4 pb-4 md:px-6">A Floor skill (building) will tell the agent to read the factory address from <span className="mono">get_vault_info</span> and check every unsigned transaction against it before signing.</p>
        </div>

        <div id="b402" className="col-span-4 md:col-span-8 lg:col-span-6">
          <div className="flex flex-wrap items-center gap-3"><h2 className="h3">Pay per call with b402</h2><span className="badge b-warn">building</span></div>
          <ul className="mt-4 space-y-3">
            {[
              "Free tools are open, with a per-IP rate limit. Paid tools answer HTTP 402 with the price. The agent signs an EIP-712 payment, retries, and gets the result.",
              "b402 is Binance's x402 on BSC. The facilitator checks the signed payment and settles it on-chain in U, USD1, USDT or USDC. Gas is sponsored.",
              "No sign-up and no API key. The payment is the credential.",
              "Prices above are proposals (0.01 to 0.05 USD per call), not final.",
              "b402 does not pay for LLM inference. It pays for calls to Floor's API.",
              "Production b402 access is by merchant application and is not granted yet. If it does not arrive in time, the same flow runs on a self-run x402 facilitator and we will say so.",
            ].map((t) => <li key={t} className="xh-li body" style={{ fontSize: 15 }}>{t}</li>)}
          </ul>
        </div>

        <div id="keeper" className="col-span-4 md:col-span-8 lg:col-span-6 sunken">
          <div className="flex flex-wrap items-center gap-3"><h2 className="h3">Keeper log</h2><span className="badge">Mock</span></div>
          <p className="body mt-2" style={{ fontSize: 15 }}>The keeper calls <span className="mono">rebalance(Swap)</span>, one swap per call. The log is public. Each run records what it decided and why, so anyone can check it. The rows below are replayed from the NVDA 2022 backtest, not from the chain.</p>
          <div className="tbl-wrap mt-4">
            <table className="tbl">
              <caption className="sr-only">Example keeper runs replayed from the backtest</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Decision</th><th scope="col" className="r">Value</th><th scope="col">Tx</th></tr></thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.i}>
                    <td className="mono whitespace-nowrap">{fd(e.date)}</td>
                    <td>{e.side === "buy" ? "Buy" : "Sell"} NVDAB, target stock {`$${Math.round(e.exposureTarget).toLocaleString("en-US")}`}</td>
                    <td className="r">{`$${Math.round(e.value).toLocaleString("en-US")}`}</td>
                    <td className="mono text-muted">n/a</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small mt-3">Who may call it: an automated keeper triggers rebalances, and a Binance Agentic Wallet holds the same role as a supervised second keeper. Neither can move your funds, withdraw or set prices. After 4 hours idle, anyone can call <span className="mono">rebalancePublic</span>.</p>
        </div>

        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
          <div className="border-l-2 pl-4" style={{ borderColor: "var(--warning)" }}>
            <p className="label warn">Honest note</p>
            <p className="body mt-1" style={{ fontSize: 15 }}>The Agentic Wallet keeper depends on Developer Mode, whose confirmation and risk-check behaviour for a new contract is still being tested. The vault does not rely on it: a plain wallet is the main keeper and the public fallback exists.</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
