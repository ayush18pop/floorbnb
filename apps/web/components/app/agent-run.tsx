"use client";
import { useState } from "react";
import { Check } from "lucide-react";

const STEPS = [
  ["01", "Discover", "The agent lists Floor's MCP tools and calls get_floor_info."],
  ["02", "Quote", "It asks for a 90% floor on 500 USDT."],
  ["03", "Pay", "Floor answers 402. The agent pays with b402."],
  ["04", "Build", "build_create_position_tx returns two unsigned transactions."],
  ["05", "Sign", "The user's own Agentic Wallet signs both."],
  ["06", "Done", "A new vault exists on BNB Chain."],
] as const;

const TRACE: [number, string, string, string, string][] = [
  [0, "16:02:09", "agent →", "tools/call get_floor_info", "{}"],
  [1, "16:02:11", "agent →", "tools/call quote_protection", "assets=NVDAB,SPCXB,QQQB depositUsd=500 floorPct=90"],
  [2, "16:02:11", "floor ←", "402 PAYMENT-REQUIRED", "scheme=b402 asset=USD1"],
  [2, "16:02:12", "agent →", "baw x402-payment sign", "ok"],
  [2, "16:02:14", "floor ←", "200", "startingExposurePct=40 floorValue=450 gapTolerance=24%"],
  [3, "16:02:20", "agent →", "tools/call build_create_position_tx", "2 unsigned txs: approve, createPosition"],
  [4, "16:02:31", "wallet →", "baw contract-call execute", "approve BROADCASTED"],
  [4, "16:02:36", "wallet →", "baw contract-call execute", "createPosition BROADCASTED"],
  [5, "16:02:44", "bsc ←", "PositionCreated", "vault=0x7a3f…c91e"],
];

/** Example only: a scripted trace. Click a step to highlight its lines. */
export function AgentRun() {
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ol className="border-b border-grid lg:border-b-0 lg:border-r">
        {STEPS.map(([n, t, d], i) => (
          <li key={n} className="border-b border-grid last:border-b-0">
            <button type="button" className="grid w-full grid-cols-[28px_40px_1fr] items-start gap-3 p-4 text-left hover:bg-sunken md:px-6" aria-pressed={sel === i} onClick={() => setSel(sel === i ? null : i)} style={sel === i ? { background: "var(--accent-soft)" } : undefined}>
              <span className={`mt-0.5 grid h-5 w-5 place-items-center border ${i === 5 ? "border-positive text-positive" : "border-grid-strong"}`}>{i === 5 && <Check size={12} strokeWidth={2} />}</span>
              <span className="mono small">{n}</span>
              <span><span className="label !text-ink block">{t}</span><span className="small block mt-1 !text-ink-2">{d}</span></span>
            </button>
          </li>
        ))}
      </ol>
      <section className="min-w-0 p-4 md:p-6" aria-labelledby="trace-h">
        <h2 id="trace-h" className="label mb-4">Trace · example</h2>
        <div className="overflow-x-auto"><ul className="mono min-w-[520px] space-y-2 text-[13px] leading-6">
          {TRACE.map(([s, t, who, what, rest], i) => (
            <li key={i} className="grid grid-cols-[72px_72px_1fr] gap-2" style={{ opacity: sel === null || sel === s ? 1 : 0.35 }}>
              <span className="text-muted">{t}</span><span className="text-ink-2">{who}</span><span><span className="acc">{what}</span> <span className="text-ink-2">{rest}</span></span>
            </li>
          ))}
        </ul></div>
        <p className="small mt-6">Scripted example. The MCP server is not live yet, and no transaction was sent.</p>
      </section>
    </div>
  );
}
