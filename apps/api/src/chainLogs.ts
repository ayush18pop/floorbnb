import { createPublicClient, decodeEventLog, getAddress, http, type Abi, type Address, type Hex, type Log, type PublicClient } from 'viem';
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

interface Entry { logs: Map<string, RawLog>; cursor: bigint; fetchedAt: number; inflight?: Promise<void> }

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

  constructor(private client: PublicClient, private factory: Address, private fromBlock: bigint, o: ChainLogReaderOpts = {}) {
    this.provider = o.provider ?? rpcProvider(client);
    this.ttl = o.ttlMs ?? 12_000;
    this.now = o.now ?? Date.now;
  }

  private async sync(address: Address, start: bigint): Promise<RawLog[]> {
    const key = address.toLowerCase();
    let e = this.entries.get(key);
    if (!e) { e = { logs: new Map(), cursor: start - 1n, fetchedAt: -Infinity }; this.entries.set(key, e); }
    const entry = e;
    if (this.now() - entry.fetchedAt >= this.ttl) {
      entry.inflight ??= (async () => {
        try {
          const head = await this.client.getBlockNumber();
          const from = entry.cursor + 1n - REORG_BLOCKS > start ? entry.cursor + 1n - REORG_BLOCKS : start;
          if (from <= head) {
            const fresh = await this.provider(address, from, head);
            for (const [k, l] of entry.logs) if ((l.blockNumber ?? 0n) >= from) entry.logs.delete(k);
            for (const l of fresh) entry.logs.set(`${l.transactionHash}:${l.logIndex}`, l);
          }
          entry.cursor = head;
          entry.fetchedAt = this.now();
        } finally {
          entry.inflight = undefined;
        }
      })();
    }
    if (entry.inflight) await entry.inflight;
    return [...entry.logs.values()];
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
    const created = this.created.get(vault.toLowerCase());
    const start = created !== undefined && created > this.fromBlock ? created : this.fromBlock;
    return this.sync(vault, start);
  }

  async blockTime(n: bigint): Promise<number> {
    let t = this.times.get(n);
    if (t === undefined) {
      t = Number((await this.client.getBlock({ blockNumber: n })).timestamp);
      this.times.set(n, t);
    }
    return t;
  }

  /** Decoded vault events (unknown topics skipped), oldest first, with timestamps. */
  async activity(vault: Address, abi: Abi = floorVaultAbi as Abi): Promise<ActivityEvent[]> {
    const logs = await this.vaultLogs(vault);
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
export function chainLogReaderFromEnv(client: PublicClient, factory: Address, fromBlock: bigint, env: Record<string, string | undefined>): ChainLogReader {
  const urls = (env.LOGS_RPC_URL ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  const rpcs = (urls.length ? urls : DEFAULT_LOGS_RPCS).map((u) => rpcProvider(createPublicClient({ transport: http(u, { timeout: 20_000 }) }) as PublicClient));
  let provider: LogProvider = rpcs.reduceRight((fb, p) => withFallback(p, fb));
  const key = env.ETHERSCAN_API_KEY?.trim();
  if (key) provider = withFallback(etherscanProvider(key), provider);
  return new ChainLogReader(client, factory, fromBlock, { provider });
}
