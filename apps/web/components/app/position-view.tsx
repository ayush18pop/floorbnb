"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { getSource, isAddress, fmt, fmtW, num, pct, phaseOf, stockPct, daysLeft, isoDate, stamp, dow, nextWindow, shortAddr, type VaultEvent, type PositionView } from "@/lib/adapters";
import { useAsync } from "@/lib/adapters/use";
import { BRAND } from "@/lib/brand";
import { Xh } from "@/components/ui/xh";
import { Banner, ErrorBox, ExampleBadge, Notice, Skeleton, Tile } from "./ui";
import { Tabs } from "@/components/ui/tabs";
import { InfoPopover } from "@/components/ui/info-popover";
import { useViewportHeight, useViewportWidth } from "@/components/ui/use-viewport";
import { PhaseBadges } from "./phase";
import { PositionChart, type Band } from "./position-chart";
import { CloseModal } from "./close-modal";
import { RebalanceDetail } from "./rebalance-detail";

type Rb = Extract<VaultEvent, { type: "Rebalanced" }>;

function describe(e: VaultEvent): { title: string; sub: string } {
  switch (e.type) {
    case "PositionCreated": return { title: "Deposit", sub: `${fmtW(e.deposit)} USDT` };
    case "Rebalanced": return e.buy ? { title: `Buy ${e.symbol}`, sub: `${fmtW(e.amountIn)} USDT` } : { title: `Sell ${fmtW(e.amountIn)} ${e.symbol}`, sub: `→ ${fmtW(e.amountOut)} USDT` };
    case "CashLock": return { title: "Sold all stock · cash lock", sub: `${fmtW(e.usdtOut)} USDT` };
    case "CloseRequested": return { title: "Close requested", sub: "" };
    case "Closed": return { title: "Closed to USDT", sub: `${fmtW(e.usdtOut)} USDT` };
    case "ExitInKind": return { title: "Exited in kind", sub: `${fmtW(e.usdtOut)} USDT + tokens` };
  }
}

export function PositionScreen() {
  const sp = useSearchParams();
  const { address } = useAccount();
  const source = getSource();
  const v = sp.get("v");
  const [rev, setRev] = useState(0);
  const [modal, setModal] = useState<null | "usdt" | "kind">(null);
  const [sel, setSel] = useState<Rb | null>(null);
  // Without ?v= the mock opens its first position; chain needs an explicit vault or the first of the connected owner.
  const pos = useAsync<{ p: PositionView | null; ev: VaultEvent[]; hist: { t: number; v: number }[] }>(async () => {
    let vault = isAddress(v) ? v : null;
    if (!vault) { const l = await source.listPositions(address); vault = l[0]?.status.vault ?? null; }
    if (!vault) return { p: null, ev: [], hist: [] };
    const [p, ev, hist] = await Promise.all([source.getPosition(vault), source.getEvents(vault).catch(() => []), source.getHistory(vault).catch(() => [])]);
    return { p, ev, hist };
  }, `${v}${address}${rev}`, `${v}${address}`); // same group on refresh: keep the position (and the open close dialog) on screen

  const p = pos.data?.p ?? null;
  const ev = useMemo(() => pos.data?.ev ?? [], [pos.data]);
  const hist = useMemo(() => pos.data?.hist ?? [], [pos.data]);
  const marks = useMemo(() => ev.filter((e) => e.type === "Rebalanced").map((e) => e.time), [ev]);

  const vh = useViewportHeight(), vw = useViewportWidth();
  const chartH = vw >= 1200 ? Math.max(170, Math.min(400, vh - 450)) : 240;

  if (pos.loading) return <Skeleton lines={6} />;
  if (pos.error) return <ErrorBox message={pos.error} />;
  if (!p) return <div className="p-4 md:p-6"><Notice kind="info" title="No position found.">Check the address, or <Link href="/app/positions" className="prose-link">see your positions</Link>.</Notice></div>;

  const ph = phaseOf(p);
  const V = num(p.status.V), F = num(p.status.floor), D = num(p.deposit);
  const chg = D > 0 ? ((V - D) / D) * 100 : 0;
  const sPct = stockPct(p);
  const basket = p.holdings.map((h) => h.symbol).join(" · ");
  const lockEv = ev.find((e) => e.type === "CashLock");
  const closedEv = ev.find((e) => e.type === "Closed");
  const dayOfWeek = dow(p.asOf);
  const weekend = dayOfWeek === "Sat" || dayOfWeek === "Sun";
  const nw = nextWindow(p.asOf);
  const bands: Band[] = [];
  const t0 = hist[0]?.t ?? p.start, tEnd = hist[hist.length - 1]?.t ?? p.asOf;
  let domainEnd: number | undefined;
  if (ph === "cashLock" && lockEv) { domainEnd = tEnd + (tEnd - t0) * 0.5; bands.push({ from: lockEv.time, to: domainEnd, kind: "lock", label: "CASH LOCK · USDT TO TERM END" }); }
  else if (!p.status.tradingOpen && weekend && ph === "active") { const sat = Math.floor(p.asOf / 86_400) * 86_400 - (dayOfWeek === "Sun" ? 86_400 : 0); bands.push({ from: sat, to: tEnd, kind: "weekend", label: "NO TRADES" }); }

  const alerts = (
    <>
      {ph === "cashLock" && <Banner kind="neg" title="Cash lock." more={<>Your value reached the floor{lockEv ? ` on ${isoDate(lockEv.time)}` : ""}. The vault sold all stock and holds USDT until the term ends on {isoDate(p.maturity)}. You keep {fmtW(p.status.V)} USDT. You will not gain from a recovery during this term.</>}>Value reached the floor; the vault holds USDT until {isoDate(p.maturity)}.</Banner>}
      {ph === "closing" && <Banner kind="warn" title="Close requested." more="When the stock is sold, choose Close to USDT to receive your USDT.">The vault sells its stock in the next trading window.</Banner>}
      {ph === "closed" && <Banner kind="info" title="This position is closed." more="The floor no longer applies.">{closedEv && closedEv.type === "Closed" ? `${fmtW(closedEv.usdtOut)} USDT was sent to your wallet on ${isoDate(closedEv.time)}.` : "It has been closed."}</Banner>}
      {ph === "active" && !p.status.tradingOpen && <Banner kind="warn" title="Market closed." more={<>{weekend ? "The vault does not trade on weekends." : "The vault trades only inside its window, and not on exchange holidays."} The floor maths already assumes the full weekend gap.</>}>Next trading window: {dow(nw)} {stamp(nw).replace(" ", ", ")} UTC.</Banner>}
    </>
  );
  const alertsOn = ph !== "active" || !p.status.tradingOpen;

  const activity = ev.length === 0 ? <p className="small p-4">No activity yet. The first rebalance runs in the next trading window.</p> : (
    <ul>
      {ev.map((e, i) => {
        const d = describe(e);
        const rb = e.type === "Rebalanced";
        const inner = (
          <>
            <span className="mono small !text-muted">{stamp(e.time).slice(5)}</span>
            <span className="min-w-0"><span className="block text-[14px] text-ink">{d.title}</span><span className="block mono small">{d.sub}</span></span>
          </>
        );
        return <li key={i} className="border-b border-grid">{rb ? <button type="button" className="grid w-full grid-cols-[88px_1fr] gap-3 px-4 py-2 text-left hover:bg-sunken" onClick={() => setSel(e)}>{inner}</button> : <div className="grid grid-cols-[88px_1fr] gap-3 px-4 py-2">{inner}</div>}</li>;
      })}
    </ul>
  );
  const holdings = (
    <div className="tbl-wrap px-2 pb-2">
      <table className="tbl">
        <caption className="sr-only">What the vault holds</caption>
        <thead><tr><th scope="col">Asset</th><th scope="col" className="r">Weight</th><th scope="col" className="r">Amount</th><th scope="col" className="r">Value (USDT)</th><th scope="col" className="r">Share</th></tr></thead>
        <tbody>
          {p.holdings.map((h) => <tr key={h.symbol}><th scope="row" className="mono">{h.symbol}{h.paused && <span className="badge b-neg ml-2">Paused</span>}</th><td className="r">{(h.weightBps / 100).toFixed(0)}%</td><td className="r">{fmtW(h.amount, 4)}</td><td className="r">{fmtW(h.value)}</td><td className="r">{V > 0 ? ((num(h.value) / V) * 100).toFixed(1) : "0.0"}%</td></tr>)}
          <tr><th scope="row" className="mono">USDT</th><td className="r">n/a</td><td className="r">{fmtW(p.usdtBalance)}</td><td className="r">{fmtW(p.usdtBalance)}</td><td className="r">{V > 0 ? ((num(p.usdtBalance) / V) * 100).toFixed(1) : "0.0"}%</td></tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="fill flex flex-col">
      {alertsOn && <div className="border-b border-grid px-4 py-2 md:px-6">{alerts}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <p className="label">{basket} · <span className="mono">{shortAddr(p.status.vault)}</span> <ExampleBadge className="ml-1" /></p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1"><span className="num-xl !text-[clamp(1.75rem,1.2rem+2vw,2.5rem)]">{fmt(V)} <span className="text-[0.5em] text-muted">USDT</span></span><span className={`mono text-[clamp(1rem,0.9rem+0.6vw,1.375rem)] ${chg >= 0 ? "pos" : "neg"}`}>{pct(chg)}</span><PhaseBadges p={p} /></p>
        </div>
        {ph !== "closed" && (
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="btn btn-secondary" onClick={() => setModal("usdt")}>{ph === "cashLock" ? `Close to USDT` : ph === "closing" ? "Finish: Close to USDT" : "Close to USDT"}</button>
            <button type="button" className="btn btn-ghost acc" onClick={() => setModal("kind")}>Exit in kind →</button>
          </div>
        )}
      </div>

      <div className="tiles t6 border-t border-grid">
        <Tile label="Value" value={fmt(V)} info="At the 10-minute average price." />
        <Tile label="Floor" value={fmt(F)} />
        <Tile label="Cushion" value={ph === "closed" ? "n/a" : fmtW(p.status.cushion)} />
        <Tile label="In stocks" value={`${sPct.toFixed(0)}%`} note={`${fmtW(p.status.exposure)} USDT`} />
        <Tile label="In USDT" value={`${(100 - sPct).toFixed(0)}%`} note={`${fmtW(p.usdtBalance)} USDT`} />
        <Tile label="Term" value={ph === "closed" ? "n/a" : daysLeft(p.maturity, p.asOf)} note={ph === "closed" ? "closed" : `days left · ends ${isoDate(p.maturity)}`} />
      </div>

      <div className="grid min-h-0 flex-1 border-t border-grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="relative min-w-0 border-b border-grid p-3 md:px-6 lg:border-b-0 lg:border-r" aria-labelledby="chart-h">
          <Xh style={{ left: 0, top: 0 }} /><Xh style={{ left: "100%", top: 0 }} />
          <h2 id="chart-h" className="label mb-2">Value since deposit{source.kind === "mock" && " · example"}{source.kind === "chain" && <InfoPopover label="the value chart" title="Value since deposit"><p>On chain, value is logged at each rebalance, so the line is sparse.</p></InfoPopover>}</h2>
          <PositionChart points={hist} floor={F} bands={bands} marks={marks} domainEnd={domainEnd} height={chartH} label={`Value since deposit: ${fmt(hist[0]?.v ?? D)} to ${fmt(V)} USDT, floor ${fmt(F)} USDT.${ph === "cashLock" ? " The vault is in cash lock." : ""}`} />
        </section>
        <section className="flex min-h-0 min-w-0 flex-col" aria-label="Activity and holdings">
          <Tabs label="Activity and holdings" className="h-full" panelMaxHeight={vw >= 1200 ? chartH + 30 : undefined} items={[
            { id: "act", label: "Activity", panel: <><p className="label border-b border-grid px-4 py-1">Rebalance rules<InfoPopover label="rebalance rules" title="Rebalance rules"><p>Sell when stock is more than 1% of value over target. Buy when it is more than 2% under. {BRAND.tradingWindow}.</p></InfoPopover></p>{activity}</> },
            { id: "hold", label: "Holdings", panel: holdings },
          ]} />
        </section>
      </div>

      {modal && <CloseModal key={modal} p={p} open initial={modal} onClose={() => setModal(null)} onDone={() => setRev((r) => r + 1)} />}
      <RebalanceDetail e={sel} onClose={() => setSel(null)} />
    </div>
  );
}
