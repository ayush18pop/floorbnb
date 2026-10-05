import { describe, expect, it } from 'vitest';
import { getLogsChunked, MIN_CHUNK } from '../src/logs';

const limitErr = () => Object.assign(new Error('Request exceeds defined limit'), { code: -32005 });

function fake(maxRange: number, logBlocks: number[], opts: { flaky?: number } = {}) {
  let flaky = opts.flaky ?? 0;
  const calls: [bigint, bigint][] = [];
  const client = {
    getBlockNumber: async () => 100_000n,
    getLogs: async (p: { fromBlock: bigint; toBlock: bigint }) => {
      calls.push([p.fromBlock, p.toBlock]);
      if (flaky-- > 0) throw new Error('fetch failed');
      if (Number(p.toBlock - p.fromBlock + 1n) > maxRange) throw limitErr();
      return logBlocks.filter((b) => BigInt(b) >= p.fromBlock && BigInt(b) <= p.toBlock).map((b) => ({ blockNumber: BigInt(b), logIndex: 0 }));
    },
  };
  return { client, calls };
}

describe('getLogsChunked', () => {
  const blocks = [5, 4999, 5000, 20_000, 77_777, 100_000];
  for (const max of [5000, 1000, 50]) {
    it(`returns every log, ordered, when the RPC caps ranges at ${max}`, async () => {
      const { client, calls } = fake(max, [...blocks].reverse());
      const logs = await getLogsChunked<{ blockNumber: bigint }>(client, { fromBlock: 0n, initialChunk: 4000 });
      expect(logs.map((l) => Number(l.blockNumber))).toEqual(blocks);
      expect(calls.every(([a, b]) => Number(b - a + 1n) <= 4000)).toBe(true);
    });
  }

  it('remembers the working chunk size for the next call on the same client', async () => {
    const { client, calls } = fake(500, [1]);
    await getLogsChunked(client, { fromBlock: 0n, toBlock: 3000n, initialChunk: 2000 });
    const before = calls.length;
    await getLogsChunked(client, { fromBlock: 0n, toBlock: 3000n, initialChunk: 2000 });
    const second = calls.slice(before);
    expect(second.every(([a, b]) => Number(b - a + 1n) <= 500)).toBe(true);
  });

  it('retries transient errors, then fails after the retries are used', async () => {
    const ok = fake(5000, [3], { flaky: 2 });
    expect(await getLogsChunked(ok.client, { fromBlock: 0n, toBlock: 100n })).toHaveLength(1);
    const bad = fake(5000, [3], { flaky: 99 });
    await expect(getLogsChunked(bad.client, { fromBlock: 0n, toBlock: 100n })).rejects.toThrow('fetch failed');
  });

  it('gives up at the floor chunk size', async () => {
    const { client } = fake(MIN_CHUNK - 1, []);
    await expect(getLogsChunked(client, { fromBlock: 0n, toBlock: 100n, initialChunk: 50 })).rejects.toThrow(/limit/);
  });

  it('honours an abort signal', async () => {
    const { client } = fake(5000, []);
    const ac = new AbortController();
    ac.abort();
    await expect(getLogsChunked(client, { fromBlock: 0n, toBlock: 100n, signal: ac.signal })).rejects.toBeDefined();
  });
});
