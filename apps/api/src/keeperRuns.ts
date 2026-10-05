/**
 * Keeper run log behind an interface. packages/db is still a stub (name export only), so the only adapter is in memory
 * and starts empty: until the keeper writes through a real adapter, /v1/keeper/runs returns an empty list and the
 * heartbeat age is null. Nothing is invented.
 */
export interface KeeperRun {
  id: string;
  vault: string | null;
  startedAt: number;
  finishedAt: number | null;
  /** e.g. rebalanced, hold, error. Free-form from the keeper. */
  outcome: string;
  txHash: string | null;
  detail: Record<string, unknown> | null;
}

export interface KeeperRunStore {
  list(q: { limit: number; vault?: string }): Promise<KeeperRun[]>;
  get(id: string): Promise<KeeperRun | null>;
  /** 'chain' when the list is read from on-chain events (an empty list is then real). Absent: an in-memory store. */
  readonly source?: 'chain';
  /** Unix seconds of the newest run or heartbeat; null when none is known. */
  lastHeartbeat(): Promise<number | null>;
}

export class InMemoryKeeperRunStore implements KeeperRunStore {
  constructor(private runs: KeeperRun[] = []) {}
  add(r: KeeperRun): void {
    this.runs.push(r);
  }
  async list({ limit, vault }: { limit: number; vault?: string }): Promise<KeeperRun[]> {
    return this.runs
      .filter((r) => !vault || r.vault?.toLowerCase() === vault.toLowerCase())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }
  async get(id: string): Promise<KeeperRun | null> {
    return this.runs.find((r) => r.id === id) ?? null;
  }
  async lastHeartbeat(): Promise<number | null> {
    return this.runs.reduce<number | null>((m, r) => {
      const t = r.finishedAt ?? r.startedAt;
      return m === null || t > m ? t : m;
    }, null);
  }
}

import { readFileSync } from 'node:fs';
import type { Address, PublicClient } from 'viem';
import { ChainLogReader, type ChainLogReaderOpts } from './chainLogs';

/**
 * Keeper runs read from the chain: one run per vault `Rebalanced` event. The keeper does not write to an API run store yet,
 * so without this `/v1/keeper/runs` (and the MCP `get_rebalance_history` tool) are always empty. Enabled with
 * FLOOR_RUNS_FROM_BLOCK=<deploy block>. Logs come from a cached incremental ChainLogReader (chunked RPC, optionally Etherscan),
 * so no request ever scans an unbounded range.
 * `lastHeartbeat` stays null: an old rebalance does not prove the keeper is down, and a heartbeat needs the keeper to report it.
 */
export class ChainKeeperRunStore implements KeeperRunStore {
  readonly source = 'chain' as const;
  readonly reader: ChainLogReader;
  constructor(client: PublicClient, factory: Address, fromBlock: bigint, opts: ChainLogReaderOpts | ChainLogReader = {}) {
    this.reader = opts instanceof ChainLogReader ? opts : new ChainLogReader(client, factory, fromBlock, opts);
  }

  private async all(vault?: string): Promise<KeeperRun[]> {
    const vaults = vault ? [vault as Address] : await this.reader.vaults();
    const out: KeeperRun[] = [];
    for (const v of vaults) {
      for (const e of await this.reader.activity(v)) {
        if (e.eventName !== 'Rebalanced') continue;
        const a = e.args;
        out.push({
          id: `${e.txHash}:${e.logIndex}`,
          vault: v,
          startedAt: e.timestamp,
          finishedAt: e.timestamp,
          outcome: 'rebalanced',
          txHash: e.txHash,
          detail: { assetIdx: a.assetIdx, buy: a.buy, amountIn: a.amountIn, amountOut: a.amountOut, V: a.V, exposureTarget: a.exposureTarget, caller: a.caller },
        });
      }
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  async list({ limit, vault }: { limit: number; vault?: string }): Promise<KeeperRun[]> {
    return (await this.all(vault)).slice(0, limit);
  }
  async get(id: string): Promise<KeeperRun | null> {
    return (await this.all()).find((r) => r.id === id) ?? null;
  }
  async lastHeartbeat(): Promise<number | null> {
    return null;
  }
}

/** Last scan time (unix seconds) from the keeper's heartbeat file, or null when missing or unreadable. Nothing is invented. */
export function readHeartbeat(file: string): number | null {
  try {
    const t = (JSON.parse(readFileSync(file, 'utf8')) as { lastScan?: unknown }).lastScan;
    return typeof t === 'number' && Number.isFinite(t) && t > 0 ? Math.floor(t) : null;
  } catch {
    return null;
  }
}
