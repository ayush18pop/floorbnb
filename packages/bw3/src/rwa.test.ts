import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Bw3Client, Bw3Error, Bw3StatsRegistry, bw3Stats } from './index.js';

const live = (n: string) => readFileSync(new URL(`../fixtures/live-2026-10-10/${n}.json`, import.meta.url), 'utf8');
const NVDAB = '0x02fca66c1d1afb4e2a7884261eb00f63598a7436';

function mk(bodies: Array<string | Response>) {
  const calls: string[] = [];
  const f = vi.fn(async (url: string) => {
    calls.push(url);
    const b = bodies.shift();
    if (b === undefined) throw new Error('no more mock responses');
    return typeof b === 'string' ? new Response(b, { status: 200 }) : b;
  });
  const client = new Bw3Client({ apiKey: 'test-key', apiSecret: 'test-secret', fetch: f as unknown as typeof fetch, retryDelaysMs: [] });
  return { client, calls };
}

beforeEach(() => bw3Stats.reset());

describe('RWA / candles methods on live fixtures', () => {
  it('rwaUnderlyingMarket sends tokenContractAddress and parses', async () => {
    const { client, calls } = mk([live('underlying-market-NVDAB')]);
    const r = await client.rwaUnderlyingMarket(NVDAB);
    expect(calls[0]).toBe(`https://web3.binance.com/build/api/v1/dex/market/rwa/underlying-market?binanceChainId=56&tokenContractAddress=${NVDAB}`);
    expect(r.statusInfo?.reasonCode).toBe('TRADING');
    expect(r.statusInfo?.marketStatus).toBeNull();
    expect(r.marketData?.high52W).toBe('243.3700');
  });
  it('rwaUnderlyingProfile parses', async () => {
    const { client } = mk([live('underlying-profile-NVDAB')]);
    const r = await client.rwaUnderlyingProfile(NVDAB);
    expect(r.underlyingTicker).toBe('NVDA');
    expect(r.companyInfo?.industry).toBe('Technology');
  });
  it('profile and market parse for the other two tokens', async () => {
    const { client } = mk([live('underlying-market-QQQB'), live('underlying-profile-QQQB'), live('underlying-market-SPCXB'), live('underlying-profile-SPCXB')]);
    expect((await client.rwaUnderlyingMarket('a')).platformId).toBe('bstock');
    expect((await client.rwaUnderlyingProfile('a')).underlyingTicker).toBe('QQQ');
    expect((await client.rwaUnderlyingMarket('b')).platformId).toBe('bstock');
    expect((await client.rwaUnderlyingProfile('b')).platformId).toBe('bstock');
  });
  it('rwaTokens passes platformId and parses rows', async () => {
    const { client, calls } = mk([live('tokens-bstock')]);
    const r = await client.rwaTokens({ platformId: 'bstock' });
    expect(calls[0]).toContain('platformId=bstock');
    expect(r).toHaveLength(3);
    expect(r[0]?.tokenContractAddress).toMatch(/^0x/);
  });
  it('rwaSearch parses grouped rows', async () => {
    const { client, calls } = mk([live('search-NVDA'), live('search-by-address-NVDAB')]);
    const r = await client.rwaSearch('NVDA');
    expect(calls[0]).toContain('keyword=NVDA');
    expect(r[0]?.ticker).toBe('NVDA');
    expect((await client.rwaSearch(NVDAB))[0]?.assets?.[0]?.tokenSymbol).toBe('NVDAB');
  });
  it('rwaPlatforms parses', async () => {
    const { client } = mk([live('platforms')]);
    const r = await client.rwaPlatforms();
    expect(r.map((p) => p.platformId)).toContain('bstock');
  });
  it('candles uses `bar` (not interval), limit, and parses rows', async () => {
    const { client, calls } = mk([live('candles-1d')]);
    const r = await client.candles({ address: NVDAB, interval: '1d', limit: 5 });
    expect(calls[0]).toContain('bar=1d');
    expect(calls[0]).toContain('limit=5');
    expect(calls[0]).not.toContain('interval=');
    expect(r).toHaveLength(5);
    expect(r[0]).toHaveLength(7);
    expect(Number(r[1]![5])).toBeGreaterThan(Number(r[0]![5]));
  });
  it('recorded upstream errors surface as Bw3Error with code', async () => {
    const { client } = mk([live('error-bad-bar')]);
    const e = await client.candles({ address: NVDAB, interval: '1D' }).catch((x) => x);
    expect(e).toBeInstanceOf(Bw3Error);
    expect((e as Bw3Error).code).toBe('40001');
  });
  it('rejects a response of the wrong shape', async () => {
    const { client } = mk([JSON.stringify({ code: '000000', data: { not: 'a list' } })]);
    await expect(client.rwaPlatforms()).rejects.toThrow(/unexpected rwaPlatforms/);
  });
});

describe('stats registry', () => {
  it('counts ok and error per path without the query string, after retries', async () => {
    const { client } = mk([live('platforms'), live('error-bad-bar'), live('platforms')]);
    await client.rwaPlatforms();
    await client.candles({ address: NVDAB, interval: '1D' }).catch(() => undefined);
    await client.rwaPlatforms();
    const s = bw3Stats.snapshot();
    expect(s['/api/v1/dex/market/rwa/platforms']).toMatchObject({ calls: 2, okCalls: 2, lastError: null });
    const c = s['/api/v1/dex/market/candles']!;
    expect(c).toMatchObject({ calls: 1, okCalls: 0, lastOkAt: null });
    expect(c.lastErrorAt).toBeGreaterThan(1_700_000_000);
    expect(c.lastError).toBe('Bw3Error 40001');
  });
  it('one retried request counts as one call', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('x', { status: 503 }))
      .mockResolvedValueOnce(new Response(live('platforms'), { status: 200 }));
    const client = new Bw3Client({ apiKey: 'k', apiSecret: 's', fetch: f as unknown as typeof fetch, retryDelaysMs: [0], sleep: async () => undefined });
    await client.rwaPlatforms();
    expect(bw3Stats.snapshot()['/api/v1/dex/market/rwa/platforms']).toMatchObject({ calls: 1, okCalls: 1 });
  });
  it('never stores secrets, bodies or long text', async () => {
    const f = vi.fn().mockRejectedValue(new Error('boom test-secret test-key '.repeat(20)));
    const client = new Bw3Client({ apiKey: 'test-key', apiSecret: 'test-secret', fetch: f as unknown as typeof fetch, retryDelaysMs: [] });
    await client.rwaPlatforms().catch(() => undefined);
    const dump = JSON.stringify(bw3Stats.snapshot());
    expect(dump).not.toContain('test-secret');
    expect(dump).not.toContain('test-key');
    expect(dump).not.toContain('boom');
    expect(dump).toContain('Bw3Error');
  });
  it('truncates lastError to 120 chars', () => {
    const r = new Bw3StatsRegistry(() => 5000);
    r.record('/p?secret=1', false, 'x'.repeat(500));
    expect(r.snapshot()['/p']!.lastError).toHaveLength(120);
    expect(r.snapshot()['/p']!.lastErrorAt).toBe(5);
  });
});
