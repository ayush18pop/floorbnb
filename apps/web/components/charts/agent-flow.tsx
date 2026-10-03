import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";

/**
 * Agent flow (assets/svg/agent-flow.svg as boxes): orthogonal lines, 6px arrowheads, mono labels.
 * Plain HTML so it reflows to one column at 343px. Accent is used once: the vault's floor line.
 */

function Node({ title, lines, accent = false, sub }: { title: string; sub?: string; lines: string[]; accent?: boolean }) {
  return (
    <div className="relative h-full border border-grid-strong bg-surface p-4" style={accent ? { borderBottom: "2px solid var(--floor-line)" } : undefined}>
      <p className="label text-ink!">{title}</p>
      {sub && <p className="label mt-0.5">{sub}</p>}
      <ul className="mono mt-3 space-y-0.5 text-[12px] leading-snug text-ink-2">
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}

/** Horizontal or vertical connector with a label and a 6px arrowhead. */
function Link({ dir, label, back = false, className = "" }: { dir: "h" | "v"; label?: ReactNode; back?: boolean; className?: string }) {
  if (dir === "h")
    return (
      <div className={`flex flex-col items-center justify-center gap-1 px-1 ${className}`} aria-hidden="true">
        {label && <span className="label text-center" style={{ fontSize: 10 }}>{label}</span>}
        <span className="relative block h-px w-full" style={{ background: "var(--text-muted)" }}>
          <i className="absolute top-1/2 -translate-y-1/2" style={{ [back ? "left" : "right"]: -1, borderStyle: "solid", borderWidth: back ? "3.5px 6px 3.5px 0" : "3.5px 0 3.5px 6px", borderColor: back ? "transparent var(--text-muted) transparent transparent" : "transparent transparent transparent var(--text-muted)" }} />
        </span>
      </div>
    );
  return (
    <div className={`flex items-center justify-center gap-2 py-1 ${className}`} aria-hidden="true">
      <span className="relative block h-6 w-px" style={{ background: "var(--text-muted)" }}>
        <i className="absolute left-1/2 -translate-x-1/2" style={{ [back ? "top" : "bottom"]: -1, borderStyle: "solid", borderWidth: back ? "0 3.5px 6px 3.5px" : "6px 3.5px 0 3.5px", borderColor: back ? "transparent transparent var(--text-muted) transparent" : "var(--text-muted) transparent transparent transparent" }} />
      </span>
      {label && <span className="label" style={{ fontSize: 10 }}>{label}</span>}
    </div>
  );
}

export function AgentFlow() {
  const agent = <Node title="Your agent" sub="Any MCP client" lines={["Claude, ChatGPT, OpenClaw", "its own wallet signs"]} />;
  const mcp = <Node title={`${BRAND.name} MCP server`} sub="Streamable HTTP" lines={["quote_protection", "build_create_position_tx", "get_status, backtest"]} />;
  const b402 = <Node title="b402 facilitator" sub="Binance x402 on BSC" lines={["verifies the signed payment", "settles on BSC", "gas sponsored"]} />;
  const keeper = <Node title="Keeper" sub="EOA, plus Agentic Wallet" lines={["rebalance(swap)", "cannot withdraw", "cannot set prices"]} />;
  const vault = <Node accent title={`${BRAND.name} vault`} sub="One contract per position" lines={["holds user funds", "CPPI, m = 4", "owner can always exit"]} />;
  const dex = <Node title="PancakeSwap" sub="BSC tokenized-stock liquidity" lines={["spot swaps only", "stock for USDT and back"]} />;

  return (
    <div role="group" aria-label="How an agent uses Floor. The agent calls the MCP server and pays through b402. A keeper calls rebalance on the vault. The vault swaps on PancakeSwap.">
      {/* tablet and up: 3 columns with connectors */}
      <div className="hidden md:grid items-stretch" style={{ gridTemplateColumns: "1fr 96px 1fr 96px 1fr", rowGap: 0 }}>
        <div>{agent}</div>
        <Link dir="h" label="1 call" />
        <div>{mcp}</div>
        <Link dir="h" label="2 pay" />
        <div>{b402}</div>

        <div />
        <div />
        <Link dir="v" label="reads state" className="justify-start" />
        <div />
        <div />

        <div>{keeper}</div>
        <Link dir="h" label="3 rebalance()" />
        <div>{vault}</div>
        <Link dir="h" label="4 swap" />
        <div>{dex}</div>
      </div>

      {/* phone: one column */}
      <div className="md:hidden flex flex-col">
        {agent}
        <Link dir="v" label="1 call" />
        {mcp}
        <Link dir="v" label="2 pay" />
        {b402}
        <div className="h-6" />
        {keeper}
        <Link dir="v" label="3 rebalance()" />
        {vault}
        <Link dir="v" label="4 swap" />
        {dex}
      </div>
      <p className="label mt-6" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
        User funds stay in the vault contract, never in the keeper wallet. b402 pays for Floor API calls. It does not pay for LLM inference.
      </p>
    </div>
  );
}
