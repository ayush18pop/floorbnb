import { describe, expect, it } from "vitest";
import { quoteProtection, MAX_FLOOR_BPS } from "@floor/sdk";
import { DEFAULT_LIMITS, checkCreate, minAcceptedDeposit, maxTermDaysByHorizon, minDepositClosedForm, maxFloorFor, minDepositFor, tradeProblem } from "./create-validation";
import { equalWeights } from "@/lib/builder-params";

const E = 10n ** 18n;
const usd = (n: number) => BigInt(Math.round(n * 100)) * 10n ** 16n;
const L = DEFAULT_LIMITS;
const base = { floorBps: 9000, termSeconds: 365 * 86400, weightsBps: [10_000], limits: L };

describe("checkCreate", () => {
  it("accepts a normal position", () => { expect(checkCreate({ ...base, amount: 500n * E }).ok).toBe(true); });
  it("90% floor, one stock: 40% starts in stock, minimum deposit is 50 USDT", () => {
    expect(tradeProblem(usd(49), 9000, [10_000], L)).toBe("small");
    expect(tradeProblem(usd(50), 9000, [10_000], L)).toBeNull();
    expect(minDepositFor(9000, [10_000], L, 1000n * E)).toBe(usd(50));
  });
  it("small deposit gets the exact fix (raise deposit, lower floor)", () => {
    const r = checkCreate({ ...base, amount: usd(30) });
    expect(r.ok).toBe(false);
    expect(r.issues[0].message).toMatch(/raise the deposit to at least 50 USDT/);
    expect(r.issues[0].message).toMatch(/lower the floor to 83%/);
    expect(r.issues[0].message).toMatch(/20 USDT minimum trade/);
  });
  it("the suggested fixes pass", () => {
    expect(tradeProblem(usd(50), 9000, [10_000], L)).toBeNull();
    expect(tradeProblem(usd(30), 8400 /* 4*16%=64% of 30 = 19.2 */, [10_000], L)).toBe("small");
    const f = maxFloorFor(usd(30), 89, [10_000], L)!; expect(f).toBe(83); expect(tradeProblem(usd(30), f * 100, [10_000], L)).toBeNull();
  });
  it("more stocks need more deposit", () => {
    const need1 = minDepositFor(9000, equalWeights(1), L, 1000n * E)!, need3 = minDepositFor(9000, equalWeights(3), L, 1000n * E)!;
    expect(need3 > need1).toBe(true);
    expect(checkCreate({ ...base, weightsBps: equalWeights(3), amount: need3 }).ok).toBe(true);
    expect(checkCreate({ ...base, weightsBps: equalWeights(3), amount: need3 - usd(1) }).ok).toBe(false);
  });
  it("a high floor needs a bigger deposit", () => {
    expect(minDepositFor(9800, [10_000], L, 1000n * E)).toBe(usd(250));
    expect(checkCreate({ ...base, floorBps: 9800, amount: usd(200) }).issues[0].message).toMatch(/at least 250 USDT/);
  });
  it("floor too high for the buy band is its own message", () => {
    const hi = { ...L, buyBandBps: 1200 }; // 4 * (1 - f) must be >= 12% => f <= 97%
    expect(tradeProblem(1000n * E, MAX_FLOOR_BPS, [10_000], hi)).toBe("floor");
    const r = checkCreate({ ...base, floorBps: 9800, amount: 1000n * E, limits: hi });
    expect(r.issues.some((i) => i.code === "floor-high" && /Lower the floor to 97%/.test(i.message))).toBe(true);
  });
  it("term bounds", () => {
    expect(checkCreate({ ...base, amount: 500n * E, termSeconds: 6 * 86400 }).issues[0].code).toBe("term");
    expect(checkCreate({ ...base, amount: 500n * E, termSeconds: 401 * 86400 }).issues[0].code).toBe("term");
    for (const d of [7, 30, 90, 180, 365, 400]) expect(checkCreate({ ...base, amount: 500n * E, termSeconds: d * 86400 }).ok).toBe(true);
  });
  it("floor bounds, launch cap, pool room, pause", () => {
    expect(checkCreate({ ...base, amount: 500n * E, floorBps: 4900 }).issues[0].code).toBe("floor");
    expect(checkCreate({ ...base, amount: 1001n * E }).issues[0].message).toMatch(/Launch limit: 1,000 USDT/);
    expect(checkCreate({ ...base, amount: 600n * E, limits: { ...L, tvlRoom: 400n * E } }).issues[0].code).toBe("tvl");
    expect(checkCreate({ ...base, amount: 500n * E, limits: { ...L, paused: true } }).issues[0].code).toBe("paused");
    expect(checkCreate({ ...base, amount: 0n }).issues[0].code).toBe("amount");
  });
  it("reads minTrade from the limits, not a constant", () => {
    const l = { ...L, minTrade: 5n * E };
    expect(checkCreate({ ...base, amount: usd(15), limits: l }).ok).toBe(true);
    expect(checkCreate({ ...base, amount: usd(15) }).ok).toBe(false);
  });
});

describe("quote with several terms", () => {
  it("floor and split do not depend on the term; the term end does", () => {
    const now = 1_800_000_000;
    const qs = [7, 30, 90, 180, 365].map((d) => quoteProtection({ deposit: 500n * E, floorBps: 9000, termSeconds: d * 86400, now }));
    expect(new Set(qs.map((q) => q.floorValue)).size).toBe(1);
    expect(qs.map((q) => q.termEnd)).toEqual([7, 30, 90, 180, 365].map((d) => now + d * 86400));
    expect(qs[0].startingExposureBps).toBe(4000);
  });
  it("rejects terms outside the contract bounds", () => {
    expect(() => quoteProtection({ deposit: 500n * E, floorBps: 9000, termSeconds: 3 * 86400 })).toThrow();
  });
});

describe("report rule: deposit x min(1, 4(1-floor)) x smallest weight >= minTrade", () => {
  it("closed form equals the contract mirror", () => {
    for (const f of [8000, 8500, 9000, 9500, 9800]) for (const w of [[10_000], equalWeights(2), equalWeights(3), [5000, 3000, 2000]]) {
      const d = minDepositClosedForm(f, w, L.minTrade);
      expect(tradeProblem(d, f, w, L)).toBeNull();
      expect(tradeProblem(d - 10n ** 16n * 2n, f, w, L)).not.toBeNull();
    }
    expect(minDepositClosedForm(9000, [10_000], L.minTrade)).toBe(usd(50));
  });
});

describe("holiday table horizon (2028-12-31, 14 day buffer)", () => {
  const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  it("a 365 day term is accepted until 2027-12-18 (2028 is a leap year) and refused after", () => {
    expect(checkCreate({ ...base, amount: 500n * E, nowSec: at("2027-12-18T12:00:00Z") }).ok).toBe(true);
    const r = checkCreate({ ...base, amount: 500n * E, nowSec: at("2027-12-19T12:00:00Z") });
    expect(r.ok).toBe(false); expect(r.issues[0].code).toBe("term-horizon");
    expect(r.issues[0].message).toMatch(/Term too long for the current holiday table; choose a shorter term/);
  });
  it("shorter terms still work then, and the message names the longest term", () => {
    const now = at("2028-03-01T12:00:00Z");
    expect(checkCreate({ ...base, amount: 500n * E, termSeconds: 90 * 86400, nowSec: now }).ok).toBe(true);
    const max = maxTermDaysByHorizon(now);
    expect(checkCreate({ ...base, amount: 500n * E, termSeconds: (max + 1) * 86400, nowSec: now }).ok).toBe(false);
    expect(checkCreate({ ...base, amount: 500n * E, termSeconds: max * 86400, nowSec: now }).ok).toBe(true);
  });
});

describe("one source for the minimum deposit", () => {
  const E18 = 10n ** 18n;
  it("hint and message agree for the chain minTrade (6 USDT) and the default (20)", () => {
    for (const minTrade of [6n * E18, 20n * E18]) {
      const l = { ...DEFAULT_LIMITS, minTrade };
      const min = minAcceptedDeposit(9000, [10_000], l)!;
      const below = min - 10n ** 16n;
      expect(checkCreate({ amount: min, floorBps: 9000, termSeconds: 30 * 86400, weightsBps: [10_000], limits: l, nowSec: 1_790_000_000 }).ok).toBe(true);
      const r = checkCreate({ amount: below, floorBps: 9000, termSeconds: 30 * 86400, weightsBps: [10_000], limits: l, nowSec: 1_790_000_000 });
      expect(r.ok).toBe(false);
      expect(r.issues[0].message).toContain(`${minTrade / E18} USDT minimum trade`);
    }
    expect(minAcceptedDeposit(9000, [10_000], { ...DEFAULT_LIMITS, minTrade: 6n * E18 })).toBeLessThan(minAcceptedDeposit(9000, [10_000], DEFAULT_LIMITS)!);
  });
  it("uses the chain's holiday horizon when given, else the constant", () => {
    const now = 1_790_000_000, day = Math.floor(now / 86400);
    const base = { amount: 100n * E18, floorBps: 9000, termSeconds: 60 * 86400, weightsBps: [10_000], nowSec: now };
    expect(checkCreate({ ...base, limits: { ...DEFAULT_LIMITS, holidayHorizonDay: day + 30 } }).issues.some((i) => i.code === "term-horizon")).toBe(true);
    expect(checkCreate({ ...base, limits: { ...DEFAULT_LIMITS, holidayHorizonDay: day + 400 } }).issues.some((i) => i.code === "term-horizon")).toBe(false);
  });
});
