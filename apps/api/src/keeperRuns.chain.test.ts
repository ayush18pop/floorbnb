import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Hex, type PublicClient } from 'viem';
import { floorVaultAbi } from '@floor/sdk';
import { ChainKeeperRunStore } from './keeperRuns';
import { etherscanProvider } from './chainLogs';

const FACTORY = '0x00000000000000000000000000000000000000f1' as Address;
const V1 = '0x00000000000000000000000000000000000000a1' as Address;
const V2 = '0x00000000000000000000000000000000000000a2' as Address;
const CALLER = '0x00000000000000000000000000000000000000c1' as Address;
const ROUTER = '0x00000000000000000000000000000000000000d1' as Address;

function log(address: Address, block: bigint, idx: number, buy: boolean, amountIn: bigint) {
  const topics = encodeEventTopics({ abi: floorVaultAbi, eventName: 'Rebalanced', args: { assetIdx: 0, router: ROUTER } as never });
  const data = encodeAbiParameters(
    [{ type: 'bool' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }],
    [buy, amountIn, 5n, 55n, 22n, CALLER],
  );
  return { address, topics, data, blockNumber: block, transactionHash: ('0x' + block.toString(16).padStart(64, '0')) as Hex, logIndex: idx, blockHash: '0x' as Hex, transactionIndex: 0, removed: false };
}

function fakeClient(logs: ReturnType<typeof log>[], maxRange = Infinity, head = 100n) {
  const seen: { address: Address; fromBlock: bigint; toBlock: bigint }[] = [];
  const client = {
    readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => (functionName === 'positionsCount' ? 2n : args![0] === 0n ? V1 : V2),
    getBlockNumber: async () => head,
    getLogs: async (p: { address: Address; fromBlock: bigint; toBlock: bigint }) => {
      seen.push(p);
      if (Number(p.toBlock - p.fromBlock + 1n) > maxRange) throw Object.assign(new Error('Request exceeds defined limit'), { code: -32005 });
      return logs.filter((l) => l.address === p.address && l.blockNumber >= p.fromBlock && l.blockNumber <= p.toBlock);
    },
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: 1000n + blockNumber }),
  } as unknown as PublicClient;
  return { client, seen };
}

describe('ChainKeeperRunStore', () => {
  const logs = [log(V1, 10n, 0, true, 22n), log(V2, 12n, 3, false, 9n)];

  it('lists on-chain rebalances newest first, one run each, over all vaults', async () => {
    const { client } = fakeClient(logs);
    const store = new ChainKeeperRunStore(client, FACTORY, 5n);
    const runs = await store.list({ limit: 10 });
    expect(runs.map((r) => [r.vault, r.startedAt, r.outcome])).toEqual([[V2, 1012, 'rebalanced'], [V1, 1010, 'rebalanced']]);
    expect(runs[1]!.detail).toMatchObject({ buy: true, amountIn: 22n, caller: getAddress(CALLER) });
    expect(runs[0]!.id).toMatch(/:3$/);
  });

  it('works on an RPC that caps the block range (chunks, never one open-ended call)', async () => {
    const { client, seen } = fakeClient(logs, 20, 5000n);
    const store = new ChainKeeperRunStore(client, FACTORY, 0n);
    expect(await store.list({ limit: 10 })).toHaveLength(2);
    expect(seen.every((p) => p.toBlock - p.fromBlock + 1n <= 2000n)).toBe(true);
  });

  it('only scans new blocks on later requests, and caches within the TTL', async () => {
    let t = 0;
    const { client, seen } = fakeClient(logs, Infinity, 100n);
    const store = new ChainKeeperRunStore(client, FACTORY, 0n, { now: () => t, ttlMs: 10_000 });
    await store.list({ limit: 10 });
    const n = seen.length;
    await store.list({ limit: 10 });
    expect(seen.length).toBe(n); // fresh: no RPC
    t = 20_000;
    await store.list({ limit: 10 });
    const later = seen.slice(n).filter((p) => p.address === V1);
    expect(later).toHaveLength(1);
    expect(later[0]!.fromBlock).toBe(100n + 1n - 12n); // cursor minus the reorg margin, not block 0
    expect(await store.list({ limit: 10 })).toHaveLength(2); // old runs kept
  });

  it('respects the limit and a vault filter, and finds a run by id', async () => {
    const { client } = fakeClient(logs);
    const store = new ChainKeeperRunStore(client, FACTORY, 0n);
    expect(await store.list({ limit: 1 })).toHaveLength(1);
    expect((await store.list({ limit: 5, vault: V1 })).map((r) => r.vault)).toEqual([V1]);
    const one = (await store.list({ limit: 5 }))[0]!;
    expect((await store.get(one.id))?.id).toBe(one.id);
    expect(await store.get('nope')).toBeNull();
  });

  it('exposes decoded activity with timestamps', async () => {
    const { client } = fakeClient(logs);
    const ev = await new ChainKeeperRunStore(client, FACTORY, 0n).reader.activity(V1);
    expect(ev).toMatchObject([{ eventName: 'Rebalanced', blockNumber: 10n, timestamp: 1010 }]);
  });

  it('never invents a heartbeat', async () => {
    expect(await new ChainKeeperRunStore(fakeClient([]).client, FACTORY, 0n).lastHeartbeat()).toBeNull();
  });
});

describe('etherscanProvider', () => {
  it('paginates, treats "No records found" as empty, and never leaks the key', async () => {
    const row = (i: number) => ({ address: V1, topics: [], data: '0x', blockNumber: '0x' + (i + 1).toString(16), logIndex: '0x0', transactionHash: '0x' + String(i).padStart(64, '0') });
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(u);
      const page = Number(new URL(u).searchParams.get('page'));
      if (page === 1) return { ok: true, json: async () => ({ status: '1', message: 'OK', result: Array.from({ length: 1000 }, (_, i) => row(i)) }) };
      return { ok: true, json: async () => ({ status: '0', message: 'No records found', result: [] }) };
    }) as unknown as typeof fetch;
    const out = await etherscanProvider('SECRETKEY', f, 0)(V1, 1n, 5000n);
    expect(out).toHaveLength(1000);
    expect(urls).toHaveLength(2);
    const bad = (async () => { throw new Error('boom SECRETKEY'); }) as unknown as typeof fetch;
    await expect(etherscanProvider('SECRETKEY', bad, 0)(V1, 1n, 2n)).rejects.toThrow(/^(?!.*SECRETKEY)/);
  });
});
