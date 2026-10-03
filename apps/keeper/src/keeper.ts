import type { Address, Hex } from 'viem';
import { cppi } from '@floor/sdk';
import { factoryAbi, pauseManagerAbi, tokenAbi, vaultAbi } from './abi.js';
import { buildAggSwap, AggRejected, type AggClient } from './agg.js';
import { SimError, type Chain, type Sender } from './chain.js';
import type { Config, Route } from './config.js';
import { buildDirectCalldata } from './direct.js';
import type { Logger } from './log.js';
import { closedReason, dayOf } from './window.js';

export interface Swap {
  assetIdx: number;
  buy: boolean;
  amountIn: bigint;
  router: Address;
  data: Hex;
}

export type SkipReason =
  | 'window_closed'
  | 'no_trade_needed'
  | 'below_min_trade'
  | 'token_paused'
  | 'price_check_failed'
  | 'too_soon'
  | 'simulation_failed'
  | 'already_pending';

export interface RunOpts {
  dryRun: boolean;
  vault?: Address;
  route: Route;
  sender?: Sender;
  agg?: AggClient;
  /** pending-vault guard shared across ticks (idempotency inside one process) */
  inFlight?: Set<string>;
  fetchImpl?: typeof fetch;
}

export interface VaultOutcome {
  vault: Address;
  status: 'skipped' | 'simulated' | 'sent' | 'failed';
  reason?: string;
  hash?: Hex;
  route?: Route;
}

export interface RunResult {
  ok: boolean;
  windowOpen: boolean;
  closedReason?: string;
  outcomes: VaultOutcome[];
}

const SCAN_PAGE = 50n;

export async function alert(cfg: Config, log: Logger, msg: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!cfg.alertWebhook) return;
  try {
    await fetchImpl(cfg.alertWebhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `floor-keeper: ${msg}` }),
    });
  } catch (e) {
    log.log('warn', 'alert_failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

/** One pass: window check, scan, one swap per vault. Idempotent: the vault re-validates everything and refuses a repeat inside minInterval. */
export async function runOnce(cfg: Config, chain: Chain, log: Logger, o: RunOpts): Promise<RunResult> {
  const outcomes: VaultOutcome[] = [];
  if (!cfg.factory) {
    log.log('info', 'no_factory_configured', { hint: 'set FLOOR_FACTORY and FLOOR_LENS, or add packages/contracts/deployments/<chainId>.json' });
    return { ok: true, windowOpen: false, closedReason: 'no_factory', outcomes };
  }
  const factory = cfg.factory;
  const now = await chain.now();
  const rd = <T>(a: Address, abi: never, fn: string, args: readonly unknown[] = []) => chain.read<T>(a, abi, fn, args);

  // 1. window (CONTRACTS.md section 6). The chain answers; the mirror only names the reason.
  const open = await rd<boolean>(factory, factoryAbi as never, 'isTradingOpen', [BigInt(now)]);
  if (!open) {
    const [paused, halted, holiday] = await Promise.all([
      rd<boolean>(factory, factoryAbi as never, 'paused'),
      rd<boolean>(factory, factoryAbi as never, 'halted'),
      rd<boolean>(factory, factoryAbi as never, 'nonTradingDay', [dayOf(now)]),
    ]);
    const reason = closedReason(now, { paused, halted, holiday }) ?? 'closed';
    log.log('info', 'heartbeat', { windowOpen: false, reason, chainTime: now });
    return { ok: true, windowOpen: false, closedReason: reason, outcomes };
  }

  // 2. which vaults
  let vaults: Address[];
  if (o.vault) vaults = [o.vault];
  else {
    if (!cfg.lens) {
      log.log('error', 'no_lens_configured', {});
      return { ok: false, windowOpen: true, outcomes };
    }
    const total = await rd<bigint>(factory, factoryAbi as never, 'positionsCount');
    vaults = [];
    for (let from = 0n; from < total; from += SCAN_PAGE) {
      const to = from + SCAN_PAGE > total ? total : from + SCAN_PAGE;
      vaults.push(...(await chain.scan(cfg.lens, from, to)));
    }
    log.log('info', 'scan', { positions: Number(total), needing: vaults.length });
  }

  const from = o.sender?.address ?? cfg.keeperAddress;
  let allOk = true;
  const out = (x: VaultOutcome, level: 'info' | 'warn' | 'error' = 'info') => {
    outcomes.push(x);
    log.log(level, 'vault_outcome', { ...x });
  };
  const skip = (vault: Address, reason: SkipReason, extra: Record<string, unknown> = {}) => {
    outcomes.push({ vault, status: 'skipped', reason });
    log.log('info', 'skip', { vault, reason, ...extra });
  };

  for (const vault of vaults) {
    try {
      if (o.inFlight?.has(vault.toLowerCase())) { skip(vault, 'already_pending'); continue; }

      // 3. preview; a revert here means the vault's own price checks (TWAP, deviation, cardinality) failed
      let p: readonly [boolean, number, boolean, Address, Address, bigint, bigint, bigint];
      try {
        p = await rd(vault, vaultAbi as never, 'previewRebalance');
      } catch (e) {
        skip(vault, 'price_check_failed', { error: e instanceof Error ? e.message.split('\n')[0] : String(e) });
        continue;
      }
      const [needed, assetIdx, buy, tokenIn, tokenOut, amountIn, minOutAgg, minOutDirect] = p;
      if (!needed) { skip(vault, 'no_trade_needed'); continue; }

      if (cfg.lens) await logStatus(chain, log, cfg.lens, vault);

      const minTrade = await rd<bigint>(vault, vaultAbi as never, 'minTrade');
      if (amountIn < minTrade) { skip(vault, 'below_min_trade', { amountIn, minTrade }); continue; }

      const token = buy ? tokenOut : tokenIn; // the bStock side
      const last = await rd<number>(vault, vaultAbi as never, 'lastTradeAt', [assetIdx]);
      const minInterval = await rd<number>(vault, vaultAbi as never, 'minInterval');
      if (Number(last) + Number(minInterval) > now) { skip(vault, 'too_soon', { last: Number(last), minInterval: Number(minInterval) }); continue; }

      if (await isTokenPaused(rd, token)) { skip(vault, 'token_paused', { token }); continue; }

      const asset = await rd<readonly [Address, number, boolean, bigint, bigint, boolean]>(factory, factoryAbi as never, 'assets', [token]);
      const v3Router = await rd<Address>(factory, factoryAbi as never, 'v3SwapRouter');

      // 4. route. The aggregator is optional; the direct Pancake route is always the fallback.
      let route: Route = 'direct';
      let swap: Swap | undefined;
      if (o.route === 'agg') {
        if (!o.agg) log.log('warn', 'agg_disabled', { reason: 'BW3 keys absent, using direct route' });
        else {
          try {
            const a = await buildAggSwap(o.agg, {
              vault, tokenIn, tokenOut, amountIn, minOutAgg,
              routerOk: async (r) => {
                const [ok, approveTarget] = await rd<readonly [boolean, Address]>(factory, factoryAbi as never, 'routerOk', [r]);
                return { ok, approveTarget };
              },
            });
            swap = { assetIdx, buy, amountIn, router: a.router, data: a.data };
            route = 'agg';
          } catch (e) {
            const reason = e instanceof AggRejected ? e.reason : e instanceof Error ? e.message : String(e);
            log.log('warn', 'agg_fallback_to_direct', { vault, reason });
          }
        }
      }
      if (!swap) {
        swap = {
          assetIdx, buy, amountIn, router: v3Router,
          data: buildDirectCalldata({ tokenIn, tokenOut, fee: asset[1], vault, amountIn, minOut: minOutDirect, deadline: BigInt(now + 600), router: v3Router }),
        };
      }

      // 5. simulate (eth_call). Works without a key when KEEPER_ADDRESS is set.
      let gas: bigint;
      if (!from) {
        log.log('warn', 'simulation_skipped', { vault, reason: 'no KEEPER_ADDRESS and no signer' });
        out({ vault, status: 'simulated', reason: 'preview only, no simulation (set KEEPER_ADDRESS)', route });
        log.log('info', 'dry_run_plan', plan(vault, swap, token, route));
        continue;
      }
      try {
        gas = await chain.simulate(vault, swap, from);
      } catch (e) {
        const rv = e instanceof SimError ? e.revert : String(e);
        skip(vault, 'simulation_failed', { revert: rv });
        // expected reverts (TooSoon, NoTradeNeeded) are normal; anything else is worth a look
        if (!/^(TooSoon|NoTradeNeeded)/.test(rv)) { allOk = false; await alert(cfg, log, `simulation failed for ${vault}: ${rv}`, o.fetchImpl); }
        continue;
      }
      if (o.dryRun || !o.sender) {
        out({ vault, status: 'simulated', route });
        log.log('info', 'dry_run_plan', { ...plan(vault, swap, token, route), gas });
        continue;
      }

      // 6. send, wait, decode
      o.inFlight?.add(vault.toLowerCase());
      try {
        const r = await o.sender.send(vault, swap, gas);
        if (!r.success) {
          allOk = false;
          out({ vault, status: 'failed', reason: 'tx reverted', hash: r.hash, route }, 'error');
          await alert(cfg, log, `rebalance tx reverted for ${vault} (${r.hash})`, o.fetchImpl);
        } else {
          out({ vault, status: 'sent', hash: r.hash, route });
          log.log('info', 'rebalanced', {
            vault, hash: r.hash, block: r.blockNumber, route,
            buy: r.rebalanced?.buy, amountIn: r.rebalanced?.amountIn, amountOut: r.rebalanced?.amountOut,
            V: r.rebalanced?.V, exposureTarget: r.rebalanced?.exposureTarget,
          });
        }
      } finally {
        o.inFlight?.delete(vault.toLowerCase());
      }
    } catch (e) {
      allOk = false;
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
      out({ vault, status: 'failed', reason: msg }, 'error');
      await alert(cfg, log, `error on ${vault}: ${msg}`, o.fetchImpl);
    }
  }
  return { ok: allOk, windowOpen: true, outcomes };
}

function plan(vault: Address, s: Swap, token: Address, route: Route) {
  return { vault, route, assetIdx: s.assetIdx, buy: s.buy, amountIn: s.amountIn, router: s.router, token, dataBytes: (s.data.length - 2) / 2 };
}

async function isTokenPaused(rd: <T>(a: Address, abi: never, fn: string, args?: readonly unknown[]) => Promise<T>, token: Address): Promise<boolean> {
  try {
    const pm = await rd<Address>(token, tokenAbi as never, 'pauseManager');
    return await rd<boolean>(pm, pauseManagerAbi as never, 'isTokenPaused', [token]);
  } catch {
    return false; // token has no pause manager (mocks); the vault's own call would revert anyway
  }
}

/** Logs the Lens view and cross-checks E* with the SDK CPPI mirror (E* = min(m * cushion, V)). A mismatch is a warning, not a stop: the vault decides. */
async function logStatus(chain: Chain, log: Logger, lens: Address, vault: Address): Promise<void> {
  try {
    const s = await chain.status(lens, vault);
    const mirror = cppi.exposureTarget(s.cushion, s.V);
    log.log(mirror === s.target ? 'info' : 'warn', 'vault_status', {
      vault, V: s.V, floor: s.floor, cushion: s.cushion, exposure: s.exposure, target: s.target, sdkTarget: mirror, cppiMirrorMatches: mirror === s.target,
    });
  } catch (e) {
    log.log('warn', 'status_failed', { vault, error: e instanceof Error ? e.message.split('\n')[0] : String(e) });
  }
}
