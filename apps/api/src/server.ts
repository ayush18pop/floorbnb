import { serve } from '@hono/node-server';
import { createPublicClient, http } from 'viem';
import { Bw3Client } from '@floor/bw3';
import { setDeployment } from '@floor/sdk';
import { createApp } from './app';
import { loadConfig } from './config';

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
// paidGate: wired once @floor/x402 (A17) exports gate(); until then /v1/paid/* answer 501.
const app = createApp({ chainId: cfg.chainId, deployment: cfg.deployment, client, bw3, corsOrigins: cfg.corsOrigins, trustProxy: cfg.trustProxy });
serve({ fetch: app.fetch, port: cfg.port }, (i) => console.log(`[api] listening on :${i.port} chain ${cfg.chainId} factory ${cfg.deployment.factory} market=${bw3 ? 'bw3' : 'off'}`));
