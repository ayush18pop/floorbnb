import { describe, expect, it } from "vitest";
import { boundedFrom } from "./log-range";

describe("boundedFrom", () => {
  it("never goes below the deploy block, never to block 0", () => {
    expect(boundedFrom(1_000_000n, 125_815_981n, 500_000n)).toBe(125_815_981n);
    expect(boundedFrom(125_900_000n, 125_815_981n, 500_000n, 1n)).toBe(125_815_981n);
  });
  it("starts at the estimate when it is inside the window", () => {
    expect(boundedFrom(126_000_000n, 125_815_981n, 500_000n, 125_900_000n)).toBe(125_900_000n);
  });
  it("caps the span to the head", () => {
    expect(boundedFrom(130_000_000n, 125_815_981n, 200_000n)).toBe(129_800_000n);
  });
});
