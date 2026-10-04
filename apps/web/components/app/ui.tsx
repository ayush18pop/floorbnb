"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Info, OctagonAlert, X } from "lucide-react";
import { getSource } from "@/lib/adapters";
import { BSCSCAN } from "@/lib/app-config";
import { shortAddr } from "@/lib/adapters/format";

/** True when the screens render the labelled mock. */
export const isExample = () => getSource().kind === "mock";

/** EXAMPLE label. Rendered next to anything that comes from the mock source. */
export function ExampleBadge({ className = "" }: { className?: string }) {
  if (!isExample()) return null;
  return <span className={`badge ${className}`} title="Invented data for layout. Not a real position.">Example</span>;
}

export function Tile({ label, value, unit, note, tone }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; tone?: "pos" | "neg" | "warn" }) {
  return (
    <div className="tile">
      <p className="stat-label">{label}</p>
      <p className={`v ${tone ?? ""}`}>{value}{unit && <small>{unit}</small>}</p>
      {note && <p className="n">{note}</p>}
    </div>
  );
}

export function Notice({ kind = "info", children, action, title }: { kind?: "info" | "warn" | "neg"; title?: string; children: ReactNode; action?: ReactNode }) {
  const Icon = kind === "neg" ? OctagonAlert : kind === "warn" ? AlertTriangle : Info;
  return (
    <div className={`notice ${kind}`} role={kind === "info" ? "note" : "alert"}>
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p><b>{title}</b></p>}
        <div>{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

const LOCAL_DEV = process.env.NEXT_PUBLIC_LOCAL_DEV === "1"; // inlined at build time so production bundles drop every local-dev branch
/** Address or hash with a copy button and optional BscScan link (no link in local-dev mode: the fork is not on BscScan). */
export function Addr({ value, kind = "address", link = true }: { value: string; kind?: "address" | "tx"; link?: boolean }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1400); } catch { /* clipboard unavailable */ }
  };
  const href = `${BSCSCAN}/${kind === "tx" ? "tx" : "address"}/${value}`;
  return (
    <span className="inline-flex items-center gap-2 mono">
      <span title={value}>{shortAddr(value)}</span>
      <button type="button" onClick={copy} className="inline-flex h-6 w-6 items-center justify-center text-muted hover:text-ink" aria-label={`Copy ${kind}`}>
        {ok ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
      </button>
      {link && !isExample() && !LOCAL_DEV && <a className="prose-link" href={href} target="_blank" rel="noreferrer">BscScan</a>}
    </span>
  );
}

/** Modal built on <dialog>: focus trap, Escape and backdrop come from the platform. */
export function Dialog({ open, onClose, title, children, wide, labelledBy }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const prior = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { prior.current = document.activeElement as HTMLElement; d.showModal(); }
    if (!open && d.open) { d.close(); prior.current?.focus(); }
  }, [open]);
  const id = labelledBy ?? "dlg-title";
  return (
    <dialog ref={ref} className={`dlg ${wide ? "wide" : ""}`} aria-labelledby={id} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <>
          <div className="dh">
            <h2 id={id} className="h3">{title}</h2>
            <button type="button" className="xbtn" onClick={onClose} aria-label="Close"><X size={16} strokeWidth={1.5} /></button>
          </div>
          <div className="db">{children}</div>
        </>
      )}
    </dialog>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 p-6" role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="sk" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="p-4 md:p-6"><Notice kind="neg" title="Could not load this">{message}</Notice></div>;
}
