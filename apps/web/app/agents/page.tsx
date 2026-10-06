import Link from "next/link";
import { Info } from "lucide-react";
import { AppShell } from "@/components/app/shell";
import { Xh } from "@/components/ui/xh";
import { Tabs } from "@/components/ui/tabs";
import { BRAND } from "@/lib/brand";
import { MCP_URL, PAID_TOKENS, PAID_TOOL_PRICE_LABEL, PUBLIC_DELAY_HOURS } from "@/lib/app-config";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/agents", "Agents");

/** Names and inputs: docs/EXECUTION_PLAN.md A18 (MCP server). Paid tools share one price (PAID_TOOL_PRICE_LABEL in lib/app-config.ts). */
const TOOLS = [
  { name: "get_floor_info", what: "Factory address, assets, terms, disclosure. Call this first.", paid: false, state: "No" },
  { name: "list_assets", what: "Supported bStocks with price and market status.", paid: false, state: "No" },
  { name: "get_status", what: "Value, floor, cushion and state of a position.", paid: false, state: "No" },
  { name: "get_rebalance_history", what: "Recent keeper rebalances. Public.", paid: false, state: "No" },
  { name: "build_create_position_tx", what: "Returns the unsigned USDT approve and createPosition transactions.", paid: false, state: "Unsigned tx" },
  { name: "build_exit_tx", what: "Returns an unsigned requestClose, closeToUSDT or exitInKind transaction.", paid: false, state: "Unsigned tx" },
  { name: "quote_protection", what: "Floor, starting split and backtest results for a basket.", paid: true, state: "No" },
  { name: "backtest", what: "Stored backtest results for a basket and floor. Past data.", paid: true, state: "No" },
  { name: "simulate_gap", what: "What a sudden fall of X% before any rebalance does.", paid: true, state: "No" },
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
  `Agent signs an x402 payment (${PAID_TOKENS})`,
  "Floor verifies, settles and returns the quote",
];

export default function AgentsPage() {
  const tools = (
    <div className="tbl-wrap px-2 pb-2 md:px-4">
      <table className="tbl tbl-tight tbl-nowrap">
        <caption className="sr-only">MCP tools, what they do, price and whether they change state</caption>
        <thead><tr><th scope="col">Tool</th><th scope="col">What it does</th><th scope="col">Price</th><th scope="col">Changes state</th></tr></thead>
        <tbody>
          {TOOLS.map((t) => (
            <tr key={t.name}>
              <td className="mono !text-accent whitespace-nowrap">{t.name}</td>
              <td className="min-w-[200px]">{t.what}</td>
              <td>{t.paid ? <><span className="badge b-neg">Paid · x402</span><span className="small ml-2">{PAID_TOOL_PRICE_LABEL}</span></> : <span className="badge b-pos">Free</span>}</td>
              <td className="whitespace-nowrap">{t.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small px-2 py-3 md:px-2">Paid tools cost {PAID_TOOL_PRICE_LABEL}, paid in {PAID_TOKENS}. Payments settle through {BRAND.name}&apos;s own x402 facilitator today. b402, Binance&apos;s facilitator, is wired and verified for supported and verify only; settle has not run live.</p>
    </div>
  );
  const connect = (
    <div className="grid lg:grid-cols-2">
      <section aria-labelledby="conn-h" className="min-w-0 border-b border-grid lg:border-b-0 lg:border-r">
        <h2 id="conn-h" className="label p-4 pb-1 md:px-6">Connect</h2>
        <pre className="code !border-0 !bg-transparent !px-4 !py-2 md:!px-6" tabIndex={0} aria-label="Example MCP client config">{config}</pre>
        <p className="small px-4 pb-3 md:px-6">Hosted on a free Render instance, so the first call after a quiet period can take a few seconds.</p>
      </section>
      <section aria-labelledby="pay-h" className="min-w-0 p-4 md:p-6">
        <h2 id="pay-h" className="label mb-3">How an agent pays</h2>
        <ol className="space-y-2">
          {PAY.map((t, i) => <li key={t} className="grid grid-cols-[32px_1fr] items-center gap-3 text-[14px] text-ink-2"><span className="mono grid h-7 w-7 place-items-center border border-grid-strong text-[13px]">{i + 1}</span>{t}</li>)}
        </ol>
      </section>
    </div>
  );
  const notes = (
    <div className="space-y-3 p-4 md:p-6">
      <div className="notice info"><Info size={18} strokeWidth={1.5} aria-hidden="true" /><p>Paid calls cost {PAID_TOOL_PRICE_LABEL} and settle through {BRAND.name}&apos;s own x402 facilitator today. {BRAND.name} never signs for users. b402 (Binance&apos;s x402 facilitator, gas sponsored) supported and verify have been run live; settle has not, so it is not the live path yet. Payments cover calls to {BRAND.name}&apos;s API, not LLM inference.</p></div>
      <div className="notice warn"><Info size={18} strokeWidth={1.5} aria-hidden="true" /><p><b>Agentic Wallet keeper.</b> A plain keeper wallet is the main keeper. A Binance Agentic Wallet holds the same role as a supervised second keeper. It depends on Developer Mode, whose confirmation and risk-check behaviour for a new contract is still being tested. The vault does not rely on it, and after {PUBLIC_DELAY_HOURS} hours idle anyone can call <span className="mono">rebalancePublic</span>.</p></div>
    </div>
  );
  return (
    <AppShell active="agents" eyebrow="For agents · live on mainnet" title={`Use ${BRAND.name} from any agent.`} example={false}>
      <div className="fill flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-grid px-4 py-2 md:px-6">
          <p className="body !max-w-none">{BRAND.name}&apos;s actions are MCP tools. The agent&apos;s own wallet signs; {BRAND.name} never signs for users.</p>
          <p className="small whitespace-nowrap">Live on mainnet. <Link href="/docs/agents" className="prose-link">Docs</Link> · <Link href="/agents/run" className="prose-link">Example run</Link> · <Link href="/app/keeper" className="prose-link">Keeper log</Link></p>
        </div>
        <div className="relative min-w-0">
          <Xh style={{ left: 0, top: 0 }} /><Xh style={{ left: "100%", top: 0 }} />
          <Tabs label="Agents" items={[
            { id: "tools", label: "MCP tools", panel: tools },
            { id: "connect", label: "Connect and pay", panel: connect },
            { id: "notes", label: "Notes", panel: notes },
          ]} />
        </div>
      </div>
    </AppShell>
  );
}
