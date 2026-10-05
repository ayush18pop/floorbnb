/** App-level constants. The product name lives in lib/brand.ts only. */
export const BSC_CHAIN_ID = 56;
/**
 * LOCAL DEV ONLY (pnpm local:up sets NEXT_PUBLIC_LOCAL_DEV=1): the app talks to an anvil fork of BSC on chain id 31337 and
 * offers a "LOCAL DEV WALLET" connector. Unset in production, where every branch on this flag is compiled out.
 */
export const LOCAL_DEV = process.env.NEXT_PUBLIC_LOCAL_DEV === "1";
export const LOCAL_CHAIN_ID = 31337;
/** The chain the app reads and writes: BSC (56), or the local fork (31337) in local-dev mode. */
export const APP_CHAIN_ID = (LOCAL_DEV ? LOCAL_CHAIN_ID : BSC_CHAIN_ID) as 56 | 31337;
/** Account the local Dev wallet connector acts as (anvil dev account; public). */
export const LOCAL_USER = (process.env.NEXT_PUBLIC_LOCAL_USER ?? "") as `0x${string}` | "";
export const BSCSCAN = "https://bscscan.com";
/**
 * Verified BSC mainnet deployment (packages/contracts/deployments/56.json, block 125815981). Env vars override these,
 * so a missing env var can never silently put the site in example mode.
 */
export const MAINNET_FACTORY = "0x1147d482fD08DDd7F377838efb610B606B3Ad765" as const;
export const MAINNET_LENS = "0x63Ae440B9D309959442eaD3E08cBC3A025C67780" as const;
export const MAINNET_VAULT_IMPL = "0xEA0603a83BCf28a1D57d8534971149eACD874055" as const;
export const DEPLOY_BLOCK = 125815981;
export const LENS_ADDRESS = (process.env.NEXT_PUBLIC_LENS_ADDRESS || MAINNET_LENS) as `0x${string}`;
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || MAINNET_FACTORY) as `0x${string}`;
export const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";
export const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL ?? "";
export const TRADING_WINDOW_SHORT = "Mon–Fri 15:30–19:30 UTC";
/** Mainnet publicDelay is 3600 s of open-market time (packages/contracts/script/params/56.json). */
export const PUBLIC_DELAY_HOURS = 1;

export const txUrl = (h: string) => `${BSCSCAN}/tx/${h}`;
export const addrUrl = (a: string) => `${BSCSCAN}/address/${a}`;
