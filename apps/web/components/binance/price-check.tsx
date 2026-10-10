"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { deviationLabel, findAsset, fmtBps, fmtPrice, freshness, type MarketAsset } from "@/lib/binance";
import { RemoteState, useMarket } from "./use-binance";

const LABEL_CLASS = { "in line": "b-pos", "slight gap": "b-warn", "wide gap": "b-neg" } as const;

function useNow(everyMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(id); }, [everyMs]);
  return now;
}

export function PriceCheckBody({ a }: { a: MarketAsset }) {
  const now = useNow();
  const u = a.underlying;
  const dev = deviationLabel(a.deviationBps);
  const times = [a.priceUpdatedAt, u?.updatedAt ?? null].filter((t): t is number => t !== null);
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div><dt className="label">Token price</dt><dd className="mono mt-1 text-[16px]">{fmtPrice(a.price)}</dd></div>
        <div><dt className="label">Real stock price</dt><dd className="mono mt-1 text-[16px]">{fmtPrice(u?.price ?? a.referencePrice)}{!u?.price && a.referencePrice ? <span className="small"> (reference)</span> : null}</dd></div>
        <div>
          <dt className="label">Gap</dt>
          <dd className="mono mt-1 flex flex-wrap items-center gap-2 text-[16px]">{fmtBps(a.deviationBps)}{dev && <span className={`badge ${LABEL_CLASS[dev]}`}>{dev}</span>}</dd>
        </div>
        <div><dt className="label">Stock market status</dt><dd className="mono mt-1 text-[14px] [overflow-wrap:anywhere]">{u?.marketStatus ?? <span className="small">not reported by Binance</span>}</dd></div>
      </dl>
      <p className="small mt-3">{times.length > 0 ? `Price ${freshness(Math.max(...times), now)}.` : "Binance reported no update time."}</p>
      <p className="small mt-2">Why it matters: Floor&apos;s keeper skips buying a stock when its token trades far from the real stock price. Selling is never blocked.</p>
      <p className="label mt-2" style={{ textTransform: "none", letterSpacing: "0.02em" }}>Source: <Link href="/docs/binance" className="prose-link">Binance Web3 RWA Data API</Link></p>
    </div>
  );
}

/** "Price check" card for one asset (by token address and/or symbol). */
export function PriceCheck({ symbol, token }: { symbol: string; token?: string }) {
  const { state, retry } = useMarket();
  const a = state.phase === "ok" ? findAsset(state.data, { symbol, token }) : null;
  return (
    <section aria-label={`Price check for ${symbol}`} className="border border-grid bg-surface p-4">
      <h3 className="label mb-3">Price check · {symbol}</h3>
      <RemoteState state={state.phase === "ok" && !a ? { phase: "not_found" } : state} retry={retry} lines={3}>{a && <PriceCheckBody a={a} />}</RemoteState>
    </section>
  );
}
