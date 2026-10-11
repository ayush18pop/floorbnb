import { createPublicClient, decodeEventLog, getAddress, http, type Abi, type Address, type Hex, type Log, type PublicClient } from 'viem';
import type { ChainLogStore, StoredLog } from '@floor/db';
import { floorFactoryAbi, floorVaultAbi, getLogsChunked } from '@floor/sdk';

/** A raw log with the fields the readers need. */
export type RawLog = Pick<Log, 'address' | 'topics' | 'data' | 'blockNumber' | 'transactionHash' | 'logIndex'>;

/** Fetches every log of one address in [from, to]. Throws on failure so the caller can fall back. */
export type LogProvider = (address: Address, from: bigint, to: bigint) => Promise<RawLog[]>;

/** Chunked, range-limit tolerant RPC provider. */
export function rpcProvider(client: PublicClient): LogProvider {
  return (address, from, to) => getLogsChunked<RawLog>(client, { address, fromBlock: from, toBlock: to });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Optional Etherscan v2 provider (BSC = chain 56). The key comes from the caller (env) and is never logged or returned:
 * errors thrown here carry no URL. Paginated, about 4 requests per second, "No records found" is an empty page.
 */
export function etherscanProvider(apiKey: string, fetchFn: typeof fetch = fetch, minGapMs = 250): LogProvider {
  let last = 0;
  let unsupported = false; // the free Etherscan plan does not cover BSC: stop calling it after the first such answer
  const PAGE = 1000;
  return async (address, from, to) => {
    if (unsupported) throw new Error('etherscan disabled: plan does not cover this chain');
    const out: RawLog[] = [];
    for (let page = 1; ; page++) {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const url = `https://api.etherscan.io/v2/api?chainid=56&module=logs&action=getLogs&address=${address}&fromBlock=${from}&toBlock=${to}&page=${page}&offset=${PAGE}&apikey=${apiKey}`;
      let body: { status?: string; message?: string; result?: unknown };
      try {
        const res = await fetchFn(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = (await res.json()) as typeof body;
      } catch (e) {
        throw new Error(`etherscan request failed: ${e instanceof Error ? e.message.replaceAll(apiKey, '***') : 'error'}`);
      }
      if (body.status !== '1') {
        if (/no records found/i.test(String(body.message))) break;
        if (/free api access|upgrade your api plan/i.test(String(body.result))) unsupported = true;
        throw new Error(`etherscan error: ${String(body.message ?? 'unknown')} ${typeof body.result === 'string' ? body.result.replaceAll(apiKey, '***') : ''}`.trim());
      }
      const rows = Array.isArray(body.result) ? (body.result as Record<string, string | string[]>[]) : [];
      for (const r of rows) {
        out.push({
          address: getAddress(r.address as string),
          topics: r.topics as unknown as RawLog["topics"],
          data: r.data as Hex,
          blockNumber: BigInt(r.blockNumber as string),
          transactionHash: r.transactionHash as Hex,
          logIndex: Number(BigInt(((r.logIndex as unknown as string) || '0x0'))),
        });
      }
      if (rows.length < PAGE) break;
    }
    return out;
  };
}

/** Provider that tries the primary one, and uses the fallback when it throws. */
export function withFallback(primary: LogProvider, fallback: LogProvider): LogProvider {
  return async (a, f, t) => {
    try { return await primary(a, f, t); } catch { return fallback(a, f, t); }
  };
}

export const REORG_BLOCKS = 12n;

/** Provider failed but persisted history exists: callers serve the stored rows. */
class StaleSync extends Error { constructor(cause: unknown) { super(`provider failed, serving stored rows: ${(cause instanceof Error ? cause.message : String(cause)).split('\n')[0]}`); } }

interface Entry {
  logs: Map<string, RawLog>;
  cursor: bigint;
  fetchedAt: number;
  inflight?: Promise<void>;
  /** The persisted rows and cursor were loaded into this entry. */
  loaded?: boolean;
  /** Logs added by the last sync that were not known before. */
  lastNew?: number;
}

export interface SyncResult { syncedToBlock: bigint; newLogs: number }

export interface IndexerStatus {
  enabled: boolean;
  /** unix seconds of the last full background sync, null before the first */
  lastSyncAt: number | null;
  /** head minus the lowest synced block over known addresses at the last sync, null before the first */
  headLag: number | null;
  lastError: string | null;
}

const toStored = (l: RawLog): StoredLog => ({ address: l.address.toLowerCase(), blockNumber: l.blockNumber ?? 0n, logIndex: l.logIndex ?? 0, txHash: l.transactionHash as string, topics: [...l.topics] as string[], data: l.data });
const fromStored = (l: StoredLog): RawLog => ({ address: l.address as Address, blockNumber: l.blockNumber, logIndex: l.logIndex, transactionHash: l.txHash as Hex, topics: l.topics as RawLog['topics'], data: l.data as Hex });

/** Minimum gap between forced refreshes of the same target; inside it the last result is returned. */
export const REFRESH_MIN_GAP_MS = 15_000;

export interface ActivityEvent {
  eventName: string;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  timestamp: number;
  args: Record<string, unknown>;
}

export interface ChainLogReaderOpts {
  provider?: LogProvider;
  ttlMs?: number;
  now?: () => number;
  /** Persistent store (Postgres). Absent: memory only, exactly the old behavior. */
  store?: ChainLogStore;
  /** Minimum gap between forced refreshes of one target. Default 15 s. */
  refreshGapMs?: number;
}

/**
 * Cached, incremental log reader. Per address it remembers the last scanned block (the cursor), so a request only scans
 * new blocks (rewinding 12 for reorg safety) and a short TTL avoids hitting the RPC on every request.
 * A vault's scan starts at its creation block (from the factory's PositionCreated) when known, else at `fromBlock`.
 */
export class ChainLogReader {
  private entries = new Map<string, Entry>();
  private created = new Map<string, bigint>();
  private times = new Map<bigint, number>();
  private provider: LogProvider;
  private ttl: number;
  private now: () => number;
  private store?: ChainLogStore;
  private refreshGap: number;
  private refreshed = new Map<string, { at: number; res: Promise<SyncResult> }>();
  private status: IndexerStatus;

  constructor(private client: PublicClient, private factory: Address, private fromBlock: bigint, o: ChainLogReaderOpts = {}) {
    this.provider = o.provider ?? rpcProvider(client);
    this.ttl = o.ttlMs ?? 12_000;
    this.now = o.now ?? Date.now;
    this.store = o.store;
    this.refreshGap = o.refreshGapMs ?? REFRESH_MIN_GAP_MS;
    this.status = { enabled: !!o.store, lastSyncAt: null, headLag: null, lastError: null };
  }

  get persistent(): boolean { return !!this.store; }
  indexerStatus(): IndexerStatus { return { ...this.status }; }

  private async sync(address: Address, start: bigint, force = false): Promise<RawLog[]> {
    const key = address.toLowerCase();
    let e = this.entries.get(key);
    if (!e) { e = { logs: new Map(), cursor: start - 1n, fetchedAt: -Infinity }; this.entries.set(key, e); }
    const entry = e;
    if (force || this.now() - entry.fetchedAt >= this.ttl) {
      entry.inflight ??= (async () => {
        try {
          if (this.store && !entry.loaded) {
            // Serve from the DB first: persisted rows and cursor seed the entry, then only the tail is fetched.
            const [rows, cur] = await Promise.all([this.store.logs(key), this.store.cursor(key)]);
            for (const r of rows) { const l = fromStored(r); entry.logs.set(`${l.transactionHash}:${l.logIndex}`, l); }
            if (cur !== null && cur > entry.cursor) entry.cursor = cur;
            entry.loaded = true;
          }
          const head = await this.client.getBlockNumber();
          const from = entry.cursor + 1n - REORG_BLOCKS > start ? entry.cursor + 1n - REORG_BLOCKS : start;
          entry.lastNew = 0;
          if (from <= head) {
            let fresh: RawLog[];
            try {
              fresh = await this.provider(address, from, head);
            } catch (err) {
              // With persisted history the stale rows are still correct (events are permanent): serve them, retry next time.
              if (this.store && entry.cursor >= start) { entry.fetchedAt = this.now(); throw new StaleSync(err); }
              throw err;
            }
            const before = new Set(entry.logs.keys());
            for (const [k, l] of entry.logs) if ((l.blockNumber ?? 0n) >= from) entry.logs.delete(k);
            for (const l of fresh) entry.logs.set(`${l.transactionHash}:${l.logIndex}`, l);
            entry.lastNew = [...entry.logs.keys()].filter((k) => !before.has(k)).length;
            if (this.store) {
              try { await this.store.save(key, from, fresh.map(toStored), head); } catch (err) { console.error('[indexer] store write failed:', err instanceof Error ? err.message.split('\n')[0] : 'error'); }
            }
          }
          entry.cursor = head;
          entry.fetchedAt = this.now();
        } finally {
          entry.inflight = undefined;
        }
      })();
    }
    if (entry.inflight) {
      try { await entry.inflight; } catch (err) { if (!(err instanceof StaleSync)) throw err; this.status.lastError = err.message; }
    }
    return [...entry.logs.values()];
  }

  private start(vault: Address): bigint {
    const created = this.created.get(vault.toLowerCase());
    return created !== undefined && created > this.fromBlock ? created : this.fromBlock;
  }

  /**
   * Sync one target to head now (the factory when `vault` is undefined). At most one forced sync per target per
   * refreshGap; inside the gap the previous result is returned.
   */
  refresh(vault?: Address): Promise<SyncResult> {
    const key = vault ? vault.toLowerCase() : 'factory';
    const prev = this.refreshed.get(key);
    if (prev && this.now() - prev.at < this.refreshGap) return prev.res;
    const res = (async (): Promise<SyncResult> => {
      const addr = vault ?? this.factory;
      if (vault) await this.creationBlocks();
      await this.sync(addr, vault ? this.start(vault) : this.fromBlock, true);
      const e = this.entries.get(addr.toLowerCase())!;
      return { syncedToBlock: e.cursor, newLogs: e.lastNew ?? 0 };
    })();
    this.refreshed.set(key, { at: this.now(), res });
    res.catch(() => this.refreshed.delete(key));
    return res;
  }

  /** Background pass: factory, then every known vault, up to head. Records the indexer status; never throws. */
  async syncAll(): Promise<void> {
    try {
      await this.sync(this.factory, this.fromBlock, true);
      await this.creationBlocks();
      let low: bigint | null = null;
      for (const v of await this.vaults()) {
        await this.sync(v, this.start(v), true);
        const c = this.entries.get(v.toLowerCase())!.cursor;
        if (low === null || c < low) low = c;
      }
      const head = await this.client.getBlockNumber();
      this.status.lastSyncAt = Math.floor(this.now() / 1000);
      this.status.headLag = Number(head - (low ?? this.entries.get(this.factory.toLowerCase())!.cursor));
      this.status.lastError = null;
    } catch (e) {
      this.status.lastError = (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? 'error';
      console.error(`[indexer] sync failed: ${this.status.lastError}`);
    }
  }

  /** Vault -> creation block, from the factory's PositionCreated events (cached incrementally like any address). */
  private async creationBlocks(): Promise<void> {
    try {
      const logs = await this.sync(this.factory, this.fromBlock);
      for (const l of logs) {
        try {
          const d = decodeEventLog({ abi: floorFactoryAbi, eventName: 'PositionCreated', data: l.data, topics: l.topics as [Hex, ...Hex[]] });
          this.created.set((d.args as { vault: Address }).vault.toLowerCase(), l.blockNumber ?? this.fromBlock);
        } catch { /* another factory event */ }
      }
    } catch { /* unknown creation block: the scan starts at fromBlock */ }
  }

  /** All logs of the given vault from its creation block (or the configured start). */
  async vaultLogs(vault: Address): Promise<RawLog[]> {
    await this.creationBlocks();
    return this.sync(vault, this.start(vault));
  }

  async blockTime(n: bigint): Promise<number> {
    let t = this.times.get(n);
    if (t === undefined) {
      t = Number((await this.client.getBlock({ blockNumber: n })).timestamp);
      this.times.set(n, t);
      try { await this.store?.saveBlockTimes(new Map([[n, t]])); } catch { /* cache only */ }
    }
    return t;
  }

  /** Decoded vault events (unknown topics skipped), oldest first, with timestamps. */
  async activity(vault: Address, abi: Abi = floorVaultAbi as Abi): Promise<ActivityEvent[]> {
    const logs = await this.vaultLogs(vault);
    if (this.store) {
      const need = [...new Set(logs.map((l) => l.blockNumber ?? 0n))].filter((b) => !this.times.has(b));
      try { for (const [b, t] of await this.store.blockTimes(need)) this.times.set(b, t); } catch { /* fall back to the RPC */ }
    }
    const out: ActivityEvent[] = [];
    for (const l of logs) {
      let d;
      try { d = decodeEventLog({ abi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }); } catch { continue; }
      out.push({ eventName: String(d.eventName), txHash: l.transactionHash as Hex, blockNumber: l.blockNumber ?? 0n, logIndex: l.logIndex ?? 0, timestamp: await this.blockTime(l.blockNumber ?? 0n), args: (d.args ?? {}) as Record<string, unknown> });
    }
    return out.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex));
  }

  /** The factory's vault list. */
  async vaults(): Promise<Address[]> {
    try { return await this.vaultsFromFactory(); } catch (e) {
      // With a store the factory's own PositionCreated logs are a durable vault list when the main RPC is down.
      if (this.store && this.created.size) return [...this.created.keys()].map((a) => getAddress(a));
      throw e;
    }
  }

  private async vaultsFromFactory(): Promise<Address[]> {
    const n = await this.client.readContract({ address: this.factory, abi: floorFactoryAbi, functionName: 'positionsCount' });
    return Promise.all(Array.from({ length: Number(n) }, (_, i) => this.client.readContract({ address: this.factory, abi: floorFactoryAbi, functionName: 'positions', args: [BigInt(i)] }) as Promise<Address>));
  }
}

/**
 * Public RPCs that accept eth_getLogs over wide ranges (up to 5,000 blocks per call; the chunked reader halves on
 * rejection anyway). The main RPC (FLOOR_RPC_URL, often a free Alchemy plan) only allows 10-block ranges and rate-limits,
 * and bsc-dataseed refuses getLogs entirely, so logs use their own endpoints. Override with LOGS_RPC_URL (comma separated).
 */
export const DEFAULT_LOGS_RPCS = ['https://rpc-bsc.48.club', 'https://bsc.rpc.blxrbdn.com'];

/**
 * The reader both servers use. Log sources, in order: Etherscan v2 if ETHERSCAN_API_KEY is set and its plan covers BSC
 * (the key is env only and never logged), then the log RPCs above one after another. `fromBlock` is the factory deploy
 * block (FLOOR_RUNS_FROM_BLOCK).
 */
export function chainLogReaderFromEnv(client: PublicClient, factory: Address, fromBlock: bigint, env: Record<string, string | undefined>, store?: ChainLogStore): ChainLogReader {
  const urls = (env.LOGS_RPC_URL ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  const rpcs = (urls.length ? urls : DEFAULT_LOGS_RPCS).map((u) => rpcProvider(createPublicClient({ transport: http(u, { timeout: 20_000 }) }) as PublicClient));
  let provider: LogProvider = rpcs.reduceRight((fb, p) => withFallback(p, fb));
  const key = env.ETHERSCAN_API_KEY?.trim();
  if (key) provider = withFallback(etherscanProvider(key), provider);
  return new ChainLogReader(client, factory, fromBlock, { provider, store });
}
