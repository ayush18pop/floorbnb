import { readFileSync } from 'node:fs';
import { getAddress, type Address } from 'viem';
import { CHAIN_BSC, CHAIN_LOCAL, type Deployment } from '@floor/sdk';

export interface ApiConfig {
  chainId: number;
  rpcUrl: string;
  deployment: Deployment;
  port: number;
  /** Allowed CORS origins. Empty means no CORS headers at all. */
  corsOrigins: string[];
  trustProxy: boolean;
  bw3?: { apiKey: string; apiSecret: string; baseUrl?: string };
}

type Env = Record<string, string | undefined>;

/** Accepts the contracts' deploy JSON ({FloorFactory, FloorLens}) or {factory, lens}. */
export function parseDeploymentJson(raw: string, chainId: number, where: string): Deployment {
  const j = JSON.parse(raw) as Record<string, unknown>;
  const factory = (j.FloorFactory ?? j.factory) as string | undefined;
  const lens = (j.FloorLens ?? j.lens) as string | undefined;
  if (!factory || !lens) throw new Error(`deployment file ${where} has no FloorFactory/FloorLens (or factory/lens)`);
  const vaultImplementation = (j.FloorVault ?? j.vaultImplementation) as string | undefined;
  return {
    chainId: chainId as Deployment['chainId'],
    factory: getAddress(factory),
    lens: getAddress(lens),
    ...(vaultImplementation ? { vaultImplementation: getAddress(vaultImplementation) as Address } : {}),
  };
}

export function loadConfig(env: Env, repoRoot: string, read: (p: string) => string = (p) => readFileSync(p, 'utf8')): ApiConfig {
  const chainId = Number(env.FLOOR_CHAIN_ID ?? CHAIN_BSC);
  if (chainId !== CHAIN_BSC && chainId !== CHAIN_LOCAL) throw new Error(`FLOOR_CHAIN_ID must be ${CHAIN_BSC} or ${CHAIN_LOCAL}`);

  let deployment: Deployment | undefined;
  if (env.FLOOR_FACTORY && env.FLOOR_LENS) {
    deployment = { chainId, factory: getAddress(env.FLOOR_FACTORY), lens: getAddress(env.FLOOR_LENS) };
  } else {
    const file = env.FLOOR_DEPLOYMENT_FILE ?? `${repoRoot}/packages/contracts/deployments/${chainId}.json`;
    try {
      deployment = parseDeploymentJson(read(file), chainId, file);
    } catch (e) {
      throw new Error(
        `No Floor deployment for chain ${chainId}: set FLOOR_FACTORY and FLOOR_LENS, or FLOOR_DEPLOYMENT_FILE, or provide ${file} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }

  const rpcUrl = env.FLOOR_RPC_URL ?? env.BSC_RPC_URL ?? (chainId === CHAIN_LOCAL ? 'http://127.0.0.1:8545' : undefined);
  if (!rpcUrl) throw new Error('Set FLOOR_RPC_URL (or BSC_RPC_URL): no default RPC for chain 56');

  return {
    chainId,
    rpcUrl,
    deployment,
    port: Number(env.PORT ?? env.API_PORT ?? 8787),
    corsOrigins: (env.WEB_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === '1',
    bw3: env.BW3_API_KEY && env.BW3_API_SECRET ? { apiKey: env.BW3_API_KEY, apiSecret: env.BW3_API_SECRET, ...(env.BW3_BASE_URL ? { baseUrl: env.BW3_BASE_URL } : {}) } : undefined,
  };
}
