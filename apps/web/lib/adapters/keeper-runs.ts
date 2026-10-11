import type { Address, AssetSymbol, Hex, KeeperRun, KeeperStatus, SignerKind } from "./types";

/** One decoded vault `Rebalanced` log plus what is needed to label it. Pure data so the mapping can be tested. */
export type RebalanceLog = { vault: Address; symbol: AssetSymbol; buy: boolean; amountIn: bigint; amountOut: bigint; caller: Address; tx: Hex; time: number };

const toNum = (wad: bigint) => Number(wad / 10n ** 12n) / 1e6; // 18-decimal WAD to a JS number with 6 decimals

/** The keeper log shown on /app/keeper, built from on-chain `Rebalanced` events (the API run log is empty until the keeper writes to it). */
export function toKeeperRun(l: RebalanceLog, keepers: ReadonlySet<string>): KeeperRun {
  const signer: SignerKind = keepers.has(l.caller.toLowerCase()) ? "keeper" : "public";
  return {
    time: l.time, vault: l.vault, symbol: l.symbol, buy: l.buy, signer, tx: l.tx,
    amountIn: toNum(l.amountIn), amountInUnit: l.buy ? "USDT" : l.symbol,
    received: toNum(l.amountOut), receivedUnit: l.buy ? l.symbol : "USDT",
    // The event does not log the minimum out or the cost: leave them undefined so the page shows "n/a" rather than a made-up number.
  };
}

/**
 * Heartbeat age from a /healthz body. The API alone reports it as `keeper.heartbeatAgeSeconds`; the one-box server puts its
 * keeper loop state at `keeper` and nests the API's body at `api`, so the age is at `api.keeper.heartbeatAgeSeconds`.
 */
export function heartbeatAge(body: unknown): number | null {
  const age = (o: unknown): number | null => {
    const v = (o as { keeper?: { heartbeatAgeSeconds?: unknown } } | null | undefined)?.keeper?.heartbeatAgeSeconds;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return age(body) ?? age((body as { api?: unknown } | null | undefined)?.api);
}

/** Status tiles from chain facts. `online` needs a heartbeat: null (none known) is reported as offline, never guessed. */
export function toKeeperStatus(runs: KeeperRun[], now: number, tradingOpen: boolean, heartbeatAgeSeconds: number | null): KeeperStatus {
  const last = runs.reduce((m, r) => Math.max(m, r.time), 0);
  return {
    online: heartbeatAgeSeconds !== null && heartbeatAgeSeconds < 600,
    lastRunTime: last,
    tradingOpen,
    rebalancesToday: runs.filter((r) => now - r.time < 86_400).length,
    heartbeatAgeSeconds,
  };
}

/** "last scan 12 s ago" from the heartbeat the keeper writes each tick; "no heartbeat" when none is known (never guessed). */
export function scanNote(age: number | null | undefined): string {
  if (age === null || age === undefined) return "no heartbeat seen";
  return age < 90 ? `last scan ${age} s ago` : `last scan ${Math.round(age / 60)} min ago`;
}

