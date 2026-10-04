import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { B402Error, B402FacilitatorClient } from './b402';
import type { PaymentPayload, PaymentRequirements } from './types';

// Fixtures follow the Binance Web3 OpenAPI spec (envelope {status,type,code,errorData,data}); NOT live recordings.
const req: PaymentRequirements = {
  scheme: 'exact', network: 'eip155:56', asset: '0xa', amount: '10', payTo: '0xb', maxTimeoutSeconds: 20,
  extra: { name: 'United Stables', version: '1', assetTransferMethod: 'eip3009', signerAddress: '0xs' },
};
const payload = { x402Version: 2, accepted: req, payload: { signature: '0x1', authorization: { from: '0xf', to: '0xb', value: '10', validAfter: '0', validBefore: '9', nonce: '0xn' } } } as PaymentPayload;
const env = (data: unknown) => new Response(JSON.stringify({ status: 'OK', type: null, code: '000000000', errorData: null, data }), { status: 200 });

function client(responses: Array<Response>) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetchMock = vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: init.body });
    const r = responses.shift();
    if (!r) throw new Error('no more fixtures');
    return r;
  });
  const sleeps: number[] = [];
  const c = new B402FacilitatorClient({
    apiKey: 'k', apiSecret: 's', fetch: fetchMock as never, now: () => 1_700_000_000_000,
    sleep: async (ms) => { sleeps.push(ms); },
  });
  return { c, calls, sleeps };
}

describe('B402FacilitatorClient (mocked)', () => {
  it('posts to /build/api/v2/b402/* with X-OC headers and an HMAC over ts+POST+path+body', async () => {
    const { c, calls } = client([env({ kinds: [{ extra: req.extra }] }), env({ isValid: true }), env({ success: true, transaction: '0xtx', network: 'eip155:56' })]);
    expect((await c.getSupported()).kinds).toHaveLength(1);
    await c.verify(payload, req);
    await c.settle(payload, req);
    expect(calls.map((x) => x.url)).toEqual(['https://web3.binance.com/build/api/v2/b402/supported', 'https://web3.binance.com/build/api/v2/b402/verify', 'https://web3.binance.com/build/api/v2/b402/settle']);
    expect(calls[0]!.body).toBe('{"body":{}}');
    for (const call of calls) {
      const h = call.headers;
      expect(h['X-OC-APIKEY']).toBe('k');
      expect(h['X-OC-TIMESTAMP']).toBe('2023-11-14T22:13:20.000Z');
      const path = new URL(call.url).pathname;
      expect(h['X-OC-SIGN']).toBe(createHmac('sha256', 's').update(h['X-OC-TIMESTAMP']! + 'POST' + path + call.body).digest('base64'));
      expect(call.body).not.toContain('merchantId');
    }
    expect(JSON.parse(calls[2]!.body)).toEqual({ body: { x402Version: 2, paymentPayload: payload, paymentRequirements: req } });
  });

  it('verify unwraps data; isValid=false stays a normal result', async () => {
    const { c } = client([env({ isValid: false, invalidReason: 'invalid_signature' })]);
    expect(await c.verify(payload, req)).toMatchObject({ isValid: false, invalidReason: 'invalid_signature' });
  });

  it('throws on ERROR envelope and on HTTP errors', async () => {
    const err = new Response(JSON.stringify({ status: 'ERROR', code: '1160401', errorData: 'Merchant not found' }), { status: 200 });
    await expect(client([err]).c.verify(payload, req)).rejects.toMatchObject({ name: 'B402Error', code: '1160401' });
    await expect(client([new Response('no', { status: 403 })]).c.verify(payload, req)).rejects.toBeInstanceOf(B402Error);
  });

  it('backs off on 429 then succeeds', async () => {
    const { c, sleeps } = client([new Response('', { status: 429 }), new Response('', { status: 429 }), env({ isValid: true })]);
    expect((await c.verify(payload, req)).isValid).toBe(true);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('settle: success', async () => {
    const { c } = client([env({ success: true, transaction: '0xtx', payer: '0xf', network: 'eip155:56', amount: '10' })]);
    expect(await c.settle(payload, req)).toMatchObject({ success: true, transaction: '0xtx', pending: false });
  });

  it('settle: failure without tx is terminal', async () => {
    const { c, calls } = client([env({ success: false, transaction: '', errorReason: 'insufficient_funds' })]);
    expect(await c.settle(payload, req)).toMatchObject({ success: false, pending: false, errorReason: 'insufficient_funds' });
    expect(calls).toHaveLength(1);
  });

  it('settle: failure with tx is pending and is NOT re-settled', async () => {
    const { c, calls } = client([env({ success: false, transaction: '0xtx' })]);
    expect(await c.settle(payload, req)).toMatchObject({ success: false, pending: true, transaction: '0xtx' });
    expect(calls).toHaveLength(1);
  });
});
