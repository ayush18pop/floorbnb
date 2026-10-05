/**
 * Single source of truth for the product name and fixed strings.
 * The team lead may rename "Floor" to "Sill": change NAME here and nowhere else.
 * (The wordmark paths in lib/logo.ts spell "Floor" and would need redrawing.)
 */
export const BRAND = {
  name: "Floor",
  tagline: "Your stocks, with a floor.",
  headline: "Set a floor under your stocks.",
  description:
    "Floor protects tokenized stocks on BNB Chain with a line you choose. The vault moves into USDT as prices fall and keeps part of the gain as they rise. Spot trades only.",
  chain: "BNB Chain",
  multiplier: 4,
  gapLimitPct: 24,
  /** Launch facts, from docs/CONTRACTS.md. Change here only. */
  depositAsset: "USDT",
  tradingWindow: "Monday to Friday, 15:30 to 19:30 UTC",
  launchCapPerPosition: 1000,
  launchCapTotal: 5000,
  protocolFee: "none in v1",
  /** Flip to true when the contracts are on BSC mainnet (later: read from @floor/sdk addresses). */
  deployed: false,
  contractsStatus: "Contracts: not yet on mainnet",
  /** Public site URL used for metadata. Override with NEXT_PUBLIC_SITE_URL. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://floor.ayush.works",
  disclosure:
    "A floor that holds unless prices gap more than about 24% before the vault can rebalance. Not a guarantee.",
  backtestCaption: "Backtest on past prices. It does not predict the future.",
} as const;
