import type { ReactNode } from "react";

/** Horizontal bar rows in plain HTML so they stay fluid at 343px. Bar length = magnitude. */

export type BarKind = "hold" | "vault" | "warn" | "ink";
const colour: Record<BarKind, string> = {
  hold: "var(--crosshair)",
  vault: "var(--accent)",
  warn: "var(--warning)",
  ink: "var(--text)",
};

function Bar({ pct, kind, label, valueClass = "" }: { pct: number; kind: BarKind; label: ReactNode; valueClass?: string }) {
  return (
    <div className="grid items-center gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) 84px" }}>
      <div className="h-4 w-full" style={{ background: "var(--surface-sunken)" }}>
        <div className="bar h-4" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: colour[kind] }} />
      </div>
      <div className={`mono text-right text-[13px] ${valueClass}`}>{label}</div>
    </div>
  );
}

export type PairRow = { name: string; sub?: string; hold: number; vault: number };

/** Paired bars: hold vs Floor. Values are signed percentages, drawn as loss size. */
export function PairedBars({ rows, max, holdLabel = "HOLD", vaultLabel = "FLOOR" }: { rows: PairRow[]; max: number; holdLabel?: string; vaultLabel?: string }) {
  const f = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(1)}%`;
  return (
    <div role="table" aria-label="Typical bad year, holding versus Floor">
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 label" aria-hidden="true">
        <span className="inline-flex items-center gap-2"><i className="inline-block h-2 w-4" style={{ background: colour.hold }} />{holdLabel}</span>
        <span className="inline-flex items-center gap-2"><i className="inline-block h-2 w-4" style={{ background: colour.vault }} />{vaultLabel}</span>
        <span className="ml-auto">Bar length = size of the loss</span>
      </div>
      <div className="flex flex-col gap-5">
        {rows.map((r) => (
          <div key={r.name} role="row" className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="mono text-[13px] font-medium">{r.name}</span>
              {r.sub && <span className="label">{r.sub}</span>}
            </div>
            <span role="cell" className="sr-only">{holdLabel} {f(r.hold)}, {vaultLabel} {f(r.vault)}</span>
            <Bar pct={(Math.abs(r.hold) / max) * 100} kind="hold" label={<>{f(r.hold)}</>} />
            <Bar pct={(Math.abs(r.vault) / max) * 100} kind="vault" label={<span className="font-medium acc">{f(r.vault)}</span>} />
          </div>
        ))}
      </div>
    </div>
  );
}

export type SingleRow = { name: string; value: number; kind?: BarKind; note?: string; text?: string };

/** Single bars with an optional vertical reference line (e.g. 25%). */
export function SingleBars({ rows, max, unit = "%", refLine, signed = false }: { rows: SingleRow[]; max: number; unit?: string; refLine?: { at: number; label: string }; signed?: boolean }) {
  return (
    <div className="relative flex flex-col gap-4">
      {rows.map((r) => (
        <div key={r.name} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="mono text-[13px] font-medium">{r.name}</span>
            {r.note && <span className="label text-right">{r.note}</span>}
          </div>
          <div className="grid items-center gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) 84px" }}>
            <div className="relative h-4 w-full" style={{ background: "var(--surface-sunken)" }}>
              <div className="bar h-4" style={{ width: `${Math.max(1.5, (Math.abs(r.value) / max) * 100)}%`, background: colour[r.kind ?? "ink"] }} />
              {refLine && <i className="absolute -top-1 -bottom-1" style={{ left: `${(refLine.at / max) * 100}%`, width: 2, background: "var(--floor-line)" }} aria-hidden="true" />}
            </div>
            <div className={`mono text-right text-[13px] ${r.kind === "warn" ? "warn" : ""}`}>{r.text ?? `${signed && r.value > 0 ? "+" : r.value < 0 ? "−" : ""}${Math.abs(r.value).toFixed(r.value % 1 === 0 ? 0 : 1)}${unit}`}</div>
          </div>
        </div>
      ))}
      {refLine && (
        <p className="label mt-1 inline-flex items-center gap-2 acc" aria-hidden="true">
          <i className="inline-block h-3 w-0.5" style={{ background: "var(--floor-line)" }} />{refLine.label}
        </p>
      )}
    </div>
  );
}
