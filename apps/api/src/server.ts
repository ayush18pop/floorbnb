import { serve } from '@hono/node-server';
import { createPublicClient, http } from 'viem';
import { Bw3Client } from '@floor/bw3';
import { setDeployment } from '@floor/sdk';
import { createApp } from './app';
import { ChainKeeperRunStore, readHeartbeat } from './keeperRuns';
import { loadConfig } from './config';
import { paidGateFromEnv } from './paid';

const repoRoot = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
let cfg;
try {
  cfg = loadConfig(process.env, repoRoot);
} catch (e) {
  console.error(`[api] config error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
setDeployment(cfg.deployment);
const client = createPublicClient({ transport: http(cfg.rpcUrl) });
const bw3 = cfg.bw3 ? new Bw3Client({ ...cfg.bw3, chainId: String(56) }) : undefined;
// paidGate: @floor/x402 gate() when X402_PAYTO is set (facilitator: X402_FACILITATOR=self|b402); otherwise /v1/paid/* answer 501.
let paidGate;
try {
  paidGate = paidGateFromEnv(process.env);
} catch (e) {
  console.error(`[api] paid gate error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
// FLOOR_RUNS_FROM_BLOCK: serve the keeper run log from on-chain Rebalanced events (the keeper does not write to an API store yet).
const runsFrom = process.env.FLOOR_RUNS_FROM_BLOCK;
const runs = runsFrom ? new ChainKeeperRunStore(client, cfg.deployment.factory, BigInt(runsFrom)) : undefined;
// FLOOR_KEEPER_HEARTBEAT_FILE: the keeper (KEEPER_HEARTBEAT_FILE, same host) writes {"lastScan": unix seconds} each tick; /healthz serves it.
const hbFile = process.env.FLOOR_KEEPER_HEARTBEAT_FILE;
const keeperHeartbeat = hbFile ? async () => readHeartbeat(hbFile) : undefined;
const app = createApp({ chainId: cfg.chainId, deployment: cfg.deployment, client, bw3, paidGate, runs, keeperHeartbeat, corsOrigins: cfg.corsOrigins, trustProxy: cfg.trustProxy });
serve({ fetch: app.fetch, port: cfg.port }, (i) => console.log(`[api] listening on :${i.port} chain ${cfg.chainId} factory ${cfg.deployment.factory} market=${bw3 ? 'bw3' : 'off'} paid=${paidGate ? 'on' : 'off (501)'}`));
