"use client";
import { useMemo } from "react";
import { useWidth } from "@/components/ui/use-size";
import { fmt, isoDate, type ValuePoint } from "@/lib/adapters";

export type Band = { from: number; to: number; kind: "lock" | "weekend"; label: string };
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const lab = (t: number) => { const d = isoDate(t).split("-"); return `${MON[Number(d[1]) - 1]} ${d[2]}`; };

/** Value since deposit: line, cushion fill down to the floor, 2px floor line, optional bands and rebalance marks. */
export function PositionChart({ points, floor, bands = [], marks = [], domainEnd, label, height = 300 }: { points: ValuePoint[]; floor: number; bands?: Band[]; marks?: number[]; domainEnd?: number; label: string; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(640);
  const g = useMemo(() => {
    if (points.length < 2) return null;
    const t0 = points[0].t, t1 = domainEnd ?? points[points.length - 1].t;
    const vs = points.map((p) => p.v).concat(floor);
    const lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.12 || 1;
    const step = [50, 100, 250, 500, 1000, 2500].find((s) => (hi - lo + 2 * pad) / s <= 6) ?? 5000;
    const yMin = Math.floor((lo - pad) / step) * step, yMax = Math.ceil((hi + pad) / step) * step;
    const ticks: number[] = []; for (let y = yMin; y <= yMax; y += step) ticks.push(y);
    return { t0, t1, yMin, yMax, ticks };
  }, [points, floor, domainEnd]);
  if (!g) return <p className="small p-4">Not enough history to draw a chart yet.</p>;
  const L = 56, R = 16, T = 12, B = 28, H = height;
  const x = (t: number) => L + ((t - g.t0) / (g.t1 - g.t0 || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - g.yMin) / (g.yMax - g.yMin)) * (H - T - B);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const fy = y(floor);
  const area = `${line}L${x(points[points.length - 1].t).toFixed(1)},${fy}L${x(points[0].t).toFixed(1)},${fy}Z`;
  const at = (t: number) => { let v = points[0].v; for (const p of points) if (p.t <= t) v = p.v; return v; };
  const last = points[points.length - 1];
  const xt = [0, 0.5, 1].map((f) => g.t0 + f * (g.t1 - g.t0));
  return (
    <div ref={ref} className="w-full">
      <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs>
          <pattern id="hatch-lock" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--negative)" strokeOpacity="0.35" strokeWidth="1" /></pattern>
          <pattern id="hatch-weekend" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--warning)" strokeOpacity="0.4" strokeWidth="1" /></pattern>
        </defs>
        {g.ticks.map((v) => <g key={v}><line className="gl" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 8} y={y(v) + 4} textAnchor="end">{fmt(v, 0)}</text></g>)}
        {bands.map((b, i) => (
          <g key={i}>
            <rect x={x(b.from)} y={T} width={Math.max(0, x(Math.min(b.to, g.t1)) - x(b.from))} height={H - T - B} fill={b.kind === "lock" ? "url(#hatch-lock)" : "url(#hatch-weekend)"} />
            <text x={b.kind === "weekend" ? x(Math.min(b.to, g.t1)) - 6 : (x(b.from) + x(Math.min(b.to, g.t1))) / 2} y={T + 20} textAnchor={b.kind === "weekend" ? "end" : "middle"} className={`t-lg ${b.kind === "lock" ? "t-neg" : "t-warn"} halo`}>{b.label}</text>
          </g>
        ))}
        <path d={area} className="cushion" />
        <path d={line} className="path-ink" />
        <line className="floor-line" x1={L} x2={W - R} y1={fy} y2={fy} />
        <line className="floor-line" style={{ strokeWidth: 1 }} x1={L} x2={L} y1={fy - 5} y2={fy + 5} />
        <text x={L + 8} y={fy + 16} className="t-acc t-lg">FLOOR {fmt(floor)}</text>
        {marks.map((t, i) => { const px = x(t), py = y(at(t)); return <g key={i} stroke="var(--accent)" strokeWidth="1.5"><line x1={px - 5} x2={px + 5} y1={py} y2={py} /><line x1={px} x2={px} y1={py - 5} y2={py + 5} /></g>; })}
        <circle cx={x(last.t)} cy={y(last.v)} r="3.5" fill="var(--text)" />
        <text x={Math.min(x(last.t), W - R - 4)} y={y(last.v) - 10} textAnchor="end" className="t-ink halo">{fmt(last.v)}</text>
        {xt.map((t, i) => <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>{lab(t)}</text>)}
      </svg>
    </div>
  );
}
