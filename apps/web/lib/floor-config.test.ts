import { describe, expect, it } from "vitest";
import { FLOOR_CONFIG, TERM_CONFIG, evidenceFor, floorIsTested, parseFloorPct, parseTermDays, termEndText, termIsTested, termLabel } from "./floor-config";
import { MAX_FLOOR_BPS, MIN_FLOOR_BPS, MAX_TERM_SECONDS, MIN_TERM_SECONDS } from "@floor/sdk";

describe("floor config", () => {
  it("slider range equals the contract bounds", () => {
    expect(FLOOR_CONFIG.min * 100).toBe(MIN_FLOOR_BPS);
    expect(FLOOR_CONFIG.max * 100).toBe(MAX_FLOOR_BPS);
    expect(TERM_CONFIG.minDays * 86400).toBe(MIN_TERM_SECONDS);
    expect(TERM_CONFIG.contractMaxDays * 86400).toBe(MAX_TERM_SECONDS);
    expect(TERM_CONFIG.maxDays).toBeLessThanOrEqual(TERM_CONFIG.contractMaxDays);
  });
  it("defaults are 90% and one year, both backtested", () => {
    expect(FLOOR_CONFIG.default).toBe(90); expect(TERM_CONFIG.defaultDays).toBe(365);
    expect(floorIsTested(90)).toBe(true); expect(termIsTested(365)).toBe(true);
  });
  it("only 80-95 floors and the one-year term are flagged tested", () => {
    expect([79, 80, 95, 96].map(floorIsTested)).toEqual([false, true, true, false]);
    expect(TERM_CONFIG.presets.filter((p) => p.tested).map((p) => p.days)).toEqual([365]);
    expect(TERM_CONFIG.presets.every((p) => p.days >= TERM_CONFIG.minDays && p.days <= TERM_CONFIG.maxDays)).toBe(true);
  });
  it("evidence is honest for untested pairs", () => {
    expect(evidenceFor(90, 365).backtested).toBe(true);
    for (const [f, d] of [[90, 90], [60, 365], [60, 30]] as const) { const e = evidenceFor(f, d); expect(e.backtested).toBe(false); expect(e.note).toMatch(/Not backtested yet/); expect(e.note).not.toMatch(/guarantee/i); }
  });
  it("parses floor and term params with safe fallbacks", () => {
    expect(parseFloorPct("72")).toBe(72); expect(parseFloorPct("98")).toBe(98); expect(parseFloorPct("50")).toBe(50);
    expect([parseFloorPct("49"), parseFloorPct("99"), parseFloorPct("abc"), parseFloorPct(null), parseFloorPct("0")]).toEqual([90, 90, 90, 90, 90]);
    expect(parseTermDays("7")).toBe(7); expect(parseTermDays("365")).toBe(365); expect(parseTermDays("45")).toBe(45);
    expect([parseTermDays("6"), parseTermDays("366"), parseTermDays("x"), parseTermDays(null), parseTermDays("")]).toEqual([365, 365, 365, 365, 365]);
  });
  it("labels", () => { expect(termLabel(7)).toBe("1 week"); expect(termLabel(365)).toBe("1 year"); expect(termLabel(45)).toBe("45 days"); });
  it("end-of-term text says what ends and that leaving early is possible", () => {
    const t = termEndText("2027-01-01");
    expect(t).toMatch(/2027-01-01/); expect(t).toMatch(/floor protection ends/); expect(t).toMatch(/Close to USDT/); expect(t).toMatch(/Exit in kind/); expect(t).toMatch(/no longer applies/);
  });
});
