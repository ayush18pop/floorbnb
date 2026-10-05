import { nextWindowOpen } from "@floor/sdk";
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
const localFmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { hour12: false, timeZoneName: "short", ...o });
/** The viewer's own zone, from the browser. Null when it is UTC (nothing to add). Browser only. */
export const localZone = (): string | null => {
  const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return !z || z === "UTC" || z === "Etc/UTC" ? null : z;
};
/** "Mon 5 Oct, 21:00 IST": a chain timestamp in the viewer's zone. Browser only. */
export const localStamp = (t: number) => localFmt({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(t * 1000));
/** "21:00 to 01:00 IST": a UTC time-of-day range in the viewer's zone, using today's offset. Browser only. */
export function localRange(fromH: number, fromM: number, toH: number, toM: number): string {
  const d = new Date();
  const at = (h: number, m: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m));
  const hm = localFmt({ hour: "2-digit", minute: "2-digit", timeZoneName: undefined });
  return `${hm.format(at(fromH, fromM))} to ${localFmt({ hour: "2-digit", minute: "2-digit" }).format(at(toH, toM))}`;
}
export const daysLeft = (maturity: number, asOf: number) => Math.max(0, Math.ceil((maturity - asOf) / D));

export function phaseOf(p: PositionView): Phase {
  if (p.vaultStatus === "Closed") return "closed";
  if (p.vaultStatus === "Closing") return "closing";
  // Same test as @floor/sdk readPosition: no cushion left, so the vault holds USDT only.
  if (p.status.cushion === 0n && p.status.V > 0n) return "cashLock";
  return "active";
}

export function stockPct(p: PositionView): number {
  const V = num(p.status.V);
  return V > 0 ? (num(p.status.exposure) / V) * 100 : 0;
}

/** Next trading window start at or after `t` (SDK market helper, holidays from the SDK table). */
export const nextWindow = (t: number) => nextWindowOpen(t);

export const isAddress = (s: string | null): s is Address => !!s && /^0x[0-9a-fA-F]{40}$/.test(s);

export type Received = { usdt: bigint; tokens: { symbol: string; amount: bigint; value: bigint }[] };

/** "You received 12.3456 NVDAB (≈ 50.00 USDT at the 10-minute average) + 5.00 USDT. Total ≈ 55.00 USDT." or the USDT alone. */
export function receivedText(r: Received, kind: "requestClose" | "closeToUSDT" | "exitInKind"): string {
  const parts = [...r.tokens.map((t) => `${fmtW(t.amount, 4)} ${t.symbol} (≈ ${fmtW(t.value)} USDT at the 10-minute average)`), `${fmtW(r.usdt)} USDT`];
  if (kind === "closeToUSDT") return `You received ${fmtW(r.usdt)} USDT.`;
  return `You received ${parts.join(" + ")}. Total ≈ ${fmtW(r.usdt + r.tokens.reduce((a, t) => a + t.value, 0n))} USDT.`;
}

