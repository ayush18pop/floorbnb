import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { AppShell } from "@/components/app/shell";
import { Xh } from "@/components/ui/xh";
import { BRAND } from "@/lib/brand";
import { MCP_URL, PUBLIC_DELAY_HOURS } from "@/lib/app-config";

export const metadata: Metadata = { title: "Agents" };

/** Names and inputs: docs/EXECUTION_PLAN.md A18 (MCP server). Prices are proposals, not final. */
const TOOLS = [
  { name: "get_floor_info", what: "Factory address, assets, terms, disclosure. Call this first.", paid: false, state: "No" },
  { name: "list_assets", what: "Supported bStocks with price and market status.", paid: false, state: "No" },
  { name: "get_status", what: "Value, floor, cushion and state of a position.", paid: false, state: "No" },
  { name: "get_rebalance_history", what: "Recent keeper rebalances. Public.", paid: false, state: "No" },
  { name: "build_create_position_tx", what: "Returns the unsigned USDT approve and createPosition transactions.", paid: false, state: "Unsigned tx" },
  { name: "build_exit_tx", what: "Returns an unsigned requestClose, closeToUSDT or exitInKind transaction.", paid: false, state: "Unsigned tx" },
  { name: "quote_protection", what: "Floor, starting split and backtest results for a basket.", paid: true, state: "No", price: "0.01 USD (proposed)" },
  { name: "backtest", what: "Stored backtest results for a basket and floor. Past data.", paid: true, state: "No", price: "not set" },
  { name: "simulate_gap", what: "What a sudden fall of X% before any rebalance does.", paid: true, state: "No", price: "not set" },
] as const;

const url = MCP_URL || "https://mcp.<domain>/mcp";
const config = `{
  "mcpServers": {
    "floor": { "type": "http", "url": "${url}" }
  }
}`;
const PAY = [
  "Agent calls quote_protection",
  "Floor answers 402 Payment Required",
  "Agent signs a b402 payment (USD1, U, USDT or USDC)",
  "Floor verifies, settles and returns the quote",
];

export default function AgentsPage() {
  return (
    <AppShell active="agents" eyebrow="For agents · building" title={`Use ${BRAND.name} from any agent.`} example={false}>
      <div className="border-b border-grid p-4 md:p-6">
        <p className="body-l">{BRAND.name}&apos;s actions are MCP tools. Agents pay per call with b402 for the paid tools. Tools that change state return unsigned transactions, and the agent&apos;s own wallet signs. {BRAND.name} never signs for users.</p>
        <p className="small mt-3">Status: building. The server is not live{MCP_URL ? "" : ", so the address below is a placeholder"}. <Link href="/docs/agents" className="prose-link">Read the docs</Link> · <Link href="/agents/run" className="prose-link">See an example run</Link> · <Link href="/app/keeper" className="prose-link">Keeper log</Link></p>
      </div>

      <div>
        <section className="min-w-0 border-b border-grid" aria-labelledby="tools-h">
          <h2 id="tools-h" className="label p-4 md:px-6">MCP tools</h2>
          <div className="tbl-wrap px-2 pb-4 md:px-4">
            <table className="tbl">
              <caption className="sr-only">MCP tools, what they do, price and whether they change state</caption>
              <thead><tr><th scope="col">Tool</th><th scope="col">What it does</th><th scope="col">Price</th><th scope="col">Changes state</th></tr></thead>
              <tbody>
                {TOOLS.map((t) => (
                  <tr key={t.name}>
                    <td className="mono !text-accent whitespace-nowrap">{t.name}</td>
                    <td className="min-w-[200px]">{t.what}</td>
                    <td>{t.paid ? <><span className="badge b-neg">Paid · b402</span><span className="small mt-1 block">{"price" in t ? t.price : ""}</span></> : <span className="badge b-pos">Free</span>}</td>
                    <td className="whitespace-nowrap">{t.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="grid lg:grid-cols-2">
          <section aria-labelledby="conn-h" className="min-w-0 border-b border-grid lg:border-b-0 lg:border-r">
            <h2 id="conn-h" className="label p-4 md:px-6">Connect · example</h2>
            <pre className="code !border-0 !bg-transparent !px-4 !py-2 md:!px-6" tabIndex={0} aria-label="Example MCP client config">{config}</pre>
          </section>
          <section aria-labelledby="pay-h" className="min-w-0 p-4 md:p-6">
            <h2 id="pay-h" className="label mb-4">How an agent pays</h2>
            <ol className="space-y-3">
              {PAY.map((t, i) => <li key={t} className="grid grid-cols-[32px_1fr] items-center gap-3 text-[15px] text-ink-2"><span className="mono grid h-8 w-8 place-items-center border border-grid-strong text-[13px]">{i + 1}</span>{t}</li>)}
            </ol>
          </section>
        </div>
      </div>

      <div className="relative border-t border-grid p-4 md:p-6">
        <Xh style={{ left: 0, top: 0 }} /><Xh style={{ left: "100%", top: 0 }} />
        <div className="notice info"><Info size={18} strokeWidth={1.5} aria-hidden="true" /><p>Gas for b402 payments is sponsored. {BRAND.name} never signs for users. b402 production access is by merchant application and is not granted yet; if it does not arrive in time, the same flow runs on a self-run x402 facilitator and we will say so. b402 pays for calls to {BRAND.name}&apos;s API, not for LLM inference.</p></div>
        <div className="notice warn mt-4"><Info size={18} strokeWidth={1.5} aria-hidden="true" /><p><b>Agentic Wallet keeper.</b> A plain keeper wallet is the main keeper. A Binance Agentic Wallet holds the same role as a supervised second keeper. It depends on Developer Mode, whose confirmation and risk-check behaviour for a new contract is still being tested. The vault does not rely on it, and after {PUBLIC_DELAY_HOURS} hours idle anyone can call <span className="mono">rebalancePublic</span>.</p></div>
      </div>
    </AppShell>
  );
}
