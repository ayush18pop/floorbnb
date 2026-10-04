"use client";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./calm.css";

type Box = { left: number; top: number; width: number; height: number };

/** Where to put a popover of size `pop` next to `anchor`, inside `vp`: below if it fits, else above, clamped to the viewport. */
export function placePopover(anchor: Box, pop: { width: number; height: number }, vp: { width: number; height: number }, gap = 8, margin = 12) {
  const below = anchor.top + anchor.height + gap;
  const fitsBelow = below + pop.height <= vp.height - margin;
  const above = anchor.top - gap - pop.height;
  const top = fitsBelow || above < margin ? Math.max(margin, Math.min(below, vp.height - margin - pop.height)) : above;
  const left = Math.max(margin, Math.min(anchor.left, vp.width - margin - pop.width));
  return { top: Math.round(top), left: Math.round(left) };
}

/** Tab order inside a trapped container: wraps at both ends. Returns the index to focus. */
export function wrapFocus(count: number, current: number, shift: boolean) {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}

/** False on the server and during hydration, true after: lets a portal render without a hydration mismatch. */
export const useMounted = () => useSyncExternalStore(() => () => {}, () => true, () => false);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * (i) button with an explanation popover. Native popover="auto": Escape and outside click close it, it sits in the top layer so it never
 * clips, and it is a bottom sheet on phones. Focus moves into the panel, is trapped there, and returns to the (i) button on close.
 * Works by click, tap and keyboard (Enter or Space on the button). Nothing is hover-only.
 */
export function InfoPopover({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const mounted = useMounted();

  const place = useCallback(() => {
    const b = btn.current, p = pop.current;
    if (!b || !p) return;
    const a = b.getBoundingClientRect();
    const r = p.getBoundingClientRect();
    const { top, left } = placePopover({ left: a.left, top: a.top, width: a.width, height: a.height }, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight });
    p.style.top = `${top}px`; p.style.left = `${left}px`;
  }, []);

  const toggle = () => {
    const p = pop.current;
    if (!p) return;
    if (p.matches(":popover-open")) p.hidePopover(); else p.showPopover();
  };

  useEffect(() => {
    const p = pop.current;
    if (!p) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen) { place(); p.focus({ preventScroll: true }); }
      else if (!document.activeElement || document.activeElement === document.body || p.contains(document.activeElement)) btn.current?.focus({ preventScroll: true });
    };
    p.addEventListener("toggle", onToggle);
    return () => p.removeEventListener("toggle", onToggle);
  }, [place, mounted]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e.type === "scroll" && pop.current?.contains(e.target as Node)) return; pop.current?.hidePopover(); };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = Array.from(pop.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const i = wrapFocus(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
    if (i < 0) return;
    e.preventDefault();
    items[i].focus();
  };

  return (
    <>
      <button ref={btn} type="button" className="ip-btn" aria-label={`More about ${label}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={toggle}>i</button>
      {mounted && createPortal(
      <div ref={pop} id={id} popover="auto" role="dialog" aria-label={title ?? label} tabIndex={-1} className="ip-pop" onKeyDown={onKeyDown}>
        <div className="ip-h">
          <span className="ip-t">{title ?? label}</span>
          <button type="button" className="ip-x" aria-label="Close" onClick={() => pop.current?.hidePopover()}><X size={14} strokeWidth={1.5} /></button>
        </div>
        <div className="ip-b">{open ? children : null}</div>
      </div>, document.body)}
    </>
  );
}
