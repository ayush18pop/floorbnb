"use client";
import { useState } from "react";
import { getSource, fmt, fmtW, receivedText, type Received, isoDate, phaseOf, num, ASSETS, type ExitKind, type PositionView } from "@/lib/adapters";
import { BRAND } from "@/lib/brand";
import { Addr, Dialog, Notice, ExampleBadge } from "./ui";
import { ExpandRow } from "@/components/ui/expand-row";

/** Close to USDT (requestClose, then closeToUSDT) or Exit in kind (always allowed). */
export function CloseModal({ p, open, onClose, initial = "usdt", onDone }: { p: PositionView; open: boolean; onClose: () => void; initial?: "usdt" | "kind"; onDone: () => void }) {
  const [pick, setPick] = useState<"usdt" | "kind">(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: ExitKind; tx: string; snap: Received } | null>(null);
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
    // What the vault holds right now, kept for the confirmation (after the exit the page re-reads a closed, empty vault).
    const snap: Received = { usdt: p.usdtBalance, tokens: kind === "exitInKind" ? p.holdings.filter((h) => h.amount > 0n).map((h) => ({ symbol: h.symbol, amount: h.amount, value: h.value })) : [] };
    try { const tx = await getSource().exit(p.status.vault, kind, p.owner); setDone({ kind, tx, snap }); onDone(); }
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
          {done.kind !== "requestClose" && <p className="mono text-[14px] leading-6" data-testid="exit-received">{receivedText(p.exit ? { usdt: p.exit.usdtOut, tokens: p.exit.tokens } : done.snap, done.kind)}</p>}
          <p className="small">Transaction <Addr value={done.tx} kind="tx" /> <ExampleBadge /></p>
          <button type="button" className="btn btn-secondary" onClick={close}>Close</button>
        </div>
      ) : (
        <div className="space-y-3">
          {early ? <p className="small !text-ink-2">Leaving before {isoDate(p.maturity)} removes the floor for this position.</p> : <p className="small">The term has ended. The floor no longer applies.</p>}
          <div className="grid gap-px bg-grid sm:grid-cols-2">
            <button type="button" className="opt !p-4" aria-pressed={pick === "usdt"} onClick={() => setPick("usdt")}>
              <p className="h3">Close to USDT</p>
              <p className="small mt-1">{phase === "cashLock" ? "The vault already holds only USDT." : "Sold in the next trading window, then sent to you."}</p>
              <p className="label mt-3">Estimated <ExampleBadge className="ml-2" /></p>
              <p className="mono mt-1 text-[18px]">{fmt(estimate)} USDT</p>
            </button>
            <button type="button" className="opt !p-4" aria-pressed={pick === "kind"} onClick={() => setPick("kind")}>
              <p className="h3">Exit in kind</p>
              <p className="small mt-1">What the vault holds, right away.</p>
              <p className="label mt-3">You receive <ExampleBadge className="ml-2" /></p>
              <p className="mono mt-1 text-[13px] leading-5">{p.holdings.filter((h) => h.amount > 0n).map((h) => `${fmtW(h.amount, 4)} ${h.symbol} (≈ ${fmtW(h.value)})`).join(" · ")}{p.holdings.some((h) => h.amount > 0n) ? " + " : ""}{fmtW(p.usdtBalance)} USDT</p>
            </button>
          </div>
          <ExpandRow label={pick === "usdt" ? "Close to USDT" : "Exit in kind"} more="How it works" less="Hide" flush lead={<p className="label">{pick === "usdt" ? "Close to USDT" : "Exit in kind"}</p>}>
            {pick === "usdt" ? (
              <div className="space-y-2">
                <p className="body" style={{ fontSize: 14 }}>{phase === "cashLock" ? "The vault already holds only USDT. It sends it to you now." : "The vault sells all stock in the next trading window, then sends you USDT. Two steps: request close, then confirm once the stock is sold."}</p>
                <p className="small">Estimate: {fmt(estimate)} USDT {stock > 0 ? `after about ${bps.toFixed(1)} bps swap cost on the stock part` : "no swap needed"}</p>
              </div>
            ) : (
              <p className="body" style={{ fontSize: 14 }}>Get what the vault holds now, straight away. Works even if a token is paused. A paused token is skipped.</p>
            )}
          </ExpandRow>
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
