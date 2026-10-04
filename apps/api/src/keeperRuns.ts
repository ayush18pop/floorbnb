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
import { parseEventLogs, type Address, type PublicClient } from 'viem';
import { floorFactoryAbi, floorVaultAbi } from '@floor/sdk';

/**
 * Keeper runs read from the chain: one run per vault `Rebalanced` event. The keeper does not write to an API run store yet,
 * so without this `/v1/keeper/runs` (and the MCP `get_rebalance_history` tool) are always empty. Enabled with
 * FLOOR_RUNS_FROM_BLOCK=<deploy block> (a bounded `getLogs` range; public RPCs reject open-ended ranges).
 * `lastHeartbeat` stays null: an old rebalance does not prove the keeper is down, and a heartbeat needs the keeper to report it.
 */
export class ChainKeeperRunStore implements KeeperRunStore {
  constructor(private client: PublicClient, private factory: Address, private fromBlock: bigint) {}

  private async vaults(): Promise<Address[]> {
    const n = await this.client.readContract({ address: this.factory, abi: floorFactoryAbi, functionName: 'positionsCount' });
    return Promise.all(
      Array.from({ length: Number(n) }, (_, i) => this.client.readContract({ address: this.factory, abi: floorFactoryAbi, functionName: 'positions', args: [BigInt(i)] }) as Promise<Address>),
    );
  }

  private async all(vault?: string): Promise<KeeperRun[]> {
    const vaults = vault ? [vault as Address] : await this.vaults();
    if (!vaults.length) return [];
    const logs = parseEventLogs({ abi: floorVaultAbi, eventName: 'Rebalanced', logs: await this.client.getLogs({ address: vaults, fromBlock: this.fromBlock, toBlock: 'latest' }) });
    const times = new Map<bigint, number>();
    const out: KeeperRun[] = [];
    for (const l of logs) {
      if (!times.has(l.blockNumber)) times.set(l.blockNumber, Number((await this.client.getBlock({ blockNumber: l.blockNumber })).timestamp));
      const t = times.get(l.blockNumber)!;
      out.push({
        id: `${l.transactionHash}:${l.logIndex}`,
        vault: l.address,
        startedAt: t,
        finishedAt: t,
        outcome: 'rebalanced',
        txHash: l.transactionHash,
        detail: { assetIdx: l.args.assetIdx, buy: l.args.buy, amountIn: l.args.amountIn, amountOut: l.args.amountOut, V: l.args.V, exposureTarget: l.args.exposureTarget, caller: l.args.caller },
      });
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
