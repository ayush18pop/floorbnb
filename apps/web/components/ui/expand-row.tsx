"use client";
import { useId, useState, type ReactNode } from "react";
import "./calm.css";

/** A one-line lead with a More control that reveals the long text in place. aria-expanded + aria-controls; the text is real DOM, hidden until asked. */
export function ExpandRow({ lead, children, more = "More", less = "Less", label, flush }: { lead: ReactNode; children: ReactNode; more?: string; less?: string; label?: string; flush?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="xr">
      <div className="xr-row">
        {lead}
        <button type="button" className="xr-btn" aria-expanded={open} aria-controls={id} aria-label={label ? `${open ? less : more}: ${label}` : undefined} onClick={() => setOpen((o) => !o)}>{open ? less : more}</button>
      </div>
      <div id={id} className={`xr-body ${flush ? "xr-flush" : ""}`} hidden={!open}>{children}</div>
    </div>
  );
}
