// Gated: FLOOR_FORK=1. Spawns a local anvil fork of BSC (BSC_FORK_RPC_URL). Nothing is sent to mainnet:
// the payer, gas and payee accounts are derived from the public anvil dev mnemonic (no key literals).
import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient, createTestClient, createWalletClient, http, parseAbi } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { EIP3009_ABI, SelfFacilitatorClient, type PaymentRequired } from '@floor/x402';
import { signPayment } from '@floor/x402/src/testutil';
import { EIP3009_TOKENS } from './payments';
import { PAYEE, buildApp, connect } from './testkit';

const run = process.env.FLOOR_FORK === '1';
const PORT = 19545 + Math.floor(Math.random() * 1000);
const RPC = `http://127.0.0.1:${PORT}`;
const FORK = process.env.BSC_FORK_RPC_URL ?? 'https://bsc-rpc.publicnode.com';
const MNEMONIC = 'test test test test test test test test test test test junk'; // public anvil dev mnemonic
const ERC20 = parseAbi(['function transfer(address,uint256) returns (bool)']);
const TRANSFER = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

describe.skipIf(!run)('fork: paid MCP call settled by the self facilitator', () => {
  let anvil: ChildProcess;
  const payer = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
  const gas = mnemonicToAccount(MNEMONIC, { addressIndex: 1 });
  const chain = { ...bsc, rpcUrls: { default: { http: [RPC] } } };
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });

  beforeAll(async () => {
    anvil = spawn('anvil', ['--fork-url', FORK, '--port', String(PORT), '--silent'], { stdio: 'ignore' });
    for (let i = 0; i < 120; i++) {
      try { if ((await pub.getChainId()) === 56) return; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('anvil did not start');
  }, 90_000);
  afterAll(() => { anvil?.kill(); });

  async function fund(token: (typeof EIP3009_TOKENS)[number], amount: bigint) {
    const head = await pub.getBlockNumber();
    const logs = await pub.getLogs({ address: token.address, event: TRANSFER[0], fromBlock: head - 400n, toBlock: head });
    for (const l of logs) {
      const holder = l.args.to!;
      const bal = await pub.readContract({ address: token.address, abi: EIP3009_ABI, functionName: 'balanceOf', args: [holder] });
      if (bal < amount) continue;
      await test.impersonateAccount({ address: holder });
      await test.setBalance({ address: holder, value: 10n ** 18n });
      const h = await createWalletClient({ account: holder, chain, transport: http(RPC) }).writeContract({ address: token.address, abi: ERC20, functionName: 'transfer', args: [payer.address, amount] });
      await pub.waitForTransactionReceipt({ hash: h });
      await test.stopImpersonatingAccount({ address: holder });
      return;
    }
    throw new Error('no holder found');
  }

  for (const token of EIP3009_TOKENS) {
    it(`${token.symbol}: quote_protection is paid through MCP and the payee balance moves on the fork`, async () => {
      const amount = 10n ** 16n; // 0.01 token, 18 decimals
      await fund(token, amount);
      await test.setBalance({ address: gas.address, value: 10n ** 18n });
      const facilitator = new SelfFacilitatorClient({
        network: 'eip155:56',
        tokens: [token],
        publicClient: pub as never,
        walletClient: createWalletClient({ account: gas, chain, transport: http(RPC) }) as never,
      });
      const client = await connect(buildApp({ facilitator }).app);
      const args = { depositUsdt: '1000', floorBps: 9000 };
      const first = await client.callTool({ name: 'quote_protection', arguments: args });
      const pr = (first as unknown as { structuredContent: PaymentRequired }).structuredContent;
      expect((first as unknown as { isError?: boolean }).isError).toBe(true);
      expect(pr.accepts).toHaveLength(1); // only the token this facilitator supports
      const before = await pub.readContract({ address: token.address, abi: EIP3009_ABI, functionName: 'balanceOf', args: [PAYEE] });
      const payment = await signPayment(payer, pr.accepts[0]!, token);
      const second = await client.callTool({ name: 'quote_protection', arguments: args, _meta: { 'x402/payment': payment } });
      expect((second as unknown as { isError?: boolean }).isError).not.toBe(true);
      const meta = (second as unknown as { _meta: Record<string, { success: boolean; transaction: string }> })._meta['x402/payment-response']!;
      expect(meta.success).toBe(true);
      expect(meta.transaction).toMatch(/^0x[0-9a-f]{64}$/);
      expect((second as unknown as { structuredContent: { quote: { floorValue: string } } }).structuredContent.quote.floorValue).toBe('900000000000000000000');
      const after = await pub.readContract({ address: token.address, abi: EIP3009_ABI, functionName: 'balanceOf', args: [PAYEE] });
      expect(after - before).toBe(amount);
      // replay refused
      const again = await client.callTool({ name: 'quote_protection', arguments: args, _meta: { 'x402/payment': payment } });
      expect((again as unknown as { isError?: boolean }).isError).toBe(true);
    }, 120_000);
  }
});
