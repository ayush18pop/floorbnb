"use client";

import { BRAND } from "@/lib/brand";
import { FLOOR_CONFIG, reportStats, termLabel, upsideKeptPct } from "@/lib/floor-config";

const pct2 = (n: number) => `${n.toFixed(2)}%`;
/** "1 in 590" style, from a percent. */
const oneIn = (p: number) => Math.round(100 / p).toLocaleString("en-US");

/** The numbers behind the visual, for the screen and the tests. */
export function tradeoffNumbers(floor: number, termDays: number) {
  return {
    keepAtLeast: floor,
    atStake: 100 - floor,
    upside: upsideKeptPct(floor),
    startStock: Math.min(100, 4 * (100 - floor)),
    stats: reportStats(floor, termDays),
  };
}

const W = 300, H = 120, PAD = 8;
const x = (f: number) => PAD + ((f - FLOOR_CONFIG.min) / (FLOOR_CONFIG.testedMax - FLOOR_CONFIG.min)) * (W - 2 * PAD);
const y = (v: number) => H - PAD - (v / 100) * (H - 2 * PAD);
const floors = Array.from({ length: FLOOR_CONFIG.testedMax - FLOOR_CONFIG.min + 1 }, (_, i) => FLOOR_CONFIG.min + i);

export function Tradeoff({ floor, termDays }: { floor: number; termDays: number }) {
  const n = tradeoffNumbers(floor, termDays);
  const line = (fn: (f: number) => number, to = FLOOR_CONFIG.testedMax) => floors.filter((f) => f <= to).map((f, i) => `${i ? "L" : "M"}${x(f).toFixed(1)} ${y(fn(f)).toFixed(1)}`).join(" ");
  const prot = (f: number) => f, up = (f: number) => upsideKeptPct(f);
  const term = termLabel(termDays);
  return (
    <section className="border-b border-grid p-4 md:p-6" aria-labelledby="l-trade">
      <h2 id="l-trade" className="label mb-4">What you gain and give up</h2>

      <div className="grid gap-4 sm:grid-cols-2" role="group" aria-label="Protected and upside kept at the chosen floor">
        <div>
          <p className="label">Protected</p>
          <p className="mono text-ink" style={{ fontSize: 24, lineHeight: 1.1 }} data-testid="t-protected">{n.keepAtLeast} <span className="small">of every 100</span></p>
          <div className="meter mt-2" role="img" aria-label={`Floor at ${floor} of every 100; ${n.atStake} of every 100 moves with the stocks`}>
            <span className="m-fill" style={{ width: `${floor}%` }} />
            <span className="m-line" style={{ left: `${floor}%` }} />
          </div>
          <p className="small mt-2">You keep at least ~{n.keepAtLeast} USDT of every 100, unless prices gap more than about {BRAND.gapLimitPct}% before the vault can rebalance. {n.atStake} of every 100 is at stake.</p>
        </div>
        <div>
          <p className="label">Upside kept</p>
          <p className="mono text-ink" style={{ fontSize: 24, lineHeight: 1.1 }} data-testid="t-upside">~{n.upside}%</p>
          <div className="meter mt-2" role="img" aria-label={`About ${n.upside} percent of a rise kept`}>
            <span className="m-fill m-hatch" style={{ width: `${n.upside}%` }} />
          </div>
          <p className="small mt-2">In a strong up window you capture roughly {n.upside}% of the stock&apos;s gain (about 4 × your cushion). You start with {n.startStock}% in stock.</p>
        </div>
      </div>

      <div className="mt-5">
        <svg viewBox={`0 0 ${W} ${H}`} className="trade-svg" role="img" aria-label={`Across floors ${FLOOR_CONFIG.min} to ${FLOOR_CONFIG.testedMax}: protection rises from ${FLOOR_CONFIG.min} to ${FLOOR_CONFIG.testedMax} and upside kept falls from ${upsideKeptPct(FLOOR_CONFIG.min)} to ${upsideKeptPct(FLOOR_CONFIG.testedMax)} percent. You chose ${floor}.`}>
          <rect x={x(FLOOR_CONFIG.max + 0.5)} y={PAD} width={x(FLOOR_CONFIG.testedMax) - x(FLOOR_CONFIG.max + 0.5) + PAD / 2} height={H - 2 * PAD} className="t-grey" />
          {[0, 50, 100].map((v) => <line key={v} x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} className="t-grid" />)}
          <path d={line(prot)} className="t-prot" fill="none" />
          <path d={line(up)} className="t-up" fill="none" />
          <line x1={x(floor)} x2={x(floor)} y1={PAD} y2={H - PAD} className="t-cur" />
          <circle cx={x(floor)} cy={y(prot(floor))} r="4" className="t-dot-p" />
          <circle cx={x(floor)} cy={y(up(floor))} r="4" className="t-dot-u" />
          <text x={x(FLOOR_CONFIG.testedMax)} y={y(prot(FLOOR_CONFIG.testedMax)) + 22} textAnchor="end" className="t-txt">Protected (solid)</text>
          <text x={x(FLOOR_CONFIG.min + 8)} y={y(up(FLOOR_CONFIG.min + 8)) + 18} className="t-txt">Upside kept (dashed)</text>
        </svg>
        <p className="label mt-1">{FLOOR_CONFIG.min}% to {FLOOR_CONFIG.max}% on the slider. Shaded: {FLOOR_CONFIG.max + 1}% to {FLOOR_CONFIG.testedMax}% is tested but mostly cash (98%: {Math.min(100, 4 * (100 - FLOOR_CONFIG.testedMax))}% in stock).</p>
        <p className="mono text-ink mt-2" style={{ fontSize: 13 }} data-testid="t-reading">At {floor}%: protected {n.keepAtLeast} · upside kept ~{n.upside}%</p>
      </div>

      <div className="mt-5 border-t border-grid pt-4" data-testid="t-risk">
        <p className="label mb-2">In our historical test · {term}</p>
        {n.stats ? (
          <ul className="small space-y-2">
            <li><span className="mono text-ink">{pct2(n.stats.cashLock)}</span> of {term} windows hit the cash lock (value reached the floor, so the vault held only USDT to the end): about 1 in {oneIn(n.stats.cashLock)}.</li>
            <li><span className="mono text-ink">{pct2(n.stats.breach)}</span> ended more than 1 point of the deposit below the floor (a breach).</li>
          </ul>
        ) : (
          <p className="small">No published rate for a {floor}% floor over {termDays} days. We publish rates for floors 80, 85, 90 and 95 and for 1, 3, 6 and 12 months.</p>
        )}
        <p className="small mt-3">Backtest on daily closes of 38 indices, ETFs and large stocks, 1928 to 2026, non-overlapping windows, 6 bps per trade. It is not a forecast. These rates are not a maximum loss: single-stock gap days of -50% to -61% breached every floor, and the floor can break if prices gap more than about {BRAND.gapLimitPct}% before the vault can rebalance.</p>
      </div>
    </section>
  );
}
