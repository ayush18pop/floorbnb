import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Bw3Client, Bw3Error, Bw3HttpError, Bw3TimeoutError, InsufficientLiquidity, MinOrder, RfqRequired, isoTimestamp, sign } from './index.js';

const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}.json`, import.meta.url), 'utf8');
const FIXED = Date.UTC(2026, 9, 2, 12, 6, 0, 123);
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const NVDAB = '0x02fca66c1d1afb4e2a7884261eb00f63598a7436';
const W = '0x000000000000000000000000000000000000dEaD';

function mk(responses: Array<Response | Error>, extra: object = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error('no more mock responses');
    if (r instanceof Error) throw r;
    return r;
  });
  const sleeps: number[] = [];
  const client = new Bw3Client({
    apiKey: 'test-key', apiSecret: 'test-secret', fetch: fetchMock as unknown as typeof fetch,
    sleep: async (ms) => { sleeps.push(ms); }, now: () => FIXED, ...extra,
  });
  return { client, calls, sleeps };
}
const ok = (name: string) => new Response(fx(name), { status: 200 });

describe('signing', () => {
  it('timestamp is ISO-8601 with milliseconds', () => {
    expect(isoTimestamp(FIXED)).toBe('2026-10-02T12:06:00.123Z');
  });
  it('matches an independently computed HMAC (python hmac, base64 and hex)', () => {
    const base = { secret: 'test-secret', timestamp: '2026-10-02T12:06:00.123Z', method: 'GET', path: '/build/api/v1/dex/aggregator/quote?amount=10&binanceChainId=56' };
    expect(sign(base)).toBe('ZZs4FJG1W8OY8B1QZu5Lzy2zFAsO2rinTfdVGpRe7V4=');
    expect(sign({ ...base, encoding: 'hex' })).toBe('659b381491b55bc398f01d5066ee4bcf2db3140b0edab8a74df7551a945eed5e');
  });
  it('includes the body for POST', () => {
    expect(sign({ secret: 'test-secret', timestamp: '2026-10-02T12:06:00.123Z', method: 'POST', path: '/build/api/v1/dex/pre-transaction/simulate', body: '{"a":1}' }))
      .toBe('SxYErVwoiobGLiqAhAOCN5XD87FUrkTUhDvuUbv0FPQ=');
  });
  it('request carries /build in the URL and in the signed path, and never leaks the secret', async () => {
    const { client, calls } = mk([ok('quote')]);
    await client.quote({ from: USDT, to: NVDAB, amount: '10000000000000000000', userWalletAddress: W });
    const c = calls[0]!;
    expect(c.url).toBe(`https://web3.binance.com/build/api/v1/dex/aggregator/quote?binanceChainId=56&amount=10000000000000000000&fromTokenAddress=${USDT}&toTokenAddress=${NVDAB}&userWalletAddress=${W}`);
    const h = c.init.headers as Record<string, string>;
    expect(h['X-OC-APIKEY']).toBe('test-key');
    expect(h['X-OC-TIMESTAMP']).toBe('2026-10-02T12:06:00.123Z');
    expect(h['X-OC-SIGN']).toBe(sign({ secret: 'test-secret', timestamp: h['X-OC-TIMESTAMP']!, method: 'GET', path: c.url.replace('https://web3.binance.com', '') }));
    expect(JSON.stringify(c.init)).not.toContain('test-secret');
  });
});

describe('endpoints on fixtures', () => {
  it('quote parses routes', async () => {
    const { client } = mk([ok('quote')]);
    const r = await client.quote({ from: USDT, to: NVDAB, amount: '1', userWalletAddress: W, vendor: 'x' });
    expect(r[0]?.vendorName).toBe('LiquidMesh');
    expect(r[0]?.toTokenAmount).toBe('28234875539657965');
  });
  it('quote passes vendor filter', async () => {
    const { client, calls } = mk([ok('quote')]);
    await client.quote({ from: USDT, to: NVDAB, amount: '1', userWalletAddress: W, vendor: 'PancakeSwap V3' });
    expect(calls[0]!.url).toContain('vendor=PancakeSwap+V3');
  });
  it('swap JSON.parses signatureData[0] and returns approveTarget', async () => {
    const { client, calls } = mk([ok('swap')]);
    const s = await client.swap({ from: USDT, to: NVDAB, amount: '1', userWalletAddress: W, quoteId: 'q', slippagePercent: '1' });
    expect(s).toEqual({ to: '0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5', data: '0xabcdef', minReceiveAmount: '27952526784261385', approveTarget: '0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5', executionMode: 'SWAP' });
    expect(calls[0]!.url).toContain('approveTransaction=true');
    expect(calls[0]!.url).toContain('quoteId=q');
  });
  it('swap without approveTarget throws', async () => {
    const body = JSON.parse(fx('swap'));
    body.data.tx.signatureData = [];
    const { client } = mk([new Response(JSON.stringify(body))]);
    await expect(client.swap({ from: USDT, to: NVDAB, amount: '1', userWalletAddress: W, quoteId: 'q', slippagePercent: '1' })).rejects.toThrow(/approveTarget/);
  });
  it('simulate POSTs a signed JSON body and parses a failure', async () => {
    const { client, calls } = mk([ok('simulate-failed')]);
    const r = await client.simulate({ from: W, to: NVDAB, data: '0x' });
    expect(r.status).toBe('FAILED');
    expect(r.failReason).toMatch(/allowance/);
    const c = calls[0]!;
    expect(c.init.method).toBe('POST');
    expect(c.url).toBe('https://web3.binance.com/build/api/v1/dex/pre-transaction/simulate');
    expect(JSON.parse(c.init.body as string)).toEqual({ binanceChainId: '56', evmTx: { value: '0', from: W, to: NVDAB, data: '0x' } });
    const h = c.init.headers as Record<string, string>;
    expect(h['X-OC-SIGN']).toBe(sign({ secret: 'test-secret', timestamp: h['X-OC-TIMESTAMP']!, method: 'POST', path: '/build/api/v1/dex/pre-transaction/simulate', body: c.init.body as string }));
  });
  it('gasPrice parses', async () => {
    const { client } = mk([ok('gas-price')]);
    expect((await client.gasPrice()).evmLegacyGasPrice?.mediumGasPrice).toBe('53752850');
  });
  it('broadcast sends the MEV flag', async () => {
    const { client, calls } = mk([new Response(JSON.stringify({ code: '000000', data: { orderId: 'o1', txHash: '0xabc' } }))]);
    const r = await client.broadcast('0xsigned', { mev: true, address: W });
    expect(r.txHash).toBe('0xabc');
    expect(JSON.parse(calls[0]!.init.body as string).enableMevProtection).toBe(true);
  });
  it('rwaPrice uses the plural tokenContractAddresses param', async () => {
    const { client, calls } = mk([new Response(JSON.stringify({ code: '000000', data: [{ price: '1' }] }))]);
    await client.rwaPrice([NVDAB]);
    expect(calls[0]!.url).toContain('tokenContractAddresses=0x02fca66c');
  });
});

describe('typed errors', () => {
  it('MinOrder', async () => {
    const { client } = mk([ok('error-min-order')]);
    await expect(client.quote({ from: USDT, to: NVDAB, amount: '1', userWalletAddress: W })).rejects.toBeInstanceOf(MinOrder);
  });
  it('InsufficientLiquidity and RfqRequired', async () => {
    const a = mk([new Response(JSON.stringify({ code: '1', msg: 'Insufficient liquidity', data: null }))]);
    await expect(a.client.quote({ from: USDT, to: NVDAB, amount: '1', userWalletAddress: W })).rejects.toBeInstanceOf(InsufficientLiquidity);
    const b = mk([new Response(JSON.stringify({ code: '1', msg: 'RFQ quote unavailable for this wallet', data: null }))]);
    await expect(b.client.quote({ from: USDT, to: NVDAB, amount: '1', userWalletAddress: W })).rejects.toBeInstanceOf(RfqRequired);
  });
  it('unexpected shape throws Bw3Error', async () => {
    const { client } = mk([new Response(JSON.stringify({ code: '000000', data: [{ nope: 1 }] }))]);
    await expect(client.quote({ from: USDT, to: NVDAB, amount: '1', userWalletAddress: W })).rejects.toBeInstanceOf(Bw3Error);
  });
});

describe('retry and timeout', () => {
  it('retries 5xx and 429 with 2, 4, 8 s backoff then succeeds', async () => {
    const { client, sleeps, calls } = mk([new Response('', { status: 503 }), new Response('', { status: 429 }), new Response('', { status: 500 }), ok('gas-price')]);
    await client.gasPrice();
    expect(sleeps).toEqual([2000, 4000, 8000]);
    expect(calls).toHaveLength(4);
  });
  it('gives up after three retries with Bw3HttpError', async () => {
    const { client, calls } = mk([1, 2, 3, 4].map(() => new Response('', { status: 502 })));
    await expect(client.gasPrice()).rejects.toBeInstanceOf(Bw3HttpError);
    expect(calls).toHaveLength(4);
  });
  it('does not retry 4xx API errors', async () => {
    const { client, calls } = mk([new Response(JSON.stringify({ code: '1', msg: 'bad request' }), { status: 400 })]);
    await expect(client.gasPrice()).rejects.toBeInstanceOf(Bw3Error);
    expect(calls).toHaveLength(1);
  });
  it('times out after 10 s by default and retries', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => {
        init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }));
      const client = new Bw3Client({ apiKey: 'k', apiSecret: 's', fetch: fetchMock as unknown as typeof fetch, retryDelaysMs: [], now: () => FIXED });
      const p = client.gasPrice();
      const assertion = expect(p).rejects.toBeInstanceOf(Bw3TimeoutError);
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
