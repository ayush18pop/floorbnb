import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeChain, makeEoaSender, loadConfig, runOnce, alert, jsonLogger, parseKey, findKeyLeaks, type Config, type Env, type Sender } from '@floor/keeper';
import { Bw3Client } from '@floor/bw3';
import type { KeeperMode } from './keeperLoop';

export interface KeeperSetup {
  mode: KeeperMode;
  note?: string;
  intervalSec: number;
  tick: () => Promise<unknown>;
  onError: (msg: string) => Promise<void>;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Same secret handling as the standalone keeper CLI: the key comes from KEEPER_PRIVATE_KEY only, is checked for
 * leaks into files, and is redacted from every log line. Differences: no key means dry-run (not a crash), and
 * any setup problem disables the keeper instead of exiting (the web part must stay up).
 */
export function setupKeeper(env: Env, out: (l: string) => void = (l) => console.log(l)): KeeperSetup {
  const disabled = (note: string): KeeperSetup => ({ mode: 'disabled', note, intervalSec: 60, tick: async () => {}, onError: async () => {} });
  let cfg: Config;
  try {
    cfg = loadConfig(env, { deploymentsDir: resolve(repoRoot, 'packages/contracts/deployments'), chainId: Number(env.FLOOR_CHAIN_ID ?? 56) });
  } catch (e) {
    return disabled(`keeper config error: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!cfg.factory) return disabled('no factory configured (set FLOOR_FACTORY and FLOOR_LENS)');
  if (!cfg.rpcUrl) return disabled('no RPC (set BSC_RPC_URL or FLOOR_RPC_URL)');
  if (!Number.isFinite(cfg.intervalSec) || cfg.intervalSec < 5) return disabled('KEEPER_INTERVAL_SEC must be a number >= 5');

  let key: `0x${string}` | undefined;
  if (env.KEEPER_PRIVATE_KEY?.trim()) {
    try { key = parseKey(env.KEEPER_PRIVATE_KEY); } catch (e) { return disabled(e instanceof Error ? e.message : String(e)); }
    const leaks = findKeyLeaks(key, [repoRoot, process.cwd()]);
    if (leaks.length) return disabled(`refusing to run: KEEPER_PRIVATE_KEY value found in ${leaks.length} file(s)`);
  }
  const log = jsonLogger(out, key ? [key] : []);
  const { chain, client } = makeChain(cfg.rpcUrl);
  // One client for the Binance checks (price guard on buys, gas, shadow simulate) whenever keys exist, any route.
  // The agg route stays gated exactly as before: route === 'agg' AND keys.
  const bw3 = cfg.bw3 ? new Bw3Client({ apiKey: cfg.bw3.apiKey, apiSecret: cfg.bw3.apiSecret, chainId: '56' }) : undefined;
  const agg = cfg.route === 'agg' ? bw3 : undefined;
  const dryRun = !key;
  const sender: Sender | undefined = key ? makeEoaSender(cfg.rpcUrl, client, key, cfg.txTimeoutMs) : undefined;
  const base = { dryRun, route: cfg.route, sender, agg, bw3, inFlight: new Set<string>() };
  log.log('info', 'start', { cmd: 'onebox', dryRun, route: cfg.route, aggEnabled: !!agg, bw3Enabled: !!bw3, factory: cfg.factory, signer: sender?.address ?? cfg.keeperAddress ?? null });
  return {
    mode: dryRun ? 'dry-run' : 'live',
    note: dryRun ? 'KEEPER_PRIVATE_KEY is not set: simulating only, nothing is signed or sent' : undefined,
    intervalSec: cfg.intervalSec,
    tick: () => runOnce(cfg, chain, log, base),
    onError: (msg) => alert(cfg, log, msg),
  };
}
