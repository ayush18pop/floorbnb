"use client";
import { useState } from "react";
import { findAsset, type Profile } from "@/lib/binance";
import { RemoteState, useMarket } from "./use-binance";

function Logo({ src, name }: { src: string; name: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return null;
  // eslint-disable-next-line @next/next/no-img-element -- remote logo of unknown host; hidden if it fails to load
  return <img src={src} alt={`${name} logo`} width={40} height={40} className="h-10 w-10 shrink-0 object-contain" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

export function CompanyBody({ p, symbol }: { p: Profile; symbol: string }) {
  const name = p.companyName ?? p.ticker ?? symbol;
  return (
    <div className="flex gap-3">
      {p.logoUrl && <Logo src={p.logoUrl} name={name} />}
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-ink">{name}{p.ticker && <span className="mono small ml-2">{p.ticker}</span>}</p>
        {p.sector && <p className="small">{p.sector}</p>}
        {p.description && <p className="small mt-2 !text-ink-2">{p.description}</p>}
        {p.issuer && <p className="small mt-2">Token issuer: {p.issuer}</p>}
      </div>
    </div>
  );
}

/** Company profile for one asset. Renders nothing when Binance gives no profile (or none is available). */
export function CompanyCard({ symbol, token }: { symbol: string; token?: string }) {
  const { state, retry } = useMarket();
  if (state.phase === "ok") {
    const p = findAsset(state.data, { symbol, token })?.profile ?? null;
    if (!p) return null;
    return <section aria-label={`About ${symbol}`} className="border border-grid bg-surface p-4"><h3 className="label mb-3">About the company</h3><CompanyBody p={p} symbol={symbol} /></section>;
  }
  if (state.phase === "not_configured" || state.phase === "not_found") return null; // PriceCheck already says so
  return <section aria-label={`About ${symbol}`} className="border border-grid bg-surface p-4"><h3 className="label mb-3">About the company</h3><RemoteState state={state} retry={retry} lines={2} /></section>;
}
