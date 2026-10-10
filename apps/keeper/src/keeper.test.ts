import { generatePrivateKey } from 'viem/accounts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import { AggRejected, buildAggSwap, type AggClient } from './agg.js';
import { main, parseArgs } from './cli.js';
import { SimError, type Chain, type Sender } from './chain.js';
import { loadConfig, type Config } from './config.js';
import { buildDirectCalldata, EXACT_INPUT_SINGLE_SELECTOR } from './direct.js';
import { runOnce } from './keeper.js';
import { jsonLogger, redact } from './log.js';
import { findKeyLeaks, parseKey } from './secret.js';
import { closedReason } from './window.js';

const FACTORY = '0x00000000000000000000000000000000000000f1' as Address;
const LENS = '0x00000000000000000000000000000000000000f2' as Address;
const VAULT = '0x00000000000000000000000000000000000000a1' as Address;
const KEEPER = '0x00000000000000000000000000000000000000b1' as Address;
const USDT = '0x55d398326f99059fF775485246999027B3197955' as Address;
const NVDAB = '0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436' as Address;
const ROUTER = '0x1b81D678ffb9C0263b24A97847620C99d213eB14' as Address;
const TUE_1600 = 1_791_302_400; // any ts; the fake chain decides the window
const WAD = 10n ** 18n;

const cfg: Config = { assets: [], factory: FACTORY, lens: LENS, keeperAddress: KEEPER, route: 'direct', intervalSec: 300, txTimeoutMs: 1000 };

interface World {
  open?: boolean; paused?: boolean; halted?: boolean; holiday?: boolean; now?: number;
  preview?: unknown[] | 'revert'; minTrade?: bigint; dust?: bigint; tolDirect?: number; last?: number; tokenPaused?: boolean; simulate?: () => Promise<bigint>;
  liveMult?: bigint; storedMult?: bigint;
}

function fakeChain(w: World): Chain {
  const preview = w.preview ?? [true, 0, true, USDT, NVDAB, 400n * WAD, 399n * WAD, 396n * WAD];
  return {
    now: async () => w.now ?? TUE_1600,
    scan: async () => [VAULT],
    status: async () => ({ vault: VAULT, V: 1000n * WAD, floor: 900n * WAD, cushion: 100n * WAD, exposure: 0n, target: 400n * WAD, needsRebalance: true, tradingOpen: true }),
    simulate: async () => (w.simulate ? w.simulate() : 300_000n),
    async read<T>(address: Address, _abi: unknown, fn: string): Promise<T> {
      const r: Record<string, unknown> = {
        isTradingOpen: w.open ?? true, paused: w.paused ?? false, halted: w.halted ?? false, nonTradingDay: w.holiday ?? false,
        positionsCount: 1n, v3SwapRouter: ROUTER, assets: ['0x1', 2500, true, 0n, 0n, true], routerOk: [true, ROUTER],
        previewRebalance: preview, minTrade: w.minTrade ?? 20n * WAD, dust: w.dust ?? 5n * WAD, tolDirectBps: w.tolDirect ?? 100, minInterval: 900, lastTradeAt: w.last ?? 0,
        uiMultiplier: w.liveMult ?? WAD, lastMultiplier: w.storedMult ?? WAD,
        pauseManager: '0x00000000000000000000000000000000000000c1', isTokenPaused: w.tokenPaused ?? false,
      };
      if (fn === 'previewRebalance' && preview === 'revert') throw new Error('PriceDeviation');
      void address;
      return r[fn] as T;
    },
  };
}

const logs: string[] = [];
const quiet = () => { logs.length = 0; return jsonLogger((l) => logs.push(l)); };
const sender = (): Sender & { send: ReturnType<typeof vi.fn>; poke: ReturnType<typeof vi.fn> } => ({
  address: KEEPER,
  poke: vi.fn(async () => ({ hash: '0x' + '22'.repeat(32), success: true })) as never,
  send: vi.fn(async () => ({ hash: '0x' + '11'.repeat(32), success: true, blockNumber: 1n, rebalanced: { assetIdx: 0, buy: true, amountIn: 1n, amountOut: 1n, V: 1n, exposureTarget: 1n, router: ROUTER } })) as never,
}) as never;

describe('window reasons (SDK mirror)', () => {
  const ok = { paused: false, halted: false, holiday: false };
  it('names why it is closed', () => {
    const sat = (20000 + 1) * 86400 + 16 * 3600; // day 20001 is Saturday
    const fri = 20000 * 86400 + 16 * 3600;
    expect(closedReason(sat, ok)).toBe('weekend');
    expect(closedReason(fri, ok)).toBeNull();
    expect(closedReason(fri, { ...ok, holiday: true })).toBe('holiday');
    expect(closedReason(fri, { ...ok, halted: true })).toBe('halted');
    expect(closedReason(fri, { ...ok, paused: true })).toBe('paused');
    expect(closedReason(20000 * 86400 + 12 * 3600, ok)).toBe('outside_hours');
    expect(closedReason(20000 * 86400 + 19 * 3600 + 30 * 60, ok)).toBe('outside_hours');
  });
});

describe('direct route', () => {
  it('encodes exactInputSingle with the deadline struct and the vault as recipient', () => {
    const data = buildDirectCalldata({ router: ROUTER, tokenIn: USDT, tokenOut: NVDAB, fee: 2500, vault: VAULT, amountIn: 5n, minOut: 4n, deadline: 99n });
    expect(data.slice(0, 10)).toBe(EXACT_INPUT_SINGLE_SELECTOR);
    expect(data.toLowerCase()).toContain(VAULT.slice(2).toLowerCase());
  });
});

describe('runOnce', () => {
  it('writes a heartbeat and stops when the window is closed', async () => {
    const s = sender();
    const r = await runOnce(cfg, fakeChain({ open: false, now: 20001 * 86400 + 16 * 3600 }), quiet(), { dryRun: false, route: 'direct', sender: s });
    expect(r).toMatchObject({ windowOpen: false, closedReason: 'weekend' });
    expect(s.send).not.toHaveBeenCalled();
    expect(logs.join()).toContain('heartbeat');
  });
  it('reports halted and holiday reasons', async () => {
    const day = 20000 * 86400 + 16 * 3600;
    expect((await runOnce(cfg, fakeChain({ open: false, halted: true, now: day }), quiet(), { dryRun: true, route: 'direct' })).closedReason).toBe('halted');
    expect((await runOnce(cfg, fakeChain({ open: false, holiday: true, now: day }), quiet(), { dryRun: true, route: 'direct' })).closedReason).toBe('holiday');
  });
  it('says "no factory configured" cleanly', async () => {
    const r = await runOnce({ ...cfg, factory: undefined }, fakeChain({}), quiet(), { dryRun: true, route: 'direct' });
    expect(r.ok).toBe(true);
    expect(logs.join()).toContain('no_factory_configured');
  });
  it.each([
    ['no trade needed', { preview: [false, 0, true, USDT, NVDAB, 0n, 0n, 0n] }, 'no_trade_needed'],
    ['below minTrade', { minTrade: 500n * WAD }, 'below_min_trade'],
    ['price check failing', { preview: 'revert' as const }, 'price_check_failed'],
    ['token paused', { tokenPaused: true }, 'token_paused'],
    ['inside minInterval', { last: 20000 * 86400 + 16 * 3600 - 10, now: 20000 * 86400 + 16 * 3600 }, 'too_soon'],
  ] as [string, World, string][])('skips: %s', async (_n, w, reason) => {
    const s = sender();
    const r = await runOnce(cfg, fakeChain(w), quiet(), { dryRun: false, route: 'direct', sender: s });
    expect(r.outcomes[0]).toMatchObject({ status: 'skipped', reason });
    expect(s.send).not.toHaveBeenCalled();
  });
  describe('minTrade unit handling (sell amountIn is bStock wei, minTrade is USDT)', () => {
    // sell of `usd` USDT value: amountIn in bStock wei at an arbitrary price, minOutDirect = usd * (1 - 1%)
    const sell = (usd: bigint, wei: bigint) => [true, 0, false, NVDAB, USDT, wei, (usd * 98n) / 100n, (usd * 99n) / 100n];
    const run = async (w: World) => {
      const s = sender();
      const r = await runOnce(cfg, fakeChain(w), quiet(), { dryRun: false, route: 'direct', sender: s });
      return { r, s };
    };
    it('sends a sell worth 50 USDT whose wei amountIn is tiny (0.2e18 < minTrade 20e18)', async () => {
      const { r, s } = await run({ preview: sell(50n * WAD, WAD / 5n) });
      expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
      expect(s.send).toHaveBeenCalled();
    });
    it('sends a sell worth 50 USDT with a huge wei amountIn', async () => {
      const { r } = await run({ preview: sell(50n * WAD, 5000n * WAD) });
      expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
    });
    it('skips a sell worth 3 USDT even though its wei amountIn is 1000e18', async () => {
      const { r, s } = await run({ preview: sell(3n * WAD, 1000n * WAD) });
      expect(r.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'below_min_trade' });
      expect(s.send).not.toHaveBeenCalled();
    });
    it('sends a residue sell between dust+1 and minTrade (8 USDT, dust 5, minTrade 20)', async () => {
      const { r } = await run({ preview: sell(8n * WAD, WAD / 10n) });
      expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
    });
    it('skips a sell at or under dust (4 USDT, dust 5)', async () => {
      const { r } = await run({ preview: sell(4n * WAD, 1000n * WAD) });
      expect(r.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'below_min_trade' });
    });
    it('buy: compares USDT amountIn with minTrade', async () => {
      expect((await run({ preview: [true, 0, true, USDT, NVDAB, 30n * WAD, 1n, 1n] })).r.outcomes[0]).toMatchObject({ status: 'sent' });
      expect((await run({ preview: [true, 0, true, USDT, NVDAB, 10n * WAD, 1n, 1n] })).r.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'below_min_trade' });
    });
  });
  it('dry-run simulates but never sends', async () => {
    const s = sender();
    const r = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: true, route: 'direct', sender: s });
    expect(r.outcomes[0]).toMatchObject({ status: 'simulated', route: 'direct' });
    expect(s.send).not.toHaveBeenCalled();
  });
  it('sends one swap per vault with the direct calldata, and refuses a vault already in flight', async () => {
    const s = sender();
    const inFlight = new Set<string>();
    const r = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: false, route: 'direct', sender: s, inFlight });
    expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
    const call = s.send.mock.calls[0]!;
    expect(call[1]).toMatchObject({ assetIdx: 0, buy: true, amountIn: 400n * WAD, router: ROUTER });
    expect((call[1] as { data: string }).data.slice(0, 10)).toBe(EXACT_INPUT_SINGLE_SELECTOR);
    inFlight.add(VAULT.toLowerCase());
    const r2 = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: false, route: 'direct', sender: s, inFlight });
    expect(r2.outcomes[0]).toMatchObject({ reason: 'already_pending' });
    expect(s.send).toHaveBeenCalledTimes(1);
  });
  it('a success without a Rebalanced event is a poke no-op, not a failure and not a trade', async () => {
    const s = sender();
    s.send.mockResolvedValueOnce({ hash: ('0x' + '33'.repeat(32)) as never, success: true, blockNumber: 1n, rebalanced: undefined });
    const r = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: false, route: 'direct', sender: s });
    expect(r.ok).toBe(true);
    expect(r.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'poke_noop' });
  });
  it('pokes the factory every cycle when a configured asset multiplier is stale, even with the window closed', async () => {
    const s = sender();
    const c = { ...cfg, assets: [NVDAB] };
    await runOnce(c, fakeChain({ open: false, liveMult: 1_002n * WAD / 1000n }), quiet(), { dryRun: false, route: 'direct', sender: s });
    expect(s.poke).toHaveBeenCalledWith(FACTORY, NVDAB);
    s.poke.mockClear();
    await runOnce(c, fakeChain({ open: false }), quiet(), { dryRun: false, route: 'direct', sender: s });
    expect(s.poke).not.toHaveBeenCalled(); // unchanged multiplier: no transaction
    await runOnce(c, fakeChain({ open: false, liveMult: 2n * WAD }), quiet(), { dryRun: true, route: 'direct', sender: s });
    expect(s.poke).not.toHaveBeenCalled(); // dry run never sends
  });
  it('a simulation revert skips the vault; expected TooSoon does not raise an alert', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok'));
    const c = { ...cfg, alertWebhook: 'http://localhost:1/hook' };
    const s = sender();
    const r1 = await runOnce(c, fakeChain({ simulate: async () => { throw new SimError('TooSoon()'); } }), quiet(), { dryRun: false, route: 'direct', sender: s, fetchImpl: fetchImpl as never });
    expect(r1.ok).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    const r2 = await runOnce(c, fakeChain({ simulate: async () => { throw new SimError('MinOutNotMet(1,2)'); } }), quiet(), { dryRun: false, route: 'direct', sender: s, fetchImpl: fetchImpl as never });
    expect(r2.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(s.send).not.toHaveBeenCalled();
  });
  it('--route agg without BW3 keys falls back to direct', async () => {
    const r = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: true, route: 'agg' });
    expect(r.outcomes[0]).toMatchObject({ route: 'direct' });
    expect(logs.join()).toContain('agg_disabled');
  });
  it('--route agg with a good quote uses the aggregator router; a rejected one falls back', async () => {
    const good: AggClient = {
      quote: async () => [{ quoteId: 'q', toTokenAmount: (410n * WAD).toString(), executionMode: 'SWAP' }],
      swap: async () => ({ to: ROUTER, data: '0xdeadbeef', minReceiveAmount: (400n * WAD).toString(), approveTarget: ROUTER, executionMode: 'SWAP' }),
    };
    const r = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: true, route: 'agg', agg: good });
    expect(r.outcomes[0]).toMatchObject({ route: 'agg' });
    const rfq: AggClient = { ...good, quote: async () => [{ quoteId: 'q', toTokenAmount: (410n * WAD).toString(), executionMode: 'RFQ' }] };
    const r2 = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: true, route: 'agg', agg: rfq });
    expect(r2.outcomes[0]).toMatchObject({ route: 'direct' });
  });
});

describe('aggregator validation', () => {
  const input = (ok = true, approve = ROUTER) => ({
    vault: VAULT, tokenIn: USDT, tokenOut: NVDAB, amountIn: 400n * WAD, minOutAgg: 399n * WAD,
    routerOk: async () => ({ ok, approveTarget: approve }),
  });
  const base: AggClient = {
    quote: async () => [{ quoteId: 'q', toTokenAmount: (405n * WAD).toString() }],
    swap: async () => ({ to: ROUTER, data: '0x01', minReceiveAmount: (399n * WAD).toString(), approveTarget: ROUTER, executionMode: 'SWAP' }),
  };
  it('accepts a valid route', async () => { expect((await buildAggSwap(base, input())).router).toBe(ROUTER); });
  it('rejects a quote under minOutAgg', async () => {
    await expect(buildAggSwap({ ...base, quote: async () => [{ quoteId: 'q', toTokenAmount: (398n * WAD).toString() }] }, input())).rejects.toBeInstanceOf(AggRejected);
  });
  it('rejects a router that the factory does not allow, a different approveTarget, RFQ, and a low minReceive', async () => {
    await expect(buildAggSwap(base, input(false))).rejects.toThrow(/not an allowed router/);
    await expect(buildAggSwap(base, input(true, KEEPER))).rejects.toThrow(/approveTarget/);
    await expect(buildAggSwap({ ...base, swap: async () => ({ ...(await base.swap({} as never)), executionMode: 'RFQ' }) }, input())).rejects.toThrow(/RFQ/);
    await expect(buildAggSwap({ ...base, swap: async () => ({ ...(await base.swap({} as never)), minReceiveAmount: '1' }) }, input())).rejects.toThrow(/minReceiveAmount/);
  });
});

describe('aggregator route hardening', () => {
  const goodAgg = (): AggClient & { quote: ReturnType<typeof vi.fn>; swap: ReturnType<typeof vi.fn> } => ({
    quote: vi.fn(async () => [{ quoteId: 'q', toTokenAmount: (410n * WAD).toString(), executionMode: 'SWAP' }]),
    swap: vi.fn(async () => ({ to: ROUTER, data: '0xdeadbeef', minReceiveAmount: (400n * WAD).toString(), approveTarget: ROUTER, executionMode: 'SWAP' })),
  }) as never;
  const input = (over: Record<string, unknown> = {}) => ({
    vault: VAULT, buy: true, tokenIn: USDT, tokenOut: NVDAB, amountIn: 400n * WAD, minOutAgg: 399n * WAD,
    routerOk: async () => ({ ok: true, approveTarget: ROUTER }), ...over,
  });
  it('sends amount as the integer wei string', async () => {
    const a = goodAgg();
    await buildAggSwap(a, input());
    expect(a.quote.mock.calls[0]![0].amount).toBe('400000000000000000000');
  });
  it('rejects orders under 5 USD (buy by amountIn, sell by quoted USDT)', async () => {
    await expect(buildAggSwap(goodAgg(), input({ amountIn: 4n * WAD, minOutAgg: 1n }))).rejects.toThrow(/5 USD/);
    const sell = { ...goodAgg(), quote: async () => [{ quoteId: 'q', toTokenAmount: (4n * WAD).toString() }] };
    await expect(buildAggSwap(sell, input({ buy: false, tokenIn: NVDAB, tokenOut: USDT, amountIn: 1n * WAD, minOutAgg: 1n }))).rejects.toThrow(/5 USD/);
  });
  it('re-quotes once when the quoteId expired between quote and swap, not twice', async () => {
    const a = goodAgg();
    a.swap.mockRejectedValueOnce(new Error('quoteId=abc not found or expired'));
    expect((await buildAggSwap(a, input())).router).toBe(ROUTER);
    expect(a.quote).toHaveBeenCalledTimes(2);
    const b = goodAgg();
    b.swap.mockRejectedValue(new Error('quoteId=abc not found or expired'));
    await expect(buildAggSwap(b, input())).rejects.toThrow(/expired/);
    expect(b.quote).toHaveBeenCalledTimes(2);
  });
  it('vendor error or no route falls back to direct', async () => {
    const boom: AggClient = { quote: async () => { throw new Error('No valid quote result from any vendor'); }, swap: goodAgg().swap };
    const r = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: true, route: 'agg', agg: boom });
    expect(r.outcomes[0]).toMatchObject({ route: 'direct' });
    expect(logs.join()).toContain('agg_fallback_to_direct');
  });
  it('a router missing from the factory allowlist is refused and the direct route runs', async () => {
    const chain = fakeChain({});
    const read = chain.read;
    chain.read = (async (a: Address, abi: never, fn: string, args: readonly unknown[] = []) => (fn === 'routerOk' ? [false, ROUTER] : read(a, abi, fn, args))) as never;
    const r = await runOnce(cfg, chain, quiet(), { dryRun: true, route: 'agg', agg: goodAgg() });
    expect(r.outcomes[0]).toMatchObject({ route: 'direct' });
    expect(logs.join()).toContain('not an allowed router');
  });
  it('an agg simulation revert falls back to the direct route and re-simulates', async () => {
    const chain = fakeChain({});
    chain.simulate = async (_v, sw) => { if (sw.data === '0xdeadbeef') throw new SimError('SwapFailed'); return 1n; };
    const s = sender();
    const r = await runOnce(cfg, chain, quiet(), { dryRun: false, route: 'agg', agg: goodAgg(), sender: s });
    expect(r.outcomes[0]).toMatchObject({ status: 'sent', route: 'direct' });
    expect(logs.join()).toContain('agg_sim_failed_fallback_to_direct');
  });
  it('re-quotes and re-simulates when the calldata is older than the TTL budget', async () => {
    const a = goodAgg();
    const s = sender();
    const r = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: false, route: 'agg', agg: a, sender: s, aggMaxAgeMs: -1 });
    expect(r.outcomes[0]).toMatchObject({ status: 'sent', route: 'agg' });
    expect(a.quote).toHaveBeenCalledTimes(2);
    expect(logs.join()).toContain('agg_requoted');
  });
});

describe('secrets', () => {
  it('parseKey validates the shape and never echoes the value', () => {
    const k = generatePrivateKey();
    expect(parseKey(k)).toBe(k);
    expect(() => parseKey(undefined)).toThrow(/not set/);
    try { parseKey('0x1234' + k.slice(6, 20)); } catch (e) { expect(String(e)).not.toContain(k.slice(6, 20)); }
  });
  it('redacts the key (with and without 0x) from log lines and drops key-named fields', () => {
    const k = generatePrivateKey();
    expect(redact(`a ${k} b ${k.slice(2)}`, [k])).toBe('a [REDACTED] b [REDACTED]');
    const out: string[] = [];
    jsonLogger((l) => out.push(l), [k]).log('info', 'x', { msg: `key=${k}`, privateKey: k });
    expect(out[0]).not.toContain(k.slice(2));
    expect(out[0]).not.toContain('privateKey');
  });
  it('findKeyLeaks finds a file holding the key and nothing else', () => {
    const k = generatePrivateKey();
    const d = mkdtempSync(join(tmpdir(), 'keeper-leak-'));
    writeFileSync(join(d, 'clean.txt'), 'nothing here');
    expect(findKeyLeaks(k, [d])).toEqual([]);
    writeFileSync(join(d, 'bad.env'), `KEEPER_PRIVATE_KEY=${k}\n`);
    expect(findKeyLeaks(k, [d])).toEqual([join(d, 'bad.env')]);
  });
  it('the CLI refuses to start when the key is in the log file', async () => {
    const k = generatePrivateKey();
    const d = mkdtempSync(join(tmpdir(), 'keeper-leak-'));
    const log = join(d, 'keeper.log');
    writeFileSync(log, `oops ${k}\n`);
    const lines: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(['once', '--log-file', log], { KEEPER_PRIVATE_KEY: k }, (l) => lines.push(l));
    const printed = err.mock.calls.flat().join(' ');
    err.mockRestore();
    expect(code).toBe(3);
    expect(printed).toContain('refusing to start');
    expect(printed).not.toContain(k.slice(2));
  }, 60_000); // walks the whole repo for the key (slow in a worktree with many files)
  it('run mode without a key exits 2; dry-run needs no key', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['run'], {}, () => {})).toBe(2);
    err.mockRestore();
    const lines: string[] = [];
    // packages/contracts/deployments/56.json supplies a factory, so with no RPC configured the dry-run stops at no_rpc (exit 2);
    // with no deployment it stops at no_factory_configured (exit 0). Either way it never asks for a key.
    const code = await main(['once', '--dry-run'], { FLOOR_FACTORY: undefined }, (l) => lines.push(l));
    expect([0, 2]).toContain(code);
    expect(lines.join().includes('no_factory_configured') || lines.join().includes('no_rpc')).toBe(true);
  });
});

describe('config and args', () => {
  it('parses flags', () => {
    expect(parseArgs(['once', '--dry-run', '--route', 'agg', '--vault', VAULT])).toMatchObject({ cmd: 'once', dryRun: true, route: 'agg', vault: VAULT });
    expect(() => parseArgs(['once', '--route', 'x'])).toThrow();
  });
  it('enables aggregator creds only when both BW3 keys are present', () => {
    expect(loadConfig({ BW3_API_KEY: 'a' }).bw3).toBeUndefined();
    expect(loadConfig({ BW3_API_KEY: 'a', BW3_API_SECRET: 'b' }).bw3).toEqual({ apiKey: 'a', apiSecret: 'b' });
  });
});


describe('binance checks (price guard, gas, shadow simulate)', () => {
  const TOKEN = NVDAB.toLowerCase();
  const buyPreview = [true, 0, true, USDT, NVDAB, 400n * WAD, 399n * WAD, 396n * WAD];
  const sellPreview = [true, 0, false, NVDAB, USDT, WAD, 49n * WAD, 49n * WAD];
  const row = (tokenPrice: string, referencePrice: string) => ({ tokenContractAddress: TOKEN, tokenPrice, referencePrice });
  const bw3Fake = (o: { rows?: Record<string, unknown>[]; price?: () => Promise<Record<string, unknown>[]>; gas?: string | (() => Promise<unknown>); sim?: () => Promise<{ status: string; failReason?: string }> } = {}) => ({
    rwaPrice: vi.fn(o.price ?? (async () => o.rows ?? [row('100', '100')])),
    gasPrice: vi.fn(typeof o.gas === 'function' ? o.gas : async () => ({ evmLegacyGasPrice: { mediumGasPrice: o.gas ?? '5000000' } })),
    simulate: vi.fn(o.sim ?? (async () => ({ status: 'SUCCESS' }))),
  });
  const chainWithGas = (w: World, gp = 5_000_000n): Chain => ({ ...fakeChain(w), gasPrice: async () => gp });
  const go = async (w: World, bw3: ReturnType<typeof bw3Fake>, o: { dryRun?: boolean; cfgOver?: Partial<Config>; gp?: bigint } = {}) => {
    const s = sender();
    const r = await runOnce({ ...cfg, ...o.cfgOver }, chainWithGas(w, o.gp), quiet(), { dryRun: o.dryRun ?? false, route: 'direct', sender: s, bw3: bw3 as never });
    return { r, s };
  };

  it('skips a buy when the token trades more than the threshold from the reference', async () => {
    const b = bw3Fake({ rows: [row('110', '100')] }); // 1000 bps
    const { r, s } = await go({ preview: buyPreview }, b);
    expect(r.outcomes[0]).toMatchObject({ status: 'skipped' });
    expect(r.outcomes[0]!.reason).toContain('binance price guard: token trades 1000 bps from reference');
    expect(s.send).not.toHaveBeenCalled();
  });
  it('sends a buy at or under the threshold', async () => {
    const { r } = await go({ preview: buyPreview }, bw3Fake({ rows: [row('105', '100')] })); // exactly 500 bps
    expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
  });
  it('never skips a sell, even at a huge deviation, and logs it', async () => {
    const b = bw3Fake({ rows: [row('300', '100')] });
    const { r, s } = await go({ preview: sellPreview }, b);
    expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
    expect(s.send).toHaveBeenCalled();
    expect(logs.join()).toContain('bw3_price_check');
    expect(logs.join()).toContain('"deviationBps":20000');
  });
  it('fails open on a throw, a missing row and a zero price, and logs bw3_price_unavailable', async () => {
    for (const b of [
      bw3Fake({ price: async () => { throw new Error('boom'); } }),
      bw3Fake({ rows: [] }),
      bw3Fake({ rows: [row('0', '100')] }),
      bw3Fake({ rows: [row('100', '0')] }),
    ]) {
      const { r } = await go({ preview: buyPreview }, b);
      expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
      expect(logs.join()).toContain('bw3_price_unavailable');
    }
  });
  it('threshold 0 disables the guard and does not even call rwaPrice', async () => {
    const b = bw3Fake({ rows: [row('300', '100')] });
    const { r } = await go({ preview: buyPreview }, b, { cfgOver: { bw3Guard: { priceGuardBps: 0, gas: true, shadowSim: true } } });
    expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
    expect(b.rwaPrice).not.toHaveBeenCalled();
  });
  it('batches rwaPrice once per run', async () => {
    const b = bw3Fake();
    await go({ preview: buyPreview }, b);
    expect(b.rwaPrice).toHaveBeenCalledTimes(1);
  });

  it('uses the Binance gas price when it is sane', async () => {
    const b = bw3Fake({ gas: '6000000' });
    const { s } = await go({ preview: buyPreview }, b, { gp: 5_000_000n });
    expect(s.send.mock.calls[0]![3]).toBe(6_000_000n);
    expect(logs.join()).toContain('"source":"binance"');
  });
  it('uses the RPC price when the Binance value is insane (too high, too low, zero, unparsable) or errors', async () => {
    for (const g of ['16000000', '2000000', '0', 'abc', async () => { throw new Error('down'); }]) {
      const { s, r } = await go({ preview: buyPreview }, bw3Fake({ gas: g as never }), { gp: 5_000_000n });
      expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
      expect(s.send.mock.calls[0]).toHaveLength(3); // no gasPrice override, node default
      expect(logs.join()).toContain('"source":"rpc"');
    }
  });
  it('does not call gasPrice in dry-run, nor when KEEPER_BW3_GAS is off', async () => {
    const b = bw3Fake();
    await go({ preview: buyPreview }, b, { dryRun: true });
    expect(b.gasPrice).not.toHaveBeenCalled();
    await go({ preview: buyPreview }, b, { cfgOver: { bw3Guard: { priceGuardBps: 500, gas: false, shadowSim: true } } });
    expect(b.gasPrice).not.toHaveBeenCalled();
  });

  it('shadow simulate is logged and never changes the outcome, even when it fails or throws', async () => {
    const ok = bw3Fake();
    expect((await go({ preview: buyPreview }, ok)).r.outcomes[0]).toMatchObject({ status: 'sent' });
    expect(ok.simulate).toHaveBeenCalledTimes(1);
    expect((ok.simulate.mock.calls[0] as unknown[])[0]).toMatchObject({ from: KEEPER, to: VAULT });
    expect(logs.join()).toContain('"result":"ok"');
    const failed = bw3Fake({ sim: async () => ({ status: 'FAILED', failReason: 'execution reverted' }) });
    expect((await go({ preview: buyPreview }, failed)).r.outcomes[0]).toMatchObject({ status: 'sent' });
    expect(logs.join()).toContain('fail execution reverted');
    const thrown = bw3Fake({ sim: async () => { throw new Error('timeout'); } });
    const t = await go({ preview: buyPreview }, thrown);
    expect(t.r.outcomes[0]).toMatchObject({ status: 'sent' });
    expect(t.r.ok).toBe(true);
    expect(logs.join()).toContain('fail timeout');
  });
  it('shadow simulate is skipped when off, and never runs after a failed eth_call simulate', async () => {
    const b = bw3Fake();
    await go({ preview: buyPreview }, b, { cfgOver: { bw3Guard: { priceGuardBps: 500, gas: true, shadowSim: false } } });
    expect(b.simulate).not.toHaveBeenCalled();
    await go({ preview: buyPreview, simulate: async () => { throw new SimError('TooSoon()'); } }, b);
    expect(b.simulate).not.toHaveBeenCalled();
  });
  it('without a bw3 client nothing changes', async () => {
    const s = sender();
    const r = await runOnce(cfg, fakeChain({}), quiet(), { dryRun: false, route: 'direct', sender: s });
    expect(r.outcomes[0]).toMatchObject({ status: 'sent' });
    expect(s.send.mock.calls[0]).toHaveLength(3);
  });
});

describe('binance config', () => {
  it('defaults: guard 500 bps, gas on, shadow sim on', () => {
    expect(loadConfig({}).bw3Guard).toEqual({ priceGuardBps: 500, gas: true, shadowSim: true });
  });
  it('parses overrides', () => {
    expect(loadConfig({ KEEPER_BW3_PRICE_GUARD_BPS: '0', KEEPER_BW3_GAS: '0', KEEPER_BW3_SHADOW_SIM: '0' }).bw3Guard).toEqual({ priceGuardBps: 0, gas: false, shadowSim: false });
    expect(loadConfig({ KEEPER_BW3_PRICE_GUARD_BPS: '250' }).bw3Guard?.priceGuardBps).toBe(250);
  });
  it('rejects invalid values', () => {
    expect(() => loadConfig({ KEEPER_BW3_PRICE_GUARD_BPS: '-1' })).toThrow(/KEEPER_BW3_PRICE_GUARD_BPS/);
    expect(() => loadConfig({ KEEPER_BW3_PRICE_GUARD_BPS: '5.5' })).toThrow();
    expect(() => loadConfig({ KEEPER_BW3_GAS: 'yes' })).toThrow(/KEEPER_BW3_GAS/);
    expect(() => loadConfig({ KEEPER_BW3_SHADOW_SIM: '2' })).toThrow(/KEEPER_BW3_SHADOW_SIM/);
  });
});
