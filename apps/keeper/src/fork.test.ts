/**
 * Fork test: a LOCAL anvil fork of BSC, Floor deployed by scripts/fork-setup.ts, one funded demo vault.
 * Gated by FLOOR_FORK=1. RPC to fork: BSC_FORK_RPC_URL, else the public publicnode endpoint (read-only).
 * No key is stored anywhere: the keeper key is generated per run and exists only in memory and the child env.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient, createTestClient, http, parseAbi, type Address } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { main } from './cli.js';
import { setupFork, BSC, type ForkFixture } from '../scripts/fork-setup.js';

const ON = process.env.FLOOR_FORK === '1';
const PORT = 18545 + Math.floor(Math.random() * 1000);
const RPC = `http://127.0.0.1:${PORT}`;

describe.skipIf(!ON)('keeper on an anvil BSC fork', () => {
  let anvil: ChildProcess;
  let fx: ForkFixture;
  const key = generatePrivateKey(); // per-run, in memory only
  const keeper = privateKeyToAccount(key).address;
  const pub = createPublicClient({ transport: http(RPC) });
  const test = createTestClient({ mode: 'anvil', transport: http(RPC) });
  const env = () => ({ BSC_RPC_URL: RPC, FLOOR_FACTORY: fx.factory, FLOOR_LENS: fx.lens, KEEPER_ADDRESS: keeper });
  const run = async (argv: string[], e: Record<string, string | undefined>) => {
    const lines: string[] = [];
    const code = await main(argv, e, (l) => lines.push(l));
    return { code, events: lines.map((l) => JSON.parse(l) as Record<string, unknown>) };
  };

  beforeAll(async () => {
    anvil = spawn('anvil', ['--fork-url', process.env.BSC_FORK_RPC_URL ?? 'https://bsc-rpc.publicnode.com', '--port', String(PORT), '--chain-id', '56', '--silent', '--retries', '5', '--timeout', '60000'], { stdio: 'ignore' });
    for (let i = 0; i < 90; i++) {
      try { await pub.getChainId(); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
    }
    await test.setBalance({ address: keeper, value: 10n ** 18n });
    fx = await setupFork(RPC, keeper);
  }, 180_000);
  afterAll(() => { anvil?.kill(); });

  it('once --dry-run previews and simulates, and sends nothing', async () => {
    const before = await pub.getTransactionCount({ address: keeper });
    const { code, events } = await run(['once', '--dry-run'], env());
    expect(code).toBe(0);
    const plan = events.find((e) => e.event === 'dry_run_plan')!;
    expect(plan).toMatchObject({ route: 'direct', buy: true, amountIn: (400n * 10n ** 18n).toString() });
    expect(await pub.getTransactionCount({ address: keeper })).toBe(before);
  }, 120_000);

  it('once sends a confirmed Rebalanced through the direct Pancake route, then is idempotent', async () => {
    const { code, events } = await run(['once'], { ...env(), KEEPER_PRIVATE_KEY: key });
    expect(code).toBe(0);
    const done = events.find((e) => e.event === 'rebalanced');
    expect(done).toMatchObject({ route: 'direct', buy: true });
    const nvda = (await pub.readContract({ address: BSC.NVDAB, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [fx.vault as Address] })) as bigint;
    expect(nvda).toBeGreaterThan(0n);
    expect(JSON.stringify(events)).not.toContain(key.slice(2));

    // same block time: the vault is inside minInterval, so nothing is sent
    const again = await run(['once'], { ...env(), KEEPER_PRIVATE_KEY: key });
    expect(again.code).toBe(0);
    expect(again.events.some((e) => e.event === 'rebalanced')).toBe(false);
    expect(await pub.getTransactionCount({ address: keeper })).toBe(1);
  }, 120_000);

  it('skips with a heartbeat when the window is closed (weekend)', async () => {
    const head = Number((await pub.getBlock()).timestamp);
    let day = Math.floor(head / 86400) + 1;
    while ((day + 3) % 7 !== 5) day++; // Saturday
    await test.setNextBlockTimestamp({ timestamp: BigInt(day * 86400 + 16 * 3600) });
    await test.mine({ blocks: 1 });
    const { code, events } = await run(['once', '--dry-run'], env());
    expect(code).toBe(0);
    expect(events.find((e) => e.event === 'heartbeat')).toMatchObject({ windowOpen: false, reason: 'weekend' });
  }, 60_000);
});
