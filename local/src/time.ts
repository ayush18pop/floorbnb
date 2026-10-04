import { rpc } from "./util";

const H = 3600;
export const chainNow = async () => Number(BigInt((await rpc<{ timestamp: string }>("eth_getBlockByNumber", ["latest", false])).timestamp));
const fmt = (t: number) => new Date(t * 1000).toUTCString().replace("GMT", "UTC");

/** Mon-Fri 15:30-19:30 UTC (docs/CONTRACTS.md section 6). Holidays are ignored here; the chain is the authority. */
export function inWindow(t: number): boolean {
  const d = new Date(t * 1000); const dow = d.getUTCDay(); const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return dow >= 1 && dow <= 5 && m >= 15 * 60 + 30 && m < 19 * 60 + 30;
}
const atUtc = (t: number, dayOffset: number, hh: number, mm: number) => {
  const d = new Date(t * 1000); d.setUTCDate(d.getUTCDate() + dayOffset); d.setUTCHours(hh, mm, 0, 0); return Math.floor(d.getTime() / 1000);
};

/** First weekday strictly after `t`'s day (or the same day if 16:00 is still ahead) at hh:mm UTC. */
export function nextWeekdayAt(t: number, hh: number, mm: number, sameDayOk = true): number {
  for (let i = sameDayOk ? 0 : 1; i < 9; i++) {
    const c = atUtc(t, i, hh, mm); const dow = new Date(c * 1000).getUTCDay();
    if (c > t && dow >= 1 && dow <= 5) return c;
  }
  throw new Error("no weekday found");
}
export function nextDowAt(t: number, dow: number, hh: number, mm: number): number {
  for (let i = 0; i < 9; i++) { const c = atUtc(t, i, hh, mm); if (c > t && new Date(c * 1000).getUTCDay() === dow) return c; }
  throw new Error("no such day");
}

/** Target timestamp for a named time state, or null when the chain is already in it. */
export function targetFor(spec: string, now: number): number | null {
  if (spec === "window") {
    if (inWindow(now)) return null;
    return nextWeekdayAt(now, 16, 0);
  }
  if (spec === "closed") { // weekday, after hours (21:00 UTC)
    const d = new Date(now * 1000).getUTCDay();
    if (d >= 1 && d <= 5 && !inWindow(now)) return null;
    return nextWeekdayAt(now, 21, 0);
  }
  if (spec === "weekend") {
    const d = new Date(now * 1000).getUTCDay();
    if (d === 0 || d === 6) return null;
    return nextDowAt(now, 6, 12, 0);
  }
  const m = /^\+(\d+)(m|h|d)$/.exec(spec);
  if (m) return now + Number(m[1]) * { m: 60, h: H, d: 24 * H }[m[2] as "m" | "h" | "d"];
  throw new Error(`unknown time spec "${spec}": use window | closed | weekend | +30m | +1h | +2d`);
}

export async function warpTo(ts: number): Promise<number> {
  const now = await chainNow();
  if (ts <= now) throw new Error(`cannot go back in time (chain ${fmt(now)}); use \`pnpm local:reset\``);
  await rpc("evm_setNextBlockTimestamp", [ts]);
  await rpc("evm_mine");
  return chainNow();
}
export async function timeCmd(spec: string | undefined) {
  const now = await chainNow();
  if (!spec) { console.log(`chain time ${fmt(now)}  trading window: ${inWindow(now) ? "OPEN" : "closed"}`); return; }
  const t = targetFor(spec, now);
  if (t === null) { console.log(`already in state "${spec}": ${fmt(now)}`); return; }
  const after = await warpTo(t);
  console.log(`chain time -> ${fmt(after)}  trading window: ${inWindow(after) ? "OPEN" : "closed"}`);
}
