import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { FLOOR_DISCLOSURE } from '@floor/sdk';
import { SelfFacilitatorClient, b64decode, type PaymentRequired } from '@floor/x402';
import { header, signPayment } from '@floor/x402/src/testutil';
import { createApp } from './app';
import { createPaidGate, paidGateFromEnv, paidPriceFromEnv, paidTokensFromEnv } from './paid';

const PAYEE = '0x00000000000000000000000000000000000000c3';
const TOKEN = { address: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d' as const, name: 'World Liberty Financial USD', version: '1' };
const body = JSON.stringify({ deposit: (1000n * 10n ** 18n).toString(), floorBps: 9000, termSeconds: 31_536_000 });

function setup() {
  const publicClient = {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => (functionName === 'authorizationState' ? false : 10n ** 18n)),
    simulateContract: vi.fn(async (a: object) => ({ request: a })),
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
  };
  const walletClient = { account: { address: '0x0000000000000000000000000000000000000001' }, writeContract: vi.fn(async () => '0x' + 'cd'.repeat(32)) };
  const facilitator = new SelfFacilitatorClient({ network: 'eip155:56', tokens: [TOKEN], publicClient: publicClient as never, walletClient: walletClient as never });
  const app = createApp({
    chainId: 56,
    deployment: { chainId: 56, factory: PAYEE, lens: PAYEE },
    client: {} as PublicClient,
    paidGate: createPaidGate({ payTo: PAYEE, facilitator }),
  });
  return { app, walletClient };
}
const post = (app: ReturnType<typeof setup>['app'], b: string, headers: Record<string, string> = {}) =>
  app.request('/v1/paid/quote', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: b });

describe('/v1/paid/quote behind the x402 gate', () => {
  it('402 with PAYMENT-REQUIRED, then 200 with the quote and PAYMENT-RESPONSE after a valid EIP-3009 payment', async () => {
    const { app, walletClient } = setup();
    const r1 = await post(app, body);
    expect(r1.status).toBe(402);
    const pr = b64decode<PaymentRequired>(r1.headers.get('PAYMENT-REQUIRED')!);
    expect(pr.accepts[0]).toMatchObject({ amount: '10000000000000000', payTo: PAYEE, extra: { assetTransferMethod: 'eip3009' } });
    expect(pr.accepts.every((a) => a.amount === '10000000000000000')).toBe(true); // 0.01 USD at 18 decimals, default env
    const payment = await signPayment(privateKeyToAccount(generatePrivateKey()), pr.accepts[0]!, TOKEN);
    const r2 = await post(app, body, { 'PAYMENT-SIGNATURE': header(payment) });
    expect(r2.status).toBe(200);
    const j = (await r2.json()) as { quote: { floorValue: string; startingExposure: string }; disclosure: string };
    expect(j.quote.floorValue).toBe((900n * 10n ** 18n).toString());
    expect(j.quote.startingExposure).toBe((400n * 10n ** 18n).toString());
    expect(j.disclosure).toBe(FLOOR_DISCLOSURE);
    expect(b64decode<{ success: boolean }>(r2.headers.get('PAYMENT-RESPONSE')!).success).toBe(true);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
    // replay
    expect((await post(app, body, { 'PAYMENT-SIGNATURE': header(payment) })).status).toBe(402);
  });

  it('a bad body gets 400 and the payment is not settled', async () => {
    const { app, walletClient } = setup();
    const pr = b64decode<PaymentRequired>((await post(app, body)).headers.get('PAYMENT-REQUIRED')!);
    const payment = await signPayment(privateKeyToAccount(generatePrivateKey()), pr.accepts[0]!, TOKEN);
    const r = await post(app, JSON.stringify({ deposit: '5', floorBps: 100, termSeconds: 1 }), { 'PAYMENT-SIGNATURE': header(payment) });
    expect(r.status).toBe(400);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it('a garbage PAYMENT-SIGNATURE is a 402, never a free answer', async () => {
    const { app } = setup();
    expect((await post(app, body, { 'PAYMENT-SIGNATURE': 'not-base64-json' })).status).toBe(402);
  });

  it('without X402_PAYTO the gate is absent and the route stays 501', async () => {
    expect(paidGateFromEnv({})).toBeUndefined();
    const app = createApp({ chainId: 56, deployment: { chainId: 56, factory: PAYEE, lens: PAYEE }, client: {} as PublicClient });
    expect((await post(app, body)).status).toBe(501);
  });
});

describe('paid route configuration', () => {
  it('price and asset come from env; bad values are rejected', () => {
    expect(paidPriceFromEnv({})).toBe('0.01');
    expect(paidPriceFromEnv({})).toBe('0.01');
    expect(paidPriceFromEnv({ PRICE_QUOTE_USD: '0.5' })).toBe('0.5');
    expect(() => paidPriceFromEnv({ PRICE_QUOTE_USD: '-1' })).toThrow(/PRICE_QUOTE_USD/);
    const t = paidTokensFromEnv({ X402_ASSET: '0x00000000000000000000000000000000000000aa', X402_ASSET_NAME: 'Test USD', X402_ASSET_DECIMALS: '6', X402_ASSET_SYMBOL: 'TUSD' });
    expect(t.assets).toEqual([{ address: '0x00000000000000000000000000000000000000aa', symbol: 'TUSD', decimals: 6, method: 'eip3009', name: 'Test USD' }]);
    expect(() => paidTokensFromEnv({ X402_ASSET: '0x00000000000000000000000000000000000000aa' })).toThrow(/NAME/);
    expect(() => paidGateFromEnv({ X402_PAYTO: 'nope' })).toThrow(/X402_PAYTO/);
  });
});
