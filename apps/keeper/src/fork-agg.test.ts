/**
 * Live aggregator route on a LOCAL anvil fork of BSC. Gated by FLOOR_LIVE=1 AND FLOOR_FORK=1 (needs BW3_API_KEY / BW3_API_SECRET in the
 * environment: read-only API calls, no mainnet transaction is ever sent; the swap executes only on the fork).
 * Run: bash -c 'set -a; . <repo>/.env; set +a; FLOOR_LIVE=1 FLOOR_FORK=1 pnpm --filter @floor/keeper test:fork-agg'
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPublicClient, createTestClient, createWalletClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, pad, parseAbi, toHex, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { Bw3Client } from '@floor/bw3';
import { main } from './cli.js';
import { makeChain, makeEoaSender } from './chain.js';
import { loadConfig } from './config.js';
import { runOnce } from './keeper.js';
import { jsonLogger } from './log.js';
import type { AggClient } from './agg.js';
import { setupFork, BSC, type ForkFixture } from '../scripts/fork-setup.js';

const ON = process.env.FLOOR_LIVE === '1' && process.env.FLOOR_FORK === '1' && !!process.env.BW3_API_KEY && !!process.env.BW3_API_SECRET;

describe.skipIf(!ON)('keeper --route agg on an anvil BSC fork (live BW3 quotes)', () => {
  let anvil: ChildProcess;
  let fx: ForkFixture;
  let RPC = '';
  const key = generatePrivateKey();
  const keeper = privateKeyToAccount(key).address;
  const bal = (pub: ReturnType<typeof createPublicClient>, who: Address) =>
    pub.readContract({ address: BSC.NVDAB, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

  /**
   * Public BSC RPCs only serve state for the newest ~1 minute (blocks are ~0.45 s, nodes keep ~128 states). Anvil fetches slots lazily, so a slot
   * first touched later fails with "Archive requests require a personal token". Right after boot we therefore execute one aggregator swap
   * from a throwaway taker (a read-only eth_call on the fork) so the DEX pool slots are cached before the slow Floor deploy.
   */
  const warmForkCache = async (pub: ReturnType<typeof createPublicClient>, sw: { to: string; data: string; approveTarget: string }) => {
    const X = getAddress('0x00000000000000000000000000000000f100d001');
    const t = createTestClient({ mode: 'anvil', transport: http(RPC) });
    const w = createWalletClient({ transport: http(RPC) });
    const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [X, 1n]));
    await t.setStorageAt({ address: BSC.USDT, index: slot, value: pad(toHex(1000n * 10n ** 18n)) });
    await t.impersonateAccount({ address: X });
    await t.setBalance({ address: X, value: 10n ** 18n });
    const h = await w.sendTransaction({ account: X, chain: null, to: BSC.USDT, data: encodeFunctionData({ abi: parseAbi(['function approve(address,uint256)']), functionName: 'approve', args: [sw.approveTarget as Address, 2n ** 255n] }) });
    await pub.waitForTransactionReceipt({ hash: h });
    await pub.call({ account: X, to: sw.to as Address, data: sw.data as Hex }).catch(() => undefined);
  };

  /**
   * No time warp: the vendor calldata carries a ~10 min wall-clock deadline and its oracle adapters fail on a warped clock
   * ("Route: expired", then "Kipseli swap fail: zero out", found 2026-10-03). If the real clock is outside the Floor trading window
   * (Mon-Fri 15:30-19:30 UTC) the test deploys a TEST-ONLY contracts copy whose window is always open (scripts/build-open-window.sh).
   */
  const useContracts = () => {
    const d = new Date();
    const open = d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && d.getUTCHours() * 60 + d.getUTCMinutes() >= 15 * 60 + 30 + 2 && d.getUTCHours() * 60 + d.getUTCMinutes() < 19 * 60 + 20;
    if (open) { delete process.env.FLOOR_CONTRACTS_OUT; console.log('window is open in real time: using the real contracts'); }
    else { process.env.FLOOR_CONTRACTS_OUT = execFileSync('bash', [new URL('../scripts/build-open-window.sh', import.meta.url).pathname], { encoding: 'utf8' }).trim(); console.log('window closed in real time: using the test-only always-open contracts build'); }
  };

  const boot = async (allowAggRouter: boolean) => {
    // quote first (API latency must not eat the fork's short state window), then boot anvil and warm at once
    const X = getAddress('0x00000000000000000000000000000000f100d001');
    const real = new Bw3Client({ apiKey: process.env.BW3_API_KEY!, apiSecret: process.env.BW3_API_SECRET!, retryDelaysMs: [] });
    const amount = (400n * 10n ** 18n).toString();
    const q = await real.quote({ from: BSC.USDT, to: BSC.NVDAB, amount, userWalletAddress: X });
    const pre = await real.swap({ from: BSC.USDT, to: BSC.NVDAB, amount, userWalletAddress: X, quoteId: q[0]!.quoteId, slippagePercent: '1' });
    const port = 19545 + Math.floor(Math.random() * 1000);
    RPC = `http://127.0.0.1:${port}`;
    anvil = spawn('anvil', ['--fork-url', process.env.BSC_FORK_RPC_URL ?? 'https://bsc-mainnet.public.blastapi.io', '--port', String(port), '--chain-id', '56', '--silent', '--retries', '5', '--timeout', '60000'], { stdio: 'ignore' });
    const pub = createPublicClient({ transport: http(RPC) });
    for (let i = 0; i < 90; i++) { try { await pub.getChainId(); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
    await createTestClient({ mode: 'anvil', transport: http(RPC) }).setBalance({ address: keeper, value: 10n ** 18n });
    await warmForkCache(pub, pre);
    useContracts();
    // The vendor's Kipseli adapter reverts ("zero out") when the block clock runs ahead of its oracle, as it does after the ~40 s fork setup
    // on wall-clock timestamps. One second per block keeps the fork clock right next to the fork head (and after the router's activeAt).
    const tc = createTestClient({ mode: 'anvil', transport: http(RPC) });
    await tc.request({ method: 'anvil_setBlockTimestampInterval' as never, params: [1] as never });
    fx = await setupFork(RPC, keeper, { allowAggRouter, warp: false });
    // routers are active from the factory deploy block; pin the clock just after it (about 2 s behind the fork head)
    await tc.request({ method: 'anvil_setTime' as never, params: [fx.factoryDeployedAt + 1] as never });
    await tc.mine({ blocks: 1 });
    return pub;
  };
  const run = async (argv: string[]) => {
    const lines: string[] = [];
    const env = { BSC_RPC_URL: RPC, FLOOR_FACTORY: fx.factory, FLOOR_LENS: fx.lens, KEEPER_ADDRESS: keeper, KEEPER_PRIVATE_KEY: key, BW3_API_KEY: process.env.BW3_API_KEY, BW3_API_SECRET: process.env.BW3_API_SECRET };
    const code = await main(argv, env, (l) => lines.push(l));
    return { code, events: lines.map((l) => JSON.parse(l) as Record<string, unknown>) };
  };
  afterEach(() => { anvil?.kill(); });

  it('quote -> swap calldata -> eth_call -> rebalance(Swap) through the aggregator router', async () => {
    const pub = await boot(true);
    const cfg = loadConfig({ BSC_RPC_URL: RPC, FLOOR_FACTORY: fx.factory, FLOOR_LENS: fx.lens, KEEPER_ADDRESS: keeper }, { route: 'agg' });
    const { chain, client } = makeChain(RPC);
    const real = new Bw3Client({ apiKey: process.env.BW3_API_KEY!, apiSecret: process.env.BW3_API_SECRET!, retryDelaysMs: [] });
    const lines: string[] = [];
    const res = await runOnce(cfg, chain, jsonLogger((l) => lines.push(l)), {
      dryRun: false, route: 'agg', sender: makeEoaSender(RPC, client, key, 60_000), inFlight: new Set(),
      agg: real,
    });
    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    for (const e of events) console.log(JSON.stringify(e).slice(0, 400));
    expect(res.ok).toBe(true);
    expect(events.find((e) => e.event === 'rebalanced')).toMatchObject({ route: 'agg', buy: true });
    expect(await bal(pub, fx.vault as Address)).toBeGreaterThan(0n);
  }, 240_000);

  it('refuses a router that is not on the vault allowlist and falls back to direct', async () => {
    const pub = await boot(false);
    const { code, events } = await run(['once', '--route', 'agg']);
    for (const e of events) console.log(JSON.stringify(e).slice(0, 400));
    expect(code).toBe(0);
    const fb = events.find((e) => e.event === 'agg_fallback_to_direct');
    expect(String(fb?.reason)).toMatch(/not an allowed router/);
    console.log(JSON.stringify(fb));
    expect(events.find((e) => e.event === 'rebalanced')).toMatchObject({ route: 'direct' });
    expect(await bal(pub, fx.vault as Address)).toBeGreaterThan(0n);
  }, 240_000);
});
