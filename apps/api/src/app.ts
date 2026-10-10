import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getAddress, type Address, type PublicClient } from 'viem';
import { erc20Abi } from 'viem';
import { DEFAULT_PAID_PRICE_USD } from '@floor/x402';
import { z } from 'zod';
import {
  FLOOR_DISCLOSURE,
  LAUNCH_TERM_SECONDS,
  M_PLAIN,
  MAX_ASSETS,
  MAX_FLOOR_BPS,
  MAX_TERM_SECONDS,
  MIN_FLOOR_BPS,
  MIN_TERM_SECONDS,
  PRODUCT_NAME,
  TOKENS,
  addressSchema,
  buildCloseToUSDT,
  buildCreatePosition,
  buildExitInKind,
  buildRequestClose,
  createPositionInputSchema,
  exitInputSchema,
  floorFactoryAbi,
  floorVaultAbi,
  isMarketOpen,
  nextWindowOpen,
  quoteProtection,
  readIsTradingOpen,
  readPosition,
  readPositionsOf,
  type Deployment,
  type UnsignedTx,
} from '@floor/sdk';
import type { ActivityEvent } from './chainLogs';
import { InMemoryKeeperRunStore, type KeeperRunStore } from './keeperRuns';
import { bw3Stats } from '@floor/bw3';
import { P as BW3_PATH, mergeModuleStats } from './binanceStatus';
import { ApiError, RateLimiter, TtlCache, ser } from './util';

/** Max uint of any token amount we accept: 10^30 wei (1e12 tokens at 18 decimals). */
const MAX_AMOUNT = 10n ** 30n;
const MAX_POSITIONS_PER_OWNER = 50;
const CACHE_MS = 10_000;
const MARKET_CACHE_MS = 15_000;
const PROFILE_CACHE_MS = 6 * 3600_000;
const CANDLES_CACHE_MS = 5 * 60_000;
/** Optional enrichments must not stall /v1/market (the bw3 client retries 5xx for up to 14 s). */
const SOFT_TIMEOUT_MS = 4_000;
const SOFT_FAIL_CACHE_MS = 30_000;
const CANDLE_INTERVALS = ['1h', '4h', '1d'] as const;
/** Upstream rejects limit > 300 ("invalid limit range", probed 2026-10-10) and holds ~120 daily candles on BSC. */
const UPSTREAM_MAX_CANDLES = 300;

export interface AppDeps {
  chainId: number;
  deployment: Deployment;
  client: PublicClient;
  /** Absent when BW3 keys are not configured: /v1/market then answers 503, never made-up prices. */
  bw3?: {
    rwaPrice(addresses: string[]): Promise<Record<string, unknown>[]>;
    /** Optional enrichments: when a method is absent or throws, the matching /v1/market fields are null. */
    rwaUnderlyingMarket?(address: string): Promise<Record<string, unknown>>;
    rwaUnderlyingProfile?(address: string): Promise<Record<string, unknown>>;
    /** Rows: [open, high, low, close, volume, openTimeMs, trades]. */
    candles?(p: { address: string; interval: string; limit?: number }): Promise<(number | string)[][]>;
  };
  runs?: KeeperRunStore;
  /** Decoded vault events (cached, incremental). Absent: /v1/positions/:vault/activity answers 501. */
  activity?: (vault: Address) => Promise<ActivityEvent[]>;
  /** Unix seconds of the keeper's last scan (read-only). Absent: only the run log is used. Newest of the two wins. */
  keeperHeartbeat?: () => Promise<number | null>;
  /**
   * The @floor/x402 gate, adapted by the server. Resolve null once payment is verified (the handler then runs),
   * or a Response (402 etc.) to return as is. Absent until A17 lands: /v1/paid/* answer 501.
   */
  paidGate?: (req: Request, priceUsd: string) => Promise<Response | null>;
  /** Price of /v1/paid/quote in USD (decimal string). Default 0.01. */
  paidQuotePriceUsd?: string;
  corsOrigins?: string[];
  trustProxy?: boolean;
  now?: () => number;
  limits?: { free: number; tx: number };
}

const limitSchema = z.coerce.number().int().min(1).max(100);
const exitBodySchema = exitInputSchema.extend({
  mode: z.enum(['exitInKind', 'requestClose', 'closeToUSDT']).default('exitInKind'),
});
const paidQuoteSchema = z.object({
  deposit: z.string().regex(/^\d+$/),
  floorBps: z.number().int().min(MIN_FLOOR_BPS).max(MAX_FLOOR_BPS),
  termSeconds: z.number().int().min(MIN_TERM_SECONDS).max(MAX_TERM_SECONDS),
  weightsBps: z.array(z.number().int().positive()).min(1).max(MAX_ASSETS).optional(),
});

function addr(raw: string, what: string): Address {
  if (!addressSchema.safeParse(raw).success) throw new ApiError(400, 'bad_request', `${what} is not an address`);
  try {
    return getAddress(raw);
  } catch {
    throw new ApiError(400, 'bad_request', `${what} has a bad checksum`);
  }
}

const MIN_POSITION_WEI = 5n * 10n ** 18n;

export function createApp(deps: AppDeps): Hono {
  const { client, deployment, chainId } = deps;
  const now = deps.now ?? Date.now;
  const runs = deps.runs ?? new InMemoryKeeperRunStore();
  const cache = new TtlCache(now);
  const soft = new Map<string, { at: number; ttl: number; v: Promise<unknown> }>();
  /** Cached best-effort fetch: resolves null on failure or timeout (failure cached 30 s), never rejects. */
  function softGet<T>(key: string, ttlMs: number, load: (() => Promise<T>) | undefined): Promise<T | null> {
    if (!load) return Promise.resolve(null);
    const hit = soft.get(key);
    if (hit && now() - hit.at < hit.ttl) return hit.v as Promise<T | null>;
    const entry = { at: now(), ttl: ttlMs, v: undefined as unknown as Promise<unknown> };
    entry.v = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([load(), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), SOFT_TIMEOUT_MS); })]);
      } catch {
        entry.ttl = SOFT_FAIL_CACHE_MS;
        return null;
      } finally {
        clearTimeout(timer);
      }
    })();
    soft.set(key, entry);
    return entry.v as Promise<T | null>;
  }
  const limiter = new RateLimiter(now);
  const limits = deps.limits ?? { free: 60, tx: 10 };
  const knownVaults = new Set<string>();
  const app = new Hono();

  const ip = (c: Context): string => {
    if (deps.trustProxy) {
      const x = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (x) return x;
    }
    try {
      return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      return 'unknown';
    }
  };

  // CORS only for the configured web origins. None configured: no CORS headers.
  if (deps.corsOrigins?.length) {
    app.use('*', cors({ origin: deps.corsOrigins, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type', 'payment-signature'], exposeHeaders: ['payment-required', 'payment-response', 'retry-after'], maxAge: 600 }));
  }
  app.use('*', bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ error: { code: 'payload_too_large', message: 'body over 32 KB' } }, 413) }));
  app.use('*', async (c, next) => {
    const isTx = c.req.path.startsWith('/v1/tx/');
    const wait = limiter.hit(isTx ? 'tx' : 'free', ip(c), isTx ? limits.tx : limits.free);
    if (wait) {
      c.header('Retry-After', String(wait));
      throw new ApiError(429, 'rate_limited', 'too many requests');
    }
    await next();
  });
  app.onError((e, c) => {
    if (e instanceof ApiError) return c.json({ error: { code: e.code, message: e.message } }, e.status);
    // Never echo upstream error text (RPC URLs, keys in query strings).
    return c.json({ error: { code: 'upstream_error', message: 'chain or upstream read failed' } }, 502);
  });
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'no such route' } }, 404));

  async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      throw new ApiError(400, 'bad_request', 'body must be JSON');
    }
    const r = schema.safeParse(json);
    if (!r.success) throw new ApiError(400, 'bad_request', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
    return r.data;
  }

  const usdt = () => cache.get<Address>('usdt', Infinity, () => client.readContract({ address: deployment.factory, abi: floorFactoryAbi, functionName: 'usdt' }) as Promise<Address>);

  async function readAssets() {
    return cache.get('assets', CACHE_MS, async () => {
      const toks = Object.values(TOKENS);
      const rows = await Promise.all(
        toks.map((t) => client.readContract({ address: deployment.factory, abi: floorFactoryAbi, functionName: 'assets', args: [t.address] })),
      );
      return toks.map((t, i) => {
        const [pool, fee, active, minLiquidity, maxTradeValue] = rows[i] as readonly [Address, number, boolean, bigint, bigint, boolean];
        return { symbol: t.symbol, address: t.address, decimals: t.decimals, tier: t.tier, active, pool: active ? pool : null, fee: active ? fee : null, minLiquidity: active ? minLiquidity : null, maxTradeValue: active ? maxTradeValue : null };
      });
    });
  }

  /** A vault is known when its owner's factory list contains it (a fake contract cannot get into that list). */
  async function isKnownVault(vault: Address): Promise<boolean> {
    if (knownVaults.has(vault)) return true;
    let owner: Address;
    try {
      owner = (await client.readContract({ address: vault, abi: floorVaultAbi, functionName: 'owner' })) as Address;
    } catch {
      return false;
    }
    const list = await readPositionsOf(client, deployment.factory, owner);
    for (const v of list) knownVaults.add(v);
    return knownVaults.has(vault);
  }

  async function simulate(from: Address, tx: UnsignedTx) {
    try {
      await client.call({ account: from, to: tx.to, data: tx.data, value: 0n });
      return { ok: true as const, error: null };
    } catch (e) {
      const m = e instanceof Error ? e.message.split('\n')[0] ?? 'reverted' : 'reverted';
      return { ok: false as const, error: m.slice(0, 200) };
    }
  }

  async function allowedTo(extraVault?: Address): Promise<Set<string>> {
    const s = new Set([(await usdt()).toLowerCase(), deployment.factory.toLowerCase()]);
    if (extraVault) s.add(extraVault.toLowerCase());
    return s;
  }
  function guardTo(txs: UnsignedTx[], allowed: Set<string>): void {
    for (const t of txs) if (!allowed.has(t.to.toLowerCase())) throw new ApiError(502, 'internal_guard', 'refusing to return a tx to an unknown target');
  }

  app.get('/healthz', async (c) => {
    const [a, b] = await Promise.all([runs.lastHeartbeat(), deps.keeperHeartbeat?.().catch(() => null) ?? null]);
    const last = a === null ? b : b === null ? a : Math.max(a, b);
    const t = Math.floor(now() / 1000);
    return c.json({
      ok: true,
      product: PRODUCT_NAME,
      chainId,
      factory: deployment.factory,
      keeper: { lastHeartbeat: last, heartbeatAgeSeconds: last === null ? null : Math.max(0, t - last), source: 'keeper heartbeat file or run log; null means none recorded' },
    });
  });

  app.get('/v1/floor', async (c) => {
    const data = await cache.get('floor', CACHE_MS, async () => {
      const f = deployment.factory;
      const rd = <T>(functionName: string, args: unknown[] = []) => client.readContract({ address: f, abi: floorFactoryAbi, functionName, args } as never) as Promise<T>;
      const ts = BigInt(Math.floor(now() / 1000));
      const [d, maxDeposit, maxTotalTvl, totalTvl, paused, halted, positionsCount, usdtAddr, assets, tradingOpen] = await Promise.all([
        rd<readonly bigint[]>('defaults'),
        rd<bigint>('maxDeposit'),
        rd<bigint>('maxTotalTvl'),
        rd<bigint>('totalTvl'),
        rd<boolean>('paused'),
        rd<boolean>('halted'),
        rd<bigint>('positionsCount'),
        usdt(),
        readAssets(),
        readIsTradingOpen(client, f, ts),
      ]);
      return {
        product: PRODUCT_NAME,
        chainId,
        factory: f,
        lens: deployment.lens,
        usdt: usdtAddr,
        assets,
        defaults: {
          sellBandBps: d[0], buyBandBps: d[1], minInterval: d[2], publicDelay: d[3], twapWindow: d[4],
          maxTickDev: d[5], tolAggBps: d[6], tolDirectBps: d[7], minTrade: d[8], dust: d[9],
        },
        caps: { maxDeposit, maxTotalTvl, totalTvl },
        bounds: { multiplier: M_PLAIN, minFloorBps: MIN_FLOOR_BPS, maxFloorBps: MAX_FLOOR_BPS, minTermSeconds: MIN_TERM_SECONDS, maxTermSeconds: MAX_TERM_SECONDS, launchTermSeconds: LAUNCH_TERM_SECONDS, maxAssets: MAX_ASSETS },
        state: { paused, halted, positionsCount, tradingOpen },
        disclosure: FLOOR_DISCLOSURE,
      };
    });
    return c.json(ser(data));
  });

  app.get('/v1/assets', async (c) => c.json(ser({ assets: await readAssets() })));

  app.get('/v1/market', async (c) => {
    if (!deps.bw3) throw new ApiError(503, 'bw3_not_configured', 'Binance Web3 price source is not configured on this server');
    const bw3 = deps.bw3;
    const toks = Object.values(TOKENS);
    const rows = await cache.get('market', MARKET_CACHE_MS, () => bw3.rwaPrice(toks.map((t) => t.address)));
    const byAddr = new Map(rows.map((r) => [String(r.tokenContractAddress ?? '').toLowerCase(), r]));
    const t = Math.floor(now() / 1000);
    const str = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' ? String(v) : null);
    const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
    const cut = (v: unknown, n: number): string | null => {
      const s = str(v);
      return s === null || s === '' ? null : s.length > n ? s.slice(0, n) : s;
    };
    const fetched = await Promise.all(toks.map(async (tok) => {
      const [um, up] = await Promise.all([
        softGet(`um:${tok.address}`, MARKET_CACHE_MS, bw3.rwaUnderlyingMarket ? () => bw3.rwaUnderlyingMarket!(tok.address) : undefined),
        softGet(`up:${tok.address}`, PROFILE_CACHE_MS, bw3.rwaUnderlyingProfile ? () => bw3.rwaUnderlyingProfile!(tok.address) : undefined),
      ]);
      return { um: obj(um), up: obj(up) };
    }));
    const items = toks.map((tok, i) => {
      const r = byAddr.get(tok.address.toLowerCase());
      const si = (r?.statusInfo ?? null) as Record<string, unknown> | null;
      const price = str(r?.tokenPrice);
      const referencePrice = str(r?.referencePrice);
      const p = price === null ? NaN : Number(price);
      const ref = referencePrice === null ? NaN : Number(referencePrice);
      const { um, up } = fetched[i]!;
      // Underlying fields are filled only from what Binance returns. In the 2026-10-10 probe bStocks gave no
      // price, 24 h change or update time (only marketData.referencePrice, itself null), so those stay null.
      const umStatus = obj(um?.statusInfo);
      const umData = obj(um?.marketData);
      const company = obj(up?.companyInfo);
      return {
        symbol: tok.symbol,
        address: tok.address,
        price,
        referencePrice,
        priceUpdatedAt: typeof r?.tokenPriceUpdatedAt === 'number' ? r.tokenPriceUpdatedAt : null,
        // bStocks return null marketStatus/nextOpenTime upstream (DX_LOG); we pass null through, never fill it in.
        marketStatus: str(si?.marketStatus),
        nextOpenTime: str(si?.nextOpenTime),
        reasonCode: str(si?.reasonCode),
        statusInfo: si,
        deviationBps: Number.isFinite(p) && Number.isFinite(ref) && ref !== 0 ? Math.round((p / ref - 1) * 10000) : null,
        underlying: um
          ? {
              marketStatus: str(umStatus?.marketStatus),
              price: str(umData?.price ?? umData?.referencePrice),
              change24hPct: str(umData?.change24hPct ?? umData?.priceChangePercent24h),
              updatedAt: typeof umData?.updatedAt === 'number' ? Math.floor(umData.updatedAt > 1e11 ? umData.updatedAt / 1000 : umData.updatedAt) : null,
              raw: um,
            }
          : null,
        profile: up
          ? {
              companyName: str(up.underlyingFullName),
              ticker: str(up.underlyingTicker),
              sector: str(company?.industry),
              description: cut(company?.description, 400),
              logoUrl: null, // the profile response has no logo field (probed 2026-10-10)
              issuer: str(up.platformId),
            }
          : null,
      };
    });
    return c.json(ser({
      source: 'binance-web3-rwa-price',
      sources: [BW3_PATH.rwaPrice, BW3_PATH.rwaUnderlyingMarket, BW3_PATH.rwaUnderlyingProfile],
      cachedForSeconds: MARKET_CACHE_MS / 1000,
      vaultWindow: { open: isMarketOpen(t), nextOpen: nextWindowOpen(t), note: 'Vault trading window (Mon-Fri 15:30-19:30 UTC, minus holidays), computed here, not from Binance' },
      assets: items,
    }));
  });

  app.get('/v1/market/:symbol/candles', async (c) => {
    const sym = c.req.param('symbol').toUpperCase();
    const tok = Object.values(TOKENS).find((x) => x.symbol === sym);
    if (!tok) throw new ApiError(404, 'unknown_symbol', 'unknown symbol');
    if (!deps.bw3?.candles) throw new ApiError(503, 'bw3_not_configured', 'Binance Web3 market data is not configured on this server');
    const interval = c.req.query('interval') ?? '1d';
    if (!(CANDLE_INTERVALS as readonly string[]).includes(interval)) throw new ApiError(400, 'bad_request', `interval must be one of ${CANDLE_INTERVALS.join(', ')}`);
    const lr = c.req.query('limit');
    const limit = lr === undefined ? 90 : Number(lr);
    if (!Number.isInteger(limit) || limit < 1 || limit > 365) throw new ApiError(400, 'bad_request', 'limit must be an integer 1..365');
    const fetchCandles = deps.bw3.candles.bind(deps.bw3);
    const rows = await cache.get(`candles:${tok.address}:${interval}:${limit}`, CANDLES_CACHE_MS, () => fetchCandles({ address: tok.address, interval, limit: Math.min(limit, UPSTREAM_MAX_CANDLES) }));
    // Row layout [open, high, low, close, volume, openTimeMs, trades] was inferred from live data (undocumented).
    const candles = rows
      .filter((r) => r.length >= 6 && Number.isFinite(Number(r[5])))
      .map((r) => ({ t: Math.floor(Number(r[5]) / 1000), o: String(r[0]), h: String(r[1]), l: String(r[2]), c: String(r[3]), v: String(r[4]) }))
      .sort((a, b) => a.t - b.t)
      .slice(-limit);
    return c.json(ser({ symbol: tok.symbol, address: tok.address, interval, source: 'binance-web3-market-candles', candles }));
  });

  app.get('/v1/binance/status', (c) => c.json(ser({
    configured: !!deps.bw3,
    generatedAt: Math.floor(now() / 1000),
    modules: mergeModuleStats(bw3Stats.snapshot()),
  })));

  app.get('/v1/positions', async (c) => {
    const owner = addr(c.req.query('owner') ?? '', 'owner');
    const vaults = await readPositionsOf(client, deployment.factory, owner);
    for (const v of vaults) knownVaults.add(v);
    const shown = vaults.slice(-MAX_POSITIONS_PER_OWNER);
    const positions = await Promise.all(shown.map((v) => readPosition(client, deployment.lens, v)));
    return c.json(ser({ owner, count: vaults.length, truncated: vaults.length > shown.length, positions }));
  });

  app.get('/v1/positions/:vault', async (c) => {
    const vault = addr(c.req.param('vault'), 'vault');
    if (!(await isKnownVault(vault))) throw new ApiError(404, 'not_found', 'not a Floor position');
    const p = await readPosition(client, deployment.lens, vault);
    return c.json(ser(p));
  });

  app.get('/v1/positions/:vault/activity', async (c) => {
    const vault = addr(c.req.param('vault'), 'vault');
    if (!deps.activity) throw new ApiError(501, 'not_implemented', 'activity is not enabled on this server');
    if (!(await isKnownVault(vault))) throw new ApiError(404, 'not_found', 'not a Floor position');
    try {
      return c.json(ser({ vault, events: await deps.activity(vault) }));
    } catch (e) {
      console.error('[api] activity failed', e instanceof Error ? e.message : e);
      throw new ApiError(502, 'upstream_error', 'could not read chain logs right now');
    }
  });

  app.get('/v1/keeper/runs', async (c) => {
    const limit = limitSchema.safeParse(c.req.query('limit') ?? '20');
    if (!limit.success) throw new ApiError(400, 'bad_request', 'limit must be 1 to 100');
    const vaultQ = c.req.query('vault');
    const list = await runs.list({ limit: limit.data, vault: vaultQ ? addr(vaultQ, 'vault') : undefined });
    return c.json(ser({ runs: list, source: runs.source ?? 'memory' }));
  });

  app.get('/v1/keeper/runs/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^[\w.:-]{1,128}$/.test(id)) throw new ApiError(400, 'bad_request', 'bad run id');
    const r = await runs.get(id);
    if (!r) throw new ApiError(404, 'not_found', 'no such run');
    return c.json(ser(r));
  });

  app.post('/v1/tx/create-position', async (c) => {
    const b = await body(c, createPositionInputSchema);
    const owner = addr(b.owner, 'owner');
    const assets = b.assets.map((a) => addr(a, 'asset'));
    const amount = BigInt(b.amount);
    if (amount <= 0n || amount > MAX_AMOUNT) throw new ApiError(400, 'bad_request', 'amount out of range');
    // Product minimum (the contract's own hard floor is 1 USDT; the basket rule can require more).
    if (amount < MIN_POSITION_WEI) throw new ApiError(400, 'bad_request', 'minimum position is 5 USDT');
    const active = new Set((await readAssets()).filter((a) => a.active).map((a) => a.address.toLowerCase()));
    for (const a of assets) if (!active.has(a.toLowerCase())) throw new ApiError(400, 'bad_request', `asset ${a} is not enabled on the factory`);
    const maxDeposit = (await client.readContract({ address: deployment.factory, abi: floorFactoryAbi, functionName: 'maxDeposit' })) as bigint;
    if (maxDeposit > 0n && amount > maxDeposit) throw new ApiError(400, 'bad_request', `amount is over the launch cap of ${maxDeposit} wei`);
    const usdtAddr = await usdt();
    let txs: [UnsignedTx, UnsignedTx];
    try {
      txs = buildCreatePosition({ owner, factory: deployment.factory, amount, floorBps: b.floorBps, termSeconds: b.termSeconds, assets, weightsBps: b.weightsBps, chainId, usdt: usdtAddr });
    } catch (e) {
      throw new ApiError(400, 'bad_request', e instanceof Error ? e.message : 'invalid input');
    }
    guardTo(txs, await allowedTo());
    const [balance, allowance] = await Promise.all([
      client.readContract({ address: usdtAddr, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
      client.readContract({ address: usdtAddr, abi: erc20Abi, functionName: 'allowance', args: [owner, deployment.factory] }),
    ]);
    txs[0].simulation = await simulate(owner, txs[0]);
    // createPosition pulls USDT, so it can only be simulated once the approval is on chain. Otherwise null, not a guess.
    txs[1].simulation = allowance >= amount ? await simulate(owner, txs[1]) : null;
    return c.json(ser({ txs, checks: { usdtBalance: balance, allowance, sufficientBalance: balance >= amount, createSimulated: allowance >= amount }, disclosure: FLOOR_DISCLOSURE }));
  });

  app.post('/v1/tx/exit', async (c) => {
    const b = await body(c, exitBodySchema);
    const vault = addr(b.vault, 'vault');
    if (!(await isKnownVault(vault))) throw new ApiError(404, 'not_found', 'not a Floor position');
    const owner = (await client.readContract({ address: vault, abi: floorVaultAbi, functionName: 'owner' })) as Address;
    const to = b.to ? addr(b.to, 'to') : owner;
    const tx = b.mode === 'requestClose' ? buildRequestClose(vault, chainId) : b.mode === 'closeToUSDT' ? buildCloseToUSDT(vault, chainId) : buildExitInKind(vault, to, chainId);
    guardTo([tx], await allowedTo(vault));
    tx.simulation = await simulate(owner, tx);
    return c.json(ser({ mode: b.mode, owner, tx, note: 'Owner only. Sign with the owner wallet; the simulation ran as the owner.' }));
  });

  app.post('/v1/paid/quote', async (c) => {
    if (!deps.paidGate) throw new ApiError(501, 'not_implemented', 'paid endpoints are not enabled yet (x402 gate not installed)');
    const early = await deps.paidGate(c.req.raw.clone(), deps.paidQuotePriceUsd ?? DEFAULT_PAID_PRICE_USD);
    if (early) return early;
    const b = await body(c, paidQuoteSchema);
    const deposit = BigInt(b.deposit);
    if (deposit <= 0n || deposit > MAX_AMOUNT) throw new ApiError(400, 'bad_request', 'deposit out of range');
    try {
      const q = quoteProtection({ deposit, floorBps: b.floorBps, termSeconds: b.termSeconds, weightsBps: b.weightsBps, now: Math.floor(now() / 1000) });
      return c.json(ser({ quote: q, disclosure: FLOOR_DISCLOSURE }));
    } catch (e) {
      throw new ApiError(400, 'bad_request', e instanceof Error ? e.message : 'invalid input');
    }
  });

  return app;
}
