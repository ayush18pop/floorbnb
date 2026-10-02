/**
 * Single source of truth for the product name and fixed strings.
 * The team lead may rename "Floor" to "Sill": change NAME here and nowhere else.
 * (The logo SVG paths in components/Logo.tsx spell "Floor" and would need redrawing.)
 */
export const BRAND = {
  name: "Floor",
  tagline: "Your stocks, with a floor.",
  headline: "Set the lowest your portfolio can go.",
  description:
    "Floor protects tokenized stocks on BNB Chain with a line you choose. The vault moves into USDT as prices fall and keeps part of the gain as they rise. Spot trades only.",
  chain: "BNB Chain",
  multiplier: 4,
  gapLimitPct: 25,
  /** Public site URL used for metadata. Override with NEXT_PUBLIC_SITE_URL. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  disclosure:
    "A floor that holds unless prices gap more than 25% before the vault can rebalance.",
  backtestCaption: "Backtest on past prices. It does not predict the future.",
} as const;
