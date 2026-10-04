/**
 * Pre-signature check: would FloorFactory.createPosition accept these inputs? Mirrors the contract
 * (createPosition and _checkNotTooSmall) using the SDK's CPPI maths and the chain's defaults, so the user sees
 * the exact fix before a revert at signing. The contract stays the authority; this is advice.
 */
import { HOLIDAY_HORIZON_DAY, UNWIND_BUFFER_SECONDS } from "./floor-config";
import { BPS, cppi, MAX_ASSETS, MAX_FLOOR_BPS, MAX_TERM_SECONDS, MIN_FLOOR_BPS, MIN_TERM_SECONDS } from "@floor/sdk";

/** What the factory enforces, in USDT WAD. From the chain when readable, else the documented defaults. */
export type CreateLimits = {
  /** USDT WAD, defaults.minTrade */
  minTrade: bigint;
  buyBandBps: number;
  /** USDT WAD, factory MIN_DEPOSIT (1 USDT) */
  minDeposit: bigint;
  /** USDT WAD */
  maxDeposit: bigint;
  /** Room left under the total cap, USDT WAD. null if unknown. */
  tvlRoom: bigint | null;
  paused: boolean;
  /** Last day (unix day number) the factory's holiday table covers (factory.holidayHorizonDay). null or absent: use the config constant. */
  holidayHorizonDay?: number | null;
  /** Where the numbers came from. */
  from: "chain" | "default";
};

const E18 = 10n ** 18n;
/** CONTRACTS.md defaults: minTrade 20 USDT, buy band 2%, deposit 1 to 1000 USDT. Used by the mock source. */
export const DEFAULT_LIMITS: CreateLimits = { minTrade: 20n * E18, buyBandBps: 200, minDeposit: E18, maxDeposit: 1000n * E18, tvlRoom: null, paused: false, from: "default" };

export type Issue = { code: "amount" | "min-deposit" | "max-deposit" | "tvl" | "floor" | "floor-high" | "term" | "term-horizon" | "assets" | "paused"; message: string };

export type CreateCheck = { ok: boolean; issues: Issue[] };

const usdt = (w: bigint) => {
  const cents = (w + 10n ** 16n - 1n) / 10n ** 16n; // round UP so the fix always passes
  const s = cents.toString().padStart(3, "0");
  const i = s.slice(0, -2), f = s.slice(-2);
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f === "00" ? "" : "." + f}`;
};

/**
 * The acceptance rule from the MSTUDY2 report (section 6): the smallest basket token's first buy,
 * deposit x min(1, 4 x (1 - floor)) x smallest weight, must be at least minTrade. Closed form, USDT WAD (rounded up to a cent).
 */
export function minDepositClosedForm(floorBps: number, weights: readonly number[], minTrade: bigint): bigint {
  const wmin = BigInt(Math.min(...weights));
  const frac = BigInt(Math.min(10_000, 4 * (10_000 - floorBps))); // bps of the deposit that is bought first
  const den = frac * wmin; // out of 1e8
  const d = (minTrade * 10n ** 8n + den - 1n) / den;
  const cent = 10n ** 16n;
  return ((d + cent - 1n) / cent) * cent;
}

/** Longest term (days) the holiday table allows from `nowSec`, or 0 if none. */
export function maxTermDaysByHorizon(nowSec: number, horizonDay: number = HOLIDAY_HORIZON_DAY): number {
  const secs = (horizonDay + 1) * 86_400 - 1 - nowSec - UNWIND_BUFFER_SECONDS;
  return Math.max(0, Math.floor(secs / 86_400));
}

/**
 * The smallest deposit the factory accepts for this floor and basket (USDT WAD): the larger of the factory minimum and the trade rule.
 * The one number behind both the on-screen hint and the validation message, so they cannot disagree. null if nothing up to the cap passes.
 */
export function minAcceptedDeposit(floorBps: number, weights: readonly number[], l: Pick<CreateLimits, "minTrade" | "buyBandBps" | "minDeposit" | "maxDeposit">): bigint | null {
  const d = minDepositFor(floorBps, weights, l, l.maxDeposit);
  return d === null ? null : d > l.minDeposit ? d : l.minDeposit;
}

/** Same rounding as the messages ("20", "6", "12.5"): for the hint next to the deposit field. */
export const usdtText = (w: bigint): string => usdt(w);

/** First failing reason for one deposit/floor, mirroring _checkNotTooSmall. null if accepted. */
export function tradeProblem(amount: bigint, floorBps: number, weights: readonly number[], l: Pick<CreateLimits, "minTrade" | "buyBandBps">): "small" | "floor" | null {
  const F = cppi.floorFor(amount, floorBps);
  const E = cppi.exposureTarget(cppi.cushion(amount, F), amount);
  for (const w of weights) {
    const t = cppi.assetTarget(E, w);
    if (t < l.minTrade) return "small";
    const band = (BigInt(l.buyBandBps) * BigInt(w)) / BPS;
    if (t * BPS < (band === 0n ? 1n : band) * amount) return "floor";
  }
  return null;
}

/** Smallest deposit (USDT WAD, whole cents) that passes the trade rules at this floor, or null if none up to `cap`. */
export function minDepositFor(floorBps: number, weights: readonly number[], l: Pick<CreateLimits, "minTrade" | "buyBandBps">, cap: bigint): bigint | null {
  const cent = 10n ** 16n;
  const ok = (d: bigint) => tradeProblem(d, floorBps, weights, l) === null;
  if (!ok(cap)) return null;
  let lo = 1n, hi = cap / cent; // search in cents
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (ok(mid * cent)) hi = mid; else lo = mid + 1n;
  }
  // The rule is not strictly monotonic at rounding edges: step up until a clean pass.
  let d = lo * cent;
  while (!ok(d) && d < cap) d += cent;
  return d;
}

/** Highest floor percent (integer) at or below `fromPct` that passes the trade rules for this deposit, or null. */
export function maxFloorFor(amount: bigint, fromPct: number, weights: readonly number[], l: Pick<CreateLimits, "minTrade" | "buyBandBps">): number | null {
  for (let p = Math.min(fromPct, MAX_FLOOR_BPS / 100); p >= MIN_FLOOR_BPS / 100; p--) if (tradeProblem(amount, p * 100, weights, l) === null) return p;
  return null;
}

export function checkCreate(i: { amount: bigint; floorBps: number; termSeconds: number; weightsBps: readonly number[]; limits: CreateLimits; nowSec?: number | null }): CreateCheck {
  const { amount, floorBps, termSeconds, weightsBps, limits: l, nowSec } = i;
  const issues: Issue[] = [];
  if (l.paused) issues.push({ code: "paused", message: "New positions are paused right now. Try again later." });
  if (weightsBps.length < 1 || weightsBps.length > MAX_ASSETS) issues.push({ code: "assets", message: `Pick one to ${MAX_ASSETS} stocks.` });
  if (!Number.isInteger(termSeconds) || termSeconds < MIN_TERM_SECONDS || termSeconds > MAX_TERM_SECONDS)
    issues.push({ code: "term", message: `Term must be between ${MIN_TERM_SECONDS / 86400} and ${MAX_TERM_SECONDS / 86400} days.` });
  if (!Number.isInteger(floorBps) || floorBps < MIN_FLOOR_BPS || floorBps > MAX_FLOOR_BPS)
    issues.push({ code: "floor", message: `Floor must be between ${MIN_FLOOR_BPS / 100}% and ${MAX_FLOOR_BPS / 100}%.` });
  if (nowSec && !issues.some((x) => x.code === "term")) {
    const horizon = l.holidayHorizonDay ?? HOLIDAY_HORIZON_DAY;
    if (Math.floor((nowSec + termSeconds + UNWIND_BUFFER_SECONDS) / 86_400) > horizon) {
      const max = maxTermDaysByHorizon(nowSec, horizon);
      issues.push({ code: "term-horizon", message: `Term too long for the current holiday table; choose a shorter term.${max >= 7 ? ` The longest term available today is ${max} days.` : " No term is available until the table is extended."}` });
    }
  }
  if (amount <= 0n) { issues.push({ code: "amount", message: "Enter an amount in USDT." }); return { ok: false, issues }; }
  if (amount < l.minDeposit) issues.push({ code: "min-deposit", message: `Raise the deposit to at least ${usdt(l.minDeposit)} USDT.` });
  if (amount > l.maxDeposit) issues.push({ code: "max-deposit", message: `Launch limit: ${usdt(l.maxDeposit)} USDT per position. Lower the deposit.` });
  if (l.tvlRoom !== null && amount > l.tvlRoom && amount <= l.maxDeposit) issues.push({ code: "tvl", message: `The launch pool has room for ${usdt(l.tvlRoom)} USDT more. Lower the deposit.` });

  const boundsOk = !issues.some((x) => x.code === "floor" || x.code === "assets" || x.code === "amount");
  if (boundsOk && amount >= l.minDeposit) {
    const prob = tradeProblem(amount, floorBps, weightsBps, l);
    const floorPct = floorBps / 100;
    if (prob === "small") {
      const need = minDepositFor(floorBps, weightsBps, l, l.maxDeposit);
      const lower = maxFloorFor(amount, floorPct - 1, weightsBps, l);
      const parts = [`With this floor and basket, each stock's first buy would be under the ${usdt(l.minTrade)} USDT minimum trade.`];
      const fixes: string[] = [];
      if (need) fixes.push(`raise the deposit to at least ${usdt(need)} USDT`);
      if (lower) fixes.push(`lower the floor to ${lower}%`);
      fixes.push("or pick fewer stocks");
      issues.push({ code: "min-deposit", message: `${parts[0]} Fix: ${fixes.join(", ")}.` });
    } else if (prob === "floor") {
      const lower = maxFloorFor(amount, floorPct - 1, weightsBps, l);
      issues.push({ code: "floor-high", message: `This floor is so high that the first buy could not pass the ${(l.buyBandBps / 100).toFixed(0)}% buy band.${lower ? ` Lower the floor to ${lower}%.` : ""}` });
    }
  }
  return { ok: issues.length === 0, issues };
}
