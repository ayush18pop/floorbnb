import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getAddress, type Address, type PublicClient } from 'viem';
import { erc20Abi } from 'viem';
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
import { InMemoryKeeperRunStore, type KeeperRunStore } from './keeperRuns';
import { ApiError, RateLimiter, TtlCache, ser } from './util';

/** Max uint of any token amount we accept: 10^30 wei (1e12 tokens at 18 decimals). */
const MAX_AMOUNT = 10n ** 30n;
const MAX_POSITIONS_PER_OWNER = 50;
const CACHE_MS = 10_000;
const MARKET_CACHE_MS = 15_000;

export interface AppDeps {
  chainId: number;
  deployment: Deployment;
  client: PublicClient;
  /** Absent when BW3 keys are not configured: /v1/market then answers 503, never made-up prices. */
  bw3?: { rwaPrice(addresses: string[]): Promise<Record<string, unknown>[]> };
  runs?: KeeperRunStore;
  /** Unix seconds of the keeper's last scan (read-only). Absent: only the run log is used. Newest of the two wins. */
  keeperHeartbeat?: () => Promise<number | null>;
  /**
   * The @floor/x402 gate, adapted by the server. Resolve null once payment is verified (the handler then runs),
   * or a Response (402 etc.) to return as is. Absent until A17 lands: /v1/paid/* answer 501.
   */
  paidGate?: (req: Request, priceUsd: string) => Promise<Response | null>;
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

export function createApp(deps: AppDeps): Hono {
  const { client, deployment, chainId } = deps;
  const now = deps.now ?? Date.now;
  const runs = deps.runs ?? new InMemoryKeeperRunStore();
  const cache = new TtlCache(now);
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
    const toks = Object.values(TOKENS);
    const rows = await cache.get('market', MARKET_CACHE_MS, () => deps.bw3!.rwaPrice(toks.map((t) => t.address)));
    const byAddr = new Map(rows.map((r) => [String(r.tokenContractAddress ?? '').toLowerCase(), r]));
    const t = Math.floor(now() / 1000);
    const str = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' ? String(v) : null);
    const items = toks.map((tok) => {
      const r = byAddr.get(tok.address.toLowerCase());
      const si = (r?.statusInfo ?? null) as Record<string, unknown> | null;
      return {
        symbol: tok.symbol,
        address: tok.address,
        price: str(r?.tokenPrice),
        referencePrice: str(r?.referencePrice),
        priceUpdatedAt: typeof r?.tokenPriceUpdatedAt === 'number' ? r.tokenPriceUpdatedAt : null,
        // bStocks return null marketStatus/nextOpenTime upstream (DX_LOG); we pass null through, never fill it in.
        marketStatus: str(si?.marketStatus),
        nextOpenTime: str(si?.nextOpenTime),
        reasonCode: str(si?.reasonCode),
        statusInfo: si,
      };
    });
    return c.json(ser({
      source: 'binance-web3-rwa-price',
      cachedForSeconds: MARKET_CACHE_MS / 1000,
      vaultWindow: { open: isMarketOpen(t), nextOpen: nextWindowOpen(t), note: 'Vault trading window (Mon-Fri 15:30-19:30 UTC, minus holidays), computed here, not from Binance' },
      assets: items,
    }));
  });

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

  app.get('/v1/keeper/runs', async (c) => {
    const limit = limitSchema.safeParse(c.req.query('limit') ?? '20');
    if (!limit.success) throw new ApiError(400, 'bad_request', 'limit must be 1 to 100');
    const vaultQ = c.req.query('vault');
    const list = await runs.list({ limit: limit.data, vault: vaultQ ? addr(vaultQ, 'vault') : undefined });
    return c.json(ser({ runs: list }));
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
    const early = await deps.paidGate(c.req.raw.clone(), '0.01');
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
