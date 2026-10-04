"use client";
import { useSyncExternalStore } from "react";

const sub = (cb: () => void) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); };

/** Viewport height (px), or `fallback` on the server. Used to size a chart so a page fits one screen. */
export function useViewportHeight(fallback = 800) {
  return useSyncExternalStore(sub, () => window.innerHeight, () => fallback);
}
export function useViewportWidth(fallback = 1280) {
  return useSyncExternalStore(sub, () => window.innerWidth, () => fallback);
}
