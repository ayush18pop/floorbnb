import type { Address } from 'viem';

/** The one place the product name lives. */
export const PRODUCT_NAME = 'Floor';

export const CHAIN_BSC = 56;
export const CHAIN_LOCAL = 31337;
export type SupportedChainId = typeof CHAIN_BSC | typeof CHAIN_LOCAL;

export const WAD = 10n ** 18n;
export const BPS = 10_000n;
/** Multiplier m = 4, WAD scaled (CPPIMath.M). */
export const M = 4n * WAD;
/** m as a plain number, for display. */
export const M_PLAIN = 4;

/** Factory bounds (IFloorFactory.createPosition). */
export const MIN_FLOOR_BPS = 5000;
export const MAX_FLOOR_BPS = 9800;
export const MIN_TERM_SECONDS = 7 * 86_400;
export const MAX_TERM_SECONDS = 400 * 86_400;
export const LAUNCH_TERM_SECONDS = 365 * 86_400;
export const MAX_ASSETS = 3;

export const USDT: Address = '0x55d398326f99059fF775485246999027B3197955';

export interface TokenInfo {
  symbol: string;
  address: Address;
  decimals: 18;
  /** Core v1 assets are NVDAB, SPCXB, QQQB. */
  tier: 'core' | 'optional' | 'borderline';
}

/** bStock table from CONTEXT.md. All tokens are 18 decimals. */
export const TOKENS = {
  NVDAB: { symbol: 'NVDAB', address: '0x02fca66c1d1afb4e2a7884261eb00f63598a7436', decimals: 18, tier: 'core' },
  SPCXB: { symbol: 'SPCXB', address: '0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1', decimals: 18, tier: 'core' },
  QQQB: { symbol: 'QQQB', address: '0x205812cdbed920aff76c6580abd681a46d11efc7', decimals: 18, tier: 'core' },
  SPYB: { symbol: 'SPYB', address: '0x7138b48df7d98d7e3cc221bfe7192d0a178182d8', decimals: 18, tier: 'optional' },
  TSLAB: { symbol: 'TSLAB', address: '0x5b1910eaad6450e50f816082aa078c41f10c292f', decimals: 18, tier: 'borderline' },
} as const satisfies Record<string, TokenInfo>;

export type StockSymbol = keyof typeof TOKENS;

export const USDT_INFO = { symbol: 'USDT', address: USDT, decimals: 18 } as const;

export interface PoolInfo {
  token: StockSymbol;
  fee: number;
  pool: Address;
}

/** TWAP pools (deepest, CONTRACTS.md section 2). Measured 2026-10-02; liquidity changes, so check live before use. */
export const POOLS: Record<'NVDAB' | 'SPCXB' | 'QQQB', PoolInfo> = {
  NVDAB: { token: 'NVDAB', fee: 2500, pool: '0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C' },
  SPCXB: { token: 'SPCXB', fee: 2500, pool: '0x977DaFFC095b33872E2741c19568925015C35b4d' },
  QQQB: { token: 'QQQB', fee: 100, pool: '0xe531fcb1F5a195de7608B9F4f9518544C2cdB693' },
};

export const PANCAKE_V3_FACTORY: Address = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
export const PANCAKE_V3_SWAP_ROUTER: Address = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';

/** Look up a token by address (case-insensitive). */
export function tokenByAddress(addr: string): TokenInfo | undefined {
  const a = addr.toLowerCase();
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === a);
}

/** The honest one-line disclosure (CONTEXT.md honesty rule). */
export const FLOOR_DISCLOSURE =
  'The floor holds unless prices gap more than about 24% before the vault can rebalance. Rebalancing runs Monday to Friday, 15:30 to 19:30 UTC.';
