import { readFileSync } from 'node:fs';
import { FLOOR_DISCLOSURE } from '@floor/sdk';

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
  /** Repo root that holds docs/data and research/m_study/results. */
  dataRoot: string;
}

const price = (v: string | undefined, d: string): string => {
  const s = (v ?? d).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s) || Number(s) <= 0) throw new Error(`bad price "${s}": use a positive decimal like 0.01`);
  return s;
};

export function loadConfig(env: Env, repoRoot: string): McpConfig {
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
      quote_protection: price(env.PRICE_QUOTE_PROTECTION_USD, '0.01'),
      backtest: price(env.PRICE_BACKTEST_USD, '0.01'),
      simulate_gap: price(env.PRICE_SIMULATE_GAP_USD, '0.01'),
    },
    http402: env.MCP_HTTP_402 === '1',
    facilitator,
    payTo: env.X402_PAYTO,
    network: env.X402_NETWORK ?? 'eip155:56',
    dataRoot: env.FLOOR_REPO_ROOT ?? repoRoot,
  };
}

/** RSA key for b402: a path to a PKCS#8 file (never an inline env value, never logged). */
export function readKeyFile(path: string): string {
  return readFileSync(path, 'utf8');
}
