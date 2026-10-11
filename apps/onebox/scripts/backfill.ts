/**
 * Fill the Postgres log index from FLOOR_RUNS_FROM_BLOCK to head: the factory, then every vault, through the wide-range
 * log RPCs (LOGS_RPC_URL, default DEFAULT_LOGS_RPCS). Read-only on chain, writes only to DATABASE_URL. Safe to re-run
 * (it resumes from each address's cursor).
 *
 *   FLOOR_RPC_URL=... FLOOR_RUNS_FROM_BLOCK=125815981 DATABASE_URL=... pnpm --filter @floor/onebox backfill
 *
 * Nothing sensitive is printed: only counts and block numbers.
 */
import { createPublicClient, http } from 'viem';
import { setDeployment } from '@floor/sdk';
import { chainLogStoreFromEnv } from '@floor/db';
import { chainLogReaderFromEnv, loadConfig } from '@floor/api';

const env: Record<string, string | undefined> = { ...process.env };
env.BSC_RPC_URL ??= env.FLOOR_RPC_URL;
const repoRoot = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const cfg = loadConfig(env, repoRoot);
setDeployment(cfg.deployment);
const from = env.FLOOR_RUNS_FROM_BLOCK;
if (!from) throw new Error('set FLOOR_RUNS_FROM_BLOCK (the factory deploy block)');
const pg = await chainLogStoreFromEnv(env);
if (!pg) throw new Error('set DATABASE_URL');

const client = createPublicClient({ transport: http(cfg.rpcUrl) });
const reader = chainLogReaderFromEnv(client, cfg.deployment.factory, BigInt(from), env, pg.store);
const t0 = Date.now();
const head = await client.getBlockNumber();
console.log(`[backfill] ${from} -> ${head} (${head - BigInt(from)} blocks)`);
await reader.syncAll();
const st = reader.indexerStatus();
if (st.lastError) {
  console.error(`[backfill] failed: ${st.lastError}`);
  await pg.sql.end();
  process.exit(1);
}
const [logs] = await pg.sql<{ n: string }[]>`SELECT count(*) AS n FROM chain_logs`;
const [cur] = await pg.sql<{ n: string; m: string }[]>`SELECT count(*) AS n, min(synced_to_block) AS m FROM index_cursor`;
console.log(`[backfill] done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${logs?.n} log rows, ${cur?.n} addresses, synced to block ${cur?.m}, head lag ${st.headLag}`);
await pg.sql.end();
