"use client";
import { DetailsDrawer } from "@/components/ui/details-drawer";
import { BRAND } from "@/lib/brand";
import { acksFor } from "@/lib/acks";

/** The backtest caveat, word for word as it was on the builder before the declutter pass. */
export const backtestNote = `Backtest on daily closes of 38 indices, ETFs and large stocks, 1928 to 2026, non-overlapping windows, 6 bps per trade. It is not a forecast. These rates are not a maximum loss: single-stock gap days of -50% to -61% breached every floor, and the floor can break if prices gap more than about ${BRAND.gapLimitPct}% before the vault can rebalance.`;

/** Full risk disclosure. With `term` it includes the three acknowledgements for that term. */
export function RisksBody({ term }: { term?: { end: string; days: number } }) {
  return (
    <>
      <p className="!text-ink">{BRAND.disclosure}</p>
      <p>The vault does not trade on weekends or outside the trading window ({BRAND.tradingWindow}). Holidays can move it.</p>
      <h3>What you accept</h3>
      <ul className="list-disc space-y-2 pl-5">
        {term ? acksFor(term.end, term.days).map((t) => <li key={t}>{t}</li>) : (
          <li>The floor can break if prices gap more than about {BRAND.gapLimitPct}% before the vault can rebalance. If your value reaches the floor, the vault holds USDT until the term ends and you miss any recovery. You keep only part of the upside.</li>
        )}
      </ul>
      <h3>About the backtest</h3>
      <p>{backtestNote}</p>
      <p>{BRAND.backtestCaption}</p>
      <p>Exit in kind is always allowed. {BRAND.name} cannot move your funds: the vault only trades by its own rules.</p>
    </>
  );
}

/** "Risks" text button that opens the full disclosure drawer. */
export function RisksLink({ term, className = "dd-link" }: { term?: { end: string; days: number }; className?: string }) {
  return <DetailsDrawer trigger="Risks" triggerClassName={className} title="Risks and disclosure"><RisksBody term={term} /></DetailsDrawer>;
}
