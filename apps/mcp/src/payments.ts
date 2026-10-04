import { defineChain, type Chain } from 'viem';
import { bsc } from 'viem/chains';
import { MemoryReceiptStore } from '@floor/db/src/x402Receipts';
import {
  B402FacilitatorClient,
  chainIdOf,
  createGate,
  selfFacilitatorFromEnv,
  type FacilitatorClient,
  type PaidAsset,
  type ReceiptStore,
} from '@floor/x402';
import type { McpConfig } from './config';

type Env = Record<string, string | undefined>;

/**
 * Settlement tokens with transferWithAuthorization (EIP-3009). Addresses, names and domains were checked on a BSC fork by A17
 * (ops/progress/A17.md): U and USD1, both 18 decimals, EIP-712 version "1".
 */
export const EIP3009_TOKENS = [
  { symbol: 'USD1', address: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d' as const, name: 'World Liberty Financial USD', version: '1' },
  { symbol: 'U', address: '0xcE24439F2D9C6a2289F741120FE202248B666666' as const, name: 'United Stables', version: '1' },
];

export const PAID_ASSETS: PaidAsset[] = EIP3009_TOKENS.map((t) => ({ address: t.address, symbol: t.symbol, decimals: 18, method: 'eip3009', name: t.name }));

type Tok = { symbol: string; address: `0x${string}`; name: string; version: string; decimals: number };

/** The tokens this server accepts: the one from X402_ASSET if set, else USD1 and U (BSC). */
export function tokensFor(cfg: Pick<McpConfig, 'customAsset'>): Tok[] {
  const c = cfg.customAsset;
  if (c) return [{ symbol: c.symbol, address: c.address as `0x${string}`, name: c.name, version: c.version, decimals: c.decimals }];
  return EIP3009_TOKENS.map((t) => ({ ...t, decimals: 18 }));
}

export function paidAssetsFor(cfg: Pick<McpConfig, 'customAsset'>): PaidAsset[] {
  return tokensFor(cfg).map((t) => ({ address: t.address, symbol: t.symbol, decimals: t.decimals, method: 'eip3009' as const, name: t.name }));
}

/** Chain for the self facilitator: BSC for eip155:56, a minimal chain definition otherwise (the RPC decides what it really is). */
export function chainForNetwork(network: string, rpcUrl?: string): Chain {
  const id = chainIdOf(network);
  if (id === bsc.id) return bsc;
  return defineChain({ id, name: `eip155:${id}`, nativeCurrency: { name: 'Native', symbol: 'NATIVE', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl ?? 'http://127.0.0.1:8545'] } } });
}

export type Gate = ReturnType<typeof createGate>;

export function facilitatorFromEnv(cfg: Pick<McpConfig, 'facilitator' | 'network' | 'customAsset' | 'rpcUrl'>, env: Env): FacilitatorClient {
  if (cfg.facilitator === 'b402') {
    const need = (k: string) => {
      const v = env[k];
      if (!v) throw new Error(`${k} is required when X402_FACILITATOR=b402`);
      return v;
    };
    return new B402FacilitatorClient({
      apiKey: need('BW3_API_KEY'),
      apiSecret: need('BW3_API_SECRET'),
      ...(env.B402_BASE_URL ? { baseUrl: env.B402_BASE_URL } : {}),
    });
  }
  // The gas key comes from the environment only when the human runs the server. It is never logged.
  return selfFacilitatorFromEnv({ ...env, ...(cfg.rpcUrl ? { BSC_RPC_URL: cfg.rpcUrl } : {}) }, chainForNetwork(cfg.network, cfg.rpcUrl), tokensFor(cfg));
}

/** Returns undefined when X402_PAYTO is unset: paid tools then answer "not configured" and never run unpaid. */
export function gateFromConfig(cfg: McpConfig, env: Env, opts: { facilitator?: FacilitatorClient; receipts?: ReceiptStore } = {}): Gate | undefined {
  if (!cfg.payTo) return undefined;
  return createGate({
    facilitator: opts.facilitator ?? facilitatorFromEnv(cfg, env),
    // In-memory receipts reset on restart; the on-chain EIP-3009 nonce still stops a replay.
    receipts: opts.receipts ?? new MemoryReceiptStore(),
    payTo: cfg.payTo,
    network: cfg.network,
    assets: paidAssetsFor(cfg),
  });
}
