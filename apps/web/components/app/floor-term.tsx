"use client";

import { useState, type ReactNode } from "react";
import { FLOOR_CONFIG, TERM_CONFIG, DAY, floorIsTested, termEndText, termIsTested, termLabel } from "@/lib/floor-config";
import { isoDate, fmt } from "@/lib/adapters";
import { InfoPopover } from "@/components/ui/info-popover";
import { ChainDate } from "./ui";

const span = FLOOR_CONFIG.max - FLOOR_CONFIG.min;
const at = (v: number) => `${((v - FLOOR_CONFIG.min) / span) * 100}%`;

/** Slider plus quick-select chips. Native range input: arrow keys, Home/End, PageUp/PageDown and touch work for free. */
export function FloorControl({ floor, onChange, floorValue, split }: { floor: number; onChange: (n: number) => void; floorValue: number; split?: ReactNode }) {
  const tested = floorIsTested(floor);
  return (
    <section className="border-b border-grid px-4 py-3 md:px-6" aria-labelledby="l-floor">
      <div className="flex items-center justify-between gap-3">
        <h2 id="l-floor" className="label">Floor<InfoPopover label="floor" title="Floor">
          <p id="floor-note">
            {tested ? `${FLOOR_CONFIG.testedMin}% to ${FLOOR_CONFIG.testedMax}% is backtested. ` : "Not backtested yet. "}
            The slider stops at {FLOOR_CONFIG.max}%: above that the position is mostly cash (at {FLOOR_CONFIG.testedMax}%, {Math.min(100, 4 * (100 - FLOOR_CONFIG.testedMax))}% in stock).
          </p>
          {split}
        </InfoPopover></h2>
        <p className="flex items-baseline gap-3">
          <span className="label" data-testid="lowest-value">Lowest <span className="mono text-ink">{fmt(floorValue)} USDT</span></span>
          <span className="mono text-ink" style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true" data-testid="floor-value">{floor}%</span>
        </p>
      </div>
      <div className="fs mt-2">
        <div className="fs-track" aria-hidden="true">
          <span className="fs-line" style={{ left: at(floor) }} />
        </div>
        <input
          type="range" className="fs-input" min={FLOOR_CONFIG.min} max={FLOOR_CONFIG.max} step={FLOOR_CONFIG.step} value={floor}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-labelledby="l-floor" aria-valuetext={`${floor} percent floor${tested ? ", backtested" : ", not backtested yet"}`}
        />
        <div className="fs-scale mono" aria-hidden="true">
          {FLOOR_CONFIG.presets.map((v) => <span key={v} style={{ left: at(v) }}>{v}</span>)}
        </div>
      </div>
      <div className="seg seg-s mt-1" role="group" aria-label="Floor presets">
        {FLOOR_CONFIG.presets.map((f) => <button key={f} type="button" aria-pressed={floor === f} onClick={() => onChange(f)}>{f}%</button>)}
      </div>
      {!tested && <p className="small warn mt-2">Not backtested yet.</p>}
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
    <section className="border-b border-grid px-4 py-3 md:px-6" aria-labelledby="l-term">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="l-term" className="label">Term<InfoPopover label="term" title="Term">
          <p>{termLabel(days)} · ends <span className="mono text-ink">{end}</span></p>
          <p>{termEndText(end)}</p>
          <p>Backtested: terms from 1 month to 1 year.</p>
        </InfoPopover></h2>
        <p className="label">ends <span className="mono text-ink"><ChainDate>{end}</ChainDate></span></p>
      </div>
      <div className="terms terms-s" role="group" aria-labelledby="l-term">
        {TERM_CONFIG.presets.map((p) => (
          <button key={p.id} type="button" aria-pressed={!custom && days === p.days} onClick={() => { setCustom(false); onChange(p.days); }}>{p.label}</button>
        ))}
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>Custom</button>
      </div>
      {custom && (
        <div className="mt-2 flex items-center gap-3">
          <label htmlFor="term-days" className="label shrink-0">Days ({TERM_CONFIG.minDays} to {TERM_CONFIG.maxDays})</label>
          <div className="input-wrap flex-1">
            <input
              id="term-days" className="input !h-10 pr-16" inputMode="numeric" autoComplete="off" value={text} aria-invalid={bad} aria-describedby="term-msg"
              style={bad ? { borderColor: "var(--negative)" } : undefined}
              onChange={(e) => { const t = e.target.value.replace(/[^0-9]/g, "").slice(0, 3); setText(t); const n = Number(t); if (t && n >= TERM_CONFIG.minDays && n <= TERM_CONFIG.maxDays) onChange(n); }}
            />
            <span className="unit">DAYS</span>
          </div>
        </div>
      )}
      {bad && <p id="term-msg" className="small neg mt-1">Enter a whole number of days from {TERM_CONFIG.minDays} to {TERM_CONFIG.maxDays}.</p>}
      {!termIsTested(days) && <p className="small warn mt-2">Not backtested yet.</p>}
    </section>
  );
}
