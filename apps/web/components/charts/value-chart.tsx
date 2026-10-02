"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { useWidth } from "@/components/ui/use-size";
import type { PathPoint } from "@/lib/data";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const fmtPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day} ${MONTHS[Number(m) - 1]} ${y}`;
};

export type ValueChartProps = {
  data: PathPoint[];
  height?: number;
  /** Show the holding line (the stock on its own). */
  showHolding?: boolean;
  yMin?: number;
  yMax?: number;
  yTicks?: number[];
  /** Draw lines in on first load (CSS, off under reduced motion). */
  animate?: boolean;
  /** Mark days where the stock weight is under 1% as a cash-lock band. */
  lockBand?: boolean;
  /** Controlled cursor index (e.g. a day slider). If omitted, hover sets it. */
  activeIndex?: number | null;
  onActiveChange?: (i: number | null) => void;
  label: string;
  endLabels?: boolean;
  /** Hover tooltip. Off when a slider drives the cursor. */
  tooltip?: boolean;
};

export function ValueChart({
  data,
  height = 420,
  showHolding = true,
  yMin = 30,
  yMax = 110,
  yTicks = [40, 60, 80, 100],
  animate = false,
  lockBand = false,
  activeIndex,
  onActiveChange,
  label,
  endLabels = true,
  tooltip = true,
}: ValueChartProps) {
  const [ref, W] = useWidth<HTMLDivElement>(644);
  const uid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const controlled = activeIndex !== undefined;
  const idx = controlled ? activeIndex : hover;
  const setIdx = useCallback(
    (i: number | null) => {
      if (onActiveChange) onActiveChange(i);
      if (!controlled) setHover(i);
    },
    [onActiveChange, controlled],
  );

  const narrow = W < 520;
  const padL = narrow ? 36 : 44;
  const padR = 12;
  const padT = 28;
  const padB = 32;
  const H = height;
  const pw = W - padL - padR;
  const ph = H - padT - padB;
  const n = data.length;
  const x = (i: number) => padL + (i / (n - 1)) * pw;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * ph;

  const paths = useMemo(() => {
    const line = (k: "stock" | "vault") =>
      data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join("");
    const vaultLine = line("vault");
    const cushion =
      vaultLine +
      `L${x(n - 1).toFixed(1)} ${y(data[n - 1].floor).toFixed(1)}L${x(0).toFixed(1)} ${y(data[0].floor).toFixed(1)}Z`;
    return { holding: line("stock"), vault: vaultLine, cushion };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, W, H, yMin, yMax]);

  // month ticks on the x axis: quarter starts
  const xTicks = useMemo(() => {
    const out: { i: number; t: string }[] = [];
    let last = "";
    data.forEach((p, i) => {
      const [yy, mm] = p.date.split("-");
      const key = `${yy}-${mm}`;
      if (key !== last && (narrow ? ["01", "07"] : ["01", "04", "07", "10"]).includes(mm)) out.push({ i, t: `${MONTHS[Number(mm) - 1]} ${yy.slice(2)}` });
      last = key;
    });
    return out;
  }, [data, narrow]);

  const lock = useMemo(() => {
    if (!lockBand) return null;
    const first = data.findIndex((p) => p.stockWeight < 1);
    return first >= 0 ? first : null;
  }, [data, lockBand]);

  const first = data[0];
  const last = data[n - 1];
  const floorY = y(first.floor);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - padL) / pw) * (n - 1));
    setIdx(Math.min(n - 1, Math.max(0, i)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const cur = idx ?? n - 1;
    if (e.key === "ArrowLeft") { setIdx(Math.max(0, cur - 5)); e.preventDefault(); }
    else if (e.key === "ArrowRight") { setIdx(Math.min(n - 1, cur + 5)); e.preventDefault(); }
    else if (e.key === "Home") { setIdx(0); e.preventDefault(); }
    else if (e.key === "End") { setIdx(n - 1); e.preventDefault(); }
    else if (e.key === "Escape") setIdx(null);
  };

  const p = idx != null ? data[idx] : null;
  const tipRight = p && idx != null ? x(idx) < W * 0.55 : true;

  const summary = `${label}. Starting at 100% of the deposit on ${first.date}. By ${last.date}, holding the stock ended at ${last.stock.toFixed(1)}% and the Floor vault at ${last.vault.toFixed(1)}%, against a floor of ${first.floor}%. Use the left and right arrow keys to read values by day.`;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: H }}>
      <svg
        className="chart block touch-pan-y"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => !controlled && setIdx(null)}
        onKeyDown={onKey}
        onBlur={() => !controlled && setIdx(null)}
      >
        <defs>
          <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--grid-strong)" strokeWidth="1" />
          </pattern>
          <clipPath id={`${uid}-clip`}>
            <rect x={padL} y={padT - 4} width={pw} height={ph + 8} />
          </clipPath>
        </defs>

        {/* lattice: horizontal at ticks, vertical at quarters */}
        {yTicks.map((t) => (
          <g key={t}>
            <line className="gl" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end">{t}%</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={t.i}>
            <line className="gl" x1={x(t.i)} x2={x(t.i)} y1={padT} y2={padT + ph} />
            <text x={x(t.i)} y={H - 10} textAnchor={t.i === 0 ? "start" : x(t.i) > W - padR - 36 ? "end" : "middle"}>{t.t}</text>
          </g>
        ))}
        <rect x={padL} y={padT} width={pw} height={ph} fill="none" stroke="var(--grid-strong)" />

        {lock != null && (
          <g>
            <rect x={x(lock)} y={padT} width={x(n - 1) - x(lock)} height={ph} fill={`url(#${uid}-hatch)`} opacity="0.7" />
            <text x={(x(lock) + x(n - 1)) / 2} y={padT + 14} textAnchor="middle" className="t-lg">CASH LOCK</text>
          </g>
        )}

        <g clipPath={`url(#${uid}-clip)`}>
          <path d={paths.cushion} className={`cushion ${animate ? "fade-in" : ""}`} style={animate ? { ["--delay" as string]: "700ms" } : undefined} />
          {showHolding && (
            <path d={paths.holding} pathLength={1} className={`path-hold ${animate ? "draw" : ""}`} />
          )}
          <path d={paths.vault} pathLength={1} className={`path-ink ${animate ? "draw" : ""}`} style={{ strokeWidth: 2, ["--delay" as string]: "150ms" }} />
        </g>

        {/* floor line: 2px, accent, 11px end ticks, label just under it */}
        <line className={`floor-line ${animate ? "draw" : ""}`} pathLength={1} x1={padL} x2={W - padR} y1={floorY} y2={floorY} style={{ ["--delay" as string]: "300ms" }} />
        <line className="floor-line" style={{ strokeWidth: 1 }} x1={padL} x2={padL} y1={floorY - 5} y2={floorY + 5} />
        <line className="floor-line" style={{ strokeWidth: 1 }} x1={W - padR} x2={W - padR} y1={floorY - 5} y2={floorY + 5} />
        <text x={W - padR - 8} y={floorY + 16} textAnchor="end" className="t-acc t-lg halo" style={{ fontWeight: 500 }}>
          {narrow ? `FLOOR ${first.floor}%` : `YOUR FLOOR ${first.floor}%`}
        </text>

        {endLabels && (
          <g className={animate ? "fade-in" : ""} style={animate ? { ["--delay" as string]: "800ms" } : undefined}>
            {showHolding && (
              <text x={W - padR - 8} y={y(last.stock) + 20} textAnchor="end" className="t-lg halo">
                {narrow ? "HOLDING " : "HOLDING THE STOCK "}{fmtPct(last.stock - 100)}
              </text>
            )}
            <text x={W - padR - 8} y={y(last.vault) - 10} textAnchor="end" className="t-ink t-lg halo" style={{ fontWeight: 500 }}>
              {narrow ? "VAULT " : "WITH FLOOR "}{fmtPct(last.vault - 100)}
            </text>
          </g>
        )}

        {p && idx != null && (
          <g>
            <line x1={x(idx)} x2={x(idx)} y1={padT} y2={padT + ph} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="2 3" />
            {showHolding && <circle cx={x(idx)} cy={y(p.stock)} r="3" fill="var(--bg)" stroke="var(--text-muted)" strokeWidth="1.5" />}
            <path d={`M${x(idx) - 5.5} ${y(p.vault)}H${x(idx) + 5.5}M${x(idx)} ${y(p.vault) - 5.5}V${y(p.vault) + 5.5}`} stroke="var(--text)" strokeWidth="1" fill="none" />
          </g>
        )}
      </svg>

      {tooltip && p && idx != null && (
        <div
          className="tip"
          style={{
            top: padT + 8,
            left: tipRight ? Math.min(x(idx) + 12, W - 190) : Math.max(x(idx) - 12 - 178, padL + 4),
            width: 178,
          }}
          aria-hidden="true"
        >
          <div>{fmtDate(p.date)}</div>
          {showHolding && (
            <div><span className="k">HOLDING </span>{p.stock.toFixed(1)}%</div>
          )}
          <div><span className="k">VAULT </span>{p.vault.toFixed(1)}%</div>
          <div><span className="k">FLOOR </span>{p.floor.toFixed(1)}%</div>
          <div><span className="k">STOCK / USDT </span>{p.stockWeight.toFixed(0)} / {p.usdtWeight.toFixed(0)}</div>
        </div>
      )}
    </div>
  );
}
