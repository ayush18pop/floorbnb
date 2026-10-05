import { addrUrl, blockUrl, LOCAL_DEV, txUrl } from "./app-config";
import { shortAddr } from "./adapters/format";

export type ExplorerKind = "tx" | "address" | "block";

/** The one check: mock data and the local fork do not exist on BscScan, so they are never linked. */
export const explorerEnabled = (example: boolean, local: boolean = LOCAL_DEV) => !example && !local;

export function explorerHref(kind: ExplorerKind, value: string | number): string {
  return kind === "tx" ? txUrl(String(value)) : kind === "address" ? addrUrl(String(value)) : blockUrl(value);
}

export const shortValue = (kind: ExplorerKind, value: string | number) => (kind === "block" ? String(value) : shortAddr(String(value)));

export function explorerLabel(kind: ExplorerKind, value: string | number) {
  const noun = kind === "tx" ? "transaction" : kind === "address" ? "address" : "block";
  return `View ${noun} ${shortValue(kind, value)} on BscScan`;
}
