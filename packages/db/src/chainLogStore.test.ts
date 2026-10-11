import { describe, expect, it } from 'vitest';
import { MemoryChainLogStore, type StoredLog } from './chainLogStore';
import { MIGRATIONS } from './migrations';

const L = (block: number, idx: number): StoredLog => ({ address: '0xabc', blockNumber: BigInt(block), logIndex: idx, txHash: `0x${block}`, topics: ['0x1'], data: '0x' });

describe('MemoryChainLogStore', () => {
  it('replaces logs at or above fromBlock (reorg) and moves the cursor', async () => {
    const s = new MemoryChainLogStore();
    await s.save('0xABC', 0n, [L(1, 0), L(5, 0)], 10n);
    await s.save('0xabc', 5n, [L(6, 0)], 20n);
    expect((await s.logs('0xAbC')).map((l) => l.blockNumber)).toEqual([1n, 6n]);
    expect(await s.cursor('0xabc')).toBe(20n);
    expect(await s.cursor('0xother')).toBeNull();
  });
  it('stores block times', async () => {
    const s = new MemoryChainLogStore();
    await s.saveBlockTimes(new Map([[3n, 99]]));
    expect(await s.blockTimes([3n, 4n])).toEqual(new Map([[3n, 99]]));
  });
});

describe('migrations', () => {
  it('are all idempotent', () => {
    for (const m of MIGRATIONS) expect(m).toMatch(/IF NOT EXISTS/);
  });
});
