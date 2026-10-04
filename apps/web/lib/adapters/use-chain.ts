"use client";
import { useCallback, useEffect, useState } from "react";
import { getSource } from "./index";
import { useAsync, useNow } from "./use";

/**
 * "Now" as the chain sees it: the latest block time (anvil's clock differs from the browser's). Null until read.
 * With the mock source it is the browser clock. Re-read every 30 s; between reads it stands still (dates only need the day).
 */
export function useChainNow(): number | null {
  const browser = useNow();
  const get = useCallback(() => getSource().chainTime(), []);
  const r = useAsync(get, "chain-now", undefined, 30_000);
  if (getSource().kind === "mock") return browser;
  return r.data;
}

/** Seconds since `at` (wall-clock ms), re-rendering every 5 s. Null when `at` is null. Starts at the first render, so it is never negative. */
export function useAgeSeconds(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(id); }, []);
  return at === null ? null : Math.max(0, Math.floor((now - at) / 1000));
}
