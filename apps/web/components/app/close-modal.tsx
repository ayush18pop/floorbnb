"use client";
import { useState } from "react";
import { getSource, fmt, fmtW, isoDate, phaseOf, num, ASSETS, type ExitKind, type PositionView } from "@/lib/adapters";
import { BRAND } from "@/lib/brand";
import { Addr, Dialog, Notice, ExampleBadge } from "./ui";

/** Close to USDT (requestClose, then closeToUSDT) or Exit in kind (always allowed). */
export function CloseModal({ p, open, onClose, initial = "usdt", onDone }: { p: PositionView; open: boolean; onClose: () => void; initial?: "usdt" | "kind"; onDone: () => void }) {
  const [pick, setPick] = useState<"usdt" | "kind">(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: ExitKind; tx: string } | null>(null);
  const phase = phaseOf(p);
  const early = p.asOf < p.maturity;
  const V = num(p.status.V);
  const stock = num(p.status.exposure);
  const bps = p.holdings.reduce((a, h) => a + (ASSETS.find((x) => x.symbol === h.symbol)!.roundTripBps * h.weightBps) / 10_000, 0);
  const estimate = V - (stock * bps) / 10_000;
  const kind: ExitKind = pick === "kind" ? "exitInKind" : phase === "cashLock" || phase === "closing" ? "closeToUSDT" : "requestClose";
  const action = kind === "exitInKind" ? "Exit in kind" : kind === "closeToUSDT" ? "Close to USDT" : "Request close";

  const run = async () => {
    setBusy(true); setErr(null);
    try { const tx = await getSource().exit(p.status.vault, kind, p.owner); setDone({ kind, tx }); onDone(); }
    catch (e) { const m = e instanceof Error ? e.message : String(e); setErr(/reject|denied/i.test(m) ? "You rejected the request in your wallet. Nothing was sent." : m); }
    finally { setBusy(false); }
  };
  const close = () => { setDone(null); setErr(null); onClose(); };

  return (
    <Dialog open={open} onClose={close} title="How do you want to leave?" wide labelledBy="close-title">
      {done ? (
        <div className="space-y-4">
          <Notice kind="info" title={done.kind === "requestClose" ? "Close requested." : "Done."}>
            {done.kind === "requestClose" ? "The vault sells its stock in the next trading window. When the stock is sold, come back and choose Close to USDT to receive your USDT." : done.kind === "closeToUSDT" ? "Your USDT was sent to your wallet." : "The vault sent you what it held. Tokens the issuer paused were skipped and stay in the vault."}
          </Notice>
          <p className="small">Transaction <Addr value={done.tx} kind="tx" /> <ExampleBadge /></p>
          <button type="button" className="btn btn-secondary" onClick={close}>Close</button>
        </div>
      ) : (
        <div className="space-y-5">
          {early ? <p className="small !text-ink-2">Leaving before {isoDate(p.maturity)} removes the floor for this position.</p> : <p className="small">The term has ended. The floor no longer applies.</p>}
          <div className="grid gap-px bg-grid sm:grid-cols-2">
            <button type="button" className="opt" aria-pressed={pick === "usdt"} onClick={() => setPick("usdt")}>
              <p className="label">Option 1</p>
              <p className="h3 mt-1">Close to USDT</p>
              <p className="body mt-2" style={{ fontSize: 14 }}>{phase === "cashLock" ? "The vault already holds only USDT. It sends it to you now." : "The vault sells all stock in the next trading window, then sends you USDT. Two steps: request close, then confirm once the stock is sold."}</p>
              <div className="mt-4 border-t border-grid pt-3">
                <p className="label">Estimated <ExampleBadge className="ml-2" /></p>
                <p className="mono mt-1 text-[18px]">{fmt(estimate)} USDT</p>
                <p className="small">{stock > 0 ? `after about ${bps.toFixed(1)} bps swap cost on the stock part` : "no swap needed"}</p>
              </div>
            </button>
            <button type="button" className="opt" aria-pressed={pick === "kind"} onClick={() => setPick("kind")}>
              <p className="label">Option 2</p>
              <p className="h3 mt-1">Exit in kind</p>
              <p className="body mt-2" style={{ fontSize: 14 }}>Get what the vault holds now, straight away. Works even if a token is paused. A paused token is skipped.</p>
              <div className="mt-4 border-t border-grid pt-3">
                <p className="label">You receive <ExampleBadge className="ml-2" /></p>
                <p className="mono mt-1 text-[14px] leading-6">{p.holdings.filter((h) => h.amount > 0n).map((h) => `${fmtW(h.amount)} ${h.symbol}`).join(" · ")}{p.holdings.some((h) => h.amount > 0n) ? " + " : ""}{fmtW(p.usdtBalance)} USDT</p>
              </div>
            </button>
          </div>
          {err && <Notice kind="neg" title="Not sent">{err}</Notice>}
          <div className="btn-stack flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Waiting for wallet…" : action}</button>
          </div>
          <p className="small">{BRAND.name} cannot move your funds. Only your wallet can call these functions on your vault.</p>
        </div>
      )}
    </Dialog>
  );
}
