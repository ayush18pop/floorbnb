"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { getSource } from "@/lib/adapters";
import { explorerEnabled, explorerHref, explorerLabel, shortValue, type ExplorerKind } from "@/lib/explorer";

type Props = { value: string | number; kind: ExplorerKind; copy?: boolean; full?: boolean; example?: boolean };

/** Truncated hash, address or block as a BscScan link. In mock or local-dev mode it is plain text (that data is not on mainnet). */
export function ExplorerLink({ value, kind, copy = true, full = false, example }: Props) {
  const [ok, setOk] = useState(false);
  const isEx = example ?? getSource().kind === "mock";
  const text = full ? String(value) : shortValue(kind, value);
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(String(value)); setOk(true); setTimeout(() => setOk(false), 1400); } catch { /* clipboard unavailable */ }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2 mono">
      {explorerEnabled(isEx)
        ? <a className="prose-link break-all" href={explorerHref(kind, value)} target="_blank" rel="noopener noreferrer" aria-label={explorerLabel(kind, value)} title={String(value)}>{text}</a>
        : <span title={String(value)}>{text}</span>}
      {copy && kind !== "block" && (
        <button type="button" onClick={doCopy} className="inline-flex h-6 w-6 items-center justify-center text-muted hover:text-ink" aria-label={`Copy ${kind === "tx" ? "transaction hash" : "address"}`}>
          {ok ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
        </button>
      )}
    </span>
  );
}
export const TxLink = ({ hash, ...r }: { hash: string } & Omit<Props, "value" | "kind">) => <ExplorerLink kind="tx" value={hash} {...r} />;
export const AddrLink = ({ address, ...r }: { address: string } & Omit<Props, "value" | "kind">) => <ExplorerLink kind="address" value={address} {...r} />;
export const BlockLink = ({ block, ...r }: { block: number | string } & Omit<Props, "value" | "kind">) => <ExplorerLink kind="block" value={block} {...r} />;
