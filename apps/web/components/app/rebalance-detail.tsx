"use client";
import { fmt, fmtW, type VaultEvent } from "@/lib/adapters";
import { Dialog, ExampleBadge, UtcTime } from "./ui";
import { AddrLink, TxLink } from "./explorer-link";

type Rb = Extract<VaultEvent, { type: "Rebalanced" }>;
const SIGNER = { keeper: ["Keeper wallet", "b-pos"], agentic: ["Agentic wallet", "b-warn"], public: ["Public caller", ""] } as const;

/** One rebalance, in plain rows. Fields the chain does not log (trigger, cost) are shown only when known. */
export function RebalanceDetail({ e, onClose }: { e: Rb | null; onClose: () => void }) {
  const sig = e ? SIGNER[e.signer] : SIGNER.keeper;
  return (
    <Dialog open={!!e} onClose={onClose} title={e ? `Rebalance #${e.id} · ${e.buy ? "Bought" : "Sold"} ${e.symbol}` : ""} wide labelledBy="rb-title">
      {e && (
        <div className="space-y-5">
          <p className="label">Rebalance #{e.id} <ExampleBadge className="ml-2" /></p>
          <dl className="kv -mx-6">
            <div className="contents"><dt>Time</dt><dd><UtcTime t={e.time} /></dd></div>
            {e.trigger && <div className="contents"><dt>Trigger</dt><dd>{e.trigger}</dd></div>}
            <div className="contents"><dt>Action</dt><dd>{e.buy ? `BUY ${e.symbol}: ${fmtW(e.amountIn)} USDT → ${fmtW(e.amountOut, 4)} ${e.symbol}` : `SELL ${fmtW(e.amountIn, 4)} ${e.symbol} → ${fmtW(e.amountOut)} USDT`}</dd></div>
            <div className="contents"><dt>Price source</dt><dd>PancakeSwap v3, 10-minute average</dd></div>
            {e.minOut !== undefined && <div className="contents"><dt>Minimum out</dt><dd>{fmtW(e.minOut, e.buy ? 4 : 2)} {e.buy ? e.symbol : "USDT"}</dd></div>}
            <div className="contents"><dt>Received</dt><dd className="pos">{fmtW(e.amountOut, e.buy ? 4 : 2)} {e.buy ? e.symbol : "USDT"}</dd></div>
            {e.costBps !== undefined && <div className="contents"><dt>Cost</dt><dd>{e.costBps.toFixed(1)} bps (estimate)</dd></div>}
            <div className="contents"><dt>Caller</dt><dd className="flex flex-wrap items-center gap-3"><AddrLink address={e.caller} /><span className={`badge ${sig[1]}`}>{sig[0]}</span></dd></div>
            <div className="contents"><dt>Transaction</dt><dd><TxLink hash={e.tx} /></dd></div>
          </dl>
          {e.stockPctBefore !== undefined && e.stockPctAfter !== undefined && (
            <div>
              <p className="label mb-2">Stock share of value</p>
              {([["Before", e.stockPctBefore], ["After", e.stockPctAfter]] as const).map(([k, v]) => (
                <div key={k} className="mb-2 grid grid-cols-[56px_1fr_48px] items-center gap-3 mono small"><span>{k}</span><span className="h-5 border border-grid-strong"><span className="block h-full bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]" style={{ width: `${v}%` }} /></span><span className="text-right">{fmt(v, 0)}%</span></div>
              ))}
            </div>
          )}
          <p className="small">The keeper can only trigger trades the vault&apos;s rules allow. It cannot withdraw.</p>
        </div>
      )}
    </Dialog>
  );
}
