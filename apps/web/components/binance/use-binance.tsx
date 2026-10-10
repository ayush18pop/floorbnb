"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fetchMarket, type Fetched, type Market } from "@/lib/binance";

export type Remote<T> = { phase: "loading" } | { phase: "ok"; data: T } | { phase: "not_configured" } | { phase: "not_found" } | { phase: "error" };

/** Runs a Fetched-returning loader; `key` re-runs it. `retry` re-runs it too. */
export function useRemote<T>(load: (signal: AbortSignal) => Promise<Fetched<T>>, key: string): { state: Remote<T>; retry: () => void } {
  const [res, setRes] = useState<{ key: string; state: Remote<T> } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      const state: Remote<T> = r.ok ? { phase: "ok", data: r.data } : r.kind === "not_configured" ? { phase: "not_configured" } : r.kind === "not_found" ? { phase: "not_found" } : { phase: "error" };
      setRes({ key: `${key}#${tick}`, state });
    });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  const state: Remote<T> = res && res.key === `${key}#${tick}` ? res.state : { phase: "loading" };
  return { state, retry };
}

const TTL_MS = 30_000;
let marketCache: { at: number; p: Promise<Fetched<Market>> } | null = null;
/** One /v1/market request is shared by every component on the page (30 s). Failures are not cached. */
function sharedMarket(signal: AbortSignal): Promise<Fetched<Market>> {
  if (!marketCache || Date.now() - marketCache.at > TTL_MS) {
    const p = fetchMarket();
    marketCache = { at: Date.now(), p };
    p.then((r) => { if (!r.ok && marketCache?.p === p) marketCache = null; });
  }
  void signal; // the shared request is not aborted per caller
  return marketCache.p;
}
export const useMarket = () => useRemote(sharedMarket, "market");

/** Neutral skeleton, "not configured" note and quiet retry, shared by every Binance block. */
export function RemoteState({ state, retry, children, lines = 3 }: { state: Remote<unknown>; retry: () => void; children?: ReactNode; lines?: number }) {
  if (state.phase === "ok") return <>{children}</>;
  if (state.phase === "loading") return <div className="space-y-3 py-1" role="status" aria-label="Loading Binance data">{Array.from({ length: lines }).map((_, i) => <div key={i} className="sk" style={{ width: `${90 - i * 14}%` }} />)}</div>;
  if (state.phase === "not_configured") return <p className="small">Binance data is not configured on this server.</p>;
  if (state.phase === "not_found") return <p className="small">Binance has no data for this asset.</p>;
  return <p className="small">Could not reach Binance data right now. <button type="button" className="prose-link" onClick={retry}>Try again</button></p>;
}
