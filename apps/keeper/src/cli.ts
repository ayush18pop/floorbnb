import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAddress, type Address } from 'viem';
import { Bw3Client } from '@floor/bw3';
import { makeChain, makeEoaSender, type Sender } from './chain.js';
import { loadConfig, type Config, type Env, type Route } from './config.js';
import { alert, runOnce } from './keeper.js';
import { writeHeartbeat } from './heartbeat.js';
import { jsonLogger } from './log.js';
import { findKeyLeaks, parseKey } from './secret.js';

const USAGE = `floor keeper
  keeper once [--dry-run] [--vault 0x..] [--route agg|direct] [--rpc URL]
  keeper run  [--vault 0x..] [--route agg|direct] [--rpc URL]
env: BSC_RPC_URL, FLOOR_FACTORY, FLOOR_LENS, KEEPER_ADDRESS (dry-run sender), KEEPER_PRIVATE_KEY (run / once without --dry-run, env only),
     KEEPER_ROUTE, KEEPER_INTERVAL_SEC, BW3_API_KEY + BW3_API_SECRET (enable agg), ALERT_WEBHOOK_URL`;

interface Args { cmd?: string; dryRun: boolean; vault?: Address; route?: Route; rpc?: string; logFile?: string }

export function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: false };
  const rest = [...argv];
  a.cmd = rest.shift();
  while (rest.length) {
    const f = rest.shift()!;
    const val = () => {
      const v = rest.shift();
      if (!v) throw new Error(`${f} needs a value`);
      return v;
    };
    if (f === '--dry-run') a.dryRun = true;
    else if (f === '--vault') { const v = val(); if (!isAddress(v)) throw new Error('--vault is not an address'); a.vault = v; }
    else if (f === '--route') { const v = val(); if (v !== 'agg' && v !== 'direct') throw new Error('--route must be agg or direct'); a.route = v; }
    else if (f === '--rpc') a.rpc = val();
    else if (f === '--log-file') a.logFile = val();
    else throw new Error(`unknown flag ${f}`);
  }
  return a;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export async function main(argv: string[], env: Env = process.env, out: (l: string) => void = (l) => console.log(l)): Promise<number> {
  let args: Args;
  try { args = parseArgs(argv); } catch (e) { console.error(e instanceof Error ? e.message : e); console.error(USAGE); return 2; }
  if (args.cmd !== 'once' && args.cmd !== 'run') { console.error(USAGE); return 2; }

  const cfg: Config = loadConfig(env, { rpc: args.rpc, route: args.route, deploymentsDir: resolve(repoRoot, 'packages/contracts/deployments') });
  const needsKey = args.cmd === 'run' || !args.dryRun;

  // Secret handling: the key comes from the environment only. Refuse to start if it is already in a file or the log file.
  let key: ReturnType<typeof parseKey> | undefined;
  if (needsKey) {
    try { key = parseKey(env.KEEPER_PRIVATE_KEY); } catch (e) { console.error(e instanceof Error ? e.message : e); return 2; }
    const leaks = findKeyLeaks(key, [repoRoot, process.cwd()], args.logFile ? [args.logFile] : []);
    if (leaks.length) {
      console.error(`refusing to start: KEEPER_PRIVATE_KEY value found in ${leaks.length} file(s): ${leaks.join(', ')}`);
      return 3;
    }
  }
  const write = (l: string) => { out(l); if (args.logFile) appendFileSync(args.logFile, l + '\n'); };
  const log = jsonLogger(write, key ? [key] : []);

  if (!cfg.factory) {
    log.log('info', 'no_factory_configured', { hint: 'set FLOOR_FACTORY and FLOOR_LENS, or add packages/contracts/deployments/<chainId>.json' });
    return 0;
  }
  if (!cfg.rpcUrl) { log.log('error', 'no_rpc', { hint: 'set BSC_RPC_URL or pass --rpc' }); return 2; }

  const { chain, client } = makeChain(cfg.rpcUrl);
  const route: Route = cfg.route;
  const agg = route === 'agg' && cfg.bw3 ? new Bw3Client({ apiKey: cfg.bw3.apiKey, apiSecret: cfg.bw3.apiSecret }) : undefined;
  let sender: Sender | undefined;
  if (key && !args.dryRun) sender = makeEoaSender(cfg.rpcUrl, client, key, cfg.txTimeoutMs);
  const base = { dryRun: args.dryRun, vault: args.vault, route, sender, agg, inFlight: new Set<string>() };
  log.log('info', 'start', { cmd: args.cmd, dryRun: args.dryRun, route, aggEnabled: !!agg, factory: cfg.factory, signer: sender?.address ?? cfg.keeperAddress ?? null });

  if (args.cmd === 'once') {
    const r = await runOnce(cfg, chain, log, base);
    log.log('info', 'done', { ok: r.ok, windowOpen: r.windowOpen, outcomes: r.outcomes.length });
    return r.ok ? 0 : 1;
  }

  // run: loop forever; one sender per process, ticks never overlap
  let stop = false;
  process.on('SIGINT', () => { stop = true; });
  process.on('SIGTERM', () => { stop = true; });
  while (!stop) {
    writeHeartbeat(env.KEEPER_HEARTBEAT_FILE);
    try { await runOnce(cfg, chain, log, base); writeHeartbeat(env.KEEPER_HEARTBEAT_FILE); }
    catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
      log.log('error', 'tick_failed', { error: msg });
      await alert(cfg, log, `tick failed: ${msg}`);
    }
    for (let i = 0; i < cfg.intervalSec && !stop; i++) await new Promise((r) => setTimeout(r, 1000));
  }
  return 0;
}
