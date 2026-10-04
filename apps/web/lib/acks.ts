import { BRAND } from "./brand";
import { termLabel } from "./floor-config";

/** Risk acknowledgements, true for the chosen term. */
export function acksFor(end: string, days: number) {
  return [
    `I understand the floor can break if prices gap more than about ${BRAND.gapLimitPct}% before the vault can rebalance. The vault does not trade on weekends or outside the trading window.`,
    `I understand that if my value reaches the floor, the vault holds USDT until the term ends on ${end} (${termLabel(days)}) and I miss any recovery in that term.`,
    "I understand I keep only part of the upside. That is the price of the floor.",
  ];
}

/** One-line labels for the same three acknowledgements. The full text (acksFor) stays one click away and is what the user agrees to. */
export function acksShort() {
  return [
    `I understand the floor can break on a gap of about ${BRAND.gapLimitPct}%.`,
    "I understand that at the floor the vault holds USDT until the term ends.",
    "I understand I keep only part of the upside.",
  ];
}
