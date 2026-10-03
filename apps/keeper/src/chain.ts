import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { vaultAbi } from './abi.js';
import type { Swap } from './keeper.js';

/** Thin interface so the loop is testable without an RPC. */
export interface Chain {
  /** timestamp of the latest block (the window check uses chain time, like the contract) */
  now(): Promise<number>;
  read<T>(address: Address, abi: Abi, functionName: string, args?: readonly unknown[]): Promise<T>;
  /** Simulates `vault.rebalance(swap)` with eth_call from `from`; returns the gas estimate. Throws SimError. */
  simulate(vault: Address, swap: Swap, from: Address): Promise<bigint>;
}

export class SimError extends Error {
  constructor(public revert: string) {
    super(`simulation reverted: ${revert}`);
  }
}

export interface RebalancedEvent {
  assetIdx: number;
  buy: boolean;
  amountIn: bigint;
  amountOut: bigint;
  V: bigint;
  exposureTarget: bigint;
  router: Address;
}

export interface Sender {
  address: Address;
  send(vault: Address, swap: Swap, gas: bigint): Promise<{ hash: Hex; success: boolean; blockNumber: bigint; rebalanced?: RebalancedEvent }>;
}

export function revertName(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) {
      return r.data ? `${r.data.errorName}(${(r.data.args ?? []).map(String).join(',')})` : (r.reason ?? r.shortMessage);
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

export function makeChain(rpcUrl: string): { chain: Chain; client: PublicClient } {
  const client = createPublicClient({ transport: http(rpcUrl) });
  const chain: Chain = {
    async now() {
      return Number((await client.getBlock()).timestamp);
    },
    read(address, abi, functionName, args = []) {
      return client.readContract({ address, abi, functionName, args } as never) as never;
    },
    async simulate(vault, swap, from) {
      try {
        await client.simulateContract({ address: vault, abi: vaultAbi, functionName: 'rebalance', args: [swap], account: from });
        return await client.estimateContractGas({ address: vault, abi: vaultAbi, functionName: 'rebalance', args: [swap], account: from });
      } catch (e) {
        throw new SimError(revertName(e));
      }
    },
  };
  return { chain, client };
}

/** EOA signer. The key lives only inside the viem account closure. One sender per process, local nonce manager. */
export function makeEoaSender(rpcUrl: string, client: PublicClient, key: Hex, timeoutMs: number): Sender {
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, transport: http(rpcUrl) });
  let nonce: number | undefined;
  return {
    address: account.address,
    async send(vault, swap, gas) {
      if (nonce === undefined) nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' });
      let hash: Hex;
      try {
        hash = await wallet.writeContract({
          chain: null,
          address: vault,
          abi: vaultAbi,
          functionName: 'rebalance',
          args: [swap],
          gas: (gas * 13n) / 10n,
          nonce,
        });
        nonce += 1;
      } catch (e) {
        nonce = undefined; // resync from the node next time
        throw e;
      }
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: timeoutMs });
      let rebalanced: RebalancedEvent | undefined;
      for (const l of receipt.logs) {
        if (l.address.toLowerCase() !== vault.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: vaultAbi, data: l.data, topics: l.topics });
          if (ev.eventName === 'Rebalanced') rebalanced = ev.args as unknown as RebalancedEvent;
        } catch {
          /* other event */
        }
      }
      return { hash, success: receipt.status === 'success', blockNumber: receipt.blockNumber, rebalanced };
    },
  };
}
