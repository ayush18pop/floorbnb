"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { getSource } from "@/lib/adapters";
import type { Address } from "@/lib/adapters/types";

/**
 * Asks the API to sync its chain-log index to head now, then calls `onDone` so the page refetches its data.
 * Shows a spinner while it runs and "Synced to block N" after. Renders nothing when the source cannot refresh (mock).
 * The API rate limits (1 per vault per 15 s) and then answers with its last result, so rapid clicks are harmless.
 */
export function RefreshButton({ vault, onDone }: { vault?: Address; onDone: () => void }) {
  const source = getSource();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!source.refresh) return null;
  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await source.refresh!(vault);
      if (r) setNote(`Synced to block ${r.syncedToBlock.toLocaleString("en-US")}`);
      onDone();
    } catch {
      setNote("Could not sync right now");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn btn-ghost !h-8 text-[13px]" onClick={run} disabled={busy} aria-busy={busy} data-testid="refresh-index">
        <RefreshCw size={14} strokeWidth={1.5} className={busy ? "animate-spin" : undefined} aria-hidden="true" /> {busy ? "Syncing…" : "Refresh"}
      </button>
      <span className="small !text-muted" role="status" aria-live="polite" data-testid="refresh-note">{note}</span>
    </span>
  );
}
