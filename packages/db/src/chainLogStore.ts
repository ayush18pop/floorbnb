import postgres from 'postgres';
import { MIGRATIONS } from './migrations';

/** A raw chain log as stored. Hex strings only: decoding stays with the readers (viem lives in the API, not here). */
export interface StoredLog {
  /** lowercase */
  address: string;
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
  topics: string[];
  data: string;
}

/** Persistence for raw logs, per-address sync cursors and block timestamps. Addresses are matched case-insensitively. */
export interface ChainLogStore {
  logs(address: string): Promise<StoredLog[]>;
  cursor(address: string): Promise<bigint | null>;
  /** Replace the address's logs at or above `fromBlock` with `fresh` (reorg safe) and move its cursor to `syncedTo`, atomically. */
  save(address: string, fromBlock: bigint, fresh: StoredLog[], syncedTo: bigint): Promise<void>;
  blockTimes(blocks: bigint[]): Promise<Map<bigint, number>>;
  saveBlockTimes(times: Map<bigint, number>): Promise<void>;
}

export class MemoryChainLogStore implements ChainLogStore {
  private rows = new Map<string, StoredLog[]>();
  private cursors = new Map<string, bigint>();
  private times = new Map<bigint, number>();
  async logs(a: string) { return [...(this.rows.get(a.toLowerCase()) ?? [])]; }
  async cursor(a: string) { return this.cursors.get(a.toLowerCase()) ?? null; }
  async save(a: string, from: bigint, fresh: StoredLog[], to: bigint) {
    const k = a.toLowerCase();
    const kept = (this.rows.get(k) ?? []).filter((l) => l.blockNumber < from);
    this.rows.set(k, [...kept, ...fresh.map((l) => ({ ...l, address: k }))]);
    this.cursors.set(k, to);
  }
  async blockTimes(blocks: bigint[]) {
    const m = new Map<bigint, number>();
    for (const b of blocks) { const t = this.times.get(b); if (t !== undefined) m.set(b, t); }
    return m;
  }
  async saveBlockTimes(t: Map<bigint, number>) { for (const [b, v] of t) this.times.set(b, v); }
}

export type Sql = ReturnType<typeof postgres>;

/** Opens a connection pool. The URL is never logged. SSL is requested for external Render hosts or sslmode=require. */
export function connectPg(url: string, opts: { max?: number } = {}): Sql {
  const external = /\.render\.com|sslmode=require/.test(url);
  return postgres(url, { max: opts.max ?? 4, ssl: external ? 'require' : undefined, onnotice: () => {}, idle_timeout: 30, connect_timeout: 15 });
}

export async function migrate(sql: Sql): Promise<void> {
  for (const stmt of MIGRATIONS) await sql.unsafe(stmt);
}

interface LogRow { address: string; block_number: string; log_index: number; tx_hash: string; topics: string[]; data: string }

export class PgChainLogStore implements ChainLogStore {
  constructor(private sql: Sql) {}

  async logs(address: string): Promise<StoredLog[]> {
    const rows = await this.sql<LogRow[]>`SELECT address, block_number, log_index, tx_hash, topics, data FROM chain_logs WHERE address = ${address.toLowerCase()} ORDER BY block_number, log_index`;
    return rows.map((r) => ({ address: r.address, blockNumber: BigInt(r.block_number), logIndex: r.log_index, txHash: r.tx_hash, topics: typeof r.topics === "string" ? (JSON.parse(r.topics) as string[]) : r.topics, data: r.data }));
  }

  async cursor(address: string): Promise<bigint | null> {
    const r = await this.sql<{ synced_to_block: string }[]>`SELECT synced_to_block FROM index_cursor WHERE address = ${address.toLowerCase()}`;
    return r[0] ? BigInt(r[0].synced_to_block) : null;
  }

  async save(address: string, fromBlock: bigint, fresh: StoredLog[], syncedTo: bigint): Promise<void> {
    const a = address.toLowerCase();
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM chain_logs WHERE address = ${a} AND block_number >= ${fromBlock.toString()}`;
      for (let i = 0; i < fresh.length; i += 200) {
        const rows = fresh.slice(i, i + 200).map((l) => ({ address: a, block_number: l.blockNumber.toString(), log_index: l.logIndex, tx_hash: l.txHash, topics: tx.json(l.topics), data: l.data }));
        await tx`INSERT INTO chain_logs ${tx(rows)} ON CONFLICT (tx_hash, log_index) DO UPDATE SET block_number = EXCLUDED.block_number, address = EXCLUDED.address, topics = EXCLUDED.topics, data = EXCLUDED.data`;
      }
      await tx`INSERT INTO index_cursor (address, synced_to_block, updated_at) VALUES (${a}, ${syncedTo.toString()}, now())
               ON CONFLICT (address) DO UPDATE SET synced_to_block = EXCLUDED.synced_to_block, updated_at = now()`;
    });
  }

  async blockTimes(blocks: bigint[]): Promise<Map<bigint, number>> {
    const m = new Map<bigint, number>();
    if (!blocks.length) return m;
    const rows = await this.sql<{ block_number: string; ts: string }[]>`SELECT block_number, ts FROM block_times WHERE block_number = ANY(${blocks.map(String)}::bigint[])`;
    for (const r of rows) m.set(BigInt(r.block_number), Number(r.ts));
    return m;
  }

  async saveBlockTimes(times: Map<bigint, number>): Promise<void> {
    if (!times.size) return;
    const rows = [...times].map(([b, ts]) => ({ block_number: b.toString(), ts: String(ts) }));
    await this.sql`INSERT INTO block_times ${this.sql(rows)} ON CONFLICT (block_number) DO NOTHING`;
  }
}

/** Store from env: a migrated PgChainLogStore when DATABASE_URL is set, else null (callers keep the in-memory path). */
export async function chainLogStoreFromEnv(env: Record<string, string | undefined>): Promise<{ store: ChainLogStore; sql: Sql } | null> {
  const url = env.DATABASE_URL?.trim();
  if (!url) return null;
  const sql = connectPg(url);
  await migrate(sql);
  return { store: new PgChainLogStore(sql), sql };
}
