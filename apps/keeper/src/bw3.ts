import { encodeFunctionData, type Address } from 'viem';
import { vaultAbi } from './abi.js';
import type { Swap } from './keeper.js';
import type { Logger } from './log.js';

/**
 * The slice of Bw3Client the keeper's Binance checks use (all three methods exist today). Tests pass a fake.
 *
 * Safety principle: Binance data may only (a) block a rebalance that BUYS a bStock, (b) pick the gas price, (c) add a logged
 * second opinion. A SELL (protecting the floor) is never blocked by Binance data, and any Binance failure fails open.
 */
export interface Bw3Like {
  rwaPrice(addresses: string[]): Promise<Record<string, unknown>[]>;
  gasPrice(): Promise<{ evmLegacyGasPrice?: { mediumGasPrice: string } | null }>;
  simulate(tx: { from: string; to: string; data: string }): Promise<{ status: string; failReason?: string | null }>;
}

export interface Bw3Settings {
  /** max |tokenPrice - referencePrice| in bps before a BUY is skipped; 0 disables the guard */
  priceGuardBps: number;
  gas: boolean;
  shadowSim: boolean;
}

export const DEFAULT_BW3_SETTINGS: Bw3Settings = { priceGuardBps: 500, gas: true, shadowSim: true };

const msg = (e: unknown) => (e instanceof Error ? e.message.split('\n')[0] : String(e));

/**
 * Deviation in bps of the on-chain market price (tokenPrice) from the underlying reference (referencePrice), or undefined when
 * either is missing, non-numeric or <= 0. Row field names tokenPrice/referencePrice/tokenContractAddress are as seen in the
 * live /v1/market data and the api tests; the bw3 schema keeps rows loose, so they are not schema-verified.
 */
export function deviationBps(row: Record<string, unknown> | undefined): number | undefined {
  if (!row) return undefined;
  const tp = Number(row.tokenPrice);
  const rp = Number(row.referencePrice);
  if (!Number.isFinite(tp) || !Number.isFinite(rp) || tp <= 0 || rp <= 0) return undefined;
  return Math.round((Math.abs(tp - rp) / rp) * 10_000);
}

/** Per-run price cache: one batched rwaPrice call (configured assets plus the first token needed). A failure is remembered and logged once. */
export function makePriceGuard(bw3: Bw3Like, log: Logger, prefetch: Address[]) {
  const rows = new Map<string, Record<string, unknown>>();
  const requested = new Set<string>();
  let failed = false;
  const load = async (token: Address) => {
    if (failed || requested.has(token.toLowerCase())) return;
    const want = [...new Set([token, ...prefetch].map((a) => a.toLowerCase()))].filter((a) => !requested.has(a));
    want.forEach((a) => requested.add(a));
    try {
      for (const r of await bw3.rwaPrice(want)) {
        const a = typeof r.tokenContractAddress === 'string' ? r.tokenContractAddress.toLowerCase() : undefined;
        if (a) rows.set(a, r);
      }
    } catch (e) {
      failed = true;
      log.log('warn', 'bw3_price_unavailable', { error: msg(e), failOpen: true });
    }
  };
  /** Returns the deviation in bps, or undefined (fail open) when Binance has no usable price. */
  return async (token: Address): Promise<number | undefined> => {
    await load(token);
    const d = deviationBps(rows.get(token.toLowerCase()));
    if (d === undefined && !failed) log.log('warn', 'bw3_price_unavailable', { token, reason: 'missing or zero price', failOpen: true });
    return d;
  };
}

/**
 * Gas price in wei: Binance medium legacy price when it is > 0 and within [0.5x, 3x] of the RPC's own price, else undefined
 * (the caller then uses the node default). Never throws.
 * Unit assumption (recorded fixture packages/bw3/fixtures/gas-price.json, "53752850" on BSC): wei. The band check against the
 * RPC value rejects a wrong-unit response instead of using it.
 */
export async function chooseGasPrice(bw3: Bw3Like, rpcGasPrice: (() => Promise<bigint>) | undefined, log: Logger): Promise<bigint | undefined> {
  if (!rpcGasPrice) { log.log('info', 'gas_price_source', { source: 'rpc', reason: 'chain has no gasPrice reader' }); return undefined; }
  try {
    const rpc = await rpcGasPrice();
    const raw = (await bw3.gasPrice()).evmLegacyGasPrice?.mediumGasPrice;
    if (!raw || !/^\d+$/.test(raw)) { log.log('info', 'gas_price_source', { source: 'rpc', reason: 'binance gas price missing', rpc }); return undefined; }
    const b = BigInt(raw);
    if (b > 0n && rpc > 0n && b * 2n >= rpc && b <= rpc * 3n) {
      log.log('info', 'gas_price_source', { source: 'binance', gasPrice: b, rpc });
      return b;
    }
    log.log('warn', 'gas_price_source', { source: 'rpc', reason: 'binance gas price outside [0.5x, 3x] of rpc', binance: b, rpc });
  } catch (e) {
    log.log('info', 'gas_price_source', { source: 'rpc', reason: 'binance gas price unavailable', error: msg(e) });
  }
  return undefined;
}

/**
 * Informational only: never changes status, never blocks. We shadow the full vault.rebalance call, not the token-level router
 * swap: Binance's simulate of the router swap fails because the vault has not approved the router (DX finding A09b #7), while
 * vault.rebalance performs the approve itself. The success `status` string is unverified (only "FAILED" is in the fixtures).
 */
export async function shadowSimulate(bw3: Bw3Like, log: Logger, vault: Address, swap: Swap, from: Address): Promise<void> {
  try {
    const data = encodeFunctionData({ abi: vaultAbi, functionName: 'rebalance', args: [swap] });
    const r = await bw3.simulate({ from, to: vault, data });
    if (/^fail/i.test(r.status)) log.log('info', 'bw3_shadow_sim', { vault, result: `fail ${r.failReason ?? r.status}` });
    else log.log('info', 'bw3_shadow_sim', { vault, result: /^(success|succeed|ok)/i.test(r.status) ? 'ok' : `ok (status ${r.status})` });
  } catch (e) {
    log.log('info', 'bw3_shadow_sim', { vault, result: `fail ${msg(e)}`, note: 'binance unavailable, ignored' });
  }
}
