import { describe, expect, it } from "vitest";
import { tradeoffNumbers } from "@/components/app/tradeoff";

describe("tradeoff numbers", () => {
  it("90% floor, 1 year: keep 90 of 100, ~40% of the rise, report rates for the term", () => {
    expect(tradeoffNumbers(90, 365)).toEqual({ keepAtLeast: 90, atStake: 10, upside: 40, startStock: 40, stats: { breach: 0.44, cashLock: 2.85 } });
  });
  it("moving the floor trades protection for upside", () => {
    const lo = tradeoffNumbers(80, 90), hi = tradeoffNumbers(95, 90);
    expect(hi.keepAtLeast).toBeGreaterThan(lo.keepAtLeast); expect(hi.upside).toBeLessThan(lo.upside);
    expect([lo.upside, hi.upside]).toEqual([80, 20]);
  });
  it("term changes the risk readout only", () => {
    expect(tradeoffNumbers(90, 30).stats!.cashLock).toBeLessThan(tradeoffNumbers(90, 365).stats!.cashLock);
    expect(tradeoffNumbers(90, 30).upside).toBe(tradeoffNumbers(90, 365).upside);
    expect(tradeoffNumbers(90, 45).stats).toBeNull();
  });
});
