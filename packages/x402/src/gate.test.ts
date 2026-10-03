import { describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { MemoryReceiptStore } from '../../db/src/x402Receipts';
import { createGate } from './gate';
import { b64decode } from './encoding';
import { header, signPayment } from './testutil';
import type { FacilitatorClient, PaymentPayload, PaymentRequired, SettleResult } from './types';

const U = '0x00000000000000000000000000000000000000a1';
const USDT = '0x00000000000000000000000000000000000000b2';
const PAYTO = '0x00000000000000000000000000000000000000c3';
const assets = [
  { address: USDT, symbol: 'USDT', decimals: 18, method: 'permit2' as const, name: 'Tether USD' },
  { address: U, symbol: 'U', decimals: 18, method: 'eip3009' as const, name: 'United Stables' },
];

function fac(over: Partial<FacilitatorClient> = {}): FacilitatorClient & { settle: ReturnType<typeof vi.fn> } {
  return {
    getSupported: async () => ({
      kinds: [
        { extra: { name: 'Tether USD', version: '1', assetTransferMethod: 'permit2', spenderAddress: '0xspender' } },
        { extra: { name: 'United Stables', version: '1', assetTransferMethod: 'eip3009', signerAddress: '0xsigner' } },
      ],
    }),
    verify: async (p: PaymentPayload) => ({ isValid: true, payer: p.payload.authorization?.from }),
    settle: vi.fn(async (p, r): Promise<SettleResult> => ({ success: true, transaction: '0xtx', network: r.network, payer: p.payload.authorization?.from })),
    ...over,
  } as never;
}

const mk = (f = fac(), extra: object = {}) => {
  const receipts = new MemoryReceiptStore();
  const gate = createGate({ facilitator: f, receipts, payTo: PAYTO, network: 'eip155:56', assets, ...extra });
  return { gate, receipts, f };
};
const price = { usd: '0.01', description: 'quote' };
const url = 'https://api.test/v1/paid/quote';
const ok = () => new Response('{"ok":true}', { status: 200 });

async function pay() {
  const { gate, receipts, f } = mk();
  const r402 = await gate(new Request(url), price, ok);
  const pr = b64decode<PaymentRequired>(r402.headers.get('PAYMENT-REQUIRED')!);
  const acct = privateKeyToAccount(generatePrivateKey());
  const payment = await signPayment(acct, pr.accepts[0]!, { name: 'United Stables', version: '1' });
  return { gate, receipts, f, pr, acct, payment };
}

describe('gate', () => {
  it('402 with PAYMENT-REQUIRED, eip3009 first, extra echoed, atomic amount', async () => {
    const { gate } = mk();
    const res = await gate(new Request(url), price, ok);
    expect(res.status).toBe(402);
    const pr = b64decode<PaymentRequired>(res.headers.get('PAYMENT-REQUIRED')!);
    expect(pr).toEqual(await res.json());
    expect(pr.x402Version).toBe(2);
    expect(pr.resource.url).toBe(url);
    expect(pr.accepts.map((a) => a.asset)).toEqual([U, USDT]);
    expect(pr.accepts[0]).toMatchObject({ scheme: 'exact', network: 'eip155:56', amount: '10000000000000000', payTo: PAYTO, maxTimeoutSeconds: 60 });
    expect(pr.accepts[0]!.extra).toMatchObject({ signerAddress: '0xsigner', assetTransferMethod: 'eip3009' });
    expect(pr.accepts[1]!.extra.spenderAddress).toBe('0xspender');
  });

  it('503 when the facilitator is down', async () => {
    const { gate } = mk(fac({ getSupported: async () => { throw new Error('down'); } }));
    expect((await gate(new Request(url), price, ok)).status).toBe(503);
  });

  it('verified payment: runs handler, settles, PAYMENT-RESPONSE, receipt settled', async () => {
    const { gate, receipts, f, payment, acct } = await pay();
    const res = await gate(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(payment) } }), price, ok);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(b64decode(res.headers.get('PAYMENT-RESPONSE')!)).toMatchObject({ success: true, transaction: '0xtx', network: 'eip155:56' });
    expect(f.settle).toHaveBeenCalledTimes(1);
    const rc = receipts.get({ nonce: payment.payload.authorization!.nonce, network: 'eip155:56', payer: acct.address });
    expect(rc).toMatchObject({ status: 'settled', transaction: '0xtx' });
  });

  it('replay of the same authorization is refused and never settles twice', async () => {
    const { gate, f, payment } = await pay();
    const mkReq = () => new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(payment) } });
    expect((await gate(mkReq(), price, ok)).status).toBe(200);
    const again = await gate(mkReq(), price, ok);
    expect(again.status).toBe(402);
    expect(((await again.json()) as { error: string }).error).toBe('payment_already_used');
    expect(f.settle).toHaveBeenCalledTimes(1);
  });

  it('accepts payment passed via MCP _meta', async () => {
    const { gate, payment } = await pay();
    const res = await gate(new Request(url, { method: 'POST' }), price, ok, { payment });
    expect(res.status).toBe(200);
  });

  it('rejects tampered accepted (lower amount) and does not verify', async () => {
    const { gate, f, payment } = await pay();
    payment.accepted = { ...payment.accepted, amount: '1' };
    const res = await gate(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(payment) } }), price, ok);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe('payment_requirements_mismatch');
    expect(f.settle).not.toHaveBeenCalled();
  });

  it('invalid header and failed verify give 402, handler not run', async () => {
    const handler = vi.fn(ok);
    const { gate } = mk(fac({ verify: async () => ({ isValid: false, invalidReason: 'invalid_signature' }) }));
    expect(((await (await gate(new Request(url, { headers: { 'PAYMENT-SIGNATURE': '!!notb64' } }), price, handler)).json()) as { error: string }).error).toBe('invalid_payment_header');
    const { pr } = await pay();
    const acct = privateKeyToAccount(generatePrivateKey());
    const p = await signPayment(acct, pr.accepts[0]!, { name: 'United Stables', version: '1' });
    const res = await gate(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(p) } }), price, handler);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_signature');
    expect(handler).not.toHaveBeenCalled();
  });

  it('handler error status: no settle, receipt released so the payer can retry', async () => {
    const { gate, receipts, f, payment, acct } = await pay();
    const res = await gate(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(payment) } }), price, () => new Response('x', { status: 500 }));
    expect(res.status).toBe(500);
    expect(f.settle).not.toHaveBeenCalled();
    expect(receipts.get({ nonce: payment.payload.authorization!.nonce, network: 'eip155:56', payer: acct.address })).toBeUndefined();
    const res2 = await gate(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(payment) } }), price, ok);
    expect(res2.status).toBe(200);
  });

  it('terminal settle failure: 402, handler body withheld, receipt failed and re-payable', async () => {
    const f = fac();
    f.settle.mockResolvedValueOnce({ success: false, transaction: '', network: 'eip155:56', errorReason: 'insufficient_funds' });
    const { gate, receipts } = mk(f);
    const r402 = await gate(new Request(url), price, ok);
    const pr = b64decode<PaymentRequired>(r402.headers.get('PAYMENT-REQUIRED')!);
    const acct = privateKeyToAccount(generatePrivateKey());
    const p = await signPayment(acct, pr.accepts[0]!, { name: 'United Stables', version: '1' });
    const res = await gate(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(p) } }), price, ok);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe('insufficient_funds');
    const key = { nonce: p.payload.authorization!.nonce, network: 'eip155:56', payer: acct.address };
    expect(receipts.get(key)!.status).toBe('failed');
    expect((await gate(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(p) } }), price, ok)).status).toBe(200);
  });

  it('slow settle: pending PAYMENT-RESPONSE after the deadline, receipt updated in background', async () => {
    const f = fac();
    let finish!: (r: SettleResult) => void;
    f.settle.mockReturnValue(new Promise<SettleResult>((r) => (finish = r)));
    const { gate, receipts } = mk(f, { settleDeadlineMs: 10 });
    const r402 = await gate(new Request(url), price, ok);
    const pr = b64decode<PaymentRequired>(r402.headers.get('PAYMENT-REQUIRED')!);
    const acct = privateKeyToAccount(generatePrivateKey());
    const p = await signPayment(acct, pr.accepts[0]!, { name: 'United Stables', version: '1' });
    const res = await gate(new Request(url, { headers: { 'PAYMENT-SIGNATURE': header(p) } }), price, ok);
    expect(res.status).toBe(200);
    expect(b64decode(res.headers.get('PAYMENT-RESPONSE')!)).toMatchObject({ success: false, pending: true });
    const key = { nonce: p.payload.authorization!.nonce, network: 'eip155:56', payer: acct.address };
    expect(receipts.get(key)!.status).toBe('pending');
    finish({ success: true, transaction: '0xlate', network: 'eip155:56' });
    await new Promise((r) => setTimeout(r, 5));
    expect(receipts.get(key)).toMatchObject({ status: 'settled', transaction: '0xlate' });
  });
});
