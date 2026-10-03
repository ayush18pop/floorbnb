import { phaseOf, type PositionView } from "@/lib/adapters";

/** State badges. Colour is always paired with a word (BRAND: never colour alone). */
export function PhaseBadges({ p }: { p: PositionView }) {
  const ph = phaseOf(p);
  const main = ph === "active" ? ["Active", "b-pos"] : ph === "cashLock" ? ["Cash locked", "b-neg"] : ph === "closing" ? ["Closing", "b-warn"] : ["Closed", ""];
  return (
    <span className="inline-flex flex-wrap gap-2">
      <span className={`badge ${main[1]}`}>{main[0]}</span>
      {ph !== "closed" && (p.status.tradingOpen ? <span className="badge b-pos">Market open</span> : <span className="badge b-warn">Market closed</span>)}
    </span>
  );
}
