import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { B402Error, B402FacilitatorClient, signB402 } from './b402';
import type { PaymentPayload, PaymentRequirements } from './types';

// Throwaway key generated at test time. Fixtures below follow the shapes in the public docs
// (envelope {code,message,data}); they are NOT recordings from the live service.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const req: PaymentRequirements = {
  scheme: 'exact', network: 'eip155:56', asset: '0xa', amount: '10', payTo: '0xb', maxTimeoutSeconds: 20,
  extra: { name: 'United Stables', version: '1', assetTransferMethod: 'eip3009', signerAddress: '0xs' },
};
const payload = { x402Version: 2, accepted: req, payload: { signature: '0x1', authorization: { from: '0xf', to: '0xb', value: '10', validAfter: '0', validBefore: '9', nonce: '0xn' } } } as PaymentPayload;
const env = (data: unknown, code = '0') => new Response(JSON.stringify({ code, message: 'success', data }), { status: 200 });

function client(responses: Array<Response | (() => Response)>, extra: object = {}) {
  let t = 1_700_000_000_000;
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetchMock = vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: init.body });
    const r = responses.shift();
    if (!r) throw new Error('no more fixtures');
    return typeof r === 'function' ? r() : r;
  });
  const sleeps: number[] = [];
  const c = new B402FacilitatorClient({
    baseUrl: 'https://b402.example/', clientId: 'cid', signAccessToken: 'tok', privateKey,
    fetch: fetchMock as never, now: () => t,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
    ...extra,
  });
  return { c, calls, sleeps };
}

describe('B402FacilitatorClient (mocked, UNTESTED-LIVE)', () => {
  it('sends the five headers and an RSA-SHA256 signature over body+timestamp that verifies', async () => {
    const { c, calls } = client([env({ kinds: [{ extra: req.extra }] })]);
    const s = await c.getSupported();
    expect(s.kinds).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://b402.example/papi/v2/b402/supported');
    expect(call.body).toBe('{}');
    const h = call.headers;
    expect(Object.keys(h).sort()).toEqual(['Content-Type', 'X-Tesla-ClientId', 'X-Tesla-Signature', 'X-Tesla-SignAccessToken', 'X-Tesla-Timestamp'].sort());
    expect(h['X-Tesla-Timestamp']).toBe('1700000000000');
    const v = createVerify('RSA-SHA256').update(call.body + h['X-Tesla-Timestamp']);
    expect(v.verify(createPublicKey(publicKey), h['X-Tesla-Signature']!, 'base64')).toBe(true);
    // wrong body must not verify
    expect(createVerify('RSA-SHA256').update('{x}' + h['X-Tesla-Timestamp']).verify(publicKey, h['X-Tesla-Signature']!, 'base64')).toBe(false);
  });

  it('accepts a bare base64 PKCS#8 DER key', () => {
    const der = privateKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const sig = signB402('b', '1', der);
    expect(createVerify('RSA-SHA256').update('b1').verify(publicKey, sig, 'base64')).toBe(true);
  });

  it('verify posts v2 body and unwraps envelope', async () => {
    const { c, calls } = client([env({ isValid: true, payer: '0xf' })]);
    const r = await c.verify(payload, req);
    expect(r).toEqual({ isValid: true, payer: '0xf', invalidReason: undefined });
    expect(JSON.parse(calls[0]!.body)).toEqual({ x402Version: 2, paymentPayload: payload, paymentRequirements: req });
    const { c: c2 } = client([env({ isValid: false, invalidReason: 'invalid_signature' })]);
    expect((await c2.verify(payload, req)).invalidReason).toBe('invalid_signature');
  });

  it('throws on envelope error code and on HTTP errors', async () => {
    const { c } = client([env({}, '100001')]);
    await expect(c.verify(payload, req)).rejects.toMatchObject({ name: 'B402Error', code: '100001' });
    const { c: c2 } = client([new Response('no', { status: 403 })]);
    await expect(c2.verify(payload, req)).rejects.toBeInstanceOf(B402Error);
  });

  it('backs off on 429 then succeeds', async () => {
    const { c, sleeps } = client([new Response('', { status: 429 }), new Response('', { status: 429 }), env({ isValid: true })]);
    expect((await c.verify(payload, req)).isValid).toBe(true);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('settle: success immediately', async () => {
    const { c } = client([env({ success: true, transaction: '0xtx', payer: '0xf', network: 'eip155:56', amount: '10' })]);
    expect(await c.settle(payload, req)).toMatchObject({ success: true, transaction: '0xtx', pending: false });
  });

  it('settle: terminal failure (no tx) does not poll', async () => {
    const { c, calls } = client([env({ success: false, transaction: '', errorReason: 'insufficient_funds', network: 'eip155:56' })]);
    const r = await c.settle(payload, req);
    expect(r).toMatchObject({ success: false, pending: false, errorReason: 'insufficient_funds' });
    expect(calls).toHaveLength(1);
  });

  it('settle: pending (tx present) is polled every 4 s until success', async () => {
    const pend = () => env({ success: false, transaction: '0xtx', network: 'eip155:56' });
    const { c, calls, sleeps } = client([pend(), pend(), env({ success: true, transaction: '0xtx', network: 'eip155:56' })]);
    const r = await c.settle(payload, req);
    expect(r.success).toBe(true);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([4000, 4000]);
  });

  it('settle: gives up with pending=true after maxTimeoutSeconds', async () => {
    const pend = () => env({ success: false, transaction: '0xtx', network: 'eip155:56' });
    const { c, calls } = client(Array.from({ length: 10 }, () => pend));
    const r = await c.settle(payload, req); // 20 s timeout, 4 s interval
    expect(r).toMatchObject({ success: false, pending: true, transaction: '0xtx' });
    expect(calls.length).toBe(6);
  });
});
