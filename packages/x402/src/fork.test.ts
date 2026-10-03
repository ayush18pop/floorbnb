// Gated: FLOOR_FORK=1. Spawns a local anvil fork of BSC (BSC_FORK_RPC_URL, default public node).
// No mainnet transaction is sent: everything executes on the local fork with anvil dev accounts
// derived from the public anvil mnemonic (no key literals in this repo).
import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient, createTestClient, createWalletClient, encodeAbiParameters, http, keccak256, parseAbi, stringToHex, toBytes, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { MemoryReceiptStore } from '../../db/src/x402Receipts';
import { createGate } from './gate';
import { b64decode } from './encoding';
import { EIP3009_ABI, SelfFacilitatorClient } from './self';
import { header, signPayment } from './testutil';
import type { PaymentRequired } from './types';

const run = process.env.FLOOR_FORK === '1';
const PORT = 18545 + Math.floor(Math.random() * 1000);
const RPC = `http://127.0.0.1:${PORT}`;
const FORK = process.env.BSC_FORK_RPC_URL ?? 'https://bsc-rpc.publicnode.com';
const MNEMONIC = 'test test test test test test test test test test test junk'; // public anvil dev mnemonic
const TOKENS = [
  { symbol: 'U', address: '0xcE24439F2D9C6a2289F741120FE202248B666666' as const, name: 'United Stables', version: '1' },
  { symbol: 'USD1', address: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d' as const, name: 'World Liberty Financial USD', version: '1' },
];
const ERC20 = parseAbi(['function transfer(address,uint256) returns (bool)', 'function DOMAIN_SEPARATOR() view returns (bytes32)']);
const TRANSFER = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

describe.skipIf(!run)('fork: EIP-3009 settle through SelfFacilitatorClient', () => {
  let anvil: ChildProcess;
  const payer = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
  const gas = mnemonicToAccount(MNEMONIC, { addressIndex: 1 });
  const payee = mnemonicToAccount(MNEMONIC, { addressIndex: 2 });
  const chain = { ...bsc, rpcUrls: { default: { http: [RPC] } } };
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });
  const gasWallet = createWalletClient({ account: gas, chain, transport: http(RPC) });

  beforeAll(async () => {
    anvil = spawn('anvil', ['--fork-url', FORK, '--port', String(PORT), '--silent'], { stdio: 'ignore' });
    for (let i = 0; i < 120; i++) {
      try { if ((await pub.getChainId()) === 56) return; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('anvil did not start');
  }, 90_000);
  afterAll(() => { anvil?.kill(); });

  async function fund(token: (typeof TOKENS)[number], amount: bigint) {
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

  for (const token of TOKENS) {
    it(`${token.symbol}: domain matches chain, sign + verify + settle + replay refused`, async () => {
      // EIP-712 domain check against the token's own DOMAIN_SEPARATOR
      const typeHash = keccak256(toBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'));
      const sep = keccak256(encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
        [typeHash, keccak256(stringToHex(token.name)), keccak256(stringToHex(token.version)), 56n, token.address],
      ));
      expect(await pub.readContract({ address: token.address, abi: ERC20, functionName: 'DOMAIN_SEPARATOR' })).toBe(sep);

      const amount = 10n ** 16n; // 0.01 token, 18 decimals
      await fund(token, amount);
      await test.setBalance({ address: gas.address, value: 10n ** 18n });
      const f = new SelfFacilitatorClient({ network: 'eip155:56', tokens: [token], publicClient: pub as never, walletClient: gasWallet as never });

      const store = new MemoryReceiptStore();
      const g = createGate({ facilitator: f, receipts: store, payTo: payee.address, network: 'eip155:56', assets: [{ address: token.address, symbol: token.symbol, decimals: 18, method: 'eip3009', name: token.name }] });
      const url = 'http://api.test/v1/paid/quote';
      const r402 = await g(new Request(url), { usd: '0.01' }, () => new Response('ok'));
      expect(r402.status).toBe(402);
      const pr = b64decode<PaymentRequired>(r402.headers.get('PAYMENT-REQUIRED')!);
      const requirement = pr.accepts[0]!;
      expect(requirement.amount).toBe(amount.toString());

      const payment = await signPayment(payer, requirement, token);
      const before = await pub.readContract({ address: token.address, abi: EIP3009_ABI, functionName: 'balanceOf', args: [payee.address] });
      const res = await g(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(payment) } }), { usd: '0.01' }, () => new Response('paid content'));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('paid content');
      const pay = b64decode<{ success: boolean; transaction: string }>(res.headers.get('PAYMENT-RESPONSE')!);
      expect(pay.success).toBe(true);
      expect(pay.transaction).toMatch(/^0x[0-9a-f]{64}$/);
      const after = await pub.readContract({ address: token.address, abi: EIP3009_ABI, functionName: 'balanceOf', args: [payee.address] });
      expect(after - before).toBe(amount);
      expect(await pub.readContract({ address: token.address, abi: EIP3009_ABI, functionName: 'authorizationState', args: [payer.address, payment.payload.authorization!.nonce as Hex] })).toBe(true);

      // replay: refused by the receipts store, and by the facilitator (nonce used on-chain)
      const again = await g(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(payment) } }), { usd: '0.01' }, () => new Response('x'));
      expect(again.status).toBe(402);
      expect((await f.verify(payment, requirement)).invalidReason).toBe('nonce_already_used');
    }, 120_000);
  }
});
