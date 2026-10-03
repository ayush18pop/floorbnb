import type { Address, Phase, PositionView } from "./types";

export const WAD = 10n ** 18n;
export const wad = (n: number): bigint => BigInt(Math.round(n * 1e6)) * 10n ** 12n;
/** WAD to a JS number. Display only. */
export const num = (w: bigint): number => Number(w / 10n ** 12n) / 1e6;

export const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtW = (w: bigint, d = 2) => fmt(num(w), d);
export const sgn = (n: number, d = 2) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n), d)}`;
export const pct = (n: number, d = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}%`;
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const D = 86_400;
export const isoDate = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
export const isoTime = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
export const stamp = (t: number) => `${isoDate(t)} ${isoTime(t)}`;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const dow = (t: number) => DOW[new Date(t * 1000).getUTCDay()];
export const daysLeft = (maturity: number, asOf: number) => Math.max(0, Math.ceil((maturity - asOf) / D));

export function phaseOf(p: PositionView): Phase {
  if (p.vaultStatus === "Closed") return "closed";
  if (p.vaultStatus === "Closing") return "closing";
  if (p.status.target === 0n && p.status.exposure < p.status.V / 100n) return "cashLock";
  return "active";
}

export function stockPct(p: PositionView): number {
  const V = num(p.status.V);
  return V > 0 ? (num(p.status.exposure) / V) * 100 : 0;
}

/** Next trading window start after `t`: Mon to Fri 15:30 UTC (holidays are not modelled here). */
export function nextWindow(t: number): number {
  const d = new Date(t * 1000);
  const open = (day: Date) => Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 15, 30) / 1000;
  const cur = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  for (let i = 0; i < 8; i++) {
    const day = new Date(cur.getTime() + i * D * 1000);
    const wd = day.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (open(day) > t) return open(day);
  }
  return t;
}

export const isAddress = (s: string | null): s is Address => !!s && /^0x[0-9a-fA-F]{40}$/.test(s);
