"use client";

import { useId } from "react";
import { useWidth } from "@/components/ui/use-size";

/**
 * Value of a position after one move in the stock, before any rebalance.
 *   V(g) = D + E* x g   (E* = stock held, D = deposit)
 * Floor line is flat. The cushion is the gap above it. Where the vault line crosses the floor,
 * a gap that big would break the floor.
 */
export function PayoffChart({ deposit, floorValue, stock }: { deposit: number; floorValue: number; stock: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const uid = useId();
  const H = 316;
  const narrow = W < 460;
  const padL = narrow ? 40 : 48, padR = 12, padT = 24, padB = 36;
  const pw = W - padL - padR, ph = H - padT - padB;
  const gMin = -0.4, gMax = 0.4;
  const vault = (g: number) => (deposit + stock * g) / deposit * 100;
  const hold = (g: number) => (1 + g) * 100;
  const floorPct = (floorValue / deposit) * 100;
  const yMin = Math.min(50, Math.floor(Math.min(vault(gMin), hold(gMin), floorPct - 5) / 10) * 10);
  const yMax = Math.max(120, Math.ceil(Math.max(vault(gMax), hold(gMax)) / 10) * 10);
  const x = (g: number) => padL + ((g - gMin) / (gMax - gMin)) * pw;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * ph;
  const gBreak = stock > 0 ? -(deposit - floorValue) / stock : -Infinity; // fall at which V = F... measured from deposit-level exposure
  const breakInRange = gBreak > gMin && gBreak < 0;
  const yTicks: number[] = [];
  for (let t = Math.ceil(yMin / 20) * 20; t <= yMax; t += 20) yTicks.push(t);
  const gTicks = [-0.4, -0.25, -0.1, 0, 0.1, 0.25, 0.4];
  const vPath = `M${x(gMin)} ${y(vault(gMin))}L${x(gMax)} ${y(vault(gMax))}`;
  const hPath = `M${x(gMin)} ${y(hold(gMin))}L${x(gMax)} ${y(hold(gMax))}`;
  // cushion polygon: vault line above floor, from the break point (or left edge) to 0
  const gStart = breakInRange ? gBreak : gMin;
  const cush = `M${x(gStart)} ${y(floorPct)}L${x(gStart)} ${y(vault(gStart))}L${x(gMax)} ${y(vault(gMax))}L${x(gMax)} ${y(floorPct)}Z`;
  const fmtG = (g: number) => `${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.abs(Math.round(g * 100))}%`;

  return (
    <div ref={ref} className="w-full">
      <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Value of the position after one move in the stock, before the vault rebalances. The vault holds ${((stock / deposit) * 100).toFixed(0)}% in stock, so a ${breakInRange ? Math.abs(gBreak * 100).toFixed(1) : "larger"}% fall would reach the floor of ${floorPct.toFixed(0)}%. Holding the stock moves one for one.`}>
        <defs>
          <pattern id={`${uid}-h`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--negative)" strokeWidth="1" opacity="0.55" />
          </pattern>
          <clipPath id={`${uid}-c`}><rect x={padL} y={padT} width={pw} height={ph} /></clipPath>
        </defs>
        {yTicks.map((t) => (<g key={t}><line className="gl" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} /><text x={padL - 8} y={y(t) + 4} textAnchor="end">{t}%</text></g>))}
        {gTicks.map((g) => (<g key={g}><line className="gl" x1={x(g)} x2={x(g)} y1={padT} y2={padT + ph} /><text x={x(g)} y={H - 14} textAnchor="middle">{fmtG(g)}</text></g>))}
        <rect x={padL} y={padT} width={pw} height={ph} fill="none" stroke="var(--grid-strong)" />
        <g clipPath={`url(#${uid}-c)`}>
          {breakInRange && <rect x={x(gMin)} y={padT} width={x(gBreak) - x(gMin)} height={ph} fill={`url(#${uid}-h)`} />}
          <path d={cush} className="cushion" />
          <path d={hPath} className="path-hold" strokeDasharray="4 3" />
          <path d={vPath} className="path-ink" style={{ strokeWidth: 2 }} />
        </g>
        <line className="floor-line" x1={padL} x2={W - padR} y1={y(floorPct)} y2={y(floorPct)} />
        <text x={W - padR - 8} y={y(floorPct) + 16} textAnchor="end" className="t-acc t-lg halo" style={{ fontWeight: 500 }}>FLOOR {floorPct.toFixed(0)}%</text>
        <line x1={x(0)} x2={x(0)} y1={padT} y2={padT + ph} stroke="var(--grid-strong)" strokeDasharray="2 3" />
        {breakInRange && (
          <g>
            <line x1={x(gBreak)} x2={x(gBreak)} y1={padT} y2={padT + ph} stroke="var(--negative)" strokeWidth="1" />
            <text x={x(gBreak) + 6} y={padT + ph - 8} className="t-neg t-lg halo">{narrow ? `FLOOR BREAKS AT \u2212${Math.abs(gBreak * 100).toFixed(0)}%` : `A ${Math.abs(gBreak * 100).toFixed(0)}% FALL REACHES THE FLOOR`}</text>
          </g>
        )}
        <text x={x(gMax) - 6} y={y(vault(gMax)) - 8} textAnchor="end" className="t-ink t-lg halo" style={{ fontWeight: 500 }}>WITH FLOOR</text>
        <text x={x(gMax) - 6} y={y(hold(gMax)) + 16} textAnchor="end" className="t-lg halo">{narrow ? "HOLDING" : "HOLDING THE STOCK"}</text>
        <text x={x(0.12)} y={y(floorPct) - 8} className="t-acc t-lg halo">CUSHION</text>
      </svg>
      <p className="label mt-1 text-center">Move in the stock, before the vault can trade</p>
    </div>
  );
}
