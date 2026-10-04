"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type Async<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Minimal async loader for source calls. Re-runs when `key` changes; `loading` is derived from the key.
 * `group` (optional) names what the data is about (for example the vault and wallet): when only the key changes inside the same
 * group (a refresh after a transaction) the previous data stays on screen instead of a skeleton, so open dialogs are not unmounted.
 */
export function useAsync<T>(fn: () => Promise<T>, key: string, group?: string): Async<T> {
  const [res, setRes] = useState<{ key: string; group?: string; data: T | null; error: string | null } | null>(null);
  const fnRef = useRef(fn);
  const groupRef = useRef(group);
  fnRef.current = fn; // eslint-disable-line react-hooks/refs
  groupRef.current = group; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    let live = true;
    fnRef.current().then(
      (data) => live && setRes({ key, group: groupRef.current, data, error: null }),
      (e: unknown) => live && setRes({ key, group: groupRef.current, data: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return deriveAsync(res, key, group);
}

type Res<T> = { key: string; group?: string; data: T | null; error: string | null } | null;
/** Pure: what the screen sees for the stored result `res` when the current key/group are given. */
export function deriveAsync<T>(res: Res<T>, key: string, group?: string): Async<T> {
  if (res && res.key !== key && group !== undefined && res.group === group && res.data !== null) return { data: res.data, error: null, loading: false };
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
