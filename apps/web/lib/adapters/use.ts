"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type Async<T> = { data: T | null; error: string | null; loading: boolean };
export type AsyncAt<T> = Async<T> & { /** Wall-clock ms of the last successful load (null before the first). */ updatedAt: number | null };

type Res<T> = { key: string; group?: string; data: T | null; error: string | null; at?: number } | null;

/**
 * Minimal async loader for source calls. Re-runs when `key` changes; `loading` is derived from the key.
 * `group` (optional) names what the data is about (for example the vault and wallet): when only the key changes inside the same
 * group (a refresh after a transaction) the previous data stays on screen instead of a skeleton, so open dialogs are not unmounted.
 * `refreshMs` (optional) re-runs the loader about that often while the tab is visible (and once when it becomes visible again).
 * A failed background refresh keeps the last good data instead of replacing the page with an error.
 */
export function useAsync<T>(fn: () => Promise<T>, key: string, group?: string, refreshMs?: number): AsyncAt<T> {
  const [res, setRes] = useState<Res<T>>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  const groupRef = useRef(group);
  const resRef = useRef<Res<T>>(null);
  fnRef.current = fn; // eslint-disable-line react-hooks/refs
  groupRef.current = group; // eslint-disable-line react-hooks/refs
  resRef.current = res; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    let live = true;
    fnRef.current().then(
      (data) => live && setRes({ key, group: groupRef.current, data, error: null, at: Date.now() }),
      (e: unknown) => {
        if (!live) return;
        const prev = resRef.current;
        if (prev && prev.key === key && prev.data !== null) return; // background refresh failed: keep what is on screen
        setRes({ key, group: groupRef.current, data: null, error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [key, tick]);
  useEffect(() => {
    if (!refreshMs) return;
    const bump = () => { if (document.visibilityState === "visible") setTick((n) => n + 1); };
    const id = setInterval(bump, refreshMs);
    document.addEventListener("visibilitychange", bump);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", bump); };
  }, [refreshMs]);
  const d = deriveAsync(res, key, group);
  return { ...d, updatedAt: res && res.data !== null && !d.loading ? res.at ?? null : null };
}

/** Pure: what the screen sees for the stored result `res` when the current key/group are given. */
export function deriveAsync<T>(res: Res<T>, key: string, group?: string): Async<T> {
  if (res && res.key !== key && group !== undefined && res.group === group && res.data !== null) return { data: res.data, error: null, loading: false };
  if (!res || res.key !== key) return { data: null, error: null, loading: true };
  return { data: res.data, error: res.error, loading: false };
}

const noop = () => () => {};
let t0: number | null = null;
const mountedAt = () => (t0 ??= Math.floor(Date.now() / 1000)); // cached: the snapshot must be stable
/** Current unix seconds of the BROWSER clock, or null on the server and during hydration. Prefer useChainNow for anything the chain decides. */
export function useNow(): number | null {
  return useSyncExternalStore(noop, mountedAt, () => null);
}
