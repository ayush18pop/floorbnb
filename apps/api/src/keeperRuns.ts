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
