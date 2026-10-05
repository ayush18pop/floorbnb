import { describe, expect, it } from 'vitest';
import type { PublicClient } from 'viem';
import { FLOOR_DISCLOSURE, TOKENS, USDT } from '@floor/sdk';
import { createApp, type AppDeps } from './app';
import { InMemoryKeeperRunStore, readHeartbeat } from './keeperRuns';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config';

const FACTORY = '0x4d90a1F73C96d0bAcfB6BC901A98420F279e4189' as const;
const LENS = '0x237efF8729B8F24816719B18760fB21fd552A69F' as const;
const VAULT = '0x1111111111111111111111111111111111111111' as const;
const FAKE = '0x2222222222222222222222222222222222222222' as const;
const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
const E18 = 10n ** 18n;

interface Opts { allowance?: bigint; callFails?: boolean; maxDeposit?: bigint }
function fakeClient(o: Opts = {}) {
  const calls: string[] = [];
  const client = {
    async readContract({ address, functionName, args }: { address: string; functionName: string; args?: unknown[] }) {
      calls.push(functionName);
      switch (functionName) {
        case 'usdt': return USDT;
        case 'assets': return [LENS, 2500, args![0] !== TOKENS.TSLAB.address, 1n, 5000n * E18, true];
        case 'defaults': return [100, 100, 300, 600, 1800, 200, 100, 50, 6n * E18, E18];
        case 'maxDeposit': return o.maxDeposit ?? 10_000n * E18;
        case 'maxTotalTvl': return 100_000n * E18;
        case 'totalTvl': return 500n * E18;
        case 'paused': case 'halted': return false;
        case 'positionsCount': return 1n;
        case 'isTradingOpen': return true;
        case 'positionsOf': return args![0] === OWNER ? [VAULT] : [];
        case 'owner': if (address === VAULT) return OWNER; throw new Error('no code');
        case 'balanceOf': return 5_000n * E18;
        case 'allowance': return o.allowance ?? 0n;
        case 'status': return { vault: VAULT, V: 1000n * E18, floor: 900n * E18, cushion: 100n * E18, exposure: 400n * E18, target: 400n * E18, needsRebalance: false, tradingOpen: true };
        case 'deposit': return 1000n * E18;
        case 'maturity': return 1_800_000_000;
        case 'nAssets': return 1;
        case 'assetAt': return TOKENS.NVDAB.address;
        case 'weightBps': return 10_000;
        case 'status_vault': return 0;
        default: throw new Error(`unmocked ${functionName}`);
      }
    },
    async call() { if (o.callFails) throw new Error('execution reverted: nope\nsecret details'); return { data: '0x' }; },
  } as unknown as PublicClient;
  return { client, calls };
}

function mk(extra: Partial<AppDeps> = {}, o: Opts = {}) {
  const { client, calls } = fakeClient(o);
  const runs = new InMemoryKeeperRunStore();
  const app = createApp({ chainId: 31337, deployment: { chainId: 31337, factory: FACTORY, lens: LENS }, client, runs, now: () => 1_791_000_000_000, ...extra });
  return { app: app as unknown as { request(p: string, i?: RequestInit): Promise<R> }, calls, runs };
}
interface R extends Response { json(): Promise<any> } // eslint-disable-line @typescript-eslint/no-explicit-any
const post = async (app: ReturnType<typeof mk>['app'], path: string, body: unknown, headers: Record<string, string> = {}): Promise<R> =>
  app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

const goodCreate = { owner: OWNER, amount: (1000n * E18).toString(), floorBps: 9000, termSeconds: 365 * 86400, assets: [TOKENS.NVDAB.address], weightsBps: [10000] };

describe('reads', () => {
  it('healthz has null heartbeat with no runs, then an age', async () => {
    const { app, runs } = mk();
    expect((await (await app.request('/healthz')).json()).keeper.heartbeatAgeSeconds).toBeNull();
    runs.add({ id: 'r1', vault: VAULT, startedAt: 1_790_999_940, finishedAt: null, outcome: 'hold', txHash: null, detail: null });
    expect((await (await app.request('/healthz')).json()).keeper.heartbeatAgeSeconds).toBe(60);
  });

  it('healthz serves the keeper heartbeat file (newest of file and run log), null when missing or garbage', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hb-'));
    const f = join(dir, 'hb.json');
    expect(readHeartbeat(f)).toBeNull();
    writeFileSync(f, 'not json');
    expect(readHeartbeat(f)).toBeNull();
    writeFileSync(f, JSON.stringify({ lastScan: 1_790_999_970 }));
    const { app } = mk({ keeperHeartbeat: async () => readHeartbeat(f) });
    const k = (await (await app.request('/healthz')).json()).keeper;
    expect(k.lastHeartbeat).toBe(1_790_999_970);
    expect(k.heartbeatAgeSeconds).toBe(30);
  });

  it('/v1/floor returns factory, lens, caps, disclosure; bigints are strings', async () => {
    const { app } = mk();
    const j = await (await app.request('/v1/floor')).json();
    expect(j.factory).toBe(FACTORY);
    expect(j.lens).toBe(LENS);
    expect(j.disclosure).toBe(FLOOR_DISCLOSURE);
    expect(j.product).toBe('Floor');
    expect(j.caps.maxDeposit).toBe((10_000n * E18).toString());
    expect(j.defaults.minTrade).toBe((6n * E18).toString());
    expect(j.bounds.multiplier).toBe(4);
  });

  it('/v1/assets marks inactive assets and nulls their config', async () => {
    const { app } = mk();
    const j = await (await app.request('/v1/assets')).json();
    const tsla = j.assets.find((a: { symbol: string }) => a.symbol === 'TSLAB');
    expect(tsla.active).toBe(false);
    expect(tsla.pool).toBeNull();
    expect(j.assets.find((a: { symbol: string }) => a.symbol === 'NVDAB').active).toBe(true);
  });

  it('/v1/market passes null marketStatus through and caches 15 s', async () => {
    let n = 0;
    const bw3 = { async rwaPrice() { n++; return [{ tokenContractAddress: TOKENS.NVDAB.address, tokenPrice: '234.5', referencePrice: '234.3', tokenPriceUpdatedAt: 1791043636632, platformId: 'bstock' }]; } };
    const { app } = mk({ bw3 });
    const j = await (await app.request('/v1/market')).json();
    const nvda = j.assets.find((a: { symbol: string }) => a.symbol === 'NVDAB');
    expect(nvda.price).toBe('234.5');
    expect(nvda.marketStatus).toBeNull();
    expect(nvda.nextOpenTime).toBeNull();
    expect(j.assets.find((a: { symbol: string }) => a.symbol === 'QQQB').price).toBeNull();
    await app.request('/v1/market');
    expect(n).toBe(1);
  });

  it('/v1/market is 503 without BW3 keys', async () => {
    expect((await mk().app.request('/v1/market')).status).toBe(503);
  });

  it('positions by owner and by vault; unknown vault is 404; bad address 400', async () => {
    const { app } = mk();
    const j = await (await app.request(`/v1/positions?owner=${OWNER}`)).json();
    expect(j.count).toBe(1);
    expect(j.positions[0].V).toBe((1000n * E18).toString());
    expect(j.positions[0].floor).toBe((900n * E18).toString());
    expect((await app.request(`/v1/positions/${VAULT}`)).status).toBe(200);
    expect((await app.request(`/v1/positions/${FAKE}`)).status).toBe(404);
    expect((await app.request('/v1/positions?owner=nope')).status).toBe(400);
  });

  it('activity serialises bigints as strings, 404 for unknown vaults, 501 when off', async () => {
    const ev = { eventName: 'Closed', txHash: '0xabc', blockNumber: 7n, logIndex: 1, timestamp: 5, args: { usdtOut: 9n } };
    const on = mk({ activity: async () => [ev as never] }).app;
    const j = await (await on.request(`/v1/positions/${VAULT}/activity`)).json();
    expect(j.events[0]).toMatchObject({ eventName: 'Closed', blockNumber: '7', args: { usdtOut: '9' } });
    expect((await on.request(`/v1/positions/${FAKE}/activity`)).status).toBe(404);
    expect((await mk().app.request(`/v1/positions/${VAULT}/activity`)).status).toBe(501);
  });

  it('keeper runs list, filter and get', async () => {
    const { app, runs } = mk();
    runs.add({ id: 'a', vault: VAULT, startedAt: 10, finishedAt: 11, outcome: 'rebalanced', txHash: '0xabc', detail: { n: 1n as unknown as number } });
    runs.add({ id: 'b', vault: FAKE, startedAt: 20, finishedAt: null, outcome: 'hold', txHash: null, detail: null });
    expect((await (await app.request('/v1/keeper/runs')).json()).runs.map((r: { id: string }) => r.id)).toEqual(['b', 'a']);
    expect((await (await app.request(`/v1/keeper/runs?vault=${VAULT}`)).json()).runs).toHaveLength(1);
    expect((await app.request('/v1/keeper/runs/a')).status).toBe(200);
    expect((await app.request('/v1/keeper/runs/zzz')).status).toBe(404);
    expect((await app.request('/v1/keeper/runs?limit=0')).status).toBe(400);
  });
});

describe('tx builders', () => {
  it('create-position returns approve then create, only to USDT and the factory', async () => {
    const { app } = mk({}, { allowance: 0n });
    const r = await post(app, '/v1/tx/create-position', goodCreate);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.txs.map((t: { to: string }) => t.to)).toEqual([USDT, FACTORY]);
    expect(j.txs[0].value).toBe('0');
    expect(j.txs[0].simulation.ok).toBe(true);
    expect(j.txs[1].simulation).toBeNull();
    expect(j.checks.createSimulated).toBe(false);
  });

  it('create-position simulates createPosition when allowance exists and reports a revert without leaking detail', async () => {
    const { app } = mk({}, { allowance: 1000n * E18, callFails: true });
    const j = await (await post(app, '/v1/tx/create-position', goodCreate)).json();
    expect(j.txs[1].simulation.ok).toBe(false);
    expect(j.txs[1].simulation.error).not.toContain('secret');
  });

  it('rejects bad input: zod, floor bounds, inactive asset, over cap, sum of weights', async () => {
    const { app } = mk();
    expect((await post(app, '/v1/tx/create-position', { ...goodCreate, floorBps: 100 })).status).toBe(400);
    expect((await post(app, '/v1/tx/create-position', { ...goodCreate, amount: '-1' })).status).toBe(400);
    expect((await post(app, '/v1/tx/create-position', { ...goodCreate, weightsBps: [5000] })).status).toBe(400);
    expect((await post(app, '/v1/tx/create-position', { ...goodCreate, assets: [TOKENS.TSLAB.address] })).status).toBe(400);
    expect((await post(app, '/v1/tx/create-position', { ...goodCreate, amount: (20_000n * E18).toString() })).status).toBe(400);
    expect((await post(app, '/v1/tx/create-position', { ...goodCreate, amount: '9'.repeat(40) })).status).toBe(400);
    const r = await app.request('/v1/tx/create-position', { method: 'POST', body: 'not json' });
    expect(r.status).toBe(400);
  });

  it('exit defaults to exitInKind to the owner, all modes target only the vault', async () => {
    const { app } = mk();
    const j = await (await post(app, '/v1/tx/exit', { vault: VAULT })).json();
    expect(j.tx.to).toBe(VAULT);
    expect(j.tx.decoded.function).toBe('exitInKind');
    expect(j.tx.decoded.args.to).toBe(OWNER);
    for (const mode of ['requestClose', 'closeToUSDT']) {
      const k = await (await post(app, '/v1/tx/exit', { vault: VAULT, mode })).json();
      expect(k.tx.to).toBe(VAULT);
      expect(k.tx.decoded.function).toBe(mode);
    }
    expect((await post(app, '/v1/tx/exit', { vault: FAKE })).status).toBe(404);
    expect((await post(app, '/v1/tx/exit', { vault: VAULT, mode: 'sweep' })).status).toBe(400);
  });
});

describe('paid, limits, cors', () => {
  const q = { deposit: (1000n * E18).toString(), floorBps: 9000, termSeconds: 365 * 86400 };
  it('paid quote is 501 without a gate', async () => {
    expect((await post(mk().app, '/v1/paid/quote', q)).status).toBe(501);
  });
  it('paid quote passes the gate response through, then runs the engine once paid', async () => {
    const blocked = mk({ paidGate: async () => new Response('pay', { status: 402 }) });
    expect((await post(blocked.app, '/v1/paid/quote', q)).status).toBe(402);
    const paid = mk({ paidGate: async () => null });
    const r = await post(paid.app, '/v1/paid/quote', q);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.quote.floorValue).toBe((900n * E18).toString());
    expect(j.quote.startingExposure).toBe((400n * E18).toString());
    expect(j.disclosure).toBe(FLOOR_DISCLOSURE);
  });

  it('rate limits: tx 10/min and free 60/min per IP, with Retry-After', async () => {
    let t = 1_791_000_000_000;
    const { app } = mk({ now: () => t, trustProxy: true });
    const h = { 'x-forwarded-for': '9.9.9.9' };
    for (let i = 0; i < 10; i++) expect((await post(app, '/v1/tx/exit', { vault: VAULT }, h)).status).toBe(200);
    const r = await post(app, '/v1/tx/exit', { vault: VAULT }, h);
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBeTruthy();
    expect((await post(app, '/v1/tx/exit', { vault: VAULT }, { 'x-forwarded-for': '8.8.8.8' })).status).toBe(200);
    for (let i = 0; i < 60; i++) await app.request('/healthz', { headers: h });
    expect((await app.request('/healthz', { headers: h })).status).toBe(429);
    t += 61_000;
    expect((await app.request('/healthz', { headers: h })).status).toBe(200);
  });

  it('body over 32 KB is 413', async () => {
    const r = await post(mk().app, '/v1/tx/exit', { vault: VAULT, pad: 'x'.repeat(40_000) });
    expect(r.status).toBe(413);
  });

  it('CORS only for the configured origin', async () => {
    const { app } = mk({ corsOrigins: ['https://floor.example'] });
    const ok = await app.request('/healthz', { headers: { origin: 'https://floor.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://floor.example');
    const bad = await app.request('/healthz', { headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
    const none = await mk().app.request('/healthz', { headers: { origin: 'https://floor.example' } });
    expect(none.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('upstream failures are 502 without leaking the message', async () => {
    const { client } = fakeClient();
    (client as unknown as { readContract: () => never }).readContract = () => { throw new Error('https://rpc.example/?key=SECRET'); };
    const app = createApp({ chainId: 31337, deployment: { chainId: 31337, factory: FACTORY, lens: LENS }, client });
    const r = await app.request('/v1/floor');
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain('SECRET');
  });
});

describe('config', () => {
  it('fails clearly without a deployment', () => {
    expect(() => loadConfig({ FLOOR_CHAIN_ID: '56', BSC_RPC_URL: 'http://x' }, '/nope', () => { throw new Error('ENOENT'); })).toThrow(/No Floor deployment for chain 56/);
  });
  it('reads the contracts deploy json and defaults the local rpc', () => {
    const c = loadConfig({ FLOOR_CHAIN_ID: '31337', WEB_ORIGIN: 'https://a.x, https://b.x' }, '/r', () => JSON.stringify({ FloorFactory: FACTORY, FloorLens: LENS }));
    expect(c.deployment.factory).toBe(FACTORY);
    expect(c.rpcUrl).toBe('http://127.0.0.1:8545');
    expect(c.corsOrigins).toEqual(['https://a.x', 'https://b.x']);
  });
});
