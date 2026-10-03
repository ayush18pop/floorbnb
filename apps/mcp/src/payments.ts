import { bsc } from 'viem/chains';
import { MemoryReceiptStore } from '@floor/db/src/x402Receipts';
import {
  B402FacilitatorClient,
  createGate,
  selfFacilitatorFromEnv,
  type FacilitatorClient,
  type PaidAsset,
  type ReceiptStore,
} from '@floor/x402';
import { readKeyFile, type McpConfig } from './config';

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

export type Gate = ReturnType<typeof createGate>;

export function facilitatorFromEnv(cfg: Pick<McpConfig, 'facilitator'>, env: Env): FacilitatorClient {
  if (cfg.facilitator === 'b402') {
    const need = (k: string) => {
      const v = env[k];
      if (!v) throw new Error(`${k} is required when X402_FACILITATOR=b402`);
      return v;
    };
    // b402 is UNTESTED-LIVE (ops/progress/A17.md).
    return new B402FacilitatorClient({
      baseUrl: need('B402_BASE_URL'),
      clientId: need('B402_CLIENT_ID'),
      signAccessToken: need('B402_SIGN_ACCESS_TOKEN'),
      privateKey: readKeyFile(need('B402_RSA_KEY_PATH')),
    });
  }
  // The gas key comes from the environment only when the human runs the server. It is never logged.
  return selfFacilitatorFromEnv(env, bsc, EIP3009_TOKENS);
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
    assets: PAID_ASSETS,
  });
}
