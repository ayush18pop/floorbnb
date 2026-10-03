/** App-level constants. The product name lives in lib/brand.ts only. */
export const BSC_CHAIN_ID = 56;
export const BSCSCAN = "https://bscscan.com";
/** Not deployed yet. A21 sets this from the deploy output. Empty means "example mode only". */
export const LENS_ADDRESS = (process.env.NEXT_PUBLIC_LENS_ADDRESS ?? "") as `0x${string}` | "";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "") as `0x${string}` | "";
export const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";
export const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL ?? "";
export const TRADING_WINDOW_SHORT = "Mon–Fri 15:30–19:30 UTC";
/** CONTRACTS.md section 7: public fallback after 4 h idle (publicDelay default). */
export const PUBLIC_DELAY_HOURS = 4;

export const txUrl = (h: string) => `${BSCSCAN}/tx/${h}`;
export const addrUrl = (a: string) => `${BSCSCAN}/address/${a}`;
