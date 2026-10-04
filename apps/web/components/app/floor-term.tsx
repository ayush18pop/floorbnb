"use client";

import { useState } from "react";
import { FLOOR_CONFIG, TERM_CONFIG, DAY, floorIsTested, termEndText, termIsTested, termLabel } from "@/lib/floor-config";
import { isoDate, fmt } from "@/lib/adapters";

const span = FLOOR_CONFIG.max - FLOOR_CONFIG.min;
const at = (v: number) => `${((v - FLOOR_CONFIG.min) / span) * 100}%`;

/** Slider plus quick-select chips. Native range input: arrow keys, Home/End, PageUp/PageDown and touch work for free. */
export function FloorControl({ floor, onChange, floorValue }: { floor: number; onChange: (n: number) => void; floorValue: number }) {
  const tested = floorIsTested(floor);
  return (
    <section className="border-b border-grid p-4 md:p-6" aria-labelledby="l-floor">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="l-floor" className="label">Floor</h2>
        <p className="mono text-ink" style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true" data-testid="floor-value">{floor}%</p>
      </div>
      <div className="fs mt-4">
        <div className="fs-track" aria-hidden="true">
          <span className="fs-zone" style={{ left: at(FLOOR_CONFIG.testedMin), width: `calc(${at(FLOOR_CONFIG.testedMax)} - ${at(FLOOR_CONFIG.testedMin)})` }} />
          <span className="fs-line" style={{ left: at(floor) }} />
        </div>
        <input
          type="range" className="fs-input" min={FLOOR_CONFIG.min} max={FLOOR_CONFIG.max} step={FLOOR_CONFIG.step} value={floor}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-labelledby="l-floor" aria-valuetext={`${floor} percent floor${tested ? ", backtested range" : ", not backtested yet"}`} aria-describedby="floor-note"
        />
        <div className="fs-scale mono" aria-hidden="true">
          <span style={{ left: at(FLOOR_CONFIG.min) }}>{FLOOR_CONFIG.min}</span>
          <span style={{ left: at(FLOOR_CONFIG.testedMin) }}>{FLOOR_CONFIG.testedMin}</span>
          <span style={{ left: at(FLOOR_CONFIG.testedMax) }}>{FLOOR_CONFIG.testedMax}</span>
        </div>
      </div>
      <div className="seg mt-4" role="group" aria-label="Floor presets">
        {FLOOR_CONFIG.presets.map((f) => <button key={f} type="button" aria-pressed={floor === f} onClick={() => onChange(f)}>{f}%</button>)}
      </div>
      <p id="floor-note" className={`small mt-3 ${tested ? "" : "warn"}`}>
        {tested
          ? `${FLOOR_CONFIG.testedMin}% to ${FLOOR_CONFIG.testedMax}% is the backtested range (one-year terms).`
          : `Not backtested yet. The contract allows ${FLOOR_CONFIG.min}% to ${FLOOR_CONFIG.max}%, but we only have backtests for ${FLOOR_CONFIG.testedMin}% to ${FLOOR_CONFIG.testedMax}%.`}
      </p>
      <p className="label mt-3">Lowest value: <span className="mono text-ink">{fmt(floorValue)} USDT</span></p>
    </section>
  );
}

export function TermControl({ days, onChange, now }: { days: number; onChange: (n: number) => void; now: number | null }) {
  const isPreset = TERM_CONFIG.presets.some((p) => p.days === days);
  const [custom, setCustom] = useState(!isPreset);
  const [text, setText] = useState(isPreset ? "" : String(days));
  const bad = custom && text !== "" && !(/^\d+$/.test(text) && Number(text) >= TERM_CONFIG.minDays && Number(text) <= TERM_CONFIG.maxDays);
  const end = now ? isoDate(now + days * DAY) : "…";
  return (
    <section className="border-b border-grid p-4 md:p-6" aria-labelledby="l-term">
      <h2 id="l-term" className="label mb-3">Term</h2>
      <div className="terms" role="group" aria-labelledby="l-term">
        {TERM_CONFIG.presets.map((p) => (
          <button key={p.id} type="button" aria-pressed={!custom && days === p.days} onClick={() => { setCustom(false); onChange(p.days); }}>{p.label}</button>
        ))}
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>Custom</button>
      </div>
      {custom && (
        <div className="mt-3">
          <label htmlFor="term-days" className="label">Days ({TERM_CONFIG.minDays} to {TERM_CONFIG.maxDays})</label>
          <div className="input-wrap mt-2">
            <input
              id="term-days" className="input !h-12 pr-16" inputMode="numeric" autoComplete="off" value={text} aria-invalid={bad} aria-describedby="term-msg"
              style={bad ? { borderColor: "var(--negative)" } : undefined}
              onChange={(e) => { const t = e.target.value.replace(/[^0-9]/g, "").slice(0, 3); setText(t); const n = Number(t); if (t && n >= TERM_CONFIG.minDays && n <= TERM_CONFIG.maxDays) onChange(n); }}
            />
            <span className="unit">DAYS</span>
          </div>
          {bad && <p id="term-msg" className="small neg mt-2">Enter a whole number of days from {TERM_CONFIG.minDays} to {TERM_CONFIG.maxDays}.</p>}
        </div>
      )}
      <p className="label mt-3">{termLabel(days)} · ends <span className="mono text-ink">{end}</span></p>
      <p className="small mt-2">{termEndText(end)}</p>
      <p className={`small mt-2 ${termIsTested(days) ? "" : "warn"}`}>
        {termIsTested(days) ? "One year is the term our backtests cover." : "Not backtested yet: we only have one-year backtests, so we show no history for this term."}
      </p>
    </section>
  );
}
