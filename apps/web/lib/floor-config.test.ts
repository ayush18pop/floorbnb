import { describe, expect, it } from "vitest";
import { FLOOR_CONFIG, HOLIDAY_HORIZON_DAY, TERM_CONFIG, evidenceFor, floorIsTested, parseFloorPct, parseTermDays, reportStats, termEndText, termIsTested, termLabel, upsideKeptPct } from "./floor-config";
import { MAX_FLOOR_BPS, MIN_FLOOR_BPS, MAX_TERM_SECONDS, MIN_TERM_SECONDS } from "@floor/sdk";

describe("floor config (MSTUDY2 recommendation)", () => {
  it("slider is 80 to 95, tested 80 to 98, inside the contract bounds", () => {
    expect([FLOOR_CONFIG.min, FLOOR_CONFIG.max, FLOOR_CONFIG.step, FLOOR_CONFIG.default]).toEqual([80, 95, 1, 90]);
    expect([FLOOR_CONFIG.testedMin, FLOOR_CONFIG.testedMax]).toEqual([80, 98]);
    expect(FLOOR_CONFIG.min * 100).toBeGreaterThanOrEqual(MIN_FLOOR_BPS); expect(FLOOR_CONFIG.testedMax * 100).toBeLessThanOrEqual(MAX_FLOOR_BPS);
    expect(FLOOR_CONFIG.contractMax * 100).toBe(MAX_FLOOR_BPS);
    expect(TERM_CONFIG.contractMinDays * 86400).toBe(MIN_TERM_SECONDS); expect(TERM_CONFIG.contractMaxDays * 86400).toBe(MAX_TERM_SECONDS);
  });
  it("terms: 1 month, 3 months, 6 months, 1 year; default 1 year; custom 30 to 365; no 1 week", () => {
    expect(TERM_CONFIG.presets.map((p) => p.days)).toEqual([30, 90, 180, 365]);
    expect(TERM_CONFIG.presets.some((p) => p.days === 7)).toBe(false);
    expect([TERM_CONFIG.defaultDays, TERM_CONFIG.minDays, TERM_CONFIG.maxDays]).toEqual([365, 30, 365]);
  });
  it("evidence", () => {
    expect(evidenceFor(90, 365).backtested).toBe(true); expect(evidenceFor(97, 30).backtested).toBe(true);
    for (const [f, d] of [[75, 365], [90, 10], [60, 30]] as const) { const e = evidenceFor(f, d); expect(e.backtested).toBe(false); expect(e.note).toMatch(/Not backtested yet/); expect(e.note).not.toMatch(/guarantee/i); }
    expect([79, 80, 98, 99].map(floorIsTested)).toEqual([false, true, true, false]);
    expect([29, 30, 365, 366].map(termIsTested)).toEqual([false, true, true, false]);
  });
  it("upside kept is 4 x (100 - floor), 38 to 42 at 90 across terms, never above 100", () => {
    expect([80, 85, 90, 95, 98].map(upsideKeptPct)).toEqual([80, 60, 40, 20, 8]);
    expect(upsideKeptPct(70)).toBe(100);
  });
  it("report stats are exactly the published T1 and T4 cells", () => {
    expect(reportStats(90, 365)).toEqual({ breach: 0.44, cashLock: 2.85 });
    expect(reportStats(90, 30)).toEqual({ breach: 0.09, cashLock: 0.17 });
    expect(reportStats(95, 180)).toEqual({ breach: 0.19, cashLock: 1.63 });
    expect(reportStats(87, 365)).toBeNull(); expect(reportStats(90, 45)).toBeNull();
  });
  it("holiday horizon is 2027-12-31", () => { expect(new Date(HOLIDAY_HORIZON_DAY * 86400000).toISOString().slice(0, 10)).toBe("2027-12-31"); });
  it("parses floor and term params with safe fallbacks", () => {
    expect(parseFloorPct("80")).toBe(80); expect(parseFloorPct("95")).toBe(95); expect(parseFloorPct("72")).toBe(90); expect(parseFloorPct("98")).toBe(90);
    expect([parseFloorPct("abc"), parseFloorPct(null), parseFloorPct("0")]).toEqual([90, 90, 90]);
    expect(parseTermDays("30")).toBe(30); expect(parseTermDays("365")).toBe(365); expect(parseTermDays("45")).toBe(45);
    expect([parseTermDays("7"), parseTermDays("29"), parseTermDays("366"), parseTermDays("x"), parseTermDays(null), parseTermDays("")]).toEqual([365, 365, 365, 365, 365, 365]);
  });
  it("labels", () => { expect(termLabel(30)).toBe("1 month"); expect(termLabel(365)).toBe("1 year"); expect(termLabel(45)).toBe("45 days"); });
  it("end-of-term text says what ends and that leaving early is possible", () => {
    const t = termEndText("2027-01-01");
    expect(t).toMatch(/2027-01-01/); expect(t).toMatch(/floor protection ends/); expect(t).toMatch(/Close to USDT/); expect(t).toMatch(/Exit in kind/); expect(t).toMatch(/no longer applies/);
  });
});
