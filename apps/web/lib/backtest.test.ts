import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildChart, simulate, basketReturns, stepsForDays, SERIES } from "./backtest";

const csv = readFileSync(path.join(__dirname, "../data/vault_path_nvda_worst.csv"), "utf8").trim().split("\n").slice(1).map((l) => l.split(","));

describe("regression to the study (NVDA, 90%, 1 year)", () => {
  const c = buildChart({ assets: ["NVDAB"], floorPct: 90, termDays: 365, mode: "worst" })!;
  it("picks the same worst window", () => {
    expect(c.startDate).toBe(csv[0][0]); expect(c.endDate).toBe(csv.at(-1)![0]); expect(c.points).toHaveLength(csv.length);
  });
  it("hold and vault paths match the committed CSV", () => {
    const maxHold = Math.max(...c.points.map((p, i) => Math.abs(p.stock - Number(csv[i][1]))));
    const maxVault = Math.max(...c.points.map((p, i) => Math.abs(p.vault - Number(csv[i][2]))));
    expect(maxHold).toBeLessThan(0.05); expect(maxVault).toBeLessThan(1.0);
    expect(c.holdPct).toBeCloseTo(Number(csv.at(-1)![1]) - 100, 0);
  });
});

describe("floor holds when nothing gaps through it", () => {
  it("a smooth decline never ends below the floor", () => {
    const r = Array.from({ length: 252 }, () => 0.9985);
    for (const f of [0.5, 0.8, 0.9, 0.98]) expect(simulate(r, f).vault).toBeGreaterThanOrEqual(f - 0.002);
  });
  it("across all real windows, the worst 1-year result for a 90% floor stays near the floor", () => {
    const c = buildChart({ assets: ["NVDAB"], floorPct: 90, termDays: 365, mode: "worst" })!;
    expect(c.vaultPct).toBeGreaterThan(-10.5);
  });
});

describe("chart inputs follow the selection", () => {
  it("floor, term and basket change the run and the title", () => {
    const a = buildChart({ assets: ["NVDAB"], floorPct: 80, termDays: 90, mode: "worst" })!;
    const b = buildChart({ assets: ["NVDAB"], floorPct: 95, termDays: 90, mode: "worst" })!;
    const t = buildChart({ assets: ["NVDAB"], floorPct: 80, termDays: 365, mode: "worst" })!;
    const k = buildChart({ assets: ["NVDAB", "QQQB"], floorPct: 80, termDays: 90, mode: "worst" })!;
    expect(a.title).toBe("What a 80% floor did · NVDA · worst 3-month window");
    expect(b.title).toMatch(/95% floor/); expect(t.title).toMatch(/1-year/); expect(k.title).toMatch(/NVDA \+ QQQ/);
    expect(a.points[0].floor).toBe(80); expect(b.points[0].floor).toBe(95);
    expect(a.steps).toBe(stepsForDays(90)); expect(t.steps).toBe(252); expect(a.points.length).toBe(a.steps + 1);
    expect(a.vaultPct).not.toBeCloseTo(b.vaultPct, 3);
    expect(k.holdPct).not.toBeCloseTo(a.holdPct, 3);
  });
  it("worst, median and best windows are ordered by hold return", () => {
    const [w, m, b] = (["worst", "median", "best"] as const).map((mode) => buildChart({ assets: ["NVDAB"], floorPct: 90, termDays: 90, mode })!);
    expect(w.holdPct).toBeLessThanOrEqual(m.holdPct); expect(m.holdPct).toBeLessThanOrEqual(b.holdPct);
  });
  it("assets without history are reported, not invented", () => {
    const c = buildChart({ assets: ["SPCXB", "NVDAB"], floorPct: 90, termDays: 30, mode: "worst" })!;
    expect(c.missing).toEqual(["SPCXB"]); expect(c.symbols).toEqual(["NVDAB"]);
    expect(buildChart({ assets: ["SPCXB"], floorPct: 90, termDays: 30, mode: "worst" })).toBeNull();
  });
  it("upside kept comes from the run", () => {
    const c = buildChart({ assets: ["NVDAB"], floorPct: 90, termDays: 365, mode: "worst" })!;
    expect(c.upsideKept).toBeGreaterThan(0.1); expect(c.upsideKept).toBeLessThan(1);
  });
  it("data sanity", () => { expect(SERIES.dates.length).toBe(basketReturns(["NVDAB"]).length + 1); });
});
