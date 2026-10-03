import { z } from 'zod';
import { MAX_ASSETS, MAX_FLOOR_BPS, MAX_TERM_SECONDS, MIN_FLOOR_BPS, MIN_TERM_SECONDS } from './constants';

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'invalid address');
/** Unsigned integer as a decimal string (token amounts, 18 decimals). */
export const uintStringSchema = z.string().regex(/^\d+$/, 'expected a non-negative integer string');

export const createPositionInputSchema = z
  .object({
    owner: addressSchema,
    amount: uintStringSchema,
    floorBps: z.number().int().min(MIN_FLOOR_BPS).max(MAX_FLOOR_BPS),
    termSeconds: z.number().int().min(MIN_TERM_SECONDS).max(MAX_TERM_SECONDS),
    assets: z.array(addressSchema).min(1).max(MAX_ASSETS),
    weightsBps: z.array(z.number().int().positive()).min(1).max(MAX_ASSETS),
  })
  .refine((v) => v.assets.length === v.weightsBps.length, { message: 'assets and weights length mismatch' })
  .refine((v) => v.weightsBps.reduce((a, b) => a + b, 0) === 10_000, { message: 'weights must sum to 10000' });

export const exitInputSchema = z.object({ vault: addressSchema, to: addressSchema.optional() });

export const unsignedTxSchema = z.object({
  chainId: z.number().int(),
  to: addressSchema,
  data: z.string().regex(/^0x([0-9a-fA-F]{2})*$/),
  value: uintStringSchema,
  description: z.string(),
  decoded: z.object({ function: z.string(), args: z.record(z.string(), z.union([z.string(), z.array(z.string())])) }),
  simulation: z.unknown().nullable().optional(),
  expiresAt: z.number().int().optional(),
});
