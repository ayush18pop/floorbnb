"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type Async<T> = { data: T | null; error: string | null; loading: boolean };

/** Minimal async loader for source calls. Re-runs when `key` changes; `loading` is derived from the key. */
export function useAsync<T>(fn: () => Promise<T>, key: string): Async<T> {
  const [res, setRes] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    let live = true;
    fnRef.current().then(
      (data) => live && setRes({ key, data, error: null }),
      (e: unknown) => live && setRes({ key, data: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  if (!res || res.key !== key) return { data: null, error: null, loading: true };
  return { data: res.data, error: res.error, loading: false };
}

const noop = () => () => {};
let t0: number | null = null;
const mountedAt = () => (t0 ??= Math.floor(Date.now() / 1000)); // cached: the snapshot must be stable
/** Current unix seconds, or null on the server and during hydration (keeps server and client HTML identical). */
export function useNow(): number | null {
  return useSyncExternalStore(noop, mountedAt, () => null);
}
