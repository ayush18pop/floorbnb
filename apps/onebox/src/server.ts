import { serve } from '@hono/node-server';
import { createPublicClient, http } from 'viem';
import { Bw3Client } from '@floor/bw3';
import { setDeployment } from '@floor/sdk';
import { createApp, loadConfig as loadApiConfig, ChainKeeperRunStore, paidGateFromEnv, paidPriceFromEnv } from '@floor/api';
import { createApi, createMcpApp, gateFromConfig, loadConfig as loadMcpConfig } from '@floor/mcp';
import { composeApp } from './app';
import { createKeeperLoop } from './keeperLoop';
import { setupKeeper } from './keeperSetup';
import { installShutdown, startKeepAlive } from './lifecycle';

const fail = (what: string, e: unknown): never => {
  console.error(`[onebox] ${what}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
};

// One env for all three parts. Render sets PORT; the API reads PORT too (unused here, we own the listener).
const env: Record<string, string | undefined> = { ...process.env };
const port = Number(env.PORT ?? 8787);
env.PORT = String(port);
env.BSC_RPC_URL ??= env.FLOOR_RPC_URL; // keeper and x402 read BSC_RPC_URL; one RPC value is enough
env.API_BASE_URL ??= `http://127.0.0.1:${port}`; // MCP calls the API inside this process

const repoRoot = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');

// ---- keeper (in-process loop) ----
const ks = setupKeeper(env);
const loop = createKeeperLoop({ tick: ks.tick, intervalSec: ks.intervalSec, mode: ks.mode, note: ks.note, onError: ks.onError, log: (m) => console.error(`[onebox] ${m}`) });
if (ks.mode === 'disabled') console.error(`[onebox] keeper DISABLED: ${ks.note}`);
else if (ks.mode === 'dry-run') console.warn(`[onebox] keeper DRY-RUN: ${ks.note}`);

// ---- API (same wiring as apps/api/src/server.ts; the heartbeat is in memory, no file) ----
let apiCfg: ReturnType<typeof loadApiConfig> | undefined;
try { apiCfg = loadApiConfig(env, repoRoot); } catch (e) { fail('api config error', e); }
const ac = apiCfg!;
setDeployment(ac.deployment);
const client = createPublicClient({ transport: http(ac.rpcUrl) });
const bw3 = ac.bw3 ? new Bw3Client({ ...ac.bw3, chainId: String(56) }) : undefined;
let paidGate: ReturnType<typeof paidGateFromEnv>;
let paidQuotePriceUsd: string | undefined;
try { paidGate = paidGateFromEnv(env); paidQuotePriceUsd = paidPriceFromEnv(env); } catch (e) { fail('api paid gate error', e); }
const runs = env.FLOOR_RUNS_FROM_BLOCK ? new ChainKeeperRunStore(client, ac.deployment.factory, BigInt(env.FLOOR_RUNS_FROM_BLOCK)) : undefined;
const api = createApp({
  chainId: ac.chainId, deployment: ac.deployment, client, bw3, paidGate, paidQuotePriceUsd, runs,
  keeperHeartbeat: async () => loop.state().lastScan,
  corsOrigins: ac.corsOrigins, trustProxy: ac.trustProxy,
});

// ---- MCP ----
let mcpCfg: ReturnType<typeof loadMcpConfig> | undefined;
let gate: ReturnType<typeof gateFromConfig>;
try { mcpCfg = loadMcpConfig(env, repoRoot); } catch (e) { fail('mcp config error', e); }
try { gate = gateFromConfig(mcpCfg!, env); } catch (e) { fail('mcp payment setup error', e); }
const mcp = createMcpApp({ cfg: mcpCfg!, api: createApi(mcpCfg!.apiBaseUrl), gate });

const app = composeApp({ api, mcp, keeper: loop.state });
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (i) => {
  console.log(`[onebox] listening on 0.0.0.0:${i.port} chain ${ac.chainId} factory ${ac.deployment.factory} mcp=/mcp paid=${gate ? 'on' : 'off'} keeper=${ks.mode}`);
  loop.start();
});

const stopKeepAlive = env.RENDER_EXTERNAL_URL ? startKeepAlive(env.RENDER_EXTERNAL_URL) : undefined;
installShutdown({ server, loop, extraStop: stopKeepAlive });
process.on('unhandledRejection', (e) => console.error(`[onebox] unhandledRejection: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`));
