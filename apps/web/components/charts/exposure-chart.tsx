"use client";

import { useMemo } from "react";
import { useWidth } from "@/components/ui/use-size";
import type { PathPoint } from "@/lib/data";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Two aligned plots from one real path: the stock price (top) and the share of the vault held
 * in stock (bottom). Shows the stock position shrinking as the price falls toward the floor.
 */
export function ExposureChart({ data }: { data: PathPoint[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const padL = 40, padR = 12, topH = 110, botH = 110, gap = 36, padT = 22, padB = 26;
  const H = padT + topH + gap + botH + padB;
  const pw = W - padL - padR;
  const n = data.length;
  const x = (i: number) => padL + (i / (n - 1)) * pw;
  const yT = (v: number) => padT + (1 - (v - 40) / (110 - 40)) * topH;
  const yB = (v: number) => padT + topH + gap + (1 - v / 50) * botH;
  const line = (f: (p: PathPoint) => number, yf: (v: number) => number) =>
    data.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${yf(f(p)).toFixed(1)}`).join("");

  const ticks = useMemo(() => {
    const out: { i: number; t: string }[] = [];
    let last = "";
    data.forEach((p, i) => {
      const [yy, mm] = p.date.split("-");
      if (`${yy}-${mm}` !== last && ["01", "07"].includes(mm)) out.push({ i, t: `${MONTHS[Number(mm) - 1]} ${yy.slice(2)}` });
      last = `${yy}-${mm}`;
    });
    return out;
  }, [data]);

  const lock = data.findIndex((p) => p.stockWeight < 1);
  const last = data[n - 1];

  return (
    <div ref={ref} className="w-full">
      <svg
        className="chart"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`NVDA 2022 backtest. The stock price falls from 100 to ${last.stock.toFixed(0)}. The share of the vault held in stock falls from ${data[0].stockWeight.toFixed(0)}% to ${last.stockWeight.toFixed(1)}%.`}
      >
        <text x={padL} y={12} className="t-lg">NVDA PRICE, 100 = START</text>
        {[40, 70, 100].map((t) => (
          <g key={t}>
            <line className="gl" x1={padL} x2={W - padR} y1={yT(t)} y2={yT(t)} />
            <text x={padL - 8} y={yT(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        <path d={line((p) => p.stock, yT)} className="path-hold" />
        <text x={W - padR} y={yT(last.stock) - 8} textAnchor="end">{last.stock.toFixed(0)}</text>

        <text x={padL} y={padT + topH + gap - 10} className="t-lg">STOCK HELD, % OF VAULT</text>
        {[0, 20, 40].map((t) => (
          <g key={t}>
            <line className="gl" x1={padL} x2={W - padR} y1={yB(t)} y2={yB(t)} />
            <text x={padL - 8} y={yB(t) + 4} textAnchor="end">{t}%</text>
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t.i}>
            <line className="gl" x1={x(t.i)} x2={x(t.i)} y1={padT} y2={padT + topH} />
            <line className="gl" x1={x(t.i)} x2={x(t.i)} y1={padT + topH + gap} y2={padT + topH + gap + botH} />
            <text x={x(t.i)} y={H - 8} textAnchor={t.i === 0 ? "start" : x(t.i) > W - padR - 30 ? "end" : "middle"}>{t.t}</text>
          </g>
        ))}
        <path d={line((p) => p.stockWeight, yB)} className="path-ink" style={{ strokeWidth: 2 }} />
        {lock > 0 && (
          <g>
            <line x1={x(lock)} x2={x(lock)} y1={padT + topH + gap} y2={padT + topH + gap + botH} stroke="var(--floor-line)" strokeWidth="1" strokeDasharray="2 3" />
            <text x={x(lock) + 6} y={yB(28)} className="t-acc">AT THE FLOOR: ALL USDT</text>
          </g>
        )}
      </svg>
    </div>
  );
}
