import { serve } from '@hono/node-server';
import { createApi } from './api';
import { loadConfig } from './config';
import { createMcpApp } from './http';
import { gateFromConfig } from './payments';

const repoRoot = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
let cfg;
try {
  cfg = loadConfig(process.env, repoRoot);
} catch (e) {
  console.error(`[mcp] config error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
let gate;
try {
  gate = gateFromConfig(cfg, process.env);
} catch (e) {
  console.error(`[mcp] payment setup error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
const app = createMcpApp({ cfg, api: createApi(cfg.apiBaseUrl), gate });
serve({ fetch: app.fetch, port: cfg.port, hostname: process.env.MCP_HOST ?? '127.0.0.1' }, (i) =>
  console.log(`[mcp] POST http://${i.address}:${i.port}/mcp api=${cfg.apiBaseUrl} paid=${gate ? `on (${cfg.facilitator}, payTo ${cfg.payTo})` : 'off (set X402_PAYTO)'}`),
);
