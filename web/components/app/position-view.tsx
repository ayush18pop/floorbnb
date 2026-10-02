"use client";

import { useMemo, useState } from "react";
import { ValueChart } from "@/components/charts/value-chart";
import { ChartPanel } from "@/components/charts/panel";
import { Button } from "@/components/ui/button";
import type { PathPoint } from "@/lib/data";
import type { RebalanceEvent, ReplayRow } from "@/lib/replay";

const usd = (n: number, d = 0) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fd = (d: string) => { const [y, m, day] = d.split("-"); return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`; };

type Exit = "requestClose" | "closeToUSDT" | "exitInKind";

export function PositionView({ path, rows, events }: { path: PathPoint[]; rows: ReplayRow[]; events: RebalanceEvent[] }) {
  const last = rows.length - 1;
  const [day, setDay] = useState(Math.min(last, 60));
  const [showHold, setShowHold] = useState(false);
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const r = rows[day];
  const lockFirst = useMemo(() => rows.findIndex((x) => x.cashLock), [rows]);
  const lowHold = useMemo(() => path.reduce((m, p, i) => (p.stock < path[m].stock ? i : m), 0), [path]);
  const shown = events.filter((e) => e.i <= day).slice(-12).reverse();
  const termEnd = path[last].date;
  const holdValue = (path[day].stock / 100) * rows[0].V;

  const exits: { fn: Exit; text: string; arg?: boolean }[] = [
    { fn: "requestClose", text: "Sets the target stock to 0. The keeper, or anyone after 4 hours idle, sells the stock for USDT." },
    { fn: "closeToUSDT", text: "Once the stock is sold, sends all USDT to you and closes the position." },
    { fn: "exitInKind", text: "Always allowed. Sends your USDT and any tokens that can move to an address you choose. A paused token is skipped and can be rescued later.", arg: true },
  ];

  return (
    <div className="cellgrid" style={{ borderTop: 0 }}>
      {/* mock banner */}
      <div className="col-span-4 md:col-span-8 lg:col-span-12 sunken">
        <p className="small"><strong className="text-ink font-medium">Mock position.</strong> 10,000 USDT in NVDAB, floor 90%, one-year term. The day slider replays the real NVDA path from 4 Jan 2022 to 4 Jan 2023 (docs/data/vault_path_nvda_worst.csv) through the vault rule. Values are what the screen would read from <span className="mono">FloorLens.status(vault)</span>. Not on-chain.</p>
      </div>

      {/* status tiles */}
      <div className="col-span-4 md:col-span-8 lg:col-span-12 !p-0">
        <div className="grid grid-cols-2 gap-px bg-grid md:grid-cols-4">
          <div className="bg-surface p-4"><p className="stat-label">Value (V)</p><p className="mono mt-2 text-[28px] leading-none">{usd(r.V)}</p><p className="stat-note mt-2">{r.V >= r.floor ? "above the floor" : "below the floor"} · holding alone: {usd(holdValue)}</p></div>
          <div className="bg-surface p-4"><p className="stat-label">Floor</p><p className="mono acc mt-2 text-[28px] leading-none">{usd(r.floor)}</p><p className="stat-note mt-2">90% of 10,000 USDT, fixed</p></div>
          <div className="bg-surface p-4"><p className="stat-label">Cushion</p><p className="mono mt-2 text-[28px] leading-none">{usd(r.cushion)}</p><p className="stat-note mt-2">V − floor</p></div>
          <div className="bg-surface p-4"><p className="stat-label">Term ends</p><p className="mono mt-2 text-[28px] leading-none">{fd(termEnd).replace(/ 20/, " ’")}</p><p className="stat-note mt-2">termSeconds = 31,536,000</p></div>
        </div>
      </div>

      {/* chart + replay */}
      <div className="col-span-4 md:col-span-8 lg:col-span-8 !p-0">
        <ChartPanel className="h-full border-0" corners={false} fig="FIG. A3 / VALUE VS FLOOR" title={fd(r.date)} source="docs/data/vault_path_nvda_worst.csv, floor 90%, m = 4" caption="Backtest replay, past data, not a prediction.">
          <ValueChart
            data={path}
            height={340}
            showHolding={showHold}
            yMin={showHold ? 30 : 86}
            yMax={showHold ? 110 : 102}
            yTicks={showHold ? [40, 60, 80, 100] : [88, 92, 96, 100]}
            lockBand
            tooltip={false}
            endLabels={false}
            activeIndex={day}
            onActiveChange={(i) => i != null && setDay(i)}
            label="Mock position replay: vault value versus the 90% floor"
          />
          <div className="mt-4 grid gap-3">
            <label className="label" htmlFor="day">Replay day: {day} of {last} ({fd(r.date)})</label>
            <input id="day" className="range" type="range" min={0} max={last} step={1} value={day} onChange={(e) => setDay(Number(e.target.value))} aria-valuetext={fd(r.date)} />
            <div className="flex flex-wrap gap-2">
              <button className="chip" type="button" onClick={() => setDay(0)}>Start</button>
              <button className="chip" type="button" onClick={() => setDay(lowHold)}>Stock at its low</button>
              {lockFirst > 0 && <button className="chip" type="button" onClick={() => setDay(lockFirst)}>Cash lock begins</button>}
              <button className="chip" type="button" onClick={() => setDay(last)}>End of term</button>
              <button className="chip" type="button" aria-pressed={showHold} onClick={() => setShowHold(!showHold)}>Compare with holding</button>
            </div>
          </div>
        </ChartPanel>
      </div>

      {/* weights + state */}
      <div className="col-span-4 md:col-span-8 lg:col-span-4">
        <p className="label mb-3">Stock and USDT weights</p>
        <div className="flex h-8 w-full border border-grid-strong" role="img" aria-label={`${r.stockPct.toFixed(0)} percent stock, ${r.usdtPct.toFixed(0)} percent USDT`}>
          <div className="flex items-center justify-center overflow-hidden mono text-[12px]" style={{ width: `${r.stockPct}%`, background: "var(--text)", color: "var(--bg)" }}>{r.stockPct >= 14 ? `${r.stockPct.toFixed(0)}%` : ""}</div>
          <div className="flex flex-1 items-center justify-center mono text-[12px] text-ink-2">{`USDT ${r.usdtPct.toFixed(r.usdtPct > 99 ? 1 : 0)}%`}</div>
        </div>
        <dl className="mono mt-5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-muted">stock (exposure)</dt><dd className="text-right">{usd(r.exposure)}</dd>
          <dt className="text-muted">target (E*)</dt><dd className="text-right">{usd(r.target)}</dd>
          <dt className="text-muted">needsRebalance</dt><dd className="text-right">false</dd>
          <dt className="text-muted">tradingOpen</dt><dd className="text-right">mock</dd>
        </dl>
        <p className="small mt-3">Trading window: Mon to Fri, 15:30 to 19:30 UTC. Replay days are daily, not intraday.</p>

        <div className="mt-6 border-t border-grid pt-5">
          <p className="label mb-2">Cash lock</p>
          {r.cashLock ? (
            <div role="status">
              <span className="badge b-neg">Cash lock</span>
              <p className="body mt-3" style={{ fontSize: 14.5 }}>Value is at the floor. The vault holds almost only USDT and stays there until {fd(termEnd)}. The floor is protected. A recovery in this term would be missed.</p>
            </div>
          ) : (
            <div role="status">
              <span className="badge b-pos">Not locked</span>
              <p className="body mt-3" style={{ fontSize: 14.5 }}>The vault still holds stock. If the cushion reaches zero it sells everything and holds USDT until the term ends.</p>
            </div>
          )}
        </div>
      </div>

      {/* rebalance history */}
      <div className="col-span-4 md:col-span-8 lg:col-span-12 !p-0">
        <div className="border-b border-grid p-4 md:p-6">
          <p className="label">Rebalance history</p>
          <p className="small mt-1">Replayed with the contract&apos;s bands (sell at 1% of V, buy at 2% of V). Fields follow the <span className="mono">Rebalanced</span> event. Not on-chain, so no transaction hashes.</p>
        </div>
        <p className="label px-4 pb-2 md:hidden">Scroll sideways to see all columns</p>
        <div className="tbl-wrap px-4 pb-2 md:px-6">
          <table className="tbl">
            <caption className="sr-only">Replayed rebalances up to the selected day, newest first</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">assetIdx</th><th scope="col">Side</th><th scope="col" className="r">Trade value</th><th scope="col" className="r">V</th><th scope="col" className="r">exposureTarget</th><th scope="col">Caller</th><th scope="col">Tx</th></tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.i}>
                  <td className="mono whitespace-nowrap">{fd(e.date)}</td><td className="mono whitespace-nowrap">0 · NVDAB</td>
                  <td className={e.side === "buy" ? "pos" : "neg"}>{e.side === "buy" ? "Buy" : "Sell"}</td>
                  <td className="r">{usd(e.value)}</td><td className="r">{usd(e.V)}</td><td className="r">{usd(e.exposureTarget)}</td>
                  <td className="mono">keeper (mock)</td><td className="mono text-muted">n/a</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="small py-4">No rebalances yet.</p>}
        </div>
      </div>

      {/* exits */}
      <div className="col-span-4 md:col-span-8 lg:col-span-12 !p-0">
        <div className="border-b border-grid p-4 md:p-6">
          <p className="label">Exit (owner only)</p>
          <p className="small mt-1">These buttons only show what would be called. Nothing is sent.</p>
        </div>
        <div className="grid gap-px bg-grid md:grid-cols-3">
          {exits.map((x) => (
            <div key={x.fn} className="flex flex-col gap-4 bg-surface p-4 md:p-6">
              <div>
                <p className="mono text-[14px] font-medium">{x.fn}({x.arg ? "to" : ""})</p>
                <p className="body mt-2" style={{ fontSize: 14.5 }}>{x.text}</p>
              </div>
              {x.arg && (
                <div className="field">
                  <label className="label" htmlFor="to">to (address)</label>
                  <input id="to" className="input" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} />
                </div>
              )}
              <Button className="mt-auto" onClick={() => setMsg(`Prototype: would call ${x.fn}(${x.arg ? to || "to" : ""}) on your vault. Not connected to BSC, nothing was sent.`)}>{x.fn}</Button>
            </div>
          ))}
        </div>
        <div className="p-4 md:px-6" aria-live="polite">{msg ? <p className="small" style={{ color: "var(--text)" }}>{msg}</p> : <p className="small">Exiting before the term ends gives you the vault&apos;s current value, which can be below your floor only if prices gapped past the limit.</p>}</div>
      </div>
    </div>
  );
}
