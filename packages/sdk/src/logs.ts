import type { AbiEvent, Address, Log } from 'viem';

/** The two client methods the helper needs. A viem PublicClient satisfies it. */
export interface LogsClient {
  getLogs(p: any): Promise<any[]>;
  getBlockNumber(): Promise<bigint>;
}

export interface GetLogsChunkedParams {
  address?: Address | Address[];
  fromBlock: bigint;
  /** Defaults to the latest block (resolved once, so every chunk stays bounded). */
  toBlock?: bigint;
  event?: AbiEvent;
  args?: Record<string, unknown> | readonly unknown[];
  /** Starting chunk size in blocks. Default 2000. */
  initialChunk?: number;
  /** Parallel chunk requests. Default 4. */
  maxConcurrent?: number;
  signal?: AbortSignal;
}

export const MIN_CHUNK = 10;
const RETRIES = 2;
const LIMIT_RE = /limit|range|exceed|too many|10000|block range|query returned more|response size|too large/i;

/** True for an RPC error that means "ask for fewer blocks". */
export function isRangeLimitError(e: unknown): boolean {
  const err = e as { message?: string; shortMessage?: string; details?: string; code?: number } | null;
  const text = `${err?.shortMessage ?? ''} ${err?.message ?? ''} ${err?.details ?? ''}`;
  return err?.code === -32005 || LIMIT_RE.test(text);
}

/** Largest chunk that worked (after a failure), remembered per client for the session. */
const learned = new WeakMap<object, number>();

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason ?? new Error('aborted')); }, { once: true });
  });

/**
 * getLogs over any range, safe on RPCs that cap the block range. Splits the range into chunks, halves a chunk that the RPC
 * rejects as too big (down to MIN_CHUNK blocks), retries transient errors briefly, and returns logs ordered by block and index.
 */
export async function getLogsChunked<T = Log>(client: LogsClient, p: GetLogsChunkedParams): Promise<T[]> {
  const { signal } = p;
  const to = p.toBlock ?? (await client.getBlockNumber());
  const state = { chunk: Math.max(MIN_CHUNK, Math.min(p.initialChunk ?? 2000, learned.get(client) ?? Infinity)) };
  let cursor = p.fromBlock;
  const out: { block: bigint; idx: number; seq: number; log: T }[] = [];
  let seq = 0;

  const fetchRange = async (from: bigint, end: bigint): Promise<void> => {
    const size = Number(end - from + 1n);
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw signal.reason ?? new Error('aborted');
      try {
        const logs = await client.getLogs({ address: p.address, event: p.event, args: p.args, fromBlock: from, toBlock: end, strict: false });
        for (const log of logs as any[]) out.push({ block: log.blockNumber ?? 0n, idx: log.logIndex ?? 0, seq: seq++, log });
        if (size > state.chunk && learned.has(client)) { state.chunk = size; learned.set(client, size); }
        return;
      } catch (e) {
        if (isRangeLimitError(e)) {
          if (size <= MIN_CHUNK) throw e;
          const half = Math.max(MIN_CHUNK, Math.floor(size / 2));
          state.chunk = Math.min(state.chunk, half);
          learned.set(client, Math.min(learned.get(client) ?? Infinity, half));
          const mid = from + BigInt(half) - 1n;
          await fetchRange(from, mid);
          await fetchRange(mid + 1n, end);
          return;
        }
        if (attempt >= RETRIES) throw e;
        await sleep(150 * 2 ** attempt, signal);
      }
    }
  };

  const worker = async () => {
    while (cursor <= to) {
      if (signal?.aborted) throw signal.reason ?? new Error('aborted');
      const from = cursor;
      const end = from + BigInt(state.chunk) - 1n > to ? to : from + BigInt(state.chunk) - 1n;
      cursor = end + 1n;
      await fetchRange(from, end);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, p.maxConcurrent ?? 4) }, worker));
  out.sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : a.idx - b.idx || a.seq - b.seq));
  return out.map((x) => x.log);
}
