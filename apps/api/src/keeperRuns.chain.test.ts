import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Hex, type PublicClient } from 'viem';
import { floorVaultAbi } from '@floor/sdk';
import { ChainKeeperRunStore } from './keeperRuns';

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

function fakeClient(logs: ReturnType<typeof log>[]) {
  const seen: unknown[] = [];
  const client = {
    readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => (functionName === 'positionsCount' ? 2n : args![0] === 0n ? V1 : V2),
    getLogs: async (p: unknown) => (seen.push(p), logs),
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: 1000n + blockNumber }),
  } as unknown as PublicClient;
  return { client, seen };
}

describe('ChainKeeperRunStore', () => {
  const logs = [log(V1, 10n, 0, true, 22n), log(V2, 12n, 3, false, 9n)];

  it('lists on-chain rebalances newest first, one run each, from the given block over all vaults', async () => {
    const { client, seen } = fakeClient(logs);
    const store = new ChainKeeperRunStore(client, FACTORY, 5n);
    const runs = await store.list({ limit: 10 });
    expect(runs.map((r) => [r.vault, r.startedAt, r.outcome])).toEqual([[V2, 1012, 'rebalanced'], [V1, 1010, 'rebalanced']]);
    expect(runs[1]!.detail).toMatchObject({ buy: true, amountIn: 22n, caller: getAddress(CALLER) });
    expect(runs[0]!.id).toMatch(/:3$/);
    expect(seen[0]).toMatchObject({ address: [V1, V2], fromBlock: 5n, toBlock: 'latest' });
  });

  it('respects the limit and a vault filter, and finds a run by id', async () => {
    const { client, seen } = fakeClient(logs);
    const store = new ChainKeeperRunStore(client, FACTORY, 0n);
    expect(await store.list({ limit: 1 })).toHaveLength(1);
    await store.list({ limit: 5, vault: V1 });
    expect(seen[1]).toMatchObject({ address: [V1] });
    const one = (await store.list({ limit: 5 }))[0]!;
    expect((await store.get(one.id))?.id).toBe(one.id);
    expect(await store.get('nope')).toBeNull();
  });

  it('never invents a heartbeat', async () => {
    expect(await new ChainKeeperRunStore(fakeClient([]).client, FACTORY, 0n).lastHeartbeat()).toBeNull();
  });
});
