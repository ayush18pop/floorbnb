import { FLOOR_DISCLOSURE } from '@floor/sdk';
import { DEFAULT_PAID_PRICE_USD } from '@floor/x402';

type Env = Record<string, string | undefined>;

/** Used in every tool output. The first sentence is the SDK constant; the rest repeats CONTEXT.md honesty rules. */
export const DISCLOSURE =
  `${FLOOR_DISCLOSURE} In plain terms: the floor holds unless prices gap more than about 24% (1 over m, with m = 4, before costs). ` +
  'It is not a guarantee. You keep part of the upside; that is the price of the protection. Spot trades only: no perps, no options, no leverage, no borrowing. ' +
  'Backtests use past prices and do not predict the future.';

/** Exact wording from docs/AUDIT.md. Never shorten to "audited". */
export const AUDIT_STATEMENT = 'AI-assisted audit by Pashov Audit Group skills, not a formal audit.';

/** Prices are proposals (the site marks them so). USD, decimal strings. */
export interface Prices {
  quote_protection: string;
  backtest: string;
  simulate_gap: string;
}

/** A custom settlement token (EIP-3009). Replaces the BSC default list (USD1, U). For local and test runs. */
export interface CustomAsset {
  address: string;
  symbol: string;
  decimals: number;
  /** EIP-712 domain name and version of the token. */
  name: string;
  version: string;
}

export interface McpConfig {
  port: number;
  apiBaseUrl: string;
  /** Public URL of this endpoint, used only as the x402 resource URL. */
  publicUrl: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  prices: Prices;
  /** Answer HTTP 402 (instead of HTTP 200 + isError result) when a paid tool is called unpaid. Header is sent either way. */
  http402: boolean;
  facilitator: 'self' | 'b402';
  payTo?: string;
  network: string;
  /** When set (X402_ASSET), the ONLY asset offered. Unset: USD1 and U on BSC. */
  customAsset?: CustomAsset;
  /** RPC the self facilitator reads and settles on. X402_RPC_URL, else BSC_RPC_URL. */
  rpcUrl?: string;
  /** Repo root that holds docs/data and research/m_study/results. */
  dataRoot: string;
}

const price = (v: string | undefined, d: string): string => {
  const s = (v ?? d).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s) || Number(s) <= 0) throw new Error(`bad price "${s}": use a positive decimal like 0.01`);
  return s;
};

const ADDR = /^0x[0-9a-fA-F]{40}$/;

function customAsset(env: Env): CustomAsset | undefined {
  const address = env.X402_ASSET?.trim();
  if (!address) return undefined;
  if (!ADDR.test(address)) throw new Error('X402_ASSET must be a 0x address');
  const decimals = Number(env.X402_ASSET_DECIMALS ?? 18);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('X402_ASSET_DECIMALS must be an integer 0 to 36');
  const name = env.X402_ASSET_NAME?.trim();
  if (!name) throw new Error('X402_ASSET_NAME (the token EIP-712 domain name) is required with X402_ASSET');
  return { address, symbol: env.X402_ASSET_SYMBOL?.trim() || 'TOKEN', decimals, name, version: env.X402_ASSET_VERSION?.trim() || '1' };
}

export function loadConfig(env: Env, repoRoot: string): McpConfig {
  if (env.X402_PAYTO && !ADDR.test(env.X402_PAYTO.trim())) throw new Error('X402_PAYTO must be a 0x address');
  if (env.X402_NETWORK && !/^eip155:\d+$/.test(env.X402_NETWORK)) throw new Error('X402_NETWORK must look like eip155:56');
  const facilitator = (env.X402_FACILITATOR ?? 'self') as string;
  if (facilitator !== 'self' && facilitator !== 'b402') throw new Error('X402_FACILITATOR must be self or b402');
  const port = Number(env.MCP_PORT ?? env.PORT ?? 8788);
  return {
    port,
    apiBaseUrl: (env.API_BASE_URL ?? env.FLOOR_API_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, ''),
    publicUrl: (env.MCP_PUBLIC_URL ?? `http://127.0.0.1:${port}/mcp`).replace(/\/$/, ''),
    allowedOrigins: (env.MCP_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === '1',
    prices: {
      quote_protection: price(env.PRICE_QUOTE_PROTECTION_USD, DEFAULT_PAID_PRICE_USD),
      backtest: price(env.PRICE_BACKTEST_USD, DEFAULT_PAID_PRICE_USD),
      simulate_gap: price(env.PRICE_SIMULATE_GAP_USD, DEFAULT_PAID_PRICE_USD),
    },
    http402: env.MCP_HTTP_402 === '1',
    facilitator,
    payTo: env.X402_PAYTO?.trim() || undefined,
    network: env.X402_NETWORK ?? 'eip155:56',
    customAsset: customAsset(env),
    rpcUrl: env.X402_RPC_URL ?? env.BSC_RPC_URL,
    dataRoot: env.FLOOR_REPO_ROOT ?? repoRoot,
  };
}
