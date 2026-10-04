"use client";
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import "./calm.css";

/** Index to focus after a key press in a tablist (arrow keys wrap, Home and End jump). Returns null for other keys. */
export function nextTab(count: number, current: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export type TabItem = { id: string; label: string; panel: ReactNode };

/** WAI-ARIA tabs: roving tabindex, arrow keys, Home/End. Panels are real DOM but hidden until selected, so only the selected one counts as visible text. */
export function Tabs({ items, label, initial = 0, className = "", panelMaxHeight }: { items: TabItem[]; label: string; initial?: number; className?: string; panelMaxHeight?: number }) {
  const uid = useId();
  const [sel, setSel] = useState(initial);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const n = nextTab(items.length, sel, e.key);
    if (n === null) return;
    e.preventDefault();
    setSel(n);
    refs.current[n]?.focus();
  };
  return (
    <div className={`tabs ${className}`} style={panelMaxHeight ? ({ "--panel-h": `${panelMaxHeight}px` } as CSSProperties) : undefined}>
      <div role="tablist" aria-label={label} className="tabs-list" onKeyDown={onKey}>
        {items.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${uid}-t-${t.id}`} aria-selected={sel === i} aria-controls={`${uid}-p-${t.id}`} tabIndex={sel === i ? 0 : -1} className="tab" onClick={() => setSel(i)}>{t.label}</button>
        ))}
      </div>
      {items.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`${uid}-p-${t.id}`} aria-labelledby={`${uid}-t-${t.id}`} hidden={sel !== i} tabIndex={0} className="tabs-panel">{t.panel}</div>
      ))}
    </div>
  );
}
