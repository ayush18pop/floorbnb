import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex, type PublicClient } from 'viem';
import { floorVaultAbi } from '@floor/sdk';
import { MemoryChainLogStore } from '@floor/db';
import { ChainLogReader, type LogProvider, type RawLog } from './chainLogs';

const FACTORY = '0x00000000000000000000000000000000000000f1' as Address;
const V1 = '0x00000000000000000000000000000000000000a1' as Address;
const CALLER = '0x00000000000000000000000000000000000000c1' as Address;
const ROUTER = '0x00000000000000000000000000000000000000d1' as Address;

function log(address: Address, block: bigint, idx: number): RawLog {
  const topics = encodeEventTopics({ abi: floorVaultAbi, eventName: 'Rebalanced', args: { assetIdx: 0, router: ROUTER } as never });
  const data = encodeAbiParameters(
    [{ type: 'bool' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }],
    [true, 22n, 5n, 55n, 22n, CALLER],
  );
  return { address, topics, data, blockNumber: block, transactionHash: ('0x' + block.toString(16).padStart(64, '0')) as Hex, logIndex: idx };
}

function setup(all: RawLog[], head = { n: 100n }) {
  const calls: { address: Address; from: bigint; to: bigint }[] = [];
  const state = { fail: false };
  const provider: LogProvider = async (address, from, to) => {
    calls.push({ address, from, to });
    if (state.fail) throw new Error('rpc down');
    return all.filter((l) => l.address === address && l.blockNumber! >= from && l.blockNumber! <= to);
  };
  let blockCalls = 0;
  const client = {
    readContract: async ({ functionName }: { functionName: string }) => (functionName === 'positionsCount' ? 1n : V1),
    getBlockNumber: async () => head.n,
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => { blockCalls++; return { timestamp: 1000n + blockNumber }; },
  } as unknown as PublicClient;
  return { client, provider, calls, state, blocks: () => blockCalls };
}

describe('ChainLogReader with a persistent store', () => {
  const logs = [log(V1, 10n, 0), log(V1, 20n, 1)];

  it('after a cold start serves from the store and fetches only the tail', async () => {
    const store = new MemoryChainLogStore();
    const a = setup(logs);
    const r1 = new ChainLogReader(a.client, FACTORY, 0n, { provider: a.provider, store });
    expect(await r1.activity(V1)).toHaveLength(2);

    const b = setup(logs); // a restart: fresh memory, same DB
    const r2 = new ChainLogReader(b.client, FACTORY, 0n, { provider: b.provider, store });
    expect(await r2.activity(V1)).toHaveLength(2);
    const v = b.calls.filter((c) => c.address === V1);
    expect(v).toHaveLength(1);
    expect(v[0]!.from).toBe(100n + 1n - 12n); // cursor minus the reorg margin, not block 0
    expect(b.blocks()).toBe(0); // block times came from the store too
  });

  it('serves the stored rows when the log providers are down', async () => {
    const store = new MemoryChainLogStore();
    const a = setup(logs);
    await new ChainLogReader(a.client, FACTORY, 0n, { provider: a.provider, store }).activity(V1);
    const b = setup(logs);
    b.state.fail = true;
    const r = new ChainLogReader(b.client, FACTORY, 0n, { provider: b.provider, store });
    expect(await r.activity(V1)).toHaveLength(2);
  });

  it('without a store a provider failure still throws (old behavior)', async () => {
    const a = setup(logs);
    a.state.fail = true;
    const r = new ChainLogReader(a.client, FACTORY, 0n, { provider: a.provider });
    await expect(r.activity(V1)).rejects.toThrow('rpc down');
    expect(r.indexerStatus()).toEqual({ enabled: false, lastSyncAt: null, headLag: null, lastError: null });
  });

  it('refresh rate limits to one sync per target per 15 s and counts new logs', async () => {
    let t = 0;
    const head = { n: 100n };
    const all = [...logs];
    const a = setup(all, head);
    const r = new ChainLogReader(a.client, FACTORY, 0n, { provider: a.provider, store: new MemoryChainLogStore(), now: () => t });
    await r.activity(V1);
    t = 20_000;
    all.push(log(V1, 105n, 0));
    head.n = 110n;
    const first = await r.refresh(V1);
    expect(first).toEqual({ syncedToBlock: 110n, newLogs: 1 });
    const n = a.calls.length;
    t = 25_000;
    head.n = 120n;
    expect(await r.refresh(V1)).toEqual(first); // inside the gap: last result, no sync
    expect(a.calls.length).toBe(n);
    t = 40_000;
    expect((await r.refresh(V1)).syncedToBlock).toBe(120n);
  });

  it('syncAll brings factory and vaults to head and records the status; it never throws', async () => {
    const a = setup(logs);
    const r = new ChainLogReader(a.client, FACTORY, 0n, { provider: a.provider, store: new MemoryChainLogStore(), now: () => 5_000 });
    await r.syncAll();
    expect(r.indexerStatus()).toEqual({ enabled: true, lastSyncAt: 5, headLag: 0, lastError: null });
    const b = setup(logs);
    b.state.fail = true;
    const r2 = new ChainLogReader(b.client, FACTORY, 0n, { provider: b.provider, store: new MemoryChainLogStore() });
    await r2.syncAll();
    expect(r2.indexerStatus().lastError).toBe('rpc down');
  });
});
