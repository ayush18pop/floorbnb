import {
  BPS,
  MAX_ASSETS,
  MAX_FLOOR_BPS,
  MAX_TERM_SECONDS,
  MIN_FLOOR_BPS,
  MIN_TERM_SECONDS,
} from './constants';
import { assetTarget, cushion, exposureTarget, floorFor } from './cppi';

export interface ProtectionQuoteInput {
  /** USDT, 18 decimals. */
  deposit: bigint;
  floorBps: number;
  termSeconds: number;
  /** Weights in bps, sum 10_000. Defaults to a single asset at 100%. */
  weightsBps?: readonly number[];
  /** Unix seconds. Used for the term end only. */
  now?: number;
}

export interface ProtectionQuote {
  deposit: bigint;
  floorBps: number;
  /** F, rounded up. */
  floorValue: bigint;
  /** C at the start. */
  cushion: bigint;
  /** E*, the stock exposure the vault builds at the first rebalance. */
  startingExposure: bigint;
  /** E* in bps of the deposit. */
  startingExposureBps: number;
  /** Stablecoin held at the start. */
  startingCash: bigint;
  /** Per-asset stock targets. */
  assetTargets: bigint[];
  /** Largest single gap (bps) the position absorbs with no rebalance: C / E, 2500 at E = 4C. null if E* = 0. */
  gapToleranceBps: number | null;
  termSeconds: number;
  termEnd: number | null;
  warnings: string[];
}

export function validateProtection(input: ProtectionQuoteInput): string[] {
  const errs: string[] = [];
  if (input.deposit <= 0n) errs.push('deposit must be positive');
  if (!Number.isInteger(input.floorBps) || input.floorBps < MIN_FLOOR_BPS || input.floorBps > MAX_FLOOR_BPS)
    errs.push(`floorBps must be an integer in [${MIN_FLOOR_BPS}, ${MAX_FLOOR_BPS}]`);
  if (!Number.isInteger(input.termSeconds) || input.termSeconds < MIN_TERM_SECONDS || input.termSeconds > MAX_TERM_SECONDS)
    errs.push(`termSeconds must be an integer in [${MIN_TERM_SECONDS}, ${MAX_TERM_SECONDS}]`);
  const w = input.weightsBps ?? [10_000];
  if (w.length < 1 || w.length > MAX_ASSETS) errs.push(`1 to ${MAX_ASSETS} assets`);
  if (w.reduce((a, b) => a + b, 0) !== 10_000) errs.push('weights must sum to 10000 bps');
  if (w.some((x) => !Number.isInteger(x) || x <= 0)) errs.push('each weight must be a positive integer');
  return errs;
}

/** Starting protection split at deposit time (all stablecoin before the first rebalance, so V = D). */
export function quoteProtection(input: ProtectionQuoteInput): ProtectionQuote {
  const errs = validateProtection(input);
  if (errs.length) throw new Error(`invalid quote input: ${errs.join('; ')}`);
  const weights = input.weightsBps ?? [10_000];
  const D = input.deposit;
  const F = floorFor(D, input.floorBps);
  const C = cushion(D, F);
  const E = exposureTarget(C, D);
  const targets = weights.map((w) => assetTarget(E, w));
  const warnings: string[] = [];
  if (C === 0n) warnings.push('floor equals the deposit: no cushion, the vault holds only USDT');
  if (E > 0n && E === D) warnings.push('exposure is capped at the deposit value');
  return {
    deposit: D,
    floorBps: input.floorBps,
    floorValue: F,
    cushion: C,
    startingExposure: E,
    startingExposureBps: Number((E * BPS) / D),
    startingCash: D - E,
    assetTargets: targets,
    gapToleranceBps: E > 0n ? Number((C * BPS) / E) : null,
    termSeconds: input.termSeconds,
    termEnd: input.now === undefined ? null : input.now + input.termSeconds,
    warnings,
  };
}
