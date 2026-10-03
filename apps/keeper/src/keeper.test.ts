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

const cfg: Config = { factory: FACTORY, lens: LENS, keeperAddress: KEEPER, route: 'direct', intervalSec: 300, txTimeoutMs: 1000 };

interface World {
  open?: boolean; paused?: boolean; halted?: boolean; holiday?: boolean; now?: number;
  preview?: unknown[] | 'revert'; minTrade?: bigint; last?: number; tokenPaused?: boolean; simulate?: () => Promise<bigint>;
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
        previewRebalance: preview, minTrade: w.minTrade ?? 20n * WAD, minInterval: 900, lastTradeAt: w.last ?? 0,
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
const sender = (): Sender & { send: ReturnType<typeof vi.fn> } => ({
  address: KEEPER,
  send: vi.fn(async () => ({ hash: '0x' + '11'.repeat(32), success: true, blockNumber: 1n, rebalanced: undefined })) as never,
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
  });
  it('run mode without a key exits 2; dry-run needs no key', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['run'], {}, () => {})).toBe(2);
    err.mockRestore();
    const lines: string[] = [];
    expect(await main(['once', '--dry-run'], { FLOOR_FACTORY: undefined }, (l) => lines.push(l))).toBe(0);
    expect(lines.join()).toContain('no_factory_configured');
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
