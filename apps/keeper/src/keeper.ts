import type { Address, Hex } from 'viem';
import { cppi } from '@floor/sdk';
import { factoryAbi, pauseManagerAbi, tokenAbi, vaultAbi } from './abi.js';
import { buildAggSwap, AggRejected, type AggClient } from './agg.js';
import { chooseGasPrice, makePriceGuard, shadowSimulate, DEFAULT_BW3_SETTINGS, type Bw3Like } from './bw3.js';
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
  | 'already_pending'
  | 'poke_noop';

export interface RunOpts {
  dryRun: boolean;
  vault?: Address;
  route: Route;
  sender?: Sender;
  agg?: AggClient;
  /** Binance Web3 client for the price guard, gas price and shadow simulate. Independent of the route; absent = behave as before. */
  bw3?: Bw3Like;
  /** pending-vault guard shared across ticks (idempotency inside one process) */
  inFlight?: Set<string>;
  fetchImpl?: typeof fetch;
  /** max age of aggregator calldata before a re-quote + re-simulate (default 10 s; the quote TTL is 20-40 s) */
  aggMaxAgeMs?: number;
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

  // 0. multiplier poke (A12 F-05): permissionless, independent of the trading window, so it runs first on every cycle.
  const poked = new Set<string>();
  const pokeIfStale = async (token: Address) => {
    if (poked.has(token.toLowerCase())) return;
    poked.add(token.toLowerCase());
    try {
      const [live, stored] = await Promise.all([
        rd<bigint>(token, tokenAbi as never, 'uiMultiplier'),
        rd<bigint>(factory, factoryAbi as never, 'lastMultiplier', [token]),
      ]);
      if (live === stored) return;
      if (o.dryRun || !o.sender?.poke) { log.log('info', 'poke_needed', { token, live, stored, dryRun: o.dryRun }); return; }
      const r = await o.sender.poke(factory, token);
      log.log(r.success ? 'info' : 'error', 'poked_multiplier', { token, hash: r.hash, success: r.success });
    } catch (e) {
      log.log('warn', 'poke_failed', { token, error: e instanceof Error ? e.message.split('\n')[0] : String(e) });
    }
  };
  for (const t of cfg.assets ?? []) await pokeIfStale(t);

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
  const bw3s = { ...DEFAULT_BW3_SETTINGS, ...cfg.bw3Guard };
  const priceDeviation = o.bw3 && bw3s.priceGuardBps > 0 ? makePriceGuard(o.bw3, log, cfg.assets ?? []) : undefined;
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

      // minTrade and dust are USDT values. amountIn is USDT for a buy but bStock wei for a sell, so a sell is compared by its USDT
      // value, rebuilt from minOutDirect (= value * (1 - tolDirectBps)). The vault accepts a sell at >= minTrade, or at >= dust + 1
      // when closing a residue (E* == 0, which the keeper cannot see), so the sell floor is min(minTrade, dust + 1): the keeper
      // never skips a trade the vault would accept; the vault's own previewRebalance already applied the exact rule.
      const minTrade = await rd<bigint>(vault, vaultAbi as never, 'minTrade');
      let tradeUsd = amountIn;
      let floorUsd = minTrade;
      if (!buy) {
        const tol = BigInt(await rd<number>(vault, vaultAbi as never, 'tolDirectBps'));
        const dust = await rd<bigint>(vault, vaultAbi as never, 'dust');
        tradeUsd = (minOutDirect * 10_000n + (10_000n - tol) - 1n) / (10_000n - tol); // ceil
        if (dust + 1n < floorUsd) floorUsd = dust + 1n;
      }
      if (tradeUsd < floorUsd) { skip(vault, 'below_min_trade', { buy, tradeUsd, floorUsd, minTrade }); continue; }

      const token = buy ? tokenOut : tokenIn; // the bStock side
      await pokeIfStale(token);
      const last = await rd<number>(vault, vaultAbi as never, 'lastTradeAt', [assetIdx]);
      const minInterval = await rd<number>(vault, vaultAbi as never, 'minInterval');
      if (Number(last) + Number(minInterval) > now) { skip(vault, 'too_soon', { last: Number(last), minInterval: Number(minInterval) }); continue; }

      if (await isTokenPaused(rd, token)) { skip(vault, 'token_paused', { token }); continue; }

      // 3b. Binance price guard. Only a BUY can be blocked; a sell protects the floor and is never skipped. Fails open.
      if (priceDeviation) {
        const dev = await priceDeviation(token);
        if (dev !== undefined) {
          if (buy && dev > bw3s.priceGuardBps) {
            out({ vault, status: 'skipped', reason: `binance price guard: token trades ${dev} bps from reference (limit ${bw3s.priceGuardBps}); buy skipped` });
            continue;
          }
          log.log('info', 'bw3_price_check', { vault, token, buy, deviationBps: dev, limitBps: bw3s.priceGuardBps, blocked: false });
        }
      }

      const asset = await rd<readonly [Address, number, boolean, bigint, bigint, boolean]>(factory, factoryAbi as never, 'assets', [token]);
      const v3Router = await rd<Address>(factory, factoryAbi as never, 'v3SwapRouter');

      // 4. route. The aggregator is optional; the direct Pancake route is always the fallback.
      const direct = (): Swap => ({
        assetIdx, buy, amountIn, router: v3Router,
        data: buildDirectCalldata({ tokenIn, tokenOut, fee: asset[1], vault, amountIn, minOut: minOutDirect, deadline: BigInt(now + 600), router: v3Router }),
      });
      const tryAgg = async (): Promise<Swap | undefined> => {
        if (o.route !== 'agg') return undefined;
        if (!o.agg) { log.log('warn', 'agg_disabled', { reason: 'BW3 keys absent, using direct route' }); return undefined; }
        try {
          const a = await buildAggSwap(o.agg, {
            vault, buy, tokenIn, tokenOut, amountIn, minOutAgg,
            routerOk: async (r) => {
              const [ok, approveTarget] = await rd<readonly [boolean, Address]>(factory, factoryAbi as never, 'routerOk', [r]);
              return { ok, approveTarget };
            },
          });
          return { assetIdx, buy, amountIn, router: a.router, data: a.data };
        } catch (e) {
          const reason = e instanceof AggRejected ? e.reason : e instanceof Error ? e.message.split('\n')[0] : String(e);
          log.log('warn', 'agg_fallback_to_direct', { vault, reason });
          return undefined;
        }
      };
      const first = await tryAgg();
      let swap: Swap = first ?? direct();
      let route: Route = first ? 'agg' : 'direct';
      let builtAt = Date.now();

      // 5. simulate (eth_call of the full rebalance, which models the vault's approve + balance-delta checks; the API's own
      // pre-transaction simulate cannot, the vault has not approved the router yet). An agg failure falls back to direct.
      let gas: bigint;
      if (!from) {
        log.log('warn', 'simulation_skipped', { vault, reason: 'no KEEPER_ADDRESS and no signer' });
        out({ vault, status: 'simulated', reason: 'preview only, no simulation (set KEEPER_ADDRESS)', route });
        log.log('info', 'dry_run_plan', plan(vault, swap, token, route));
        continue;
      }
      const simulate = async (): Promise<bigint | SimError> => {
        try { return await chain.simulate(vault, swap, from); } catch (e) { if (e instanceof SimError) return e; throw e; }
      };
      let sim = await simulate();
      if (sim instanceof SimError && route === 'agg') {
        log.log('warn', 'agg_sim_failed_fallback_to_direct', { vault, revert: sim.revert });
        swap = direct(); route = 'direct';
        sim = await simulate();
      }
      if (sim instanceof SimError) {
        const rv = sim.revert;
        skip(vault, 'simulation_failed', { revert: rv });
        // expected reverts (TooSoon, NoTradeNeeded) are normal; anything else is worth a look
        if (!/^(TooSoon|NoTradeNeeded)/.test(rv)) { allOk = false; await alert(cfg, log, `simulation failed for ${vault}: ${rv}`, o.fetchImpl); }
        continue;
      }
      gas = sim;
      if (o.bw3 && bw3s.shadowSim) await shadowSimulate(o.bw3, log, vault, swap, from);
      if (o.dryRun || !o.sender) {
        out({ vault, status: 'simulated', route });
        log.log('info', 'dry_run_plan', { ...plan(vault, swap, token, route), gas });
        continue;
      }

      // 5b. quote TTL (20-40 s measured): if the aggregator calldata is older than aggMaxAgeMs, re-quote and re-simulate right before sending
      if (route === 'agg' && Date.now() - builtAt > (o.aggMaxAgeMs ?? 10_000)) {
        const fresh = await tryAgg();
        swap = fresh ?? direct(); route = fresh ? 'agg' : 'direct'; builtAt = Date.now();
        log.log('info', 'agg_requoted', { vault, route });
        const again = await simulate();
        if (again instanceof SimError) { skip(vault, 'simulation_failed', { revert: again.revert }); continue; }
        gas = again;
      }

      // 5c. gas price: Binance when sane, else the node's own (fail open)
      const gasPrice = o.bw3 && bw3s.gas ? await chooseGasPrice(o.bw3, chain.gasPrice?.bind(chain), log) : undefined;

      // 6. send, wait, decode
      o.inFlight?.add(vault.toLowerCase());
      try {
        const r = await (gasPrice === undefined ? o.sender.send(vault, swap, gas) : o.sender.send(vault, swap, gas, gasPrice));
        if (!r.success) {
          allOk = false;
          out({ vault, status: 'failed', reason: 'tx reverted', hash: r.hash, route }, 'error');
          await alert(cfg, log, `rebalance tx reverted for ${vault} (${r.hash})`, o.fetchImpl);
        } else if (!r.rebalanced) {
          // The vault pokes a stale multiplier and returns success without trading (A12 F-05). Not a failure, not a trade.
          skip(vault, 'poke_noop', { hash: r.hash, route });
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
