import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { keccak256, parseTransaction, type Hex, type PublicClient } from 'viem';
import { makeEoaSender } from './chain.js';

const KEY = ('0x' + '11'.repeat(32)) as Hex; // throwaway test key, not a real account
const VAULT = '0x00000000000000000000000000000000000000aa';
const SWAP = { assetIdx: 0, buy: true, amountIn: 1n, router: VAULT, data: '0x' } as never;

let server: Server | undefined;
afterEach(() => server?.close());

/** Minimal JSON-RPC node: enough for viem to sign locally and "send"; records the nonce of every raw tx. */
async function node(): Promise<{ url: string; nonces: number[] }> {
  const nonces: number[] = [];
  server = createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      const { id, method, params } = JSON.parse(b);
      const result: unknown =
        method === 'eth_chainId' ? '0x7a69'
        : method === 'eth_getBlockByNumber' ? { number: '0x1', baseFeePerGas: '0x1', timestamp: '0x1', gasLimit: '0x1c9c380' }
        : method === 'eth_maxPriorityFeePerGas' || method === 'eth_gasPrice' ? '0x1'
        : method === 'eth_estimateGas' ? '0x5208'
        : method === 'eth_sendRawTransaction' ? (nonces.push(Number(parseTransaction(params[0] as Hex).nonce)), keccak256(params[0] as Hex))
        : null;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, nonces };
}

describe('EOA sender nonce handling', () => {
  it('resyncs the nonce from the node after a receipt wait fails (dropped tx, reverted chain)', async () => {
    const { url, nonces } = await node();
    let chainNonce = 7;
    let waits = 0;
    const client = {
      getTransactionCount: async () => chainNonce,
      waitForTransactionReceipt: async () => {
        waits += 1;
        if (waits === 1) throw new Error('Timed out while waiting for transaction');
        return { status: 'success', logs: [], blockNumber: 1n };
      },
    } as unknown as PublicClient;
    const sender = makeEoaSender(url, client, KEY, 1000);

    await expect(sender.send(VAULT, SWAP, 100_000n)).rejects.toThrow(/Timed out/);
    chainNonce = 3; // the chain went back (revert) or the tx was dropped: the node now says 3
    await sender.send(VAULT, SWAP, 100_000n);
    expect(nonces).toEqual([7, 3]); // before the fix the second tx used 8 and never mined
  });

  it('counts up locally between successful sends (no extra node reads)', async () => {
    const { url, nonces } = await node();
    let reads = 0;
    const client = {
      getTransactionCount: async () => (reads += 1, 5),
      waitForTransactionReceipt: async () => ({ status: 'success', logs: [], blockNumber: 1n }),
    } as unknown as PublicClient;
    const sender = makeEoaSender(url, client, KEY, 1000);
    await sender.send(VAULT, SWAP, 100_000n);
    await sender.send(VAULT, SWAP, 100_000n);
    expect(nonces).toEqual([5, 6]);
    expect(reads).toBe(1);
  });
});
