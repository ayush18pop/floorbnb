import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isAddress, type Address } from 'viem';

export type Route = 'direct' | 'agg';

export interface Config {
  rpcUrl?: string;
  factory?: Address;
  lens?: Address;
  /** public address used as `from` for dry-run simulations (no key needed) */
  keeperAddress?: Address;
  route: Route;
  /** bStock tokens whose multiplier the keeper pokes every cycle (FLOOR_ASSETS, comma separated); tokens seen in vault previews are added */
  assets: Address[];
  bw3?: { apiKey: string; apiSecret: string };
  alertWebhook?: string;
  intervalSec: number;
  txTimeoutMs: number;
}

export type Env = Record<string, string | undefined>;

function addr(env: Env, name: string): Address | undefined {
  const v = env[name]?.trim();
  if (!v) return undefined;
  if (!isAddress(v)) throw new Error(`${name} is not an address`);
  return v;
}

/** Reads names only; never touches KEEPER_PRIVATE_KEY (see secret.ts / cli.ts). */
export function loadConfig(env: Env, overrides: { rpc?: string; route?: Route; deploymentsDir?: string; chainId?: number } = {}): Config {
  let factory = addr(env, 'FLOOR_FACTORY');
  let lens = addr(env, 'FLOOR_LENS');
  if ((!factory || !lens) && overrides.deploymentsDir) {
    const f = resolve(overrides.deploymentsDir, `${overrides.chainId ?? 56}.json`);
    if (existsSync(f)) {
      try {
        const d = JSON.parse(readFileSync(f, 'utf8')) as { factory?: string; FloorFactory?: string; lens?: string; FloorLens?: string };
        const fa = d.factory ?? d.FloorFactory;
        const la = d.lens ?? d.FloorLens;
        if (!factory && fa && isAddress(fa)) factory = fa;
        if (!lens && la && isAddress(la)) lens = la;
      } catch {
        /* ignore a malformed deployments file; the keeper then reports "no factory configured" */
      }
    }
  }
  const route = (overrides.route ?? (env.KEEPER_ROUTE as Route | undefined) ?? 'direct') as Route;
  if (route !== 'direct' && route !== 'agg') throw new Error('route must be direct or agg');
  const key = env.BW3_API_KEY?.trim();
  const secret = env.BW3_API_SECRET?.trim();
  return {
    rpcUrl: overrides.rpc ?? env.BSC_RPC_URL?.trim() ?? env.BSC_FORK_RPC_URL?.trim(),
    factory,
    lens,
    keeperAddress: addr(env, 'KEEPER_ADDRESS'),
    route,
    assets: (env.FLOOR_ASSETS ?? '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
      if (!isAddress(x)) throw new Error('FLOOR_ASSETS contains a non-address');
      return x as Address;
    }),
    bw3: key && secret ? { apiKey: key, apiSecret: secret } : undefined,
    alertWebhook: env.ALERT_WEBHOOK_URL?.trim() || undefined,
    intervalSec: Number(env.KEEPER_INTERVAL_SEC ?? 300),
    txTimeoutMs: 90_000,
  };
}
