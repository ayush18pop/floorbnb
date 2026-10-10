"use client";
import { useMemo, useState } from "react";
import { useWidth } from "@/components/ui/use-size";
import { fetchCandles, fmtPrice, type Candle } from "@/lib/binance";
import { RemoteState, useRemote } from "./use-binance";

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dayLabel = (t: number) => { const d = new Date(t * 1000); return `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]}`; };

/** Close-price line from candles. Reuses the shared .chart SVG styles and width hook. */
export function CloseLine({ candles, label, height = 180 }: { candles: Candle[]; label: string; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(480);
  const pts = useMemo(() => candles.map((c) => ({ t: c.t, v: Number(c.c) })), [candles]);
  if (pts.length < 2) return <p className="small">Not enough price history to draw a chart yet.</p>;
  const L = 52, R = 12, T = 10, B = 24, H = height;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v)), pad = (hi - lo) * 0.1 || hi * 0.01 || 1;
  const yMin = lo - pad, yMax = hi + pad;
  const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const ticks = [0, 1, 2].map((i) => yMin + ((yMax - yMin) * (i + 0.5)) / 3);
  const last = pts[pts.length - 1];
  return (
    <div ref={ref} className="w-full">
      <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => <g key={v}><line className="gl" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{v.toFixed(v < 10 ? 2 : 0)}</text></g>)}
        <path d={line} className="path-ink" />
        <circle cx={x(last.t)} cy={y(last.v)} r="3" fill="var(--text)" />
        {[0, 0.5, 1].map((f, i) => <text key={i} x={x(t0 + f * (t1 - t0))} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>{dayLabel(t0 + f * (t1 - t0))}</text>)}
      </svg>
    </div>
  );
}

/** Daily (or 4-hour) close line for one asset from the Floor API's candles endpoint. */
export function Candles({ symbol }: { symbol: string }) {
  const [interval, setInterval] = useState<"1d" | "4h">("1d");
  const { state, retry } = useRemote((s) => fetchCandles(symbol, interval, interval === "1d" ? 90 : 120, s), `${symbol}:${interval}`);
  const empty = state.phase === "ok" && state.data.candles.length === 0;
  return (
    <section aria-label={`Price history for ${symbol}`} className="border border-grid bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="label">{interval === "1d" ? "90-day" : "Recent 4-hour"} close · {symbol}</h3>
        <div role="group" aria-label="Candle interval" className="flex gap-1">
          {(["1d", "4h"] as const).map((i) => <button key={i} type="button" aria-pressed={interval === i} className={`badge ${interval === i ? "b-acc" : ""}`} onClick={() => setInterval(i)}>{i === "1d" ? "Daily" : "4 hour"}</button>)}
        </div>
      </div>
      <RemoteState state={empty ? { phase: "not_found" } : state} retry={retry} lines={4}>
        {state.phase === "ok" && (
          <>
            <CloseLine candles={state.data.candles} label={`${symbol} close price, ${state.data.candles.length} ${interval === "1d" ? "days" : "four-hour candles"}, last ${fmtPrice(state.data.candles.at(-1)?.c ?? null)}.`} />
            <p className="label mt-2" style={{ textTransform: "none", letterSpacing: "0.02em" }}>Past prices, not a prediction.{state.data.source ? ` Source: ${state.data.source}.` : ""}</p>
          </>
        )}
      </RemoteState>
    </section>
  );
}
