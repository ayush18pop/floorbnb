"use client";
import { useEffect, useState } from "react";

export type Async<T> = { data: T | null; error: string | null; loading: boolean };

/** Minimal async loader for source calls. Re-runs when `key` changes. */
export function useAsync<T>(fn: () => Promise<T>, key: string): Async<T> {
  const [s, setS] = useState<Async<T>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setS((p) => ({ ...p, loading: true, error: null }));
    fn().then(
      (data) => live && setS({ data, error: null, loading: false }),
      (e: unknown) => live && setS({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return s;
}
