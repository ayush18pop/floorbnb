import { describe, expect, it } from "vitest";
import { SERIES, basketReturns, buildChart, simulate } from "@/lib/backtest";
import { EPISODES, TRY_ASSETS, episodeIndexes, runEpisode, runWorst } from "@/lib/try";

describe("episodes", () => {
  it("all fall inside the data (since 2018) and snap to trading days", () => {
    expect(SERIES.dates[0] <= "2018-01-02").toBe(true);
    for (const e of EPISODES) {
      const ix = episodeIndexes(e)!;
      expect(ix).not.toBeNull();
      const [i, j] = ix;
      expect(SERIES.dates[i] >= e.from && SERIES.dates[i] <= e.to).toBe(true);
      expect(SERIES.dates[j] <= e.to && SERIES.dates[j] >= e.from).toBe(true);
      expect(j - i).toBeGreaterThan(15);
    }
  });
  it("does not offer SPCXB and every offered asset has history", () => {
    for (const a of TRY_ASSETS) { expect(a.symbols).not.toContain("SPCXB"); for (const s of a.symbols) expect(s in SERIES.closes).toBe(true); }
  });
  it("episode numbers equal simulate() over the same dates", () => {
    for (const e of EPISODES) for (const a of TRY_ASSETS) for (const f of [80, 90, 95]) {
      const [i, j] = episodeIndexes(e)!;
      const direct = simulate(basketReturns(a.symbols).slice(i, j), f / 100);
      const run = runEpisode(a.symbols, f, e)!;
      expect(run.holdPct).toBeCloseTo((direct.hold - 1) * 100, 9);
      expect(run.vaultPct).toBeCloseTo((direct.vault - 1) * 100, 9);
      expect(run.points[0].date).toBe(SERIES.dates[i]);
      expect(run.points[run.points.length - 1].date).toBe(SERIES.dates[j]);
    }
  });
  it("floor holds in the COVID crash for the basket at 90%", () => {
    const run = runEpisode(TRY_ASSETS[3].symbols, 90, EPISODES[0])!;
    expect(run.vaultPct).toBeGreaterThan(run.holdPct);
  });
});

describe("worst window", () => {
  it("matches buildChart", () => {
    for (const a of TRY_ASSETS) for (const d of [30, 90, 180, 365]) {
      const c = buildChart({ assets: a.symbols, floorPct: 90, termDays: d, mode: "worst" })!;
      const w = runWorst(a.symbols, 90, d)!;
      expect(w.holdPct).toBe(c.holdPct);
      expect(w.vaultPct).toBe(c.vaultPct);
    }
  });
});
