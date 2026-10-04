"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useMounted } from "./info-popover";
import "./calm.css";

/**
 * Side sheet on desktop, bottom sheet on phones, on the native <dialog>: focus trap, Escape and backdrop come from the platform.
 * Controlled (open + onClose) or self-contained (pass `trigger`, which becomes the opening control). Focus returns to the opener on close.
 * The body renders only while open, so nothing in it counts as visible text until someone asks for it.
 */
export function DetailsDrawer({ open, onClose, title, children, trigger, triggerClassName = "dd-link", triggerLabel }: {
  open?: boolean; onClose?: () => void; title: string; children: ReactNode; trigger?: ReactNode; triggerClassName?: string; triggerLabel?: string;
}) {
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const tid = useId();
  const mounted = useMounted();
  const close = () => { setInner(false); onClose?.(); };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (isOpen && !d.open) { opener.current = (document.activeElement as HTMLElement) ?? null; d.showModal(); }
    if (!isOpen && d.open) { d.close(); opener.current?.focus({ preventScroll: true }); }
  }, [isOpen, mounted]);

  return (
    <>
      {trigger !== undefined && <button type="button" className={triggerClassName} aria-haspopup="dialog" aria-label={triggerLabel} onClick={() => setInner(true)}>{trigger}</button>}
      {mounted && createPortal(
      <dialog ref={ref} className="dd" aria-labelledby={tid} onClose={() => { if (isOpen) close(); }} onClick={(e) => { if (e.target === ref.current) close(); }}>
        {isOpen && (
          <>
            <div className="dd-h">
              <h2 id={tid} className="h3">{title}</h2>
              <button type="button" className="dd-x" onClick={close} aria-label="Close"><X size={16} strokeWidth={1.5} /></button>
            </div>
            <div className="dd-b">{children}</div>
          </>
        )}
      </dialog>, document.body)}
    </>
  );
}
