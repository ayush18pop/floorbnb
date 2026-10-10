"use client";
import { useState } from "react";
import { Candles } from "./candles";
import { CompanyCard } from "./company-card";
import { PriceCheck } from "./price-check";

function One({ symbol, token }: { symbol: string; token: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="border border-grid bg-sunken" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="label cursor-pointer px-4 py-3">{symbol} · market data from Binance</summary>
      {open && (
        <div className="grid gap-3 p-3 md:grid-cols-2">
          <PriceCheck symbol={symbol} token={token} />
          <CompanyCard symbol={symbol} token={token} />
          <div className="md:col-span-2"><Candles symbol={symbol} /></div>
        </div>
      )}
    </details>
  );
}

/** Collapsed market data (price check, company, price history) for each asset a position holds. Loads only when opened. */
export function BinanceInsights({ holdings }: { holdings: { symbol: string; token: string }[] }) {
  if (holdings.length === 0) return null;
  return (
    <section aria-label="Market data" className="space-y-2 border-t border-grid px-4 py-4 md:px-6">
      <h2 className="label">Market data</h2>
      {holdings.map((h) => <One key={h.token} symbol={h.symbol} token={h.token} />)}
    </section>
  );
}
